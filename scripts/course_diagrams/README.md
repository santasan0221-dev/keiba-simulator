# Course diagram extraction

`build_atlas_data.py` turns JRA's course-introduction diagrams into
`client/src/lib/courseDiagramData.ts` (derived numbers only).

- **Inputs** are the plan-view / section-view images from the JRA course pages
  (Tokyo: `3.gif` plan, `2.gif` turf section, `1.gif` dirt section; Niigata: `5.gif` dirt,
  `6.gif` inner turf, `7.gif` outer turf, `8.gif` straight 1000 m sections). The images are
  JRA's and are **not committed**. Source page: `https://www.jra.go.jp/facilities/race/<venue>/course/index.html`,
  copies supplied by the maintainer on 2026-10-04/05.
- **Everything emitted is `OFFICIAL_DIAGRAM_APPROXIMATION`**: about 5 m in the plan, about 0.1 m in the
  profiles. Checks that keep it honest (all in `courseAtlas.test.ts`): the section-view straight
  length matches the page's straight length within 2%; the traced ring turns in the corners and
  not on the straights; gate positions reproduce the race distance within 4%.
- Venues whose images have not been supplied (Kyoto, Nakayama plan / section views, the other six
  venues) have no diagram data; their start positions are `UNKNOWN` or labelled derived.

```
pip install pillow numpy
python scripts/course_diagrams/build_atlas_data.py <image-dir> > client/src/lib/courseDiagramData.ts
```
