import crypto from "node:crypto";

export type DemoRole = "admin" | "pm" | "finance" | "buyer" | "supplier" | "warehouse" | "viewer";
export type DemoSession = {
  token: string;
  userId: string;
  email: string;
  name: string;
  role: DemoRole;
  isAdmin: boolean;
  issuedAt: string;
};

type StoredState = {
  version: 1;
  updatedAt: string;
  seededAt: string;
  users: Record<string, { id: string; email: string; name: string; role: DemoRole; isActive: boolean }>;
  projects: any[];
  contractPrograms: any[];
  cyclePolicies: any[];
  contracts: any[];
  buyers: any[];
  workflowDefinitions: any[];
  notifications: any[];
  exportDocuments: any[];
  documentRequirements: any[];
  reportRuns: any[];
  events: any[];
  nextSeq: number;
};

const DEMO_STORAGE_KEY = "__PKE_DEMO_STATE__";
const stateHolder: any = globalThis as any;

function nowIso() { return new Date().toISOString(); }
function uid(prefix: string, n: number) { return `DEMO-${prefix}-${String(n).padStart(4, "0")}`; }

function deterministicSeed(): StoredState {
  const seededAt = "2026-11-14T00:00:00.000Z";
  const users = {
    admin: { id: "DEMO-USER-0001", email: "admin@demo.pke.local", name: "Demo Admin", role: "admin" as DemoRole, isActive: true },
    pm: { id: "DEMO-USER-0002", email: "pm@demo.pke.local", name: "Demo Project Manager", role: "pm" as DemoRole, isActive: true },
    finance: { id: "DEMO-USER-0003", email: "finance@demo.pke.local", name: "Demo Finance", role: "finance" as DemoRole, isActive: true },
    buyer: { id: "DEMO-USER-0004", email: "buyer@demo.pke.local", name: "Demo Buyer", role: "buyer" as DemoRole, isActive: true },
    supplier: { id: "DEMO-USER-0005", email: "supplier@demo.pke.local", name: "Demo Supplier", role: "supplier" as DemoRole, isActive: true },
    warehouse: { id: "DEMO-USER-0006", email: "warehouse@demo.pke.local", name: "Demo Warehouse", role: "warehouse" as DemoRole, isActive: true },
    viewer: { id: "DEMO-USER-0007", email: "viewer@demo.pke.local", name: "Demo Viewer", role: "viewer" as DemoRole, isActive: true },
  };
  const buyers = [{ id: "DEMO-BUYER-0001", name: "Demo Buyer Co", code: "DEMOBUY", country_code: "CN", is_active: true, created_at: seededAt, updated_at: seededAt }];
  const contracts = [{ id: "DEMO-CONTRACT-0001", buyer_id: buyers[0].id, code: "DEMO-CTR-001", name: "Demo Export Contract", start_date: seededAt, end_date: null, is_active: true, created_at: seededAt, updated_at: seededAt }];
  const contractPrograms = [{ id: "DEMO-PROGRAM-0001", name: "Demo Contract Program", buyer_id: buyers[0].id, contract_id: contracts[0].id, settlement_unit: "MT", target_quantity: 1000, cadence: "monthly", generation_mode: "scheduled_draft", description: "Deterministic demo program", is_active: true, created_at: seededAt, updated_at: seededAt }];
  const cyclePolicies = [{ id: "DEMO-CYCLE-0001", contract_program_id: contractPrograms[0].id, cadence: "monthly", target_quantity: 250, generation_mode: "scheduled_draft", is_active: true, created_at: seededAt, updated_at: seededAt }];
  const projects = [{ id: "DEMO-PROJECT-0001", contract_program_id: contractPrograms[0].id, name: "Demo PKE Export Project", description: "In-memory demo project (not persisted to Neon)", status: "active", settlement_unit: "MT", target_quantity: 250, export_country_code: "CN", is_active: true, started_at: seededAt, created_at: seededAt, updated_at: seededAt }];
  const documentRequirements = [
    { id: "DEMO-REQ-0001", project_id: projects[0].id, country_requirement_id: "DEMO-COUNTRY-REQ-0001", country_code: "CN", country_name: "China", document_type_id: "DEMO-DOC-TYPE-0001", document_code: "COO", document_name: "Certificate of Origin", document_category: "compliance", description: "Demo requirement", importing_authority: "Demo Authority", is_required: true, country_mandatory: true, status: "pending", country_status: "verified", override_reason: null, overridden_by: null, effective_from: null, effective_to: null, official_source_url: null, country_notes: "Demo data", created_at: seededAt, updated_at: seededAt },
  ];
  const exportDocuments: any[] = [];
  const workflowDefinitions = [{ id: "DEMO-WF-0001", code: "demo-export-flow", name: "Demo Export Workflow", states: ["draft", "in_review", "approved", "ready"], current_state: "draft", created_at: seededAt }];
  const notifications = [{ id: "DEMO-NOTIF-0001", type: "info", title: "Manual Trial Mode Active", message: "Using deterministic in-memory demo data. No production/Neon writes.", is_read: false, created_at: seededAt }];
  const reportRuns: any[] = [];
  const events = [{ id: "DEMO-EVENT-0001", event_type: "demo_seeded", description: "Demo state initialized", server_timestamp: seededAt }];

  return {
    version: 1,
    updatedAt: seededAt,
    seededAt,
    users,
    projects,
    contractPrograms,
    cyclePolicies,
    contracts,
    buyers,
    workflowDefinitions,
    notifications,
    exportDocuments,
    documentRequirements,
    reportRuns,
    events,
    nextSeq: 100,
  };
}

