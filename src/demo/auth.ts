import type { Request, Response, NextFunction } from "express";
import { parseDemoToken, demoPermissionsForRole, createDemoSession, listDemoUsers, type DemoRole } from "./store.ts";
import { DEMO_MODE_HEADER } from "./mode.ts";

function readBearer(req: Request): string | null {
  const value = req.header("authorization");
  if (!value) return null;
  const m = /^Bearer\s+(.+)$/i.exec(value.trim());
  return m?.[1] ?? null;
}

export function demoRequireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req as any).user) return next();
  const token = readBearer(req);
  const session = parseDemoToken(token);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized (demo)", code: "DEMO_AUTH_REQUIRED", demo: true });
  }
  const permissions = demoPermissionsForRole(session.role);
  (req as any).user = {
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    isAdmin: session.isAdmin,
    isActive: true,
    mfaVerified: false,
    demo: true,
  };
  (req as any).demo = { mode: true, permissions, session };
  res.setHeader(DEMO_MODE_HEADER, "true");
  return next();
}

export function demoRequireAdmin(req: Request, res: Response, next: NextFunction) {\n  if ((req as any).user?.isAdmin === true) return next();\n  return res.status(403).json({ error: "Admin permission required (demo)", code: "DEMO_ADMIN_REQUIRED", demo: true });\n}\n\nexport function demoRequireProjectPermission(req: Request, res: Response, permissionCode: string): boolean {
  const perms: string[] = ((req as any).demo?.permissions) || [];
  if ((req as any).user?.isAdmin) return true;
  if (perms.includes(permissionCode)) return true;
  res.status(403).json({ error: "Forbidden - demo project permission required", code: "DEMO_PERMISSION_REQUIRED", permission: permissionCode, demo: true });
  return false;
}

export function registerDemoAuthRoutes(app: any) {
  app.get("/api/v1/demo/status", (_req: Request, res: Response) => {
    res.json({ demo: true, mode: "manual-trial", persistence: "in-memory-refresh-safe", storage: "in-memory-only", neon: "disabled" });
  });

  app.get("/api/v1/demo/users", (_req: Request, res: Response) => {
    res.json({ users: listDemoUsers().map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role })) });
  });

  app.post("/api/v1/demo/login", (req: Request, res: Response) => {
    const role = String(req.body?.role || "admin") as DemoRole;
    const allowed: DemoRole[] = ["admin","pm","finance","buyer","supplier","warehouse","viewer"];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: "Invalid demo role", code: "DEMO_INVALID_ROLE", demo: true });
    }
    const session = createDemoSession(role);
    res.json({ token: session.token, user: { id: session.userId, email: session.email, name: session.name, role: session.role, isAdmin: session.isAdmin, isActive: true, demo: true } });
  });
}
