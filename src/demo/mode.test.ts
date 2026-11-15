import { describe, it, expect } from "vitest";
import { detectManualTrialMode, assertManualTrialModeSafe } from "./mode.ts";

describe("manual trial mode guards", () => {
  it("is disabled by default", () => {
    const r = detectManualTrialMode({ NODE_ENV: "development" } as any);
    expect(r.enabled).toBe(false);
  });

  it("enables only for explicit flag on loopback development", () => {
    const r = detectManualTrialMode({ NODE_ENV: "development", PKE_MANUAL_TRIAL_MODE: "true", HOST: "127.0.0.1", PORT: "3000" } as any);
    expect(r.enabled).toBe(true);
    expect(r.blocked).toBeUndefined();
  });

  it("rejects production", () => {
    const r = detectManualTrialMode({ NODE_ENV: "production", PKE_MANUAL_TRIAL_MODE: "true", HOST: "127.0.0.1" } as any);
    expect(r.enabled).toBe(false);
    expect(r.blocked).toMatch(/production/i);
  });

  it("rejects non-loopback host", () => {
    const r = detectManualTrialMode({ NODE_ENV: "development", PKE_MANUAL_TRIAL_MODE: "true", HOST: "0.0.0.0" } as any);
    expect(r.enabled).toBe(false);
    expect(r.blocked).toMatch(/loopback/i);
  });

  it("assert throws when blocked", () => {
    expect(() => assertManualTrialModeSafe({ NODE_ENV: "production", PKE_MANUAL_TRIAL_MODE: "true" } as any)).toThrow(/BLOCKED/);
  });
});
