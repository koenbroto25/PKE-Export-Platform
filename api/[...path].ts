// Vercel serverless function entrypoint for PKE API (Express app export).
// Readiness failures are reported as controlled 503 responses; they must not crash
// the Node.js function process. Liveness remains available without database secrets.
import type { IncomingMessage, ServerResponse } from "http";
import app, { ensureRuntimeReady, getRuntimeReadinessState } from "../src/index.js";
import { runtimeUnavailablePayload } from "../src/runtime-readiness.js";

type HandlerDependencies = {
  app: (req: IncomingMessage, res: ServerResponse) => unknown;
  ensureRuntimeReady: () => Promise<void>;
  getRuntimeReadinessState: () => {
    ready: boolean;
    failure: { code: string; missingEnvironmentVariables: string[] } | null;
  };
};

export function createServerlessHandler(dependencies: HandlerDependencies) {
  let ready: Promise<void> | null = null;

  function ensureReady() {
    if (!ready) {
      ready = dependencies.ensureRuntimeReady().catch((error) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  }

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const requestPath = (req.url || "").split("?")[0];
    if (requestPath === "/api/v1/health/live") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ status: "alive" }));
      return;
    }

    try {
      await ensureReady();
    } catch {
      const readiness = dependencies.getRuntimeReadinessState();
      const failure = readiness.failure ?? {
        code: "RUNTIME_READINESS_FAILED",
        missingEnvironmentVariables: [],
      };
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(runtimeUnavailablePayload(failure)));
      return;
    }

    return dependencies.app(req, res);
  };
}

const handler = createServerlessHandler({
  app: app as any,
  ensureRuntimeReady,
  getRuntimeReadinessState,
});

export default handler;
