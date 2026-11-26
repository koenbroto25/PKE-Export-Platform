import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const panel=fs.readFileSync(path.join(root,"frontend/src/CrossProcessDependencyPanel.tsx"),"utf8");
const project360=fs.readFileSync(path.join(root,"frontend/src/PMProject360.tsx"),"utf8");
const styles=fs.readFileSync(path.join(root,"frontend/src/UXFoundation.css"),"utf8");
describe("PM Project 360 dependency panel integration contract",()=>{
 it("fetches only the explicit demo API and labels synthetic/no-live state",()=>{
  expect(panel).toContain("/dependency-summaries?mode=demo");
  expect(panel).toContain("DEMO / SYNTHETIC");
  expect(panel).toContain("Live integration: tidak aktif");
  expect(panel).toContain("live readiness");
 });
 it("receives project scope and role-visible pages from PM Project 360",()=>{
  expect(project360).toContain("<CrossProcessDependencyPanel projectId={projectId} allowedPages={allowedPages} />");
  expect(panel).toContain("allowedPages.includes");
 });
 it("includes loading, error, empty, refresh and status/evidence/action presentation",()=>{
  for(const text of ["UXLoading","UXError","UXEmpty","Refresh","missingEvidenceCount","safeNextAction","freshness","filter","Missing evidence","Evidence checklist"]) expect(panel).toContain(text);
 });
 it("uses role-gated links and provenance banner styling",()=>{
  expect(panel).toContain("canOpen(d.from)");
  expect(panel).toContain("canOpen(d.to)");
  expect(styles).toContain(".ux-dependency-provenance");
 });
});
