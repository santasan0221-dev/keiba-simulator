"""
Build client/src/lib/courseDiagramData.ts from JRA diagram images.

Everything emitted is OFFICIAL_DIAGRAM_APPROXIMATION: coordinates / meters read off the
official plan-view and section-view images (not committed, they are JRA's). Approximate:
~2-3 px in the plan (about 5 m), ~0.1 m vertically in the profiles.

Needs: pillow, numpy.   Usage: python build_atlas_data.py <image-dir> > courseDiagramData.ts
Image numbering is the order the maintainer supplied them in (see README.md).
"""
import json, math, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import trace_plan as T
from extract_profiles import SPECS, extract, section_shares

IMG = sys.argv[1].rstrip("/") + "/"
N_PATH = 160


def load(name):
    return np.array(Image.open(IMG + name).convert("RGB")).astype(int)


def centroid(im, rgb):
    ys, xs = np.where(T.mask(im, rgb))
    return (xs.mean(), ys.mean())


def inner_edge_samples(im, c, band, inner, gap=5):
    """Per 0.5 degree: radius where `band` begins right after `inner` (the ring's inner edge)."""
    band_m, inner_m = T.mask(im, band), T.mask(im, inner)
    out = []
    for k in range(720):
        a = math.radians(k * 0.5); dx, dy = math.cos(a), math.sin(a)
        r, last_inner = 5.0, -99.0
        while True:
            x, y = int(round(c[0] + dx * r)), int(round(c[1] + dy * r))
            if not (0 <= x < im.shape[1] and 0 <= y < im.shape[0]): break
            if inner_m[y, x]: last_inner = r
            if band_m[y, x] and r - last_inner <= gap and last_inner > 0:
                out.append((k * 0.5, r - 1.0, 0)); break
            r += 0.5
    return out


def smooth_polar(c, pts, med_k=15):
    ang = np.array([math.degrees(math.atan2(y - c[1], x - c[0])) % 360 for x, y in pts])
    rad = np.array([math.hypot(x - c[0], y - c[1]) for x, y in pts])
    o = np.argsort(ang); ang, rad = ang[o], rad[o]
    grid = np.arange(720) * 0.5; r = np.interp(grid, ang, rad, period=360)
    def medfilt(a, k):
        m = len(a); h = k // 2
        return np.array([np.median(a[[(i + j) % m for j in range(-h, h + 1)]]) for i in range(m)])
    r = medfilt(r, med_k); r = np.convolve(np.r_[r[-4:], r, r[:4]], np.ones(9) / 9, mode="valid")
    return [(c[0] + r[i] * math.cos(math.radians(grid[i])), c[1] + r[i] * math.sin(math.radians(grid[i]))) for i in range(720)]


