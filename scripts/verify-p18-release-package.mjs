import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(root,"migration_release_manifest_p18_111.json"),"utf8"));
const item=manifest.migrations?.[0];
const fail=message=>{console.error("FAIL: "+message);process.exitCode=1;};
const migrationPath=path.join(root,"migrations",item?.filename??"");
if(manifest.purpose!=="p18_regulatory_core_candidate_release_exact_sql_hash_owner_approval_required") fail("P18 manifest purpose mismatch.");
if(manifest.project_id!=="purple-base-63944903"||manifest.production_branch_id!=="br-damp-shape-b3xlh4nr"||manifest.database!=="neondb") fail("P18 target mismatch.");
if(manifest.production_starting_history_count!==71||manifest.expected_production_ledger_id!==72) fail("P18 Production ledger baseline mismatch.");
if(manifest.owner_approval?.status!=="pending"||manifest.owner_approval?.required!==true) fail("P18 exact-hash owner approval must remain pending.");
if(manifest.production_application?.applied!==false||manifest.production_application?.status!=="not_applied") fail("P18 candidate must not claim Production application.");
if(!item||item.ledger_id!==72||item.status!=="candidate_pending_owner_approval"||item.production_applied!==false) fail("P18 migration entry status mismatch.");
if(!fs.existsSync(migrationPath)) fail("P18 migration file missing.");
else{
 const sql=fs.readFileSync(migrationPath,"utf8");
 const hash=crypto.createHash("sha256").update(sql).digest("hex");
 if(hash!==item.sha256) fail("P18 migration SHA-256 mismatch.");
 if((sql.match(/^BEGIN;\s*$/gim)||[]).length!==1||(sql.match(/^COMMIT;\s*$/gim)||[]).length!==1) fail("P18 migration must have exactly one atomic transaction wrapper.");
 if(/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) fail("Unexpected destructive DDL found.");
 for(const token of ["pke_project_role_policy(role_code,canonical_role_code,template_version)","regulatory_compliance_officer","GRANT EXECUTE ON FUNCTION public.p18_has_regulatory_permission(text) TO app_runtime_secure","has_function_privilege","p18_has_regulatory_permission","p18_regulatory_sources_insert","p18_regulatory_rules_insert","p18_regulatory_rule_versions_insert","p18_country_requirement_verification_guard","p18_regulatory_assessment_review_guard","p18_regulatory_assessment_result_review_guard","reason_code text"])
   if(!sql.includes(token)) fail("Migration postcondition missing: "+token);
 if((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length!==6) fail("Expected six P18 governance functions.");
 if(/LANGUAGE (plpgsql|sql) AS \$(?!\$)|END \$;/m.test(sql)) fail("Malformed SQL function delimiter.");
}
for(const file of ["src/regulatory-engine.ts","src/regulatory-engine.test.ts","src/p18-regulatory-core.contract.test.ts","frontend/src/RegulatoryCoreWorkspace.tsx"])
 if(!fs.existsSync(path.join(root,file))) fail("P18 implementation artifact missing: "+file);
if(!process.exitCode) console.log("P18 static release package PASS: exact SHA-256, transaction wrapper, no destructive table operations, governance guards, and approval/application state verified. Database application remains intentionally gated.");
