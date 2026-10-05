"""
Read JRA course-introduction elevation-profile diagrams (section-view GIFs) into numbers.

Inputs are the diagram images the maintainer received from the JRA course pages
(not committed: they are JRA's). Output is derived data only. Every value is an
APPROXIMATION read off the diagram's pixels (about +-0.1 m vertically, a few
metres horizontally), so downstream it is labelled OFFICIAL_DIAGRAM_APPROXIMATION.

Needs: pillow, numpy.   Usage: python extract_profiles.py <image-dir> > profiles.json
"""
import json
import sys
import numpy as np
from PIL import Image

# name -> (label, lap/straight metres for the x axis, y of the 0 m line, px per metre, reversed)
# Calibrated against each image's own gridlines (+/-2 m, +/-4 m, +6 m rows) and axis labels.
# reversed=True: the chart runs from the goal (left, 0 m) back to the lap start (right).
SPECS = {
    "2.gif": ("東京 芝 (左)", 2083.1, 59.0, 11.25, False),
    "1.gif": ("東京 ダート (左)", 1899.0, 60.0, 11.3, False),
    "5.gif": ("新潟 ダート (左)", 1472.5, 37.0, 11.0, False),
    "6.gif": ("新潟 芝 内回り (左)", 1623.0, 60.0, 11.0, False),
    "7.gif": ("新潟 芝 外回り (左)", 2223.0, 59.0, 11.0, False),
    "8.gif": ("新潟 芝 直線 1000m", 1000.0, 52.0, 20.5, False),
    "11.gif": ("京都 ダート (右)", 1607.6, 96.0, 13.5, True),
    "12.gif": ("京都 芝 外回り (右)", 1894.3, 97.0, 13.5, True),
    "13.gif": ("京都 芝 内回り (右)", 1782.8, 97.5, 13.5, True),
    "21.gif": ("札幌 ダート (右)", 1487.0, 54.0, 10.75, True),
    "22.gif": ("札幌 芝 (右)", 1640.9, 53.5, 10.75, True),
    "29.gif": ("中京 ダート (左)", 1530.0, 58.0, 19.0, False),
    "30.gif": ("中京 芝 (左)", 1705.9, 52.5, 17.25, False),
    "42.gif": ("小倉 ダート (右)", 1445.4, 80.0, 11.0, True),
    "43.gif": ("小倉 芝 (右)", 1615.1, 79.0, 10.8, True),
    "37.gif": ("阪神 ダート (右)", 1517.6, 50.5, 18.85, True),
    "38.gif": ("阪神 芝 外回り (右)", 2089.0, 50.5, 18.85, True),
    "39.gif": ("阪神 芝 内回り (右)", 1689.0, 50.5, 18.85, True),
    "33.gif": ("函館 ダート (右)", 1475.8, 56.0, 10.8, True),
    "34.gif": ("函館 芝 (右)", 1626.6, 57.0, 10.8, True),
    "25.gif": ("福島 ダート (右)", 1444.6, 56.5, 10.8, True),
    "26.gif": ("福島 芝 (右)", 1600.0, 56.0, 10.8, True),
    "16.gif": ("中山 ダート (右)", 1493.0, 68.0, 13.5, True),
    "17.gif": ("中山 芝 外回り (右)", 1839.7, 67.0, 13.5, True),
    "18.gif": ("中山 芝 内回り (右)", 1667.1, 67.0, 13.5, True),
}
BIAS_PX = 1.5  # the profile outline is ~1.5 px thick; the fill starts below it


def douglas_peucker(points, tol):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5 or 1.0
    dists = [abs(dy * (x - x1) - dx * (y - y1)) / norm for x, y in points[1:-1]]
    i = int(np.argmax(dists)) + 1
    if dists[i - 1] > tol:
        return douglas_peucker(points[: i + 1], tol)[:-1] + douglas_peucker(points[i:], tol)
    return [points[0], points[-1]]


def extract(path, length_m, y0, ppm, reverse=False):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = im.shape
    sat = im.max(axis=2) - im.min(axis=2)
    fill = (sat > 60) & (im.sum(axis=2) < 700)
    if fill.sum() < 8000:  # muted fill colours (tan / teal charts): loosen the saturation test
        fill = (sat > 40) & (im.sum(axis=2) < 700)
    # columns holding only a few filled pixels are chart-border / tick artifacts, not terrain
    cols = np.where(fill.sum(axis=0) >= 20)[0]
    xs, xg = int(cols.min()), int(cols.max())
    pts = []
    for x in range(xs, xg + 1):
        rows = np.where(fill[:, x])[0]
        if len(rows):
            pts.append((x, (y0 - (rows.min() - BIAS_PX)) / ppm))
    simplified = douglas_peucker(pts, 0.1)
    span = xg - xs
    if reverse:  # at = share from the goal in the running direction = 1 - remaining/lap
        profile = [{"at": round(1 - (x - xs) / span, 4), "meters": round(m, 2)} for x, m in reversed(simplified)]
    else:
        profile = [{"at": round((x - xs) / span, 4), "meters": round(m, 2)} for x, m in simplified]

    return {
        "xStart": xs, "xGoal": xg, "lengthMeters": length_m,
        "profile": profile,
    }


def section_shares(seps_x, x_start, x_goal, reverse=False):
    """Corner boundaries as shares from the goal line in the running direction: [0, ..., 1]."""
    span = x_goal - x_start
    vals = [1 - (x - x_start) / span if reverse else (x - x_start) / span for x in seps_x]
    return [0.0] + [round(v, 4) for v in sorted(vals)] + [1.0]


if __name__ == "__main__":
    base = sys.argv[1].rstrip("/") + "/"
    out = {}
    for name, (label, length, y0, ppm) in SPECS.items():
        out[name] = {"label": label, **extract(base + name, length, y0, ppm)}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
