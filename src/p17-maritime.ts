import type { Express, Request, Response, RequestHandler } from "express";
import { createHash } from "node:crypto";
import type { PrivateStorageAdapter } from "./storage.js";
type R = any;
type D = { requireAuth:RequestHandler; requireAdmin:RequestHandler; requireProjectPermission:(req:R,res:Response,projectId:string,permission:string)=>Promise<boolean>; uuidPattern:RegExp; privateStorage:PrivateStorageAdapter };
const bad=(res:Response,status:number,code:string,error:string)=>res.status(status).json({error,code});
const str=(v:unknown,n=200)=>typeof v==="string"?v.trim().slice(0,n):"";
const time=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const canonicalize=(v:any):any=>Array.isArray(v)?v.map(canonicalize):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])])):v;

export function registerP17MaritimeRoutes(app:Express,d:D){
 // Production schema is still at migration 053. Block P17 mutations until 096-107
 // and their RLS/policy acceptance are explicitly released on canonical Production.
 const p17WriteReleaseGate:RequestHandler=async(req,res,next)=>{
  const path=req.path||"";
  const mutating=["POST","PUT","PATCH","DELETE"].includes(req.method);
  const schemaAdmin=path.startsWith("/api/v1/admin/maritime/")||path.startsWith("/api/v1/admin/buyer-auth-mappings")||path.startsWith("/api/v1/admin/buyer-visibility-grants");
  const buyerProjection=path.startsWith("/api/v1/buyer/");
  const p17ProjectWorkflow=/^\/api\/v1\/projects\/[^/]+\/(?:master-data-change-requests(?:\/|$)|pke-logistics\/(?:simulation-scenarios|change-requests)(?:\/|$)|voyages(?:\/|$)|vessel-nominations(?:\/|$)|vessel-port-calls(?:\/|$)|buyer-visibility-grants(?:\/|$)|loading-operations(?:\/|$))/.test(path);
  const p17AdminProjectWorkflow=/^\/api\/v1\/admin\/projects\/[^/]+\/(?:master-data-change-requests(?:\/|$)|pke-logistics\/change-requests(?:\/|$))/.test(path);
  const p17SchemaBackedRead=/^\/api\/v1\/projects\/[^/]+\/(?:master-data-change-requests(?:\/|$)|pke-logistics\/(?:simulation-scenarios|change-requests)(?:\/|$)|buyer-visibility-grants(?:\/|$))/.test(path);
  const protectedPath=schemaAdmin||buyerProjection||p17AdminProjectWorkflow||p17SchemaBackedRead||(p17ProjectWorkflow&&mutating);
  if(!protectedPath)return next();
  const migrationFiles=[
    "096_p17a_maritime_source_governance_ingestion.sql",
    "097_p17e_project_maritime_workflows.sql",
    "098_p17b_port_identity_geospatial.sql",
    "099_p17b_logistics_scenario_and_pm_change_requests.sql",
    "100_p17b_logistics_change_audit.sql",
    "101_p17b_logistics_simulation_graph.sql",
    "102_p17b_logistics_request_scope_guard.sql",
    "103_p17b_logistics_simulation_edge_semantics.sql",
    "104_p17e_nomination_submission_guard.sql",
    "105_p17f_buyer_identity_and_grant_audit.sql",
    "106_p17d_vessel_position_observations.sql",
    "107_p17e_loading_survey_reconciliation_laytime.sql"
  ];
  const protectedTables=[
    "maritime_data_sources","maritime_source_field_permissions","maritime_ingestion_runs","maritime_ingestion_staging",
    "maritime_provider_usage","maritime_provider_health","maritime_workflow_events","port_external_id_crosswalk",
    "port_geospatial_features","p17b_logistics_change_requests","p17b_logistics_scenarios",
    "p17b_logistics_simulation_scenarios","buyer_auth_user_mappings","buyer_auth_mapping_events",
    "buyer_visibility_grant_events","buyer_visibility_grants","loading_operation_acceptances",
    "vessel_tracking_positions","voyages","vessel_nominations","vessel_port_calls","pks_port_routes",
    "loading_operations","loading_tickets","loading_segments","shipments","shipment_events","buyers","users",
    "projects","ports","pks_sites","port_terminals","port_equipment","warehouses","vessels",
    "vessel_port_assessments","shipment_allocations","project_export_documents","project_work_items"
  ];
  try{
    const migrations=await req.db.query(
      "SELECT COUNT(*)::int AS applied_count FROM public.migration_history WHERE filename=ANY($1::text[]) AND status='applied'",
      [migrationFiles]
    );
    if(Number(migrations.rows[0]?.applied_count)!==migrationFiles.length)
      return bad(res,503,"P17_SCHEMA_RELEASE_BLOCKED","P17 schema release is incomplete; migrations 096-107 must all be applied to canonical Production.");
    const rls=await req.db.query(
      "SELECT COUNT(*)::int AS found_count,COUNT(*) FILTER(WHERE NOT c.relrowsecurity OR COALESCE(p.policy_count,0)=0)::int AS unsafe_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN (SELECT tablename,COUNT(*)::int AS policy_count FROM pg_policies WHERE schemaname='public' GROUP BY tablename) p ON p.tablename=c.relname WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
      [protectedTables]
    );
    if(Number(rls.rows[0]?.found_count)!==protectedTables.length||Number(rls.rows[0]?.unsafe_count)!==0)
      return bad(res,503,"P17_RLS_RELEASE_BLOCKED","P17 tables are missing RLS or an applicable policy; protected APIs remain unavailable.");
    const requiredPermissions=["buyer.shipment.view","buyer.visibility.manage","shipping.survey.view","shipping.survey.submit","shipping.survey.review","shipping.laytime.view","shipping.laytime.manage","shipping.laytime.verify","loading.quantity.reconcile"];
    const permissions=await req.db.query("SELECT COUNT(*)::int AS permission_count FROM public.permissions WHERE code=ANY($1::text[]) AND is_active IS TRUE",[requiredPermissions]);
    if(Number(permissions.rows[0]?.permission_count)!==requiredPermissions.length)
      return bad(res,503,"P17_PERMISSION_RELEASE_BLOCKED","P17 role permissions are incomplete; protected APIs remain unavailable.");
    return next();
  }catch{
    return bad(res,503,"P17_SCHEMA_RELEASE_BLOCKED","P17 schema/RLS release state could not be verified; protected APIs remain fail-closed.");
  }
 };
 app.use(p17WriteReleaseGate);

 const {requireAuth,requireAdmin,requireProjectPermission,uuidPattern,privateStorage}=d;
 const requireProjectAccess=async(req:R,res:Response,projectId:string,permission:string):Promise<boolean>=>{
  const admin=await req.db.query("SELECT public.pke_is_platform_admin() AS is_admin");
  if(admin.rows[0]?.is_admin===true){
   await req.db.query("SELECT set_config('app.current_role','admin',true),set_config('app.current_project_id',$1,true),set_config('app.current_permission_code',$2,true)",[projectId,permission]);
   return true;
  }
  return requireProjectPermission(req,res,projectId,permission);
 };
 const requireProjectAnyAccess=async(req:R,res:Response,projectId:string,permissions:string[]):Promise<boolean>=>{
  const q=await req.db.query("SELECT public.pke_is_platform_admin() AS is_admin, "+permissions.map((_,i)=>"public.pke_has_project_permission($1::uuid,$"+(i+2)+"::text)").join(" OR ")+" AS allowed",[projectId,...permissions]);
  if(q.rows[0]?.is_admin===true){await req.db.query("SELECT set_config('app.current_role','admin',true),set_config('app.current_project_id',$1,true),set_config('app.current_permission_code',$2,true)",[projectId,permissions[0]]);return true;}if(q.rows[0]?.allowed===true){await req.db.query("SELECT set_config('app.current_project_id',$1,true),set_config('app.current_permission_code',$2,true)",[projectId,permissions[0]]);return true;}
  return bad(res,403,"PROJECT_PERMISSION_REQUIRED","One of the required Project permissions is required.") as any;
 };
 // P17-B: port identity reconciliation and versioned GeoJSON. Promotion is explicit and review-gated.
 app.get("/api/v1/admin/maritime/port-crosswalk",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{
   const q=await req.db.query("SELECT x.*,p.name AS port_name,s.source_code FROM public.port_external_id_crosswalk x JOIN public.ports p ON p.id=x.port_id JOIN public.maritime_data_sources s ON s.id=x.source_id ORDER BY x.created_at DESC");
   return res.json({crosswalk:q.rows});
  }catch{return bad(res,500,"PORT_CROSSWALK_READ_FAILED","Unable to read port identity crosswalk.");}
 });
 app.post("/api/v1/admin/maritime/port-crosswalk",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{},sourceCode=str(b.sourceCode,64),external=str(b.externalRecordId,240),port=str(b.portId,64);
  const reference=str(b.sourceReference,1000),method=str(b.matchMethod,30)||"manual";
  const confidence=b.matchConfidence==null?null:Number(b.matchConfidence);
  const snapshot=b.sourceSnapshot&&typeof b.sourceSnapshot==="object"&&!Array.isArray(b.sourceSnapshot)?b.sourceSnapshot:{};
  const evidenceHash=str(b.evidenceSha256,64)||null;
  if(!sourceCode||!external||!uuidPattern.test(port)||reference.length<8||
    !["manual","official_code","unlocode","name_location","coordinate","fuzzy_candidate"].includes(method)||
    !Number.isFinite(confidence??0)||(confidence!==null&&(confidence<0||confidence>1))||
    (evidenceHash!==null&&!/^[a-f0-9]{64}$/.test(evidenceHash)))
    return bad(res,400,"PORT_CROSSWALK_INVALID","Source, external identity, canonical port, supported match method, source reference and valid confidence/evidence are required.");
  try{
   const q=await req.db.query(
    "INSERT INTO public.port_external_id_crosswalk(source_id,external_record_id,external_code,port_id,match_method,match_confidence,source_reference,source_snapshot,evidence_sha256,review_status,created_by) SELECT s.id,$2,$3,$4::uuid,$5,$6,$7,$8::jsonb,$9,'pending',req_user_id() FROM public.maritime_data_sources s WHERE s.source_code=$1 AND s.enabled IS TRUE AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions fp WHERE fp.source_id=s.id AND fp.field_code='port_identity' AND fp.purpose_code='internal_operations' AND fp.allowed IS TRUE) RETURNING *",
    [sourceCode,external,str(b.externalCode,100)||null,port,method,confidence,reference,JSON.stringify(snapshot),evidenceHash]
   );
   if(!q.rows.length)return bad(res,409,"PORT_CROSSWALK_SOURCE_NOT_AUTHORIZED","Source lacks current rights or port_identity internal-purpose permission.");
   return res.status(201).json({item:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23505")return bad(res,409,"PORT_CROSSWALK_DUPLICATE","External identity already exists for this source.");
   if(e?.code==="23503")return bad(res,422,"PORT_CROSSWALK_REFERENCE_INVALID","Canonical port or source reference is invalid.");
   return bad(res,500,"PORT_CROSSWALK_CREATE_FAILED","Unable to create port identity candidate.");
  }
 });
 app.patch("/api/v1/admin/maritime/port-crosswalk/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"PORT_CROSSWALK_ID_INVALID","Invalid crosswalk ID.");
  const status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,2000);
  if(!["matched","rejected","superseded"].includes(status)||note.length<5)
    return bad(res,400,"PORT_CROSSWALK_REVIEW_INVALID","Database-compatible review state and substantive note are required.");
  try{
   const q=await req.db.query("UPDATE public.port_external_id_crosswalk SET review_status=$2,review_note=$3,reviewed_by=req_user_id(),reviewed_at=now(),updated_at=now() WHERE id=$1::uuid AND review_status='pending' AND created_by<>req_user_id() RETURNING *",[id,status,note]);
   if(!q.rows.length)return bad(res,409,"PORT_CROSSWALK_MAKER_CHECKER","Crosswalk must be pending and reviewed by an independent administrator.");
   return res.json({item:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"PORT_CROSSWALK_REVIEW_REJECTED","Review decision violates database controls.");
   return bad(res,500,"PORT_CROSSWALK_REVIEW_FAILED","Unable to review crosswalk.");
  }
 });
 app.get("/api/v1/admin/maritime/port-geospatial-features",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{
   const q=await req.db.query("SELECT g.*,p.name AS port_name,ps.name AS pks_site_name,s.source_code FROM public.port_geospatial_features g LEFT JOIN public.ports p ON p.id=g.port_id LEFT JOIN public.pks_sites ps ON ps.id=g.pks_site_id JOIN public.maritime_data_sources s ON s.id=g.source_id ORDER BY g.updated_at DESC");
   return res.json({features:q.rows});
  }catch{return bad(res,500,"PORT_GEO_READ_FAILED","Unable to read port geospatial review queue.");}
 });
 app.post("/api/v1/admin/maritime/port-geospatial-features",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{},port=str(b.portId,64),pks=str(b.pksSiteId,64),sourceId=str(b.sourceId,64);
  const featureType=str(b.featureType,40),featureId=str(b.sourceFeatureId,200);
  const geometry=b.geometryGeojson,geometryHash=str(b.geometrySha256,64),datasetVersion=str(b.datasetVersion,80);
  const licence=str(b.licenseCode,120),attribution=str(b.attributionText,1000),reference=str(b.sourceReference,1000);
  const subjectCount=(uuidPattern.test(port)?1:0)+(uuidPattern.test(pks)?1:0);
  if(subjectCount!==1||!uuidPattern.test(sourceId)||!featureId||
    !["port_point","terminal_point","port_boundary","terminal_boundary","pks_point","pks_boundary","road_access","road_route"].includes(featureType)||
    !geometry||typeof geometry!=="object"||Array.isArray(geometry)||typeof geometry.type!=="string"||!Array.isArray(geometry.coordinates)||
    !/^[a-f0-9]{64}$/.test(geometryHash)||!datasetVersion||!licence||!attribution||reference.length<8)
    return bad(res,400,"PORT_GEO_INVALID","Exactly one port or PKS subject, registered source, valid GeoJSON, SHA-256, dataset version, licence, attribution and source feature ID are required.");
  try{
   const q=await req.db.query(
    "INSERT INTO public.port_geospatial_features(port_id,pks_site_id,source_id,source_feature_id,feature_type,geometry_geojson,geometry_sha256,dataset_version,license_code,attribution_text,source_reference,review_status,created_by) SELECT $1::uuid,$2::uuid,s.id,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,'pending',req_user_id() FROM public.maritime_data_sources s WHERE s.id=$11::uuid AND s.enabled IS TRUE AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions fp WHERE fp.source_id=s.id AND fp.field_code='geometry_geojson' AND fp.purpose_code='internal_operations' AND fp.allowed IS TRUE) RETURNING *",
    [port||null,pks||null,featureId,featureType,JSON.stringify(geometry),geometryHash,datasetVersion,licence,attribution,reference,sourceId]
   );
   if(!q.rows.length)return bad(res,409,"PORT_GEO_RIGHTS_NOT_ACTIVE","Geometry source lacks current rights or geometry_geojson field-purpose permission.");
   return res.status(201).json({item:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23503")return bad(res,422,"PORT_GEO_REFERENCE_INVALID","Port, PKS or source reference is invalid.");
   if(e?.code==="23505")return bad(res,409,"PORT_GEO_DUPLICATE","Geospatial source feature/version already exists.");
   return bad(res,500,"PORT_GEO_CREATE_FAILED","Unable to create geospatial review candidate.");
  }
 });
 app.patch("/api/v1/admin/maritime/port-geospatial-features/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"PORT_GEO_ID_INVALID","Invalid geospatial feature ID.");
  const status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,2000);
  if(!["verified","rejected","superseded"].includes(status)||note.length<5)
    return bad(res,400,"PORT_GEO_REVIEW_INVALID","Database-compatible review state and substantive note are required.");
  try{
   const q=await req.db.query("UPDATE public.port_geospatial_features SET review_status=$2,review_note=$3,reviewed_by=req_user_id(),reviewed_at=now(),updated_at=now() WHERE id=$1::uuid AND review_status='pending' AND created_by<>req_user_id() RETURNING *",[id,status,note]);
   if(!q.rows.length)return bad(res,409,"PORT_GEO_MAKER_CHECKER","Geospatial candidate must be pending and independently reviewed.");
   return res.json({item:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"PORT_GEO_REVIEW_REJECTED","Geospatial review violates database controls.");
   return bad(res,500,"PORT_GEO_REVIEW_FAILED","Unable to review geospatial feature.");
  }
 });
 // P17-A: provider/source governance. Secret values never enter application rows.
 // P17-E: loading quantity, survey and laytime evidence are versioned and independently reviewed.
 app.get("/api/v1/projects/:projectId/loading-operations",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"shipping.view"))return;
  try{const unitSchema=await req.db.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loading_operations' AND column_name='unit_code') AS ready");const unitColumn=unitSchema.rows[0]?.ready===true?"lo.unit_code":"NULL::text";const q=await req.db.query(`SELECT lo.id,lo.project_id,lo.vessel_id,v.name AS vessel_name,lo.port_id,pt.name AS port_name,lo.quantity,${unitColumn} AS unit_code,lo.status,lo.started_at,lo.completed_at,(SELECT COUNT(*)::int FROM public.loading_tickets t WHERE t.loading_operation_id=lo.id AND t.project_id=lo.project_id) AS ticket_count,(SELECT COUNT(*)::int FROM public.loading_tickets t WHERE t.loading_operation_id=lo.id AND t.project_id=lo.project_id AND t.status='verified') AS verified_ticket_count FROM public.loading_operations lo LEFT JOIN public.vessels v ON v.id=lo.vessel_id LEFT JOIN public.ports pt ON pt.id=lo.port_id WHERE lo.project_id=$1::uuid ORDER BY lo.started_at DESC NULLS LAST,lo.id`,[p]);return res.json({loadingOperations:q.rows,unitAssignmentSchemaAvailable:unitSchema.rows[0]?.ready===true});}
  catch{return bad(res,500,"LOADING_OPERATIONS_READ_FAILED","Unable to read Project loading operations.");}
 });
 app.patch("/api/v1/projects/:projectId/loading-operations/:operationId/unit",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.operationId,unit=str(req.body?.unitCode,12).toUpperCase();
  if(!uuidPattern.test(p)||!uuidPattern.test(id)||!/^[A-Z0-9._-]{2,12}$/.test(unit))return bad(res,400,"LOADING_UNIT_INVALID","Valid Project, loading operation and unit code are required.");
  if(!await requireProjectAccess(req,res,p,"shipping.update"))return;
  try{const q=await req.db.query("UPDATE public.loading_operations SET unit_code=$3 WHERE id=$1::uuid AND project_id=$2::uuid AND unit_code IS NULL AND status NOT IN ('completed','closed') RETURNING id,project_id,quantity,unit_code,status",[id,p,unit]);if(q.rows.length)return res.json({operation:q.rows[0]});const current=await req.db.query("SELECT id,project_id,quantity,unit_code,status FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);if(!current.rows.length)return bad(res,404,"LOADING_OPERATION_NOT_FOUND","Loading operation not found in this Project.");if(current.rows[0].unit_code===unit)return res.json({operation:current.rows[0],idempotent:true});return bad(res,409,"LOADING_UNIT_IMMUTABLE","Loading operation unit is already assigned or operation is closed.");}
  catch(e:any){if(e?.code==="23514")return bad(res,409,"LOADING_UNIT_GUARD","Loading operation unit guard rejected the change.");return bad(res,500,"LOADING_UNIT_UPDATE_FAILED","Unable to assign loading operation unit.");}
 });
 app.get("/api/v1/projects/:projectId/loading-operations/:operationId/acceptances",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.operationId;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"LOADING_OPERATION_ID_INVALID","Invalid Project or loading operation ID.");
  if(!await requireProjectAnyAccess(req,res,p,["shipping.view","shipping.survey.view","shipping.laytime.view","loading.quantity.reconcile"]))return;
  try{const ready=await req.db.query("SELECT to_regclass('public.loading_operation_acceptances') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loading_operations' AND column_name='unit_code') AS ready");if(ready.rows[0]?.ready!==true)return bad(res,503,"LOADING_ACCEPTANCE_SCHEMA_NOT_RELEASED","Loading acceptance schema is not released on this database.");const op=await req.db.query("SELECT id,project_id,quantity,unit_code,status,started_at,completed_at FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);if(!op.rows.length)return bad(res,404,"LOADING_OPERATION_NOT_FOUND","Loading operation not found in this Project.");
   const tickets=await req.db.query("SELECT unit_code,COUNT(*)::int AS ticket_count,COUNT(*) FILTER(WHERE status='verified')::int AS verified_count,COALESCE(SUM(quantity) FILTER(WHERE status='verified'),0)::numeric AS verified_quantity FROM public.loading_tickets WHERE loading_operation_id=$1::uuid AND project_id=$2::uuid GROUP BY unit_code ORDER BY unit_code",[id,p]);
   const segments=await req.db.query("SELECT unit_code,COUNT(*)::int AS segment_count,COALESCE(SUM(quantity) FILTER(WHERE status='completed'),0)::numeric AS completed_segment_quantity,COUNT(*) FILTER(WHERE status='completed')::int AS completed_segments FROM public.loading_segments WHERE loading_operation_id=$1::uuid AND project_id=$2::uuid GROUP BY unit_code ORDER BY unit_code",[id,p]);
   const acceptances=await req.db.query("SELECT id,acceptance_type,version_no,MAX(version_no) OVER(PARTITION BY acceptance_type) AS latest_version_no,quantity,unit_code,quantity_variance,notice_of_readiness_at,laytime_start_at,laytime_end_at,allowed_hours,excluded_hours,evidence_object_key,evidence_sha256,evidence_size_bytes,submitted_by,submitted_at,review_status,reviewed_by,reviewed_at,review_note FROM public.loading_operation_acceptances WHERE loading_operation_id=$1::uuid AND project_id=$2::uuid ORDER BY acceptance_type,version_no DESC",[id,p]);
   const acceptanceRows=acceptances.rows.map((a:R)=>({...a,is_latest:Number(a.version_no)===Number(a.latest_version_no),calculated_laytime_hours:a.acceptance_type==="laytime"&&a.laytime_start_at&&a.laytime_end_at?(new Date(a.laytime_end_at).getTime()-new Date(a.laytime_start_at).getTime())/3600000-Number(a.excluded_hours||0):null}));
   const unit=op.rows[0].unit_code;const ticket=tickets.rows.find((x:R)=>x.unit_code===unit);const segment=segments.rows.find((x:R)=>x.unit_code===unit);const expected=Number(op.rows[0].quantity);const verified=ticket?Number(ticket.verified_quantity):null;const completedSegmentQuantity=segment?Number(segment.completed_segment_quantity):null;
   const quantityReconciliation={unitCode:unit||null,expectedQuantity:unit?expected:null,verifiedTicketQuantity:verified,completedSegmentQuantity,segmentTicketVariance:verified!==null&&completedSegmentQuantity!==null?completedSegmentQuantity-verified:null,operationTicketVariance:unit&&verified!==null?expected-verified:null,status:!unit?"unit_unassigned":!tickets.rows.length?"no_tickets":!ticket?(tickets.rows.some((x:R)=>Number(x.verified_count)>0)?"unit_mismatch":"no_verified_tickets"):Number(ticket.verified_count)===0?"no_verified_tickets":!segment||Number(segment.completed_segments)===0?"no_completed_segments":completedSegmentQuantity!==verified?"segment_ticket_variance":expected===verified?"matched":"operation_ticket_variance"};
   return res.json({projectId:p,operation:op.rows[0],tickets:tickets.rows,segments:segments.rows,acceptances:acceptanceRows,quantityReconciliation,readOnly:false,operationalClearance:false});
  }catch{return bad(res,500,"LOADING_ACCEPTANCE_READ_FAILED","Unable to read Project loading acceptance evidence.");}
 });
 app.post("/api/v1/projects/:projectId/loading-operations/:operationId/acceptances/presign",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.operationId,b=req.body||{},type=str(b.acceptanceType,32);
  const objectKey=str(b.objectKey,1024),mimeType=str(b.mimeType,160),filename=str(b.filename,240),contentLength=Number(b.contentLength);
  if(!uuidPattern.test(p)||!uuidPattern.test(id)||!["survey","quantity_reconciliation","laytime"].includes(type))return bad(res,400,"LOADING_EVIDENCE_INPUT_INVALID","Valid Project, loading operation and acceptance type are required.");
  const permission=type==="survey"?"shipping.survey.submit":type==="quantity_reconciliation"?"loading.quantity.reconcile":"shipping.laytime.manage";
  if(!await requireProjectAccess(req,res,p,permission))return;
  if(!objectKey.startsWith(`projects/${p}/loading-operations/${id}/${type}/`))return bad(res,400,"LOADING_EVIDENCE_KEY_INVALID","Evidence must be stored under the selected Project, loading operation and acceptance type.");
  const storageStatus=privateStorage.status();
  if(!storageStatus.available||storageStatus.bucket!=="pke-private-documents")return bad(res,503,"LOADING_EVIDENCE_STORAGE_UNAVAILABLE","Private PKE evidence storage is unavailable.");
  const keyCheck=privateStorage.validateObjectKey(objectKey),metaCheck=privateStorage.validateFileMetadata({mimeType,contentLength,filename});
  if(!keyCheck.ok||!metaCheck.ok)return bad(res,400,"LOADING_EVIDENCE_FILE_INVALID",keyCheck.reason||metaCheck.reason||"Evidence file metadata is invalid.");
  try{
   const op=await req.db.query("SELECT id FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);if(!op.rows.length)return bad(res,404,"LOADING_OPERATION_NOT_FOUND","Loading operation not found in this Project.");
   const upload=await privateStorage.presignedUpload(objectKey,mimeType,contentLength);
   return res.json({upload,bucket:storageStatus.bucket,verificationRequired:true});
  }catch{return bad(res,503,"LOADING_EVIDENCE_PRESIGN_FAILED","Unable to prepare private evidence upload.");}
 });
 app.post("/api/v1/projects/:projectId/loading-operations/:operationId/acceptances",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.operationId,b=req.body||{},type=str(b.acceptanceType,32);
  if(!uuidPattern.test(p)||!uuidPattern.test(id)||!["survey","quantity_reconciliation","laytime"].includes(type))return bad(res,400,"LOADING_ACCEPTANCE_INPUT_INVALID","Valid Project, loading operation and acceptance type are required.");
  const permission=type==="survey"?"shipping.survey.submit":type==="quantity_reconciliation"?"loading.quantity.reconcile":"shipping.laytime.manage";
  if(!await requireProjectAccess(req,res,p,permission))return;
  try{
   const op=await req.db.query("SELECT id,quantity,unit_code,status FROM public.loading_operations WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);if(!op.rows.length)return bad(res,404,"LOADING_OPERATION_NOT_FOUND","Loading operation not found in this Project.");
   const evidence=str(b.evidenceObjectKey,1000),hash=str(b.evidenceSha256,64),evidenceSize=Number(b.evidenceSizeBytes);if(!evidence||evidence.toLowerCase().startsWith("http://")||evidence.toLowerCase().startsWith("https://")||evidence.startsWith("/")||evidence.split("/").includes("..")||!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(evidenceSize)||evidenceSize<=0||evidenceSize>50*1024*1024||!evidence.startsWith(`projects/${p}/loading-operations/${id}/${type}/`))return bad(res,400,"LOADING_EVIDENCE_REQUIRED","Project-scoped private evidence key, file size and SHA-256 are required.");const storageStatus=privateStorage.status();if(!storageStatus.available||storageStatus.bucket!=="pke-private-documents")return bad(res,503,"LOADING_EVIDENCE_STORAGE_UNAVAILABLE","Private PKE evidence storage is unavailable.");const keyCheck=privateStorage.validateObjectKey(evidence);if(!keyCheck.ok)return bad(res,400,"LOADING_EVIDENCE_KEY_INVALID",keyCheck.reason||"Evidence object key is invalid.");
   let quantity:number|null=null,unit=str(b.unitCode,12).toUpperCase()||null,variance:number|null=null,nor:string|null=null,start:string|null=null,end:string|null=null,allowed:number|null=null,excluded=0,laytimeHours:number|null=null;
   if(type==="survey"||type==="quantity_reconciliation"){
    quantity=Number(b.quantity);if(!Number.isFinite(quantity)||quantity<=0||!unit||!op.rows[0].unit_code||unit!==op.rows[0].unit_code)return bad(res,400,"LOADING_QUANTITY_UNIT_INVALID","Positive quantity must use the loading operation's assigned unit.");
    if(type==="quantity_reconciliation"){const q=await req.db.query("SELECT unit_code,COALESCE(SUM(quantity),0)::numeric AS verified_quantity,COUNT(*)::int AS verified_count FROM public.loading_tickets WHERE loading_operation_id=$1::uuid AND project_id=$2::uuid AND status='verified' GROUP BY unit_code",[id,p]);const match=q.rows.find((r:R)=>r.unit_code===unit);if(!match){if(q.rows.length)return bad(res,409,"LOADING_TICKET_UNIT_MISMATCH","Verified loading tickets use a different unit from the loading operation.");return bad(res,409,"LOADING_TICKETS_NOT_VERIFIED","At least one verified loading ticket is required before quantity reconciliation.");}const segments=await req.db.query("SELECT COALESCE(SUM(quantity),0)::numeric AS completed_quantity,COUNT(*)::int AS completed_count FROM public.loading_segments WHERE loading_operation_id=$1::uuid AND project_id=$2::uuid AND unit_code=$3 AND status='completed'",[id,p,unit]);if(Number(segments.rows[0].completed_count)===0)return bad(res,409,"LOADING_SEGMENTS_NOT_COMPLETED","Completed loading segments are required before quantity reconciliation.");const verified=Number(match.verified_quantity);if(Number(segments.rows[0].completed_quantity)!==verified)return bad(res,409,"LOADING_SEGMENT_TICKET_MISMATCH","Completed loading segment total must match verified ticket total.");if(quantity!==verified)return bad(res,409,"LOADING_QUANTITY_SOURCE_MISMATCH","Submitted quantity must exactly match verified ticket total.");variance=Number(op.rows[0].quantity)-verified;}
   }else{
    nor=time(b.noticeOfReadinessAt);start=time(b.laytimeStartAt);end=time(b.laytimeEndAt);allowed=Number(b.allowedHours);excluded=Number(b.excludedHours||0);
    if(!nor||!start||!end||Date.parse(start)<Date.parse(nor)||Date.parse(end)<Date.parse(start)||!Number.isFinite(allowed)||allowed<0||!Number.isFinite(excluded)||excluded<0)return bad(res,400,"LAYTIME_EVIDENCE_INVALID","NOR, laytime start/end, non-negative allowed hours and exclusions are required.");
    laytimeHours=(Date.parse(end)-Date.parse(start))/3600000-excluded;if(laytimeHours<0)return bad(res,400,"LAYTIME_EXCLUSIONS_INVALID","Excluded hours cannot exceed elapsed laytime.");
   }
   let verifiedEvidence;try{verifiedEvidence=await privateStorage.verifyObject(evidence,evidenceSize,hash);}catch{return bad(res,422,"LOADING_EVIDENCE_VERIFICATION_FAILED","Private evidence object size or SHA-256 verification failed.");}
   const version=await req.db.query("SELECT COALESCE(MAX(version_no),0)+1 AS next_version FROM public.loading_operation_acceptances WHERE loading_operation_id=$1::uuid AND acceptance_type=$2",[id,type]);
   const q=await req.db.query("INSERT INTO public.loading_operation_acceptances(project_id,loading_operation_id,acceptance_type,version_no,quantity,unit_code,quantity_variance,notice_of_readiness_at,laytime_start_at,laytime_end_at,allowed_hours,excluded_hours,evidence_object_key,evidence_sha256,evidence_size_bytes,submitted_by,review_status) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,$15,req_user_id(),'pending') RETURNING *",[p,id,type,version.rows[0].next_version,quantity,unit,variance,nor,start,end,allowed,excluded,evidence,verifiedEvidence.sha256,verifiedEvidence.size]);
   return res.status(201).json({acceptance:q.rows[0],calculatedLaytimeHours:laytimeHours,operationalClearance:false});
  }catch(e:any){if(e?.code==="23505")return bad(res,409,"LOADING_ACCEPTANCE_DUPLICATE","Loading acceptance version already exists.");if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"LOADING_ACCEPTANCE_GUARD","Project permission or evidence guard rejected this submission.");return bad(res,500,"LOADING_ACCEPTANCE_CREATE_FAILED","Unable to submit loading acceptance.");}
 });
 app.patch("/api/v1/projects/:projectId/loading-operations/:operationId/acceptances/:acceptanceId/review",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,operationId=req.params.operationId,id=req.params.acceptanceId,status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,2000);
  if(!uuidPattern.test(p)||!uuidPattern.test(operationId)||!uuidPattern.test(id)||!["accepted","rejected"].includes(status)||note.length<5)return bad(res,400,"LOADING_ACCEPTANCE_REVIEW_INVALID","Valid IDs, review status and substantive independent note are required.");
  if(!await requireProjectAnyAccess(req,res,p,["shipping.view","shipping.survey.view","shipping.survey.review","shipping.laytime.view","shipping.laytime.verify","loading.quantity.reconcile"]))return;
  try{const existing=await req.db.query("SELECT acceptance_type,submitted_by,review_status FROM public.loading_operation_acceptances WHERE id=$1::uuid AND loading_operation_id=$2::uuid AND project_id=$3::uuid",[id,operationId,p]);if(!existing.rows.length)return bad(res,404,"LOADING_ACCEPTANCE_NOT_FOUND","Acceptance not found in this Project.");const type=existing.rows[0].acceptance_type,permission=type==="survey"?"shipping.survey.review":type==="quantity_reconciliation"?"loading.quantity.reconcile":"shipping.laytime.verify";if(!await requireProjectAccess(req,res,p,permission))return;
   const q=await req.db.query("UPDATE public.loading_operation_acceptances SET review_status=$4,reviewed_by=req_user_id(),reviewed_at=now(),review_note=$5 WHERE id=$1::uuid AND loading_operation_id=$2::uuid AND project_id=$3::uuid AND review_status='pending' AND submitted_by<>req_user_id() RETURNING *",[id,operationId,p,status,note]);if(!q.rows.length)return bad(res,409,"LOADING_ACCEPTANCE_MAKER_CHECKER","Pending acceptance requires an independent reviewer.");return res.json({acceptance:q.rows[0]});
  }catch(e:any){if(e?.code==="42501"||e?.code==="23514")return bad(res,409,"LOADING_ACCEPTANCE_REVIEW_REJECTED","Review permission or maker-checker guard rejected the decision.");return bad(res,500,"LOADING_ACCEPTANCE_REVIEW_FAILED","Unable to review loading acceptance.");}
 });

 // P17-D: AIS positions are provider observations, never invented coordinates or navigational clearance.
 app.post("/api/v1/admin/maritime/vessel-positions",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{},sourceId=str(b.sourceId,64),vesselId=str(b.vesselId,64),mmsi=str(b.mmsi,20),reference=str(b.sourceReference,1000),providerReference=str(b.providerReference,240),attribution=str(b.attributionText,1000),hash=str(b.payloadSha256,64),observed=time(b.observedAt),rawPayload=b.rawPayload;
  const lat=Number(b.latitude),lon=Number(b.longitude),sog=b.sogKnots==null?null:Number(b.sogKnots),cog=b.cogDegrees==null?null:Number(b.cogDegrees);
  if(!uuidPattern.test(sourceId)||!uuidPattern.test(vesselId)||!/^\d{9}$/.test(mmsi)||!observed||!reference||!providerReference||!attribution||!/^[a-f0-9]{64}$/.test(hash)||!rawPayload||typeof rawPayload!=="object"||Array.isArray(rawPayload)||JSON.stringify(rawPayload).length>65536||!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lon)||lon < -180||lon>180||(sog!==null&&(!Number.isFinite(sog)||sog<0||sog>120))||(cog!==null&&(!Number.isFinite(cog)||cog<0||cog>360)))return bad(res,400,"AIS_POSITION_INVALID","Valid source, canonical raw payload, vessel MMSI, coordinates, observation time, source reference, attribution and SHA-256 are required.");
  const computedPayloadHash=createHash("sha256").update(JSON.stringify(canonicalize(rawPayload))).digest("hex");
  if(computedPayloadHash!==hash)return bad(res,422,"AIS_PAYLOAD_HASH_MISMATCH","SHA-256 does not match the canonical raw provider payload.");
  const allowedPayloadFields=["mmsi","latitude","longitude","observed_at","sog_knots","cog_degrees"];if(Object.keys(rawPayload).some(k=>!allowedPayloadFields.includes(k))||String(rawPayload.mmsi)!==mmsi||Number(rawPayload.latitude)!==lat||Number(rawPayload.longitude)!==lon||time(rawPayload.observed_at)!==observed||(sog!==null&&Number(rawPayload.sog_knots)!==sog)||(cog!==null&&Number(rawPayload.cog_degrees)!==cog)||(sog===null&&rawPayload.sog_knots!=null)||(cog===null&&rawPayload.cog_degrees!=null))return bad(res,422,"AIS_PAYLOAD_FIELDS_MISMATCH","Normalized AIS fields must match the permitted hashed canonical raw payload.");
  try{
   const requiredFields=["mmsi","latitude","longitude","observed_at",...(sog===null?[]:["sog_knots"]),...(cog===null?[]:["cog_degrees"])];const source=await req.db.query("SELECT id,source_code,metadata FROM public.maritime_data_sources s WHERE s.id=$1::uuid AND s.source_class='ais' AND s.enabled IS TRUE AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_reviewed_by IS NOT NULL AND s.rights_reviewed_at IS NOT NULL AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=s.id AND f.purpose_code='internal_operations' AND f.allowed IS TRUE AND f.field_code=ANY($2::text[]) GROUP BY f.source_id HAVING COUNT(DISTINCT f.field_code)=cardinality($2::text[]))",[sourceId,requiredFields]);
   if(!source.rows.length)return bad(res,409,"AIS_SOURCE_RIGHTS_BLOCKED","AIS source lacks current approved internal-processing rights and required field-purpose permissions.");
   const vessel=await req.db.query("SELECT id FROM public.vessels WHERE id=$1::uuid AND mmsi=$2 AND is_active IS TRUE",[vesselId,mmsi]);
   if(!vessel.rows.length)return bad(res,422,"AIS_VESSEL_IDENTITY_MISMATCH","MMSI does not match the active canonical vessel master.");
   const freshnessSla=Number(source.rows[0].metadata?.freshness_sla_seconds),freshnessValid=Number.isInteger(freshnessSla)&&freshnessSla>0,delayedGrace=Number(source.rows[0].metadata?.freshness_delayed_grace_seconds),graceValid=Number.isInteger(delayedGrace)&&delayedGrace>0;const observationAgeMs=Date.now()-Date.parse(observed);if(observationAgeMs < -300000)return bad(res,400,"AIS_OBSERVATION_TIME_FUTURE","AIS observation timestamp cannot be more than five minutes in the future.");const sourceQuality=!freshnessValid?"unknown":observationAgeMs<=freshnessSla*1000?"fresh":graceValid&&observationAgeMs<=(freshnessSla+delayedGrace)*1000?"delayed":"stale";
   const q=await req.db.query("INSERT INTO public.vessel_tracking_positions(source_id,vessel_id,mmsi,provider_code,provider_reference,latitude,longitude,sog_knots,cog_degrees,position_timestamp,raw_payload_hash,source_reference,attribution_text,created_by,review_status,source_quality) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12,$13,req_user_id(),'pending',$14) RETURNING id,vessel_id,mmsi,position_timestamp,review_status,source_quality,created_at",[sourceId,vesselId,mmsi,source.rows[0].source_code,providerReference,lat,lon,sog,cog,observed,hash,reference,attribution,sourceQuality]);
   return res.status(201).json({observation:q.rows[0],displayable:false});
  }catch(e:any){if(e?.code==="23505")return bad(res,409,"AIS_POSITION_DUPLICATE","This source observation has already been received.");if(e?.code==="42501")return bad(res,409,"AIS_POSITION_RIGHTS_BLOCKED","AIS source rights or policy guard rejected the observation.");return bad(res,500,"AIS_POSITION_INGEST_FAILED","Unable to ingest AIS observation.");}
 });
 app.patch("/api/v1/admin/maritime/vessel-positions/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id,status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,2000);
  if(!uuidPattern.test(id)||!["accepted","rejected","superseded"].includes(status)||note.length<5)return bad(res,400,"AIS_POSITION_REVIEW_INVALID","Observation, supported review state and substantive independent review note are required.");
  try{const q=await req.db.query("UPDATE public.vessel_tracking_positions SET review_status=$2,reviewed_by=req_user_id(),reviewed_at=now(),review_note=$3 WHERE id=$1::uuid AND review_status='pending' AND created_by<>req_user_id() RETURNING id,vessel_id,mmsi,position_timestamp,review_status,reviewed_by,reviewed_at,review_note",[id,status,note]);if(!q.rows.length)return bad(res,409,"AIS_POSITION_MAKER_CHECKER","Observation must be pending and reviewed by an independent administrator.");return res.json({observation:q.rows[0],displayable:status==="accepted"});}
  catch(e:any){if(e?.code==="42501"||e?.code==="23514")return bad(res,409,"AIS_POSITION_REVIEW_REJECTED","Current source rights or maker-checker guard rejected this review.");return bad(res,500,"AIS_POSITION_REVIEW_FAILED","Unable to review AIS observation.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-positions",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAnyAccess(req,res,p,["vessel.view","shipping.view","vessel.position.view"]))return;
  try{
   const exists=await req.db.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vessel_tracking_positions' AND column_name='source_id') AS ready");
   if(exists.rows[0]?.ready!==true)return bad(res,503,"AIS_SCHEMA_NOT_RELEASED","AIS observation schema is not released on this database.");
   const q=await req.db.query("SELECT DISTINCT ON (o.vessel_id) o.id,o.vessel_id,v.name AS vessel_name,o.latitude,o.longitude,CASE WHEN EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=o.source_id AND f.field_code='sog_knots' AND f.purpose_code='internal_operations' AND f.allowed IS TRUE) THEN o.sog_knots ELSE NULL END AS sog_knots,CASE WHEN EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=o.source_id AND f.field_code='cog_degrees' AND f.purpose_code='internal_operations' AND f.allowed IS TRUE) THEN o.cog_degrees ELSE NULL END AS cog_degrees,o.position_timestamp AS observed_at,o.received_at,o.provider_code,o.source_quality,EXTRACT(EPOCH FROM (now()-o.position_timestamp))::int AS age_seconds,s.metadata->>'freshness_sla_seconds' AS freshness_sla_seconds,o.attribution_text,o.source_reference FROM public.vessel_tracking_positions o JOIN public.vessels v ON v.id=o.vessel_id JOIN public.maritime_data_sources s ON s.id=o.source_id JOIN public.voyages g ON g.vessel_id=o.vessel_id AND g.project_id=$1::uuid WHERE o.review_status='accepted' AND s.enabled IS TRUE AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=s.id AND f.field_code IN ('latitude','longitude','observed_at') AND f.purpose_code='internal_operations' AND f.allowed IS TRUE GROUP BY f.source_id HAVING COUNT(DISTINCT f.field_code)=3) ORDER BY o.vessel_id,o.position_timestamp DESC",[p]);
   const positions=q.rows.map((r:R)=>{const sla=Number(r.freshness_sla_seconds),validSla=Number.isInteger(sla)&&sla>0,quality=String(r.source_quality||"unknown");const freshness=quality==="provider_unavailable"?"provider_unavailable":quality==="stale"||(validSla&&Number(r.age_seconds)>sla)?"stale":quality==="delayed"?"delayed":quality==="fresh"&&validSla&&Number(r.age_seconds)<=sla?"fresh":"unknown";return {...r,freshness_status:freshness};});
   return res.json({positions,hasAcceptedObservations:positions.length>0,freshnessPolicy:"source_configured",operationalClearance:false});
  }catch{return bad(res,500,"AIS_POSITION_READ_FAILED","Unable to read approved Project AIS observations.");}
 });

 // P17-C: vessel/terminal compatibility is advisory only; no navigational or port-clearance authority is implied.
 app.get("/api/v1/projects/:projectId/vessels/:vesselId/advisory-screening",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,vessel=req.params.vesselId,port=str(req.query.portId,64),terminal=str(req.query.terminalId,64);
  if(!uuidPattern.test(p)||!uuidPattern.test(vessel)||!uuidPattern.test(port)||!uuidPattern.test(terminal))return bad(res,400,"VESSEL_SCREENING_INPUT_INVALID","Project, vessel, destination port and terminal IDs are required.");
  if(!await requireProjectAnyAccess(req,res,p,["vessel.view","vessel.nomination.review","shipping.view"]))return;
  try{
   const linked=await req.db.query("SELECT 1 FROM public.shipments WHERE project_id=$1::uuid AND destination_port_id=$2::uuid LIMIT 1",[p,port]);
   if(!linked.rows.length)return bad(res,404,"PROJECT_DESTINATION_PORT_NOT_FOUND","Destination port is not linked to a shipment in this Project.");
   const v=await req.db.query("SELECT id,name,imo_number,vessel_type,verification_status,verified_at,loa_m,beam_m,depth_m,air_draft_m,summer_draft_m,max_draft_m,dwt_mt,hold_capacity_m3,cargo_capabilities,source_reference FROM public.vessels WHERE id=$1::uuid AND is_active IS TRUE",[vessel]);
   const t=await req.db.query("SELECT id,port_id,terminal_code,name,status,verified_at,cargo_types,operating_restrictions,source_reference FROM public.port_terminals WHERE id=$1::uuid AND port_id=$2::uuid",[terminal,port]);
   if(!v.rows.length||!t.rows.length)return bad(res,404,"VESSEL_OR_TERMINAL_NOT_FOUND","Active vessel and terminal at the selected port are required.");
   const vesselRow=v.rows[0],terminalRow=t.rows[0],limits=terminalRow.operating_restrictions||{};
   const known=(x:unknown)=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x));
   const vesselCargo=JSON.stringify(vesselRow.cargo_capabilities||{});
   const terminalCargo=Array.isArray(terminalRow.cargo_types)?terminalRow.cargo_types.join(" "):"";
   const checks=[
    {code:"vessel_master_verified",status:vesselRow.verification_status==="verified"&&!!vesselRow.verified_at?"evidenced":"unknown"},
    {code:"terminal_master_verified",status:terminalRow.status==="operational"&&!!terminalRow.verified_at?"evidenced":"unknown"},
    {code:"loa_limit",status:known(vesselRow.loa_m)&&known(limits.max_loa_m)?(Number(vesselRow.loa_m)<=Number(limits.max_loa_m)?"within_advisory_limit":"exceeds_advisory_limit"):"unknown"},
    {code:"beam_limit",status:known(vesselRow.beam_m)&&known(limits.max_beam_m)?(Number(vesselRow.beam_m)<=Number(limits.max_beam_m)?"within_advisory_limit":"exceeds_advisory_limit"):"unknown"},
    {code:"draft_limit",status:known(vesselRow.summer_draft_m??vesselRow.max_draft_m)&&known(limits.max_draft_m)?(Number(vesselRow.summer_draft_m??vesselRow.max_draft_m)<=Number(limits.max_draft_m)?"within_advisory_limit":"exceeds_advisory_limit"):"unknown"},
    {code:"pke_cargo_compatibility",status:/pke|palm kernel expeller/i.test(terminalCargo)&&/pke|palm kernel expeller/i.test(vesselCargo)?"candidate_match":"unknown"}
   ];
   const advisoryStatus=checks.some(x=>x.status==="exceeds_advisory_limit")?"adverse_advisory":checks.every(x=>x.status!=="unknown")?"candidate_only":"insufficient_verified_data";
   return res.json({projectId:p,vessel:vesselRow,terminal:terminalRow,checks,advisoryStatus,operationalClearance:false,disclaimer:"Advisory screening only. It is not port acceptance, pilotage, navigation, berth allocation, statutory clearance or master/terminal sign-off."});
  }catch{return bad(res,500,"VESSEL_SCREENING_FAILED","Unable to complete advisory vessel/terminal screening.");}
 });

 // P17-G: Project control tower uses actual Project rows; missing sources are never represented as zero.
 app.get("/api/v1/projects/:projectId/p17-control-tower",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"pke.logistics.master.view"))return;
  try{
   const k=await req.db.query("SELECT COUNT(*)::int AS shipment_count,COUNT(DISTINCT pks_site_id)::int AS linked_pks_count,COUNT(DISTINCT destination_port_id)::int AS destination_port_count,COALESCE(SUM(quantity),0)::numeric AS planned_quantity FROM public.shipments WHERE project_id=$1::uuid",[p]);
   const v=await req.db.query("SELECT COUNT(*)::int AS voyage_count,COUNT(*) FILTER(WHERE status IN ('planned','nominated','confirmed'))::int AS planned_or_active_voyages FROM public.voyages WHERE project_id=$1::uuid",[p]);
   const n=await req.db.query("SELECT COUNT(*)::int AS nomination_count,COUNT(*) FILTER(WHERE nomination_status='submitted')::int AS pending_review_count FROM public.vessel_nominations WHERE project_id=$1::uuid",[p]);
   const pc=await req.db.query("SELECT COUNT(*)::int AS port_call_count,COUNT(*) FILTER(WHERE c.status='actual')::int AS actual_port_call_count,COUNT(*) FILTER(WHERE c.status IN ('planned','predicted'))::int AS predicted_port_call_count FROM public.vessel_port_calls c JOIN public.voyages v ON v.id=c.voyage_id WHERE v.project_id=$1::uuid",[p]);
   const load=await req.db.query("SELECT COUNT(*)::int AS operation_count,COUNT(*) FILTER(WHERE status IN ('completed','closed'))::int AS completed_count FROM public.loading_operations WHERE project_id=$1::uuid",[p]);
   const tickets=await req.db.query("SELECT unit_code,COUNT(*)::int AS ticket_count,COALESCE(SUM(quantity),0)::numeric AS measured_quantity,COUNT(*) FILTER(WHERE verified_at IS NOT NULL)::int AS verified_count FROM public.loading_tickets WHERE project_id=$1::uuid GROUP BY unit_code ORDER BY unit_code",[p]);
   const routes=await req.db.query("WITH candidates AS (SELECT DISTINCT ON (s.pks_site_id,pr.port_id) s.pks_site_id,ps.name AS pks_name,pr.port_id,pt.name AS port_name,pt.verification_status AS port_verification_status,pt.verified_at AS port_verified_at,EXISTS(SELECT 1 FROM public.shipments ds WHERE ds.project_id=$1::uuid AND ds.pks_site_id=s.pks_site_id AND ds.destination_port_id=pr.port_id) AS is_shipment_destination,pr.distance_km,pr.estimated_travel_minutes,pr.verified_at AS route_verified_at,pr.source_reference AS route_source_reference,COALESCE(term.verified_pke_terminal_count,0)::int AS verified_pke_terminal_count,COALESCE(eq.verified_loading_equipment_count,0)::int AS verified_loading_equipment_count,COALESCE(wh.verified_warehouse_count,0)::int AS verified_warehouse_count,wh.verified_warehouse_capacity_mt,CASE WHEN pt.verification_status='verified' AND pt.verified_at IS NOT NULL AND COALESCE(term.verified_pke_terminal_count,0)>0 AND COALESCE(eq.verified_loading_equipment_count,0)>0 AND COALESCE(wh.verified_warehouse_count,0)>0 THEN 'evidence_candidate_only' ELSE 'insufficient_verified_pke_capability_evidence' END AS pke_capability_status FROM (SELECT DISTINCT pks_site_id FROM public.shipments WHERE project_id=$1::uuid AND pks_site_id IS NOT NULL) s JOIN public.pks_sites ps ON ps.id=s.pks_site_id AND ps.is_active IS TRUE AND ps.verification_status='verified' AND ps.verified_at IS NOT NULL AND ps.operating_status='operational' AND ps.facility_type IN ('palm_oil_mill','kernel_crushing_plant','integrated_mill_kcp') JOIN public.pks_port_routes pr ON pr.pks_site_id=s.pks_site_id AND pr.is_active IS TRUE AND pr.verified_at IS NOT NULL AND pr.source_reference IS NOT NULL AND pr.distance_km IS NOT NULL JOIN public.ports pt ON pt.id=pr.port_id AND pt.is_active IS TRUE LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE t.status='operational' AND t.verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(t.cargo_types) AS x(cargo_type) WHERE lower(x.cargo_type) LIKE '%pke%' OR lower(x.cargo_type) LIKE '%palm kernel expeller%') ) AS verified_pke_terminal_count FROM public.port_terminals t WHERE t.port_id=pr.port_id) term ON true LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE e.condition_status='operational' AND e.last_verified_at IS NOT NULL AND e.equipment_type ~* '(loader|conveyor|ship.?loader|loading|weighbridge|belt_scale)') AS verified_loading_equipment_count FROM public.port_equipment e WHERE e.port_id=pr.port_id) eq ON true LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE w.verification_status='verified' AND w.verified_at IS NOT NULL) AS verified_warehouse_count,SUM(w.storage_capacity_mt) FILTER(WHERE w.verification_status='verified' AND w.verified_at IS NOT NULL) AS verified_warehouse_capacity_mt FROM public.warehouses w WHERE w.port_id=pr.port_id) wh ON true WHERE true ORDER BY s.pks_site_id,pr.port_id,pr.distance_km ASC NULLS LAST) SELECT * FROM candidates ORDER BY CASE WHEN pke_capability_status='evidence_candidate_only' THEN 0 ELSE 1 END,distance_km ASC NULLS LAST,pks_name,port_name",[p]);
   const access=await req.db.query("SELECT public.pke_has_project_permission($1::uuid,'documents.view') AS documents,public.pke_has_project_permission($1::uuid,'workflow.view') AS workflow,public.pke_has_project_permission($1::uuid,'vessel.view') AS vessel",[p]);
   const docs=access.rows[0]?.documents===true?await req.db.query("SELECT status,COUNT(*)::int AS count FROM public.project_export_documents WHERE project_id=$1::uuid GROUP BY status ORDER BY status",[p]):{rows:[]};
   const work=access.rows[0]?.workflow===true?await req.db.query("SELECT COUNT(*)::int AS work_item_count,COUNT(*) FILTER(WHERE status IN ('open','acknowledged','in_progress','blocked','submitted'))::int AS unresolved_count,COUNT(*) FILTER(WHERE due_at<now() AND status NOT IN ('resolved','closed','cancelled'))::int AS overdue_count,COUNT(*) FILTER(WHERE work_item_type='exception' AND status NOT IN ('resolved','closed','cancelled'))::int AS open_exception_count FROM public.project_work_items WHERE project_id=$1::uuid",[p]):{rows:[]};
   const stages=await req.db.query("SELECT status,COUNT(*)::int AS shipment_count,COALESCE(SUM(quantity),0)::numeric AS planned_quantity FROM public.shipments WHERE project_id=$1::uuid GROUP BY status ORDER BY status",[p]);
   const allocations=await req.db.query("WITH ticket_totals AS (SELECT project_id,lot_id,unit_code,COUNT(*) FILTER(WHERE status='verified')::int AS verified_ticket_count,COALESCE(SUM(quantity) FILTER(WHERE status='verified'),0)::numeric AS verified_ticket_quantity FROM public.loading_tickets WHERE project_id=$1::uuid AND lot_id IS NOT NULL GROUP BY project_id,lot_id,unit_code), allocated AS (SELECT project_id,lot_id,unit,SUM(allocated_quantity)::numeric AS allocated_quantity,SUM(loaded_quantity)::numeric AS reported_loaded_quantity FROM public.shipment_allocations WHERE project_id=$1::uuid GROUP BY project_id,lot_id,unit) SELECT a.lot_id,a.unit,a.allocated_quantity,a.reported_loaded_quantity,t.verified_ticket_count,t.verified_ticket_quantity,CASE WHEN a.unit=t.unit_code THEN (a.reported_loaded_quantity-t.verified_ticket_quantity)::numeric ELSE NULL END AS ticket_variance,CASE WHEN t.lot_id IS NULL THEN 'no_tickets' WHEN a.unit<>t.unit_code THEN 'unit_mismatch' WHEN COALESCE(t.verified_ticket_count,0)=0 THEN 'no_verified_ticket' WHEN a.reported_loaded_quantity=t.verified_ticket_quantity THEN 'matched' ELSE 'variance' END AS reconciliation_status FROM allocated a LEFT JOIN ticket_totals t ON t.project_id=a.project_id AND t.lot_id=a.lot_id ORDER BY a.lot_id,a.unit",[p]);
   const assessments=access.rows[0]?.vessel===true?await req.db.query("SELECT result,COUNT(*)::int AS count FROM public.vessel_port_assessments WHERE project_id=$1::uuid GROUP BY result ORDER BY result",[p]):{rows:[]};
   const acceptanceSchema=await req.db.query("SELECT to_regclass('public.loading_operation_acceptances') IS NOT NULL AS ready");
   const loadingAcceptances=acceptanceSchema.rows[0]?.ready===true?await req.db.query("SELECT acceptance_type,review_status,COUNT(*)::int AS count FROM public.loading_operation_acceptances WHERE project_id=$1::uuid GROUP BY acceptance_type,review_status ORDER BY acceptance_type,review_status",[p]):{rows:[]};
   const positionSchema=await req.db.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vessel_tracking_positions' AND column_name='source_id') AS ready");
   let positions:any[]=[];
   let positionStatus="schema_not_released";
   if(positionSchema.rows[0]?.ready===true){const pos=await req.db.query("SELECT DISTINCT ON (o.vessel_id) o.vessel_id,v.name AS vessel_name,o.latitude,o.longitude,o.position_timestamp,o.received_at,o.provider_code,o.source_quality,s.metadata->>'freshness_sla_seconds' AS freshness_sla_seconds FROM public.vessel_tracking_positions o JOIN public.vessels v ON v.id=o.vessel_id JOIN public.maritime_data_sources s ON s.id=o.source_id JOIN public.voyages g ON g.vessel_id=o.vessel_id AND g.project_id=$1::uuid WHERE o.review_status='accepted' AND s.enabled IS TRUE AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=s.id AND f.field_code IN ('latitude','longitude','observed_at') AND f.purpose_code='internal_operations' AND f.allowed IS TRUE GROUP BY f.source_id HAVING COUNT(DISTINCT f.field_code)=3) ORDER BY o.vessel_id,o.position_timestamp DESC",[p]);positions=pos.rows.map((r:R)=>{const age=Math.floor((Date.now()-new Date(r.position_timestamp).getTime())/1000),sla=Number(r.freshness_sla_seconds),valid=Number.isInteger(sla)&&sla>0,quality=String(r.source_quality||"unknown");const freshness=quality==="provider_unavailable"?"provider_unavailable":quality==="stale"||(valid&&age>sla)?"stale":quality==="delayed"?"delayed":quality==="fresh"&&valid&&age<=sla?"fresh":"unknown";return {...r,age_seconds:age,freshness_status:freshness};});positionStatus="available";}
   return res.json({projectId:p,sourceStatus:{shipments:"available",shipmentStages:"available",voyages:"available",nominations:"available",portCalls:"available",loadingOperations:"available",loadingTickets:"available",loadingAcceptances:acceptanceSchema.rows[0]?.ready===true?"available":"schema_not_released",shipmentAllocations:"available",documents:access.rows[0]?.documents===true?"available":"permission_unavailable",workItems:access.rows[0]?.workflow===true?"available":"permission_unavailable",vesselAssessments:access.rows[0]?.vessel===true?"available":"permission_unavailable",vesselPositions:positionStatus,pksPortRoutes:"available"},kpis:{...k.rows[0],...v.rows[0],...n.rows[0],...pc.rows[0],...load.rows[0],...work.rows[0]},shipmentStages:stages.rows,loadingByUnit:tickets.rows,quantityReconciliation:allocations.rows,loadingAcceptancesByTypeAndStatus:loadingAcceptances.rows,documentsByStatus:docs.rows,vesselAssessmentsByResult:assessments.rows,lastKnownVesselPositions:positions,projectPksPortRoutes:routes.rows,quality:{plannedQuantityIsNotLoadedQuantity:true,actualPortCallsRequireConfirmedEvidence:true,loadingTicketQuantityRequiresIndependentVerification:true,quantityReconciliationRequiresUnitMatch:true,aisPositionsAreLastKnownNotLive:true,operationalClearance:false}});
  }catch(e:any){return bad(res,500,"P17_CONTROL_TOWER_READ_FAILED","Project control tower source query failed; metrics are not substituted with zero.");}
 });

 // Platform Admin portfolio Control Tower; aggregate only persisted Project sources.
 app.get("/api/v1/admin/p17-control-tower",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{
   const projects=await req.db.query("SELECT id,name,status,created_at FROM public.projects ORDER BY created_at DESC");
   const shipments=await req.db.query("SELECT project_id,COUNT(*)::int AS shipment_count,COALESCE(SUM(quantity),0)::numeric AS planned_quantity,COUNT(DISTINCT pks_site_id)::int AS linked_pks_count,COUNT(DISTINCT destination_port_id)::int AS destination_port_count FROM public.shipments GROUP BY project_id");
   const loading=await req.db.query("SELECT project_id,COUNT(*)::int AS loading_operations,COUNT(*) FILTER(WHERE status IN ('completed','closed'))::int AS completed_operations FROM public.loading_operations GROUP BY project_id");
   const voyages=await req.db.query("SELECT project_id,COUNT(*)::int AS voyage_count,COUNT(*) FILTER(WHERE status IN ('planned','nominated','confirmed'))::int AS planned_or_active_voyages FROM public.voyages GROUP BY project_id");
   const nominations=await req.db.query("SELECT project_id,COUNT(*)::int AS nomination_count,COUNT(*) FILTER(WHERE nomination_status='submitted')::int AS pending_nominations,COUNT(*) FILTER(WHERE nomination_status='rejected')::int AS rejected_nominations FROM public.vessel_nominations GROUP BY project_id");
   const portCalls=await req.db.query("SELECT v.project_id,COUNT(*)::int AS port_call_count,COUNT(*) FILTER(WHERE c.status='actual')::int AS actual_port_calls,COUNT(*) FILTER(WHERE c.status IN ('planned','predicted'))::int AS predicted_port_calls FROM public.voyages v JOIN public.vessel_port_calls c ON c.voyage_id=v.id GROUP BY v.project_id");
   const allocations=await req.db.query("SELECT project_id,COUNT(*)::int AS allocation_count,COALESCE(SUM(allocated_quantity),0)::numeric AS allocated_quantity,COALESCE(SUM(loaded_quantity),0)::numeric AS reported_loaded_quantity FROM public.shipment_allocations GROUP BY project_id");
   const docs=await req.db.query("SELECT project_id,COUNT(*)::int AS document_count,COUNT(*) FILTER(WHERE status='approved')::int AS approved_documents,COUNT(*) FILTER(WHERE status IN ('uploaded','under_review'))::int AS pending_documents FROM public.project_export_documents GROUP BY project_id");
   const tasks=await req.db.query("SELECT project_id,COUNT(*) FILTER(WHERE status NOT IN ('resolved','closed','cancelled'))::int AS unresolved_work_items,COUNT(*) FILTER(WHERE due_at<now() AND status NOT IN ('resolved','closed','cancelled'))::int AS overdue_work_items,COUNT(*) FILTER(WHERE work_item_type='exception' AND status NOT IN ('resolved','closed','cancelled'))::int AS open_exceptions FROM public.project_work_items GROUP BY project_id");
   const index=new Map<string,any>();for(const p of projects.rows)index.set(String(p.id),{...p,shipments:null,loading:null,documents:null,workItems:null});
   for(const [key,rows] of [["shipments",shipments.rows],["loading",loading.rows],["voyages",voyages.rows],["nominations",nominations.rows],["portCalls",portCalls.rows],["allocations",allocations.rows],["documents",docs.rows],["workItems",tasks.rows]] as const)for(const row of rows){const item=index.get(String(row.project_id));if(item)item[key]=row;}
   return res.json({projects:[...index.values()],sourceStatus:{projects:"available",shipments:"available",loadingOperations:"available",voyages:"available",nominations:"available",portCalls:"available",allocations:"available",documents:"available",workItems:"available"},quality:{unavailableSourcesAreNull:true,plannedQuantityIsNotLoadedQuantity:true,adminScope:"platform_admin_only"}});
  }catch{return bad(res,500,"P17_ADMIN_CONTROL_TOWER_FAILED","Unable to read Platform Admin portfolio projection.");}
 });

 // P17-F: Buyer access is resolved by verified Neon Auth identity mapping plus active scoped grants.
 app.post("/api/v1/admin/buyer-visibility-grants/expire",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const expired=await req.db.query("UPDATE public.buyer_visibility_grants SET status='expired' WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=now() RETURNING id,project_id,buyer_id");for(const g of expired.rows)await req.db.query("INSERT INTO public.buyer_visibility_grant_events(grant_id,project_id,buyer_id,event_code,actor_id,reason) VALUES($1::uuid,$2::uuid,$3::uuid,'expired',req_user_id(),'Grant expired at its configured expiry time')",[g.id,g.project_id,g.buyer_id]);return res.json({expiredCount:expired.rows.length});}
  catch{return bad(res,500,"BUYER_GRANT_EXPIRY_FAILED","Unable to record expired Buyer grants.");}
 });
 app.get("/api/v1/admin/buyer-auth-mappings",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{
   const mappings=await req.db.query("SELECT m.id,m.user_id,u.name AS user_name,u.email AS user_email,(u.neon_auth_user_id IS NOT NULL) AS auth_identity_linked,m.buyer_id,b.name AS buyer_name,m.mapping_status,m.created_by,m.reviewed_by,m.reviewed_at,m.review_note,m.created_at,m.updated_at FROM public.buyer_auth_user_mappings m JOIN public.users u ON u.id=m.user_id JOIN public.buyers b ON b.id=m.buyer_id ORDER BY m.created_at DESC");
   const users=await req.db.query("SELECT u.id,u.name,u.email FROM public.users u WHERE u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.buyer_auth_user_mappings m WHERE m.user_id=u.id) ORDER BY u.name,u.email");
   const buyers=await req.db.query("SELECT b.id,b.name,b.code FROM public.buyers b WHERE b.is_active IS TRUE AND NOT EXISTS(SELECT 1 FROM public.buyer_auth_user_mappings m WHERE m.buyer_id=b.id AND m.mapping_status<>'revoked') ORDER BY b.name");
   return res.json({mappings:mappings.rows,eligibleUsers:users.rows,eligibleBuyers:buyers.rows,identityMatching:"explicit_user_id_only"});
  }catch{return bad(res,503,"BUYER_MAPPING_SCHEMA_NOT_RELEASED","Buyer mapping schema is not released on this database.");}
 });
 app.get("/api/v1/projects/:projectId/buyer-visibility-grant-candidates",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"buyer.visibility.manage"))return;
  try{const ready=await req.db.query("SELECT to_regclass('public.buyer_auth_user_mappings') IS NOT NULL AS ready");if(ready.rows[0]?.ready!==true)return bad(res,503,"BUYER_MAPPING_SCHEMA_NOT_RELEASED","Verified Buyer mapping schema is not released.");const buyers=await req.db.query("SELECT b.id,b.name,b.code FROM public.buyers b JOIN public.buyer_auth_user_mappings m ON m.buyer_id=b.id AND m.mapping_status='active' WHERE b.is_active IS TRUE ORDER BY b.name");const shipments=await req.db.query("SELECT id,shipment_code FROM public.shipments WHERE project_id=$1::uuid ORDER BY shipment_code",[p]);return res.json({buyers:buyers.rows,shipments:shipments.rows});}
  catch{return bad(res,500,"BUYER_GRANT_CANDIDATES_FAILED","Unable to load verified Buyer grant candidates.");}
 });
 app.get("/api/v1/projects/:projectId/buyer-visibility-grants",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"buyer.visibility.manage"))return;
  try{const q=await req.db.query("SELECT g.id,g.project_id,g.buyer_id,b.name AS buyer_name,g.shipment_id,s.shipment_code,g.scope,g.status,g.granted_by,g.granted_at,g.expires_at,g.revoked_by,g.revoked_at,g.reason FROM public.buyer_visibility_grants g JOIN public.buyers b ON b.id=g.buyer_id LEFT JOIN public.shipments s ON s.id=g.shipment_id AND s.project_id=g.project_id WHERE g.project_id=$1::uuid ORDER BY g.created_at DESC",[p]);return res.json({grants:q.rows});}
  catch{return bad(res,500,"BUYER_GRANTS_READ_FAILED","Unable to read Project Buyer grants.");}
 });
 app.post("/api/v1/admin/buyer-auth-mappings",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const userId=str(req.body?.userId,64),buyerId=str(req.body?.buyerId,64);
  if(!uuidPattern.test(userId)||!uuidPattern.test(buyerId))return bad(res,400,"BUYER_MAPPING_INPUT_INVALID","Valid canonical user and Buyer IDs are required.");
  try{const q=await req.db.query("INSERT INTO public.buyer_auth_user_mappings(user_id,buyer_id,mapping_status,created_by) SELECT u.id,b.id,'pending_review',req_user_id() FROM public.users u JOIN public.buyers b ON b.id=$2::uuid AND b.is_active IS TRUE WHERE u.id=$1::uuid AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL RETURNING id,user_id,buyer_id,mapping_status,created_by,created_at",[userId,buyerId]);if(!q.rows.length)return bad(res,409,"BUYER_MAPPING_IDENTITY_UNVERIFIED","User must have an explicitly linked active Neon Auth identity and Buyer must be active.");return res.status(201).json({mapping:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"BUYER_MAPPING_EXISTS","User already has a Buyer mapping or Buyer is already mapped.");return bad(res,500,"BUYER_MAPPING_CREATE_FAILED","Unable to create Buyer mapping.");}
 });
 app.patch("/api/v1/admin/buyer-auth-mappings/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id,status=str(req.body?.mappingStatus,24),note=str(req.body?.reviewNote,2000);
  if(!uuidPattern.test(id)||!["active","suspended","revoked"].includes(status)||note.length<5)return bad(res,400,"BUYER_MAPPING_REVIEW_INVALID","Valid mapping, review state and substantive independent review note are required.");
  try{const q=await req.db.query("UPDATE public.buyer_auth_user_mappings SET mapping_status=$2,reviewed_by=req_user_id(),reviewed_at=now(),review_note=$3,updated_at=now() WHERE id=$1::uuid AND created_by<>req_user_id() RETURNING id,user_id,buyer_id,mapping_status,reviewed_by,reviewed_at,review_note",[id,status,note]);if(!q.rows.length)return bad(res,409,"BUYER_MAPPING_MAKER_CHECKER","Mapping review must be performed by an administrator independent from its creator.");return res.json({mapping:q.rows[0]});}
  catch(e:any){if(e?.code==="23505"||e?.code==="23514"||e?.code==="42501")return bad(res,409,"BUYER_MAPPING_REVIEW_REJECTED","Mapping review violates identity, uniqueness or maker-checker controls.");return bad(res,500,"BUYER_MAPPING_REVIEW_FAILED","Unable to review Buyer mapping.");}
 });
 app.post("/api/v1/projects/:projectId/buyer-visibility-grants",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"buyer.visibility.manage"))return;
  const buyerId=str(req.body?.buyerId,64),shipmentId=str(req.body?.shipmentId,64)||null,scope=str(req.body?.scope,40),reason=str(req.body?.reason,2000),expires=time(req.body?.expiresAt);
  if(!uuidPattern.test(buyerId)||(shipmentId&&!uuidPattern.test(shipmentId))||!["summary","milestones"].includes(scope)||reason.length<5||(req.body?.expiresAt&&(!expires||Date.parse(expires)<=Date.now())))return bad(res,400,"BUYER_GRANT_INPUT_INVALID","Buyer, supported scope, reason and optional valid expiry are required.");
  try{const q=await req.db.query("INSERT INTO public.buyer_visibility_grants(project_id,buyer_id,shipment_id,scope,granted_by,expires_at,reason,status) SELECT $1::uuid,b.id,$3::uuid,$4,req_user_id(),$5::timestamptz,$6,'active' FROM public.buyers b JOIN public.buyer_auth_user_mappings m ON m.buyer_id=b.id AND m.mapping_status='active' JOIN public.users bu ON bu.id=m.user_id AND bu.is_active IS TRUE AND bu.neon_auth_user_id IS NOT NULL WHERE b.id=$2::uuid AND b.is_active IS TRUE AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM public.shipments s WHERE s.id=$3::uuid AND s.project_id=$1::uuid)) RETURNING *",[p,buyerId,shipmentId,scope,expires,reason]);if(!q.rows.length)return bad(res,409,"BUYER_GRANT_MAPPING_REQUIRED","Buyer must be active, have an approved identity mapping and optional shipment must belong to this Project.");const g=q.rows[0];await req.db.query("INSERT INTO public.buyer_visibility_grant_events(grant_id,project_id,buyer_id,event_code,actor_id,reason) VALUES($1::uuid,$2::uuid,$3::uuid,'granted',req_user_id(),$4)",[g.id,p,buyerId,reason]);return res.status(201).json({grant:g});}
  catch(e:any){if(e?.code==="23503"||e?.code==="42501")return bad(res,409,"BUYER_GRANT_REJECTED","Buyer grant violates Project or permission controls.");return bad(res,500,"BUYER_GRANT_CREATE_FAILED","Unable to create Buyer visibility grant.");}
 });
 app.patch("/api/v1/projects/:projectId/buyer-visibility-grants/:grantId/revoke",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.grantId;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"BUYER_GRANT_ID_INVALID","Invalid Project or grant ID.");if(!await requireProjectAccess(req,res,p,"buyer.visibility.manage"))return;
  const reason=str(req.body?.reason,2000);if(reason.length<5)return bad(res,400,"BUYER_GRANT_REVOKE_REASON_REQUIRED","Substantive revocation reason is required.");
  try{const q=await req.db.query("UPDATE public.buyer_visibility_grants SET status='revoked',revoked_by=req_user_id(),revoked_at=now(),reason=$3 WHERE id=$1::uuid AND project_id=$2::uuid AND status='active' RETURNING *",[id,p,reason]);if(!q.rows.length)return bad(res,409,"BUYER_GRANT_NOT_ACTIVE","Active Project grant was not found.");const g=q.rows[0];await req.db.query("INSERT INTO public.buyer_visibility_grant_events(grant_id,project_id,buyer_id,event_code,actor_id,reason) VALUES($1::uuid,$2::uuid,$3::uuid,'revoked',req_user_id(),$4)",[g.id,p,g.buyer_id,reason]);return res.json({grant:g});}
  catch(e:any){return bad(res,500,"BUYER_GRANT_REVOKE_FAILED","Unable to revoke Buyer visibility grant.");}
 });
 app.get("/api/v1/buyer/shipments",requireAuth,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT DISTINCT s.id,s.project_id,s.shipment_code,s.status,s.quantity,s.unit_code,s.planned_departure_at,s.planned_arrival_at,p.name AS destination_port FROM public.buyer_auth_user_mappings m JOIN public.users u ON u.id=m.user_id AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL JOIN public.buyers b ON b.id=m.buyer_id JOIN public.buyer_visibility_grants g ON g.buyer_id=b.id JOIN public.shipments s ON s.project_id=g.project_id AND (g.shipment_id IS NULL OR g.shipment_id=s.id) LEFT JOIN public.ports p ON p.id=s.destination_port_id WHERE m.user_id=req_user_id() AND m.mapping_status='active' AND b.is_active IS TRUE AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now()) AND g.scope IN ('summary','milestones') ORDER BY s.planned_departure_at DESC NULLS LAST");return res.json({shipments:q.rows,accessState:q.rows.length?"active":"no_active_grant"});}
  catch{return bad(res,500,"BUYER_SHIPMENT_READ_FAILED","Unable to read Buyer shipment projection.");}
 });
 app.get("/api/v1/buyer/shipments/:shipmentId/milestones",requireAuth,async(req:R,res:Response)=>{
  const id=req.params.shipmentId;if(!uuidPattern.test(id))return bad(res,400,"SHIPMENT_ID_INVALID","Invalid shipment ID.");
  try{const q=await req.db.query("SELECT e.id,e.event_type,e.status,e.event_timestamp,e.quantity_delta,e.unit_code FROM public.shipment_events e WHERE e.shipment_id=$1::uuid AND EXISTS(SELECT 1 FROM public.buyer_auth_user_mappings m JOIN public.users u ON u.id=m.user_id AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL JOIN public.buyers b ON b.id=m.buyer_id AND b.is_active IS TRUE JOIN public.buyer_visibility_grants g ON g.buyer_id=m.buyer_id WHERE m.user_id=req_user_id() AND m.mapping_status='active' AND g.project_id=e.project_id AND (g.shipment_id IS NULL OR g.shipment_id=e.shipment_id) AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now()) AND g.scope='milestones') ORDER BY e.event_timestamp DESC",[id]);return res.json({milestones:q.rows});}
  catch{return bad(res,500,"BUYER_MILESTONES_READ_FAILED","Unable to read Buyer milestone projection.");}
 });

 app.get("/api/v1/admin/maritime/sources",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{
   const q=await req.db.query("SELECT id,source_code,provider_name,source_class,dataset_code,endpoint_url,terms_url,license_code,access_method,rights_status,commercial_use_allowed,internal_processing_allowed,customer_display_allowed,redistribution_allowed,derivative_use_allowed,caching_allowed,retention_days,attribution_text,rights_evidence_url,rights_reviewed_by,rights_reviewed_at,rights_expires_at,enabled,quota_limit,quota_window_seconds,metadata,created_at,updated_at FROM public.maritime_data_sources ORDER BY provider_name,source_code");
   return res.json({sources:q.rows});
  }catch{return bad(res,500,"MARITIME_SOURCE_READ_FAILED","Unable to read maritime source registry.");}
 });
 app.post("/api/v1/admin/maritime/sources",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body||{},code=str(b.sourceCode,64),provider=str(b.providerName,160),dataset=str(b.datasetCode,64);
  const cls=str(b.sourceClass,40),terms=str(b.termsUrl,1000),endpoint=str(b.endpointUrl,1000);
  const licence=str(b.licenseCode,120),access=str(b.accessMethod,30)||"manual";
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(code)||provider.length<2||!/^[a-z][a-z0-9_]{1,63}$/.test(dataset)||
    !["port_master","marine_weather","ais","port_geometry","navigation_notice","other"].includes(cls)||
    !["manual","https_api","file_download","webhook"].includes(access))
    return bad(res,400,"MARITIME_SOURCE_INVALID","Source identity, class or access method is invalid.");
  try{
   const q=await req.db.query("INSERT INTO public.maritime_data_sources(source_code,provider_name,dataset_code,source_class,endpoint_url,terms_url,license_code,access_method,rights_status,enabled,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending_review',false,req_user_id()) RETURNING id,source_code,provider_name,source_class,dataset_code,endpoint_url,terms_url,license_code,access_method,rights_status,enabled,created_at,updated_at",
    [code,provider,dataset,cls,endpoint||null,terms||null,licence||null,access]);
   return res.status(201).json({source:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23505")return bad(res,409,"MARITIME_SOURCE_EXISTS","Source code already exists.");
   return bad(res,500,"MARITIME_SOURCE_CREATE_FAILED","Unable to register source.");
  }
 });
 app.patch("/api/v1/admin/maritime/sources/:id/rights",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const b=req.body||{},status=str(b.rightsStatus,30),terms=str(b.termsUrl,1000),evidence=str(b.rightsEvidenceUrl,1000);
  const attribution=str(b.attributionText,1000),note=str(b.reviewNote,2000);
  const expiry=time(b.rightsExpiresAt),retention=b.retentionDays==null?null:Number(b.retentionDays),freshnessSla=b.freshnessSlaSeconds==null||b.freshnessSlaSeconds===""?null:Number(b.freshnessSlaSeconds),delayedGrace=b.freshnessDelayedGraceSeconds==null||b.freshnessDelayedGraceSeconds===""?null:Number(b.freshnessDelayedGraceSeconds);
  const nullableBool=(v:unknown)=>typeof v==="boolean"?v:null;
  if(!["approved","restricted","suspended","revoked","expired","pending_review"].includes(status)||note.length<5||
    (status==="approved"&&(!terms||!evidence||!attribution||nullableBool(b.internalProcessingAllowed)!==true||!expiry||
      !/^https?:\/\//i.test(terms)||!/^https?:\/\//i.test(evidence)))||
    (retention!==null&&(!Number.isInteger(retention)||retention<0||retention>3650))||(freshnessSla!==null&&(!Number.isInteger(freshnessSla)||freshnessSla<=0))||(delayedGrace!==null&&(!Number.isInteger(delayedGrace)||delayedGrace<0))||(delayedGrace!==null&&freshnessSla===null))
    return bad(res,400,"MARITIME_RIGHTS_REVIEW_INVALID","Rights approval requires internal-processing scope, HTTP(S) terms/evidence URLs, attribution, expiry and review note.");
  try{
   const q=await req.db.query("UPDATE public.maritime_data_sources SET rights_status=$2,commercial_use_allowed=$3,internal_processing_allowed=$4,customer_display_allowed=$5,redistribution_allowed=$6,derivative_use_allowed=$7,caching_allowed=$8,retention_days=$9,terms_url=$10,rights_evidence_url=$11,attribution_text=$12,rights_reviewed_by=req_user_id(),rights_reviewed_at=now(),rights_expires_at=$13,metadata=(COALESCE(metadata,'{}'::jsonb)-'rights_review_note'-'freshness_sla_seconds'-'freshness_delayed_grace_seconds')||jsonb_build_object('rights_review_note',$14::text)||CASE WHEN $15::int IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('freshness_sla_seconds',$15::int) END||CASE WHEN $16::int IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('freshness_delayed_grace_seconds',$16::int) END,updated_by=req_user_id(),updated_at=now() WHERE id=$1::uuid RETURNING id,source_code,provider_name,source_class,dataset_code,endpoint_url,terms_url,license_code,access_method,rights_status,commercial_use_allowed,internal_processing_allowed,customer_display_allowed,redistribution_allowed,derivative_use_allowed,caching_allowed,retention_days,attribution_text,rights_evidence_url,rights_reviewed_by,rights_reviewed_at,rights_expires_at,enabled,quota_limit,quota_window_seconds,metadata,updated_at",
    [id,status,nullableBool(b.commercialUseAllowed),nullableBool(b.internalProcessingAllowed),nullableBool(b.customerDisplayAllowed),nullableBool(b.redistributionAllowed),nullableBool(b.derivativeUseAllowed),nullableBool(b.cachingAllowed),retention,terms||null,evidence||null,attribution||null,expiry,note,freshnessSla,delayedGrace]);
   if(!q.rows.length)return bad(res,404,"MARITIME_SOURCE_NOT_FOUND","Source not found.");
   return res.json({source:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"MARITIME_RIGHTS_GUARD_REJECTED","Source rights constraints rejected the decision.");
   return bad(res,500,"MARITIME_RIGHTS_REVIEW_FAILED","Unable to record rights decision.");
  }
 });
 app.put("/api/v1/admin/maritime/sources/:id/field-permissions",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id)||!Array.isArray(req.body?.fields))return bad(res,400,"MARITIME_FIELD_PERMISSIONS_INVALID","Source ID and field permission list are required.");
  const fields=req.body.fields;
  if(fields.length>250||fields.some((f:R)=>!/^[a-z][a-z0-9_]{1,95}$/.test(str(f?.fieldCode,100))||
    !["internal_operations","customer_display","analytics","redistribution","derived_product"].includes(str(f?.purposeCode,100))||
    typeof f?.allowed!=="boolean"||(f.allowed===true&&str(f?.evidenceReference,1000).length<5)))
    return bad(res,400,"MARITIME_FIELD_PERMISSION_INVALID","Each field requires valid code, purpose, decision and evidence reference.");
  try{
   const locked=await req.db.query("SELECT id FROM public.maritime_data_sources WHERE id=$1::uuid FOR UPDATE",[id]);
   if(!locked.rows.length)return bad(res,404,"MARITIME_SOURCE_NOT_FOUND","Source not found.");
   for(const f of fields)await req.db.query("INSERT INTO public.maritime_source_field_permissions(source_id,field_code,purpose_code,allowed,evidence_reference,reviewed_by,reviewed_at) VALUES($1::uuid,$2,$3,$4,$5,CASE WHEN $4 THEN req_user_id() ELSE NULL END,CASE WHEN $4 THEN now() ELSE NULL END) ON CONFLICT(source_id,field_code,purpose_code) DO UPDATE SET allowed=EXCLUDED.allowed,evidence_reference=EXCLUDED.evidence_reference,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at",
    [id,str(f.fieldCode,100),str(f.purposeCode,100),f.allowed===true,str(f.evidenceReference,1000)||null]);
   return res.json({ok:true,count:fields.length});
  }catch(e:any){
   if(e?.code==="42501"||e?.code==="23514")return bad(res,409,"MARITIME_FIELD_PERMISSION_GUARD_REJECTED","Field permissions exceed source rights/evidence constraints.");
   return bad(res,500,"MARITIME_FIELD_PERMISSIONS_FAILED","Unable to save field permissions.");
  }
 });
 app.patch("/api/v1/admin/maritime/sources/:id/enable",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  if(typeof req.body?.enabled!=="boolean")return bad(res,400,"MARITIME_SOURCE_ENABLE_INPUT_INVALID","Explicit enabled=true or false is required.");
  try{
   const q=await req.db.query("UPDATE public.maritime_data_sources SET enabled=$2,updated_by=req_user_id(),updated_at=now() WHERE id=$1::uuid AND ($2=false OR (rights_status='approved' AND internal_processing_allowed IS TRUE AND rights_reviewed_by IS NOT NULL AND rights_reviewed_at IS NOT NULL AND rights_expires_at>now() AND NULLIF(btrim(terms_url),'') IS NOT NULL AND NULLIF(btrim(rights_evidence_url),'') IS NOT NULL AND NULLIF(btrim(attribution_text),'') IS NOT NULL)) RETURNING id,source_code,rights_status,enabled,rights_expires_at",[id,req.body.enabled]);
   if(!q.rows.length)return bad(res,409,"SOURCE_RIGHTS_NOT_ACTIVE","Source cannot be enabled without current approved and evidenced rights.");
   return res.json({source:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,409,"SOURCE_RIGHTS_NOT_ACTIVE","Database rejected source activation.");return bad(res,500,"MARITIME_SOURCE_ENABLE_FAILED","Unable to change source state.");}
 });
 app.post("/api/v1/admin/maritime/sources/:id/runs",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const key=str(req.body?.idempotencyKey,200);if(key.length<8)return bad(res,400,"MARITIME_RUN_IDEMPOTENCY_REQUIRED","Idempotency key must contain 8-200 characters.");
  try{
   const source=await req.db.query("SELECT id,dataset_code,quota_limit,quota_window_seconds FROM public.maritime_data_sources WHERE id=$1::uuid AND enabled IS TRUE AND rights_status='approved' AND internal_processing_allowed IS TRUE AND rights_expires_at>now() FOR UPDATE",[id]);
   if(!source.rows.length)return bad(res,409,"SOURCE_RIGHTS_NOT_CURRENT","Source is not enabled with current internal-processing rights.");
   const quotaLimit=source.rows[0].quota_limit==null?null:Number(source.rows[0].quota_limit);
   const quotaWindow=source.rows[0].quota_window_seconds==null?null:Number(source.rows[0].quota_window_seconds);
   if(quotaLimit!==null&&quotaWindow!==null){
    const quota=await req.db.query("INSERT INTO public.maritime_provider_usage(source_id,window_started_at,window_seconds,request_count,quota_limit,last_request_at,updated_at) SELECT id,date_bin(make_interval(secs=>quota_window_seconds),now(),TIMESTAMPTZ '1970-01-01'),quota_window_seconds,1,quota_limit,now(),now() FROM public.maritime_data_sources WHERE id=$1::uuid ON CONFLICT(source_id,window_started_at,window_seconds) DO UPDATE SET request_count=public.maritime_provider_usage.request_count+1,quota_limit=EXCLUDED.quota_limit,last_request_at=now(),updated_at=now() WHERE public.maritime_provider_usage.request_count<EXCLUDED.quota_limit RETURNING id",[id]);
    if(!quota.rows.length)return bad(res,429,"SOURCE_QUOTA_EXHAUSTED","Source request quota is exhausted for the current quota window.");
   }
   const run=await req.db.query("INSERT INTO public.maritime_ingestion_runs(source_id,dataset_code,idempotency_key,run_status,started_at,triggered_by) VALUES($1::uuid,$2,$3,'running',now(),req_user_id()) RETURNING *",[id,source.rows[0].dataset_code,key]);
   return res.status(201).json({run:run.rows[0]});
  }catch(e:any){
   if(e?.code==="23505")return bad(res,409,"MARITIME_RUN_DUPLICATE","Run idempotency key already exists.");
   if(e?.code==="42501")return bad(res,409,"MARITIME_RUN_RIGHTS_BLOCKED","Source rights or quota controls rejected run creation.");
   return bad(res,500,"MARITIME_RUN_CREATE_FAILED","Unable to start ingestion run.");
  }
 });
 app.post("/api/v1/admin/maritime/runs/:runId/staging",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const run=req.params.runId;if(!uuidPattern.test(run)||!Array.isArray(req.body?.records)||req.body.records.length>500)return bad(res,400,"MARITIME_STAGING_INVALID","Valid run ID and batch up to 500 records are required.");
  const records: Array<{externalRecordId?:unknown;payload?:unknown;payloadSha256?:unknown;entityType?:unknown}> = req.body.records;
  for(const item of records){
   const external=str(item?.externalRecordId,240),payload=item?.payload,hash=str(item?.payloadSha256,64),entity=str(item?.entityType,40)||"other";
   if(!external||!payload||typeof payload!=="object"||Array.isArray(payload)||Object.keys(payload).length===0||!/^[a-f0-9]{64}$/.test(hash)||
     createHash("sha256").update(JSON.stringify(payload) || "").digest("hex")!==hash||
     !["port","port_geometry","marine_forecast","marine_warning","vessel_identity","vessel_position","navigation_notice","other"].includes(entity))
     return bad(res,400,"MARITIME_STAGING_RECORD_INVALID","Each record needs external ID, supported entity type, JSON payload and SHA-256.");
  }
  try{
   const active=await req.db.query("SELECT id,source_id FROM public.maritime_ingestion_runs WHERE id=$1::uuid AND run_status IN ('queued','running') FOR UPDATE",[run]);
   if(!active.rows.length)return bad(res,409,"MARITIME_RUN_NOT_ACTIVE","Ingestion run is not active.");
   const permissions=await req.db.query("SELECT field_code FROM public.maritime_source_field_permissions WHERE source_id=$1::uuid AND purpose_code='internal_operations' AND allowed IS TRUE",[active.rows[0].source_id]);
   const allowedFields=new Set<string>(permissions.rows.map((row:R)=>String(row.field_code)));
   const blockedFields=new Set<string>();
   for(const item of records)for(const field of Object.keys(item.payload as Record<string,unknown>))if(!allowedFields.has(field))blockedFields.add(field);
   if(blockedFields.size)return res.status(403).json({error:"Payload has fields not approved for internal operations.",code:"MARITIME_FIELD_PURPOSE_BLOCKED",fields:[...blockedFields]});
   const staged=[];
   for(const item of records){
    const q=await req.db.query("INSERT INTO public.maritime_ingestion_staging(run_id,external_record_id,entity_type,raw_payload,payload_sha256,review_status) VALUES($1::uuid,$2,$3,$4::jsonb,$5,'pending') ON CONFLICT(run_id,external_record_id,payload_sha256) DO NOTHING RETURNING *",[run,str(item.externalRecordId,240),str(item.entityType,40)||"other",JSON.stringify(item.payload),str(item.payloadSha256,64)]);
    if(q.rows[0])staged.push(q.rows[0]);
   }
   return res.status(201).json({staged});
  }catch(e:any){
   if(e?.code==="42501")return bad(res,409,"MARITIME_STAGING_RIGHTS_BLOCKED","Current source rights do not permit staging.");
   return bad(res,500,"MARITIME_STAGING_FAILED","Unable to stage provider records.");
  }
 });
 app.patch("/api/v1/admin/maritime/staging/:stagingId/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.stagingId;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_STAGING_ID_INVALID","Invalid staging ID.");
  const status=str(req.body?.reviewStatus,30);
  if(!["accepted","rejected","quarantined"].includes(status))return bad(res,400,"MARITIME_STAGING_REVIEW_INVALID","Supported review status is required.");
  try{
   const q=await req.db.query("UPDATE public.maritime_ingestion_staging SET review_status=$2,reviewed_by=req_user_id(),reviewed_at=now() WHERE id=$1::uuid AND review_status='pending' RETURNING *",[id,status]);
   if(!q.rows.length)return bad(res,404,"MARITIME_STAGING_NOT_REVIEWABLE","Staged record not found or already reviewed.");
   return res.json({staging:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"MARITIME_STAGING_REVIEW_REJECTED","Database rejected staging review.");
   return bad(res,500,"MARITIME_STAGING_REVIEW_FAILED","Unable to review staged record.");
  }
 });
 app.patch("/api/v1/admin/maritime/runs/:runId/complete",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.runId;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_RUN_ID_INVALID","Invalid ingestion run ID.");
  const seen=Number(req.body?.recordsSeen),staged=Number(req.body?.recordsStaged),rejected=Number(req.body?.recordsRejected);
  if(!Number.isInteger(seen)||!Number.isInteger(staged)||!Number.isInteger(rejected)||seen<0||staged<0||rejected<0||staged>seen||rejected>seen)return bad(res,400,"MARITIME_RUN_COUNTS_INVALID","Run counters must be non-negative and individually cannot exceed records seen.");
  try{
   const q=await req.db.query("UPDATE public.maritime_ingestion_runs SET run_status=CASE WHEN $4>0 THEN 'partial' ELSE 'succeeded' END,records_seen=$2,records_staged=$3,records_rejected=$4,completed_at=now() WHERE id=$1::uuid AND run_status='running' RETURNING *",[id,seen,staged,rejected]);
   if(!q.rows.length)return bad(res,404,"MARITIME_RUN_NOT_ACTIVE","Ingestion run not found or not active.");
   return res.json({run:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23514")return bad(res,409,"MARITIME_RUN_COUNTS_REJECTED","Run counters violate database constraints.");
   return bad(res,500,"MARITIME_RUN_COMPLETE_FAILED","Unable to complete ingestion run.");
  }
 });
 app.post("/api/v1/admin/maritime/sources/:id/health",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=req.params.id;if(!uuidPattern.test(id))return bad(res,400,"MARITIME_SOURCE_ID_INVALID","Invalid source ID.");
  const state=str(req.body?.healthStatus,30),latency=req.body?.latencyMs==null?null:Number(req.body.latencyMs),message=str(req.body?.message,1000);
  if(!["unknown","healthy","degraded","unavailable","quota_exhausted","rights_blocked"].includes(state)||(latency!==null&&(!Number.isInteger(latency)||latency<0)))return bad(res,400,"MARITIME_HEALTH_INVALID","Supported health state and valid optional latency are required.");
  try{
   const q=await req.db.query("INSERT INTO public.maritime_provider_health(source_id,health_status,latency_ms,details,checked_at,checked_by) VALUES($1::uuid,$2,$3,jsonb_build_object('message',$4),now(),req_user_id()) RETURNING *",[id,state,latency,message||null]);
   return res.status(201).json({health:q.rows[0]});
  }catch(e:any){
   if(e?.code==="23503")return bad(res,404,"MARITIME_SOURCE_NOT_FOUND","Source not found.");
   return bad(res,500,"MARITIME_HEALTH_WRITE_FAILED","Unable to record provider health.");
  }
 });

