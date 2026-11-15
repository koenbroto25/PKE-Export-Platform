// REVISION 4 — Single Neon project/branch integration runner (2026-11-14, owner-mandated)
// Uses ONLY DATABASE_URL targeting purple-base-63944903 / br-damp-shape-b3xlh4nr (production).
// FORBIDDEN: NEON_TEST_DATABASE_URL, branch-selection env, local/Docker DB, legacy project fallback.
// Import-safe: direct-run only. All DB integration must use tx/rollback + unique QA namespace + cleanup verification.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  validateSingleBranchDatabaseUrl,
  verifyDatabaseIdentityAndPrivileges,
  EXPECTED_PROJECT_ID,
  EXPECTED_BRANCH_ID,
  EXPECTED_BRANCH_NAME,
  EXPECTED_HOST,
  EXPECTED_DATABASE,
  EXPECTED_RUNTIME_USER,
  DATABASE_URL_ENV,
} from "./preflight.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const FORBIDDEN_ENV_VARS = [
  "NEON_TEST_DATABASE_URL",
  "NEON_TEST_PROJECT_ID",
  "NEON_TEST_BRANCH_ID",
  "PKE_TEST_TARGET",
  "LOCAL_TEST_DATABASE_URL",
  "LOCAL_TEST_MAINTENANCE_DATABASE_URL",
];

function redactUrl(value) {
  return String(value).replace(/(postgres(?:ql)?:\/\/[^:/?#\s]+:)[^@/?#\s]+@/gi, "$1<redacted>@");
}

// Load .env.test.local only for QA/test config (never as fallback target selection). Existing env wins.
function loadTestEnv() {
  const envPath = path.join(ROOT, ".env.test.local");
  let content;
  try { content = readFileSync(envPath, "utf8"); } catch { return; } // optional for preflight-only contexts
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export { validateSingleBranchDatabaseUrl };

export function assertNoForbiddenTestEnv(env = process.env) {
  const problems = [];
  for (const key of FORBIDDEN_ENV_VARS) {
    if (env[key] !== undefined && String(env[key]).trim() !== "") {
      problems.push(`${key} is FORBIDDEN (Revision 4: no alternate/test/branch-selection/local-db URLs).`);
    }
  }
  if (problems.length) throw new Error(problems.join(" "));
  return true;
}

async function runSingleBranchPreflight(dbUrl, env) {
  console.log("[run-integration] Running single-branch preflight (Revision 4)... ");
  assertNoForbiddenTestEnv(env);
  const v = validateSingleBranchDatabaseUrl(dbUrl, env);
  if (!v.ok) {
    const detail = v.problems.map((p) => `[${p.code}] ${p.message}`).join("; ");
    throw new Error(`Single-branch preflight failed: ${detail}`);
  }
  console.log(`[run-integration] Target validation: PASS (project ${EXPECTED_PROJECT_ID}, branch ${EXPECTED_BRANCH_ID} ${EXPECTED_BRANCH_NAME}, host ${EXPECTED_HOST}, db ${EXPECTED_DATABASE}, role ${EXPECTED_RUNTIME_USER})`);
  const db = await verifyDatabaseIdentityAndPrivileges(dbUrl, 15000);
  if (!db.ok) {
    const detail = db.problems.map((p) => `[${p.code}] ${p.message}`).join("; ");
    throw new Error(`Database identity proof failed: ${detail}`);
  }
  const f = db.facts || {};
  console.log(`[run-integration] DB identity: PASS (db=${f.current_database} user=${f.current_user})`);
  console.log("[run-integration] ALL PREFLIGHT CHECKS PASSED");
}

function runVitest(runtimeUrl) {
  return new Promise((resolve) => {
    const env = { ...process.env, DATABASE_URL: runtimeUrl, NODE_ENV: "test" };
    for (const k of [...FORBIDDEN_ENV_VARS, "NEON_DATABASE_URL", "DIRECT_URL", "POSTGRES_URL", "PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE", "PGSERVICE", "PGSERVICEFILE", "POSTGRES_URL_NON_POOLING"]) {
      delete env[k];
    }
    const vitestEntry = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
    const args = ["run", "--config", "vitest.config.integration.ts", "src/integration/", "--environment", "node"];
    console.log("[run-integration] Starting integration Vitest (single-branch mode; QA fixtures must be namespaced tx/rollback with cleanup verification)... ");
    const child = spawn(process.execPath, [vitestEntry, ...args], { cwd: ROOT, stdio: "inherit", env, windowsHide: true, shell: false });
    child.once("error", (error) => { console.error("[run-integration] Vitest spawn error:", redactUrl(error.message)); resolve(1); });
    child.once("close", (code, signal) => {
      if (signal) { console.error(`[run-integration] Vitest terminated by signal ${signal}`); resolve(1); return; }
      console.log(`[run-integration] Vitest exited with code ${code}`);
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

export async function main() {
  const startTime = Date.now();
  try {
    console.log("=== PKE Integration Test Runner (Revision 4 — single project/branch) ===");
    console.log(`Timestamp: ${new Date().toISOString()}`);
    loadTestEnv();
    assertNoForbiddenTestEnv(process.env);
    const dbUrl = process.env[DATABASE_URL_ENV];
    await runSingleBranchPreflight(dbUrl, process.env);
    const exitCode = await runVitest(dbUrl);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== Integration run completed in ${duration}s, exit code: ${exitCode} ===`);
    return exitCode;
  } catch (error) {
    const message = redactUrl((error && error.message) || "unexpected error");
    console.error(`\n[run-integration] BLOCKED: ${message}`);
    return 1;
  }
}

const isDirectRun = (() => {
  try { if (!process.argv[1]) return false; return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch { return false; }
})();
if (isDirectRun) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`[run-integration] BLOCKED: ${redactUrl((error && error.message) || "unexpected error")}`);
    process.exitCode = 1;
  });
}
