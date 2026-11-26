import express from "express";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { registerDependencySummaryRoute } from "../dependency-summary-api.js";
import { DEPENDENCY_WORKSPACE_PERMISSION_CODES } from "../dependency-summary-api.js";

const PROJECT="00000000-0000-4000-8000-000000000001";
const rolePermissions:Record<string,string[]> = {
  admin:["project.view",...Object.values(DEPENDENCY_WORKSPACE_PERMISSION_CODES).flat()],
  pm:["project.view","contract.view","pks.site.view","workflow.view","operations.view"],
  viewer:["project.view"],
};
let server:any,base="";
async function request(path:string,role?:string){
 const response=await fetch(base+path,{headers:role?{authorization:"Bearer SIM-"+role}:{}});
 return{status:response.status,body:await response.json()};
}
describe("Dependency summary HTTP integration — synthetic permission-filtered API",()=>{
 beforeAll(async()=>{
  const app=express();
  registerDependencySummaryRoute(app,{
   requireAuth:(req:any,res:any,next:any)=>{const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");const role=token?.startsWith("SIM-")?token.slice(4):null;if(!role||!rolePermissions[role])return res.status(401).json({code:"AUTHENTICATION_REQUIRED"});req.user={id:"SIM-USER-"+role,role};next();},
   requireProjectPermission:async(req:any,res:any,projectId:string,permission:string)=>{if(projectId!==PROJECT)return res.status(404).json({code:"PROJECT_NOT_FOUND"}),false;if(!rolePermissions[req.user.role].includes(permission))return res.status(403).json({code:"PROJECT_PERMISSION_REQUIRED"}),false;return true;},
   hasProjectPermission:async(req:any,_projectId:string,permission:string)=>{if(req.headers["x-sim-permission-failure"]==="1")throw new Error("Synthetic permission lookup failure");return rolePermissions[req.user.role].includes(permission);},
  });
  server=app.listen(0,"127.0.0.1");await new Promise<void>((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});base=`http://127.0.0.1:${server.address().port}`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
 it("requires bearer auth and explicit demo query",async()=>{expect((await request(`/api/v1/projects/${PROJECT}/dependency-summaries?mode=demo`)).status).toBe(401);expect((await request(`/api/v1/projects/${PROJECT}/dependency-summaries`,"admin")).status).toBe(400);});
 it("returns synthetic unknown evidence only, never readiness/authority",async()=>{const r=await request(`/api/v1/projects/${PROJECT}/dependency-summaries?mode=demo`,"admin");expect(r.status).toBe(200);expect(r.body).toMatchObject({mode:"demo",dataSource:"synthetic",liveIntegration:false,authorityDecision:false});expect(r.body.summaries.every((x:any)=>x.status==="gap"&&x.freshness==="unknown")).toBe(true);});
 it("filters visible lifecycle dependencies by role workspace permissions",async()=>{const r=await request(`/api/v1/projects/${PROJECT}/dependency-summaries?mode=demo`,"pm");expect(r.status).toBe(200);expect(r.body.summaries.length).toBeGreaterThan(0);expect(r.body.summaries.length).toBeLessThan(DEPENDENCY_WORKSPACE_PERMISSION_CODES.length);const v=await request(`/api/v1/projects/${PROJECT}/dependency-summaries?mode=demo`,"viewer");expect(v.status).toBe(200);expect(v.body.summaries).toHaveLength(0);});
 it("fails closed when source permission lookup throws",async()=>{const response=await fetch(base+`/api/v1/projects/${PROJECT}/dependency-summaries?mode=demo`,{headers:{"authorization":"Bearer SIM-admin","x-sim-permission-failure":"1"}});const body=await response.json();expect(response.status).toBe(200);expect(body.summaries).toHaveLength(0);});
 it("rejects malformed project identifiers before evaluating permissions",async()=>{const r=await request("/api/v1/projects/not-a-uuid/dependency-summaries?mode=demo","admin");expect(r.status).toBe(400);expect(r.body.code).toBe("INVALID_PROJECT_ID");});
});
