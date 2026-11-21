import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../migrations/066_p1_work_item_sync_and_kpi_scope.sql",import.meta.url),"utf8");
const manifest=JSON.parse(readFileSync(new URL("../migration_history_manifest_001_052.json",import.meta.url),"utf8"));
const runner=readFileSync(new URL("../scripts/migrate.mjs",import.meta.url),"utf8");

describe("Migration 066 P1 UAT work-item synchronization",()=>{
  it("matches the exact UAT-applied SHA-256 pin",()=>{
    expect(createHash("sha256").update(migration).digest("hex")).toBe("76b19520116f26525379f694a95d2081f2d62721f7b07625d0507ac07a29bce4");
  });
  it("resolves role membership through a narrowly granted SECURITY DEFINER helper",()=>{
    expect(migration).toContain("p1_has_active_project_role_assignment");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.p1_has_active_project_role_assignment");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.p1_has_active_project_role_assignment");
  });
  it("creates one deduplicated task and version-keyed task event per P1 source record",()=>{
    expect(migration).toContain("'p1-domain:'||NEW.id::text");
    expect(migration).toContain("project_work_item_events_source_event_key_uq");
    expect(migration).toContain("'p1:'||NEW.id::text||':'||NEW.version::text");
    expect(migration).toContain("ON CONFLICT (project_id,source_event_key)");
  });
  it("keeps task sync UAT-only and leaves Production manifest unchanged",()=>{
    expect(manifest.applied_count).toBe(52);
    expect(manifest.entries.some((entry:any)=>entry.filename.startsWith("066_"))).toBe(false);
    expect(runner).toContain("P1 migrations are UAT-only");
  });
});
