// Shared horse/race domain types and pure functions.
//
// Extracted from client/src/pages/Home.tsx (mechanical move, no semantic
// changes) so that Product A (real prediction: RealRaceLoader, singlePickAi,
// simulationCalibration) and Product B (the /simulator what-if sandbox) can
// both depend on the same domain model without either one importing the
// other's page component.
import { calibratedAbilityValue, getSimulationCalibration } from "@/lib/simulationCalibration";

export type Style = "逃げ" | "先行" | "差し" | "追込";
export type Going = "良" | "稍重" | "重" | "不良";
export type SilkPattern = "無地" | "縦縞" | "横縞" | "星" | "ダイヤ";
export type InputSource = "v23k実値" | "as-of履歴実値" | "暫定値" | "未取得";
export type HorseDataSources = { speed: InputSource; stamina: InputSource; start: InputSource; form: InputSource; goingRates: Record<Going, InputSource>; record: InputSource; mappingStatus?: string };
export type Horse = { no: number; name: string; color: string; silkPattern?: SilkPattern; style: Style; speed: number; stamina: number; start: number; form: number; popularity: number; starts: number; winsPast: number; secondsPast: number; thirdsPast: number; avgFinish: number; goingRates: Record<Going, number>; dataSources?: HorseDataSources; historyAdjustment?: number; withdrawn?: boolean; jockey?: string; bodyWeight?: number; latestOdds?: number };
export type ResultHorse = Horse & { wins: number; places: number; winRate: number; placeRate: number; avgScore: number; uncertaintyLow?: number; uncertaintyHigh?: number };
export type Branch = { key: string; label: string; summary: string; styles: string; probability: number; factors: Record<Style, number> };
export type BackupSelectionPreset = { id: number; name: string; selections: Record<string, boolean>; updatedAt: number };

export const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export const numberValue = (value: string, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };

export const selectableHorseFields = ["name", "color", "style", "speed", "stamina", "start", "form", "popularity", "starts", "winsPast", "secondsPast", "thirdsPast", "avgFinish", "goingRates", "jockey", "bodyWeight", "latestOdds"] as const;
export const backupFieldGroups = [{ id: "basic", label: "基本情報", fields: ["name", "color", "style", "popularity", "jockey", "bodyWeight", "latestOdds"] }, { id: "ability", label: "能力値", fields: ["speed", "stamina", "start", "form"] }, { id: "history", label: "戦績", fields: ["starts", "winsPast", "secondsPast", "thirdsPast", "avgFinish"] }, { id: "going", label: "馬場適性", fields: ["goingRates"] }] as const;
export const detailedCsvColumnOptions = [{ key: "base", label: "シナリオ基本情報" }, { key: "branchProbability", label: "展開分岐の確率" }, { key: "name", label: "上位馬名" }, { key: "winRate", label: "勝率" }, { key: "uncertainty", label: "95%レンジ" }, { key: "historyAdjustment", label: "履歴補正値" }, { key: "manualAdjustment", label: "手動補正値" }] as const;
export type DetailedCsvColumn = (typeof detailedCsvColumnOptions)[number]["key"];
export const normalizeTemplateTags = (value: string) => Array.from(new Set(value.split(/[、,\s]+/).map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 8);
export const captureBackupSelections = (horseNos: number[], fields: Record<string, boolean>) => Object.fromEntries(horseNos.flatMap((no) => selectableHorseFields.map((field) => { const key = `horse:${no}:${field}`; return [key, fields[key] !== false]; })));
export const applyBackupSelections = (horseNos: number[], selections: Record<string, boolean>) => Object.fromEntries(horseNos.flatMap((no) => selectableHorseFields.map((field) => { const key = `horse:${no}:${field}`; return [key, selections[key] !== false]; })));
export const saveBackupSelectionPreset = (items: BackupSelectionPreset[], preset: BackupSelectionPreset) => [preset, ...items].slice(0, 12);
export const deleteBackupSelectionPreset = (items: BackupSelectionPreset[], id: number) => items.filter((item) => item.id !== id);

export const PAST_PERFORMANCE_HEADER = "name,starts,wins,seconds,thirds,avgFinish,goodRate,softRate,heavyRate,badRate";
export function parsePastPerformanceCsv(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean); if (lines.length < 2) throw new Error("過去成績CSVにはヘッダー行と1頭以上のデータが必要です。");
  const split = (line: string) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
  const headers = split(lines[0]).map((item) => item.toLowerCase()); const aliases: Record<string, string[]> = { name: ["name", "馬名", "horse"], starts: ["starts", "出走数", "出走回数"], wins: ["wins", "勝利数", "1着数"], seconds: ["seconds", "2着数"], thirds: ["thirds", "3着数"], avgFinish: ["avgfinish", "平均着順"], goodRate: ["goodrate", "良馬場率"], softRate: ["softrate", "稍重率"], heavyRate: ["heavyrate", "重馬場率"], badRate: ["badrate", "不良馬場率"] };
  const valueAt = (row: string[], key: string) => { const index = headers.findIndex((header) => aliases[key].includes(header)); return index >= 0 ? row[index] : ""; };
  return lines.slice(1).map((line, index) => { const row = split(line); const name = valueAt(row, "name"); if (!name) throw new Error(`${index + 2}行目: 馬名がありません。`); const starts = Math.max(0, numberValue(valueAt(row, "starts"), 0)); const wins = Math.min(starts, Math.max(0, numberValue(valueAt(row, "wins"), 0))); const seconds = Math.min(starts - wins, Math.max(0, numberValue(valueAt(row, "seconds"), 0))); const thirds = Math.min(starts - wins - seconds, Math.max(0, numberValue(valueAt(row, "thirds"), 0))); const rate = (key: "goodRate" | "softRate" | "heavyRate" | "badRate") => { const raw = valueAt(row, key); return raw === "" ? -1 : clamp(numberValue(raw, -1)); }; return { name, starts, wins, seconds, thirds, avgFinish: clamp(numberValue(valueAt(row, "avgFinish"), 6), 1, 18), rates: { 良: rate("goodRate"), 稍重: rate("softRate"), 重: rate("heavyRate"), 不良: rate("badRate") } }; });
}

