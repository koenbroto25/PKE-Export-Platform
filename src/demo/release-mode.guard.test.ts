import { describe, it, expect } from "vitest";
import { detectManualTrialMode, assertManualTrialModeSafe } from "./mode";

describe("Manual Trial Mode release-mode guard (Rev 5.8)", () => {
  it("rejects activation in production", () => {
    const r = detectManualTrialMode({ NODE_ENV: "production", PKE_MANUAL_TRIAL_MODE: "true", HOST: "127.0.0.1", PORT: "3000" } as any);
    expect(r.enabled).toBe(false);
    expect(r.blocked).toMatch(/production/i);
    expect(() => assertManualTrialModeSafe({ NODE_ENV: "production", PKE_MANUAL_TRIAL_MODE: "true", HOST: "127.0.0.1" } as any)).toThrow(/BLOCKED/i);
  });

  it("rejects activation on non-loopback host", () => {
    const r = detectManualTrialMode({ NODE_ENV: "development", PKE_MANUAL_TRIAL_MODE: "true", HOST: "0.0.0.0" } as any);
    expect(r.enabled).toBe(false);
    expect(r.blocked).toMatch(/loopback/i);
  });

  it("requires development/test env for activation", () => {
    const r = detectManualTrialMode({ NODE_ENV: "staging", PKE_MANUAL_TRIAL_MODE: "true", HOST: "127.0.0.1" } as any);
    expect(r.enabled).toBe(false);
    expect(r.blocked).toBeTruthy();
  });

  it("does not enable without explicit flag", () => {
    const r = detectManualTrialMode({ NODE_ENV: "development", HOST: "127.0.0.1" } as any);
    expect(r.enabled).toBe(false);
    expect(r.blocked).toBeFalsy();
  });

  it("enables only for explicit dev flag + loopback", () => {
    const r = detectManualTrialMode({ NODE_ENV: "development", PKE_MANUAL_TRIAL_MODE: "true", HOST: "127.0.0.1" } as any);
    expect(r.enabled).toBe(true);
    expect(r.blocked).toBeFalsy();
  });
});
