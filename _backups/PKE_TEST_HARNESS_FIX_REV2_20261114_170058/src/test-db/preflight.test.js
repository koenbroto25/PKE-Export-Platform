import { describe, it, expect } from "vitest";
import { validateDatabaseUrl } from "../../scripts/test-db/preflight.mjs";
describe("LOCAL_TEST_DATABASE_URL preflight validation", () => {
    it("accepts a valid local test database URL", () => {
        const problems = validateDatabaseUrl("postgres://app_runtime_secure:app_runtime_secure_test@127.0.0.1:54331/pke_test");
        expect(problems).toEqual([]);
    });
    it("accepts localhost hostname", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@localhost:54331/pke_test");
        expect(problems).toEqual([]);
    });
    it("accepts ::1 hostname", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@[::1]:54331/pke_test");
        expect(problems).toEqual([]);
    });
    it("rejects missing URL", () => {
        const problems = validateDatabaseUrl("");
        expect(problems.length).toBeGreaterThan(0);
        expect(problems[0]).toContain("not set");
    });
    it("rejects undefined URL", () => {
        const problems = validateDatabaseUrl(undefined);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems[0]).toContain("not set");
    });
    it("rejects Neon hostname", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@ep-restless-hat-b35j9x0d-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb");
        expect(problems.length).toBeGreaterThan(0);
        expect(problems.some((p) => p.includes("non-local"))).toBe(true);
    });
    it("rejects Neon branch ID in hostname", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@br-calm-glade-b3nrleet.example.com:5432/db");
        expect(problems.length).toBeGreaterThan(0);
    });
    it("rejects malformed URL", () => {
        const problems = validateDatabaseUrl("not-a-url-at-all");
        expect(problems.length).toBeGreaterThan(0);
    });
    it("rejects non-postgres protocol", () => {
        const problems = validateDatabaseUrl("https://127.0.0.1:54331/pke_test");
        expect(problems.length).toBeGreaterThan(0);
    });
    it("rejects wrong port", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@127.0.0.1:5432/pke_test");
        expect(problems.some((p) => p.includes("port"))).toBe(true);
    });
    it("rejects wrong database", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@127.0.0.1:54331/neondb");
        expect(problems.some((p) => p.includes("database"))).toBe(true);
    });
    it("rejects remote cloud host", () => {
        const problems = validateDatabaseUrl("postgres://user:pass@db.example.com:5432/mydb");
        expect(problems.length).toBeGreaterThan(0);
        expect(problems.some((p) => p.includes("non-local"))).toBe(true);
    });
});
