export type ReviewFindingKind="missing-evidence"|"conflict"|"stale"|"scope-mismatch"|"source-changed"|"invalid-correction"|"unknown"|"quantity-mismatch";
export type ReviewStatus="open"|"assigned"|"verified"|"rejected"|"deferred";
export type ReviewDecision="verify"|"reject"|"defer"|"assign";
export type ReviewItem={id:string;projectId:string;dependencyId:string;findingKind:ReviewFindingKind;severity:"info"|"warning"|"error";sourceIds:string[];evidenceRecordIds:string[];provenance:string[];summary:string;aiSuggestion?:string;status:ReviewStatus;assignedReviewerId?:string;decisionNote?:string;createdAt:string;updatedAt:string;decisionAt?:string};
export type ReviewActor={id:string;projectId:string;permissions:string[];isHuman:boolean};
export type ReviewTransitionInput={item:ReviewItem;actor:ReviewActor;decision:ReviewDecision;at:string;note?:string;assignTo?:string};
export type ReviewTransitionResult={ok:boolean;item?:ReviewItem;code?:string;message?:string};
const validTime=(s:string)=>Number.isFinite(Date.parse(s));
export function canReadReviewItem(item:ReviewItem,actor:ReviewActor):boolean{return Boolean(actor?.isHuman&&actor.projectId===item.projectId&&actor.permissions.includes("knowledge.review.view"));}
export function transitionReviewItem(input:ReviewTransitionInput):ReviewTransitionResult{
 const {item,actor,decision,at,note,assignTo}=input;
 if(!canReadReviewItem(item,actor))return{ok:false,code:"REVIEW_SCOPE_DENIED",message:"Reviewer identity, project scope, or read permission is invalid."};
 if(!actor.permissions.includes("knowledge.review.decide"))return{ok:false,code:"REVIEW_DECISION_DENIED",message:"Human review permission is required."};
 if(!validTime(at)||Date.parse(at)<Date.parse(item.createdAt))return{ok:false,code:"INVALID_REVIEW_TIME",message:"Review timestamp must be valid and not precede item creation."};
 if(["verified","rejected"].includes(item.status))return{ok:false,code:"TERMINAL_REVIEW",message:"Terminal review cannot be changed; create a new review item with linked provenance."};
 if(decision==="assign"){if(!assignTo?.trim())return{ok:false,code:"ASSIGNEE_REQUIRED",message:"Assignment target is required."};return{ok:true,item:{...item,status:"assigned",assignedReviewerId:assignTo,updatedAt:at}};}
 if(!note?.trim())return{ok:false,code:"DECISION_NOTE_REQUIRED",message:"A human decision note is required."};
 if(decision==="verify")return{ok:true,item:{...item,status:"verified",decisionNote:note,updatedAt:at,decisionAt:at}};
 if(decision==="reject")return{ok:true,item:{...item,status:"rejected",decisionNote:note,updatedAt:at,decisionAt:at}};
 if(decision==="defer")return{ok:true,item:{...item,status:"deferred",decisionNote:note,updatedAt:at}};
 return{ok:false,code:"UNKNOWN_DECISION",message:"Unsupported decision."};
}
export function createReviewItem(input:Omit<ReviewItem,"status"|"createdAt"|"updatedAt">,at:string):ReviewItem{if(!input.id.trim()||!input.projectId.trim()||!input.dependencyId.trim()||!validTime(at))throw new Error("Invalid review item identity or timestamp.");return{...input,status:"open",createdAt:at,updatedAt:at};}
export function summarizeReviewQueue(items:ReviewItem[],projectId:string,actor:ReviewActor){const scoped=items.filter(item=>item.projectId===projectId&&canReadReviewItem(item,actor));return{visible:scoped.length,open:scoped.filter(x=>x.status==="open").length,assigned:scoped.filter(x=>x.status==="assigned").length,deferred:scoped.filter(x=>x.status==="deferred").length,verified:scoped.filter(x=>x.status==="verified").length,rejected:scoped.filter(x=>x.status==="rejected").length,decisionAuthority:"human-only",syntheticDataAllowed:true};}
