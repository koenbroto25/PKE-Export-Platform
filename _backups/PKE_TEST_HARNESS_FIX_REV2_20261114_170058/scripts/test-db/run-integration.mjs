// Sprint 01.5 Phase B — Strict Local Integration Test Runner
// Loads .env.test.local, validates BOTH URLs, runs preflight, then Vitest.
// Fails closed on any non-local target. Propagates exact exit codes.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");

// ============================================
// 1. Load .env.test.local EXPLICITLY
// ============================================
function loadTestEnv() {
  const envPath = path.join(ROOT, ".env.test.local");
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    console.log("[run-integration] Loaded .env.test.local");
  } catch (error) {
    throw new Error(`Failed to load .env.test.local: ${error.message}`);
  }
}

// ============================================
// 2. Strict URL Validator (shared with preflight)
// ============================================
const RUNTIME_EXPECTED = {
  protocol: ["postgres:", "postgresql:"],
  hostname: "127.0.0.1",
  port: 54331,
  database: "pke_test",
  username: "app_runtime_secure",
};
const MAINTENANCE_EXPECTED = {
  ...RUNTIME_EXPECTED,
  username: "pke_test_runtime",
};

export function validateLocalUrl(rawUrl, expected, label) {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error(`${label}: ${expected.username.toUpperCase()}_DATABASE_URL is not set`);
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

  if (!expected.protocol.includes(parsed.protocol)) {
    throw new Error(`${label}: Must use postgres:// or postgresql://`);
  }

  if (parsed.hostname !== expected.hostname) {
    if (parsed.hostname === "localhost" || parsed.hostname === "[::1]" || parsed.hostname === "::1") {
      throw new Error(`${label}: Must use exact loopback host 127.0.0.1 (localhost/::1 not accepted)`);
    }
    throw new Error(`${label}: Host must be exactly ${expected.hostname} (got ${parsed.hostname})`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (port !== expected.port) {
    throw new Error(`${label}: Port must be exactly ${expected.port} (got ${port})`);
  }

  const database = parsed.pathname.replace(/^\//, "");
  if (database !== expected.database) {
    throw new Error(`${label}: Database must be exactly ${expected.database} (got ${database})`);
  }

  const username = decodeURIComponent(parsed.username || "");
  if (username !== expected.username) {
    throw new Error(`${label}: Username must be exactly ${expected.username} (got ${username})`);
  }

  if (!parsed.password) {
    throw new Error(`${label}: Password is required`);
  }
  // Only reject known placeholders for RUNTIME connection (must be a real password)
  if (label === "Runtime" && (parsed.password === "changeme-in-env-file" || parsed.password === "placeholder")) {
    throw new Error(`${label}: Password appears to be a placeholder`);
  }

  if (parsed.search && parsed.search !== "") {
    throw new Error(`${label}: Query parameters not allowed`);
  }
  if (parsed.hash && parsed.hash !== "") {
    throw new Error(`${label}: URL fragment not allowed`);
  }

  return { hostname: parsed.hostname, port, database, username };
}

// ============================================
// 3. Preflight Checks
// ============================================
async function runPreflight(runtimeUrl, maintenanceUrl) {
  console.log("[run-integration] Running preflight checks...");

  // 3a. Validate URLs
  validateLocalUrl(runtimeUrl, RUNTIME_EXPECTED, "Runtime");
  validateLocalUrl(maintenanceUrl, MAINTENANCE_EXPECTED, "Maintenance");
  console.log("[run-integration] URL validation: PASS");

  // 3b. Docker host binding proof
  console.log("[run-integration] Checking Docker host binding...");
  try {
    const output = execFileSync("docker", ["inspect", "--format={{json .NetworkSettings.Ports}}", "pke-sprint01-1-test-db"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
    const ports = JSON.parse(output);
    const bindings = ports?.["5432/tcp"];
    if (!Array.isArray(bindings) || bindings.length === 0) {
      throw new Error("Docker container not publishing 5432/tcp");
    }
    const exact = bindings.some(b => b && b.HostIp === "127.0.0.1" && String(b.HostPort) === "54331");
    const nonLoopback = bindings.some(b => b && b.HostIp && b.HostIp !== "127.0.0.1");
    if (!exact) throw new Error("Docker must publish 5432/tcp on 127.0.0.1:54331 only");
    if (nonLoopback) throw new Error("Docker port binding exposes non-loopback interface");
    console.log("[run-integration] Docker host binding: PASS");
  } catch (error) {
    if (error.message.includes("Docker")) throw error;
    throw new Error(`Docker host binding proof failed: ${error.message}`);
  }

// ============================================
// 3c. TCP reachability
// ============================================
console.log("[run-integration] Checking TCP reachability...");
const { Socket } = await import("node:net");
await new Promise((resolve, reject) => {
  const socket = new Socket();
  const timer = setTimeout(() => { socket.destroy(); reject(new Error("Port 54331 unreachable")); }, 5000);
  socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(); });
  socket.once("error", () => { clearTimeout(timer); reject(new Error("Port 54331 unreachable")); });
  socket.connect(54331, "127.0.0.1");
});
console.log("[run-integration] TCP reachability: PASS");

  // 3d. DB identity & privilege proof (runtime connection)
  console.log("[run-integration] Checking DB identity & privileges...");
  const client = new pg.Client({ connectionString: runtimeUrl, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT
        current_database() AS current_database,
        current_user AS current_user,
        session_user AS session_user,
        inet_server_port() AS server_port,
        r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
        to_regprocedure('public.resolve_pke_user_by_neon_auth_user_id(uuid)') IS NOT NULL AS has_identity_resolver,
        CASE WHEN to_regprocedure('public.resolve_pke_user_by_neon_auth_user_id(uuid)') IS NULL THEN NULL
             ELSE has_function_privilege(current_user, 'public.resolve_pke_user_by_neon_auth_user_id(uuid)', 'EXECUTE')
        END AS can_resolve_identity
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const f = rows[0];
    if (!f) throw new Error("No role facts returned");
    if (f.current_database !== "pke_test") throw new Error(`Wrong database: ${f.current_database}`);
    if (f.current_user !== "app_runtime_secure") throw new Error(`Wrong user: ${f.current_user}`);
    if (f.session_user !== "app_runtime_secure") throw new Error(`Wrong session_user: ${f.session_user}`);
    if (Number(f.server_port) !== 5432) throw new Error(`Unexpected server port: ${f.server_port}`);
    if (f.rolsuper) throw new Error("Runtime role must not be SUPERUSER");
    if (f.rolbypassrls) throw new Error("Runtime role must not have BYPASSRLS");
    if (f.rolcreatedb) throw new Error("Runtime role must not have CREATEDB");
    if (f.rolcreaterole) throw new Error("Runtime role must not have CREATEROLE");
    if (f.has_identity_resolver !== true) throw new Error("Identity resolver function missing");
    if (f.can_resolve_identity !== true) throw new Error("Runtime role cannot EXECUTE identity resolver");
    console.log("[run-integration] DB identity & privileges: PASS");
  } finally {
    await client.end().catch(() => {});
  }

  // 3e. Maintenance connection identity
  console.log("[run-integration] Checking maintenance connection identity...");
  const maintClient = new pg.Client({ connectionString: maintenanceUrl, connectionTimeoutMillis: 10000 });
  try {
    await maintClient.connect();
    const { rows } = await maintClient.query(`SELECT current_database(), current_user, inet_server_port()`);
    const f = rows[0];
    if (f.current_database !== "pke_test") throw new Error(`Maintenance: wrong database ${f.current_database}`);
    if (f.current_user !== "pke_test_runtime") throw new Error(`Maintenance: wrong user ${f.current_user}`);
    if (Number(f.inet_server_port) !== 5432) throw new Error(`Maintenance: unexpected server port ${f.inet_server_port}`);
    console.log("[run-integration] Maintenance identity: PASS");
  } finally {
    await maintClient.end().catch(() => {});
  }

  console.log("[run-integration] ALL PREFLIGHT CHECKS PASSED");
}

// ============================================
// 4. Run Vitest in Child Process
// ============================================
function runVitest() {
  return new Promise((resolve) => {
    const env = { ...process.env };
    // Ensure child uses validated runtime URL as DATABASE_URL
    env.DATABASE_URL = env.LOCAL_TEST_DATABASE_URL;
    // Remove cloud URL variables to prevent leakage
    delete env.NEON_DATABASE_URL;
    delete env.DIRECT_URL;
    delete env.POSTGRES_URL;
    // DATABASE_URL is intentionally kept (set above from the validated runtime URL)
    // so the API server under test always connects to the local runtime target.

    console.log("[run-integration] Starting Vitest...");
    const child = spawn("npx", ["vitest", "run", "src/integration/", "--environment", "node"], {
      cwd: ROOT,
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });

    child.on("close", (code) => {
      console.log(`[run-integration] Vitest exited with code ${code}`);
      resolve(code ?? 1);
    });

    child.on("error", (error) => {
      console.error("[run-integration] Vitest spawn error:", error.message);
      resolve(1);
    });
  });
}

// ============================================
// 5. Main
// ============================================
async function main() {
  const startTime = Date.now();
  try {
    console.log("=== Sprint 01.5 Integration Test Runner ===");
    console.log(`Timestamp: ${new Date().toISOString()}`);

    // Load env
    loadTestEnv();

    const runtimeUrl = process.env.LOCAL_TEST_DATABASE_URL;
    const maintenanceUrl = process.env.LOCAL_TEST_MAINTENANCE_DATABASE_URL;

    if (!runtimeUrl || !maintenanceUrl) {
      throw new Error("Both LOCAL_TEST_DATABASE_URL and LOCAL_TEST_MAINTENANCE_DATABASE_URL must be set in .env.test.local");
    }

    // Run preflight
    await runPreflight(runtimeUrl, maintenanceUrl);

    // Run Vitest
    const exitCode = await runVitest();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== Integration run completed in ${duration}s, exit code: ${exitCode} ===`);

    process.exit(exitCode);
  } catch (error) {
    console.error(`\n[run-integration] BLOCKED: ${error.message}`);
    process.exit(1);
  }
}

main();