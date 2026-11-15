import pg from 'pg';
import { assertLocalResetAllowed } from './preflight.mjs';

const adminCs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/postgres';
const testCs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
assertLocalResetAllowed(testCs, process.env);

const fs = await import('fs');
const sql = fs.readFileSync('D:\\PKE\\scripts\\test-db\\init-schema.sql', 'utf8');

const adminClient = new pg.Client({ connectionString: adminCs, connectionTimeoutMillis: 30000 });
try {
  await adminClient.connect();
  await adminClient.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'pke_test' AND pid <> pg_backend_pid()");
  await adminClient.query("DROP DATABASE IF EXISTS pke_test");
  await adminClient.query("CREATE DATABASE pke_test");
  console.log('Database pke_test recreated');
} finally {
  await adminClient.end().catch(() => {});
}

const testClient = new pg.Client({ connectionString: testCs, connectionTimeoutMillis: 30000 });
try {
  await testClient.connect();
  await testClient.query(sql);
  console.log('Schema initialized');

  // Check tables
  const { rows: tables } = await testClient.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));

  // Check RLS on truck_trips
  const { rows: rls } = await testClient.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'truck_trips'");
  console.log('truck_trips RLS:', rls.rows[0] || 'NOT FOUND');

  // Set context as User A
  await testClient.query("SELECT set_config('app.current_user_id', $1::text, false)", ['26a871be-7f74-4fa6-93fb-9f57eb842f4b']);
  await testClient.query("SELECT set_config('app.current_role', $1::text, false)", ['field_manager']);

  // Get project IDs
  const { rows: projects } = await testClient.query("SELECT id, name FROM public.projects WHERE name IN ('Project A', 'Project B')");
  const projA = projects.find(p => p.name === 'Project A').id;
  const projB = projects.find(p => p.name === 'Project B').id;
  console.log('Project A id:', projA);
  console.log('Project B id:', projB);

  // Test pke_has_project_permission
  const { rows: permA } = await testClient.query("SELECT pke_has_project_permission($1::uuid, 'logistics.view') as can_view", [projA]);
  console.log('pke_has_project_permission(ProjectA, logistics.view):', permA.rows[0].can_view);

  const { rows: permB } = await testClient.query("SELECT pke_has_project_permission($1::uuid, 'logistics.view') as can_view", [projB]);
  console.log('pke_has_project_permission(ProjectB, logistics.view):', permB.rows[0].can_view);

  // Check what truck_trips RLS returns
  const { rows: trips } = await testClient.query("SELECT id, project_id FROM truck_trips ORDER BY created_at DESC");
  console.log('All truck_trips visible to User A:');
  for (const t of trips) {
    console.log('  Trip', t.id, '-> Project', t.project_id);
  }

} finally {
  await testClient.end().catch(() => {});
}