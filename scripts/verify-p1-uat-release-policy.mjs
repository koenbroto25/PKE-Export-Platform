import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const expected = new Map([
  ["058_p1_domain_workflow_foundation.sql","7ba30806002c8123da1a9795053208362c21e49777c3cd83702b50176d3903fd"],
  ["059_p1_workflow_independence_and_audit_scope.sql","72b3ba0514fe3e7d2a9153cca20c1f36dabff313f96a28a161f0697b04e22c88"],
  ["060_p1_cross_functional_read_surfaces.sql","2f9cfe08fca665886e760b2711729612b64fa3d0489ce3c2bed8e22e4099dc63"],
  ["061_p1_document_integrity_metadata.sql","c37fafa664b6327747e6d1629128788eca33067c382aff73ee328b39418314bc"],
  ["062_p1_owner_action_and_delegated_verification.sql","6a129b85914963831d7113a35e2fa9ee040da3ba19cf3744b2d231e9b66542eb"],
]);
for (const [name,sha] of expected) {
  const bytes=readFileSync(join(process.cwd(),"migrations",name));
  const actual=createHash("sha256").update(bytes).digest("hex");
  if(actual!==sha) throw new Error(`P1 migration SHA mismatch for ${name}: ${actual}`);
}
const productionManifest=readFileSync(join(process.cwd(),"migration_history_manifest_001_052.json"),"utf8");
for(const name of expected.keys()) if(productionManifest.includes(name)) throw new Error(`UAT P1 migration ${name} must not enter the Production baseline manifest.`);
const runner=readFileSync(join(process.cwd(),"scripts/migrate.mjs"),"utf8");
if(!runner.includes("migration_history_manifest_001_052.json")) throw new Error("Production migration runner is no longer pinned to the approved baseline manifest.");
console.log(`P1 UAT release policy PASS: ${expected.size} exact migration hashes; Production baseline manifest unchanged.`);
