// Test preflight with explicit DATABASE_URL (no dotenv)
import { validateSingleBranchDatabaseUrl } from "./scripts/test-db/preflight.mjs";

// Set DATABASE_URL explicitly - the approved production URL
const DATABASE_URL = "postgresql://app_runtime_secure:npg_GicXeOo5mf3r@ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const result = validateSingleBranchDatabaseUrl(DATABASE_URL, {});
console.log("Validation result:", JSON.stringify(result, null, 2));

if (result.ok) {
  console.log("\nPASS: URL validation OK");
} else {
  console.log("\nFAIL: URL validation failed");
  for (const p of result.problems) {
    console.log(`- [${p.code}] ${p.message}`);
  }
}