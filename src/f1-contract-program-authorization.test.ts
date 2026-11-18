import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX = readFileSync(join(__dirname, "index.ts"), "utf8");

describe("F1 Admin ownership of contract programs and recurring cycle configuration", () => {
  for (const [method, route] of [
    ["post", "/api/v1/contracts"],
    ["post", "/api/v1/contract-programs"],
    ["patch", "/api/v1/contract-programs/:id"],
    ["post", "/api/v1/cycle-policies"],
  ] as const) {
    it(`requires authenticated Admin for ${method.toUpperCase()} ${route}`, () => {
      const marker = `app.${method}("${route}",`;
      const start = INDEX.indexOf(marker);
      expect(start, marker + " should exist").toBeGreaterThanOrEqual(0);
      const signature = INDEX.slice(start, start + 180);
      expect(signature).toMatch(/requireAuth\s*,\s*requireAdmin\s*,\s*async/);
    });
  }

  it("keeps project-scoped reads authenticated without changing RLS semantics", () => {
    expect(INDEX).toContain('app.get("/api/v1/projects", requireAuth');
    expect(INDEX).toContain('app.get("/api/v1/contract-programs", requireAuth');
  });
});
