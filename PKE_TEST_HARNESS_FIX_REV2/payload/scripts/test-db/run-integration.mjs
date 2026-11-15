// Sprint 01.5 Phase B — Strict Local Integration Test Runner
// Import-safe module: validation helpers can be tested without starting the runner.
// Direct execution performs strict local-only preflight before starting integration tests.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import pg from "pg";
import {
  getDockerPortBinding,
  isPortReachable,
  verifyDatabaseIdentityAndPrivileges,
} from "./preflight.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

const RUNTIME_EXPECTED = Object.freeze({
  protocol: ["postgres:", "postgresql:"],
  hostname: "127.0.0.1",
  port: 54331,
  database: "pke_test",
  username: "app_runtime_secure",
});

const MAINTENANCE_EXPECTED = Object.freeze({
  ...RUNTIME_EXPECTED,
  username: "pke_test_runtime",
});

const PLACEHOLDER_PASSWORDS = new Set([
  "changeme-in-env-file",
  "placeholder",
  "password",
  "your-password",
  "change-me",
]);

function redactUrl(value) {
  return String(value).replace(
    /(postgres(?:ql)?:\/\/[^:/?#\s]+:)[^@/?#\s]+@/gi,
    "$1<redacted>@",
  );
}

// Load only the explicitly named local test env file. Existing process
// variables take precedence; cloud URLs are never used as fallbacks.
function loadTestEnv() {
  const envPath = path.join(ROOT, ".env.test.local");
  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    throw new Error("Unable to read .env.test.local; integration runner is blocked.");
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Support simple quoted dotenv values without executing shell syntax.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function validateLocalUrl(rawUrl, expected, label) {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(`${label}: URL is not set`);
  }
  if (/\s/.test(rawUrl)) {
    throw new Error(`${label}: URL contains whitespace`);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label}: URL is malformed`);
  }

  if (!expected || !Array.isArray(expected.protocol) || !expected.protocol.includes(parsed.protocol)) {
    throw new Error(`${label}: Must use postgres:// or postgresql://`);
  }

  if (parsed.hostname !== expected.hostname) {
    if (parsed.hostname === "localhost" || parsed.hostname === "[::1]" || parsed.hostname === "::1") {
      throw new Error(`${label}: Must use exact loopback host 127.0.0.1 (localhost/::1 not accepted)`);
    }
    throw new Error(`${label}: Host must be exactly ${expected.hostname}`);
  }

  const port = parsed.port ? Number.parseInt(parsed.port, 10) : 5432;
  if (!Number.isInteger(port) || port !== expected.port) {
    throw new Error(`${label}: Port must be exactly ${expected.port}`);
  }

  if (parsed.pathname !== `/${expected.database}`) {
    throw new Error(`${label}: Database must be exactly ${expected.database}`);
  }

  let username = "";
  try {
    username = decodeURIComponent(parsed.username || "");
  } catch {
    throw new Error(`${label}: Username encoding is invalid`);
  }
  if (username !== expected.username) {
    throw new Error(`${label}: Username must be exactly ${expected.username}`);
  }

  if (!parsed.password) {
    throw new Error(`${label}: Password is required`);
  }
  if (PLACEHOLDER_PASSWORDS.has(parsed.password.toLowerCase())) {
    throw new Error(`${label}: Password appears to be a placeholder`);
  }

  if (parsed.search) {
    throw new Error(`${label}: Query parameters not allowed`);
  }
  if (parsed.hash) {
    throw new Error(`${label}: URL fragment not allowed`);
  }

  return {
    hostname: parsed.hostname,
    port,
    database: expected.database,
    username,
  };
}

async function verifyMaintenanceIdentity(connectionString) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT current_database() AS current_database, current_user AS current_user, inet_server_port() AS server_port",
    );
    const facts = rows[0];

    if (!facts) throw new Error("Maintenance DB returned no identity facts");
    if (facts.current_database !== "pke_test") throw new Error("Maintenance DB identity mismatch");
    if (facts.current_user !== "pke_test_runtime") throw new Error("Maintenance role identity mismatch");
    if (Number(facts.server_port) !== 5432) throw new Error("Maintenance server port mismatch");
  } catch (error) {
    const message = redactUrl((error && error.message) || "connection/query error");
    throw new Error(`Maintenance DB identity proof failed: ${message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function runPreflight(runtimeUrl, maintenanceUrl) {
  console.log("[run-integration] Running preflight checks...");

  validateLocalUrl(runtimeUrl, RUNTIME_EXPECTED, "Runtime");
  validateLocalUrl(maintenanceUrl, MAINTENANCE_EXPECTED, "Maintenance");
  console.log("[run-integration] URL validation: PASS");

  const docker = getDockerPortBinding("pke-sprint01-1-test-db");
  if (!docker.validation.ok) {
    const detail = docker.validation.problems.map((item) => item.message).join("; ");
    throw new Error(`Docker host-binding proof failed: ${detail}`);
  }
  console.log("[run-integration] Docker host binding: PASS");

  const reachable = await isPortReachable("127.0.0.1", 54331, 5000);
  if (!reachable) {
    throw new Error("Local test database port 127.0.0.1:54331 is unreachable");
  }
  console.log("[run-integration] TCP reachability: PASS");

  const runtimeProof = await verifyDatabaseIdentityAndPrivileges(runtimeUrl);
  if (!runtimeProof.ok) {
    const detail = runtimeProof.problems.map((item) => item.message).join("; ");
    throw new Error(`Runtime DB identity/privilege proof failed: ${detail}`);
  }
  console.log("[run-integration] Runtime DB identity & privileges: PASS");

  await verifyMaintenanceIdentity(maintenanceUrl);
  console.log("[run-integration] Maintenance DB identity: PASS");
  console.log("[run-integration] ALL PREFLIGHT CHECKS PASSED");
}

function runVitest() {
  return new Promise((resolve) => {
    const env = { ...process.env };

    // The child process receives only the already-validated local runtime URL.
    env.DATABASE_URL = env.LOCAL_TEST_DATABASE_URL;
    env.NODE_ENV = "test";

    // Remove alternate/cloud connection variables to prevent accidental fallback.
    delete env.NEON_DATABASE_URL;
    delete env.DIRECT_URL;
    delete env.POSTGRES_URL;
    delete env.PGHOST;
    delete env.PGHOSTADDR;
    delete env.PGPORT;
    delete env.PGUSER;
    delete env.PGPASSWORD;
    delete env.PGDATABASE;
    delete env.PGSSLMODE;
    delete env.PGSERVICE;
    delete env.PGSERVICEFILE;
    delete env.POSTGRES_URL_NON_POOLING;

    const vitestEntry = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
    const args = [
      vitestEntry,
      "run",
      "--config",
      "vitest.config.integration.ts",
      "src/integration/",
      "--environment",
      "node",
    ];

    console.log("[run-integration] Starting isolated integration Vitest config...");
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: "inherit",
      env,
      windowsHide: true,
      shell: false,
    });

    child.once("error", (error) => {
      console.error("[run-integration] Vitest spawn error:", error.message);
      resolve(1);
    });

    child.once("close", (code, signal) => {
      if (signal) {
        console.error(`[run-integration] Vitest terminated by signal ${signal}`);
        resolve(1);
        return;
      }
      console.log(`[run-integration] Vitest exited with code ${code}`);
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

export async function main() {
  const startTime = Date.now();

  try {
    console.log("=== Sprint 01.5 Integration Test Runner ===");
    console.log(`Timestamp: ${new Date().toISOString()}`);

    loadTestEnv();

    const runtimeUrl = process.env.LOCAL_TEST_DATABASE_URL;
    const maintenanceUrl = process.env.LOCAL_TEST_MAINTENANCE_DATABASE_URL;

    if (!runtimeUrl || !maintenanceUrl) {
      throw new Error(
        "Both LOCAL_TEST_DATABASE_URL and LOCAL_TEST_MAINTENANCE_DATABASE_URL must be set in .env.test.local",
      );
    }

    await runPreflight(runtimeUrl, maintenanceUrl);

    const exitCode = await runVitest();
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
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

// Crucial: importing this module from Vitest tests must never start the runner
// or terminate the test process.
if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = redactUrl((error && error.message) || "unexpected error");
      console.error(`[run-integration] BLOCKED: ${message}`);
      process.exitCode = 1;
    });
}
