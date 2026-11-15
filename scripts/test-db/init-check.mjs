import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import { assertLocalTestOperationAllowed } from './preflight.mjs';

dotenv.config({ path: 'D:\\PKE\\.env.test.local' });
const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
assertLocalTestOperationAllowed(cs, 'init-check schema apply');
const sql = fs.readFileSync('D:\\PKE\\scripts\\test-db\\init-schema.sql', 'utf8');
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  await client.query(sql);
  console.log('SCHEMA INIT COMPLETE');
  
  const { rows: users } = await client.query("SELECT id, email, role FROM users ORDER BY email");
  console.log('Users:');
  for (const u of users.rows) {
    console.log('  ', u.email, '(', u.role, ')');
  }
  
  const { rows: projects } = await client.query("SELECT id, name FROM projects ORDER BY name");
  console.log('Projects:', projects.rows.map(p => p.name + ' (' + p.id + ')').join(', '));
  
} finally {
  await client.end().catch(() => {});
}