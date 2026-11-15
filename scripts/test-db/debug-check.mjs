import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  // Check if any tables exist
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Number of tables:', tables.rows ? tables.rows.length : 0);
  if (tables.rows) {
    console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));
  } else {
    console.log('tables.rows is undefined');
  }
  
  // Check if users table exists
  const { rows: users } = await client.query("SELECT count(*) FROM pg_tables WHERE tablename = 'users'");
  console.log('users table exists:', users.rows[0].count === '1');
  
  // Check RLS on truck_trips
  const { rows: rls } = await client.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'truck_trips'");
  console.log('truck_trips RLS:', rls.rows[0] || 'NOT FOUND');
  
  // Set context as User A
  await client.query("SELECT set_config('app.current_user_id', $1::text, false)", ['26a871be-7f74-4fa6-93fb-9f57eb842f4b']);
  await client.query("SELECT set_config('app.current_role', $1::text, false)", ['field_manager']);
  
  // Get project IDs
  const { rows: projects } = await client.query("SELECT id, name FROM public.projects WHERE name IN ('Project A', 'Project B')");
  console.log('Projects:', projects.rows.map(p => p.name + '=' + p.id).join(', '));
  
} finally {
  await client.end().catch(() => {});
}