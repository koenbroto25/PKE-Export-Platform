import {describe,expect,it} from "vitest";
import {evaluateRegulatoryRule,summarizeRegulatoryAssessment} from "./regulatory-engine.js";
const base={ruleVersionId:"v1",ruleCode:"R1",title:"Test",outcome:"require" as const,conditions:[{field_path:"shipment.destinationCountry",operator:"eq" as const,comparison_value:"CN"}]};
describe("deterministic regulatory rule engine",()=>{
 it("passes a matching rule when all mandatory documents exist",()=>{const r=evaluateRegulatoryRule({...base,requiredDocuments:[{documentCode:"COO",requirementKind:"mandatory"}]},{shipment:{destinationCountry:"CN"}},new Set(["COO"]));expect(r.resultStatus).toBe("pass");});
 it("fails a matched mandatory-document rule when evidence is missing",()=>{const r=evaluateRegulatoryRule({...base,requiredDocuments:[{documentCode:"COO",requirementKind:"mandatory"}]},{shipment:{destinationCountry:"CN"}},new Set());expect(r.resultStatus).toBe("fail");expect(r.missingDocuments).toHaveLength(1);});
 it("does not apply non-matching rules",()=>{const r=evaluateRegulatoryRule(base,{shipment:{destinationCountry:"PK"}},new Set());expect(r.resultStatus).toBe("not_applicable");});
 it("fails closed for malformed operators and unsupported conditions",()=>{const r=evaluateRegulatoryRule({...base,conditions:[{field_path:"shipment.x",operator:"wat" as never,comparison_value:1}]},{shipment:{x:1}},new Set());expect(r.resultStatus).toBe("manual_review");});
 it("requires human review for conditionless rules",()=>{const r=evaluateRegulatoryRule({...base,conditions:[]},{},new Set());expect(r.resultStatus).toBe("pending");});
 it("prioritizes failures and manual review in the assessment summary",()=>{const a=evaluateRegulatoryRule(base,{shipment:{destinationCountry:"CN"}},new Set());expect(summarizeRegulatoryAssessment([a]).overallStatus).toBe("pass");});
 it("does not call an all-nonapplicable ruleset a compliance pass",()=>{const r=evaluateRegulatoryRule(base,{shipment:{destinationCountry:"PK"}},new Set());expect(summarizeRegulatoryAssessment([r]).overallStatus).toBe("not_applicable");});
 it("returns pending when no effective rules are available",()=>{expect(summarizeRegulatoryAssessment([]).overallStatus).toBe("pending");});
});
