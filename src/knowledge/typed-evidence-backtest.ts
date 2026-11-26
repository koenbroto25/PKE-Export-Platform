import type { DependencyStatus, ProcessDependency } from "./process-dependency-map.js";

export type EvidenceVerification = "verified" | "unverified" | "rejected";
export type EvidenceRecordState = "active" | "cancelled" | "reversed" | "superseded";
export type QuantityUnit = "kg" | "tonne" | "mt" | "g";
export type EvidenceKind = "contract" | "commitment" | "production" | "qc-release" | "allocation" | "dispatch" | "loading-tally" | "survey" | "invoice" | "manifest" | "shipment" | "payment" | "checkpoint" | "port-readiness" | "document" | "custom";

export type TypedEvidenceObservation = {
  recordId: string;
  evidenceKey: string;
  kind: EvidenceKind;
  sourceId: string;
  sourceAuthority: number;
  verification: EvidenceVerification;
  recordState?: EvidenceRecordState;
  value?: string | number | boolean | null;
  quantity?: number;
  unit?: QuantityUnit;
  quantityGroup?: string;
  allocationRef?: string;
  lotId?: string;
  batchId?: string;
  shipmentId?: string;
  eventAt?: string;
  receivedAt?: string;
  expiresAt?: string;
  supersedesRecordId?: string;
  correctionOfRecordId?: string;
  reversedRecordId?: string;
  permissionScope?: string;
};

export type EvidenceFindingCode =
  | "duplicate-record-id" | "conflicting-values" | "quantity-mismatch" | "unit-invalid"
  | "duplicate-allocation" | "over-allocation" | "partial-shipment" | "stale-evidence"
  | "event-order-reversal" | "cancelled-record" | "reversed-record" | "invalid-correction"
  | "unverified-source" | "rejected-evidence" | "missing-permission-scope"
  | "invalid-authority" | "unknown-evidence";
export type EvidenceFindingSeverity = "error" | "warning" | "info";
export type EvidenceFinding = { code: EvidenceFindingCode; severity: EvidenceFindingSeverity; recordIds: string[]; message: string; group?: string };
export type TypedEvidenceAssessment = {
  status: "conflict" | "gap" | "blocked" | "stale" | "unknown" | "satisfied";
  normalizedQuantityGroups: Record<string, number>;
  findings: EvidenceFinding[];
  activeRecordIds: string[];
  ignoredRecordIds: string[];
  sourceCount: number;
  verifiedRecordCount: number;
};
export type TypedEvidencePolicy = {
  now?: string;
  staleAfterMs?: number;
  requiredQuantityGroups?: string[];
  expectedQuantities?: Record<string, { quantity: number; unit: QuantityUnit }>;
  expectedShipmentQuantity?: { quantity: number; unit: QuantityUnit; group: string };
  requiredPermissionScope?: string;
  upstreamState?: DependencyStatus;
};

const unitFactor: Record<QuantityUnit, number> = { g: 0.000001, kg: 0.001, tonne: 1, mt: 1 };
const supportedUnits = new Set(Object.keys(unitFactor));
const normalizeQuantity = (quantity: number, unit: QuantityUnit) => quantity * unitFactor[unit];
const parseTime = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
function push(findings: EvidenceFinding[], code: EvidenceFindingCode, severity: EvidenceFindingSeverity, recordIds: string[], message: string, group?: string) {
  findings.push({ code, severity, recordIds, message, ...(group ? { group } : {}) });
}
function groupBy<T>(items: T[], key: (item: T) => string | undefined): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) || []), item]);
  }
  return grouped;
}
function selectActive(records: TypedEvidenceObservation[]) {
  const supersededIds = new Set(records.map(record => record.supersedesRecordId).filter(Boolean) as string[]);
  const active = records.filter(record => (record.recordState || "active") === "active" && !supersededIds.has(record.recordId));
  return { active, ignored: records.filter(record => !active.includes(record)) };
}

