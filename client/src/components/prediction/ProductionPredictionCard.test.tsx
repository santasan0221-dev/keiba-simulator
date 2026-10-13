import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import {ProductionPredictionCard} from "./ProductionPredictionCard";
import type {PredictionCard} from "@/lib/predictionCardContract";
vi.stubGlobal("React",React);
const card:PredictionCard={version:"prediction_card_v1",status:"OK",title:"KEIBA TRACE AI候補6頭",race:{race_key:"RACE",title:"東京",organization:"JRA"},marks:["◎","○","▲","☆","△","△"].map((symbol,i)=>({symbol,rank:i+1,horse_no:i+1,horse_name:`馬${i+1}`,short:null,medium:null,evidence:null,unknown:[]})),explanation:{available:false},pairwise:[],selectivity:null,disclaimer:"候補順位。公開本命とは別。",source_versions:{six_marks_version:"six_marks_v1",explanation_version:null,selectivity_version:null}};
it("defaults OFF and leaves zero DOM with an API card",()=>{expect(renderToStaticMarkup(<ProductionPredictionCard card={card} raceKey="RACE"/>)).toBe("");});
it("renders only the selected race under the explicit UI flag",()=>{
 expect(renderToStaticMarkup(<ProductionPredictionCard card={card} raceKey="RACE" enabled/>)).toContain("公開本命ではありません");
 expect(renderToStaticMarkup(<ProductionPredictionCard card={card} raceKey="OTHER" enabled/>)).toBe("");
 expect(renderToStaticMarkup(<ProductionPredictionCard raceKey="RACE" enabled/>)).toBe("");
});
