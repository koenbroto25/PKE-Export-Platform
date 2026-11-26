import express from "express";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { registerDemoApiRoutes } from "./routes.ts";
import { resetDemoState } from "./store.ts";

let server: any;
let baseUrl = "";
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: { ...(init.headers || {}), ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}
async function login(role: string) {
  const result = await request("/api/v1/demo/login", { method: "POST", body: JSON.stringify({ role }) });
  expect(result.status).toBe(200);
  return result.body.token as string;
}
function auth(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } };
}

describe("Manual Trial Mode HTTP integration — in-memory only", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerDemoApiRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });
  beforeEach(() => resetDemoState());

  it("exposes demo status and requires bearer authentication for protected routes", async () => {
    const status = await request("/api/v1/demo/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ demo: true, neon: "disabled", persistence: "in-memory-refresh-safe" });
    const unauth = await request("/api/v1/projects");
    expect(unauth.status).toBe(401);
    expect(unauth.body.code).toBe("DEMO_AUTH_REQUIRED");
  });

  it("completes an authenticated project creation and activation workflow", async () => {
    const token = await login("admin");
    const me = await request("/api/v1/me", auth(token));
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ role: "admin", demo: true, accountStatus: "active" });
    const created = await request("/api/v1/projects", auth(token, { method: "POST", body: JSON.stringify({ name: "SIM Integration Project", targetQuantity: 120, settlementUnit: "MT", exportCountryCode: "ID" }) }));
    expect(created.status).toBe(201);
    expect(created.body.project).toMatchObject({ name: "SIM Integration Project", target_quantity: 120, status: "draft" });
    const activated = await request(`/api/v1/projects/${created.body.project.id}/activate`, auth(token, { method: "POST", body: "{}" }));
    expect(activated.status).toBe(200);
    expect(activated.body.project.status).toBe("active");
    const portfolio = await request("/api/v1/reports/portfolio", auth(token));
    expect(portfolio.status).toBe(200);
    expect(portfolio.body).toMatchObject({ activeProjects: 2, contractVolume: 370, demo: true });
  });

  it("links document metadata to a project requirement and keeps file storage disabled", async () => {
    const token = await login("admin");
    const projects = await request("/api/v1/projects", auth(token));
    const project = projects.body.projects[0];
    const reqs = await request(`/api/v1/projects/${project.id}/document-requirements`, auth(token));
    const requirement = reqs.body.documentRequirements[0];
    const invalid = await request(`/api/v1/projects/${project.id}/documents`, auth(token, { method: "POST", body: JSON.stringify({ projectRequirementId: "SIM-INVALID-REQ", originalFilename: "bad.pdf" }) }));
    expect(invalid.status).toBe(404);
    const uploaded = await request(`/api/v1/projects/${project.id}/documents`, auth(token, { method: "POST", body: JSON.stringify({ projectRequirementId: requirement.id, fileReference: "SIM-FILE-001", originalFilename: "synthetic-coo.pdf", mimeType: "application/pdf", notes: "Synthetic metadata only" }) }));
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.document).toMatchObject({ project_id: project.id, project_requirement_id: requirement.id, document_code: requirement.document_code, status: "uploaded" });
    const list = await request(`/api/v1/projects/${project.id}/documents`, auth(token));
    expect(list.body.documents).toHaveLength(1);
    expect(list.body.documents[0].id).toBe(uploaded.body.document.id);
    const storage = await request("/api/v1/storage/status", auth(token));
    expect(storage.body.available).toBe(false);
    const uploadEndpoint = await request("/api/v1/storage/presigned-upload", auth(token, { method: "POST", body: "{}" }));
    expect(uploadEndpoint.status).toBe(501);
    expect(uploadEndpoint.body.code).toBe("DEMO_NOT_AVAILABLE");
  });

  it("denies viewer project configuration and admin reset actions", async () => {
    const viewer = await login("viewer");
    const created = await request("/api/v1/projects", auth(viewer, { method: "POST", body: JSON.stringify({ name: "Viewer forbidden project" }) }));
    expect(created.status).toBe(403);
    expect(created.body.code).toBe("DEMO_PERMISSION_REQUIRED");
    const reset = await request("/api/v1/demo/reset", auth(viewer, { method: "POST", body: "{}" }));
    expect(reset.status).toBe(403);
    expect(reset.body.code).toBe("DEMO_ADMIN_REQUIRED");
    const documentRead = await request("/api/v1/projects/DEMO-PROJECT-0001/documents", auth(viewer));
    expect(documentRead.status).toBe(403);
    expect(documentRead.body.code).toBe("DEMO_PERMISSION_REQUIRED");
    const documentReview = await request("/api/v1/documents/DEMO-DOC-0001", auth(viewer, { method: "PATCH", body: JSON.stringify({ status: "approved" }) }));
    expect(documentReview.status).toBe(403);
    expect(documentReview.body.code).toBe("DEMO_PERMISSION_REQUIRED");
    const admin = await login("admin");
    const resetOk = await request("/api/v1/demo/reset", auth(admin, { method: "POST", body: "{}" }));
    expect(resetOk.status).toBe(200);
    expect(resetOk.body.reset).toBe(true);
    const projects = await request("/api/v1/projects", auth(admin));
    expect(projects.body.projects).toHaveLength(1);
    expect(projects.body.projects[0].id).toBe("DEMO-PROJECT-0001");
  });

  it("returns honest unavailable states for integrations rather than fake readiness", async () => {
    const token = await login("pm");
    const compliance = await request("/api/v1/compliance-check", auth(token, { method: "POST", body: JSON.stringify({}) }));
    expect(compliance.status).toBe(200);
    expect(compliance.body.complianceResult).toMatchObject({ compliant: null, status: "requires_human_review" });
    const regulatory = await request("/api/v1/regulatory-knowledge", auth(token));
    expect(regulatory.body).toMatchObject({ regulatoryKnowledge: [], demo: true });
    const finance = await request("/api/v1/payment-instructions", auth(token));
    expect(finance.body.paymentInstructions).toEqual([]);
    const payment = await request("/api/v1/payment-instructions", auth(token, { method: "POST", body: JSON.stringify({ amount: 1 }) }));
    expect(payment.status).toBe(503);
    expect(payment.body.code).toBe("PAYMENT_UNAVAILABLE");
  });
});
