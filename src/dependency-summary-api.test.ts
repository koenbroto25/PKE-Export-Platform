import { describe, expect, it } from "vitest";
import { PKE_PROCESS_DEPENDENCIES } from "./knowledge/process-dependency-map.js";
import { DEPENDENCY_WORKSPACE_PERMISSION_CODES, registerDependencySummaryRoute } from "./dependency-summary-api.js";

const PROJECT="00000000-0000-4000-8000-000000000001";
function harness(allowedPermissions: string[] = ["project.view", ...Object.values({
  contract:"contract.view",pks:"pks.site.view",workflow:"workflow.view",operations:"operations.view",
  quality:"quality.sample.view",result:"quality.result.view",inventory:"inventory.view",dispatch:"dispatch.view",
  port:"port.view",shipping:"shipping.view",document:"document.view",compliance:"compliance.view",voyage:"voyage.view",finance:"finance.view"
})]) {
  let route:any;
  const app={get:(path:string,...handlers:any[])=>{route={path,handlers};}};
  const permissionCalls:string[]=[];
  const deps={
    requireAuth:(req:any,res:any,next:any)=>{if(!req.user){res.status(401).json({code:"AUTHENTICATION_REQUIRED"});return;}next();},
    requireProjectPermission:async(_req:any,res:any,_project:string,permission:string)=>{permissionCalls.push(permission);if(!allowedPermissions.includes(permission)){res.status(403).json({code:"PROJECT_PERMISSION_REQUIRED"});return false;}return true;},
    hasProjectPermission:async(_req:any,_project:string,permission:string)=>allowedPermissions.includes(permission),
  };
  registerDependencySummaryRoute(app,deps);
  const invoke=async(req:any)=>{
    const payload:any={};
    const res:any={status(code:number){payload.status=code;return this;},json(body:any){payload.body=body;return this;}};
    const [auth,handler]=route.handlers;
    let proceeded=false;
    auth(req,res,()=>{proceeded=true;});
    if(proceeded) await handler(req,res);
    return payload;
  };
  return {route,invoke,permissionCalls};
}
describe("demo dependency summary API route",()=>{ it("has an explicit permission policy for every dependency source workspace",()=>{
  const sourceWorkspaces=[...new Set(PKE_PROCESS_DEPENDENCIES.map(d=>d.sourceWorkspace))];
  for(const workspace of sourceWorkspaces){
    expect(Object.keys(DEPENDENCY_WORKSPACE_PERMISSION_CODES)).toContain(workspace);
  }
 });

 it("requires authentication and valid project UUID",async()=>{
  const h=harness();
  expect((await h.invoke({params:{projectId:PROJECT},query:{mode:"demo"}})).status).toBe(401);
  expect((await h.invoke({user:{id:"u1"},params:{projectId:"bad"},query:{mode:"demo"}})).status).toBe(400);
 });
 it("requires explicit demo mode and project.view authorization",async()=>{
  const h=harness(["project.view"]);
  expect((await h.invoke({user:{id:"u1"},params:{projectId:PROJECT},query:{}})).status).toBe(400);
  expect((await h.invoke({user:{id:"u1"},params:{projectId:PROJECT},query:{mode:"demo"}})).status).toBeUndefined();
 });
 it("denies authenticated users without project.view",async()=>{
  const h=harness(["contract.view"]);
  const response=await h.invoke({user:{id:"u1"},params:{projectId:PROJECT},query:{mode:"demo"}});
  expect(response.status).toBe(403);
  expect(response.body.code).toBe("PROJECT_PERMISSION_REQUIRED");
 });
 it("labels response synthetic and never live/approved",async()=>{
  const h=harness();
  const response=await h.invoke({user:{id:"u1"},params:{projectId:PROJECT},query:{mode:"demo"}});
  expect(response.body.mode).toBe("demo");
  expect(response.body.dataSource).toBe("synthetic");
  expect(response.body.liveIntegration).toBe(false);
  expect(response.body.authorityDecision).toBe(false);
  expect(response.body.summaries.length).toBe(PKE_PROCESS_DEPENDENCIES.length);
  expect(response.body.summaries.every((s:any)=>s.status==="gap"&&s.freshness==="unknown"&&s.missingEvidenceCount>0)).toBe(true);
 });
 it("filters lifecycle edges by all required source-workspace permissions",async()=>{
  const h=harness(["project.view","contract.view","pks.site.view"]);
  const response=await h.invoke({user:{id:"u1"},params:{projectId:PROJECT},query:{mode:"demo"}});
  expect(response.body.summaries.map((s:any)=>s.dependencyId)).toEqual(["DEP-CONTRACT-SUPPLY"]);
  expect(response.body.summaries[0].sourceLink).toBeNull();
 });
 it("fails closed when source permission lookup throws",async()=>{
  let route:any;const app={get:(_p:string,...handlers:any[])=>route=handlers};
  registerDependencySummaryRoute(app,{requireAuth:(_r:any,_s:any,n:any)=>n(),requireProjectPermission:async()=>true,hasProjectPermission:async()=>{throw Error("db failure");}});
  const req={user:{id:"u"},params:{projectId:PROJECT},query:{mode:"demo"}};
  const payload:any={};const res:any={status(c:number){payload.status=c;return this;},json(b:any){payload.body=b;return this;}};
  await route[1](req,res);
  expect(payload.body.summaries).toEqual([]);
 });
});
