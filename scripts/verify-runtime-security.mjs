import dotenv from "dotenv";
import pg from "pg";

dotenv.config();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

let roleFromUrl;
try {
  roleFromUrl = decodeURIComponent(new URL(connectionString).username);
} catch {
  console.error("DATABASE_URL is not a valid PostgreSQL URL.");
  process.exit(1);
}
if (roleFromUrl !== "app_runtime_secure") {
  console.error("FAIL: DATABASE_URL must use app_runtime_secure.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const result = await client.query(`
    SELECT current_user AS current_role,
           r.rolsuper,
           r.rolbypassrls,
           r.rolcreatedb,
           r.rolcreaterole,
           pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
           has_function_privilege(current_user,
             'public.resolve_pke_user_by_neon_auth_user_id(uuid)', 'EXECUTE') AS can_resolve_identity
      FROM pg_roles r
     WHERE r.rolname = current_user
  `);
  const row = result.rows[0];
  const failures = [];
  if (!row || row.current_role !== "app_runtime_secure") failures.push("connected role mismatch");
  if (row?.rolsuper) failures.push("SUPERUSER");
  if (row?.rolbypassrls) failures.push("BYPASSRLS");
  if (row?.rolcreatedb) failures.push("CREATEDB");
  if (row?.rolcreaterole) failures.push("CREATEROLE");
  if (row?.has_neon_superuser_membership) failures.push("neon_superuser membership");
  if (!row?.can_resolve_identity) failures.push("identity resolver EXECUTE missing");
  if (failures.length) {
    console.error(`FAIL: runtime role checks: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("PASS: connected as app_runtime_secure; no elevated role flags or neon_superuser membership; identity resolver EXECUTE granted.");
  }
} catch {
  console.error("FAIL: unable to connect or inspect the runtime database role.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
