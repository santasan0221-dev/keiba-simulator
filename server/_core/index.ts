import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { isRegisteredRaceSyncTask, runSinglePickSync } from "../raceSync";
import { getJob, getResultHealth, isOpsConfigured, startResultJob } from "../resultOps";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/ops", (req, res, next) => {
    const allowedOrigin = process.env.KEIBA_LAB_ORIGIN;
    const requestOrigin = req.get("origin");
    if (requestOrigin && (!allowedOrigin || requestOrigin !== allowedOrigin)) return res.status(403).json({ error: "origin-not-allowed" });
    if (allowedOrigin && requestOrigin === allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    next();
  });
  app.post("/api/ops/results", async (req, res) => {
    let user;
    try { user = await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "authentication-required" }); }
    try {
      if (!user || user.role !== "admin") return res.status(403).json({ error: "admin-auth-required" });
      const job = await startResultJob(String(req.body?.race_date ?? ""), user.openId);
      return res.status(202).json({ status: "started", job_id: job.jobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "LOCAL_RESULT_OPS_NOT_CONFIGURED") return res.status(503).json({ error: "local-result-ops-not-configured" });
      if (message.startsWith("RESULT_JOB_ALREADY_RUNNING:")) return res.status(409).json({ error: "job-already-running", job_id: message.split(":")[1] });
      if (message.includes("race_date")) return res.status(400).json({ error: message });
      return res.status(500).json({ error: "result-job-start-failed" });
    }
  });
  app.get("/api/ops/jobs/:jobId", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "admin-auth-required" });
      const job = getJob(req.params.jobId);
      return job ? res.json(job) : res.status(404).json({ error: "job-not-found" });
    } catch {
      return res.status(403).json({ error: "admin-auth-required" });
    }
  });
  app.get("/api/ops/result-health", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "admin-auth-required" });
      return res.json(getResultHealth(String(req.query.race_date ?? "")));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(message.includes("race_date") ? 400 : 403).json({ error: message });
    }
  });
  app.get("/api/ops/capability", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "admin-auth-required" });
      return res.json({ configured: isOpsConfigured() });
    } catch {
      return res.status(403).json({ error: "admin-auth-required" });
    }
  });
  app.post("/api/scheduled/race-sync", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      if (!(await isRegisteredRaceSyncTask(user.taskUid))) return res.json({ ok: true, skipped: "orphaned-or-unregistered-task", taskUid: user.taskUid });
      const result = await runSinglePickSync();
      return res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
