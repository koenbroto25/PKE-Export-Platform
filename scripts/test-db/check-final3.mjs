import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables:', tables.rows.length);
  
  const { rows: users } = await client.query("SELECT id, email, role FROM users");
  console.log('Users:', users.rows.map(u => u.email + ' (' + u.role + ')').join(', ') || '(none)');
  
  const { rows: projects } = await client.query("SELECT id, name FROM projects");
  console.log('Projects:', projects.rows.map(p => p.name + ' (' + p.id + ')').join(', ') || '(none)');
  
} finally {
  await client.end().catch(() => {});
}