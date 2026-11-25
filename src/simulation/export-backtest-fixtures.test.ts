import {describe,it,expect} from "vitest";
import {SYNTHETIC_EXPORT_TRANSACTIONS,backtestSyntheticExport} from "./export-backtest-fixtures";
describe("synthetic transaction-level export readiness backtest",()=>{
 it("contains 36 unique synthetic transaction fixtures and isolated identities",()=>{
  expect(SYNTHETIC_EXPORT_TRANSACTIONS).toHaveLength(36);
  expect(SYNTHETIC_EXPORT_TRANSACTIONS.every(s=>s.simulationOnly===true&&s.scenarioId.startsWith("SIM-")&&s.shipmentId.startsWith("SIM-"))).toBe(true);
  expect(new Set(SYNTHETIC_EXPORT_TRANSACTIONS.map(s=>s.shipmentId)).size).toBe(SYNTHETIC_EXPORT_TRANSACTIONS.length);
 });
 it("all safety-critical exceptions never evaluate READY",()=>{
  for(const id of ["SIM-002","SIM-004","SIM-005","SIM-006","SIM-009","SIM-012","SIM-014","SIM-027","SIM-028","SIM-030","SIM-037","SIM-044","SIM-045","SIM-052","SIM-053","SIM-054","SIM-055","SIM-056","SIM-057","SIM-059","SIM-060","SIM-061","SIM-063","SIM-064","SIM-065","SIM-066","SIM-067","SIM-069","SIM-070","SIM-071"])expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId===id)!).expectedOutcome,id).not.toBe("ready");
 });
 it("all safety-critical exceptions never evaluate READY",()=>{
  for(const id of ["SIM-002","SIM-004","SIM-005","SIM-006","SIM-009","SIM-012","SIM-014","SIM-027","SIM-028","SIM-030","SIM-037","SIM-044","SIM-045","SIM-052","SIM-053","SIM-054","SIM-055","SIM-056","SIM-057","SIM-059","SIM-060","SIM-061","SIM-063","SIM-064","SIM-065","SIM-066","SIM-067","SIM-069","SIM-070","SIM-071"])expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId===id)!).expectedOutcome,id).not.toBe("ready");
 });
 it("ready complete shipment passes all milestone gates",()=>{
  const f=backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-001")!);
  expect(f.expectedOutcome).toBe("ready");expect(Object.values(f.stages).every(x=>x==="ready")).toBe(true);
 });
 it("short supply, QA hold, stock shortage, truck delay and capacity excess never pass readiness",()=>{
  for(const id of ["SIM-002","SIM-004","SIM-005","SIM-006","SIM-027"])expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId===id)!).expectedOutcome).not.toBe("ready");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-004")!).stages.quality).toBe("hold");
 });
 it("quantity discrepancy is review, port unverified is review, and genealogy missing blocks",()=>{
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-009")!).expectedOutcome).toBe("review");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-028")!).stages.port).toBe("unverified");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-037")!).expectedOutcome).toBe("blocked");
 });
 it("missing documents block and external customs pending remains review",()=>{
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-012")!).expectedOutcome).toBe("blocked");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-013")!).stages.customs).toBe("pending");
 });
 it("FX variance, stale AIS and unavailable external providers do not produce false readiness",()=>{
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-014")!).expectedOutcome).toBe("review");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-011")!).stages.vessel).toBe("stale");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-045")!).expectedOutcome).toBe("review");
 });
 it("fails closed on invalid numeric inputs, identity, documents, timestamps and FX values",()=>{
  for(const id of ["SIM-052","SIM-054","SIM-055","SIM-056","SIM-057","SIM-065","SIM-066","SIM-067"])expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId===id)!).expectedOutcome).not.toBe("ready");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-052")!).stages.vessel).toBe("unverified");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-054")!).stages.contract).toBe("blocked");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-055")!).stages.settlement).toBe("blocked");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-066")!).stages.contract).toBe("blocked");
 });
 it("validates partial shipment quantity against approved allocation and physical evidence",()=>{
  const partial=backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-058")!);
  expect(partial.expectedOutcome).toBe("ready");
  expect(partial.stages.warehouse).toBe("ready");expect(partial.stages.loading).toBe("ready");
  const wrongAllocation=backtestSyntheticExport({...SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-058")!,allocatedMt:1000});
  expect(wrongAllocation.stages.warehouse).toBe("mismatch");
  const wrongTally=backtestSyntheticExport({...SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-058")!,tallyMt:1250});
  expect(wrongTally.stages.loading).toBe("mismatch");
 });
 it("validates document expiry timestamp against simulated current time",()=>{
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-070")!).stages.documents).toBe("stale");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-071")!).stages.documents).toBe("unverified");
 });
 it("handles operational partial shipment, expired documents, GPS unverified, rejected QA/customs and pending settlement",()=>{
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-058")!).expectedOutcome).toBe("ready");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-059")!).stages.documents).toBe("stale");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-060")!).stages.transport).toBe("unverified");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-063")!).stages.quality).toBe("blocked");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-064")!).stages.customs).toBe("blocked");
  expect(backtestSyntheticExport(SYNTHETIC_EXPORT_TRANSACTIONS.find(s=>s.scenarioId==="SIM-062")!).stages.settlement).toBe("pending");
 });
 it("evaluates the stage-by-stage chain and always returns actionable simulation labels",()=>{
  for(const s of SYNTHETIC_EXPORT_TRANSACTIONS){const f=backtestSyntheticExport(s);expect(Object.keys(f.stages)).toHaveLength(12);expect(f.simulationOnly).toBe(true);expect(f.userFacingMessage).toContain("Backtest");}
 });
});