export function assessTypedEvidence(records: TypedEvidenceObservation[], policy: TypedEvidencePolicy = {}): TypedEvidenceAssessment {
  const findings: EvidenceFinding[] = [];
  const { active, ignored } = selectActive(records);

  for (const [recordId, group] of groupBy(records, record => record.recordId)) {
    if (group.length > 1) push(findings, "duplicate-record-id", "error", group.map(record => record.recordId), "Record ID is not unique.", recordId);
  }
  for (const [evidenceKey, group] of groupBy(active, record => record.evidenceKey)) {
    const distinctValues = new Set(group.map(record => JSON.stringify(record.value)));
    if (distinctValues.size > 1) push(findings, "conflicting-values", "error", group.map(record => record.recordId), `Conflicting values for evidence key '${evidenceKey}'.`, evidenceKey);
  }

  for (const record of records) {
    if (record.recordState === "cancelled") push(findings, "cancelled-record", "warning", [record.recordId], "Cancelled record is excluded from active evidence.");
    if (record.recordState === "reversed") push(findings, "reversed-record", "warning", [record.recordId], "Reversed record is excluded from active evidence.");
    if (record.verification === "rejected") push(findings, "rejected-evidence", "error", [record.recordId], "Evidence has been rejected.");
    if (record.verification === "unverified") push(findings, "unverified-source", "warning", [record.recordId], "Evidence is not verified.");
    if (!Number.isFinite(record.sourceAuthority) || record.sourceAuthority < 0 || record.sourceAuthority > 100) push(findings, "invalid-authority", "error", [record.recordId], "Source authority score must be between 0 and 100.");
    if (policy.requiredPermissionScope && record.permissionScope !== policy.requiredPermissionScope) push(findings, "missing-permission-scope", "error", [record.recordId], "Evidence is outside the required permission scope.");
    if (record.correctionOfRecordId && !records.some(item => item.recordId === record.correctionOfRecordId)) push(findings, "invalid-correction", "error", [record.recordId], "Correction reference does not resolve.");
    if (record.supersedesRecordId && (record.supersedesRecordId === record.recordId || !records.some(item => item.recordId === record.supersedesRecordId))) push(findings, "invalid-correction", "error", [record.recordId], "Supersession reference is self-referential or missing.");
    if (!record.recordId.trim() || !record.evidenceKey.trim() || !record.sourceId.trim()) push(findings, "unknown-evidence", "warning", [record.recordId], "Record, evidence key, and source identifiers must be non-empty.");
    if (record.receivedAt && parseTime(record.receivedAt) === null) push(findings, "unknown-evidence", "warning", [record.recordId], "Receive timestamp is invalid.");
    if (record.reversedRecordId && !records.some(item => item.recordId === record.reversedRecordId)) push(findings, "invalid-correction", "error", [record.recordId], "Reversal reference does not resolve.");
    if (record.quantity !== undefined && (!Number.isFinite(record.quantity) || record.quantity < 0 || !record.unit || !supportedUnits.has(record.unit))) push(findings, "unit-invalid", "error", [record.recordId], "Quantity must be non-negative, finite, and use a supported unit.");
    const eventTime = parseTime(record.eventAt);
    const expiry = parseTime(record.expiresAt);
    const now = policy.now ? parseTime(policy.now) : Date.now();
    if (record.eventAt && eventTime === null) push(findings, "unknown-evidence", "warning", [record.recordId], "Event timestamp is invalid.");
    if (record.expiresAt && expiry === null) push(findings, "unknown-evidence", "warning", [record.recordId], "Expiry timestamp is invalid.");
    if (expiry !== null && now !== null && expiry < now) push(findings, "stale-evidence", "warning", [record.recordId], "Evidence has expired.");
    if (policy.staleAfterMs !== undefined && eventTime !== null && now !== null && now - eventTime > policy.staleAfterMs) push(findings, "stale-evidence", "warning", [record.recordId], "Evidence exceeds the configured freshness window.");
  }

  const allocationGroups = groupBy(active.filter(record => record.kind === "allocation"), record => record.allocationRef);
  for (const [allocationRef, group] of allocationGroups) if (group.length > 1) {
    push(findings, "duplicate-allocation", "error", group.map(record => record.recordId), `Allocation reference '${allocationRef}' is duplicated.`, allocationRef);
  }

  const quantityGroups = groupBy(active.filter(record => record.quantity !== undefined && record.unit && supportedUnits.has(record.unit) && record.quantityGroup), record => record.quantityGroup);
  const normalizedQuantityGroups: Record<string, number> = {};
  for (const [group, observations] of quantityGroups) normalizedQuantityGroups[group] = observations.reduce((total, record) => total + normalizeQuantity(record.quantity!, record.unit!), 0);

  for (const [group, expected] of Object.entries(policy.expectedQuantities || {})) {
    const actual = normalizedQuantityGroups[group];
    if (actual === undefined) continue;
    const target = normalizeQuantity(expected.quantity, expected.unit);
    if (Math.abs(actual - target) > 1e-9) push(findings, "quantity-mismatch", "error", quantityGroups.get(group)?.map(record => record.recordId) || [], `Quantity group '${group}' differs from expected amount: expected ${target} MT, observed ${actual} MT.`, group);
    if (actual > target + 1e-9) push(findings, "over-allocation", "error", quantityGroups.get(group)?.map(record => record.recordId) || [], `Quantity group '${group}' exceeds expected amount.`, group);
  }
  if (policy.expectedShipmentQuantity) {
    const expected = policy.expectedShipmentQuantity;
    const target = normalizeQuantity(expected.quantity, expected.unit);
    const actual = normalizedQuantityGroups[expected.group];
    if (actual !== undefined && actual + 1e-9 < target) push(findings, "partial-shipment", "warning", quantityGroups.get(expected.group)?.map(record => record.recordId) || [], `Shipment quantity in '${expected.group}' is below expected amount.`, expected.group);
  }

  const orderedEvents = active.filter(record => parseTime(record.eventAt) !== null).sort((a, b) => parseTime(a.eventAt)! - parseTime(b.eventAt)!);
  for (let index = 1; index < orderedEvents.length; index++) {
    const earlierEvent = orderedEvents[index - 1], laterEvent = orderedEvents[index];
    const earlierReceived = parseTime(earlierEvent.receivedAt), laterReceived = parseTime(laterEvent.receivedAt);
    if (earlierReceived !== null && laterReceived !== null && laterReceived < earlierReceived) push(findings, "event-order-reversal", "warning", [earlierEvent.recordId, laterEvent.recordId], "Events were received out of event-time order.");
  }

  const missingQuantityGroups = (policy.requiredQuantityGroups || []).filter(group => normalizedQuantityGroups[group] === undefined);
  for (const group of missingQuantityGroups) push(findings, "unknown-evidence", "warning", [], `Required quantity group '${group}' is absent.`, group);
  if (policy.upstreamState === "gap" || policy.upstreamState === "blocked") push(findings, "unknown-evidence", "error", [], "Upstream dependency blocks this assessment.");

  const hasError = findings.some(finding => finding.severity === "error");
  const hasStale = findings.some(finding => finding.code === "stale-evidence");
  const hasPartialShipment = findings.some(finding => finding.code === "partial-shipment");
  const hasWarning = findings.some(finding => finding.severity === "warning");
  const status: TypedEvidenceAssessment["status"] =
    policy.upstreamState === "gap" || policy.upstreamState === "blocked" ? "blocked" :
    hasError ? "conflict" : hasStale ? "stale" : missingQuantityGroups.length || hasPartialShipment ? "gap" :
    hasWarning ? "unknown" : active.length ? "satisfied" : "gap";

  return {
    status,
    normalizedQuantityGroups,
    findings,
    activeRecordIds: active.map(record => record.recordId),
    ignoredRecordIds: ignored.map(record => record.recordId),
    sourceCount: new Set(active.map(record => record.sourceId)).size,
    verifiedRecordCount: active.filter(record => record.verification === "verified").length,
  };
}

export type DependencyEvidenceChainItem = { dependencyId: string; providedEvidence: string[]; upstreamState?: DependencyStatus };
export function propagateDependencyChain(dependencies: ProcessDependency[], items: DependencyEvidenceChainItem[]): { dependencyId: string; status: DependencyStatus }[] {
  const itemMap = new Map(items.map(item => [item.dependencyId, item]));
  let upstreamState: DependencyStatus | undefined;
  return dependencies.map(dependency => {
    const item = itemMap.get(dependency.id);
    const state = item?.upstreamState ?? upstreamState;
    const status: DependencyStatus = state === "gap" || state === "blocked" ? "blocked" :
      state === "stale" ? "stale" : state === "unknown" ? "unknown" :
      dependency.requiredEvidence.every(evidence => item?.providedEvidence.includes(evidence)) ? "satisfied" : "gap";
    upstreamState = status;
    return { dependencyId: dependency.id, status };
  });
}
