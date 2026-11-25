import {describe,it,expect} from "vitest";
import {SYNTHETIC_EXPORT_TRANSACTIONS,backtestSyntheticExport} from "./export-backtest-fixtures";
describe("synthetic transaction-level export readiness backtest",()=>{
 it("uses clearly synthetic identities and unique shipment IDs",()=>{
  expect(SYNTHETIC_EXPORT_TRANSACTIONS.every(s=>s.simulationOnly===true&&s.projectId.startsWith("SIM-")&&s.shipmentId.startsWith("SIM-"))).toBe(true);
  expect(new Set(SYNTHETIC_EXPORT_TRANSACTIONS.map(s=>s.shipmentId)).size).toBe(SYNTHETIC_EXPORT_TRANSACTIONS.length);
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
 it("evaluates the stage-by-stage chain and always returns actionable simulation labels",()=>{
  for(const s of SYNTHETIC_EXPORT_TRANSACTIONS){const f=backtestSyntheticExport(s);expect(Object.keys(f.stages)).toHaveLength(12);expect(f.simulationOnly).toBe(true);expect(f.userFacingMessage).toContain("Backtest");}
 });
});
