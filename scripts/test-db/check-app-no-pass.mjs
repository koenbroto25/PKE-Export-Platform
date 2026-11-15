import pg from 'pg';

const cs = 'postgres://app_runtime_secure@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  console.log('Connected as app_runtime_secure (no password)');
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  console.log('Tables:', tables.rows.length);
} finally {
  await client.end().catch(() => {});
}