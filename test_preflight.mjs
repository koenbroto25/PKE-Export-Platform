import dotenv from "dotenv";
dotenv.config();
import { validateSingleBranchDatabaseUrl } from "./scripts/test-db/preflight.mjs";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://app_runtime_secure:npg_GicXeOo5mf3r@ep-odd-resonance-b3zb42fw.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
process.env.DATABASE_URL = DATABASE_URL;

const result = validateSingleBranchDatabaseUrl(DATABASE_URL, process.env);
console.log("Validation result:", JSON.stringify(result, null, 2));

if (result.ok) {
  console.log("PASS: URL validation OK");
} else {
  console.log("FAIL: URL validation failed");
  for (const p of result.problems) {
    console.log(`- [${p.code}] ${p.message}`);
  }
}