import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import { hasPageAccess, hasProjectPermission, visiblePageKeys } from "../frontend/src/role-permissions.js";
const migration=fs.readFileSync("migrations/054_complete_project_permission_boundary.sql","utf8");
const api=fs.readFileSync("src/index.ts","utf8");
const frontend=fs.readFileSync("frontend/src/role-permissions.ts","utf8");
describe("P0 permission boundary contract",()=>{
 it("pins the exact Migration 054 SHA-256",()=>{const digest=crypto.createHash("sha256").update(fs.readFileSync("migrations/054_complete_project_permission_boundary.sql")).digest("hex");expect(digest).toBe("9c1546ad4dfe785b07a590f80e0a6ae0c95930cd955f9c6b56b8fef188144380");});
 it("seeds canonical allowlists and blocks non-canonical grants",()=>{expect(migration).toContain("pke_project_role_policy");expect(migration).toContain("pke_project_role_permission_allowlist");expect(migration).toContain("pke_guard_project_role_permission_allowlist");expect(migration).toContain("Permission % is not allowed for Project role %.");expect(migration).toContain("DELETE FROM public.project_role_permissions");});
 it("removes Platform Admin wildcard and non-governance RLS bypasses",()=>{expect(migration).toContain("ARRAY[]::text[]");expect(migration).toContain("replace(p.using_expr,'pke_is_platform_admin()','false')");expect(migration).toContain("Platform Admin RLS bypass remains");});
 it("removes project permission bypass in API and frontend",()=>{const start=api.indexOf("async function requireProjectPermission"),end=api.indexOf("async function findExplicitProjectPermission",start);expect(api.slice(start,end)).not.toContain("req.user?.isAdmin");expect(api).not.toContain("SELECT code FROM permissions WHERE is_active = true ORDER BY code");expect(frontend).not.toContain("if (user.platformAdmin === true) return true;");});
 it("keeps Platform Admin on governance Projects page but denies Project business pages",()=>{const admin={platformAdmin:true,selectedProjectId:"p1",projectPermissions:[],projectMemberships:[]};expect(hasProjectPermission("finance.view",admin)).toBe(false);expect(hasPageAccess("projects",admin)).toBe(true);expect(hasPageAccess("dashboard",admin)).toBe(false);expect(hasPageAccess("finance",admin)).toBe(false);expect(hasPageAccess("reports",admin)).toBe(false);expect(visiblePageKeys(admin)).toEqual(expect.arrayContaining(["projects","notifications"]));expect(visiblePageKeys(admin)).not.toContain("finance");});
});
