import { describe, it, expect } from "vitest";
import { validateLocalUrl } from "../../scripts/test-db/run-integration.mjs";

// Placeholder password only (validation asserts presence, never value). No real credentials.
const PLACEHOLDER_PW = "not-a-real-secret";
const RUNTIME = {
  protocol: ["postgres:", "postgresql:"],
  hostname: "127.0.0.1",
  port: 54331,
  database: "pke_test",
  username: "app_runtime_secure",
};
const MAINTENANCE = { ...RUNTIME, username: "pke_test_runtime" };

function runtimeUrl(host = "127.0.0.1", port = 54331, db = "pke_test", user = "app_runtime_secure", pw = PLACEHOLDER_PW) {
  return `postgres://${user}:${pw}@${host}:${port}/${db}`;
}

function expectReject(label: string, url: string, contains?: string) {
  let thrown: unknown = null;
  try {
    validateLocalUrl(url, RUNTIME, label);
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `expected validation to throw for: ${url}`).not.toBeNull();
  if (contains) expect(String(thrown)).toMatch(new RegExp(contains, "i"));
}

describe("Sprint 01.5 — run-integration URL guard (rejects before socket connection)", () => {
  it("accepts the exact local runtime target", () => {
    expect(() => validateLocalUrl(runtimeUrl(), RUNTIME, "LOCAL_TEST_DATABASE_URL")).not.toThrow();
  });

  it("accepts the exact local maintenance target", () => {
    expect(() => validateLocalUrl(runtimeUrl("127.0.0.1", 54331, "pke_test", "pke_test_runtime"), MAINTENANCE, "LOCAL_TEST_MAINTENANCE_DATABASE_URL")).not.toThrow();
  });

  it("rejects missing / empty URL", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", "");
    expectReject("LOCAL_TEST_DATABASE_URL", undefined as unknown as string);
  });

  it("rejects whitespace in URL", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@127.0.0.1:54331/pke_test \n`);
  });

  it("rejects malformed URL", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", "not-a-url");
  });

  it("rejects non-postgres protocol", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `https://app_runtime_secure:${PLACEHOLDER_PW}@127.0.0.1:54331/pke_test`);
  });

  it("rejects remote / Neon hostname", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@ep-x.neon.tech:54331/pke_test`, "forbidden|remote|production|Host");
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@br-calm-glade-b3nrleet.example.com:54331/pke_test`, "forbidden|remote|production|Host");
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@db.example.com:54331/pke_test`, "Host");
  });

  it("rejects loopback aliases (localhost, ::1) — exact 127.0.0.1 required", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@localhost:54331/pke_test`, "127.0.0.1");
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@[::1]:54331/pke_test`, "127.0.0.1");
  });

  it("rejects wrong port", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", runtimeUrl("127.0.0.1", 5432), "port");
  });

  it("rejects wrong database", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", runtimeUrl("127.0.0.1", 54331, "neondb"), "database");
  });

  it("rejects wrong runtime username", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", runtimeUrl("127.0.0.1", 54331, "pke_test", "other_user"), "user");
  });

  it("rejects wrong maintenance username", () => {
    let thrown: unknown = null;
    try {
      validateLocalUrl(runtimeUrl("127.0.0.1", 54331, "pke_test", "app_runtime_secure"), MAINTENANCE, "LOCAL_TEST_MAINTENANCE_DATABASE_URL");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(String(thrown)).toContain("user");
  });

  it("rejects missing password / secret", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure@127.0.0.1:54331/pke_test`, "password");
  });

  it("never reveals the password in problem messages", () => {
    let thrown: unknown = null;
    try {
      validateLocalUrl(`postgres://app_runtime_secure:${PLACEHOLDER_PW}@localhost:54331/pke_test`, RUNTIME, "LOCAL_TEST_DATABASE_URL");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(String(thrown)).not.toContain(PLACEHOLDER_PW);
  });
});
