import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, "migrations/049_project_work_item_task_engine.sql"), "utf8");
const api = fs.readFileSync(path.join(root, "src/index.ts"), "utf8");
const ui = fs.readFileSync(path.join(root, "frontend/src/App.tsx"), "utf8");
const roles = fs.readFileSync(path.join(root, "src/role-catalogue.ts"), "utf8");
const schema = fs.readFileSync(path.join(root, "src/schema.ts"), "utf8");
const runner = fs.readFileSync(path.join(root, "scripts/migrate.mjs"), "utf8");

describe("Project work item task engine contract", () => {
  it("creates Project-scoped work items and append-only events under forced RLS", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.project_work_items");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.project_work_item_events");
    expect(migration).toContain("ALTER TABLE public.project_work_items FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.project_work_item_events FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE DELETE ON public.project_work_items FROM app_runtime_secure");
    expect(migration).toContain("REVOKE UPDATE, DELETE ON public.project_work_item_events FROM app_runtime_secure");
  });

  it("limits Project-wide task governance permissions to the PM role template", () => {
    for (const permission of ["project.tasks.view","project.tasks.create","project.tasks.assign","project.tasks.update","project.tasks.resolve","project.tasks.escalate"]) {
      expect(migration).toContain(permission);
      expect(roles).toContain(permission);
    }
    expect(migration).toContain("WHERE pr.role_code = 'pm'");
  });

  it("allows task visibility only to PM, explicit assignee or active assigned role", () => {
    expect(migration).toContain("public.pke_has_project_permission(project_id, 'project.tasks.view')");
    expect(migration).toContain("assignee_user_id = public.pke_current_user_id()");
    expect(migration).toContain("public.pke_user_has_active_project_role(project_id, owner_role_code)");
    expect(migration).toContain("(assignee_user_id IS NULL OR assignee_user_id = public.pke_current_user_id())");
  });

  it("requires an active Project role and matching assignee when creating or reassigning work", () => {
    expect(api).toContain('app.post("/api/v1/projects/:projectId/work-items"');
    expect(api).toContain('requireProjectPermission(req, res, projectId, "project.tasks.create")');
    expect(api).toContain("ROLE_HAS_NO_ACTIVE_ASSIGNEE");
    expect(api).toContain("ASSIGNEE_ROLE_MISMATCH");
    expect(api).toContain("ownerRoleCode and reassignment reason are required.");
    expect(api).toContain('app.patch("/api/v1/projects/:projectId/work-items/:id"');
  });

  it("enforces acknowledgement, start, block, submit, resolve, close and escalation transitions", () => {
    for (const state of ["acknowledged","in_progress","blocked","submitted","resolved","closed","escalated","reopened","cancelled","commented"]) {
      expect(migration).toContain("'" + state + "'");
      expect(api).toContain('"' + state + '"');
    }
    expect(api).toContain("Only submitted tasks can be resolved by PM.");
    expect(api).toContain("Operational status transitions must be performed by the assigned active role/user.");
    expect(ui).toContain("const isTaskOwner = (task: AnyRecord)");
    expect(ui).toContain("isTaskOwner(task) && <ActionButton");
    expect(api).toContain("An escalation reason is required");
    expect(api).toContain('action === "block" ? "blocked"');
    expect(api).toContain('action === "submit" ? "submitted"');
    expect(api).toContain('action === "resolve" ? "resolved"');
    expect(api).toContain('action === "close" ? "closed"');
  });

  it("links task assignment notifications back to the task and PM escalation recipient", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS work_item_id uuid");
    expect(migration).toContain("public.pke_has_project_permission(project_id, 'project.tasks.resolve')");
    expect(migration).toContain("pke_user_has_active_project_role(wi.project_id, wi.owner_role_code)");
    expect(api).toContain("work_item_id,recipient_user_id");
    expect(api).toContain("recordedEvent.rows[0].id");
    expect(api).toContain("createdEvent.rows[0].id");
    expect(api).toContain('["assign","escalate","submit","block","resolve","close"].includes(action)');
    expect(api).toContain("Tugas menunggu review PM: ");
    expect(api).toContain("Tugas terblokir: ");
    expect(api).toContain('eventType === "checkpoint" ? "verify_checkpoints"');
    expect(migration).toContain("event_type = 'checkpoint' AND public.pke_has_truck_trip_permission(truck_trip_id, 'verify_checkpoints')");
    expect(api).toContain('const targetRole = notifyPm ? "pm" : roleCode');
    expect(api).toContain("work_item_id, recipient_user_id");
    expect(schema).toContain('work_item_id: uuid("work_item_id")');
    expect(schema).toContain('pgTable("project_work_items"');
    expect(schema).toContain('pgTable("project_work_item_events"');
  });

  it("builds PM readiness gates only from source-backed Project endpoints", () => {
    expect(ui).toContain("Kesiapan Project · sumber data");
    expect(ui).toContain("get(`/contract-programs?projectId=");
    expect(ui).toContain("get(`/inventory-lots?projectId=");
    expect(ui).toContain("get(`/projects/${encodeURIComponent(projectId)}/document-requirements");
    expect(ui).toContain("get(`/reports/project/${encodeURIComponent(projectId)}");
    expect(ui).toContain("Production & QA release");
    expect(ui).toContain("Vessel, loading & laytime");
    expect(ui).toContain("LC discrepancy & presentation");
    expect(ui).toContain("Belum terintegrasi");
  });

  it("exposes My Work and PM task roll-up without granting source transaction permissions", () => {
    expect(ui).toContain('path="/my-work"');
    expect(ui).toContain("function MyWorkPage");
    expect(ui).toContain("PM Control Tower · Tindak lanjut");
    expect(ui).toContain('hasProjectPermission("project.tasks.resolve", activeUser)');
    const taskWorkspace = ui.slice(ui.indexOf("function MyWorkPage"), ui.indexOf("function NotificationsPage"));
    expect(taskWorkspace).not.toContain("finance.update");
  });
  it("pins the final task migration checksum and rejects malformed PostgreSQL DO quoting", () => {
    expect(migration).toContain("DO $\nBEGIN");
    expect(migration).toContain("END $$;");
    expect(migration).not.toContain("DO $\nBEGIN");
    expect(runner).toContain('const approved048Sha = "48eea58270848cc90945cf42972f1a01216e66bb1f6b90c56204b47e877bcdc3";');
    expect(runner).toContain('const approved049Sha = "f61edb6ee54d7294a13cfd0a7319c4dee03299f718a3efdb6805081a50df2780";');
    expect(runner).toContain("MIGRATE_048_CONFIRM");
    expect(runner).toContain("MIGRATE_049_CONFIRM");
    expect(runner).toContain("MIGRATION_BACKUP_REFERENCE");
  });

});
