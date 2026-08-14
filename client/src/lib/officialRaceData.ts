export type OfficialRaceSurface = "芝" | "ダート";
export type OfficialRaceStyle = "逃げ" | "先行" | "差し" | "追込";

export type OfficialRaceHorse = {
  no: number;
  name: string;
  jockey: string;
  style: OfficialRaceStyle;
  referenceScore: number;
};

export type OfficialRaceCard = {
  id: string;
  label: string;
  venue: string;
  raceNumber: string;
  surface: OfficialRaceSurface;
  distance: number;
  weather: "晴";
  going: "良";
  pace: "平均" | "ハイ";
  courseNote: string;
  sourceUrl: string;
  horses: OfficialRaceHorse[];
};

const colors = ["#b9c3d4", "#e7b66a", "#db7e70", "#95c6b0", "#aa9ad6", "#d7a5ca", "#8ebc83", "#9bbbd2"];
const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const weekendOfficialRaces: OfficialRaceCard[] = [
  {
    id: "chukyo-kinen-2026",
    label: "第74回 中京記念",
    venue: "中京",
    raceNumber: "7R",
    surface: "芝",
    distance: 1600,
    weather: "晴",
    going: "良",
    pace: "平均",
    courseNote: "左回り・芝1,600m。長い直線と急坂を踏まえ、末脚と持久力を重視する標準条件です。",
    sourceUrl: "https://race.sp.netkeiba.com/race/shutuba.html?race_id=202607020807",
    horses: [
      ["ブエナオンダ", "菱田裕二", "差し", 69], ["ファントムシーフ", "幸英明", "先行", 74], ["ラヴァンダ", "岩田望来", "先行", 86], ["カズミクラーシュ", "M.デムーロ", "差し", 76],
      ["ミニトランザット", "松山弘平", "差し", 78], ["キープカルム", "柴田裕一郎", "差し", 75], ["カネラフィーナ", "石川裕紀人", "先行", 77], ["スイープアワーズ", "国分優作", "追込", 76],
      ["リリージョワ", "浜中俊", "先行", 88], ["ナムラコスモス", "田口貫太", "差し", 84], ["チェルビアット", "吉村誠之助", "差し", 78], ["サトノシャイニング", "J.コレット", "先行", 93],
      ["ケイズレーヴ", "渡辺竜也", "差し", 53], ["ミナデオロ", "西塚洸二", "先行", 71], ["ショウナンアデイブ", "田山旺佑", "先行", 62], ["カンシン", "団野大成", "差し", 64],
    ].map(([name, jockey, style, referenceScore], index) => ({ no: index + 1, name: String(name), jockey: String(jockey), style: style as OfficialRaceStyle, referenceScore: Number(referenceScore) })),
  },
  {
    id: "nst-sho-2026",
    label: "NST賞",
    venue: "新潟",
    raceNumber: "7R",
    surface: "ダート",
    distance: 1200,
    weather: "晴",
    going: "良",
    pace: "ハイ",
    courseNote: "左回り・ダート1,200m・芝スタート。先行力を重視しつつ、短距離の消耗を想定した条件です。",
    sourceUrl: "https://race.netkeiba.com/race/shutuba.html?race_id=202604020807",
    horses: [
      ["アッチャゴーラ", "小崎", "差し", 70], ["アドバンスファラオ", "原", "先行", 61], ["エコロガイア", "江田照", "先行", 66], ["エスカル", "丸山", "先行", 68],
      ["カンパニョーラ", "吉田豊", "追込", 48], ["グロリアラウス", "石橋脩", "差し", 80], ["コンクイスタ", "津村", "先行", 92], ["サフランヒーロー", "石神道", "逃げ", 46],
      ["ジョーローリット", "武藤", "先行", 78], ["スリーピース", "木幡巧", "差し", 58], ["ダノンタッチダウン", "三浦", "差し", 54], ["ファムエレガンテ", "菊沢", "先行", 87],
      ["ヤマニンアルリフラ", "戸崎圭", "先行", 86], ["ロードフロンティア", "川須", "先行", 72], ["ワイワイレジェンド", "田辺", "逃げ", 82],
    ].map(([name, jockey, style, referenceScore], index) => ({ no: index + 1, name: String(name), jockey: String(jockey), style: style as OfficialRaceStyle, referenceScore: Number(referenceScore) })),
  },
];

export function buildOfficialRaceHorses(card: OfficialRaceCard) {
  return card.horses.map((horse, index) => {
    const frontRunner = horse.style === "逃げ" || horse.style === "先行";
    const closer = horse.style === "差し" || horse.style === "追込";
    const score = horse.referenceScore;
    return {
      no: horse.no,
      name: horse.name,
      color: colors[index % colors.length],
      style: horse.style,
      speed: score,
      stamina: clamp(score + (card.surface === "芝" ? 4 : 1) + (closer ? 2 : 0)),
      start: clamp(score + (frontRunner ? 6 : -8) + (card.surface === "ダート" ? 3 : 0)),
      form: clamp(score - 3),
      popularity: 0,
      starts: 0,
      winsPast: 0,
      secondsPast: 0,
      thirdsPast: 0,
      avgFinish: 6,
      goingRates: {
        良: clamp(score - (card.surface === "ダート" ? 5 : 8)),
        稍重: clamp(score - 10),
        重: clamp(score - (card.surface === "ダート" ? 12 : 16)),
        不良: clamp(score - (card.surface === "ダート" ? 17 : 23)),
      },
      jockey: horse.jockey,
    };
  });
}

export function getOfficialRaceStorage(card: OfficialRaceCard) {
  return {
    "keiba-lab-horses": JSON.stringify(buildOfficialRaceHorses(card)),
    "keiba-lab-distance": JSON.stringify(card.distance),
    "keiba-lab-going": JSON.stringify(card.going),
    "keiba-lab-weather": JSON.stringify(card.weather),
    "keiba-lab-pace": JSON.stringify(card.pace),
    "keiba-lab-race-label": JSON.stringify(card.label),
    "keiba-lab-official-race-condition": JSON.stringify({
      id: card.id,
      label: card.label,
      venue: card.venue,
      raceNumber: card.raceNumber,
      surface: card.surface,
      distance: card.distance,
      weather: card.weather,
      going: card.going,
      pace: card.pace,
      courseNote: card.courseNote,
      savedAt: Date.now(),
    }),
  };
}
