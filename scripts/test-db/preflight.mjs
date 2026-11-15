// REVISION 4 — PERMANENT SINGLE NEON PROJECT & SINGLE BRANCH POLICY (2026-11-14, owner-mandated)
// Project: purple-base-63944903 (PKE-export-platform)
// Branch: br-damp-shape-b3xlh4nr (production) | DB: neondb | Role: app_runtime_secure
// Host: ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech
// ABSOLUTE: NO additional Neon branches ever. NO NEON_TEST_DATABASE_URL. NO branch-selection/fallback.
// NO local PostgreSQL/Docker. Legacy project lucky-glitter-99553107 + all its hosts/branches FORBIDDEN.
// Single DATABASE_URL only. Fail-closed on mismatch. Never print secrets/connection strings.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

export const EXPECTED_PROJECT_ID = "purple-base-63944903";
export const EXPECTED_BRANCH_ID = "br-damp-shape-b3xlh4nr";
export const EXPECTED_BRANCH_NAME = "production";
export const EXPECTED_HOST = "ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech";
export const EXPECTED_PORT = 5432;
export const EXPECTED_DATABASE = "neondb";
export const EXPECTED_RUNTIME_USER = "app_runtime_secure";
export const DATABASE_URL_ENV = "DATABASE_URL";

export const LEGACY_PROJECT_ID = "lucky-glitter-99553107";
export const LEGACY_HOSTS = [
  "ep-restless-hat-b35j9x0d-pooler.c-4.ap-southeast-1.aws.neon.tech",
  "ep-restless-hat-b35j9x0d.neonauth.c-4.ap-southeast-1.aws.neon.tech",
  "ep-restless-hat-b35j9x0d.apirest.c-4.ap-southeast-1.aws.neon.tech",
  "ep-blue-rice-b3ywrqrq-pooler.c-4.ap-southeast-1.aws.neon.tech",
  "ep-blue-rice-b3ywrqrq.neonauth.c-4.ap-southeast-1.aws.neon.tech",
  "br-calm-glade-b3nrleet.storage.c-4.ap-southeast-1.aws.neon.tech",
  "br-billowing-math-b31f4wos.storage.c-4.ap-southeast-1.aws.neon.tech",
];
export const LEGACY_BRANCH_IDS = [
  "br-calm-glade-b3nrleet",
  "br-billowing-math-b31f4wos",
  "br-gentle-thunder-b3z7y3bk",
  "br-empty-cherry-b3ldvfyy",
  "br-lively-frog-b3om6oqr",
];
const FORBIDDEN_ENV_VARS = [
  "NEON_TEST_DATABASE_URL",
  "NEON_TEST_PROJECT_ID",
  "NEON_TEST_BRANCH_ID",
  "PKE_TEST_TARGET",
  "LOCAL_TEST_DATABASE_URL",
  "LOCAL_TEST_MAINTENANCE_DATABASE_URL",
];

