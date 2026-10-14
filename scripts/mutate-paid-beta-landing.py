"""Contract mutations, baseline required, exact source restoration."""
import json
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
command=[str(ROOT/'node_modules/.bin/vitest'),'run','client/src/lib/paidBetaLanding.test.tsx','--reporter=dot']
base=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
if base.returncode:raise SystemExit(base.stdout+base.stderr)
mutations=[
 ('paid_as_free','client/src/lib/paidBetaLanding.ts',"['通常レースのPrediction Card','対象外','全対象JRA']","['通常レースのPrediction Card','無料','全対象JRA']"),
 ('NAR_paid','client/src/lib/paidBetaLanding.ts',"['NAR有料カード','対象外','対象外']","['NAR有料カード','対象外','全対象NAR']"),
 ('eligibility_included','client/src/lib/paidBetaLanding.ts',"['Race Eligibility','対象外','対象外']","['Race Eligibility','対象外','全対象']"),
 ('market_included','client/src/lib/paidBetaLanding.ts',"['Market Consensus','対象外','対象外']","['Market Consensus','対象外','全対象']"),
 ('simulator_paid','client/src/lib/paidBetaLanding.ts',"['Simulator 2D / 3D・Share View','無料','無料']","['Simulator 2D / 3D・Share View','対象外','有料']"),
 ('missing_note_CTA','client/src/lib/paidBetaLanding.ts',"?config.noteUrl:null","?'https://note.com/unconfigured-fixture':null"),
 ('fake_testimonial','client/src/pages/PaidBetaLanding.tsx','<main id="beta-main">','<main id="beta-main"><p>利用者の声：毎週満足しています</p>'),
 ('prohibited_copy','client/src/lib/paidBetaLanding.ts','全対象JRAのAI候補6頭と、その理由を比較する分析β','必勝の分析β'),
 ('off_nav','client/src/components/PaidBetaLandingLink.tsx',' if(!enabled)return null;',' if(false)return null;'),
 ('broken_sample_route','client/src/pages/PaidBetaLanding.tsx','href="#sample"','href="/nonexistent-sample"'),
]
results=[]
for name,file,old,new in mutations:
 path=ROOT/file;original=path.read_bytes();source=original.decode()
 if old not in source:raise RuntimeError(name+' target missing')
 try:
  path.write_text(source.replace(old,new,1));run=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
  killed=run.returncode==1 and ' failed' in run.stdout and 'Error: Transform failed' not in run.stderr
  results.append({'name':name,'killed':killed,'exit_code':run.returncode})
 finally:path.write_bytes(original)
print(json.dumps({'baseline':'PASS','detected':sum(x['killed'] for x in results),'total':len(results),'mutations':results},indent=2))
if not all(x['killed'] for x in results):raise SystemExit(1)
