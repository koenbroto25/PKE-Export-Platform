import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  const { rows } = await client.query("SELECT id, email, role FROM users ORDER BY email");
  console.log('Users count:', users.rows.length);
  for (const r of users.rows) {
    console.log('  ', r.email, '(', r.role, ')');
  }
} finally {
  await client.end().catch(() => {});
}