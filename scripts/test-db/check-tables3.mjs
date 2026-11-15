import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('tables result type:', typeof tables);
  console.log('tables.rows type:', typeof tables.rows);
  console.log('tables.rows value:', tables.rows);
  
  const result = await client.query("SELECT count(*) as cnt FROM pg_tables WHERE schemaname = 'public'");
  console.log('count result:', result.rows[0]);
  
} finally {
  await client.end().catch(() => {});
}