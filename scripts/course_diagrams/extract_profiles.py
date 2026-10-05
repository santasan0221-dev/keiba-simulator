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

# name -> (label, lap/straight metres for the x axis, y of the 0 m line, px per metre)
# Calibrated against each image's own gridlines (+/-2 m, +/-4 m rows) and axis labels.
SPECS = {
    "2.gif": ("東京 芝 (左)", 2083.1, 59.0, 11.25),
    "1.gif": ("東京 ダート (左)", 1899.0, 60.0, 11.3),
    "5.gif": ("新潟 ダート (左)", 1472.5, 37.0, 11.0),
    "6.gif": ("新潟 芝 内回り (左)", 1623.0, 60.0, 11.0),
    "7.gif": ("新潟 芝 外回り (左)", 2223.0, 59.0, 11.0),
    "8.gif": ("新潟 芝 直線 1000m", 1000.0, 52.0, 20.5),
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


def extract(path, length_m, y0, ppm):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = im.shape
    fill = ((im.max(axis=2) - im.min(axis=2)) > 60) & (im.sum(axis=2) < 700)
    cols = np.where(fill.any(axis=0))[0]
    xs, xg = int(cols.min()), int(cols.max())
    pts = []
    for x in range(xs, xg + 1):
        rows = np.where(fill[:, x])[0]
        if len(rows):
            pts.append((x, (y0 - (rows.min() - BIAS_PX)) / ppm))
    simplified = douglas_peucker(pts, 0.1)
    span = xg - xs
    profile = [{"at": round((x - xs) / span, 4), "meters": round(m, 2)} for x, m in simplified]

    # corner boundaries: vertical ticks of the bracket row under the chart
    dark = im.sum(axis=2) < 520
    below = [y for y in range(int(np.where(fill.any(axis=1))[0].max()) + 12, h) if dark[y, xs - 10: xg + 10].sum() > span * 0.5]
    separators = []
    if below:
        yb = below[0]
        band = dark[yb - 5: yb + 6, :]
        cand = [x for x in range(xs - 8, xg + 8) if band[:, x].sum() >= 7]
        runs = []
        for x in cand:
            if runs and x - runs[-1][-1] <= 2:
                runs[-1].append(x)
            else:
                runs.append([x])
        separators = [round(sum(r) / len(r), 1) for r in runs]
    return {
        "xStart": xs, "xGoal": xg, "lengthMeters": length_m,
        "profile": profile,
        "separatorsX": separators,
        "separatorsRemainingMeters": [round((xg - x) / span * length_m, 1) for x in separators],
    }


if __name__ == "__main__":
    base = sys.argv[1].rstrip("/") + "/"
    out = {}
    for name, (label, length, y0, ppm) in SPECS.items():
        out[name] = {"label": label, **extract(base + name, length, y0, ppm)}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