def trace(plan, c, band, inner, goal_xy, ccw, outer=None, reach=3):
    """Closed centre-line (360 px points) starting at the goal, running ccw / cw on screen."""
    if outer is None:
        pts, _ = T.ring_centerline(plan, band, inner, c, gap=reach)
    else:  # ring touching an outer ring: centre = outer edge - median width / 2
        sm = T.ring_inward(plan, band, outer, c, reach=max(8, reach))
        med = sorted(s[2] for s in sm)[len(sm) // 2]
        pts = [(c[0] + math.cos(math.radians(a)) * (ro - med / 2), c[1] + math.sin(math.radians(a)) * (ro - med / 2)) for a, ro, _ in sm]
    res, total = T.resample_closed(smooth_polar(c, pts), 360)
    return T.orient_from_goal(res, goal_xy, ccw_on_screen=ccw), total


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


def ring_entry(res, total, lap, gates, profile_name, seps):
    xs = [p[0] for p in res]; ys = [p[1] for p in res]
    scale = 0.92 / (max(xs) - min(xs)); cy = (max(ys) + min(ys)) / 2
    norm = lambda p: (round(0.04 + (p[0] - min(xs)) * scale, 4), round(0.5 + (p[1] - cy) * scale, 4))
    small, _ = T.resample_closed(res, N_PATH)  # even arc-length spacing, starts at the goal, closes on itself
    mpp = lap / total
    label, length, y0, ppm, rev = SPECS[profile_name]
    prof = extract(IMG + profile_name, length, y0, ppm, rev)
    starts = {}
    for dist, gate in gates.items():
        share, off = project(res, gate)
        partial = (1 - share) * lap
        full = max(0, round((dist - partial) / lap))
        starts[dist] = {"gate": norm(gate), "share": round(share, 4), "offRingMeters": round(off * mpp, 1),
                        "fullLaps": full, "ringMetersToGoal": round(partial + full * lap, 1)}
    return {"metersPerPx": round(mpp, 3), "path": [norm(p) for p in small],
            "sectionShares": section_shares(seps, prof["xStart"], prof["xGoal"], rev),
            "starts": starts, "profile": [{"at": p["at"], "meters": p["meters"]} for p in prof["profile"]]}


def section_view(name, seps):
    label, length, y0, ppm, rev = SPECS[name]
    p = extract(IMG + name, length, y0, ppm, rev)
    return {"sectionShares": section_shares(seps, p["xStart"], p["xGoal"], rev), "profile": [{"at": q["at"], "meters": q["meters"]} for q in p["profile"]]}


def profile_only(name):
    label, length, y0, ppm, rev = SPECS[name]
    p = extract(IMG + name, length, y0, ppm, rev)
    return {"profile": [{"at": q["at"], "meters": q["meters"]} for q in p["profile"]]}


# ------------------------------------------------------------------ Tokyo (3.gif plan, ccw / LEFT)
im = load("3.gif"); c = centroid(im, T.BLUE)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT)
res_t, tot_t = trace(IMG + "3.gif", c, T.TURF, T.DIRT, (398, 292), True)
res_d, tot_d = trace(IMG + "3.gif", c, T.DIRT, T.BLUE, (398, 262), True, outer=turf_edge)
TOKYO_GATES = {
    "turf": {1400: (310, 66), 1600: (434, 66), 1800: (528, 151), 2000: (540, 237),
             2300: (270, 283), 2400: (213, 283), 2500: (157.5, 283), 2600: (100, 283), 3400: (269, 66)},
    "dirt": {1200: (260, 75), 1300: (310.5, 75), 1400: (369, 75), 1600: (487, 82), 2100: (277, 255), 2400: (106, 255)},
}
tokyo = {
    "turf": ring_entry(res_t, tot_t, 2083.1, TOKYO_GATES["turf"], "2.gif", [69, 131, 192, 296, 359, 417]),
    "dirt": ring_entry(res_d, tot_d, 1899.0, TOKYO_GATES["dirt"], "1.gif", [65, 123, 182, 296, 357, 413]),
}

# ------------------------------------------------------------------ Kyoto (14.gif plan, cw / RIGHT) -- dirt ring
im = load("14.gif"); c = centroid(im, T.DIRT)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT)
res_kd, tot_kd = trace(IMG + "14.gif", c, T.DIRT, T.BLUE, (284, 193), False, outer=turf_edge)
KYOTO_DIRT_GATES = {1200: (218, 72), 1400: (117, 96), 1800: (382.5, 194), 1900: (432.5, 194)}
kyoto = {
    "dirt": ring_entry(res_kd, tot_kd, 1607.6, KYOTO_DIRT_GATES, "11.gif", [147, 218, 293, 416, 465, 513]),
    "turfOuter": {"profile": profile_only("12.gif")["profile"], "sectionShares": section_shares([142, 206, 270, 406, 458, 509], 38, 532, True)},
    "turfInner": {"profile": profile_only("13.gif")["profile"], "sectionShares": section_shares([128, 204, 282, 394, 452, 507], 38, 531, True)},
}

# ------------------------------------------------------------------ Nakayama (19.gif plan, cw / RIGHT)
im = load("19.gif"); c = centroid(im, T.DIRT)
res_ni, tot_ni = trace(IMG + "19.gif", c, T.TURF, T.DIRT, (235.5, 322), False)           # inner course ring
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT)
res_nd, tot_nd = trace(IMG + "19.gif", c, T.DIRT, T.BLUE, (235.5, 296), False, outer=turf_edge)
# Inner course: tick at the right end of each underlined label (arrows run left). 2500(内) is on the outer-course track.
NAKAYAMA_INNER_GATES = {1800: (317.5, 322), 2000: (433.75, 322), 3600: (383, 322), 2500: (427, 80)}
NAKAYAMA_DIRT_GATES = {1700: (361, 296), 1800: (424, 296), 2400: (273, 135), 2500: (214, 135)}
nakayama = {
    "turfInner": ring_entry(res_ni, tot_ni, 1667.1, NAKAYAMA_INNER_GATES, "18.gif", [130, 195, 272, 372, 439, 512]),
    "dirt": ring_entry(res_nd, tot_nd, 1493.0, NAKAYAMA_DIRT_GATES, "16.gif", [141, 205, 269, 383, 446, 510]),
    "turfOuter": {"profile": profile_only("17.gif")["profile"], "sectionShares": section_shares([121, 181, 287, 341, 449, 512], 41, 534, True)},
}

