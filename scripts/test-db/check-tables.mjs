import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Number of tables:', tables.rows ? tables.rows.length : 'null');
  if (tables.rows) {
    console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));
  }
  
  // Check if users table exists
  const { rows: usersCheck } = await client.query("SELECT count(*) as cnt FROM pg_tables WHERE tablename = 'users'");
  console.log('users table exists:', usersCheck.rows[0].cnt === '1');
  
} finally {
  await client.end().catch(() => {});
}