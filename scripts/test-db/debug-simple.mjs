import pg from 'pg';
import { assertLocalResetAllowed } from './preflight.mjs';

const adminCs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/postgres';
const testCs = 'postgres://pke_test_runtime:changeme-in-env-file@127.0.0.1:54331/pke_test';
assertLocalResetAllowed(testCs, process.env);

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
  
  // Enable pgcrypto
  await testClient.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  console.log('pgcrypto enabled');
  
  // Create users table first
  await testClient.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      name text,
      role text NOT NULL DEFAULT 'viewer'::user_role,
      mfa_enabled boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      neon_auth_user_id uuid UNIQUE
    );
  `);
  console.log('users table created');
  
  // Check what tables exist
  const { rows: tables } = await testClient.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log('Tables:', tables.rows.map(r => r.tablename).join(', '));
  
} finally {
  await testClient.end().catch(() => {});
}