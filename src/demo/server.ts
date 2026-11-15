import express from "express";
import { assertManualTrialModeSafe } from "./mode.ts";
import { registerDemoApiRoutes } from "./routes.ts";

export function createDemoApp() {
  const cfg = assertManualTrialModeSafe(process.env);
  if (!cfg.enabled) throw new Error("Manual trial mode is not enabled");

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = new Set(["http://localhost:3001", "http://127.0.0.1:3001"]);
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  app.get("/", (_req, res) => res.json({ ok: true, demo: true, mode: "manual-trial" }));

  registerDemoApiRoutes(app);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err?.status || 500).json({ status: "error", message: err?.message || "Demo server error", demo: true });
  });

  return app;
}

export async function startDemoServer() {
  const cfg = assertManualTrialModeSafe(process.env);
  const app = createDemoApp();
  const port = cfg.port || 3000;
  const host = "127.0.0.1";
  app.listen(port, host, () => {
    console.log(`[PKE][DEMO] Manual Trial Mode API listening on http://${host}:${port}`);
    console.log(`[PKE][DEMO] No Neon/PostgreSQL/Auth/storage/external providers are initialized.`);
  });
}
