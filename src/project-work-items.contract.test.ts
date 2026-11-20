import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, "migrations/049_project_work_item_task_engine.sql"), "utf8");
const api = fs.readFileSync(path.join(root, "src/index.ts"), "utf8");
const ui = fs.readFileSync(path.join(root, "frontend/src/App.tsx"), "utf8");
const roles = fs.readFileSync(path.join(root, "src/role-catalogue.ts"), "utf8");

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
  });

  it("requires an active Project role and matching assignee when creating or reassigning work", () => {
    expect(api).toContain('app.post("/api/v1/projects/:projectId/work-items"');
    expect(api).toContain('requireProjectPermission(req, res, projectId, "project.tasks.create")');
    expect(api).toContain("ROLE_HAS_NO_ACTIVE_ASSIGNEE");
    expect(api).toContain("ASSIGNEE_ROLE_MISMATCH");
    expect(api).toContain('app.patch("/api/v1/projects/:projectId/work-items/:id"');
  });

  it("enforces acknowledgement, start, block, submit, resolve, close and escalation transitions", () => {
    for (const state of ["acknowledged","in_progress","blocked","submitted","resolved","closed","escalated","reopened","cancelled","commented"]) {
      expect(migration).toContain("'" + state + "'");
      expect(api).toContain('"' + state + '"');
    }
    expect(api).toContain("Only submitted tasks can be resolved by PM.");
    expect(api).toContain("An escalation reason is required");
  });

  it("links task assignment notifications back to the task and PM escalation recipient", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS work_item_id uuid");
    expect(migration).toContain("pke_user_has_active_project_role(wi.project_id, wi.owner_role_code)");
    expect(api).toContain("work_item_id,recipient_user_id");
    expect(api).toContain('const targetRole = action === "escalate" ? "pm" : roleCode');
    expect(api).toContain("work_item_id, recipient_user_id");
  });

  it("exposes My Work and PM task roll-up without granting source transaction permissions", () => {
    expect(ui).toContain('path="/my-work"');
    expect(ui).toContain("function MyWorkPage");
    expect(ui).toContain("PM Control Tower · Tindak lanjut");
    expect(ui).toContain('hasProjectPermission("project.tasks.resolve", activeUser)');
    const taskWorkspace = ui.slice(ui.indexOf("function MyWorkPage"), ui.indexOf("function NotificationsPage"));
    expect(taskWorkspace).not.toContain("finance.update");
  });
});