# ------------------------------------------------------------------ Sapporo (23.gif plan, cw / RIGHT)
im = load("23.gif"); c = centroid(im, T.DIRT)
res_st, tot_st = trace(IMG + "23.gif", c, T.TURF, T.DIRT, (201, 288), False)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT)
res_sd, tot_sd = trace(IMG + "23.gif", c, T.DIRT, T.BLUE, (201, 268), False, outer=turf_edge)
# Top moves right, bottom moves left (clockwise): the gate is the tick at the arrow's tail.
SAPPORO_TURF_GATES = {1000: (244, 27), 1200: (98, 27), 1500: (37, 266), 1800: (314, 290), 2000: (460, 290), 2600: (279.5, 27)}
SAPPORO_DIRT_GATES = {1000: (166, 47), 1700: (367, 262), 2400: (254.5, 47)}
sapporo = {
    "turf": ring_entry(res_st, tot_st, 1640.9, SAPPORO_TURF_GATES, "22.gif", [116, 196, 276, 363, 441, 514]),
    "dirt": ring_entry(res_sd, tot_sd, 1487.0, SAPPORO_DIRT_GATES, "21.gif", [124, 198, 271, 369, 444, 516]),
}

# ------------------------------------------------------------------ Fukushima (27.gif plan, cw / RIGHT)
im = load("27.gif"); c = centroid(im, T.DIRT)
# A wider white gap separates turf and dirt on the top straight here, so the edge search reaches further.
res_ft, tot_ft = trace(IMG + "27.gif", c, T.TURF, T.DIRT, (207, 278), False, reach=16)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT, gap=16)
res_fd, tot_fd = trace(IMG + "27.gif", c, T.DIRT, T.BLUE, (207, 256), False, outer=turf_edge, reach=18)
# Top moves right, bottom moves left (clockwise): the gate is the tick at the arrow's tail.
FUKUSHIMA_TURF_GATES = {1000: (192.5, 50), 1200: (40.5, 52), 2600: (192.5, 50), 1700: (285, 272), 1800: (362.7, 272), 2000: (516, 272)}
FUKUSHIMA_DIRT_GATES = {1000: (138.75, 72), 1150: (34.5, 72), 2400: (194.5, 72), 1700: (403.3, 255)}
fukushima = {
    "turf": ring_entry(res_ft, tot_ft, 1600.0, FUKUSHIMA_TURF_GATES, "26.gif", [129, 187, 278, 367, 431, 498]),
    "dirt": ring_entry(res_fd, tot_fd, 1444.6, FUKUSHIMA_DIRT_GATES, "25.gif", [136, 185, 260, 374, 435, 498]),
}

# ------------------------------------------------------------------ Chukyo (31.gif plan, ccw / LEFT)
im = load("31.gif"); c = centroid(im, T.DIRT)
res_ct, tot_ct = trace(IMG + "31.gif", c, T.TURF, T.DIRT, (381, 233), True, reach=8)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT, gap=8)
res_cd, tot_cd = trace(IMG + "31.gif", c, T.DIRT, T.BLUE, (381, 213), True, outer=turf_edge, reach=10)
# Top moves left, bottom moves right (counter-clockwise): the gate is the tick at the arrow's tail.
CHUKYO_TURF_GATES = {1200: (344, 45), 1300: (406, 48), 1400: (474, 53), 1600: (545, 188), 2000: (189, 233), 2200: (58.3, 232), 3000: (406, 48)}
CHUKYO_DIRT_GATES = {1200: (402, 66), 1400: (532, 78), 1800: (204.3, 213), 1900: (139.3, 213), 2500: (252.5, 52)}
chukyo = {
    "turf": ring_entry(res_ct, tot_ct, 1705.9, CHUKYO_TURF_GATES, "30.gif", [45, 102.3, 160, 274.7, 342.3, 410.3]),
    "dirt": ring_entry(res_cd, tot_cd, 1530.0, CHUKYO_DIRT_GATES, "29.gif", [49.3, 98.3, 149, 275.7, 336, 397.3]),
}