// P17-E: Project-scoped voyages, nominations and port calls. Every mutation is permission-gated.
 app.get("/api/v1/projects/:projectId/voyages",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAnyAccess(req,res,p,["voyage.view","vessel.view","shipping.view"]))return;
  try{const q=await req.db.query("SELECT * FROM public.voyages WHERE project_id=$1::uuid ORDER BY COALESCE(planned_departure_at,actual_departure_at,start_date) DESC NULLS LAST",[p]);return res.json({voyages:q.rows});}
  catch{return bad(res,500,"VOYAGE_READ_FAILED","Unable to read Project voyages.");}
 });
 app.post("/api/v1/projects/:projectId/voyages",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"voyage.create"))return;
  const b=req.body||{},code=str(b.voyageCode,80),key=str(b.idempotencyKey,128),vessel=str(b.vesselId,64);
  if(!code||!key||(vessel&&!uuidPattern.test(vessel)))return bad(res,400,"VOYAGE_INPUT_INVALID","Voyage code, idempotency key and valid optional vessel ID are required.");
  try{const q=await req.db.query("INSERT INTO public.voyages(project_id,voyage_code,vessel_id,status,created_by,idempotency_key) VALUES($1::uuid,$2,$3::uuid,'planned',req_user_id(),$4) RETURNING *",[p,code,vessel||null,key]);const v=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'voyage',$2::uuid,'voyage_created',$3,req_user_id(),$4,'{}'::jsonb)",[p,v.id,v.status,key]);return res.status(201).json({voyage:v,operationalClearance:false});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"VOYAGE_DUPLICATE","Voyage code or idempotency key already exists.");return bad(res,500,"VOYAGE_CREATE_FAILED","Unable to create voyage.");}
 });
 app.patch("/api/v1/projects/:projectId/voyages/:voyageId",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.voyageId;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"VOYAGE_ID_INVALID","Invalid Project or voyage ID.");if(!await requireProjectAccess(req,res,p,"voyage.update"))return;
  const version=Number(req.body?.expectedVersion),code=str(req.body?.voyageCode,80),status=str(req.body?.status,30);
  if(!Number.isInteger(version)||version<1||!code||!["planned","nominated","confirmed","arrived","departed","completed","cancelled"].includes(status))return bad(res,400,"VOYAGE_UPDATE_INVALID","Expected version, voyage code and supported status are required.");
  try{const before=await req.db.query("SELECT status FROM public.voyages WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);const q=await req.db.query("UPDATE public.voyages SET voyage_code=$4,status=$5,version=version+1,updated_by=req_user_id(),updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND version=$3 RETURNING *",[id,p,version,code,status]);if(!q.rows.length)return bad(res,409,"VOYAGE_VERSION_CONFLICT","Voyage changed or is outside Project scope.");const v=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,from_status,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'voyage',$2::uuid,'voyage_updated',$3,$4,req_user_id(),$5,jsonb_build_object('version',$6::int))",[p,v.id,before.rows[0]?.status||null,v.status,"voyage:"+v.id+":v"+v.version,v.version]);return res.json({voyage:v,operationalClearance:false});}
  catch{return bad(res,500,"VOYAGE_UPDATE_FAILED","Unable to update voyage.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-nominations",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAnyAccess(req,res,p,["vessel.view","vessel.nominate","vessel.nomination.review"]))return;
  try{const q=await req.db.query("SELECT * FROM public.vessel_nominations WHERE project_id=$1::uuid ORDER BY created_at DESC",[p]);return res.json({nominations:q.rows});}
  catch{return bad(res,500,"NOMINATION_READ_FAILED","Unable to read Project nominations.");}
 });
 app.post("/api/v1/projects/:projectId/vessel-nominations",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAccess(req,res,p,"vessel.nominate"))return;
  const b=req.body||{},shipment=str(b.shipmentId,64),vessel=str(b.vesselId,64),key=str(b.idempotencyKey,128);
  if(!uuidPattern.test(shipment)||!uuidPattern.test(vessel)||!key)return bad(res,400,"NOMINATION_INPUT_INVALID","Shipment, vessel and idempotency key are required.");
  try{const q=await req.db.query("INSERT INTO public.vessel_nominations(project_id,shipment_id,vessel_id,voyage_id,nominated_by,idempotency_key) SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,req_user_id(),$5 WHERE EXISTS(SELECT 1 FROM public.shipments WHERE id=$2::uuid AND project_id=$1::uuid) RETURNING *",[p,shipment,vessel,b.voyageId||null,key]);if(!q.rows.length)return bad(res,422,"SHIPMENT_OUTSIDE_PROJECT","Shipment does not belong to this Project.");const n=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'vessel_nomination',$2::uuid,'nomination_created','draft',req_user_id(),$3,'{}'::jsonb)",[p,n.id,key]);return res.status(201).json({nomination:n});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"NOMINATION_DUPLICATE","Nomination already exists.");return bad(res,500,"NOMINATION_CREATE_FAILED","Unable to create nomination.");}
 });
 app.patch("/api/v1/projects/:projectId/vessel-nominations/:id/submit",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.id;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"NOMINATION_ID_INVALID","Invalid Project or nomination ID.");if(!await requireProjectAccess(req,res,p,"vessel.nominate"))return;
  const version=Number(req.body?.expectedVersion);
  if(!Number.isInteger(version)||version<1)return bad(res,400,"NOMINATION_VERSION_REQUIRED","Expected version is required.");
  try{const q=await req.db.query("UPDATE public.vessel_nominations SET nomination_status='submitted',submitted_at=now(),version=version+1,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND nominated_by=req_user_id() AND nomination_status='draft' AND version=$3 RETURNING *",[id,p,version]);if(!q.rows.length)return bad(res,409,"NOMINATION_SUBMIT_CONFLICT","Only the nominator may submit a current draft.");const n=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,from_status,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'vessel_nomination',$2::uuid,'nomination_submitted','draft','submitted',req_user_id(),$3,jsonb_build_object('version',$4::int))",[p,n.id,"nomination:"+n.id+":v"+n.version,n.version]);return res.json({nomination:n,operationalClearance:false});}
  catch(e:any){if(e?.code==="42501"||e?.code==="23514")return bad(res,409,"NOMINATION_SUBMIT_REJECTED","Nomination submission guard rejected this transition.");return bad(res,500,"NOMINATION_SUBMIT_FAILED","Unable to submit nomination.");}
 });
 app.patch("/api/v1/projects/:projectId/vessel-nominations/:id/withdraw",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.id;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"NOMINATION_ID_INVALID","Invalid Project or nomination ID.");if(!await requireProjectAccess(req,res,p,"vessel.nominate"))return;
  const version=Number(req.body?.expectedVersion),note=str(req.body?.decisionNote,2000);
  if(!Number.isInteger(version)||version<1||note.length<5)return bad(res,400,"NOMINATION_WITHDRAW_INPUT_INVALID","Expected version and withdrawal reason are required.");
  try{const q=await req.db.query("UPDATE public.vessel_nominations SET nomination_status='withdrawn',decision_note=$4,reviewed_by=NULL,reviewed_at=NULL,version=version+1,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND nominated_by=req_user_id() AND nomination_status IN ('draft','submitted','identity_verified','port_screened','documents_checked','approved_for_internal_planning') AND version=$3 RETURNING *",[id,p,version,note]);if(!q.rows.length)return bad(res,409,"NOMINATION_WITHDRAW_CONFLICT","Only the nominator may withdraw a current nomination.");const n=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'vessel_nomination',$2::uuid,'nomination_withdrawn','withdrawn',req_user_id(),$3,jsonb_build_object('version',$4::int,'note',$5::text))",[p,n.id,"nomination:"+n.id+":v"+n.version,n.version,n.decision_note]);return res.json({nomination:n,operationalClearance:false});}
  catch(e:any){if(e?.code==="42501"||e?.code==="23514")return bad(res,409,"NOMINATION_WITHDRAW_REJECTED","Nomination withdrawal guard rejected this transition.");return bad(res,500,"NOMINATION_WITHDRAW_FAILED","Unable to withdraw nomination.");}
 });
 app.patch("/api/v1/projects/:projectId/vessel-nominations/:id/decision",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId,id=req.params.id;if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"NOMINATION_ID_INVALID","Invalid Project or nomination ID.");if(!await requireProjectAccess(req,res,p,"vessel.nomination.review"))return;
  const status=str(req.body?.status,40),note=str(req.body?.decisionNote,2000),version=Number(req.body?.expectedVersion);
  if(!["identity_verified","port_screened","documents_checked","approved_for_internal_planning","rejected"].includes(status)||note.length<5||!Number.isInteger(version)||version<1)return bad(res,400,"NOMINATION_DECISION_INVALID","Supported review state, substantive decision note and expected version are required.");
  try{const before=await req.db.query("SELECT nomination_status FROM public.vessel_nominations WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);const q=await req.db.query("UPDATE public.vessel_nominations SET nomination_status=$3,reviewed_by=req_user_id(),reviewed_at=now(),decision_note=$4,version=version+1,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND nominated_by<>req_user_id() AND nomination_status IN ('submitted','identity_verified','port_screened','documents_checked') AND version=$5 RETURNING *",[id,p,status,note,version]);if(!q.rows.length)return bad(res,409,"MAKER_CHECKER_REQUIRED","Independent reviewer, expected version and a reviewable nomination are required.");const n=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,from_status,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'vessel_nomination',$2::uuid,'nomination_reviewed',$3,$4,req_user_id(),$5,jsonb_build_object('version',$6::int,'note',$7::text))",[p,n.id,before.rows[0]?.nomination_status||null,n.nomination_status,"nomination:"+n.id+":v"+n.version,n.version,n.decision_note]);return res.json({nomination:n,operationalClearance:false});}
  catch(e:any){if(e?.code==="42501"||e?.code==="23514")return bad(res,409,"NOMINATION_DECISION_REJECTED","Nomination decision guard rejected this transition.");return bad(res,500,"NOMINATION_DECISION_FAILED","Unable to decide nomination.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-port-calls",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");if(!await requireProjectAnyAccess(req,res,p,["vessel.view","shipping.view"]))return;
  try{const q=await req.db.query("SELECT c.* FROM public.vessel_port_calls c JOIN public.voyages v ON v.id=c.voyage_id WHERE v.project_id=$1::uuid ORDER BY c.predicted_at DESC NULLS LAST",[p]);return res.json({portCalls:q.rows});}
  catch{return bad(res,500,"PORT_CALL_READ_FAILED","Unable to read Project port calls.");}
 });
 app.post("/api/v1/projects/:projectId/vessel-port-calls",requireAuth,async(req:R,res:Response)=>{
  const p=req.params.projectId;if(!uuidPattern.test(p))return bad(res,400,"PROJECT_ID_INVALID","Invalid Project ID.");
  const b=req.body||{},voy=str(b.voyageId,64),port=str(b.portId,64),event=str(b.eventType,40),key=str(b.idempotencyKey,128),predicted=time(b.predictedAt),actual=time(b.actualAt);
  const isActual=["arrived","berthed","departed"].includes(event),isPredicted=["planned_arrival","eta_update"].includes(event);
  const permission=isActual?"vessel.port_call.confirm":"vessel.port_call.manage";
  if(!await requireProjectAccess(req,res,p,permission))return;
  if(!uuidPattern.test(voy)||!uuidPattern.test(port)||!key||(!isActual&&!isPredicted&&event!=="cancelled")||(isActual&&!actual)||(isPredicted&&!predicted)||(event==="cancelled"&&!predicted&&!actual))return bad(res,400,"PORT_CALL_INPUT_INVALID","Valid voyage, port, idempotency key and event-specific timestamp are required.");
  try{const q=await req.db.query("INSERT INTO public.vessel_port_calls(project_id,voyage_id,vessel_id,port_id,event_type,predicted_at,actual_at,status,created_by,idempotency_key) SELECT $6::uuid,$1::uuid,v.vessel_id,$2::uuid,$3,$4::timestamptz,$5::timestamptz,CASE WHEN $3='cancelled' THEN 'cancelled' WHEN $5::timestamptz IS NOT NULL THEN 'actual' ELSE 'predicted' END,req_user_id(),$7 FROM public.voyages v WHERE v.id=$1::uuid AND v.project_id=$6::uuid RETURNING *",[voy,port,event,predicted,actual,p,key]);if(!q.rows.length)return bad(res,422,"PORT_CALL_VOYAGE_MISMATCH","Voyage does not belong to this Project.");const pc=q.rows[0];await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1::uuid,'vessel_port_call',$2::uuid,'port_call_created',$3,req_user_id(),$4,jsonb_build_object('eventType',$5::text))",[p,pc.id,pc.status,key,event]);return res.status(201).json({portCall:pc,operationalClearance:false});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"PORT_CALL_DUPLICATE","Port-call idempotency key already exists.");if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"PORT_CALL_GUARD_REJECTED","Route or independent confirmation guard rejected event.");if(e?.code==="23503")return bad(res,422,"PORT_CALL_REFERENCE_INVALID","Port-call references are invalid.");return bad(res,500,"PORT_CALL_CREATE_FAILED","Unable to create port call.");}
 });
}