function redactUrl(url) {
  if (typeof url !== "string") return "<redacted>";
  return url.replace(/(postgres(?:ql)?:\/\/[^:/?#\s]+:)[^@/?#\s]+@/i, "$1<redacted>@");
}
function push(problems, code, message) { problems.push({ code, message }); }

export function validateSingleBranchDatabaseUrl(rawUrl, env = {}) {
  const problems = [];
  for (const key of FORBIDDEN_ENV_VARS) {
    if (env[key] !== undefined && String(env[key]).trim() !== "") {
      push(problems, "FORBIDDEN_ENV_VAR", `${key} is FORBIDDEN (Revision 4: no alternate/test/branch-selection/local-db URLs).`);
    }
  }
  if (env.NEON_PROJECT_ID !== undefined && env.NEON_PROJECT_ID !== EXPECTED_PROJECT_ID) {
    push(problems, "INVALID_PROJECT_ID", `NEON_PROJECT_ID must be exactly ${EXPECTED_PROJECT_ID}.`);
  }
  if (env.NEON_BRANCH_ID !== undefined && env.NEON_BRANCH_ID !== EXPECTED_BRANCH_ID) {
    push(problems, "INVALID_BRANCH_ID", `NEON_BRANCH_ID must be exactly ${EXPECTED_BRANCH_ID}.`);
  }
  if (env.NEON_BRANCH_NAME !== undefined && env.NEON_BRANCH_NAME !== EXPECTED_BRANCH_NAME) {
    push(problems, "INVALID_BRANCH_NAME", `NEON_BRANCH_NAME must be exactly ${EXPECTED_BRANCH_NAME}.`);
  }

  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    push(problems, "MISSING_URL", `${DATABASE_URL_ENV} is not set.`);
    return { ok: false, problems, mode: "single-production" };
  }
  if (/\s/.test(rawUrl)) {
    push(problems, "MALFORMED_URL", `${DATABASE_URL_ENV} contains whitespace and is invalid.`);
    return { ok: false, problems, mode: "single-production" };
  }
  let parsed;
  try { parsed = new URL(rawUrl); } catch {
    push(problems, "MALFORMED_URL", `${DATABASE_URL_ENV} is not a valid URL.`);
    return { ok: false, problems, mode: "single-production" };
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    push(problems, "INVALID_PROTOCOL", `${DATABASE_URL_ENV} must use postgres:// or postgresql://.`);
  }
  const hostname = parsed.hostname || "";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1" || /^127\./.test(hostname) || /\.local$/i.test(hostname)) {
    push(problems, "LOCAL_HOST_REJECTED", "Local/Docker/loopback hosts are FORBIDDEN (Revision 4).");
  }
  if (LEGACY_HOSTS.includes(hostname)) {
    push(problems, "LEGACY_HOST_REJECTED", "Legacy Neon project/branch host is FORBIDDEN. Target must be new production host only.");
  }
  for (const id of LEGACY_BRANCH_IDS) {
    if (hostname.includes(id) || rawUrl.includes(id)) push(problems, "LEGACY_BRANCH_REJECTED", "Legacy Neon branch identifiers are FORBIDDEN.");
  }
  if (rawUrl.includes(LEGACY_PROJECT_ID)) {
    push(problems, "LEGACY_PROJECT_REJECTED", "Legacy Neon project identifier is FORBIDDEN.");
  }
  if (hostname !== EXPECTED_HOST) {
    push(problems, "INVALID_HOST", `${DATABASE_URL_ENV} host must be exactly ${EXPECTED_HOST}.`);
  }

  const port = parsed.port ? Number.parseInt(parsed.port, 10) : 5432;
  if (!Number.isInteger(port) || port !== EXPECTED_PORT) {
    push(problems, "INVALID_PORT", `${DATABASE_URL_ENV} port must be ${EXPECTED_PORT}.`);
  }
  const database = parsed.pathname.replace(/^\//, "");
  if (database !== EXPECTED_DATABASE) {
    push(problems, "INVALID_DATABASE", `${DATABASE_URL_ENV} database must be exactly ${EXPECTED_DATABASE}.`);
  }
  let username = "";
  try { username = decodeURIComponent(parsed.username || ""); } catch { push(problems, "INVALID_USER", `${DATABASE_URL_ENV} username encoding is invalid.`); }
  if (username !== EXPECTED_RUNTIME_USER) {
    push(problems, "INVALID_USER", `${DATABASE_URL_ENV} username must be exactly ${EXPECTED_RUNTIME_USER}.`);
  }
  if (!parsed.password) push(problems, "MISSING_PASSWORD", `${DATABASE_URL_ENV} must include a password.`);

  const sslmode = parsed.searchParams.get("sslmode");
  if (!sslmode || !["require", "verify-ca", "verify-full"].includes(sslmode)) {
    push(problems, "TLS_REQUIRED", `${DATABASE_URL_ENV} must include sslmode=require, verify-ca, or verify-full.`);
  }
  for (const [k, v] of parsed.searchParams.entries()) {
    if (k === "sslmode" && ["disable", "allow", "prefer"].includes(v)) push(problems, "TLS_REQUIRED", `${DATABASE_URL_ENV} must not disable TLS.`);
  }
  for (const k of parsed.searchParams.keys()) {
    if (!["sslmode", "uselibpqcompat", "sslrootcert", "channel_binding"].includes(k)) {
      push(problems, "UNEXPECTED_PARAMS", `${DATABASE_URL_ENV} contains unsupported query parameters.`);
    }
  }
  if (parsed.hash) push(problems, "UNEXPECTED_FRAGMENT", `${DATABASE_URL_ENV} must not include a URL fragment.`);

  // dedupe problems by code+message
  const seen = new Set();
  const uniq = problems.filter((p) => { const k = p.code + "|" + p.message; if (seen.has(k)) return false; seen.add(k); return true; });

  return {
    ok: uniq.length === 0,
    problems: uniq,
    mode: "single-production",
    config: uniq.length === 0 ? { host: EXPECTED_HOST, port: EXPECTED_PORT, database: EXPECTED_DATABASE, username: EXPECTED_RUNTIME_USER, projectId: EXPECTED_PROJECT_ID, branchId: EXPECTED_BRANCH_ID, branchName: EXPECTED_BRANCH_NAME } : undefined,
  };
}

// Legacy exports kept for compatibility but now enforce/reflect Revision 4 policy (no local, no neon-branch).
export const validateDatabaseUrl = (rawUrl) => validateSingleBranchDatabaseUrl(rawUrl).problems.map((p) => p.message);
export const validateNeonBranchTestConfig = () => ({ ok: false, problems: [{ code: "BRANCH_MODE_FORBIDDEN", message: "Neon validation/test branches and NEON_TEST_DATABASE_URL are FORBIDDEN (Revision 4). Use single DATABASE_URL to production only." }], mode: "forbidden" });
export const validateLocalTestDatabaseUrl = () => ({ ok: false, problems: [{ code: "LOCAL_DB_FORBIDDEN", message: "Local PostgreSQL/Docker database is FORBIDDEN (Revision 4)." }] });
export const parseLocalTestDatabaseUrl = (rawUrl) => { try { return { ok: true, problems: [], parsed: new URL(rawUrl) }; } catch { return { ok: false, problems: [{ code: "MALFORMED_URL", message: "Invalid URL." }] }; } };
export const assertLocalTestOperationAllowed = (_rawUrl, operation = "operation") => { throw new Error(`BLOCKED: ${operation} refused — local/alternate test databases are FORBIDDEN (Revision 4).`); };
export const assertLocalResetAllowed = () => { throw new Error("BLOCKED: database reset is FORBIDDEN (Revision 4)."); };
export const validateDockerHostBindingFromInspect = () => ({ ok: false, problems: [{ code: "DOCKER_FORBIDDEN", message: "Local Docker database is FORBIDDEN (Revision 4)." }] });
export const getDockerPortBinding = () => ({ validation: { ok: false, problems: [{ code: "DOCKER_FORBIDDEN", message: "Local Docker database is FORBIDDEN (Revision 4)." }] }, output: "" });
export const isPortReachable = async () => false;

export async function verifyDatabaseIdentityAndPrivileges(connectionString, timeoutMs = 15000) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: timeoutMs, ssl: { rejectUnauthorized: true } });
  const problems = [];
  let facts = null;
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT current_database() AS current_database, current_user AS current_user, session_user AS session_user,
             inet_server_port() AS server_port, current_setting('server_version', true) AS server_version,
             r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
      FROM pg_roles r WHERE r.rolname = current_user`);
    facts = rows[0] || null;
    if (!facts) push(problems, "NO_ROLE_FACTS", "Unable to read runtime role facts.");
    else {
      if (facts.current_database !== EXPECTED_DATABASE) push(problems, "WRONG_DATABASE", `Connected database must be ${EXPECTED_DATABASE}.`);
      if (facts.current_user !== EXPECTED_RUNTIME_USER) push(problems, "WRONG_USER", `Connected role must be ${EXPECTED_RUNTIME_USER}.`);
      if (facts.session_user !== EXPECTED_RUNTIME_USER) push(problems, "WRONG_SESSION_USER", `Session user must be ${EXPECTED_RUNTIME_USER}.`);
      if (Number(facts.server_port) !== EXPECTED_PORT) push(problems, "WRONG_PORT", `Server port must be ${EXPECTED_PORT}.`);
      if (facts.rolsuper) push(problems, "ROLE_SUPERUSER", "Runtime role must not be SUPERUSER.");
      if (facts.rolbypassrls) push(problems, "ROLE_BYPASSRLS", "Runtime role must not have BYPASSRLS.");
      if (facts.rolcreatedb) push(problems, "ROLE_CREATEDB", "Runtime role must not have CREATEDB.");
      if (facts.rolcreaterole) push(problems, "ROLE_CREATEROLE", "Runtime role must not have CREATEROLE.");
    }
  } catch (error) {
    push(problems, "DB_PROOF_FAILED", `Database identity proof failed: ${redactUrl(String(error && error.message ? error.message : "connection/query error"))}`);
  } finally { await client.end().catch(() => {}); }
  return { ok: problems.length === 0, problems, facts };
}
export const verifyNeonBranchIdentity = verifyDatabaseIdentityAndPrivileges;

export async function runPreflight(options = {}) {
  const env = options.env || process.env;
  const rawUrl = env[DATABASE_URL_ENV];
  const validation = validateSingleBranchDatabaseUrl(rawUrl, env);
  if (!validation.ok) return { ok: false, blocked: true, mode: "single-production", stage: "url_validation", problems: validation.problems };
  let db = { ok: true, problems: [], facts: null };
  if (options.skipDbProof !== true) {
    db = await verifyDatabaseIdentityAndPrivileges(rawUrl, options.timeoutMs || 15000);
    if (!db.ok) return { ok: false, blocked: true, mode: "single-production", stage: "db_identity", problems: db.problems, db };
  }
  return { ok: true, blocked: false, mode: "single-production", stage: "pass", problems: [], config: validation.config, db };
}

function formatProblem(problem) { return `- [${problem.code}] ${problem.message}`; }

export async function main(argv = process.argv, env = process.env) {
  const args = new Set(argv.slice(2));
  const result = await runPreflight({ env, skipDbProof: args.has("--skip-db-proof") });
  if (!result.ok) {
    console.error(`BLOCKED: ${DATABASE_URL_ENV} preflight failed at ${result.stage}.`);
    for (const problem of result.problems) console.error(formatProblem(problem));
    if (result.db && result.db.facts) {
      const f = result.db.facts;
      console.error(`Observed DB identity: database=${f.current_database} user=${f.current_user} server_port=${f.server_port ?? ""}`);
    }
    return 1;
  }
  const f = result.db && result.db.facts ? result.db.facts : null;
  console.log(`PASS: ${DATABASE_URL_ENV} targets ${EXPECTED_HOST}:${EXPECTED_PORT}/${EXPECTED_DATABASE} as ${EXPECTED_RUNTIME_USER} (project ${EXPECTED_PROJECT_ID}, branch ${EXPECTED_BRANCH_ID} ${EXPECTED_BRANCH_NAME}).`);
  if (f) console.log(`DB proof: database=${f.current_database} user=${f.current_user} rolsuper=${f.rolsuper} rolbypassrls=${f.rolbypassrls} rolcreatedb=${f.rolcreatedb} rolcreaterole=${f.rolcreaterole}`);
  else console.log("DB identity proof: skipped (--skip-db-proof).");
  return 0;
}

const isDirectRun = (() => {
  try { if (!process.argv[1]) return false; return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch { return false; }
})();
if (isDirectRun) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error("BLOCKED: preflight failed unexpectedly.");
    console.error(redactUrl(String(error && error.message ? error.message : "unexpected error")));
    process.exitCode = 1;
  });
}
