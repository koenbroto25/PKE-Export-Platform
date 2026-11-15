import { describe, expect, it } from "vitest";
import { REQUIRED_RUNTIME_ROLE, roleFromDatabaseUrl, validateRuntimeRoleState, } from "./runtime-security";
const safeRole = {
    current_role: "app_runtime_secure",
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    has_neon_superuser_membership: false,
    can_resolve_identity: true,
};
describe("Revision 028 runtime database guard", () => {
    it("accepts only a least-privilege runtime role", () => {
        expect(validateRuntimeRoleState(safeRole, REQUIRED_RUNTIME_ROLE)).toEqual([]);
    });
    it("rejects a role URL that is not app_runtime_secure", () => {
        const problems = validateRuntimeRoleState(safeRole, "app_runtime");
        expect(problems).toContain("DATABASE_URL must use the app_runtime_secure role.");
    });
    it("rejects BYPASSRLS and privileged role membership", () => {
        const problems = validateRuntimeRoleState({ ...safeRole, rolbypassrls: true, has_neon_superuser_membership: true }, REQUIRED_RUNTIME_ROLE);
        expect(problems).toContain("Runtime role must not have BYPASSRLS.");
        expect(problems).toContain("Runtime role must not inherit or be able to SET ROLE neon_superuser.");
    });
    it("rejects an identity resolver that is not executable", () => {
        const problems = validateRuntimeRoleState({ ...safeRole, can_resolve_identity: false }, REQUIRED_RUNTIME_ROLE);
        expect(problems).toContain("Runtime role cannot execute the verified Neon Auth identity resolver.");
    });
    it("reads the role name without exposing connection credentials", () => {
        expect(roleFromDatabaseUrl("postgresql://app_runtime_secure:secret@host.example/db?sslmode=require"))
            .toBe(REQUIRED_RUNTIME_ROLE);
        expect(() => roleFromDatabaseUrl("not-a-url")).toThrow(/valid PostgreSQL/);
    });
});
