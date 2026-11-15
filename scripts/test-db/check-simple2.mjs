import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  const result = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log("RESULT_TYPE:", typeof result);
  console.log("RESULT_KEYS:", Object.keys(result));
  console.log("RESULT_ROWS:", JSON.stringify(result.rows));
  console.log("ROW_COUNT:", result.rowCount);
} finally {
  await client.end().catch(() => {});
}