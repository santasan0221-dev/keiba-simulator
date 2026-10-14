import { beforeEach, expect, it, vi } from "vitest";
import { activateBeta, betaAllowed, betaExpiry, betaGeneration, betaToken, clearBeta, logoutBeta, restoreBeta } from "./betaAccess";
let stored: Record<string,string>={};
beforeEach(()=>{ stored={}; vi.stubGlobal("sessionStorage",{getItem:(k:string)=>stored[k]||null,setItem:(k:string,v:string)=>{stored[k]=v;},removeItem:(k:string)=>{delete stored[k];}});clearBeta();vi.stubGlobal("fetch",vi.fn()); });
const api="https://api.keibalab.net";
const session=()=>({access_token:Array.from(crypto.getRandomValues(new Uint8Array(43)),x=>String.fromCharCode(65+x%26)).join(""),expires_at:new Date(Date.now()+3600000).toISOString()});
it("only trusted API receives token, not arbitrary override or path",async()=>{
 for(const base of ["https://evil.example","https://api.keibalab.net.evil.example","http://api.keibalab.net","https://api.keibalab.net/path","https://u@api.keibalab.net"])expect(betaAllowed(base)).toBe(false);
 const value=session();vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(value),{status:200}));await activateBeta(api,"test-only-input");expect(betaToken(api)).toBe(value.access_token);expect(betaToken("https://evil.example")).toBeNull();expect(betaExpiry()).toBeGreaterThan(Date.now());
});
it("logout clears browser and calls server revoke",async()=>{
 const value=session();vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(value)));await activateBeta(api,"fixture");const epoch=betaGeneration();vi.mocked(fetch).mockResolvedValueOnce(new Response('{}'));await logoutBeta(api);expect(betaToken(api)).toBeNull();expect(stored).toEqual({});expect(betaGeneration()).toBeGreaterThan(epoch);expect(vi.mocked(fetch).mock.calls[1][0]).toContain('/logout');
});
it("rejects invalid code response and never grants from client paid flag",async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(new Response('{}',{status:401}));await expect(activateBeta(api,"invalid")).rejects.toThrow();expect(betaToken(api)).toBeNull();stored.paid='true';await restoreBeta(api);expect(betaToken(api)).toBeNull();
});
it("restored token must pass server session check",async()=>{
 stored.keiba_beta_session=JSON.stringify(session());vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({active:false}),{status:401}));await restoreBeta(api);expect(betaToken(api)).toBeNull();expect(stored).toEqual({});
});
it("expired session disappears without relying on cleanup job",async()=>{
 vi.useFakeTimers();try{const value=session();vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(value)));await activateBeta(api,"fixture");vi.advanceTimersByTime(3600001);expect(betaToken(api)).toBeNull();expect(stored).toEqual({});}finally{vi.useRealTimers();}
});
it("delayed grant cannot restore token after logout",async()=>{
 let resolve:(r:Response)=>void=()=>{};vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>resolve=r));const pending=activateBeta(api,"fixture");clearBeta();resolve(new Response(JSON.stringify(session())));await expect(pending).rejects.toThrow();expect(betaToken(api)).toBeNull();
});
it("Share View and capture paths receive no paid card DTO",async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync(new URL('../pages/SimulatorPage.tsx',import.meta.url),'utf8');
 expect(source).not.toContain('prediction_card');
 expect(source).not.toContain('PredictionCard');
 const renderer=fs.readFileSync(new URL('../components/prediction/PredictionCard.tsx',import.meta.url),'utf8');
 expect(renderer).not.toMatch(/html2canvas|toDataURL|ShareView|captureScreenshot/);
});
