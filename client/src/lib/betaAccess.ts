// UI state only. All card authorization is performed by the Python API.
const KEY = "keiba_beta_session";
const ALLOWED = new Set(["https://api.keibalab.net"]);
let token: string | null = null;
let expires = 0;
let generation = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const notify = () => { generation++; listeners.forEach(f => f()); };
export const betaGeneration = () => generation;
export const subscribeBeta = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export function betaAllowed(base: string) { try { const url = new URL(base); return ALLOWED.has(url.origin) && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash; } catch { return false; } }
export function clearBeta() {
  token = null; expires = 0; clearTimeout(timer);
  try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ }
  notify();
}
export function betaToken(base: string) {
  if (!betaAllowed(base)) return null;
  if (token && Date.now() >= expires) clearBeta();
  return token;
}
export const betaExpiry = () => expires;
function setBeta(value: { access_token: string; expires_at: string }) {
  const until = Date.parse(value.expires_at);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value.access_token) || !Number.isFinite(until) || until <= Date.now()) throw new Error("コードを確認してください");
  if (token === value.access_token && expires === until) return;
  token = value.access_token; expires = until;
  try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* memory only */ }
  clearTimeout(timer); timer = setTimeout(clearBeta, Math.min(until-Date.now(), 7*86400000)); notify();
}
export async function activateBeta(base: string, code: string) {
  if (!betaAllowed(base)) throw new Error("本番APIを選択してください");
  const before = generation;
  const response = await fetch(`${base}/api/beta/access`, { method:"POST", redirect:"error", cache:"no-store", headers:{"Content-Type":"application/json"}, body:JSON.stringify({code}) });
  if (!response.ok) throw new Error("コードを確認してください");
  const value = await response.json();
  if (before !== generation) throw new Error("アクセス状態が変わりました");
  setBeta(value);
}
export async function logoutBeta(base: string) {
  const current = betaToken(base); clearBeta();
  if (!current) return;
  const response = await fetch(`${base}/api/beta/logout`, { method:"POST", redirect:"error", cache:"no-store", headers:{Authorization:`Bearer ${current}`} });
  if (!response.ok) throw new Error("端末から解除済みです。サーバー解除は未確認です。");
}
export async function restoreBeta(base: string) {
  if (!betaAllowed(base)) { clearBeta(); return; }
  let before = generation;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!saved || !/^[A-Za-z0-9_-]{43}$/.test(saved.access_token) || Date.parse(saved.expires_at) <= Date.now()) { clearBeta(); return; }
    if (token) { token=null; expires=0; clearTimeout(timer); notify(); before=generation; }
    const response = await fetch(`${base}/api/beta/session`,{redirect:"error",cache:"no-store",headers:{Authorization:`Bearer ${saved.access_token}`}});
    const value = await response.json();
    if (before !== generation) return;
    if (!response.ok || !value.active || value.tier !== "BETA_ACCESS" || value.scope !== "JRA") { clearBeta(); return; }
    setBeta({...saved, expires_at:value.expires_at});
  } catch { if (before === generation) clearBeta(); }
}
