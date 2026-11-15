import pg from 'pg';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  // List tables
  const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));
  
  if (tables.rows.length > 0) {
    // Check RLS on truck_trips
    const { rows: rlsStatus } = await client.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'truck_trips'");
    console.log('truck_trips RLS:', rlsStatus.rows[0] || 'NOT FOUND');
  
    // Check policies
    const { rows: policies } = await client.query("SELECT polname, pg_get_expr(polqual, polrelid) as using_expr FROM pg_policy pol JOIN pg_class rel ON rel.oid = pol.polrelid WHERE rel.relname = 'truck_trips'");
    console.log('truck_trips policies:');
    for (const p of policies.rows) {
      console.log('  ', p.polname, '->', p.using_expr);
    }
  
    // Check function security
    const { rows: funcs } = await client.query("SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'pke_has_%'");
    console.log('Function security:');
    for (const f of funcs.rows) {
      console.log('  ', f.proname, 'security_definer=', f.prsecdef);
    }
  
    // Set context as User A
    await client.query("SELECT set_config('app.current_user_id', $1::text, false)", ['26a871be-7f74-4fa6-93fb-9f57eb842f4b']);
    await client.query("SELECT set_config('app.current_role', $1::text, false)", ['field_manager']);
  
    // Get project IDs
    const { rows: projects } = await client.query("SELECT id, name FROM public.projects WHERE name IN ('Project A', 'Project B')");
    const projA = projects.find(p => p.name === 'Project A').id;
    const projB = projects.find(p => p.name === 'Project B').id;
    console.log('Project A id:', projA);
    console.log('Project B id:', projB);
  
    // Test pke_has_project_permission
    const { rows: permA } = await client.query("SELECT pke_has_project_permission($1::uuid, 'logistics.view') as can_view", [projA]);
    console.log('pke_has_project_permission(ProjectA, logistics.view):', permA.rows[0].can_view);
  
    const { rows: permB } = await client.query("SELECT pke_has_project_permission($1::uuid, 'logistics.view') as can_view", [projB]);
    console.log('pke_has_project_permission(ProjectB, logistics.view):', permB.rows[0].can_view);
  
    // Check what truck_trips RLS returns
    const { rows: trips } = await client.query("SELECT id, project_id FROM truck_trips ORDER BY created_at DESC");
    console.log('All truck_trips visible to User A:');
    for (const t of trips) {
      console.log('  Trip', t.id, '-> Project', t.project_id);
    }
  }
  
} finally {
  await client.end().catch(() => {});
}