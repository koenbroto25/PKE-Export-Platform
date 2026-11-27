import {
  createPhaseEOperationalDataset,
  validatePhaseEOperationalDataset,
  type SyntheticOperationalDataset,
  type SyntheticOperationalProject,
} from "./phase-e-operational-fixtures";
import {
  simulateAllLifecycles,
  phaseEEndToEndSummary,
  type SimLifecycleResult,
} from "./phase-e-lifecycle-engine";

export type PMAppointmentStatus = "active" | "suspended" | "revoked";
export type CommercialBasis = "buyer_agreement" | "executed_contract";
export type E2EProject = {
  id: string;
  pmUserId: string;
  buyerId: string;
  basis: CommercialBasis;
  basisId: string;
  idempotencyKey: string;
  createdAt: string;
  active: boolean;
};
export type P22Dataset = SyntheticOperationalDataset & {
  appointments: { userId: string; status: PMAppointmentStatus; appointedBy: string }[];
  commercialAgreements: { id: string; projectId: string; buyerId: string; evidenceRef: string; confirmed: boolean }[];
  executedContracts: { id: string; projectId: string; buyerId: string; executed: boolean; evidenceRef: string }[];
  projectCreations: E2EProject[];
  ownershipEvents: { projectId: string; fromPm: string | null; toPm: string; reason: string; at: string }[];
  idempotencyRecords: { key: string; projectId: string }[];
};

const PM_ALPHA = "SIM-PM-ALPHA";
const PM_BETA = "SIM-PM-BETA";
const ADMIN = "SIM-PLATFORM-ADMIN";
const NOW = "2026-11-27T12:00:00.000Z";

export type CreateProjectResult =
  | { ok: true; project: E2EProject; replay: boolean }
  | { ok: false; code: "PM_NOT_ACTIVE" | "BUYER_NOT_FOUND" | "BASIS_INVALID" | "IDEMPOTENCY_CONFLICT" };

export function createP22Dataset(): P22Dataset {
  const operational = createPhaseEOperationalDataset();
  const appointments = [
    { userId: PM_ALPHA, status: "active" as const, appointedBy: ADMIN },
    { userId: PM_BETA, status: "active" as const, appointedBy: ADMIN },
  ];
  const projectCreations: E2EProject[] = [];
  const commercialAgreements: P22Dataset["commercialAgreements"] = [];
  const executedContracts: P22Dataset["executedContracts"] = [];
  const idempotencyRecords: P22Dataset["idempotencyRecords"] = [];
  const ownershipEvents: P22Dataset["ownershipEvents"] = [];
  const projects = operational.projects.map((p, i) => {
    const shipment = operational.shipments.find(s => s.projectId === p.id)!;
    const pmUserId = i < 5 ? PM_ALPHA : PM_BETA;
    const basis: CommercialBasis = i % 2 === 0 ? "executed_contract" : "buyer_agreement";
    const basisId = basis === "executed_contract" ? shipment.contractId : "SIM-AGR-" + p.id.slice(-3);
    const key = "SIM-IDEMP-" + p.id;
    if (basis === "buyer_agreement") commercialAgreements.push({
      id: basisId, projectId: p.id, buyerId: shipment.buyerId,
      evidenceRef: "SIM-EVIDENCE-AGREEMENT-" + p.id.slice(-3), confirmed: true,
    });
    else executedContracts.push({
      id: basisId, projectId: p.id, buyerId: shipment.buyerId, executed: true,
      evidenceRef: "SIM-EVIDENCE-CONTRACT-" + p.id.slice(-3),
    });
    const row: E2EProject = { id: p.id, pmUserId, buyerId: shipment.buyerId, basis, basisId, idempotencyKey: key, createdAt: NOW, active: true };
    projectCreations.push(row);
    idempotencyRecords.push({ key, projectId: p.id });
    ownershipEvents.push({ projectId: p.id, fromPm: null, toPm: pmUserId, reason: "Project created by appointed PM from commercial basis", at: NOW });
    return p;
  });
  return { ...operational, projects, appointments, commercialAgreements, executedContracts, projectCreations, ownershipEvents, idempotencyRecords };
}

export function createProjectFromBasis(d: P22Dataset, input: {
  projectId: string; pmUserId: string; buyerId: string; basis: CommercialBasis; basisId: string; idempotencyKey: string;
}): CreateProjectResult {
  const replay = d.idempotencyRecords.find(x => x.key === input.idempotencyKey);
  if (replay) {
    const project = d.projectCreations.find(x => x.id === replay.projectId);
    return project && project.pmUserId === input.pmUserId && project.buyerId === input.buyerId
      ? { ok: true, project, replay: true }
      : { ok: false, code: "IDEMPOTENCY_CONFLICT" };
  }
  if (d.appointments.find(x => x.userId === input.pmUserId)?.status !== "active") return { ok: false, code: "PM_NOT_ACTIVE" };
  if (!d.buyers.some(x => x.id === input.buyerId)) return { ok: false, code: "BUYER_NOT_FOUND" };
  const validBasis = input.basis === "buyer_agreement"
    ? d.commercialAgreements.some(x => x.id === input.basisId && x.buyerId === input.buyerId && x.confirmed)
    : d.executedContracts.some(x => x.id === input.basisId && x.buyerId === input.buyerId && x.executed);
  if (!validBasis) return { ok: false, code: "BASIS_INVALID" };
  const project: E2EProject = { id: input.projectId, pmUserId: input.pmUserId, buyerId: input.buyerId, basis: input.basis, basisId: input.basisId, idempotencyKey: input.idempotencyKey, createdAt: NOW, active: true };
  d.projectCreations.push(project);
  d.idempotencyRecords.push({ key: input.idempotencyKey, projectId: input.projectId });
  d.ownershipEvents.push({ projectId: input.projectId, fromPm: null, toPm: input.pmUserId, reason: "Synthetic creation from commercial basis", at: NOW });
  return { ok: true, project, replay: false };
}

