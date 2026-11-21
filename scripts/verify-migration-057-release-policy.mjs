import crypto from "node:crypto";
import fs from "node:fs";
const sql = fs.readFileSync("migrations/057_restrict_project_context_read_surface.sql");
const expected = "806b649e49180d7f6b8e5984324d7b8981d3fd6c84ebdf4fbee6da0b27067ae9";
const actual = crypto.createHash("sha256").update(sql).digest("hex");
const fail = (message) => { console.error("FAIL: " + message); process.exitCode = 1; };
if (actual !== expected) fail("Migration 057 SHA-256 mismatch.");
const source = sql.toString("utf8");
if (!/^--[^\n]*\nBEGIN;/.test(source) || !/COMMIT;\s*$/.test(source)) fail("Migration 057 must be explicitly transactional.");
for (const token of ["pke_project_roles_select", "project.roles.manage", "pke_project_versions_select", "project.change.view"]) {
  if (!source.includes(token)) fail("Missing Migration 057 control: " + token);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("PASS: Migration 057 SHA-256 and least-privilege Project read-surface controls verified.");