export function getBranches(horses: Horse[], pace: string): Branch[] {
  const active = horses.filter((horse) => !horse.withdrawn); const total = Math.max(1, active.length); const frontShare = active.filter((horse) => horse.style === "逃げ" || horse.style === "先行").length / total; const backShare = active.filter((horse) => horse.style === "追込").length / total;
  const base = pace === "スロー" ? [52, 32, 16] : pace === "ハイ" ? [18, 48, 34] : [34, 43, 23];
  const values = [base[0] + frontShare * 14 - backShare * 7, base[1] + backShare * 8, base[2] + backShare * 15 - frontShare * 8]; const sum = values.reduce((a, b) => a + b, 0);
  const factors = [{ 逃げ: 1.035, 先行: 1.02, 差し: .985, 追込: .96 }, { 逃げ: .985, 先行: .995, 差し: 1.02, 追込: 1.01 }, { 逃げ: .96, 先行: .97, 差し: 1.015, 追込: 1.045 }];
  return [{ key: "front", label: "前残り", summary: "先行勢が隊列の利を活かす分岐", styles: "逃げ・先行", probability: values[0] / sum * 100, factors: factors[0] as Record<Style, number> }, { key: "middle", label: "差し浮上", summary: "中団から直線で順位を上げる分岐", styles: "差し", probability: values[1] / sum * 100, factors: factors[1] as Record<Style, number> }, { key: "back", label: "後方一気", summary: "持久力のある追込勢が届く分岐", styles: "追込・差し", probability: values[2] / sum * 100, factors: factors[2] as Record<Style, number> }];
}

// WHAT-IF calibration: provisional ability fields are shrunk toward the neutral
// baseline, while their missing evidence is represented by a wider simulation
// noise distribution. This keeps TRUTH PANEL calibration separate from the
// scenario model and avoids displaying deterministic-looking probabilities.
export function runSimulation(horses: Horse[], distance: number, going: Going, pace: string, runs: number, seed: number, branches: Branch[], manualAdjustments: Record<number, number> = {}) {
  const paceFactor: Record<string, Record<Style, number>> = { スロー: { 逃げ: 1.045, 先行: 1.025, 差し: .98, 追込: .95 }, 平均: { 逃げ: 1, 先行: 1, 差し: 1, 追込: 1 }, ハイ: { 逃げ: .94, 先行: .97, 差し: 1.025, 追込: 1.06 } };
  const distanceRatio = clamp((distance - 1600) / 1200, 0, 1); const hash = (value: number) => { const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }; const totals = horses.filter((horse) => !horse.withdrawn).map((horse) => ({ ...horse, wins: 0, places: 0, avgScore: 0, historyAdjustment: 0 }));
  for (let i = 0; i < runs; i++) { const branchRoll = hash(seed * 1000003 + i * 7919); let cumulative = 0; const branch = branches.find((candidate) => { cumulative += candidate.probability / 100; return branchRoll <= cumulative; }) || branches[0]; totals.map((horse) => { const calibratedSpeed = calibratedAbilityValue(horse, "speed"); const calibratedStamina = calibratedAbilityValue(horse, "stamina"); const calibratedStart = calibratedAbilityValue(horse, "start"); const calibratedForm = calibratedAbilityValue(horse, "form"); const distanceFit = calibratedSpeed * (1 - distanceRatio) + calibratedStamina * distanceRatio; const goingFit = .88 + horse.goingRates[going] / 100 * .12; const pastWinRate = horse.starts ? horse.winsPast / horse.starts * 100 : 0; const pastTop3Rate = horse.starts ? (horse.winsPast + horse.secondsPast + horse.thirdsPast) / horse.starts * 100 : 0; const confidence = Math.min(1, horse.starts / 20); const historyAdjustment = ((pastWinRate - 18) * .075 + (pastTop3Rate - 52) * .025 + (68 - horse.avgFinish) * .12) * confidence + (manualAdjustments[horse.no] ?? 0); const paceFit = paceFactor[pace][horse.style] * branch.factors[horse.style]; const noiseMagnitude = getSimulationCalibration(horse).noiseMagnitude; const noise = ((hash(seed * 37 + i * 97 + horse.no * 53) + hash(seed * 7919 + i * 17 + horse.no * 131)) - 1) * noiseMagnitude; const score = (calibratedSpeed * .28 + calibratedStamina * .23 + calibratedStart * .12 + calibratedForm * .22 + distanceFit * .08 + historyAdjustment) * paceFit * goingFit + noise; return { horse, score, historyAdjustment }; }).sort((a, b) => b.score - a.score).forEach((item, index) => { item.horse.avgScore += item.score; item.horse.historyAdjustment = item.historyAdjustment; if (index === 0) item.horse.wins++; if (index < 3) item.horse.places++; }); }
  return totals.map((horse) => { const winRate = horse.wins / runs * 100; const standardError = Math.sqrt(Math.max(.0001, (winRate / 100) * (1 - winRate / 100)) / runs) * 100; return { ...horse, winRate, placeRate: horse.places / runs * 100, avgScore: horse.avgScore / runs, uncertaintyLow: clamp(winRate - 1.96 * standardError), uncertaintyHigh: clamp(winRate + 1.96 * standardError), historyAdjustment: horse.historyAdjustment }; }).sort((a, b) => b.winRate - a.winRate) as ResultHorse[];
}
