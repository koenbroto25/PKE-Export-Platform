import pg from 'pg';
import { assertLocalTestOperationAllowed } from './preflight.mjs';

const cs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
assertLocalTestOperationAllowed(cs, 'fix-role ALTER ROLE');
const client = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 30000 });
try {
  await client.connect();
  
  // Reset app_runtime_secure password
  await client.query("ALTER ROLE app_runtime_secure WITH LOGIN PASSWORD 'app_runtime_secure_test'");
  console.log('Role app_runtime_secure password reset');
  
  // Verify role exists
  const result = await client.query("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'app_runtime_secure'");
  console.log('Role result:', JSON.stringify(result.rows));
  
} finally {
  await client.end().catch(() => {});
}