# ------------------------------------------------------------------ Hakodate (35.gif plan, cw / RIGHT)
im = load("35.gif"); c = centroid(im, T.DIRT)
res_ht, tot_ht = trace(IMG + "35.gif", c, T.TURF, T.DIRT, (228, 250), False, reach=8)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT, gap=8)
res_hd, tot_hd = trace(IMG + "35.gif", c, T.DIRT, T.BLUE, (228, 232), False, outer=turf_edge, reach=10)
# Top moves right, bottom moves left (clockwise): the gate is the tick at the arrow's tail.
HAKODATE_TURF_GATES = {1000: (198.75, 18), 1200: (29.5, 18), 1700: (271.7, 250), 1800: (355.7, 250), 2000: (522.7, 250), 2600: (246.75, 18)}
HAKODATE_DIRT_GATES = {1000: (126, 33), 1700: (415, 232), 2400: (196, 33)}
hakodate = {
    "turf": ring_entry(res_ht, tot_ht, 1626.6, HAKODATE_TURF_GATES, "34.gif", [118, 182, 252, 362, 429, 498]),
    "dirt": ring_entry(res_hd, tot_hd, 1475.8, HAKODATE_DIRT_GATES, "33.gif", [122, 184, 248, 370, 429, 492]),
}

# ------------------------------------------------------------------ Hanshin (40.gif plan, cw / RIGHT) -- inner turf ring and dirt ring
im = load("40.gif"); c = centroid(im, T.DIRT)
res_hti, tot_hti = trace(IMG + "40.gif", c, T.TURF, T.DIRT, (168, 288), False, reach=8)
turf_edge = inner_edge_samples(im, c, T.TURF, T.DIRT, gap=8)
res_hd2, tot_hd2 = trace(IMG + "40.gif", c, T.DIRT, T.BLUE, (168, 272), False, outer=turf_edge, reach=10)
# Top (back stretch) moves right, bottom moves left: the gate is the tick at the arrow's tail.
HANSHIN_INNER_GATES = {1200: (175.6, 108), 2000: (343.3, 287), 2200: (456.7, 287), 3000: (115, 128)}
HANSHIN_DIRT_GATES = {1200: (130, 142), 1400: (23.5, 178), 1800: (328, 268), 2000: (442, 266), 2600: (191, 116)}
hanshin = {
    "turfInner": ring_entry(res_hti, tot_hti, 1689.0, HANSHIN_INNER_GATES, "39.gif", [154.5, 229, 309, 401, 458.5, 499]),
    "dirt": ring_entry(res_hd2, tot_hd2, 1517.6, HANSHIN_DIRT_GATES, "37.gif", [163, 238, 313, 417, 462, 499]),
    "turfOuter": {"profile": profile_only("38.gif")["profile"], "sectionShares": section_shares([159, 228, 304, 418, 462, 499], 60, 507, True)},
}

# ------------------------------------------------------------------ Niigata: section views only
niigata = {
    "dirt": section_view("5.gif", [61.5, 114, 166, 301.5, 357.5, 411]),
    "inner": section_view("6.gif", [57, 119, 176, 303, 365, 423]),
    "outer": section_view("7.gif", [53, 98, 140, 299, 344, 386]),
    "straight": profile_only("8.gif"),
}


def emit(name, data, note, first=False):
    if not first:
        print()
    print(f"// Source: {note} (OFFICIAL_DIAGRAM_APPROXIMATION).")
    print(f"export const {name} = " + json.dumps(data, ensure_ascii=False, indent=1) + " as const;")


print("// GENERATED by scripts/course_diagrams/build_atlas_data.py -- do not edit by hand.")
emit("TOKYO_DIAGRAM", tokyo, "JRA 東京競馬場 コース紹介 plan view and section views", first=True)
emit("KYOTO_DIAGRAM", kyoto, "JRA 京都競馬場 コース紹介 plan view (dirt ring) and section views")
emit("NAKAYAMA_DIAGRAM", nakayama, "JRA 中山競馬場 コース紹介 plan view (inner turf ring, dirt ring) and section views")
emit("SAPPORO_DIAGRAM", sapporo, "JRA 札幌競馬場 コース紹介 plan view and section views")
emit("FUKUSHIMA_DIAGRAM", fukushima, "JRA 福島競馬場 コース紹介 plan view and section views")
emit("CHUKYO_DIAGRAM", chukyo, "JRA 中京競馬場 コース紹介 plan view and section views")
emit("HAKODATE_DIAGRAM", hakodate, "JRA 函館競馬場 コース紹介 plan view and section views")
emit("HANSHIN_DIAGRAM", hanshin, "JRA 阪神競馬場 コース紹介 plan view (inner turf ring, dirt ring) and section views")
emit("NIIGATA_DIAGRAM", niigata, "JRA 新潟競馬場 コース紹介 section views; corner sections are shares from the goal line")
