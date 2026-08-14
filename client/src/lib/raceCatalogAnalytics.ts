export const COURSE_STYLES = ["逃げ", "先行", "差し", "追込"] as const;
export type CourseStyle = (typeof COURSE_STYLES)[number];

export type ImportedOdds = { horseName: string; odds: number; popularity?: number };
export type OddsImportResult = { rows: ImportedOdds[]; errors: string[] };
export type PreviousRun = { horseName: string; raceName: string; date: string; venue: string; surface: string; distance?: number; going: string; finish: number; fieldSize?: number; style: string; margin?: number; daysAgo?: number };
export type CourseTrendRecord = { venue: string; surface: string; distance: number; pace: string; style: CourseStyle; finish: number };
export type StyleTrend = { style: CourseStyle; samples: number; wins: number; top3: number; winRate: number; top3Rate: number };
export type CourseTrend = { key: string; label: string; samples: number; paceCounts: Record<string, number>; byStyle: StyleTrend[] };

type CsvRecord = Record<string, string>;

function parseCsvLine(line: string) {
  const values: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(text: string): CsvRecord[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/\s/g, "").toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line); const record: CsvRecord = {};
    headers.forEach((header, index) => { record[header] = values[index] ?? ""; });
    return record;
  });
}

function pick(record: CsvRecord, aliases: string[]) {
  return aliases.map((alias) => record[alias.replace(/\s/g, "").toLowerCase()]).find((value) => value !== undefined) ?? "";
}

function numberOrUndefined(value: string) {
  const number = Number(value); return Number.isFinite(number) ? number : undefined;
}

export function parseOddsCsv(text: string, allowedHorseNames: string[]): OddsImportResult {
  const names = new Set(allowedHorseNames); const rows: ImportedOdds[] = []; const errors: string[] = [];
  parseCsv(text).forEach((record, index) => {
    const horseName = pick(record, ["horse_name", "馬名", "馬名name"]); const odds = numberOrUndefined(pick(record, ["odds", "単勝オッズ", "単勝", "オッズ"])); const popularity = numberOrUndefined(pick(record, ["popularity", "人気"]));
    if (!horseName || !names.has(horseName)) { errors.push(`${index + 2}行目: カタログの出走馬と一致する馬名を入力してください。`); return; }
    if (!odds || odds <= 0) { errors.push(`${index + 2}行目: 単勝オッズは0より大きい数値で入力してください。`); return; }
    rows.push({ horseName, odds, popularity });
  });
  return { rows: rows.sort((a, b) => (a.popularity ?? 999) - (b.popularity ?? 999) || a.odds - b.odds), errors };
}

export function parsePreviousRunsCsv(text: string): { rows: PreviousRun[]; errors: string[] } {
  const rows: PreviousRun[] = []; const errors: string[] = [];
  parseCsv(text).forEach((record, index) => {
    const horseName = pick(record, ["horse_name", "馬名"]); const finish = numberOrUndefined(pick(record, ["finish", "着順"]));
    if (!horseName || !finish || finish < 1) { errors.push(`${index + 2}行目: 馬名と1以上の着順は必須です。`); return; }
    rows.push({ horseName, finish, raceName: pick(record, ["race_name", "前走レース", "レース名"]), date: pick(record, ["date", "日付"]), venue: pick(record, ["venue", "競馬場"]), surface: pick(record, ["surface", "コース種別"]), distance: numberOrUndefined(pick(record, ["distance", "距離"])), going: pick(record, ["going", "馬場"]), fieldSize: numberOrUndefined(pick(record, ["field_size", "頭数"])), style: pick(record, ["style", "脚質"]), margin: numberOrUndefined(pick(record, ["margin", "着差"])), daysAgo: numberOrUndefined(pick(record, ["days_ago", "間隔日数"])) });
  });
  return { rows, errors };
}

export function parseCourseTrendCsv(text: string): { rows: CourseTrendRecord[]; errors: string[] } {
  const rows: CourseTrendRecord[] = []; const errors: string[] = [];
  parseCsv(text).forEach((record, index) => {
    const venue = pick(record, ["venue", "競馬場"]); const surface = pick(record, ["surface", "コース種別"]); const distance = numberOrUndefined(pick(record, ["distance", "距離"])); const style = pick(record, ["style", "脚質"]) as CourseStyle; const finish = numberOrUndefined(pick(record, ["finish", "着順"])); const pace = pick(record, ["pace", "ペース"]) || "不明";
    if (!venue || !surface || !distance || !COURSE_STYLES.includes(style) || !finish || finish < 1) { errors.push(`${index + 2}行目: 競馬場・コース種別・距離・脚質・着順を確認してください。`); return; }
    rows.push({ venue, surface, distance, pace, style, finish });
  });
  return { rows, errors };
}

export function aggregateCourseTrends(records: CourseTrendRecord[]): CourseTrend[] {
  const groups = new Map<string, CourseTrendRecord[]>();
  records.forEach((record) => { const key = `${record.venue}|${record.surface}|${record.distance}`; groups.set(key, [...(groups.get(key) ?? []), record]); });
  return Array.from(groups.entries()).map(([key, rows]: [string, CourseTrendRecord[]]) => ({
    key,
    label: `${rows[0].venue}・${rows[0].surface}${rows[0].distance.toLocaleString()}m`,
    samples: rows.length,
    paceCounts: rows.reduce((counts: Record<string, number>, row: CourseTrendRecord) => ({ ...counts, [row.pace]: (counts[row.pace] ?? 0) + 1 }), {} as Record<string, number>),
    byStyle: COURSE_STYLES.map((style) => {
      const styleRows = rows.filter((row: CourseTrendRecord) => row.style === style); const wins = styleRows.filter((row: CourseTrendRecord) => row.finish === 1).length; const top3 = styleRows.filter((row: CourseTrendRecord) => row.finish <= 3).length;
      return { style, samples: styleRows.length, wins, top3, winRate: styleRows.length ? wins / styleRows.length * 100 : 0, top3Rate: styleRows.length ? top3 / styleRows.length * 100 : 0 };
    }),
  })).sort((a, b) => b.samples - a.samples || a.label.localeCompare(b.label, "ja"));
}

export function downloadTextFile(filename: string, content: string) {
  const anchor = document.createElement("a"); const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
