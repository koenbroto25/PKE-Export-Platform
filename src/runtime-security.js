export const REQUIRED_RUNTIME_ROLE = "app_runtime_secure";
export function roleFromDatabaseUrl(connectionString) {
    let parsed;
    try {
        parsed = new URL(connectionString);
    }
    catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("DATABASE_URL must use postgres:// or postgresql://.");
    }
    return decodeURIComponent(parsed.username);
}
export function validateRuntimeRoleState(state, configuredRole) {
    const problems = [];
    if (configuredRole !== REQUIRED_RUNTIME_ROLE) {
        problems.push(`DATABASE_URL must use the ${REQUIRED_RUNTIME_ROLE} role.`);
    }
    if (state.current_role !== REQUIRED_RUNTIME_ROLE) {
        problems.push(`PostgreSQL connected as ${state.current_role}, not ${REQUIRED_RUNTIME_ROLE}.`);
    }
    if (state.rolsuper)
        problems.push("Runtime role must not be SUPERUSER.");
    if (state.rolbypassrls)
        problems.push("Runtime role must not have BYPASSRLS.");
    if (state.rolcreatedb)
        problems.push("Runtime role must not have CREATEDB.");
    if (state.rolcreaterole)
        problems.push("Runtime role must not have CREATEROLE.");
    if (state.has_neon_superuser_membership) {
        problems.push("Runtime role must not inherit or be able to SET ROLE neon_superuser.");
    }
    if (!state.can_resolve_identity) {
        problems.push("Runtime role cannot execute the verified Neon Auth identity resolver.");
    }
    return problems;
}
