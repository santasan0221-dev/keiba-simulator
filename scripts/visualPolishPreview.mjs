// Local-only visual fixtures. No production API or analytics requests are needed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(process.argv[2] || "dist/public");
const port = Number(process.argv[3] || 4475);
const reduced = process.argv[4] === "reduced";
const fixture = JSON.parse(fs.readFileSync("client/src/__fixtures__/lab-race-v2.json", "utf8"));
const courses = [["東京", "芝", 2000], ["京都", "ダート", 1800], ["中山", "芝", 2500], ["新潟", "芝", 1000], ["小倉", "芝", 1800]];
const races = courses.map(([venue, surface, distance], i) => ({ ...fixture.race, venue, surface, distance, race_no: i + 1, race_key: `JRA|2026-09-20|${venue}|${i + 1}` }));
http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method !== "GET") { res.writeHead(405).end(); return; }
  if (url.pathname.startsWith("/api/")) {
    let value = {};
    if (url.pathname.endsWith("available-dates")) value = { available_dates: ["2026-09-20"], latest_prediction_date: "2026-09-20" };
    else if (url.pathname.endsWith("races")) value = { date: "2026-09-20", races: url.searchParams.get("organization") === "NAR" ? [] : races };
    else if (url.pathname.includes("/race/")) {
      const race = races.find(r => r.race_key === decodeURIComponent(url.pathname.split("/race/")[1]));
      if (!race) { res.writeHead(404).end(); return; }
      value = { ...fixture, race, result: null };
    } else value = { results: [], rows: [], races: [] };
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(value)); return;
  }
  let file;
  try { file = path.resolve(root, "." + decodeURIComponent(url.pathname)); } catch { res.writeHead(400).end(); return; }
  if (!file.startsWith(root + path.sep)) file = path.join(root, "index.html");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, "index.html");
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Content-Security-Policy": "connect-src 'self'; font-src 'self' data:; img-src 'self' data:;" });
  if (reduced && path.extname(file) === ".css") {
    res.end(fs.readFileSync(file, "utf8").replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g, "@media all")); return;
  }
  if (reduced && path.extname(file) === ".html") {
    const preference = `<script>const nativeMatchMedia=window.matchMedia.bind(window);window.matchMedia=query=>{const result=nativeMatchMedia(query);if(query==='(prefers-reduced-motion: reduce)')Object.defineProperty(result,'matches',{value:true});return result;};</script>`;
    res.end(fs.readFileSync(file, "utf8").replace("<head>", "<head>" + preference)); return;
  }
  if (path.extname(file) === ".html" && url.searchParams.get("audit") === "1") {
    const probe = `<script>
      const samples = []; let last = 0;
      const output = document.createElement('output'); output.id = 'visual-frame-audit';
      output.textContent = 'Frame audit: waiting for playback'; document.body.append(output);
      function measure(now) {
        if (document.querySelector('.kt-play[aria-label="一時停止"]')) {
          if (last) samples.push(now - last); last = now;
        } else last = 0;
        if (samples.length && samples.length % 30 === 0) {
          const sorted = [...samples].sort((a,b) => a-b);
          output.textContent = JSON.stringify({samples:samples.length,p95:sorted[Math.floor(sorted.length*.95)],over50:samples.filter(x=>x>50).length});
        }
        if (samples.length < 600) requestAnimationFrame(measure);
      } requestAnimationFrame(measure);
    </script>`;
    res.end(fs.readFileSync(file, "utf8").replace("</body>", probe + "</body>")); return;
  }
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Visual fixtures: http://127.0.0.1:${port}/simulator`));
