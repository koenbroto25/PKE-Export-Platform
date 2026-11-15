import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  console.log('Connected successfully');
  
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('tables.rows:', tables.rows);
  console.log('Number of tables:', tables.rows ? tables.rows.length : 'null/undefined');
  
  if (tables.rows && tables.rows.length > 0) {
    console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));
  }
  
} finally {
  await client.end().catch(() => {});
}