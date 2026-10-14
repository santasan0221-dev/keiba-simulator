import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import fs from "node:fs";
import { ProductionPredictionCard } from "./ProductionPredictionCard";
import { predictionCardUiEnabled, validPredictionCard } from "@/lib/predictionCardUi";
import type { PredictionCard } from "@/lib/predictionCardContract";
vi.stubGlobal("React", React);
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true}));
export const card: PredictionCard = { version:"prediction_card_v1", status:"OK", title:"KEIBA TRACE AI候補6頭", race:{race_key:"RACE", title:"東京", organization:"JRA"}, marks:["◎","○","▲","☆","△","△"].map((symbol,i)=>({symbol,rank:i+1,horse_no:i+1,horse_name:`馬${i+1}`,short:null,medium:null,evidence:null,unknown:[]})), explanation:{available:false}, pairwise:[], selectivity:null, disclaimer:"上位候補。公開本命とは別。", source_versions:{six_marks_version:"six_marks_v1",explanation_version:null,selectivity_version:null} };
const render = (value: unknown = card, key="RACE", enabled=true) => renderToStaticMarkup(<ProductionPredictionCard card={value} raceKey={key} enabled={enabled}/>);
it("default OFF, strict 1, no DOM or missing-field placeholder",()=>{
 expect(renderToStaticMarkup(<ProductionPredictionCard card={card} raceKey="RACE"/>)).toBe("");
 for(const value of [undefined,null,true,1,"true","01"," 1","0"]) expect(predictionCardUiEnabled(value)).toBe(false);
 expect(predictionCardUiEnabled("1")).toBe(true);expect(render(card,"RACE",false)).toBe("");
 expect(render(null)).toBe("");expect(render(undefined)).toContain("AI候補");
 expect(renderToStaticMarkup(<ProductionPredictionCard raceKey="RACE" enabled/>)).toBe("");
});
it("separates publication and source rank1, keeps list and disclaimer",()=>{
 const html=render();expect(html).toContain("公開本命ではありません");expect(html).toContain("購入を推奨するものではなく");
 expect(html).toContain("候補1位");expect(html).toContain("<article");expect(html).toContain("<ol");
 expect(html).not.toContain("推奨本命");expect(html).not.toContain("買い目");expect(html.match(/<li/g)).toHaveLength(6);
});
it("JRA full and partial, NAR no convergence, three marks",()=>{
 const full={...card,selectivity:{grade:"A",label:"HIGH"}};expect(render(full)).toContain("候補収束度");
 expect(render(card)).not.toContain("候補収束度");
 expect(render({...full,race:{...card.race,organization:"NAR"}})).not.toContain("候補収束度");
 const three={...card,marks:card.marks.slice(0,3)};expect(render(three)).toContain("AI評価上位候補");expect(render(three).match(/<li/g)).toHaveLength(3);
});
it("missing/invalid shape never crashes existing page",()=>{
 for(const value of [{}, {...card,marks:null},{...card,pairwise:null},{...card,explanation:null}, {...card,marks:[{...card.marks[0],short:{bad:true}}]}, {...card,source_versions:null}, {...card,race:null}])expect(render(value)).toBe("");
 expect(render(card,"OTHER")).toBe("");expect(validPredictionCard({...card,status:"UNAVAILABLE"},"RACE")).toBe(false);
});
it("only given reasons; no raw fields or fake convergence",()=>{
 const value={...card,raw_score:99999,contribution:"RAW_LEAK",weights:"RAW_LEAK",candidate_width:"RAW_LEAK"};
 expect(render(value)).not.toContain("RAW_LEAK");expect(render(value)).not.toContain("99999");
 expect(render(value)).not.toContain("候補収束度");
});
it("wiring has no requests, placeholder, stale context or page-wide error coupling",()=>{
 const wrapper=fs.readFileSync(new URL("./ProductionPredictionCard.tsx",import.meta.url),"utf8");
 expect(fetch).not.toHaveBeenCalled();expect(wrapper).not.toMatch(/\bfetch\s*\(/);expect(wrapper).toContain("getDerivedStateFromError");expect(wrapper).toContain("CardBoundary key=");
 const guard=fs.readFileSync(new URL("../../lib/predictionCardUi.ts",import.meta.url),"utf8");expect(guard).toContain("value.race.race_key !== raceKey");
 const page=fs.readFileSync(new URL("../../pages/RacePage.tsx",import.meta.url),"utf8");expect(page).toContain("card={race.prediction_card} raceKey={raceKey}");
});

it("omitted optional annotation fields keep marks without placeholders",()=>{
 const partial={...card,explanation:undefined,pairwise:undefined,selectivity:undefined,marks:card.marks.map(m=>({...m,short:undefined,medium:undefined,evidence:undefined,unknown:undefined}))};
 const html=render(partial);expect(html.match(/<li/g)).toHaveLength(6);expect(html).not.toContain("候補収束度");expect(html).not.toContain("説明の詳細");
});
it("records fixture React SSR render cost",()=>{
 const native=JSON.parse(fs.readFileSync(new URL("../../../../scratchpad/ui/prediction_card_public_ui_prep_evidence/api-fixtures.json",import.meta.url),"utf8"));
 const value=Object.values(native)[0] as {on:{prediction_card:PredictionCard}};
 const input=value.on.prediction_card;
 const samples:Record<string,number>={};
 for(const enabled of [false,true]){const start=performance.now();for(let i=0;i<100;i++)render(input,input.race.race_key,enabled);samples[enabled?"onFullMsPerRender":"offMsPerRender"]=(performance.now()-start)/100;}
 expect(samples.onFullMsPerRender).toBeGreaterThan(0);
 fs.writeFileSync(new URL("../../../../scratchpad/ui/prediction_card_public_ui_prep_evidence/react-render.json",import.meta.url),JSON.stringify({kind:"SYNTHETIC_REACT_SSR_NOT_CLIENT_PROFILER",iterations:100,...samples},null,2));
});
