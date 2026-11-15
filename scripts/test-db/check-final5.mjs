import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  const result = await client.query("SELECT id, email, role FROM users ORDER BY email");
  console.log('Users count:', result.rows.length);
  for (const row of result.rows) {
    console.log('  ', row.email, '(', row.role, ')');
  }
  
  const projects = await client.query("SELECT id, name FROM projects ORDER BY name");
  console.log('Projects:', projects.rows.map(p => p.name + ' (' + p.id + ')').join(', '));
  
} finally {
  await client.end().catch(() => {});
}