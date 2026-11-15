import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  const result = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  console.log('Result:', result);
  console.log('Result type:', typeof result);
  console.log('Rows:', result.rows);
  console.log('Rows length:', result.rows ? result.rows.length : 'undefined');
  
  const countResult = await client.query("SELECT count(*) as cnt FROM pg_tables WHERE schemaname = 'public'");
  console.log('Count:', countResult.rows[0].cnt);
  
} finally {
  await client.end().catch(() => {});
}