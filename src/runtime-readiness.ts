export const REQUIRED_RUNTIME_ENV = [
  "DATABASE_URL",
  "NODE_ENV",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_JWKS_URL",
] as const;

export type RuntimeStartupFailure = {
  code: string;
  missingEnvironmentVariables: string[];
};

export function inspectRuntimeEnvironment(
  env: Record<string, string | undefined>,
): { ready: boolean; missingEnvironmentVariables: string[] } {
  const missingEnvironmentVariables = REQUIRED_RUNTIME_ENV.filter(
    (key) => !env[key] || !env[key]!.trim(),
  );
  return {
    ready: missingEnvironmentVariables.length === 0,
    missingEnvironmentVariables: [...missingEnvironmentVariables],
  };
}

export function isServerlessRuntime(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.VERCEL ||
    env.VERCEL_ENV ||
    env.AWS_LAMBDA_FUNCTION_NAME ||
    env.LAMBDA_TASK_ROOT,
  );
}

export function runtimeUnavailablePayload(failure: RuntimeStartupFailure) {
  return {
    status: "not_ready",
    error: "PKE API runtime readiness check failed.",
    code: failure.code,
    missingEnvironmentVariables: [...failure.missingEnvironmentVariables],
  };
}
