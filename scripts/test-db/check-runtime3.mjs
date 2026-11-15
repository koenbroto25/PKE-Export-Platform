import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  const result = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Result type:', typeof result);
  console.log('Result keys:', Object.keys(result));
  console.log('Result.rows:', result.rows);
  console.log('Result.rowCount:', result.rowCount);
  
} finally {
  await client.end().catch(() => {});
}