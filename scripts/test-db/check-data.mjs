import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: 'D:\\PKE\\.env.test.local' });
const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  const tables = ['users', 'projects', 'transport_legs', 'truck_trips', 'role_catalog', 'permissions', 'role_permissions', 'project_members'];
  for (const t of tables) {
    const { rows } = await client.query('SELECT * FROM ' + t + ' LIMIT 5');
    console.log('\n=== ' + t + ' (' + rows.length + ' rows) ===');
    for (const r of rows) {
      console.log(JSON.stringify(r));
    }
  }
} finally {
  await client.end().catch(() => {});
}