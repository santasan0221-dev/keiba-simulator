"""Mutate only the current candidate; restore exact bytes after each isolated run."""
import json
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
WRAPPER=ROOT/'client/src/components/prediction/ProductionPredictionCard.tsx'
CARD=ROOT/'client/src/components/prediction/PredictionCard.tsx'
GUARD=ROOT/'client/src/lib/predictionCardUi.ts'
TEST='client/src/components/prediction/ProductionPredictionCard.test.tsx'
CHECK='if (!enabled || !validPredictionCard(card, raceKey)) return null;'
MUTATIONS={
 'flag_bypass':[(WRAPPER,'if (!enabled || !validPredictionCard','if (!validPredictionCard')],
 'publication_label':[(CARD,'候補{mark.rank}位','推奨本命{mark.rank}位')],
 'missing_placeholder':[(WRAPPER,CHECK,'if (enabled && !card) return <p>準備中</p>; '+CHECK)],
 'fake_convergence':[(CARD,'card.race.organization === "JRA" && card.selectivity &&','card.race.organization === "JRA" &&'),(CARD,'{card.selectivity.label}','{card.selectivity?.label ?? "HIGH"}')],
 'raw_score':[(CARD,'<footer>{card.disclaimer}','<footer><p>{(card as any).raw_score}</p>{card.disclaimer}')],
 'stale_race':[(GUARD,'value.race.race_key !== raceKey','false')],
 'page_crash':[(WRAPPER,CHECK,'if (!enabled) return null; if (!validPredictionCard(card, raceKey)) throw new Error("bad card");')],
 'extra_fetch':[(WRAPPER,CHECK,'void fetch("/api/prediction-card").catch(() => undefined); '+CHECK)],
}

def run():return subprocess.run([str(ROOT/'node_modules/.bin/vitest'),'run',TEST],cwd=ROOT,text=True,capture_output=True)

def main():
    baseline=run()
    if baseline.returncode:print(baseline.stdout+baseline.stderr);return 1
    originals={p:p.read_bytes() for changes in MUTATIONS.values() for p,_,_ in changes};results={}
    try:
        for name,changes in MUTATIONS.items():
            try:
                for p,old,new in changes:
                    source=p.read_text();assert old in source,(name,old);p.write_text(source.replace(old,new,1))
                outcome=run();combined=outcome.stdout+outcome.stderr
                killed=outcome.returncode==1 and 'failed' in combined and 'FAIL ' in combined and 'Failed Suites' not in combined
                results[name]={'killed':killed,'exit_code':outcome.returncode}
            finally:
                for p,b in originals.items():p.write_bytes(b)
    finally:
        for p,b in originals.items():p.write_bytes(b)
    print(json.dumps(results,indent=2));return 0 if all(x['killed'] for x in results.values()) else 1

if __name__=='__main__':raise SystemExit(main())
