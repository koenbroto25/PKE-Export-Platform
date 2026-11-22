export type RegulatoryOperator = "eq"|"ne"|"in"|"not_in"|"gt"|"gte"|"lt"|"lte"|"between"|"contains"|"exists";
export interface RegulatoryCondition { field_path:string; operator:RegulatoryOperator; comparison_value:unknown; is_mandatory?:boolean; condition_group?:number; }
export interface RegulatoryRuleInput { ruleVersionId:string; ruleCode:string; title:string; outcome:"require"|"prohibit"|"allow"|"manual_review"|"informational"; conditions:RegulatoryCondition[]; requiredDocuments?:unknown[]; }
export interface RegulatoryEvaluation { ruleVersionId:string; ruleCode:string; resultStatus:"pass"|"fail"|"pending"|"manual_review"|"not_applicable"; reason:string; requiredDocuments:unknown[]; missingDocuments:unknown[]; evidence:unknown[]; }
const getPath=(value:unknown,path:string):unknown=>{
  if(!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(path)) return undefined;
  return path.split(".").reduce<unknown>((current,key)=>current && typeof current==="object" && !Array.isArray(current) ? (current as Record<string,unknown>)[key] : undefined,value);
};
const compare=(actual:unknown,operator:RegulatoryOperator,expected:unknown):boolean=>{
  if(operator==="exists") return expected===false ? actual===undefined||actual===null : actual!==undefined&&actual!==null;
  if(actual===undefined||actual===null) return false;
  switch(operator){
    case "eq": return JSON.stringify(actual)===JSON.stringify(expected);
    case "ne": return JSON.stringify(actual)!==JSON.stringify(expected);
    case "in": return Array.isArray(expected)&&expected.some(x=>JSON.stringify(x)===JSON.stringify(actual));
    case "not_in": return Array.isArray(expected)&&!expected.some(x=>JSON.stringify(x)===JSON.stringify(actual));
    case "gt": return typeof actual==="number"&&typeof expected==="number"&&actual>expected;
    case "gte": return typeof actual==="number"&&typeof expected==="number"&&actual>=expected;
    case "lt": return typeof actual==="number"&&typeof expected==="number"&&actual<expected;
    case "lte": return typeof actual==="number"&&typeof expected==="number"&&actual<=expected;
    case "between": return typeof actual==="number"&&Array.isArray(expected)&&expected.length===2&&typeof expected[0]==="number"&&typeof expected[1]==="number"&&actual>=expected[0]&&actual<=expected[1];
    case "contains": return typeof actual==="string"&&typeof expected==="string" ? actual.includes(expected) : Array.isArray(actual)&&actual.some(x=>JSON.stringify(x)===JSON.stringify(expected));
  }
};
export function evaluateRegulatoryRule(rule:RegulatoryRuleInput,input:Record<string,unknown>,availableDocumentCodes:Set<string>):RegulatoryEvaluation{
  const conditions=rule.conditions??[];
  if(conditions.some(c=>!c.field_path||!["eq","ne","in","not_in","gt","gte","lt","lte","between","contains","exists"].includes(c.operator))){
    return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:"manual_review",reason:"Unsupported or malformed rule condition; evaluation failed closed.",requiredDocuments:rule.requiredDocuments??[],missingDocuments:[],evidence:[]};
  }
  const groups=new Map<number,RegulatoryCondition[]>();
  for(const condition of conditions){const group=condition.condition_group??1;groups.set(group,[...(groups.get(group)??[]),condition]);}
  const matched=groups.size===0 ? null : [...groups.values()].some(group=>group.every(c=>compare(getPath(input,c.field_path),c.operator,c.comparison_value)));
  const required=(rule.requiredDocuments??[]) as Array<{documentCode?:string;requirementKind?:string}>;
  const mandatory=required.filter(d=>d.requirementKind!=="optional");
  const missing=mandatory.filter(d=>!d.documentCode||!availableDocumentCodes.has(d.documentCode));
  if(matched===null) return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:rule.outcome==="manual_review"?"manual_review":"pending",reason:"Rule has no executable conditions; human review is required.",requiredDocuments:required,missingDocuments:missing,evidence:[]};
  if(!matched) return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:"not_applicable",reason:"Rule conditions did not match the supplied assessment snapshot.",requiredDocuments:required,missingDocuments:[],evidence:[]};
  if(rule.outcome==="manual_review") return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:"manual_review",reason:"Matched rule explicitly requires human review.",requiredDocuments:required,missingDocuments:missing,evidence:[]};
  if(rule.outcome==="prohibit") return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:"fail",reason:"Matched prohibitive regulatory rule.",requiredDocuments:required,missingDocuments:missing,evidence:[]};
  if(rule.outcome==="require"&&missing.length) return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:"fail",reason:"One or more mandatory documents are not present in the verified document set.",requiredDocuments:required,missingDocuments:missing,evidence:[]};
  return {ruleVersionId:rule.ruleVersionId,ruleCode:rule.ruleCode,resultStatus:"pass",reason:rule.outcome==="informational"?"Matched informational rule.":"Rule conditions satisfied.",requiredDocuments:required,missingDocuments:[],evidence:[]};
}
export function summarizeRegulatoryAssessment(results:RegulatoryEvaluation[]):{overallStatus:"pass"|"fail"|"pending"|"manual_review"|"not_applicable";failedCount:number;pendingCount:number}{
  const failedCount=results.filter(r=>r.resultStatus==="fail").length;
  const pendingCount=results.filter(r=>r.resultStatus==="pending"||r.resultStatus==="manual_review").length;
  if(failedCount) return {overallStatus:"fail",failedCount,pendingCount};
  if(results.some(r=>r.resultStatus==="manual_review")) return {overallStatus:"manual_review",failedCount,pendingCount};
  if(pendingCount||results.length===0) return {overallStatus:"pending",failedCount,pendingCount};
  if(results.every(r=>r.resultStatus==="not_applicable")) return {overallStatus:"not_applicable",failedCount,pendingCount};
  return {overallStatus:"pass",failedCount,pendingCount};
}
