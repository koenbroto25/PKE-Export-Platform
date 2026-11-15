export type DemoModeConfig = {
  enabled: boolean;
  host: string;
  port: number;
};

export const DEMO_ENV_FLAG = "PKE_MANUAL_TRIAL_MODE";
export const DEMO_MODE_HEADER = "x-pke-manual-trial";

export function isTruthy(value: string | undefined): boolean {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

export function isLoopbackHost(host: string | undefined): boolean {
  const h = String(host || "").toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

export function detectManualTrialMode(env: NodeJS.ProcessEnv = process.env): DemoModeConfig & { reason?: string; blocked?: string } {
  const requested = isTruthy(env[DEMO_ENV_FLAG]);
  const nodeEnv = String(env.NODE_ENV || "development");
  const host = String(env.HOST || "127.0.0.1");
  const port = Number.parseInt(String(env.PORT || "3000"), 10) || 3000;

  if (!requested) return { enabled: false, host, port };

  if (nodeEnv === "production") {
    return { enabled: false, host, port, blocked: "PKE_MANUAL_TRIAL_MODE cannot be enabled when NODE_ENV=production." };
  }
  if (nodeEnv !== "development" && nodeEnv !== "test") {
    return { enabled: false, host, port, blocked: "PKE_MANUAL_TRIAL_MODE requires NODE_ENV=development." };
  }
  if (!isLoopbackHost(host)) {
    return { enabled: false, host, port, blocked: "PKE_MANUAL_TRIAL_MODE requires loopback host (127.0.0.1/localhost)." };
  }

  return { enabled: true, host: "127.0.0.1", port };
}

export function assertManualTrialModeSafe(env: NodeJS.ProcessEnv = process.env): DemoModeConfig {
  const result = detectManualTrialMode(env);
  if (result.blocked) {
    throw new Error(`BLOCKED: ${result.blocked}`);
  }
  return { enabled: result.enabled, host: result.host, port: result.port };
}
