import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(root,"migration_release_manifest_p18_111.json"),"utf8"));
const [core,lifecycle]=manifest.migrations??[];
const fail=message=>{console.error("FAIL: "+message);process.exitCode=1;};
const verifyAtomic=(item,expectedHash=true)=>{
 const file=path.join(root,"migrations",item?.filename??"");
 if(!item||!fs.existsSync(file)){fail("P18 migration missing: "+item?.filename);return "";}
 const sql=fs.readFileSync(file,"utf8");
 const hash=crypto.createHash("sha256").update(sql).digest("hex");
 console.log("P18 candidate SHA-256 "+item.filename+": "+hash);
 if(expectedHash&&hash!==item.sha256) fail("P18 migration SHA-256 mismatch: "+item.filename);
 if((sql.match(/^BEGIN;\s*$/gim)||[]).length!==1||(sql.match(/^COMMIT;\s*$/gim)||[]).length!==1) fail("P18 migration must have exactly one atomic transaction wrapper: "+item.filename);
 if(/^\s*(DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE)\b/im.test(sql)) fail("Unexpected destructive DDL found: "+item.filename);
 return sql;
};
if(manifest.purpose!=="p18_regulatory_core_staged_migrations_validation_evidence") fail("P18 manifest purpose mismatch.");
if(manifest.project_id!=="purple-base-63944903"||manifest.production_branch_id!=="br-damp-shape-b3xlh4nr"||manifest.database!=="neondb") fail("P18 target mismatch.");
if(manifest.production_starting_history_count!==71||manifest.expected_production_ledger_id!==72) fail("P18 Production ledger baseline mismatch.");
if(manifest.owner_approval?.status!=="approved_for_isolated_validation_only"||manifest.owner_approval?.required!==false||manifest.owner_approval?.approved_sha256!==core?.sha256||manifest.owner_approval?.approval_scope!=="isolated_validation_branch_only"||manifest.owner_approval?.production_application_requires_separate_explicit_approval!==true) fail("P18 Migration 111 isolated-validation approval must match its exact SHA and must not authorize Production.");
if(manifest.production_application?.applied!==false||manifest.production_application?.status!=="not_applied") fail("P18 candidate must not claim Production application.");
if(!core||core.ledger_id!==72||core.status!=="applied_on_isolated_validation_branch"||core.validation_branch_id!=="br-winter-butterfly-b3tnsao9"||core.production_applied!==false) fail("P18 Migration 111 entry status mismatch.");
if(!lifecycle||lifecycle.ledger_id!==73||lifecycle.status!=="applied_on_isolated_validation_branch"||lifecycle.production_applied!==false||lifecycle.source_sha_verified!==true||!/^([0-9a-f]{64})$/.test(lifecycle.sha256??"")||lifecycle.owner_approval?.status!=="approved"||lifecycle.owner_approval?.required!==false||lifecycle.owner_approval?.approved_sha256!==lifecycle.sha256||lifecycle.owner_approval?.approval_scope!=="isolated_validation_branch_only") fail("P18 Migration 112 exact hash or approval state mismatch.");
const coreSql=verifyAtomic(core,true);
const lifecycleSql=verifyAtomic(lifecycle,true);
for(const token of ["pke_project_role_policy(role_code,canonical_role_code,template_version)","regulatory_compliance_officer","GRANT EXECUTE ON FUNCTION public.p18_has_regulatory_permission(text) TO app_runtime_secure","has_function_privilege","p18_has_regulatory_permission","p18_regulatory_sources_insert","p18_regulatory_rules_insert","p18_regulatory_rule_versions_insert","p18_country_requirement_verification_guard","p18_regulatory_assessment_review_guard","p18_regulatory_assessment_result_review_guard","reason_code text"])
 if(!coreSql.includes(token)) fail("Migration 111 postcondition missing: "+token);
if((coreSql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length!==6) fail("Expected six P18 governance functions in Migration 111.");
if(/LANGUAGE (plpgsql|sql) AS \$(?!\$)|END \$;/m.test(coreSql)) fail("Malformed SQL function delimiter in Migration 111.");
for(const token of ["CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_guard()","CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_version_guard()","p18_has_regulatory_permission('regulatory.rule.manage')","OLD.status='under_review' AND NEW.status='rejected'","NEW.approved_by IS NOT DISTINCT FROM OLD.created_by","src.official_url !~* '^https://'"])
 if(!lifecycleSql.includes(token)) fail("Migration 112 postcondition missing: "+token);
for(const file of ["src/regulatory-engine.ts","src/regulatory-engine.test.ts","src/p18-regulatory-core.contract.test.ts","frontend/src/RegulatoryCoreWorkspace.tsx"])
 if(!fs.existsSync(path.join(root,file))) fail("P18 implementation artifact missing: "+file);
if(!process.exitCode) console.log("P18 static package PASS: Migration 111 exact hash and isolated approval; Migration 112 exact hash approved and applied only on isolated validation branch; Production remains separately gated.");
