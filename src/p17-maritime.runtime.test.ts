import { describe,expect,it } from "vitest";
import { registerP17MaritimeRoutes } from "./p17-maritime.js";

const projectA="a1000000-0000-4000-8000-000000000001";
const projectB="b2000000-0000-4000-8000-000000000002";
const positionId="c3000000-0000-4000-8000-000000000003";
const userId="d4000000-0000-4000-8000-000000000004";
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Route={handlers:Function[]};
function makeHarness(){
 const routes=new Map<string,Route>();
 let gate:Function|undefined;
 const app:any={
  use:(handler:Function)=>{gate=handler;},
  get:(path:string,...handlers:Function[])=>routes.set("GET "+path,{handlers}),
  post:(path:string,...handlers:Function[])=>routes.set("POST "+path,{handlers}),
  put:(path:string,...handlers:Function[])=>routes.set("PUT "+path,{handlers}),
  patch:(path:string,...handlers:Function[])=>routes.set("PATCH "+path,{handlers}),
  delete:(path:string,...handlers:Function[])=>routes.set("DELETE "+path,{handlers})
 };
 const deps:any={
  requireAuth:(req:any,res:any,next:Function)=>req.user?next():res.status(401).json({code:"AUTH_REQUIRED"}),
  requireAdmin:(req:any,res:any,next:Function)=>req.user?.platformAdmin?next():res.status(403).json({code:"ADMIN_REQUIRED"}),
  requireProjectPermission:async(req:any,res:any,p:string,permission:string)=>{
   if(req.user?.projectId===p&&req.user?.permissions?.includes(permission))return true;
   res.status(403).json({code:"PROJECT_PERMISSION_REQUIRED"});return false;
  },
  uuidPattern,
  privateStorage:{status:()=>({available:false,bucket:null}),validateObjectKey:()=>({ok:false}),validateFileMetadata:()=>({ok:false}),presignedUpload:async()=>({}),verifyObject:async()=>({})}
 };
 registerP17MaritimeRoutes(app,deps);
 const observation={id:positionId,source_id:"e5000000-0000-4000-8000-000000000005",vessel_id:"f6000000-0000-4000-8000-000000000006",vessel_name:"MV Test Vessel",mmsi:"123456789",latitude:1,longitude:2,observed_at:"2026-11-23T03:00:00.000Z",provider_code:"AIS_TEST",provider_reference:"ref-1",source_reference:"source-1",attribution_text:"test",source_quality:"fresh",created_by:"e7000000-0000-4000-8000-000000000007",created_at:"2026-11-23T03:00:00.000Z"};
 const queries:string[]=[];
 let activeUserId:string|null=null;
 const db:any={query:async(sql:string,params:any[]=[] )=>{
  queries.push(sql);
  if(sql.includes("FROM public.migration_history"))return {rows:[{applied_count:15}]};
  if(sql.includes("p17d_vessel_position_admin_review_update"))return {rows:[{policy_count:5}]};
  if(sql.includes("p.polname='pke_scope_select'"))return {rows:[{safe_policy_count:1}]};
  if(sql.includes("pg_class")&&sql.includes("policy_count"))return {rows:[{found_count:40,unsafe_count:0}]};
  if(sql.includes("FROM public.permissions"))return {rows:[{permission_count:26}]};
  if(sql.includes("pke_project_role_permission_allowlist"))return {rows:[{allowed_count:63}]};
  if(sql.includes("pke_is_platform_admin() AS is_admin"))return {rows:[{is_admin:false}]};
  if(sql.includes("SELECT o.id,o.source_id")&&sql.includes("review_status='pending'"))return {rows:params[0]===projectA&&activeUserId!==observation.created_by?[observation]:[]};
  if(sql.includes("SELECT o.id,o.source_id")&&sql.includes("o.source_id IS NOT NULL")&&sql.includes("ORDER BY o.created_at DESC"))return {rows:[observation]};
  if(sql.includes("UPDATE public.vessel_tracking_positions SET review_status"))return {rows:params.length===3||params[1]===projectA?[{...observation,review_status:params.length===3?params[1]:params[2],reviewed_by:userId,review_note:params.length===3?params[2]:params[3]}]:[]};
  return {rows:[]};
 }};
 function request(method:string,path:string,user:any,params:any={},body:any={}){
  const req:any={method,path,originalUrl:path,params,body,headers:{},user,db,query:{}};
  const res:any={statusCode:200,body:null,status(code:number){this.statusCode=code;return this;},json(value:any){this.body=value;return this;}};
  return {req,res};
 }
 async function invoke(method:string,path:string,user:any,params:any={},body:any={}){
  const route=routes.get(method+" "+path);if(!route)throw new Error("Missing route "+method+" "+path);
  const {req,res}=request(method,path,user,params,body);
  activeUserId=user?.id||null;
  let nextCalled=false;
  await gate!(req,res,()=>{nextCalled=true;});
  if(!nextCalled)throw new Error("P17 gate rejected: "+JSON.stringify(res.body)+"; queries="+queries.join(" || "));
  const dispatch=async(index:number):Promise<void>=>{
   const handler=route.handlers[index];if(!handler)return;
   if(handler.length>=3){
    let nextCalled=false;
    await handler(req,res,()=>{nextCalled=true;});
    if(nextCalled)await dispatch(index+1);
   }else await handler(req,res);
  };
  await dispatch(0);
  return {req,res};
 }
 return {invoke,queries};
}
const pendingUser={id:userId,projectId:projectA,permissions:["vessel.position.review"]};
const queuePath="/api/v1/projects/:projectId/vessel-positions/review-queue";
const decisionPath="/api/v1/projects/:projectId/vessel-positions/:positionId/review";

