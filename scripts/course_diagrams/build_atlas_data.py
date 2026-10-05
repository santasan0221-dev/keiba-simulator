"""
Build client/src/lib/courseDiagramData.ts from JRA diagram images.

Everything emitted is OFFICIAL_DIAGRAM_APPROXIMATION: coordinates / meters read off
the official plan view and section-view images (not committed, they are JRA's).
Approximate: ~2-3 px in the plan (about 5 m), ~0.1 m vertically in the profiles.

Needs: pillow, numpy.   Usage: python build_atlas_data.py <image-dir> > courseDiagramData.ts
"""
import json, math, sys
import numpy as np
from PIL import Image
sys.path.insert(0, __import__("os").path.dirname(__file__))
import trace_plan as T
from extract_profiles import SPECS, extract

IMG = sys.argv[1].rstrip("/") + "/"
N_PATH = 160


def trace(path, band, inner, goal_xy, n=360, med_k=15, outer=None):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    ys, xs = np.where(T.mask(im, T.BLUE)); c = (xs.mean(), ys.mean())
    if outer is None:
        pts, med = T.ring_centerline(path, band, inner, c)
    else:  # ring touching an outer ring: centre = outer edge - median width / 2
        sm = T.ring_inward(path, band, outer, c)
        med = sorted(s[2] for s in sm)[len(sm) // 2]
        pts = [(c[0] + math.cos(math.radians(a)) * (ro - med / 2), c[1] + math.sin(math.radians(a)) * (ro - med / 2)) for a, ro, _ in sm]
    ang = np.array([math.degrees(math.atan2(y - c[1], x - c[0])) % 360 for x, y in pts])
    rad = np.array([math.hypot(x - c[0], y - c[1]) for x, y in pts])
    o = np.argsort(ang); ang, rad = ang[o], rad[o]
    grid = np.arange(720) * 0.5; r = np.interp(grid, ang, rad, period=360)
    def medfilt(a, k):
        m = len(a); h = k // 2
        return np.array([np.median(a[[(i + j) % m for j in range(-h, h + 1)]]) for i in range(m)])
    r = medfilt(r, med_k); r = np.convolve(np.r_[r[-4:], r, r[:4]], np.ones(9) / 9, mode="valid")
    poly = [(c[0] + r[i] * math.cos(math.radians(grid[i])), c[1] + r[i] * math.sin(math.radians(grid[i]))) for i in range(720)]
    res, total = T.resample_closed(poly, n)
    return T.orient_from_goal(res, goal_xy), total


def project(res, pt):
    """Nearest point on the closed polyline: (share from goal, distance px)."""
    best = (1e9, 0.0)
    seg = [math.dist(res[i], res[(i + 1) % len(res)]) for i in range(len(res))]
    total = sum(seg); acc = 0.0
    for i in range(len(res)):
        a, b = res[i], res[(i + 1) % len(res)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        f = max(0.0, min(1.0, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / ((dx * dx + dy * dy) or 1)))
        d = math.dist(pt, (a[0] + dx * f, a[1] + dy * f))
        if d < best[0]: best = (d, (acc + seg[i] * f) / total)
        acc += seg[i]
    return best[1], best[0]


# Start gates read off the plan view (original GIF pixels): the vertical tick at the
# end of each underlined distance label, the end the arrow points away from.
GATES = {
    "turf": {1400: (310, 66), 1600: (434, 66), 1800: (528, 151), 2000: (540, 237),
             2300: (270, 283), 2400: (213, 283), 2500: (157.5, 283), 2600: (100, 283), 3400: (269, 66)},
    "dirt": {1200: (260, 75), 1300: (310.5, 75), 1400: (369, 75), 1600: (487, 82), 2100: (277, 255), 2400: (106, 255)},
}
GOAL = {"turf": (398, 292), "dirt": (398, 262)}
LAP = {"turf": 2083.1, "dirt": 1899.0}
PROFILE = {"turf": "2.gif", "dirt": "1.gif"}
STRAIGHT = {"turf": 525.9, "dirt": 501.6}

plan = IMG + "3.gif"
out = {}
_im = np.array(Image.open(plan).convert("RGB")).astype(int)
_ys, _xs = np.where(T.mask(_im, T.BLUE)); _c = (_xs.mean(), _ys.mean())
_turf_samples, _ = T.ring_centerline(plan, T.TURF, T.DIRT, _c)  # only for the angle list
TURF_EDGE = None
for kind, band, inner in [("turf", T.TURF, T.DIRT), ("dirt", T.DIRT, T.BLUE)]:
    if kind == "turf":
        res, total = trace(plan, band, inner, GOAL[kind])
    else:
        # turf inner-edge samples (angle, r_in, width) from the raw scan
        samples = []
        im2 = _im; band_m, inner_m = T.mask(im2, T.TURF), T.mask(im2, T.DIRT)
        raw = []
        for k in range(720):
            a = math.radians(k * 0.5); dx, dy = math.cos(a), math.sin(a)
            r, last_inner, r_in = 5.0, -99, None
            while True:
                x, y = int(round(_c[0] + dx * r)), int(round(_c[1] + dy * r))
                if not (0 <= x < im2.shape[1] and 0 <= y < im2.shape[0]): break
                if inner_m[y, x]: last_inner = r
                if band_m[y, x] and r - last_inner <= 5 and last_inner > 0: r_in = r; break
                r += 0.5
            if r_in is not None: raw.append((k * 0.5, r_in - 1.0, 0))
        res, total = trace(plan, band, inner, GOAL[kind], outer=raw)
    xs = [p[0] for p in res]; ys = [p[1] for p in res]
    scale = 0.92 / (max(xs) - min(xs)); cy = (max(ys) + min(ys)) / 2
    norm = lambda p: (round(0.04 + (p[0] - min(xs)) * scale, 4), round(0.5 + (p[1] - cy) * scale, 4))
    small, _ = T.resample_closed(res, N_PATH)  # even arc-length spacing, starts at the goal, closes on itself
    path = [norm(p) for p in small]
    mpp = LAP[kind] / total
    prof = extract(IMG + PROFILE[kind], *SPECS[PROFILE[kind]][1:])
    # corner sections from the profile's bracket row (shares from the goal line)
    sep = [0.0] + [round((x - prof["xStart"]) / (prof["xGoal"] - prof["xStart"]), 4) for x in
                   {"turf": [69, 131, 192, 296, 359, 417], "dirt": [65, 123, 182, 296, 357, 413]}[kind]] + [1.0]
    starts = {}
    for dist, gate in GATES[kind].items():
        share, off = project(res, gate)
        partial = (1 - share) * LAP[kind]
        laps_full = max(0, round((dist - partial) / LAP[kind]))
        starts[dist] = {"gate": norm(gate), "share": round(share, 4), "offRingMeters": round(off * mpp, 1),
                        "fullLaps": laps_full,
                        "ringMetersToGoal": round(partial + laps_full * LAP[kind], 1)}
    out[kind] = {"metersPerPx": round(mpp, 3), "path": path, "sectionShares": sep, "starts": starts,
                 "profile": [{"at": p["at"], "meters": p["meters"]} for p in prof["profile"]]}

# --- Niigata: section views only (plan not traced: its inner/outer loops and chutes need separate work)
def section_view(name, seps):
    p = extract(IMG + name, *SPECS[name][1:])
    shares = [0.0] + [round((x - p["xStart"]) / (p["xGoal"] - p["xStart"]), 4) for x in seps] + [1.0]
    return {"sectionShares": shares, "profile": [{"at": q["at"], "meters": q["meters"]} for q in p["profile"]]}

niigata = {
    "dirt": section_view("5.gif", [61.5, 114, 166, 301.5, 357.5, 411]),
    "inner": section_view("6.gif", [57, 119, 176, 303, 365, 423]),
    "outer": section_view("7.gif", [53, 98, 140, 299, 344, 386]),
}
_straight = extract(IMG + "8.gif", *SPECS["8.gif"][1:])
niigata["straight"] = {"profile": [{"at": q["at"], "meters": q["meters"]} for q in _straight["profile"]]}

print("// GENERATED by scripts/course_diagrams/build_atlas_data.py -- do not edit by hand.")
print("// Source: JRA 東京競馬場 コース紹介 plan view and section views (OFFICIAL_DIAGRAM_APPROXIMATION).")
print("export const TOKYO_DIAGRAM = " + json.dumps(out, ensure_ascii=False, indent=1) + " as const;")
print()
print("// Source: JRA 新潟競馬場 コース紹介 section views (OFFICIAL_DIAGRAM_APPROXIMATION). Corner sections: shares from the goal line.")
print("export const NIIGATA_DIAGRAM = " + json.dumps(niigata, ensure_ascii=False, indent=1) + " as const;")
