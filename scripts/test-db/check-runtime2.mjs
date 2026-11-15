import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  // Count tables
  const { rows: t1 } = await client.query("SELECT count(*) as cnt FROM pg_tables WHERE schemaname = 'public'");
  console.log('Table count:', t1.rows[0].cnt);
  
  // List tables
  const { rows: t2 } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  if (t2.rows) {
    console.log('Table names:', t2.rows.map(r => r.tablename).join(', '));
  } else {
    console.log('t2.rows is undefined/null');
    console.log('t2:', JSON.stringify(t2));
  }
  
  // Check roles
  const { rows: r1 } = await client.query("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname LIKE '%runtime%' OR rolname = 'pke_test_runtime'");
  console.log('Roles:', r1.rows.map(r => r.rolname + ' (login=' + r.rolcanlogin + ')').join(', ') || '(none)');
  
} finally {
  await client.end().catch(() => {});
}