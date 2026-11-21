import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const expected = Object.freeze({
  "058_p1_domain_workflow_foundation.sql": "7ba30806002c8123da1a9795053208362c21e49777c3cd83702b50176d3903fd",
  "059_p1_workflow_independence_and_audit_scope.sql": "72b3ba0514fe3e7d2a9153cca20c1f36dabff313f96a28a161f0697b04e22c88",
  "060_p1_cross_functional_read_surfaces.sql": "2f9cfe08fca665886e760b2711729612b64fa3d0489ce3c2bed8e22e4099dc63",
  "061_p1_document_integrity_metadata.sql": "c37fafa664b6327747e6d1629128788eca33067c382aff73ee328b39418314bc",
  "062_p1_owner_action_and_delegated_verification.sql": "6a129b85914963831d7113a35e2fa9ee040da3ba19cf3744b2d231e9b66542eb",
  "063_p1_rls_permission_function_grant.sql": "9dfce8a8df62ecd823d60af38fe5b0473c5ffffa615772445a732dddaa165f0d",
  "064_p1_managed_record_read_scope.sql": "838f078d8ed116495ea2fe7b9e98541e1900bf01210e2eeac86b01bd7ecfd108",
  "065_p1_quality_chain_project_context.sql": "eb433cd269cfc436166844ee247cfc5eac0b34fe2184a8a0a5553f1f42c69852"
});

function fail(message) {
  console.error(`P1 UAT RELEASE POLICY BLOCKED: ${message}`);
  process.exit(1);
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const migrationsDir = path.join(root, "migrations");
for (const [file, expectedSha] of Object.entries(expected)) {
  const fullPath = path.join(migrationsDir, file);
  if (!fs.existsSync(fullPath)) fail(`required UAT migration missing: ${file}`);
  const actual = sha256(fullPath);
  if (actual !== expectedSha) fail(`UAT migration checksum mismatch: ${file} (expected ${expectedSha}, got ${actual})`);
}

const manifestPath = path.join(root, "migration_history_manifest_001_052.json");
if (!fs.existsSync(manifestPath)) fail("Production history manifest 001-052 is missing.");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.applied_count !== 52 || manifest.entries?.length !== 52) {
  fail("Production history manifest must remain the verified 001-052 baseline; P1 UAT migrations must not be added.");
}
if (manifest.entries.some((entry) => Number(entry.id) >= 58 || /^0(5[8-9]|6[0-5])_/.test(entry.filename))) {
  fail("P1 UAT migrations must never be included in the Production migration manifest.");
}

const runnerPath = path.join(root, "scripts", "migrate.mjs");
const runner = fs.readFileSync(runnerPath, "utf8");
if (!runner.includes("P1_UAT_ONLY_START = 58") ||
    !runner.includes("P1 migrations are UAT-only") ||
    !runner.includes('["apply", "baseline"].includes(mode)')) {
  fail("generic migration runner is missing its explicit P1 UAT-only mutation guard.");
}

console.log("PASS: P1 migrations 058-065 match the exact UAT-applied SHA-256 pins.");
console.log("PASS: Production migration manifest remains unchanged at 001-052.");
console.log("PASS: generic migration apply/baseline explicitly refuses P1 UAT-only migrations.");