function ensureState(): StoredState {
  if (!stateHolder[DEMO_STORAGE_KEY]) {
    stateHolder[DEMO_STORAGE_KEY] = deterministicSeed();
  }
  return stateHolder[DEMO_STORAGE_KEY] as StoredState;
}

export function getDemoState(): StoredState {
  return ensureState();
}

export function resetDemoState(): StoredState {
  stateHolder[DEMO_STORAGE_KEY] = deterministicSeed();
  return stateHolder[DEMO_STORAGE_KEY] as StoredState;
}

export function nextDemoId(prefix: string): string {
  const s = ensureState();
  s.nextSeq += 1;
  s.updatedAt = nowIso();
  return uid(prefix, s.nextSeq);
}

export function touchDemoState() {
  const s = ensureState();
  s.updatedAt = nowIso();
}

export function getDemoUserByRole(role: DemoRole) {
  const s = ensureState();
  return s.users[role];
}

export function listDemoUsers() {
  return Object.values(ensureState().users);
}

export function createDemoSession(role: DemoRole): DemoSession {
  const user = getDemoUserByRole(role);
  if (!user || !user.isActive) throw new Error("Demo user not available");
  const token = `demo.${role}.${crypto.randomBytes(12).toString("hex")}`;
  return {
    token,
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
    isAdmin: role === "admin",
    issuedAt: nowIso(),
  };
}

export function parseDemoToken(token: string | null | undefined): DemoSession | null {
  if (!token || typeof token !== "string") return null;
  if (!token.startsWith("demo.")) return null;
  const parts = token.split(".");
  const role = parts[1] as DemoRole | undefined;
  if (!role) return null;
  const user = getDemoUserByRole(role);
  if (!user) return null;
  return {
    token,
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
    isAdmin: role === "admin",
    issuedAt: nowIso(),
  };
}

export function demoPermissionsForRole(role: DemoRole): string[] {
  if (role === "admin") return ["project.view","project.configuration.view","project.configuration.manage","documents.view","documents.create","documents.review","reports.view","workflow.view","notifications.view"];
  if (role === "pm") return ["project.view","project.configuration.view","documents.view","documents.create","reports.view","workflow.view","notifications.view"];
  if (role === "finance") return ["project.view","documents.view","reports.view","notifications.view"];
  if (role === "warehouse") return ["project.view","documents.view","notifications.view"];
  if (role === "buyer" || role === "supplier") return ["project.view","documents.view","notifications.view"];
  return ["project.view","notifications.view"];
}
