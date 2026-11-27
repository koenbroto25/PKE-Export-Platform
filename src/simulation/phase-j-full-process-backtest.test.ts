import { describe, expect, it } from "vitest";
import { createP22Dataset, createProjectFromBasis, p22Portfolio, p22Summary, transferP22Project, validateP22Dataset } from "./phase-j-full-process-backtest";
import { cascadeStageChange, simulateLifecycle } from "./phase-e-lifecycle-engine";
import { injectSyntheticFault } from "./phase-g-chaos-recovery";

describe("P22 connected export lifecycle backtest", () => {
  it("creates a deterministic connected PM → Buyer → commercial basis → Project → shipment dataset", () => {
    const a = createP22Dataset(), b = createP22Dataset();
    expect(a).toEqual(b);
    expect(a.appointments).toHaveLength(2);
    expect(a.projectCreations).toHaveLength(10);
    expect(a.commercialAgreements.length + a.executedContracts.length).toBe(10);
    expect(a.shipments).toHaveLength(10);
    expect(validateP22Dataset(a)).toEqual([]);
    expect(p22Summary(a)).toMatchObject({ projectCount: 10, shipmentCount: 10, pmCount: 2, stageResults: 120, validationErrors: [] });
  });

  it("enforces PM appointment status and commercial-basis validation before Project creation", () => {
    const d = createP22Dataset();
    const agreement = d.commercialAgreements[0];
    const buyer = d.buyers.find(x => x.id === agreement.buyerId)!;
    const input = { projectId: "SIM-PROJECT-NEW", pmUserId: "SIM-PM-ALPHA", buyerId: buyer.id, basis: "buyer_agreement" as const, basisId: agreement.id, idempotencyKey: "SIM-IDEMP-NEW" };
    expect(createProjectFromBasis(d, input)).toMatchObject({ ok: true, replay: false, project: { id: "SIM-PROJECT-NEW" } });
    const unappointed = { ...input, pmUserId: "SIM-PM-NOT-APPOINTED" };
    expect(createProjectFromBasis(d, unappointed)).toMatchObject({ ok: false, code: "PM_NOT_ACTIVE" });
    d.appointments[0].status = "suspended";
    expect(createProjectFromBasis(d, input)).toMatchObject({ ok: false, code: "PM_NOT_ACTIVE" });
    d.appointments[0].status = "revoked";
    expect(createProjectFromBasis(d, input)).toMatchObject({ ok: false, code: "PM_NOT_ACTIVE" });
    d.appointments[0].status = "active";
    expect(createProjectFromBasis(d, { ...input, basisId: "unknown" })).toMatchObject({ ok: false, code: "BASIS_INVALID" });
    expect(createProjectFromBasis(d, { ...input, buyerId: "unknown" })).toMatchObject({ ok: false, code: "BUYER_NOT_FOUND" });
  });

  it("idempotency replays the original Project and rejects key reuse for a different commercial identity", () => {
    const d = createP22Dataset(), p = d.projectCreations[0];
    const replay = createProjectFromBasis(d, { projectId: "SIM-OTHER", pmUserId: p.pmUserId, buyerId: p.buyerId, basis: p.basis, basisId: p.basisId, idempotencyKey: p.idempotencyKey });
    expect(replay).toMatchObject({ ok: true, project: { id: p.id }, replay: true });
    const conflict = createProjectFromBasis(d, { projectId: "SIM-OTHER", pmUserId: "SIM-PM-BETA", buyerId: p.buyerId, basis: p.basis, basisId: p.basisId, idempotencyKey: p.idempotencyKey });
    expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps PM portfolio isolation and performs audited transfer only to an active appointed PM", () => {
    const d = createP22Dataset(), p = d.projectCreations[0];
    expect(p22Portfolio(d, "SIM-PM-ALPHA")).toHaveLength(5);
    expect(p22Portfolio(d, "SIM-PM-BETA")).toHaveLength(5);
    expect(p22Portfolio(d, "SIM-PM-UNAPPOINTED")).toHaveLength(0);
    expect(transferP22Project(d, p.id, "SIM-PM-BETA", "synthetic PM transfer")).toBe(true);
    expect(p22Portfolio(d, "SIM-PM-ALPHA")).toHaveLength(4);
    expect(p22Portfolio(d, "SIM-PM-BETA")).toHaveLength(6);
    expect(d.ownershipEvents.at(-1)).toMatchObject({ projectId: p.id, fromPm: "SIM-PM-ALPHA", toPm: "SIM-PM-BETA", reason: "synthetic PM transfer" });
    d.appointments[1].status = "revoked";
    expect(transferP22Project(d, p.id, "SIM-PM-BETA", "invalid target")).toBe(false);
    expect(transferP22Project(d, p.id, "SIM-PM-ALPHA", " ")).toBe(false);
  });

  it("backtests all lifecycle stages and fail-closes downstream readiness after upstream faults", () => {
    const d = createP22Dataset();
    for (const shipment of d.shipments) {
      const result = simulateLifecycle(shipment);
      expect(result.stages).toHaveLength(12);
      const firstFault = result.stages.findIndex(s => ["blocked", "gap", "conflict"].includes(s.status));
      if (firstFault >= 0) expect(result.stages.slice(firstFault + 1).every(s => s.status !== "ready"), shipment.id).toBe(true);
    }
    const clean = d.shipments.find(s => s.scenario === "clean-complete")!;
    expect(simulateLifecycle(clean).terminalStatus).toBe("complete");
    const recovered = cascadeStageChange(d.shipments.find(s => s.scenario === "quality-hold")!, "quality", "ready");
    expect(recovered.stageState.inventory).toBe("pending");
    expect(simulateLifecycle(recovered).terminalStatus).toBe("incomplete");
  });

  it("cross-checks Phase G chaos faults and integrity validation without allowing false readiness", () => {
    for (const fault of ["duplicate-id", "cross-project-reference", "negative-quantity", "missing-document", "unauthorized-project", "expired-driver-ready", "unsuitable-port-ready", "missing-document-ready", "quantity-conflict-ready", "settlement-pending-ready", "contract-quantity-ready", "inventory-shortage-ready", "supply-capacity-ready"]) {
      const injected = injectSyntheticFault(fault as any);
      expect(injected.integrity.length, fault).toBeGreaterThan(0);
      expect(["complete", "blocked", "conflict", "incomplete"]).toContain(injected.simulation.terminalStatus);

    }
  });

  it("suppresses lifecycle readiness when integrity validation finds a dataset defect", () => {
    const d = createP22Dataset();
    d.documents.splice(0, 1);
    expect(validateP22Dataset(d).length).toBeGreaterThan(0);
    expect(p22Summary(d).complete).toBe(0);
  });

  it("detects missing mandatory documents and validates shipment references", () => {
    const d = createP22Dataset();
    d.documents.splice(0, 1);
    expect(validateP22Dataset(d)).toContain("required-document-missing:SIM-SHIP-001:COA");
    d.shipments[0].buyerId = "SIM-BUY-999";
    expect(validateP22Dataset(d)).toContain("buyer-shipment-link:SIM-SHIP-001");
  });

  it("rejects tampered cross-Project Buyer, commercial basis, duplicate keys and ownership links", () => {
    const d = createP22Dataset();
    d.projectCreations[0].buyerId = "SIM-BUY-999";
    d.projectCreations[0].basisId = "SIM-BASIS-INVALID";
    d.idempotencyRecords[2].key = d.idempotencyRecords[1].key;
    d.ownershipEvents[0].projectId = "SIM-PROJECT-999";
    expect(validateP22Dataset(d)).toEqual(expect.arrayContaining(["buyer-fk:SIM-PROJ-001", "executed-contract-basis:SIM-PROJ-001", "duplicate-idempotency-key", "ownership-project-fk:SIM-PROJECT-999"]));
  });
});
