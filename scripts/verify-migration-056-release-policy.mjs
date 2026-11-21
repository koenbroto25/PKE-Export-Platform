import crypto from "node:crypto";
import fs from "node:fs";
const sql = fs.readFileSync("migrations/056_project_context_and_funder_report_shares.sql");
const expected = "8cfb54c6c9dc728f2ae71975826ad8e589fabb82ee3cd634c3f6672abcd8ecc7";
const actual = crypto.createHash("sha256").update(sql).digest("hex");
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };
if (actual !== expected) fail("Migration 056 SHA-256 mismatch.");
const source = sql.toString("utf8");
if (!/^--[^\n]*\nBEGIN;/.test(source) || !/COMMIT;\s*$/.test(source)) fail("Migration 056 must be explicitly transactional.");
for (const token of [
  "('finance','project.view'),('accounting','project.view')",
  "('funder','project.view'),('funder','funder.view')",
  "CREATE TABLE IF NOT EXISTS public.project_funder_report_shares",
  "CREATE POLICY pke_report_runs_funder_shared_select",
  "rr.status = 'completed'",
  "pr.role_code = 'funder'",
]) if (!source.includes(token)) fail("Missing Migration 056 control: " + token);
if (process.exitCode) process.exit(process.exitCode);
console.log("PASS: Migration 056 SHA-256, Project context grants and explicit Funder sharing controls verified.");
console.log("NOTICE: static verification does not apply SQL or certify runtime UAT.");