describe("P17-D authenticated runtime API acceptance",()=>{
 it("rejects unauthenticated requests after the P17 release gate passes",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET",queuePath,null,{projectId:projectA});
  expect(res.statusCode).toBe(401);expect(res.body.code).toBe("AUTH_REQUIRED");
 });
 it("rejects a user without vessel.position.review",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET",queuePath,{...pendingUser,permissions:[]},{projectId:projectA});
  expect(res.statusCode).toBe(403);expect(res.body.code).toBe("PROJECT_PERMISSION_REQUIRED");
 });
 it("returns only the pending queue for the authorized Project",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET",queuePath,pendingUser,{projectId:projectA});
  expect(res.statusCode).toBe(200);expect(res.body.projectId).toBe(projectA);expect(res.body.observations).toHaveLength(1);
  expect(h.queries.some(q=>q.includes("g.project_id=$1::uuid"))).toBe(true);
 });
 it("returns an empty queue for a different Project rather than leaking the first Project's observation",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET",queuePath,{...pendingUser,projectId:projectB},{projectId:projectB});
  expect(res.statusCode).toBe(200);expect(res.body.observations).toHaveLength(0);
 });
 it("accepts an independent PM review for the correct Project",async()=>{
  const h=makeHarness();const {res}=await h.invoke("PATCH",decisionPath,pendingUser,{projectId:projectA,positionId},{reviewStatus:"accepted",reviewNote:"Independent PM review"});
  expect(res.statusCode).toBe(200);expect(res.body.displayable).toBe(true);expect(res.body.observation.reviewed_by).toBe(userId);
  expect(h.queries.some(q=>q.includes("created_by<>req_user_id()")&&q.includes("g.project_id=$2::uuid"))).toBe(true);
 });
 it("rejects a cross-Project IDOR even when the reviewer has access to the other Project",async()=>{
  const h=makeHarness();const {res}=await h.invoke("PATCH",decisionPath,{...pendingUser,projectId:projectB},{projectId:projectB,positionId},{reviewStatus:"accepted",reviewNote:"Cross project attempt"});
  expect(res.statusCode).toBe(409);expect(res.body.code).toBe("AIS_POSITION_MAKER_CHECKER");
 });
 it("blocks non-admin users from the global Admin AIS queue",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET","/api/v1/admin/maritime/vessel-positions",{...pendingUser,platformAdmin:false},{});
  expect(res.statusCode).toBe(403);expect(res.body.code).toBe("ADMIN_REQUIRED");
 });
 it("allows Platform Admin to read the global pending AIS queue",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET","/api/v1/admin/maritime/vessel-positions",{...pendingUser,platformAdmin:true},{});
  expect(res.statusCode).toBe(200);expect(res.body.observations).toHaveLength(1);
 });
 it("allows Platform Admin to independently review a pending AIS observation",async()=>{
  const h=makeHarness();const {res}=await h.invoke("PATCH","/api/v1/admin/maritime/vessel-positions/:id/review",{...pendingUser,platformAdmin:true},{id:positionId},{reviewStatus:"accepted",reviewNote:"Independent admin review"});
  expect(res.statusCode).toBe(200);expect(res.body.displayable).toBe(true);
 });
 it("rejects a self-review attempt before any observation is returned",async()=>{
  const h=makeHarness();const {res}=await h.invoke("GET",queuePath,{...pendingUser,id:"e7000000-0000-4000-8000-000000000007"},{projectId:projectA});
  expect(res.statusCode).toBe(200);expect(res.body.observations).toHaveLength(0);
  expect(h.queries.some(q=>q.includes("created_by<>req_user_id()"))).toBe(true);
 });
});