export function transferP22Project(d: P22Dataset, projectId: string, toPm: string, reason: string): boolean {
  const project = d.projectCreations.find(x => x.id === projectId);
  if (!project || !reason.trim() || d.appointments.find(x => x.userId === toPm)?.status !== "active") return false;
  const fromPm = project.pmUserId;
  project.pmUserId = toPm;
  d.ownershipEvents.push({ projectId, fromPm, toPm, reason: reason.trim(), at: NOW });
  return true;
}

export function p22Portfolio(d: P22Dataset, pmUserId: string): string[] {
  return d.projectCreations.filter(x => x.active && x.pmUserId === pmUserId).map(x => x.id).sort();
}

export function validateP22Dataset(d: P22Dataset): string[] {
  const errors = [...validatePhaseEOperationalDataset(d)];
  const projectIds = new Set(d.projects.map(x => x.id));
  const buyerIds = new Set(d.buyers.map(x => x.id));
  const pmIds = new Set(d.appointments.map(x => x.userId));
  const creations = new Map(d.projectCreations.map(x => [x.id, x]));
  if (creations.size !== d.projectCreations.length) errors.push("duplicate-project-creation");
  if (new Set(d.idempotencyRecords.map(x => x.key)).size !== d.idempotencyRecords.length) errors.push("duplicate-idempotency-key");
  for (const p of d.projectCreations) {
    if (!projectIds.has(p.id)) errors.push("project-creation-fk:" + p.id);
    if (!buyerIds.has(p.buyerId)) errors.push("buyer-fk:" + p.id);
    if (!pmIds.has(p.pmUserId)) errors.push("pm-appointment-fk:" + p.id);
    if (d.appointments.find(x => x.userId === p.pmUserId)?.status !== "active" && p.active) errors.push("active-project-inactive-pm:" + p.id);
    if (p.basis === "buyer_agreement" && !d.commercialAgreements.some(x => x.id === p.basisId && x.projectId === p.id && x.buyerId === p.buyerId && x.confirmed)) errors.push("agreement-basis:" + p.id);
    if (p.basis === "executed_contract" && !d.executedContracts.some(x => x.id === p.basisId && x.projectId === p.id && x.buyerId === p.buyerId && x.executed)) errors.push("executed-contract-basis:" + p.id);
    if (!d.idempotencyRecords.some(x => x.key === p.idempotencyKey && x.projectId === p.id)) errors.push("idempotency-link:" + p.id);
    const shipment = d.shipments.find(x => x.projectId === p.id);
    if (!shipment) errors.push("shipment-project-link:" + p.id);
    else if (shipment.buyerId !== p.buyerId) errors.push("shipment-buyer-link:" + p.id);
  }
  for (const event of d.ownershipEvents) {
    if (!projectIds.has(event.projectId)) errors.push("ownership-project-fk:" + event.projectId);
    if (!pmIds.has(event.toPm)) errors.push("ownership-pm-fk:" + event.toPm);
    if (!event.reason.trim()) errors.push("ownership-reason-missing:" + event.projectId);
  }
  for (const buyer of d.buyers) if (!projectIds.has(buyer.projectId)) errors.push("buyer-project-fk:" + buyer.id);
  for (const supplier of d.suppliers) if (!projectIds.has(supplier.projectId)) errors.push("supplier-project-fk:" + supplier.id);
  for (const site of d.pksSites) if (!projectIds.has(site.projectId)) errors.push("pks-project-fk:" + site.id);
  const lifecycle: SimLifecycleResult[] = simulateAllLifecycles(d);
  for (const result of lifecycle) {
    const stopped = result.stages.some(s => ["blocked", "gap", "conflict"].includes(s.status));
    if (stopped && result.stages.some((s, i) => i > result.stages.findIndex(x => ["blocked", "gap", "conflict"].includes(x.status)) && s.status === "ready")) errors.push("downstream-false-ready:" + result.shipmentId);
  }
  return errors;
}

export function p22Summary(d=createP22Dataset()) {
  const lifecycles = simulateAllLifecycles(d);
  const validationErrors = validateP22Dataset(d);
  const simulatedComplete = lifecycles.filter(x => x.terminalStatus === "complete").length;
  return {
    projectCount: d.projectCreations.length,
    shipmentCount: d.shipments.length,
    pmCount: d.appointments.length,
    simulatedComplete,
    complete: validationErrors.length === 0 ? simulatedComplete : 0,
    blocked: lifecycles.filter(x => x.terminalStatus === "blocked").length,
    conflict: lifecycles.filter(x => x.terminalStatus === "conflict").length,
    incomplete: lifecycles.filter(x => x.terminalStatus === "incomplete").length,
    stageResults: lifecycles.reduce((sum, x) => sum + x.stages.length, 0),
    validationErrors,
  };
}
