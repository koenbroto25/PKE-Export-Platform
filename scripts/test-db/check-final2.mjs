import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  // Check roles
  const { rows: roles } = await client.query("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname LIKE '%runtime%' OR rolname = 'pke_test_runtime'");
  console.log('Roles:', roles.rows.map(r => r.rolname + ' (can_login=' + r.rolcanlogin + ')').join(', '));
  
  // Check tables
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables:', tables.rows.length);
  console.log(tables.rows.map(r => r.tablename).join(', '));
  
} finally {
  await client.end().catch(() => {});
}