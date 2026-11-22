import type { Express, Request, Response, RequestHandler } from "express";
type R = any;
type D = { requireAuth:RequestHandler; requireAdmin:RequestHandler; requireProjectPermission:(req:R,res:Response,projectId:string,permission:string)=>Promise<boolean>; uuidPattern:RegExp };
const bad=(res:Response,status:number,code:string,error:string)=>res.status(status).json({error,code});
const str=(v:unknown,n=200)=>typeof v==="string"?v.trim().slice(0,n):"";
const time=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;

export function registerP17MaritimeRoutes(app:Express,d:D){
 // Production schema is still at migration 053. Block P17 mutations until 096-103
 // and their RLS/policy acceptance are explicitly released on canonical Production.
 const p17WriteReleaseGate:RequestHandler=(req,res,next)=>{
  if(!["POST","PUT","PATCH","DELETE"].includes(req.method)) return next();
  const path=req.path||"";
  const p17ProjectWorkflow=/^\/api\/v1\/projects\/[^/]+\/(?:master-data-change-requests(?:\/|$)|pke-logistics\/(?:simulation-scenarios|change-requests)(?:\/|$)|voyages(?:\/|$)|vessel-nominations(?:\/|$)|vessel-port-calls(?:\/|$))/.test(path);
  const p17AdminProjectWorkflow=/^\/api\/v1\/admin\/projects\/[^/]+\/(?:master-data-change-requests(?:\/|$)|pke-logistics\/change-requests(?:\/|$))/.test(path);
  if(path.startsWith("/api/v1/admin/maritime/")||p17ProjectWorkflow||p17AdminProjectWorkflow){
   return bad(res,503,"P17_SCHEMA_RELEASE_BLOCKED","P17 write workflow is disabled until migrations 096-103 and their RLS/permission acceptance are released to canonical Production.");
  }
  return next();
 };
 app.use(p17WriteReleaseGate);

 const {requireAuth,requireAdmin,requireProjectPermission,uuidPattern}=d;
 const requireProjectAccess=async(req:R,res:Response,projectId:string,permission:string):Promise<boolean>=>{
  const admin=await req.db.query("SELECT public.pke_is_platform_admin() AS is_admin");
  if(admin.rows[0]?.is_admin===true){
   await req.db.query("SELECT set_config('app.current_role','admin',true),set_config('app.current_project_id',$1,true),set_config('app.current_permission_code',$2,true)",[projectId,permission]);
   return true;
  }
  return requireProjectPermission(req,res,projectId,permission);
 };
 // P17-B: port identity reconciliation and versioned GeoJSON. Promotion is explicit and review-gated.
 app.get("/api/v1/admin/maritime/port-crosswalk",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT x.*,p.name AS canonical_port_name FROM public.port_external_id_crosswalk x LEFT JOIN public.ports p ON p.id=x.port_id ORDER BY x.created_at DESC");return res.json({items:q.rows});}
  catch{return bad(res,500,"PORT_CROSSWALK_READ_FAILED","Unable to read port identity crosswalk.");}
 });
 app.post("/api/v1/admin/maritime/port-crosswalk",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{};const source=str(b.sourceCode,80),external=str(b.externalPortId,160),port=str(b.portId,64),url=str(b.sourceUrl,1000);
  if(!source||!external||!uuidPattern.test(port)||!url)return bad(res,400,"PORT_CROSSWALK_INVALID","Source, external ID, canonical port and source URL are required.");
  try{const q=await req.db.query("INSERT INTO public.port_external_id_crosswalk(source_code,external_port_id,port_id,source_url,review_status,created_by) VALUES($1,$2,$3::uuid,$4,'pending',req_user_id()) RETURNING *",[source,external,port,url]);return res.status(201).json({item:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"PORT_CROSSWALK_DUPLICATE","External identity already exists.");return bad(res,500,"PORT_CROSSWALK_CREATE_FAILED","Unable to create port identity candidate.");}
 });
 app.patch("/api/v1/admin/maritime/port-crosswalk/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"PORT_CROSSWALK_ID_INVALID","Invalid crosswalk ID.");
  const status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,2000);
  if(!["approved","rejected"].includes(status)||note.length<5)return bad(res,400,"PORT_CROSSWALK_REVIEW_INVALID","Review status and substantive review note are required.");
  try{const q=await req.db.query("UPDATE public.port_external_id_crosswalk SET review_status=$2,review_note=$3,reviewed_by=req_user_id(),reviewed_at=now() WHERE id=$1::uuid AND review_status='pending' RETURNING *",[id,status,note]);if(!q.rows.length)return bad(res,404,"PORT_CROSSWALK_NOT_REVIEWABLE","Crosswalk candidate not found or already reviewed.");return res.json({item:q.rows[0]});}
  catch{return bad(res,500,"PORT_CROSSWALK_REVIEW_FAILED","Unable to review port identity candidate.");}
 });
 app.get("/api/v1/admin/maritime/port-geospatial-features",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT * FROM public.port_geospatial_features ORDER BY updated_at DESC");return res.json({items:q.rows});}
  catch{return bad(res,500,"PORT_GEO_READ_FAILED","Unable to read port geospatial review queue.");}
 });
 app.post("/api/v1/admin/maritime/port-geospatial-features",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{};const port=str(b.portId,64),type=str(b.featureType,40),geometry=b.geometry,source=str(b.sourceReference,1000);
  if(!uuidPattern.test(port)||!["port_area","anchorage","approach","terminal_area","restricted_area"].includes(type)||!geometry||typeof geometry!=="object"||!source)return bad(res,400,"PORT_GEO_INVALID","Port, supported feature type, geometry and source reference are required.");
  try{const q=await req.db.query("INSERT INTO public.port_geospatial_features(port_id,feature_type,geometry_geojson,source_reference,review_status,created_by) VALUES($1::uuid,$2,$3::jsonb,$4,'pending',req_user_id()) RETURNING *",[port,type,JSON.stringify(geometry),source]);return res.status(201).json({item:q.rows[0]});}
  catch{return bad(res,500,"PORT_GEO_CREATE_FAILED","Unable to create geospatial review candidate.");}
 });
 app.patch("/api/v1/admin/maritime/port-geospatial-features/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"PORT_GEO_ID_INVALID","Invalid geospatial feature ID.");
  const status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,2000);
  if(!["approved","rejected"].includes(status)||note.length<5)return bad(res,400,"PORT_GEO_REVIEW_INVALID","Review status and substantive review note are required.");
  try{const q=await req.db.query("UPDATE public.port_geospatial_features SET review_status=$2,review_note=$3,reviewed_by=req_user_id(),reviewed_at=now() WHERE id=$1::uuid AND review_status='pending' RETURNING *",[id,status,note]);if(!q.rows.length)return bad(res,404,"PORT_GEO_NOT_REVIEWABLE","Geospatial candidate not found or already reviewed.");return res.json({item:q.rows[0]});}
  catch{return bad(res,500,"PORT_GEO_REVIEW_FAILED","Unable to review geospatial candidate.");}
 });
 // P17-A: provider/source governance. Secret values never enter application rows.
 app.get("/api/v1/admin/maritime/sources",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT * FROM public.maritime_data_sources ORDER BY provider_name,source_code");return res.json({sources:q.rows});}
  catch{return bad(res,500,"MARITIME_SOURCE_READ_FAILED","Unable to read maritime source registry.");}
 });
 app.post("/api/v1/admin/maritime/sources",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{};const code=str(b.sourceCode,64),provider=str(b.providerName,160),dataset=str(b.datasetCode,64),cls=str(b.sourceClass,40),terms=str(b.termsUrl,1000);
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(code)||!provider||!dataset||!["port_master","marine_weather","ais","port_geometry","navigation_notice","other"].includes(cls))return bad(res,400,"MARITIME_SOURCE_INVALID","Source identity and class are invalid.");
  try{const q=await req.db.query("INSERT INTO public.maritime_data_sources(source_code,provider_name,dataset_code,source_class,terms_url,rights_status,enabled,created_by) VALUES($1,$2,$3,$4,$5,'pending_review',false,req_user_id()) RETURNING *",[code,provider,dataset,cls,terms||null]);return res.status(201).json({source:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"MARITIME_SOURCE_EXISTS","Source code already exists.");return bad(res,500,"MARITIME_SOURCE_CREATE_FAILED","Unable to register source.");}
 });
 app.patch("/api/v1/admin/maritime/sources/:id/rights",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const status=str(req.body?.rightsStatus,30),evidence=str(req.body?.evidenceUrl,1000),note=str(req.body?.reviewNote,2000),expiry=time(req.body?.expiresAt);
  if(!["approved","restricted","revoked","pending_review"].includes(status)||note.length<5||(status==="approved"&&!evidence))return bad(res,400,"MARITIME_RIGHTS_REVIEW_INVALID","A valid rights decision, evidence URL for approval and review note are required.");
  try{const q=await req.db.query("UPDATE public.maritime_data_sources SET rights_status=$2,rights_evidence_url=$3,rights_review_note=$4,rights_reviewed_by=req_user_id(),rights_reviewed_at=now(),rights_expires_at=$5 WHERE id=$1::uuid RETURNING *",[id,status,evidence||null,note,expiry]);if(!q.rows.length)return bad(res,404,"MARITIME_SOURCE_NOT_FOUND","Source not found.");return res.json({source:q.rows[0]});}
  catch{return bad(res,500,"MARITIME_RIGHTS_REVIEW_FAILED","Unable to record rights decision.");}
 });
 app.put("/api/v1/admin/maritime/sources/:id/field-permissions",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id)||!Array.isArray(req.body?.fields))return bad(res,400,"MARITIME_FIELD_PERMISSIONS_INVALID","Source ID and field permission list are required.");
  try{await req.db.query("DELETE FROM public.maritime_source_field_permissions WHERE source_id=$1::uuid",[id]);for(const f of req.body.fields){const field=str(f?.fieldCode,100),purpose=str(f?.purposeCode,100),allowed=f?.allowed===true;if(!field||!purpose) return bad(res,400,"MARITIME_FIELD_PERMISSION_INVALID","Field and purpose are required.");await req.db.query("INSERT INTO public.maritime_source_field_permissions(source_id,field_code,purpose_code,allowed,created_by) VALUES($1::uuid,$2,$3,$4,req_user_id())",[id,field,purpose,allowed]);}return res.json({ok:true});}
  catch{return bad(res,500,"MARITIME_FIELD_PERMISSIONS_FAILED","Unable to save field permissions.");}
 });
 app.patch("/api/v1/admin/maritime/sources/:id/enable",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const enabled=req.body?.enabled===true;
  try{const q=await req.db.query("UPDATE public.maritime_data_sources SET enabled=$2 WHERE id=$1::uuid AND ($2=false OR (rights_status='approved' AND rights_evidence_url IS NOT NULL AND internal_processing_allowed=true AND rights_expires_at>now())) RETURNING *",[id,enabled]);if(!q.rows.length)return bad(res,409,"SOURCE_RIGHTS_NOT_ACTIVE","Source cannot be enabled without current approved rights.");return res.json({source:q.rows[0]});}
  catch{return bad(res,500,"MARITIME_SOURCE_ENABLE_FAILED","Unable to change source state.");}
 });
 app.post("/api/v1/admin/maritime/sources/:id/runs",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const key=str(req.body?.idempotencyKey,128);if(!key)return bad(res,400,"MARITIME_RUN_IDEMPOTENCY_REQUIRED","Idempotency key is required.");
  try{const q=await req.db.query("INSERT INTO public.maritime_ingestion_runs(source_id,idempotency_key,status,started_by) SELECT id,$2,'running',req_user_id() FROM public.maritime_data_sources WHERE id=$1::uuid AND enabled=true AND rights_status='approved' AND rights_expires_at>now() AND internal_processing_allowed=true RETURNING *",[id,key]);if(!q.rows.length)return bad(res,409,"SOURCE_RIGHTS_NOT_CURRENT","Source is not enabled with current internal-processing rights.");return res.status(201).json({run:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"MARITIME_RUN_DUPLICATE","Run idempotency key already exists.");return bad(res,500,"MARITIME_RUN_CREATE_FAILED","Unable to start ingestion run.");}
 });
 app.post("/api/v1/admin/maritime/runs/:runId/staging",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const run=req.params.runId;if(!uuidPattern.test(run)||!Array.isArray(req.body?.records))return bad(res,400,"MARITIME_STAGING_INVALID","Run ID and record batch are required.");
  try{const staged=[];for(const item of req.body.records){const external=str(item?.externalRecordId,240),payload=item?.payload;if(!external||!payload||typeof payload!=="object")return bad(res,400,"MARITIME_STAGING_RECORD_INVALID","External ID and object payload are required.");const hash=str(item?.payloadSha256,64);if(!/^[a-f0-9]{64}$/.test(hash))return bad(res,400,"MARITIME_PAYLOAD_HASH_INVALID","A SHA-256 payload hash is required.");const q=await req.db.query("INSERT INTO public.maritime_ingestion_staging(run_id,external_record_id,payload,payload_sha256,status) VALUES($1::uuid,$2,$3::jsonb,$4,'pending_review') ON CONFLICT(run_id,external_record_id,payload_sha256) DO NOTHING RETURNING *",[run,external,JSON.stringify(payload),hash]);if(q.rows[0])staged.push(q.rows[0]);}return res.status(201).json({staged});}
  catch{return bad(res,500,"MARITIME_STAGING_FAILED","Unable to stage provider records.");}
 });
 app.patch("/api/v1/admin/maritime/staging/:stagingId/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.stagingId;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_STAGING_ID_INVALID","Invalid staging ID.");
  const status=str(req.body?.reviewStatus,30),note=str(req.body?.reviewNote,2000);
  if(!["accepted","rejected"].includes(status)||note.length<5)return bad(res,400,"MARITIME_STAGING_REVIEW_INVALID","Review decision and substantive note are required.");
  try{const q=await req.db.query("UPDATE public.maritime_ingestion_staging SET status=$2,review_note=$3,reviewed_by=req_user_id(),reviewed_at=now() WHERE id=$1::uuid AND status='pending_review' RETURNING *",[id,status,note]);if(!q.rows.length)return bad(res,404,"MARITIME_STAGING_NOT_REVIEWABLE","Staged record not found or already reviewed.");return res.json({staging:q.rows[0]});}
  catch{return bad(res,500,"MARITIME_STAGING_REVIEW_FAILED","Unable to review staged record.");}
 });
 app.patch("/api/v1/admin/maritime/runs/:runId/complete",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.runId;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_RUN_ID_INVALID","Invalid ingestion run ID.");
  const seen=Number(req.body?.recordsSeen),staged=Number(req.body?.recordsStaged),rejected=Number(req.body?.recordsRejected);
  if(!Number.isInteger(seen)||!Number.isInteger(staged)||!Number.isInteger(rejected)||seen<0||staged<0||rejected<0||staged>seen||rejected>seen)return bad(res,400,"MARITIME_RUN_COUNTS_INVALID","Run counts must be non-negative and internally consistent.");
  try{const q=await req.db.query("UPDATE public.maritime_ingestion_runs SET status='completed',records_seen=$2,records_staged=$3,records_rejected=$4,completed_at=now() WHERE id=$1::uuid AND status='running' RETURNING *",[id,seen,staged,rejected]);if(!q.rows.length)return bad(res,404,"MARITIME_RUN_NOT_ACTIVE","Ingestion run not found or not active.");return res.json({run:q.rows[0]});}
  catch{return bad(res,500,"MARITIME_RUN_COMPLETE_FAILED","Unable to complete ingestion run.");}
 });
 app.post("/api/v1/admin/maritime/sources/:id/health",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const state=str(req.body?.healthStatus,30),latency=Number(req.body?.latencyMs),message=str(req.body?.message,1000);
  if(!["healthy","degraded","unavailable"].includes(state)||!Number.isFinite(latency)||latency<0)return bad(res,400,"MARITIME_HEALTH_INVALID","Health status and non-negative latency are required.");
  try{const q=await req.db.query("INSERT INTO public.maritime_provider_health(source_id,health_status,latency_ms,message,checked_at) VALUES($1::uuid,$2,$3,$4,now()) RETURNING *",[id,state,latency,message||null]);return res.status(201).json({health:q.rows[0]});}
  catch{return bad(res,500,"MARITIME_HEALTH_WRITE_FAILED","Unable to record provider health.");}
 });
 // P17-E: Project-scoped voyages, nominations and port calls. Every mutation is permission-gated.
 app.get("/api/v1/projects/:projectId/voyages",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"voyage.view"))return;
  try{const q=await req.db.query("SELECT * FROM public.voyages WHERE project_id=$1::uuid ORDER BY created_at DESC",[p]);return res.json({voyages:q.rows});}
  catch{return bad(res,500,"VOYAGE_READ_FAILED","Unable to read Project voyages.");}
 });
 app.post("/api/v1/projects/:projectId/voyages",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"voyage.create"))return;
  const b=req.body||{},code=str(b.voyageCode,80),key=str(b.idempotencyKey,128),vessel=str(b.vesselId,64);
  if(!code||!key||(vessel&&!uuidPattern.test(vessel)))return bad(res,400,"VOYAGE_INPUT_INVALID","Voyage code, idempotency key and valid optional vessel ID are required.");
  try{const q=await req.db.query("INSERT INTO public.voyages(project_id,voyage_code,vessel_id,status,created_by,idempotency_key) VALUES($1::uuid,$2,$3::uuid,'planned',req_user_id(),$4) RETURNING *",[p,code,vessel||null,key]);return res.status(201).json({voyage:q.rows[0],operationalClearance:false});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"VOYAGE_DUPLICATE","Voyage code or idempotency key already exists.");return bad(res,500,"VOYAGE_CREATE_FAILED","Unable to create voyage.");}
 });
 app.patch("/api/v1/projects/:projectId/voyages/:voyageId",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.voyageId;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"VOYAGE_ID_INVALID","Invalid Project or voyage ID.");if(!await requireProjectAccess(req,res,p,"voyage.update"))return;
  const version=Number(req.body?.expectedVersion),code=str(req.body?.voyageCode,80),status=str(req.body?.status,30);
  if(!Number.isInteger(version)||version<1||!code||!["planned","nominated","confirmed","arrived","departed","completed","cancelled"].includes(status))return bad(res,400,"VOYAGE_UPDATE_INVALID","Expected version, voyage code and supported status are required.");
  try{const q=await req.db.query("UPDATE public.voyages SET voyage_code=$4,status=$5,version=version+1,updated_by=req_user_id(),updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND version=$3 RETURNING *",[id,p,version,code,status]);if(!q.rows.length)return bad(res,409,"VOYAGE_VERSION_CONFLICT","Voyage changed or is outside Project scope.");return res.json({voyage:q.rows[0],operationalClearance:false});}
  catch{return bad(res,500,"VOYAGE_UPDATE_FAILED","Unable to update voyage.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-nominations",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"vessel.nominate"))return;
  try{const q=await req.db.query("SELECT * FROM public.vessel_nominations WHERE project_id=$1::uuid ORDER BY created_at DESC",[p]);return res.json({nominations:q.rows});}
  catch{return bad(res,500,"NOMINATION_READ_FAILED","Unable to read Project nominations.");}
 });
 app.post("/api/v1/projects/:projectId/vessel-nominations",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"vessel.nominate"))return;
  const b=req.body||{},shipment=str(b.shipmentId,64),vessel=str(b.vesselId,64),key=str(b.idempotencyKey,128);
  if(!uuidPattern.test(shipment)||!uuidPattern.test(vessel)||!key)return bad(res,400,"NOMINATION_INPUT_INVALID","Shipment, vessel and idempotency key are required.");
  try{const q=await req.db.query("INSERT INTO public.vessel_nominations(project_id,shipment_id,vessel_id,voyage_id,nominated_by,idempotency_key) SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,req_user_id(),$5 WHERE EXISTS(SELECT 1 FROM public.shipments WHERE id=$2::uuid AND project_id=$1::uuid) RETURNING *",[p,shipment,vessel,b.voyageId||null,key]);if(!q.rows.length)return bad(res,422,"SHIPMENT_OUTSIDE_PROJECT","Shipment does not belong to this Project.");return res.status(201).json({nomination:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"NOMINATION_DUPLICATE","Nomination already exists.");return bad(res,500,"NOMINATION_CREATE_FAILED","Unable to create nomination.");}
 });
 app.patch("/api/v1/projects/:projectId/vessel-nominations/:id/decision",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.id;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"NOMINATION_ID_INVALID","Invalid Project or nomination ID.");if(!await requireProjectAccess(req,res,p,"vessel.nomination.review"))return;
  const status=str(req.body?.status,40),note=str(req.body?.decisionNote,2000);
  if(!["identity_verified","port_screened","documents_checked","approved_for_internal_planning","rejected","withdrawn"].includes(status))return bad(res,400,"NOMINATION_STATUS_INVALID","Unsupported nomination decision.");
  try{const q=await req.db.query("UPDATE public.vessel_nominations SET nomination_status=$3,reviewed_by=req_user_id(),reviewed_at=now(),reason=$4,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND nominated_by<>req_user_id() AND nomination_status IN ('submitted','identity_verified','port_screened','documents_checked') RETURNING *",[id,p,status,note||null]);if(!q.rows.length)return bad(res,409,"MAKER_CHECKER_REQUIRED","Independent reviewer and a reviewable nomination are required.");return res.json({nomination:q.rows[0],operationalClearance:false});}
  catch{return bad(res,500,"NOMINATION_DECISION_FAILED","Unable to decide nomination.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-port-calls",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"vessel.view"))return;
  try{const q=await req.db.query("SELECT c.* FROM public.vessel_port_calls c JOIN public.voyages v ON v.id=c.voyage_id WHERE v.project_id=$1::uuid ORDER BY c.predicted_at DESC NULLS LAST",[p]);return res.json({portCalls:q.rows});}
  catch{return bad(res,500,"PORT_CALL_READ_FAILED","Unable to read Project port calls.");}
 });
 app.post("/api/v1/projects/:projectId/vessel-port-calls",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"vessel.port_call.manage"))return;
  const b=req.body||{},voy=str(b.voyageId,64),port=str(b.portId,64),event=str(b.eventType,40),predicted=time(b.predictedAt),actual=time(b.actualAt);
  if(!uuidPattern.test(voy)||!uuidPattern.test(port)||!["planned_arrival","eta_update","arrived","berthed","departed","cancelled"].includes(event)||(!predicted&&!actual))return bad(res,400,"PORT_CALL_INPUT_INVALID","Voyage, port, event type and valid time are required.");
  try{const q=await req.db.query("INSERT INTO public.vessel_port_calls(voyage_id,vessel_id,port_id,event_type,predicted_at,actual_at,status) SELECT $1::uuid,v.vessel_id,$2::uuid,$3,$4::timestamptz,$5::timestamptz,CASE WHEN $5::timestamptz IS NOT NULL THEN 'actual' ELSE 'predicted' END FROM public.voyages v WHERE v.id=$1::uuid AND v.project_id=$6::uuid RETURNING *",[voy,port,event,predicted,actual,p]);if(!q.rows.length)return bad(res,422,"PORT_CALL_VOYAGE_MISMATCH","Voyage does not belong to this Project.");return res.status(201).json({portCall:q.rows[0],operationalClearance:false});}
  catch(e:any){if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"PORT_CALL_GUARD_REJECTED","Route or independent confirmation guard rejected event.");if(e?.code==="23503")return bad(res,422,"PORT_CALL_REFERENCE_INVALID","Port-call references are invalid.");return bad(res,500,"PORT_CALL_CREATE_FAILED","Unable to create port call.");}
 });
}
