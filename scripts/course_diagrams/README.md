# Course diagram extraction

`build_atlas_data.py` turns JRA's course-introduction diagrams into
`client/src/lib/courseDiagramData.ts` (derived numbers only).

- **Inputs** are the plan-view / section-view images from the JRA course pages, numbered in
  the order they were supplied: Tokyo `1.gif` dirt section, `2.gif` turf section, `3.gif` plan;
  Niigata `5.gif` dirt, `6.gif` inner turf, `7.gif` outer turf, `8.gif` straight 1000 m sections,
  `9.gif` plan (not traced); Kyoto `11.gif` dirt, `12.gif` outer turf, `13.gif` inner turf sections,
  `14.gif` plan; Sapporo `21.gif` dirt, `22.gif` turf sections, `23.gif` plan; Fukushima `25.gif` dirt, `26.gif` turf sections, `27.gif` plan; Chukyo `29.gif` dirt, `30.gif` turf sections, `31.gif` plan; Nakayama `16.gif` dirt, `17.gif` outer turf, `18.gif` inner turf sections, `19.gif`
  plan. (`4/10/15/20/24/28/32.jpg` are 3D views, unused.) The images are
  JRA's and are **not committed**. Source page: `https://www.jra.go.jp/facilities/race/<venue>/course/index.html`,
  copies supplied by the maintainer on 2026-10-04/05.
- **Everything emitted is `OFFICIAL_DIAGRAM_APPROXIMATION`**: about 5 m in the plan, about 0.1 m in the
  profiles. Checks that keep it honest (all in `courseAtlas.test.ts`): the section-view straight
  length matches the page's straight length within 2%; the traced ring turns in the corners and
  not on the straights; gate positions reproduce the race distance within 4%.
- Not traced yet: Niigata plan (loop starts), the Kyoto turf loops and Nakayama outer loop (only their
  section views are read). Hakodate, Hanshin and Kokura have no diagram data yet; their start positions are
  `UNKNOWN` or labelled derived.

```
pip install pillow numpy
python scripts/course_diagrams/build_atlas_data.py <image-dir> > client/src/lib/courseDiagramData.ts
```
