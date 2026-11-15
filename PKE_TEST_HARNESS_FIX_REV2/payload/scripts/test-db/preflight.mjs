// Sprint 01.4 — Local test database preflight guard (Gate A)
// Side-effect-free validation + explicit CLI/runtime proofs for local-only pke_test.
// Never falls back to DATABASE_URL/.env Production values. Never logs credentials.

import { Socket } from "node:net";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

export const EXPECTED_HOST = "127.0.0.1";
export const EXPECTED_PORT = 54331;
export const EXPECTED_DATABASE = "pke_test";
export const EXPECTED_RUNTIME_USER = "app_runtime_secure";
export const LOCAL_TEST_ENV_VAR = "LOCAL_TEST_DATABASE_URL";
export const RESET_CONFIRM_ENV = "ALLOW_PKE_TEST_RESET";
export const RESET_CONFIRM_VALUE = "YES_RESET_LOCAL_PKE_TEST";

const FORBIDDEN_HOST_PATTERNS = [/\.neon\.tech$/i, /neon\.tech/i, /amazonaws\.com$/i, /supabase\.co$/i];
const KNOWN_PRODUCTION_BRANCH_IDS = [
  "br-calm-glade-b3nrleet",
  "br-gentle-thunder-b3z7y3bk",
  "br-empty-cherry-b3ldvfyy",
  "br-lively-frog-b3om6oqr",
];

