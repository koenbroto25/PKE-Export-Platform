import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canAccessProjectMembership, canManageContractProgram, isPositiveQuantity } from "./f1-contract-rules.js";

const INDEX = readFileSync(join(__dirname, "index.ts"), "utf8");

describe("F1 Admin ownership of contract programs and project instances", () => {
  for (const [method, route] of [
    ["post", "/api/v1/contracts"],
    ["post", "/api/v1/contract-programs"],
    ["patch", "/api/v1/contract-programs/:id"],
    ["post", "/api/v1/cycle-policies"],
    ["post", "/api/v1/projects"],
  ] as const) {
    it(`requires authenticated Admin for ${method.toUpperCase()} ${route}`, () => {
      const marker = `app.${method}("${route}",`;
      const start = INDEX.indexOf(marker);
      expect(start, marker + " should exist").toBeGreaterThanOrEqual(0);
      const signature = INDEX.slice(start, start + 200);
      expect(signature).toMatch(/requireAuth\\s*,\\s*requireAdmin\\s*,\\s*async/);
    });
  }

  it("allows only active platform Admin to manage the program", () => {
    expect(canManageContractProgram({ isAdmin: true, isActive: true })).toBe(true);
    expect(canManageContractProgram({ isAdmin: true, isActive: false })).toBe(false);
    expect(canManageContractProgram({ isAdmin: false, isActive: true })).toBe(false);
    expect(canManageContractProgram(null)).toBe(false);
  });

  it("accepts only finite positive settlement quantities", () => {
    for (const value of [1, 2500, "125.50"]) expect(isPositiveQuantity(value)).toBe(true);
    for (const value of [0, -1, "-0.01", "", "abc", null, undefined, Infinity, NaN]) expect(isPositiveQuantity(value)).toBe(false);
  });

  it("keeps per-project membership independent while honoring global account status", () => {
    const now = new Date("2026-11-19T00:00:00.000Z");
    const common = { accountActive: true, projectActive: true, membershipActive: true, now };
    expect(canAccessProjectMembership(common)).toBe(true); // Project A
    expect(canAccessProjectMembership({ ...common, membershipActive: false })).toBe(false); // Project B revoked
    expect(canAccessProjectMembership({ ...common, expiresAt: "2026-11-18T23:59:59.000Z" })).toBe(false);
    expect(canAccessProjectMembership({ ...common, accountActive: false })).toBe(false); // global suspension
    expect(canAccessProjectMembership({ ...common, projectActive: false })).toBe(false);
  });

  it("keeps project-scoped reads authenticated", () => {
    expect(INDEX).toContain('app.get("/api/v1/projects", requireAuth');
    expect(INDEX).toContain('app.get("/api/v1/contract-programs", requireAuth');
  });
});
