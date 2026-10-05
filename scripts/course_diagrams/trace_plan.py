"""
Trace the turf/dirt ring of a JRA plan-view GIF into a closed centre-line.

Radial scan from the centre of the infield: for each angle, find where the ring's
colour band starts (next to the inner colour) and take its centre using the median
band width, so chutes (extra spurs) do not bend the line. Output is normalized
(x in 0.04..0.96, y in the same unit) and re-sampled by arc length, starting at the
goal marker and running the way the diagram's arrow points.

Needs: pillow, numpy.
"""
import json, math, sys
import numpy as np
from PIL import Image

TURF, DIRT, BLUE = (125, 200, 120), (230, 170, 100), (150, 185, 230)


def mask(im, rgb, tol=28):
    return (np.abs(im - np.array(rgb)).sum(axis=2) < tol)


def ring_centerline(path, band, inner, center, step_deg=0.5, gap=3):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = im.shape
    band_m, inner_m = mask(im, band), mask(im, inner)
    cx, cy = center
    samples = []
    for k in range(int(360 / step_deg)):
        a = math.radians(k * step_deg)
        dx, dy = math.cos(a), math.sin(a)
        r_in = None; last_inner = -99; width = 0; end = None
        r = 5
        while True:
            x, y = int(round(cx + dx * r)), int(round(cy + dy * r))
            if not (0 <= x < w and 0 <= y < h): break
            if inner_m[y, x]: last_inner = r
            if r_in is None and band_m[y, x] and r - last_inner <= gap + 2 and last_inner > 0:
                r_in = r
            if r_in is not None:
                if band_m[y, x]: end = r
                elif r - (end or r) > gap: break
            r += 0.5
        if r_in is not None and end is not None:
            samples.append((k * step_deg, r_in, end - r_in))
    widths = sorted(s[2] for s in samples)
    med = widths[len(widths) // 2]
    pts = []
    for a, r_in, wd in samples:
        r_c = r_in + med / 2  # fixed offset from the clean inner edge: labels printed on the band cannot move it
        pts.append((cx + math.cos(math.radians(a)) * r_c, cy + math.sin(math.radians(a)) * r_c))
    return pts, med


def ring_inward(path, band, outer_samples, center, step_deg=0.5, gap=3, reach=8):
    """Ring whose OUTER edge touches an already-traced outer ring (e.g. dirt inside turf).

    `outer_samples` are (angle, r_in, width) of the outer ring; scanning starts at its
    inner edge and walks inward to the band. Centre = outer edge - median width / 2.
    """
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = im.shape
    band_m = mask(im, band)
    cx, cy = center
    by_angle = {round(a / step_deg): r for a, r, _ in outer_samples}
    keys = sorted(by_angle)
    samples = []
    for k in range(int(360 / step_deg)):
        r0 = by_angle.get(k)
        if r0 is None:
            continue
        a = math.radians(k * step_deg)
        dx, dy = math.cos(a), math.sin(a)
        r, r_out, end = r0, None, None
        while r > 5:
            x, y = int(round(cx + dx * r)), int(round(cy + dy * r))
            if band_m[y, x]:
                if r_out is None: r_out = r
                end = r
            elif r_out is not None and (end - r) > gap:
                break
            r -= 0.5
            if r_out is None and r0 - r > reach: break
        if r_out is not None and end is not None:
            samples.append((k * step_deg, r_out, r_out - end))
    return samples


def resample_closed(pts, n):
    seg = [math.dist(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    total = sum(seg)
    out, acc, i = [], 0.0, 0
    for j in range(n):
        target = total * j / n
        while acc + seg[i] < target:
            acc += seg[i]; i += 1
        f = (target - acc) / (seg[i] or 1)
        a, b = pts[i], pts[(i + 1) % len(pts)]
        out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out, total


def orient_from_goal(pts, goal_xy, ccw_on_screen=True):
    gi = min(range(len(pts)), key=lambda i: math.dist(pts[i], goal_xy))
    pts = pts[gi:] + pts[:gi]
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    is_ccw = area < 0  # y-down screen
    if is_ccw != ccw_on_screen:
        pts = [pts[0]] + pts[:0:-1]
    return pts


def normalize(pts, ref_pts=None):
    ref = ref_pts or pts
    xs = [p[0] for p in ref]; ys = [p[1] for p in ref]
    scale = 0.92 / (max(xs) - min(xs))
    cy = (max(ys) + min(ys)) / 2
    return lambda p: (0.04 + (p[0] - min(xs)) * scale, 0.5 + (p[1] - cy) * scale), scale


if __name__ == "__main__":
    print("library module; see build_tokyo_atlas.py")
