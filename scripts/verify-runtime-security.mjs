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
    WITH owner_role AS (
      SELECT oid FROM pg_roles WHERE rolname = 'neondb_owner'
    ),
    auth_role AS (
      SELECT oid FROM pg_roles WHERE rolname = 'authenticated'
    ),
    function_acl AS (
      SELECT p.oid, p.prorettype,
             COALESCE(p.proacl, acldefault('f', p.proowner)) AS acl
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prosecdef = true
    ),
    default_acl AS (
      SELECT d.defaclnamespace, a.grantee, a.privilege_type
        FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       WHERE d.defaclrole = (SELECT oid FROM owner_role)
         AND d.defaclobjtype = 'f'
         AND d.defaclnamespace IN (0, 'public'::regnamespace)
    )
    SELECT current_user AS current_role,
           r.rolsuper,
           r.rolbypassrls,
           r.rolcreatedb,
           r.rolcreaterole,
           pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
           has_function_privilege(current_user,
             'public.resolve_pke_user_by_neon_auth_user_id(uuid)', 'EXECUTE') AS can_resolve_identity,
           (SELECT count(*) FROM function_acl f
             CROSS JOIN LATERAL aclexplode(f.acl) a
            WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_security_definer_execute_count,
           (SELECT count(*) FROM function_acl f
             CROSS JOIN LATERAL aclexplode(f.acl) a
            WHERE a.grantee = (SELECT oid FROM auth_role)
              AND a.privilege_type = 'EXECUTE') AS authenticated_security_definer_execute_count,
           (SELECT count(*) FROM function_acl f
            WHERE f.prorettype <> 'trigger'::regtype
              AND NOT has_function_privilege(current_user, f.oid, 'EXECUTE')) AS missing_runtime_callable_execute_count,
           (SELECT count(*)
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
               AND (
                 has_table_privilege('authenticated', c.oid, 'SELECT')
                 OR has_table_privilege('authenticated', c.oid, 'INSERT')
                 OR has_table_privilege('authenticated', c.oid, 'UPDATE')
                 OR has_table_privilege('authenticated', c.oid, 'DELETE')
                 OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
                 OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
                 OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
               )) AS authenticated_public_relation_privilege_count,
           (SELECT count(*)
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relkind = 'S'
               AND (
                 has_sequence_privilege('authenticated', c.oid, 'USAGE')
                 OR has_sequence_privilege('authenticated', c.oid, 'SELECT')
                 OR has_sequence_privilege('authenticated', c.oid, 'UPDATE')
               )) AS authenticated_public_sequence_privilege_count,
           (SELECT count(*)
              FROM pg_default_acl d
              CROSS JOIN LATERAL aclexplode(d.defaclacl) a
             WHERE d.defaclrole = (SELECT oid FROM owner_role)
               AND d.defaclnamespace = 'public'::regnamespace
               AND d.defaclobjtype IN ('r', 'S')
               AND a.grantee = (SELECT oid FROM auth_role)) AS unsafe_authenticated_relation_default_count,
           EXISTS (
             SELECT 1
               FROM aclexplode(COALESCE(
                 (SELECT d.defaclacl FROM pg_default_acl d
                   WHERE d.defaclrole = (SELECT oid FROM owner_role)
                     AND d.defaclobjtype = 'f' AND d.defaclnamespace = 0),
                 acldefault('f', (SELECT oid FROM owner_role))
               )) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
           ) AS unsafe_global_public_function_default,
           EXISTS (
             SELECT 1 FROM default_acl d
              WHERE d.defaclnamespace = 'public'::regnamespace
                AND d.grantee = (SELECT oid FROM auth_role)
                AND d.privilege_type = 'EXECUTE'
           ) AS unsafe_public_schema_authenticated_function_default
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
  if (Number(row?.public_security_definer_execute_count) > 0) failures.push("PUBLIC can execute SECURITY DEFINER functions");
  if (Number(row?.authenticated_security_definer_execute_count) > 0) failures.push("authenticated can execute internal SECURITY DEFINER functions");
  if (Number(row?.missing_runtime_callable_execute_count) > 0) failures.push("runtime EXECUTE missing on callable SECURITY DEFINER helpers");
  if (row?.unsafe_global_public_function_default) failures.push("global default PUBLIC EXECUTE remains enabled");
  if (row?.unsafe_public_schema_authenticated_function_default) failures.push("public-schema default EXECUTE to authenticated remains enabled");
  if (Number(row?.authenticated_public_relation_privilege_count) > 0) failures.push("authenticated retains direct privileges on public relations");
  if (Number(row?.authenticated_public_sequence_privilege_count) > 0) failures.push("authenticated retains direct privileges on public sequences");
  if (Number(row?.unsafe_authenticated_relation_default_count) > 0) failures.push("authenticated public table/sequence default privileges remain");

  if (failures.length) {
    console.error(`FAIL: runtime/database security checks: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("PASS: app_runtime_secure is least-privileged; authenticated has no direct public relation/sequence grants; internal SECURITY DEFINER functions are private; callable helpers are explicitly executable by the runtime; unsafe defaults are disabled.");
  }
} catch {
  console.error("FAIL: unable to connect or inspect runtime database security.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
