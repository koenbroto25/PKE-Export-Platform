import { PKE_PROCESS_DEPENDENCIES, assessDependency } from "./knowledge/process-dependency-map.js";
import { toDependencyEvidenceSummary, type DependencySummaryAccess } from "./knowledge/dependency-summary-contract.js";

export const DEPENDENCY_WORKSPACE_PERMISSION_CODES: Record<string, string[]> = {
  "contracts + PKS sites": ["contract.view", "pks.site.view"],
  "PKS sites + workflow": ["pks.site.view", "workflow.view"],
  "Workflow Center + Operations": ["workflow.view", "operations.view"],
  "Quality + Warehouse": ["quality.sample.view", "quality.result.view", "inventory.view"],
  "Warehouse + Shipment Allocation": ["inventory.view", "dispatch.view"],
  "Transport + Port Network": ["dispatch.view", "port.view"],
  "Port Network + Maritime Operations": ["port.view", "shipping.view"],
  "Maritime Operations + Compliance": ["shipping.view", "document.view"],
  "Compliance + export workflow": ["compliance.view", "document.view"],
  "Compliance + Maritime Operations": ["compliance.view", "voyage.view"],
  "Maritime Operations + Finance": ["voyage.view", "finance.view"],
};

type AppLike = { get: (path: string, ...handlers: any[]) => unknown };
type RouteDeps = {
  requireAuth: any;
  requireProjectPermission: (req: any, res: any, projectId: string, permission: string) => Promise<boolean>;
  hasProjectPermission: (req: any, projectId: string, permission: string) => Promise<boolean>;
  uuidPattern?: RegExp;
};

export function buildDemoDependencySummaries(projectId: string, allowedDependencyIds: string[], canReadSourceWorkspace: (workspace: string) => boolean) {
  const access: DependencySummaryAccess = {
    authenticated: true,
    projectId,
    memberProjectIds: [projectId],
    allowedDependencyIds,
    canReadSourceWorkspace,
  };
  return PKE_PROCESS_DEPENDENCIES.map((dependency => {
    const assessment = assessDependency(dependency, []);
    return toDependencyEvidenceSummary({
      projectId,
      dependency,
      assessment,
      freshness: "unknown",
      lastUpdatedAt: null,
      sourceLink: null,
    }, access);
  })).filter(Boolean);
}

/**
 * Demo-only API. It deliberately returns synthetic/unknown evidence, never live readiness.
 * Each edge is filtered by the server's permission checks for its source workspace.
 */
export function registerDependencySummaryRoute(app: AppLike, deps: RouteDeps) {
  app.get("/api/v1/projects/:projectId/dependency-summaries", deps.requireAuth, async (req: any, res: any) => {
    const projectId = req.params.projectId;
    const uuid = deps.uuidPattern ?? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof projectId !== "string" || !uuid.test(projectId)) {
      return res.status(400).json({ error: "Invalid Project ID.", code: "INVALID_PROJECT_ID" });
    }
    if (req.query?.mode !== "demo") {
      return res.status(400).json({ error: "This endpoint is demo-only; specify mode=demo.", code: "DEMO_MODE_REQUIRED" });
    }
    if (!(await deps.requireProjectPermission(req, res, projectId, "project.view"))) return;
    const permitted: string[] = [];
    const workspacePermissionCache = new Map<string, boolean>();
    const canReadWorkspace = async (workspace: string) => {
      if (workspacePermissionCache.has(workspace)) return workspacePermissionCache.get(workspace)!;
      const codes = DEPENDENCY_WORKSPACE_PERMISSION_CODES[workspace];
      if (!codes || !codes.length) {
        workspacePermissionCache.set(workspace, false);
        return false;
      }
      try {
        const allowed = (await Promise.all(codes.map(code => deps.hasProjectPermission(req, projectId, code)))).every(Boolean);
        workspacePermissionCache.set(workspace, allowed);
        return allowed;
      } catch {
        workspacePermissionCache.set(workspace, false);
        return false;
      }
    };
    for (const dependency of PKE_PROCESS_DEPENDENCIES) {
      if (await canReadWorkspace(dependency.sourceWorkspace)) permitted.push(dependency.id);
    }
    const summaries = buildDemoDependencySummaries(projectId, permitted, workspace => workspacePermissionCache.get(workspace) === true);
    return res.json({
      mode: "demo",
      dataSource: "synthetic",
      liveIntegration: false,
      authorityDecision: false,
      summaries,
    });
  });
}
