// Vercel serverless function entrypoint for PKE API (Express app export)
// Routes /api/v1/* to the Express app without app.listen in serverless runtime.
import type { IncomingMessage, ServerResponse } from "http";
import app, { ensureRuntimeReady } from "../src/index";

let ready: Promise<void> | null = null;
function ensureReady() {
  if (!ready) ready = ensureRuntimeReady().catch((err) => { ready = null; throw err; });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureReady();
  return (app as any)(req, res);
}
