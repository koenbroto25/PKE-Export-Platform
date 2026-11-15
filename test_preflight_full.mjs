// Full preflight with database proof
import dotenv from "dotenv";
// Don't load .env to avoid conflicts - set vars explicitly
dotenv.config(); // still load, but we'll override

// Set DATABASE_URL explicitly - the approved production URL
process.env.DATABASE_URL = "postgresql://app_runtime_secure:npg_GicXeOo5mf3r@ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

import { runPreflight } from "./scripts/test-db/preflight.mjs";

const result = await runPreflight({
  skipDbProof: false,
  timeoutMs: 15000
});

console.log("Preflight result:", JSON.stringify(result, null, 2));

if (result.ok) {
  console.log("\nPASS: Full preflight OK");
  const f = result.db && result.db.facts ? result.db.facts : null;
  if (f) {
    console.log(`DB proof: database=${f.current_database} user=${f.current_user} server_port=${f.server_port ?? ""}`);
    console.log(`rolsuper=${f.rolsuper} rolbypassrls=${f.rolbypassrls} rolcreatedb=${f.rolcreatedb} rolcreaterole=${f.rolcreaterole}`);
  }
} else {
  console.log("\nFAIL: Full preflight failed");
  console.log(`Blocked at stage: ${result.stage}`);
  for (const p of result.problems) {
    console.log(`- [${p.code}] ${p.message}`);
  }
}