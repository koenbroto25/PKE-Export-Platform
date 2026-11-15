import { describe, it, expect } from "vitest";
import { validateLocalUrl } from "../../scripts/test-db/run-integration.mjs";

// Placeholder password only. It is never a real credential.
const PLACEHOLDER_PW = "not-a-real-secret";

const RUNTIME = {
  protocol: ["postgres:", "postgresql:"],
  hostname: "127.0.0.1",
  port: 54331,
  database: "pke_test",
  username: "app_runtime_secure",
};

const MAINTENANCE = { ...RUNTIME, username: "pke_test_runtime" };

function runtimeUrl(
  host = "127.0.0.1",
  port = 54331,
  db = "pke_test",
  user = "app_runtime_secure",
  password = PLACEHOLDER_PW,
) {
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

function expectReject(label: string, url: string, expectedMessage?: RegExp) {
  let thrown: unknown = null;

  try {
    validateLocalUrl(url, RUNTIME, label);
  } catch (error) {
    thrown = error;
  }

  expect(thrown, `expected validation to throw for: ${url}`).not.toBeNull();
  if (expectedMessage) expect(String(thrown)).toMatch(expectedMessage);
}

describe("Sprint 01.5 — run-integration URL guard (rejects before socket connection)", () => {
  it("accepts the exact local runtime target", () => {
    expect(() => validateLocalUrl(runtimeUrl(), RUNTIME, "LOCAL_TEST_DATABASE_URL")).not.toThrow();
  });

  it("accepts the exact local maintenance target", () => {
    expect(() =>
      validateLocalUrl(
        runtimeUrl("127.0.0.1", 54331, "pke_test", "pke_test_runtime"),
        MAINTENANCE,
        "LOCAL_TEST_MAINTENANCE_DATABASE_URL",
      ),
    ).not.toThrow();
  });

  it("rejects missing / empty URL", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", "");
    expectReject("LOCAL_TEST_DATABASE_URL", undefined as unknown as string);
  });

  it("rejects whitespace and malformed URL", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@127.0.0.1:54331/pke_test \n`);
    expectReject("LOCAL_TEST_DATABASE_URL", "not-a-url");
  });

  it("rejects non-PostgreSQL protocol", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", `https://app_runtime_secure:${PLACEHOLDER_PW}@127.0.0.1:54331/pke_test`);
  });

  it("rejects remote / Neon hosts", () => {
    const hostError = /host/i;
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@ep-x.neon.tech:54331/pke_test`, hostError);
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@br-calm-glade-b3nrleet.example.com:54331/pke_test`, hostError);
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@db.example.com:54331/pke_test`, hostError);
  });

  it("rejects localhost and IPv6 loopback aliases", () => {
    const exactHostError = /127\.0\.0\.1/i;
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@localhost:54331/pke_test`, exactHostError);
    expectReject("LOCAL_TEST_DATABASE_URL", `postgres://app_runtime_secure:${PLACEHOLDER_PW}@[::1]:54331/pke_test`, exactHostError);
  });

  it("rejects wrong port and database", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", runtimeUrl("127.0.0.1", 5432), /port/i);
    expectReject("LOCAL_TEST_DATABASE_URL", runtimeUrl("127.0.0.1", 54331, "neondb"), /database/i);
  });

  it("rejects wrong runtime and maintenance usernames", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", runtimeUrl("127.0.0.1", 54331, "pke_test", "other_user"), /username/i);

    let thrown: unknown = null;
    try {
      validateLocalUrl(
        runtimeUrl("127.0.0.1", 54331, "pke_test", "app_runtime_secure"),
        MAINTENANCE,
        "LOCAL_TEST_MAINTENANCE_DATABASE_URL",
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(String(thrown)).toMatch(/username/i);
  });

  it("rejects missing password, placeholders, query parameters and fragments", () => {
    expectReject("LOCAL_TEST_DATABASE_URL", "postgres://app_runtime_secure@127.0.0.1:54331/pke_test", /password/i);
    expectReject("LOCAL_TEST_DATABASE_URL", "postgres://app_runtime_secure:placeholder@127.0.0.1:54331/pke_test", /placeholder/i);
    expectReject("LOCAL_TEST_DATABASE_URL", `${runtimeUrl()}?sslmode=disable`, /query/i);
    expectReject("LOCAL_TEST_DATABASE_URL", `${runtimeUrl()}#frag`, /fragment/i);
  });

  it("never reveals a supplied password in validation errors", () => {
    let thrown: unknown = null;
    try {
      validateLocalUrl(
        `postgres://app_runtime_secure:${PLACEHOLDER_PW}@localhost:54331/pke_test`,
        RUNTIME,
        "LOCAL_TEST_DATABASE_URL",
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(String(thrown)).not.toContain(PLACEHOLDER_PW);
  });
});
