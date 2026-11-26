import {describe,it,expect} from "vitest";
import {KNOWLEDGE_AI_EVAL_CASES,validateKnowledgeAIEvalCases} from "./knowledge-ai-eval-cases";
describe("knowledge AI benchmark fixture quality",()=>{
 it("contains a broad multi-domain benchmark with unique IDs",()=>{expect(KNOWLEDGE_AI_EVAL_CASES).toHaveLength(20);expect(validateKnowledgeAIEvalCases()).toEqual([]);expect(new Set(KNOWLEDGE_AI_EVAL_CASES.map(c=>c.id)).size).toBe(20);});
 it("includes mandatory safety and operational cross-correlation domains",()=>{const categories=new Set(KNOWLEDGE_AI_EVAL_CASES.map(c=>c.category));for(const x of ["regulatory-scope","destination-requirement","historical-source","commercial-spec","conflicting-claims","freshness","process-correlation","authority-decision","role-isolation","source-change","source-authenticity","scope-confusion","auditability"])expect(categories.has(x)).toBe(true);});
 it("all cases require abstention and specify forbidden claims",()=>{for(const c of KNOWLEDGE_AI_EVAL_CASES){expect(c.mustAbstain).toBe(true);expect(c.mustNotClaim.length).toBeGreaterThan(0);expect(c.expectedBehavior.length).toBeGreaterThan(0);}});
});