function redactUrl(url) {
  if (typeof url !== "string") return "<redacted>";
  return url.replace(/(postgres(?:ql)?:\/\/[^:/?#\s]+:)[^@/?#\s]+@/i, "$1<redacted>@");
}

function push(problems, code, message) {
  problems.push({ code, message });
}

export function parseLocalTestDatabaseUrl(rawUrl) {
  const problems = [];
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim() === "") {
    push(problems, "MISSING_URL", `${LOCAL_TEST_ENV_VAR} is not set.`);
    return { ok: false, problems };
  }
  if (/\s/.test(rawUrl)) {
    push(problems, "MALFORMED_URL", `${LOCAL_TEST_ENV_VAR} contains whitespace and is invalid.`);
    return { ok: false, problems };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    push(problems, "MALFORMED_URL", `${LOCAL_TEST_ENV_VAR} is not a valid URL.`);
    return { ok: false, problems };
  }
  return { ok: true, problems, parsed, rawUrl };
}

export function validateLocalTestDatabaseUrl(rawUrl) {
  const result = parseLocalTestDatabaseUrl(rawUrl);
  if (!result.ok) return result;
  const { parsed } = result;
  const problems = [];

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    push(problems, "INVALID_PROTOCOL", `${LOCAL_TEST_ENV_VAR} must use postgres:// or postgresql://.`);
  }

  const hostname = parsed.hostname;
  const hostAllowed = hostname === EXPECTED_HOST;
  if (!hostAllowed) {
    if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") {
      push(problems, "INVALID_HOST", `${LOCAL_TEST_ENV_VAR} must use exact loopback host ${EXPECTED_HOST} (localhost/::1 are not accepted).`);
    } else if (FORBIDDEN_HOST_PATTERNS.some((re) => re.test(hostname)) || KNOWN_PRODUCTION_BRANCH_IDS.some((id) => hostname.includes(id))) {
      push(problems, "FORBIDDEN_REMOTE_HOST", `${LOCAL_TEST_ENV_VAR} targets a forbidden remote/Neon/production host.`);
    } else {
      push(problems, "INVALID_HOST", `${LOCAL_TEST_ENV_VAR} host must be exactly ${EXPECTED_HOST}.`);
    }
  }

  const port = parsed.port ? Number.parseInt(parsed.port, 10) : 5432;
  if (!Number.isInteger(port) || port !== EXPECTED_PORT) {
    push(problems, "INVALID_PORT", `${LOCAL_TEST_ENV_VAR} port must be exactly ${EXPECTED_PORT}.`);
  }

  const database = parsed.pathname.replace(/^\//, "");
  if (database !== EXPECTED_DATABASE) {
    push(problems, "INVALID_DATABASE", `${LOCAL_TEST_ENV_VAR} database must be exactly ${EXPECTED_DATABASE}.`);
  }

  let username = "";
  try {
    username = decodeURIComponent(parsed.username || "");
  } catch {
    push(problems, "INVALID_USER", `${LOCAL_TEST_ENV_VAR} username encoding is invalid.`);
  }
  if (username !== EXPECTED_RUNTIME_USER) {
    push(problems, "INVALID_USER", `${LOCAL_TEST_ENV_VAR} username must be exactly ${EXPECTED_RUNTIME_USER}.`);
  }

  if (!parsed.password) {
    push(problems, "MISSING_PASSWORD", `${LOCAL_TEST_ENV_VAR} must include a password for ${EXPECTED_RUNTIME_USER}.`);
  }

  if (parsed.search && parsed.search !== "") {
    push(problems, "UNEXPECTED_PARAMS", `${LOCAL_TEST_ENV_VAR} must not include query parameters.`);
  }
  if (parsed.hash && parsed.hash !== "") {
    push(problems, "UNEXPECTED_FRAGMENT", `${LOCAL_TEST_ENV_VAR} must not include a URL fragment.`);
  }

  return {
    ok: problems.length === 0,
    problems,
    config: problems.length === 0 ? {
      host: EXPECTED_HOST,
      port: EXPECTED_PORT,
      database: EXPECTED_DATABASE,
      username: EXPECTED_RUNTIME_USER,
    } : undefined,
    parsed,
  };
}

// Backward-compatible export name used by existing callers/tests; now enforces strict 01.4 policy.
export function validateDatabaseUrl(rawUrl) {
  const result = validateLocalTestDatabaseUrl(rawUrl);
  return result.problems.map((p) => p.message);
}

export function validateDockerHostBindingFromInspect(portsJson) {
  const problems = [];
  let ports;
  try {
    ports = typeof portsJson === "string" ? JSON.parse(portsJson) : portsJson;
  } catch {
    push(problems, "INVALID_DOCKER_INSPECT", "Docker port inspect output could not be parsed.");
    return { ok: false, problems };
  }
  const bindings = ports && ports["5432/tcp"];
  if (!Array.isArray(bindings) || bindings.length === 0) {
    push(problems, "MISSING_PORT_BINDING", "Docker container is not publishing 5432/tcp.");
    return { ok: false, problems };
  }
  // Require exactly one published binding and require it to be the exact
  // loopback address/port. An empty HostIp is not accepted because it can
  // represent an all-interface binding on some Docker configurations.
  const onlyExactBinding =
    bindings.length === 1 &&
    bindings[0] &&
    bindings[0].HostIp === EXPECTED_HOST &&
    String(bindings[0].HostPort) === String(EXPECTED_PORT);

  if (!onlyExactBinding) {
    push(
      problems,
      "WRONG_PORT_BINDING",
      `Docker must publish 5432/tcp exactly once on ${EXPECTED_HOST}:${EXPECTED_PORT}; wildcard and non-loopback bindings are forbidden.`,
    );
  }
  return { ok: problems.length === 0, problems, bindings };
}

export function getDockerPortBinding(containerName = "pke-sprint01-1-test-db") {
  try {
    const output = execFileSync("docker", ["inspect", "--format={{json .NetworkSettings.Ports}}", containerName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
    return { output, validation: validateDockerHostBindingFromInspect(output) };
  } catch (error) {
    return {
      output: "",
      validation: {
        ok: false,
        problems: [{ code: "DOCKER_INSPECT_FAILED", message: `Docker host-binding proof failed: ${(error && error.message) || "inspect error"}` }],
      },
    };
  }
}

export function isPortReachable(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once("connect", () => { clearTimeout(timer); done(true); });
    socket.once("error", () => { clearTimeout(timer); done(false); });
    try {
      socket.connect(port, host);
    } catch {
      clearTimeout(timer);
      done(false);
    }
  });
}

export function assertLocalTestOperationAllowed(rawUrl, operation = "operation") {
  const validation = validateLocalTestDatabaseUrl(rawUrl);
  if (!validation.ok) {
    const detail = validation.problems.map((p) => p.message).join("; ");
    throw new Error(`BLOCKED: ${operation} refused for non-local or invalid test target: ${detail}`);
  }
  return validation;
}

export function assertLocalResetAllowed(rawUrl, env = process.env) {
  assertLocalTestOperationAllowed(rawUrl, "local test reset");
  if (env[RESET_CONFIRM_ENV] !== RESET_CONFIRM_VALUE) {
    throw new Error(`BLOCKED: local test reset requires explicit ${RESET_CONFIRM_ENV}=${RESET_CONFIRM_VALUE}.`);
  }
  return true;
}

export async function verifyDatabaseIdentityAndPrivileges(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  const problems = [];
  let facts = null;
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT
        current_database() AS current_database,
        current_user AS current_user,
        session_user AS session_user,
        current_setting('server_version', true) AS server_version,
        inet_server_port() AS server_port,
        r.rolsuper,
        r.rolbypassrls,
        r.rolcreatedb,
        r.rolcreaterole,
        to_regprocedure('public.resolve_pke_user_by_neon_auth_user_id(uuid)') IS NOT NULL AS has_identity_resolver,
        CASE
          WHEN to_regprocedure('public.resolve_pke_user_by_neon_auth_user_id(uuid)') IS NULL THEN NULL
          ELSE has_function_privilege(current_user, 'public.resolve_pke_user_by_neon_auth_user_id(uuid)', 'EXECUTE')
        END AS can_resolve_identity
      FROM pg_roles r
      WHERE r.rolname = current_user
    `);
    facts = rows[0] || null;
    if (!facts) {
      push(problems, "NO_ROLE_FACTS", "Unable to read runtime role facts from local test database.");
    } else {
      if (facts.current_database !== EXPECTED_DATABASE) push(problems, "WRONG_DATABASE", `Connected database must be ${EXPECTED_DATABASE}.`);
      if (facts.current_user !== EXPECTED_RUNTIME_USER) push(problems, "WRONG_USER", `Connected role must be ${EXPECTED_RUNTIME_USER}.`);
      if (facts.session_user !== EXPECTED_RUNTIME_USER) push(problems, "WRONG_SESSION_USER", `Session user must be ${EXPECTED_RUNTIME_USER}.`);
      if (Number(facts.server_port) !== 5432) push(problems, "UNEXPECTED_SERVER_PORT", "Connected PostgreSQL server port must be 5432 inside the local container.");
      if (facts.rolsuper) push(problems, "ROLE_SUPERUSER", "Runtime test role must not be SUPERUSER.");
      if (facts.rolbypassrls) push(problems, "ROLE_BYPASSRLS", "Runtime test role must not have BYPASSRLS.");
      if (facts.rolcreatedb) push(problems, "ROLE_CREATEDB", "Runtime test role must not have CREATEDB.");
      if (facts.rolcreaterole) push(problems, "ROLE_CREATEROLE", "Runtime test role must not have CREATEROLE.");
      if (facts.has_identity_resolver !== true) push(problems, "MISSING_IDENTITY_RESOLVER", "public.resolve_pke_user_by_neon_auth_user_id(uuid) is missing (local schema parity/provisioning required).");
      if (facts.has_identity_resolver === true && facts.can_resolve_identity !== true) push(problems, "MISSING_IDENTITY_RESOLVER_EXECUTE", "Runtime role must be able to EXECUTE public.resolve_pke_user_by_neon_auth_user_id(uuid).");
    }
  } catch (error) {
    const message = String((error && error.message) || "connection/query error")
      .replace(/(postgres(?:ql)?:\/\/[^:/?#\s]+:)[^@/?#\s]+@/i, "$1<redacted>@");
    push(problems, "DB_PROOF_FAILED", `Database identity/privilege proof failed: ${message}`);
  } finally {
    await client.end().catch(() => {});
  }
  return { ok: problems.length === 0, problems, facts };
}

export async function runPreflight(options = {}) {
  const env = options.env || process.env;
  const rawUrl = env[LOCAL_TEST_ENV_VAR];
  const urlValidation = validateLocalTestDatabaseUrl(rawUrl);
  if (!urlValidation.ok) {
    return { ok: false, blocked: true, stage: "url_validation", problems: urlValidation.problems };
  }

  const reachable = await isPortReachable(EXPECTED_HOST, EXPECTED_PORT, options.timeoutMs || 5000);
  if (!reachable) {
    return {
      ok: false,
      blocked: true,
      stage: "port_reachability",
      problems: [{ code: "PORT_UNREACHABLE", message: `${LOCAL_TEST_ENV_VAR} host port ${EXPECTED_HOST}:${EXPECTED_PORT} is not reachable.` }],
    };
  }

  const docker = options.skipDockerProof ? { validation: { ok: true, problems: [] }, output: "" } : getDockerPortBinding(options.containerName);
  if (!docker.validation.ok) {
    return { ok: false, blocked: true, stage: "docker_host_binding", problems: docker.validation.problems, docker };
  }

  const db = options.skipDbProof ? { ok: true, problems: [], facts: null } : await verifyDatabaseIdentityAndPrivileges(rawUrl);
  if (!db.ok) {
    return { ok: false, blocked: true, stage: "db_identity_privilege", problems: db.problems, docker, db };
  }

  return {
    ok: true,
    blocked: false,
    stage: "pass",
    problems: [],
    config: urlValidation.config,
    docker,
    db,
  };
}

function formatProblem(problem) {
  return `- [${problem.code}] ${problem.message}`;
}

export async function main(argv = process.argv, env = process.env) {
  const args = new Set(argv.slice(2));
  const result = await runPreflight({
    env,
    skipDockerProof: args.has("--skip-docker-proof"),
    skipDbProof: args.has("--skip-db-proof"),
  });
  if (!result.ok) {
    console.error(`BLOCKED: ${LOCAL_TEST_ENV_VAR} preflight failed at ${result.stage}.`);
    for (const problem of result.problems) console.error(formatProblem(problem));
    if (result.db && result.db.facts) {
      const f = result.db.facts;
      console.error(`Observed DB identity: database=${f.current_database} user=${f.current_user} session=${f.session_user} server_port=${f.server_port}`);
    }
    return 1;
  }
  const f = result.db && result.db.facts ? result.db.facts : null;
  console.log(`PASS: ${LOCAL_TEST_ENV_VAR} targets ${EXPECTED_HOST}:${EXPECTED_PORT}/${EXPECTED_DATABASE} as ${EXPECTED_RUNTIME_USER}.`);
  if (f) {
    console.log(`DB proof: database=${f.current_database} user=${f.current_user} rolsuper=${f.rolsuper} rolbypassrls=${f.rolbypassrls} rolcreatedb=${f.rolcreatedb} rolcreaterole=${f.rolcreaterole}`);
  }
  console.log("Docker host-binding proof: 127.0.0.1:54331 -> container 5432/tcp.");
  return 0;
}

const isDirectRun = (() => {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error("BLOCKED: preflight failed unexpectedly.");
    console.error(String(error && error.message ? error.message : "unexpected error").replace(/(postgres(?:ql)?:\/\/[^:/?#\s]+:)[^@/?#\s]+@/i, "$1<redacted>@"));
    process.exitCode = 1;
  });
}
