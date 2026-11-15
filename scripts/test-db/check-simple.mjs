import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  console.log('Tables in pke_test:', tables.rows.length);
  for (const t of tables.rows) {
    console.log(' -', t.tablename);
  }
} finally {
  await client.end().catch(() => {});
}