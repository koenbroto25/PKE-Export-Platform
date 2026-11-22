import type { Express, Request, Response, RequestHandler } from "express";
type R = any;
type D = { requireAuth:RequestHandler; requireAdmin:RequestHandler; requireProjectPermission:(req:R,res:Response,projectId:string,permission:string)=>Promise<boolean>; uuidPattern:RegExp };
const bad=(res:Response,status:number,code:string,error:string)=>res.status(status).json({error,code});
const str=(v:unknown,n=200)=>typeof v==="string"?v.trim().slice(0,n):"";
const time=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;

export function registerP17MaritimeRoutes(app:Express,d:D){
 const {requireAuth,requireAdmin,requireProjectPermission,uuidPattern}=d;
 // P17-B: port identity reconciliation and versioned GeoJSON. Promotion is explicit and review-gated.
 app.get("/api/v1/admin/maritime/port-crosswalk",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT x.*,p.name AS port_name,s.source_code,s.provider_name FROM public.port_external_id_crosswalk x JOIN public.ports p ON p.id=x.port_id JOIN public.maritime_data_sources s ON s.id=x.source_id ORDER BY x.created_at DESC LIMIT 500");return res.json({crosswalk:q.rows});}
  catch{return bad(res,500,"PORT_CROSSWALK_LIST_FAILED","Unable to load port identity crosswalk.");}
 });
 app.post("/api/v1/admin/maritime/port-crosswalk",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body??{},port=String(b.portId||""),source=String(b.sourceId||""),external=str(b.externalRecordId,240),code=str(b.externalCode,120),method=str(b.matchMethod||"manual",32),reference=str(b.sourceReference,1000),hash=str(b.evidenceSha256,64);
  if(!uuidPattern.test(port)||!uuidPattern.test(source)||!external||reference.length<8||!["manual","official_code","unlocode","name_location","coordinate","fuzzy_candidate"].includes(method)||(hash&&!/^[0-9a-f]{64}$/.test(hash)))return bad(res,400,"INVALID_PORT_CROSSWALK","Port, source, external identity, method and source reference are required.");
  try{const rights=await req.db.query("SELECT s.id FROM public.maritime_data_sources s WHERE s.id=$1::uuid AND s.source_class='port_master' AND s.enabled AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=s.id AND f.field_code='external_port_identity' AND f.purpose_code='internal_operations' AND f.allowed)",[source]);if(!rights.rows.length)return bad(res,409,"PORT_SOURCE_RIGHTS_BLOCKED","Port identity source rights and field-purpose permission are not active.");
   const q=await req.db.query("INSERT INTO public.port_external_id_crosswalk(port_id,source_id,external_record_id,external_code,match_method,match_confidence,source_reference,evidence_sha256,source_snapshot,created_by) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::uuid) RETURNING *",[port,source,external,code||null,method,Number.isFinite(Number(b.matchConfidence))?Number(b.matchConfidence):null,reference,hash||null,JSON.stringify(b.sourceSnapshot&&typeof b.sourceSnapshot==="object"?b.sourceSnapshot:{}),req.user?.id]);
   return res.status(201).json({crosswalk:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"PORT_CROSSWALK_DUPLICATE","External port identity already exists for this source.");if(e?.code==="23503")return bad(res,422,"PORT_CROSSWALK_REFERENCE_INVALID","Port or source reference is invalid.");return bad(res,500,"PORT_CROSSWALK_CREATE_FAILED","Unable to create port identity candidate.");}
 });
 app.patch("/api/v1/admin/maritime/port-crosswalk/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||""),status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,1000);
  if(!uuidPattern.test(id)||!["matched","rejected","superseded"].includes(status)||note.length<5)return bad(res,400,"INVALID_PORT_CROSSWALK_REVIEW","Review status and substantive note are required.");
  try{const old=await req.db.query("SELECT created_by FROM public.port_external_id_crosswalk WHERE id=$1::uuid",[id]);if(!old.rows.length)return bad(res,404,"PORT_CROSSWALK_NOT_FOUND","Port identity candidate not found.");if(String(old.rows[0].created_by||"")===String(req.user?.id||""))return bad(res,403,"PORT_CROSSWALK_MAKER_CHECKER","Submitter cannot approve their own port identity match.");const q=await req.db.query("UPDATE public.port_external_id_crosswalk SET review_status=$2,reviewed_by=$3::uuid,reviewed_at=now(),review_note=$4,updated_at=now() WHERE id=$1::uuid RETURNING *",[id,status,req.user?.id,note]);return res.json({crosswalk:q.rows[0]});}
  catch(e:any){if(e?.code==="23514")return bad(res,422,"PORT_CROSSWALK_REVIEW_GUARD","Match review requires independent reviewer evidence.");return bad(res,500,"PORT_CROSSWALK_REVIEW_FAILED","Unable to review port identity candidate.");}
 });
 app.get("/api/v1/admin/maritime/port-geospatial-features",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT g.*,p.name AS port_name,k.name AS pks_site_name,s.source_code FROM public.port_geospatial_features g LEFT JOIN public.ports p ON p.id=g.port_id LEFT JOIN public.pks_sites k ON k.id=g.pks_site_id JOIN public.maritime_data_sources s ON s.id=g.source_id ORDER BY g.created_at DESC LIMIT 500");return res.json({features:q.rows});}
  catch{return bad(res,500,"PORT_GEO_LIST_FAILED","Unable to load port geospatial features.");}
 });
 app.post("/api/v1/admin/maritime/port-geospatial-features",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body??{},port=str(b.portId,36),pks=str(b.pksSiteId,36),source=String(b.sourceId||""),feature=str(b.featureType,32),geo=b.geometryGeoJson,version=str(b.datasetVersion,120),license=str(b.licenseCode,120),attribution=str(b.attributionText,1000),reference=str(b.sourceReference,1000);
  const allowed=["port_point","terminal_point","port_boundary","terminal_boundary","pks_point","pks_boundary","road_access","road_route"];
  if((!!port===!!pks)||(port&&!uuidPattern.test(port))||(pks&&!uuidPattern.test(pks))||!uuidPattern.test(source)||!allowed.includes(feature)||!geo||typeof geo!=="object"||Array.isArray(geo)||typeof geo.type!=="string"||!Array.isArray(geo.coordinates)||!version||!license||!attribution||!reference)return bad(res,400,"INVALID_PORT_GEO_FEATURE","Exactly one port/PKS subject, GeoJSON geometry, dataset version, license, attribution and source reference are required.");
  if((port&&!feature.startsWith("port")&&!feature.startsWith("terminal")&&!["road_access","road_route"].includes(feature))||(pks&&!["pks_point","pks_boundary","road_access","road_route"].includes(feature)))return bad(res,422,"PORT_GEO_SUBJECT_MISMATCH","Feature type does not match its port or PKS subject.");
  try{const rights=await req.db.query("SELECT s.id FROM public.maritime_data_sources s WHERE s.id=$1::uuid AND s.source_class='port_geometry' AND s.enabled AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now() AND EXISTS(SELECT 1 FROM public.maritime_source_field_permissions f WHERE f.source_id=s.id AND f.field_code='geometry_geojson' AND f.purpose_code='internal_operations' AND f.allowed)",[source]);if(!rights.rows.length)return bad(res,409,"PORT_GEO_SOURCE_RIGHTS_BLOCKED","Geospatial source rights and field-purpose permission are not active.");
   const crypto=await import("node:crypto"),serialized=JSON.stringify(geo),hash=crypto.createHash("sha256").update(serialized).digest("hex");
   const q=await req.db.query("INSERT INTO public.port_geospatial_features(port_id,pks_site_id,source_id,source_feature_id,feature_type,geometry_geojson,geometry_sha256,dataset_version,license_code,attribution_text,source_reference,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::uuid) RETURNING *",[port||null,pks||null,source,str(b.sourceFeatureId,240)||hash,feature,serialized,hash,version,license,attribution,reference,req.user?.id]);
   return res.status(201).json({feature:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"PORT_GEO_VERSION_DUPLICATE","This source feature version already exists.");if(e?.code==="23503")return bad(res,422,"PORT_GEO_REFERENCE_INVALID","Port, PKS or source reference is invalid.");return bad(res,500,"PORT_GEO_CREATE_FAILED","Unable to create geospatial feature.");}
 });
 app.patch("/api/v1/admin/maritime/port-geospatial-features/:id/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||""),status=str(req.body?.reviewStatus,24),note=str(req.body?.reviewNote,1000);
  if(!uuidPattern.test(id)||!["verified","rejected","superseded"].includes(status)||note.length<5)return bad(res,400,"INVALID_PORT_GEO_REVIEW","Review status and substantive note are required.");
  try{const old=await req.db.query("SELECT created_by FROM public.port_geospatial_features WHERE id=$1::uuid",[id]);if(!old.rows.length)return bad(res,404,"PORT_GEO_NOT_FOUND","Geospatial feature not found.");if(String(old.rows[0].created_by||"")===String(req.user?.id||""))return bad(res,403,"PORT_GEO_MAKER_CHECKER","Submitter cannot verify their own geospatial feature.");const q=await req.db.query("UPDATE public.port_geospatial_features SET review_status=$2,reviewed_by=$3::uuid,reviewed_at=now(),review_note=$4,updated_at=now() WHERE id=$1::uuid RETURNING *",[id,status,req.user?.id,note]);return res.json({feature:q.rows[0]});}
  catch(e:any){if(e?.code==="23514")return bad(res,422,"PORT_GEO_REVIEW_GUARD","Geospatial review requires an independent reviewer.");return bad(res,500,"PORT_GEO_REVIEW_FAILED","Unable to review geospatial feature.");}
 });
 // P17-A: registry, rights, run ledger and staging. Provider execution is intentionally separate.
 app.get("/api/v1/admin/maritime/sources",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT id,source_code,provider_name,source_class,dataset_code,endpoint_url,terms_url,license_code,access_method,rights_status,commercial_use_allowed,internal_processing_allowed,customer_display_allowed,redistribution_allowed,derivative_use_allowed,caching_allowed,retention_days,attribution_text,rights_reviewed_at,rights_expires_at,enabled,quota_limit,quota_window_seconds FROM public.maritime_data_sources ORDER BY source_code");return res.json({sources:q.rows});}
  catch{return bad(res,500,"SOURCE_LIST_FAILED","Unable to load maritime sources.");}
 });
 app.post("/api/v1/admin/maritime/sources",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const b=req.body??{},code=str(b.sourceCode,64),provider=str(b.providerName,160),dataset=str(b.datasetCode,64),kind=str(b.sourceClass,40),method=str(b.accessMethod||"manual",24),quotaLimit=b.quotaLimit==null?null:Number(b.quotaLimit),quotaWindow=b.quotaWindowSeconds==null?null:Number(b.quotaWindowSeconds);
  if(!/^[a-z][a-z0-9_]{1,63}$/.test(code)||!/^[a-z][a-z0-9_]{1,63}$/.test(dataset)||provider.length<2||!["port_master","marine_weather","ais","port_geometry","navigation_notice","other"].includes(kind)||!["manual","https_api","file_download","webhook"].includes(method)||((quotaLimit===null)!==(quotaWindow===null))||(quotaLimit!==null&&(!Number.isInteger(quotaLimit)||quotaLimit<1||!Number.isInteger(quotaWindow)||quotaWindow<1)))return bad(res,400,"INVALID_SOURCE","Source metadata or quota configuration is invalid.");
  try{const q=await req.db.query("INSERT INTO public.maritime_data_sources(source_code,provider_name,source_class,dataset_code,endpoint_url,terms_url,license_code,access_method,credential_secret_ref,quota_limit,quota_window_seconds,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid,$12::uuid) ON CONFLICT(source_code) DO NOTHING RETURNING id,source_code,rights_status,enabled",[code,provider,kind,dataset,str(b.endpointUrl,1000)||null,str(b.termsUrl,1000)||null,str(b.licenseCode,120)||null,method,str(b.credentialSecretRef,240)||null,quotaLimit,quotaWindow,req.user?.id||null]);if(!q.rows.length)return bad(res,409,"SOURCE_EXISTS","Source code already exists.");return res.status(201).json({source:q.rows[0]});}
  catch{return bad(res,500,"SOURCE_CREATE_FAILED","Unable to register source.");}
 });
 app.patch("/api/v1/admin/maritime/sources/:id/rights",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||""),b=req.body??{},status=str(b.rightsStatus,24),expiry=time(b.rightsExpiresAt),approved=status==="approved";
  if(!uuidPattern.test(id)||!["pending_review","approved","restricted","suspended","revoked","expired"].includes(status))return bad(res,400,"INVALID_RIGHTS","Invalid source or rights status.");
  if(approved&&(!expiry||Date.parse(expiry)<=Date.now()||b.internalProcessingAllowed!==true||!str(b.termsUrl,1000)||!str(b.rightsEvidenceUrl,1000)||!str(b.attributionText,1000)))return bad(res,422,"RIGHTS_EVIDENCE_REQUIRED","Approval requires future expiry, terms, evidence, attribution and explicit internal processing rights.");
  try{const q=await req.db.query("UPDATE public.maritime_data_sources SET rights_status=$2,commercial_use_allowed=$3,internal_processing_allowed=$4,customer_display_allowed=$5,redistribution_allowed=$6,derivative_use_allowed=$7,caching_allowed=$8,retention_days=$9,terms_url=$10,rights_evidence_url=$11,attribution_text=$12,rights_reviewed_by=$13::uuid,rights_reviewed_at=CASE WHEN $14 THEN now() ELSE NULL END,rights_expires_at=$15::timestamptz,enabled=CASE WHEN $2='approved' THEN enabled ELSE false END,updated_by=$13::uuid,updated_at=now() WHERE id=$1::uuid RETURNING id,source_code,rights_status,enabled,rights_expires_at",[id,status,b.commercialUseAllowed===true,b.internalProcessingAllowed===true,b.customerDisplayAllowed===true,b.redistributionAllowed===true,b.derivativeUseAllowed===true,b.cachingAllowed===true,Number.isInteger(b.retentionDays)?b.retentionDays:null,str(b.termsUrl,1000)||null,str(b.rightsEvidenceUrl,1000)||null,str(b.attributionText,1000)||null,req.user?.id||null,approved,expiry]);if(!q.rows.length)return bad(res,404,"SOURCE_NOT_FOUND","Source not found.");return res.json({source:q.rows[0]});}
  catch{return bad(res,500,"RIGHTS_UPDATE_FAILED","Unable to update source rights.");}
 });
 app.put("/api/v1/admin/maritime/sources/:id/field-permissions",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||""),items=Array.isArray(req.body?.fields)?req.body.fields:[];
  if(!uuidPattern.test(id)||!items.length||items.length>100)return bad(res,400,"INVALID_FIELD_RIGHTS","Source id and 1–100 field rights are required.");
  for(const item of items){if(!/^[a-z][a-z0-9_]{1,95}$/.test(str(item?.fieldCode,96))||!["internal_operations","customer_display","analytics","redistribution","derived_product"].includes(str(item?.purposeCode,40))||typeof item?.allowed!=="boolean"||(item.allowed&&(!str(item.evidenceReference,1000)||str(item.evidenceReference,1000).length<8)))return bad(res,422,"INVALID_FIELD_RIGHT","Every field requires a valid purpose, explicit allow/deny and evidence when allowed.");}
  try{
   const source=await req.db.query("SELECT id,rights_status,rights_expires_at,internal_processing_allowed,customer_display_allowed,redistribution_allowed,derivative_use_allowed FROM public.maritime_data_sources WHERE id=$1::uuid",[id]);if(!source.rows.length)return bad(res,404,"SOURCE_NOT_FOUND","Source not found.");
   const rights=source.rows[0];
   if(items.some(item=>item.allowed)&& (rights.rights_status!=="approved"||!rights.rights_expires_at||Date.parse(rights.rights_expires_at)<=Date.now()))return bad(res,409,"SOURCE_RIGHTS_NOT_CURRENT","Field permissions require current approved source rights.");
   for(const item of items){const purpose=str(item.purposeCode,40);const allowed=purpose==="internal_operations"||purpose==="analytics"?rights.internal_processing_allowed===true:purpose==="customer_display"?rights.customer_display_allowed===true:purpose==="redistribution"?rights.redistribution_allowed===true:purpose==="derived_product"?rights.derivative_use_allowed===true:false;if(item.allowed&&!allowed)return bad(res,422,"PURPOSE_RIGHT_NOT_GRANTED","Field-level permission cannot exceed the source-level rights grant.");}
   const saved=[];
   for(const item of items){const q=await req.db.query("INSERT INTO public.maritime_source_field_permissions(source_id,field_code,purpose_code,allowed,evidence_reference,reviewed_by,reviewed_at) VALUES($1::uuid,$2,$3,$4,$5,$6::uuid,CASE WHEN $4 THEN now() ELSE NULL END) ON CONFLICT(source_id,field_code,purpose_code) DO UPDATE SET allowed=EXCLUDED.allowed,evidence_reference=EXCLUDED.evidence_reference,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at RETURNING *",[id,str(item.fieldCode,96),str(item.purposeCode,40),item.allowed,str(item.evidenceReference,1000)||null,req.user?.id]);saved.push(q.rows[0]);}
   return res.json({fieldPermissions:saved});
  }catch{return bad(res,500,"FIELD_RIGHTS_UPDATE_FAILED","Unable to update source field rights.");}
 });
 app.patch("/api/v1/admin/maritime/sources/:id/enable",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||"");if(!uuidPattern.test(id))return bad(res,400,"INVALID_SOURCE_ID","Valid source id is required.");
  try{const q=await req.db.query("UPDATE public.maritime_data_sources SET enabled=true,updated_by=$2::uuid,updated_at=now() WHERE id=$1::uuid AND rights_status='approved' AND internal_processing_allowed IS TRUE AND rights_expires_at>now() AND rights_reviewed_by IS NOT NULL AND terms_url IS NOT NULL AND rights_evidence_url IS NOT NULL AND attribution_text IS NOT NULL RETURNING id,source_code,enabled",[id,req.user?.id||null]);if(!q.rows.length)return bad(res,409,"RIGHTS_NOT_APPROVED","Source rights are not approved and current.");return res.json({source:q.rows[0]});}
  catch{return bad(res,500,"SOURCE_ENABLE_FAILED","Unable to enable source.");}
 });
 app.post("/api/v1/admin/maritime/sources/:id/runs",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||""),key=str(req.get("Idempotency-Key")||req.body?.idempotencyKey,200);if(!uuidPattern.test(id)||key.length<8)return bad(res,400,"INVALID_RUN","Source and idempotency key are required.");
  try{const s=await req.db.query("SELECT id,dataset_code,enabled,rights_status,internal_processing_allowed,rights_expires_at,quota_limit,quota_window_seconds FROM public.maritime_data_sources WHERE id=$1::uuid FOR UPDATE",[id]);
   if(!s.rows.length)return bad(res,404,"SOURCE_NOT_FOUND","Source not found.");
   const x=s.rows[0];
   const prior=await req.db.query("SELECT * FROM public.maritime_ingestion_runs WHERE source_id=$1::uuid AND idempotency_key=$2",[id,key]);
   if(prior.rows.length)return res.json({run:prior.rows[0],replayed:true});
   const blockedRights=!x.enabled||x.rights_status!=="approved"||x.internal_processing_allowed!==true||!x.rights_expires_at||Date.parse(x.rights_expires_at)<=Date.now();
   let blockedQuota=false;
   if(!blockedRights&&x.quota_limit&&x.quota_window_seconds){
    const usage=await req.db.query("SELECT COALESCE(sum(request_count),0)::int AS used FROM public.maritime_provider_usage WHERE source_id=$1::uuid AND window_started_at>now()-($2::int*interval '1 second')",[id,x.quota_window_seconds]);
    blockedQuota=Number(usage.rows[0]?.used||0)>=Number(x.quota_limit);
   }
   const runStatus=blockedRights?"blocked_rights":blockedQuota?"blocked_quota":"queued";
   if(runStatus==="queued"&&x.quota_limit&&x.quota_window_seconds){
    await req.db.query("INSERT INTO public.maritime_provider_usage(source_id,window_started_at,window_seconds,request_count,quota_limit,last_request_at) VALUES($1::uuid,to_timestamp(floor(extract(epoch from now())/$2::int)*$2::int),$2::int,1,$3::int,now()) ON CONFLICT(source_id,window_started_at,window_seconds) DO UPDATE SET request_count=public.maritime_provider_usage.request_count+1,last_request_at=now(),updated_at=now()",[id,x.quota_window_seconds,x.quota_limit]);
   }
   const q=await req.db.query("INSERT INTO public.maritime_ingestion_runs(source_id,dataset_code,idempotency_key,run_status,completed_at,error_code,error_summary,triggered_by) VALUES($1::uuid,$2,$3,$4,CASE WHEN $4 IN ('blocked_rights','blocked_quota') THEN now() ELSE NULL END,CASE WHEN $4='blocked_rights' THEN 'SOURCE_RIGHTS_NOT_ACTIVE' WHEN $4='blocked_quota' THEN 'SOURCE_QUOTA_EXHAUSTED' END,CASE WHEN $4='blocked_rights' THEN 'Source disabled or rights not current' WHEN $4='blocked_quota' THEN 'Provider quota exhausted' END,$5::uuid) ON CONFLICT(source_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *",[id,x.dataset_code,key,runStatus,req.user?.id||null]);
   return res.status(201).json({run:q.rows[0]});}
  catch{return bad(res,500,"RUN_CREATE_FAILED","Unable to create ingestion run.");}
 });
 app.post("/api/v1/admin/maritime/runs/:runId/staging",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const runId=String(req.params.runId||""),b=req.body??{},external=str(b.externalRecordId,240),kind=str(b.entityType,40),payload=b.rawPayload;
  if(!uuidPattern.test(runId)||!external||!["port","port_geometry","marine_forecast","marine_warning","vessel_identity","vessel_position","navigation_notice","other"].includes(kind)||!payload||typeof payload!=="object")return bad(res,400,"INVALID_STAGING_RECORD","Staging record is invalid.");
  try{const crypto=await import("node:crypto"),serialized=JSON.stringify(payload),hash=crypto.createHash("sha256").update(serialized).digest("hex");const run=await req.db.query("SELECT r.run_status,s.enabled,s.rights_status,s.internal_processing_allowed,s.rights_expires_at FROM public.maritime_ingestion_runs r JOIN public.maritime_data_sources s ON s.id=r.source_id WHERE r.id=$1::uuid",[runId]);if(!run.rows.length)return bad(res,404,"RUN_NOT_FOUND","Ingestion run not found.");const x=run.rows[0];if(!["queued","running"].includes(x.run_status)||!x.enabled||x.rights_status!=="approved"||x.internal_processing_allowed!==true||!x.rights_expires_at||Date.parse(x.rights_expires_at)<=Date.now())return bad(res,409,"INGESTION_BLOCKED","Run cannot ingest under current source rights.");const q=await req.db.query("INSERT INTO public.maritime_ingestion_staging(run_id,external_record_id,entity_type,raw_payload,payload_sha256) VALUES($1::uuid,$2,$3,$4::jsonb,$5) ON CONFLICT(run_id,external_record_id,payload_sha256) DO NOTHING RETURNING *",[runId,external,kind,serialized,hash]);if(!q.rows.length)return bad(res,409,"STAGING_DUPLICATE","Identical record already staged.");await req.db.query("UPDATE public.maritime_ingestion_runs SET records_seen=records_seen+1,records_staged=records_staged+1,run_status='running',started_at=COALESCE(started_at,now()) WHERE id=$1::uuid",[runId]);return res.status(201).json({staging:q.rows[0]});}
  catch{return bad(res,500,"STAGING_FAILED","Unable to stage record.");}
 });

 app.get("/api/v1/admin/maritime/runs",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  try{const q=await req.db.query("SELECT r.*,s.source_code,s.provider_name FROM public.maritime_ingestion_runs r JOIN public.maritime_data_sources s ON s.id=r.source_id ORDER BY r.created_at DESC LIMIT 200");return res.json({runs:q.rows});}
  catch{return bad(res,500,"RUN_LIST_FAILED","Unable to load ingestion runs.");}
 });
 app.patch("/api/v1/admin/maritime/staging/:stagingId/review",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.stagingId||""),b=req.body??{},status=str(b.reviewStatus,24),normalized=b.normalizedPayload;
  if(!uuidPattern.test(id)||!["accepted","rejected","quarantined"].includes(status)||(status==="accepted"&&(!normalized||typeof normalized!=="object"||Array.isArray(normalized))))return bad(res,400,"INVALID_STAGING_REVIEW","Review status and normalized payload are invalid.");
  try{const q=await req.db.query("UPDATE public.maritime_ingestion_staging SET review_status=$2,normalized_payload=$3::jsonb,validation_errors=$4::jsonb,reviewed_by=$5::uuid,reviewed_at=now() WHERE id=$1::uuid AND review_status='pending' RETURNING *",[id,status,normalized?JSON.stringify(normalized):null,JSON.stringify(Array.isArray(b.validationErrors)?b.validationErrors:[]),req.user?.id]);if(!q.rows.length)return bad(res,409,"STAGING_ALREADY_REVIEWED","Staging record not found or already reviewed.");return res.json({staging:q.rows[0],promotion:"not_automatic"});}
  catch{return bad(res,500,"STAGING_REVIEW_FAILED","Unable to review staging record.");}
 });
 app.patch("/api/v1/admin/maritime/runs/:runId/complete",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.runId||""),status=str(req.body?.status,24),recordsSeen=Number(req.body?.recordsSeen??0),recordsRejected=Number(req.body?.recordsRejected??0);
  if(!uuidPattern.test(id)||!["succeeded","partial","failed","cancelled"].includes(status)||!Number.isInteger(recordsSeen)||recordsSeen<0||!Number.isInteger(recordsRejected)||recordsRejected<0||recordsRejected>recordsSeen)return bad(res,400,"INVALID_RUN_STATUS","Valid terminal run status and consistent non-negative counters are required.");
  try{const q=await req.db.query("UPDATE public.maritime_ingestion_runs SET run_status=$2,completed_at=now(),records_seen=GREATEST(records_seen,$3::int),records_rejected=GREATEST(records_rejected,$4::int),error_code=$5,error_summary=$6 WHERE id=$1::uuid AND run_status IN ('queued','running') RETURNING *",[id,status,recordsSeen,recordsRejected,str(req.body?.errorCode,96)||null,str(req.body?.errorSummary,1000)||null]);if(!q.rows.length)return bad(res,409,"RUN_NOT_ACTIVE","Run is not active or not found.");return res.json({run:q.rows[0]});}
  catch{return bad(res,500,"RUN_COMPLETE_FAILED","Unable to complete ingestion run.");}
 });
 app.post("/api/v1/admin/maritime/sources/:id/health",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const id=String(req.params.id||""),b=req.body??{},status=str(b.healthStatus,24),latency=Number.isInteger(b.latencyMs)?b.latencyMs:null,http=Number.isInteger(b.httpStatus)?b.httpStatus:null;
  if(!uuidPattern.test(id)||!["unknown","healthy","degraded","unavailable","quota_exhausted","rights_blocked"].includes(status)||(latency!==null&&latency<0)||(http!==null&&(http<100||http>599)))return bad(res,400,"INVALID_PROVIDER_HEALTH","Provider health record is invalid.");
  try{const q=await req.db.query("INSERT INTO public.maritime_provider_health(source_id,health_status,latency_ms,http_status,error_code,details,checked_by) VALUES($1::uuid,$2,$3,$4,$5,$6::jsonb,$7::uuid) RETURNING *",[id,status,latency,http,str(b.errorCode,96)||null,JSON.stringify(b.details&&typeof b.details==="object"?b.details:{}),req.user?.id]);return res.status(201).json({health:q.rows[0]});}
  catch{return bad(res,500,"PROVIDER_HEALTH_FAILED","Unable to record provider health.");}
 });

 
 // P17-B/P15 master-data change requests: PM can propose facility/organization edits
 // inside a Project; canonical master rows remain Platform Admin controlled.
 app.get("/api/v1/projects/:projectId/master-data-change-requests",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||"");
  if(!uuidPattern.test(p))return bad(res,400,"INVALID_PROJECT","Valid Project id required.");
  const canView=await requireProjectPermission(req,res,p,"pks.master_data.change_request.view");
  if(!canView)return;
  try{
   const q=await req.db.query("SELECT * FROM public.p2a_master_data_change_requests WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 200",[p]);
   return res.json({requests:q.rows});
  }catch{return bad(res,500,"MASTER_DATA_REQUEST_LIST_FAILED","Unable to load master-data change requests.");}
 });
 app.post("/api/v1/projects/:projectId/master-data-change-requests",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),b=req.body??{},entity=str(b.entityType,24),operation=str(b.operation,16),
   reason=str(b.requestReason,2000),sourceType=str(b.sourceType||"manual",32),sourceRef=str(b.sourceReference,500),
   target=str(b.targetId,36),sourceUrl=str(b.sourceUrl,1000),proposal=b.proposedData;
  if(!uuidPattern.test(p)||!["organization","facility"].includes(entity)||!["create","update"].includes(operation)||
    (operation==="update"&&!uuidPattern.test(target))||(operation==="create"&&target)||
    !reason||reason.length<10||!sourceRef||sourceRef.length<2||
    !["manual","public_reference","official_document","buyer_confirmed"].includes(sourceType)||
    (sourceUrl&&!/^https?:\/\//i.test(sourceUrl))||!proposal||typeof proposal!=="object"||Array.isArray(proposal)||!Object.keys(proposal).length)
    return bad(res,400,"INVALID_MASTER_DATA_REQUEST","Project, entity, operation, proposal, reason and source reference are required.");
  if(!(await requireProjectPermission(req,res,p,"pks.master_data.change_request.manage")))return;
  try{
   const q=await req.db.query("INSERT INTO public.p2a_master_data_change_requests(project_id,entity_type,operation,target_id,proposed_data,request_reason,source_type,source_reference,source_url,source_snapshot,requested_by) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11::uuid) RETURNING *",
    [p,entity,operation,target||null,JSON.stringify(proposal),reason,sourceType,sourceRef,sourceUrl||null,JSON.stringify(b.sourceSnapshot&&typeof b.sourceSnapshot==="object"&&!Array.isArray(b.sourceSnapshot)?b.sourceSnapshot:{}),req.user?.id]);
   return res.status(201).json({request:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,403,"MASTER_DATA_REQUEST_FORBIDDEN","Master-data change request permission is required.");if(e?.code==="23503")return bad(res,422,"MASTER_DATA_TARGET_INVALID","Target record or Project is invalid.");return bad(res,500,"MASTER_DATA_REQUEST_CREATE_FAILED","Unable to create master-data change request.");}
 });
 app.patch("/api/v1/projects/:projectId/master-data-change-requests/:requestId",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.requestId||""),b=req.body??{};
  if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"INVALID_MASTER_DATA_REQUEST","Valid Project and request ids are required.");
  if(!(await requireProjectPermission(req,res,p,"pks.master_data.change_request.manage")))return;
  const submit=b.submit===true;
  const reason=b.requestReason===undefined?null:str(b.requestReason,2000);
  const proposal=b.proposedData;
  if(!submit&&((reason!==null&&reason.length<10)||(proposal!==undefined&&(!proposal||typeof proposal!=="object"||Array.isArray(proposal)||!Object.keys(proposal).length))))
   return bad(res,400,"INVALID_MASTER_DATA_DRAFT","Draft proposal and reason are invalid.");
  try{
   const q=await req.db.query("UPDATE public.p2a_master_data_change_requests SET proposed_data=COALESCE($3::jsonb,proposed_data),request_reason=COALESCE($4,request_reason),status=CASE WHEN $5 THEN 'submitted' ELSE status END,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND status='draft' AND requested_by=$6::uuid RETURNING *",
    [id,p,proposal===undefined?null:JSON.stringify(proposal),reason,submit,req.user?.id]);
   if(!q.rows.length)return bad(res,404,"MASTER_DATA_DRAFT_NOT_FOUND","Editable draft not found; submitted requests are immutable.");
   return res.json({request:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,403,"MASTER_DATA_REQUEST_FORBIDDEN","Only the requester may edit or submit their own draft.");return bad(res,500,"MASTER_DATA_REQUEST_UPDATE_FAILED","Unable to update master-data request.");}
 });
 app.patch("/api/v1/admin/projects/:projectId/master-data-change-requests/:requestId/decision",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.requestId||""),status=str(req.body?.status,16),note=str(req.body?.decisionNote,2000);
  if(!uuidPattern.test(p)||!uuidPattern.test(id)||!["approved","rejected"].includes(status)||(status==="rejected"&&note.length<5))
   return bad(res,400,"INVALID_MASTER_DATA_DECISION","Valid decision and substantive rejection note are required.");
  try{
   const q=await req.db.query("UPDATE public.p2a_master_data_change_requests SET status=$3,decision_note=$4,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND status='submitted' RETURNING *",[id,p,status,note||null]);
   if(!q.rows.length)return bad(res,404,"SUBMITTED_MASTER_DATA_REQUEST_NOT_FOUND","Submitted request not found.");
   return res.json({request:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,403,"MASTER_DATA_DECISION_FORBIDDEN","Only an independent Platform Admin may decide a submitted request.");if(e?.code==="23514"||e?.code==="40001")return bad(res,409,"MASTER_DATA_DECISION_CONFLICT","Request could not be applied; refresh the canonical record and resubmit.");return bad(res,500,"MASTER_DATA_DECISION_FAILED","Unable to decide master-data request.");}
 });


 // P17-B Project-scoped logistics graph and change requests.

 app.get("/api/v1/projects/:projectId/pke-logistics/scenarios",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||"");
  if(!uuidPattern.test(p))return bad(res,400,"INVALID_PROJECT","Valid Project id required.");
  if(!(await requireProjectPermission(req,res,p,"pke.logistics.master.view")))return;
  try{const q=await req.db.query("SELECT * FROM public.p17b_logistics_simulation_scenarios WHERE project_id=$1::uuid ORDER BY updated_at DESC LIMIT 100",[p]);return res.json({scenarios:q.rows});}
  catch{return bad(res,500,"PKE_LOGISTICS_SCENARIO_LIST_FAILED","Unable to load Project logistics simulations.");}
 });
 app.post("/api/v1/projects/:projectId/pke-logistics/simulation-scenarios",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),b=req.body??{},code=str(b.scenarioCode,80),name=str(b.scenarioName,200),graph=b.graph,
   evidence=Array.isArray(b.sourceEvidence)?b.sourceEvidence:[],assumptions=b.assumptions&&typeof b.assumptions==="object"&&!Array.isArray(b.assumptions)?b.assumptions:{};
  if(!uuidPattern.test(p)||!code||!name||!graph||typeof graph!=="object"||Array.isArray(graph))
   return bad(res,400,"INVALID_PKE_LOGISTICS_SCENARIO","Project, scenario code, name and graph object are required.");
  if(!(await requireProjectPermission(req,res,p,"pke.logistics.master.change_request.manage")))return;
  try{const q=await req.db.query("INSERT INTO public.p17b_logistics_simulation_scenarios(project_id,scenario_code,scenario_name,graph,source_evidence,assumptions,simulation_only,scenario_status,created_by,updated_by) VALUES($1::uuid,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,true,'simulation',$7::uuid,$7::uuid) RETURNING *",
   [p,code,name,JSON.stringify(graph),JSON.stringify(evidence),JSON.stringify(assumptions),req.user?.id]);return res.status(201).json({scenario:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"PKE_LOGISTICS_SCENARIO_DUPLICATE","Scenario code already exists in this Project.");if(e?.code==="23514")return bad(res,422,"PKE_LOGISTICS_GRAPH_INVALID","Simulation graph must contain all six linked, unverified node types and valid edges.");return bad(res,500,"PKE_LOGISTICS_SCENARIO_CREATE_FAILED","Unable to create simulation scenario.");}
 });
 app.patch("/api/v1/projects/:projectId/pke-logistics/simulation-scenarios/:scenarioId",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.scenarioId||""),b=req.body??{},graph=b.graph,
   evidence=Array.isArray(b.sourceEvidence)?b.sourceEvidence:null,
   assumptions=b.assumptions&&typeof b.assumptions==="object"&&!Array.isArray(b.assumptions)?b.assumptions:null;
  if(!uuidPattern.test(p)||!uuidPattern.test(id)||(graph!==undefined&&(!graph||typeof graph!=="object"||Array.isArray(graph))))
   return bad(res,400,"INVALID_PKE_LOGISTICS_SCENARIO_UPDATE","Project, scenario id or graph is invalid.");
  if(!(await requireProjectPermission(req,res,p,"pke.logistics.master.change_request.manage")))return;
  try{const q=await req.db.query("UPDATE public.p17b_logistics_simulation_scenarios SET graph=COALESCE($3::jsonb,graph),source_evidence=COALESCE($4::jsonb,source_evidence),assumptions=COALESCE($5::jsonb,assumptions),scenario_status=COALESCE($6,scenario_status),updated_by=$7::uuid,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid RETURNING *",
   [id,p,graph===undefined?null:JSON.stringify(graph),evidence===null?null:JSON.stringify(evidence),assumptions===null?null:JSON.stringify(assumptions),["simulation","draft","archived"].includes(b.scenarioStatus)?b.scenarioStatus:null,req.user?.id]);
   if(!q.rows.length)return bad(res,404,"PKE_LOGISTICS_SCENARIO_NOT_FOUND","Simulation scenario not found in this Project.");
   return res.json({scenario:q.rows[0]});}
  catch(e:any){if(e?.code==="23514")return bad(res,422,"PKE_LOGISTICS_GRAPH_INVALID","Simulation graph must retain all six linked, unverified node types and valid edges.");return bad(res,500,"PKE_LOGISTICS_SCENARIO_UPDATE_FAILED","Unable to update simulation scenario.");}
 });
 app.get("/api/v1/projects/:projectId/pke-logistics/change-requests",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||"");
  if(!uuidPattern.test(p))return bad(res,400,"INVALID_PROJECT","Valid Project id required.");
  if(!(await requireProjectPermission(req,res,p,"pke.logistics.master.view")))return;
  try{const q=await req.db.query("SELECT * FROM public.p17b_logistics_change_requests WHERE project_id=$1::uuid ORDER BY created_at DESC LIMIT 200",[p]);return res.json({requests:q.rows});}
  catch{return bad(res,500,"PKE_LOGISTICS_REQUEST_LIST_FAILED","Unable to load logistics change requests.");}
 });
 app.post("/api/v1/projects/:projectId/pke-logistics/change-requests",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),b=req.body??{},entity=str(b.entityType,32),operation=str(b.operation,16),
   target=str(b.targetId,36),reason=str(b.requestReason,2000),sourceRef=str(b.sourceReference,1000),
   sourceUrl=str(b.sourceUrl,1000),proposal=b.proposedData;
  if(!uuidPattern.test(p)||!["port","route","terminal","loading_service","warehouse"].includes(entity)||
   !["create","update"].includes(operation)||(operation==="update"&&!uuidPattern.test(target))||
   (operation==="create"&&target)||reason.length<10||sourceRef.length<8||
   (sourceUrl&&!/^https?:\/\//i.test(sourceUrl))||!proposal||typeof proposal!=="object"||
   Array.isArray(proposal)||!Object.keys(proposal).length)
   return bad(res,400,"INVALID_PKE_LOGISTICS_REQUEST","Entity, operation, target, proposal, reason and source evidence are invalid.");
  if(!(await requireProjectPermission(req,res,p,"pke.logistics.master.change_request.manage")))return;
  try{
   const q=await req.db.query("INSERT INTO public.p17b_logistics_change_requests(project_id,entity_type,operation,target_id,proposed_data,request_reason,source_reference,source_url,source_snapshot,requested_by) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb,$6,$7,$8,$9::jsonb,$10::uuid) RETURNING *",
    [p,entity,operation,target||null,JSON.stringify(proposal),reason,sourceRef,sourceUrl||null,
     JSON.stringify(b.sourceSnapshot&&typeof b.sourceSnapshot==="object"&&!Array.isArray(b.sourceSnapshot)?b.sourceSnapshot:{}),req.user?.id]);
   return res.status(201).json({request:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,403,"PKE_LOGISTICS_REQUEST_FORBIDDEN","Project-scoped logistics change permission is required.");if(e?.code==="23503")return bad(res,422,"PKE_LOGISTICS_REFERENCE_INVALID","Project or target reference is invalid.");return bad(res,500,"PKE_LOGISTICS_REQUEST_CREATE_FAILED","Unable to create logistics change request.");}
 });
 app.patch("/api/v1/projects/:projectId/pke-logistics/change-requests/:requestId",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.requestId||""),b=req.body??{},submit=b.submit===true;
  if(!uuidPattern.test(p)||!uuidPattern.test(id))return bad(res,400,"INVALID_PKE_LOGISTICS_REQUEST","Valid Project and request ids are required.");
  if(!(await requireProjectPermission(req,res,p,"pke.logistics.master.change_request.manage")))return;
  const reason=b.requestReason===undefined?null:str(b.requestReason,2000),proposal=b.proposedData,
   sourceRef=b.sourceReference===undefined?null:str(b.sourceReference,1000),sourceUrl=b.sourceUrl===undefined?null:str(b.sourceUrl,1000),
   sourceSnapshot=b.sourceSnapshot===undefined?null:(b.sourceSnapshot&&typeof b.sourceSnapshot==="object"&&!Array.isArray(b.sourceSnapshot)?b.sourceSnapshot:null);
  if((!submit&&((reason!==null&&reason.length<10)||(proposal!==undefined&&(!proposal||typeof proposal!=="object"||Array.isArray(proposal)||!Object.keys(proposal).length))))||
    (sourceRef!==null&&sourceRef.length<8)||(sourceUrl!==null&&sourceUrl!==""&&!/^https?:\/\//i.test(sourceUrl))||
    (b.sourceSnapshot!==undefined&&sourceSnapshot===null))
   return bad(res,400,"INVALID_PKE_LOGISTICS_DRAFT","Draft reason, source provenance or proposed data is invalid.");
  try{
   const q=await req.db.query("UPDATE public.p17b_logistics_change_requests SET proposed_data=COALESCE($3::jsonb,proposed_data),request_reason=COALESCE($4,request_reason),source_reference=COALESCE($7,source_reference),source_url=COALESCE($8,source_url),source_snapshot=COALESCE($9::jsonb,source_snapshot),status=CASE WHEN $5 THEN 'submitted' ELSE status END,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND status='draft' AND requested_by=$6::uuid RETURNING *",
    [id,p,proposal===undefined?null:JSON.stringify(proposal),reason,submit,req.user?.id,sourceRef,sourceUrl===null?null:(sourceUrl||null),sourceSnapshot===null?null:JSON.stringify(sourceSnapshot)]);
   if(!q.rows.length)return bad(res,404,"PKE_LOGISTICS_DRAFT_NOT_FOUND","Editable draft not found; submitted proposals are immutable.");
   return res.json({request:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,403,"PKE_LOGISTICS_DRAFT_FORBIDDEN","Only the requester may edit or submit their own draft.");return bad(res,500,"PKE_LOGISTICS_DRAFT_UPDATE_FAILED","Unable to update logistics draft.");}
 });
 app.patch("/api/v1/admin/projects/:projectId/pke-logistics/change-requests/:requestId/decision",requireAuth,requireAdmin,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.requestId||""),status=str(req.body?.status,16),note=str(req.body?.decisionNote,2000);
  if(!uuidPattern.test(p)||!uuidPattern.test(id)||!["approved","rejected"].includes(status)||(status==="rejected"&&note.length<5))
   return bad(res,400,"INVALID_PKE_LOGISTICS_DECISION","Valid decision and substantive rejection note are required.");
  try{
   const q=await req.db.query("UPDATE public.p17b_logistics_change_requests SET status=$3,decision_note=$4,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND status='submitted' RETURNING *",[id,p,status,note||null]);
   if(!q.rows.length)return bad(res,404,"PKE_LOGISTICS_SUBMITTED_REQUEST_NOT_FOUND","Submitted logistics request not found.");
   return res.json({request:q.rows[0]});
  }catch(e:any){if(e?.code==="42501")return bad(res,403,"PKE_LOGISTICS_DECISION_FORBIDDEN","Only an independent Platform Admin may decide a submitted request.");if(e?.code==="23514"||e?.code==="40001")return bad(res,409,"PKE_LOGISTICS_DECISION_CONFLICT","Decision failed validation; refresh the linked master data.");return bad(res,500,"PKE_LOGISTICS_DECISION_FAILED","Unable to decide logistics change request.");}
 });

// P17-E: voyages, nomination maker-checker and port-call planning/confirmation.
 app.get("/api/v1/projects/:projectId/voyages",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||"");if(!uuidPattern.test(p))return bad(res,400,"INVALID_PROJECT","Valid Project id required.");if(!(await requireProjectPermission(req,res,p,"voyage.view")))return;
  try{const q=await req.db.query("SELECT v.*,ve.name vessel_name,op.name origin_port_name,dp.name destination_port_name FROM public.voyages v LEFT JOIN public.vessels ve ON ve.id=v.vessel_id LEFT JOIN public.ports op ON op.id=v.origin_port_id LEFT JOIN public.ports dp ON dp.id=v.destination_port_id WHERE v.project_id=$1::uuid ORDER BY v.created_at DESC LIMIT 200",[p]);return res.json({voyages:q.rows});}catch{return bad(res,500,"VOYAGE_LIST_FAILED","Unable to load voyages.");}
 });
 app.post("/api/v1/projects/:projectId/voyages",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),b=req.body??{},key=str(req.get("Idempotency-Key")||b.idempotencyKey,200),code=str(b.voyageCode,80),vessel=str(b.vesselId,36)||null,origin=str(b.originPortId,36)||null,dest=str(b.destinationPortId,36)||null,dep=time(b.plannedDepartureAt),arr=time(b.plannedArrivalAt);
  if(!uuidPattern.test(p)||key.length<8||!code||(vessel&&!uuidPattern.test(vessel))||(origin&&!uuidPattern.test(origin))||(dest&&!uuidPattern.test(dest))||(b.plannedDepartureAt&&!dep)||(b.plannedArrivalAt&&!arr)||(dep&&arr&&Date.parse(arr)<Date.parse(dep)))return bad(res,400,"INVALID_VOYAGE","Voyage fields or idempotency key are invalid.");if(!(await requireProjectPermission(req,res,p,"voyage.create")))return;
  try{const old=await req.db.query("SELECT * FROM public.voyages WHERE project_id=$1::uuid AND idempotency_key=$2",[p,key]);if(old.rows.length)return res.json({voyage:old.rows[0],replayed:true});if(vessel){const q=await req.db.query("SELECT id FROM public.vessels WHERE id=$1::uuid AND is_active",[vessel]);if(!q.rows.length)return bad(res,422,"VESSEL_NOT_FOUND","Active vessel not found.");}for(const port of [origin,dest].filter(Boolean)){const q=await req.db.query("SELECT id FROM public.ports WHERE id=$1::uuid AND is_active",[port]);if(!q.rows.length)return bad(res,422,"PORT_NOT_FOUND","Active port not found.");}const q=await req.db.query("INSERT INTO public.voyages(project_id,vessel_id,origin_port_id,destination_port_id,port_id,planned_departure_at,planned_arrival_at,start_date,end_date,voyage_code,status,created_by,updated_by,idempotency_key) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$4::uuid,$5::timestamptz,$6::timestamptz,$5::timestamptz,$6::timestamptz,$7,'planned',$8::uuid,$8::uuid,$9) RETURNING *",[p,vessel,origin,dest,dep,arr,code,req.user?.id,key]);await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1,'voyage',$2,'voyage_created','planned',$3,$4,$5::jsonb)",[p,q.rows[0].id,req.user?.id,key,JSON.stringify({voyageCode:code})]);return res.status(201).json({voyage:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"VOYAGE_DUPLICATE","Voyage code or idempotency key already exists.");if(e?.code==="42501")return bad(res,403,"VOYAGE_FORBIDDEN","Voyage creation denied.");return bad(res,500,"VOYAGE_CREATE_FAILED","Unable to create voyage.");}
 });
 app.patch("/api/v1/projects/:projectId/voyages/:voyageId",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.voyageId||""),b=req.body??{},dep=time(b.plannedDepartureAt),arr=time(b.plannedArrivalAt);if(!uuidPattern.test(p)||!uuidPattern.test(id)||!Number.isInteger(b.expectedVersion)||b.expectedVersion<1||(b.plannedDepartureAt&&!dep)||(b.plannedArrivalAt&&!arr)||(dep&&arr&&Date.parse(arr)<Date.parse(dep)))return bad(res,400,"INVALID_VOYAGE_UPDATE","Voyage update is invalid.");if(!(await requireProjectPermission(req,res,p,"voyage.update")))return;
  try{const q=await req.db.query("UPDATE public.voyages SET planned_departure_at=COALESCE($4::timestamptz,planned_departure_at),planned_arrival_at=COALESCE($5::timestamptz,planned_arrival_at),version=version+1,updated_by=$6::uuid,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND version=$3 RETURNING *",[id,p,b.expectedVersion,dep,arr,req.user?.id]);if(!q.rows.length)return bad(res,409,"VOYAGE_VERSION_CONFLICT","Voyage missing or changed; reload.");await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,from_status,to_status,actor_id,event_payload) VALUES($1,'voyage',$2,'voyage_schedule_updated',$3,$3,$4,$5::jsonb)",[p,id,q.rows[0].status,req.user?.id,JSON.stringify({version:q.rows[0].version})]);return res.json({voyage:q.rows[0]});}
  catch(e:any){if(e?.code==="42501")return bad(res,403,"VOYAGE_FORBIDDEN","Voyage update denied.");return bad(res,500,"VOYAGE_UPDATE_FAILED","Unable to update voyage.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-nominations",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||"");if(!uuidPattern.test(p))return bad(res,400,"INVALID_PROJECT","Valid Project id required.");
  const canView=await requireProjectPermission(req,res,p,"vessel.view");if(!canView){const canReview=await requireProjectPermission(req,res,p,"vessel.nomination.review");if(!canReview)return;}
  try{const q=await req.db.query("SELECT n.*,s.shipment_code,v.voyage_code,ve.name vessel_name FROM public.vessel_nominations n JOIN public.shipments s ON s.id=n.shipment_id AND s.project_id=n.project_id LEFT JOIN public.voyages v ON v.id=n.voyage_id AND v.project_id=n.project_id JOIN public.vessels ve ON ve.id=n.vessel_id WHERE n.project_id=$1::uuid ORDER BY n.created_at DESC LIMIT 200",[p]);return res.json({nominations:q.rows,projectId:p});}
  catch{return bad(res,500,"NOMINATION_LIST_FAILED","Unable to load nominations.");}
 });
 app.post("/api/v1/projects/:projectId/vessel-nominations",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),b=req.body??{},key=str(req.get("Idempotency-Key")||b.idempotencyKey,200),s=String(b.shipmentId||""),v=String(b.vesselId||""),y=str(b.voyageId,36)||null;if(!uuidPattern.test(p)||!uuidPattern.test(s)||!uuidPattern.test(v)||key.length<8||(y&&!uuidPattern.test(y)))return bad(res,400,"INVALID_NOMINATION","Nomination fields are invalid.");if(!(await requireProjectPermission(req,res,p,"vessel.nominate")))return;
  try{const old=await req.db.query("SELECT * FROM public.vessel_nominations WHERE project_id=$1::uuid AND idempotency_key=$2",[p,key]);if(old.rows.length)return res.json({nomination:old.rows[0],replayed:true});const sh=await req.db.query("SELECT id FROM public.shipments WHERE id=$1::uuid AND project_id=$2::uuid",[s,p]);if(!sh.rows.length)return bad(res,422,"SHIPMENT_OUTSIDE_PROJECT","Shipment must belong to this Project.");const ve=await req.db.query("SELECT id FROM public.vessels WHERE id=$1::uuid AND is_active",[v]);if(!ve.rows.length)return bad(res,422,"VESSEL_NOT_FOUND","Active vessel not found.");if(y){const vo=await req.db.query("SELECT vessel_id FROM public.voyages WHERE id=$1::uuid AND project_id=$2::uuid",[y,p]);if(!vo.rows.length||(vo.rows[0].vessel_id&&String(vo.rows[0].vessel_id)!==v))return bad(res,422,"VOYAGE_MISMATCH","Voyage must match Project and vessel.");}const q=await req.db.query("INSERT INTO public.vessel_nominations(project_id,shipment_id,voyage_id,vessel_id,nomination_status,nominated_by,idempotency_key,reason,submitted_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'submitted',$5::uuid,$6,$7,now()) RETURNING *",[p,s,y,v,req.user?.id,key,str(b.reason,2000)||null]);await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1,'vessel_nomination',$2,'nomination_submitted','submitted',$3,$4,$5::jsonb)",[p,q.rows[0].id,req.user?.id,key,JSON.stringify({shipmentId:s,vesselId:v,voyageId:y})]);return res.status(201).json({nomination:q.rows[0]});}
  catch(e:any){if(e?.code==="23505")return bad(res,409,"NOMINATION_DUPLICATE","Duplicate nomination.");if(e?.code==="42501")return bad(res,403,"NOMINATION_FORBIDDEN","Nomination denied.");return bad(res,500,"NOMINATION_CREATE_FAILED","Unable to create nomination.");}
 });
 app.patch("/api/v1/projects/:projectId/vessel-nominations/:id/decision",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),id=String(req.params.id||""),b=req.body??{},status=str(b.status,48),note=str(b.decisionNote,2000);if(!uuidPattern.test(p)||!uuidPattern.test(id)||!["identity_verified","port_screened","documents_checked","approved_for_internal_planning","rejected"].includes(status)||note.length<5||!Number.isInteger(b.expectedVersion))return bad(res,400,"INVALID_DECISION","Decision status, note and expectedVersion are required.");if(!(await requireProjectPermission(req,res,p,"vessel.nomination.review")))return;
  try{const old=await req.db.query("SELECT nominated_by,nomination_status,version FROM public.vessel_nominations WHERE id=$1::uuid AND project_id=$2::uuid",[id,p]);if(!old.rows.length)return bad(res,404,"NOMINATION_NOT_FOUND","Nomination not found.");if(String(old.rows[0].nominated_by)===String(req.user?.id))return bad(res,403,"MAKER_CHECKER_REQUIRED","Nominator cannot review own nomination.");if(old.rows[0].version!==b.expectedVersion)return bad(res,409,"NOMINATION_VERSION_CONFLICT","Reload nomination before decision.");const q=await req.db.query("UPDATE public.vessel_nominations SET nomination_status=$3,reviewed_by=$4::uuid,reviewed_at=now(),decision_note=$5,version=version+1,updated_at=now() WHERE id=$1::uuid AND project_id=$2::uuid AND version=$6 RETURNING *",[id,p,status,req.user?.id,note,b.expectedVersion]);if(!q.rows.length)return bad(res,409,"NOMINATION_VERSION_CONFLICT","Reload nomination before decision.");await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,from_status,to_status,actor_id,event_payload) VALUES($1,'vessel_nomination',$2,'nomination_decision',$3,$4,$5,$6::jsonb)",[p,id,old.rows[0].nomination_status,status,req.user?.id,JSON.stringify({decisionNote:note})]);return res.json({nomination:q.rows[0]});}
  catch(e:any){if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"NOMINATION_TRANSITION_DENIED","Transition or independent-review guard rejected decision.");return bad(res,500,"NOMINATION_REVIEW_FAILED","Unable to review nomination.");}
 });
 app.get("/api/v1/projects/:projectId/vessel-port-calls",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||"");if(!uuidPattern.test(p))return bad(res,400,"INVALID_PROJECT","Valid Project id required.");
  const canView=await requireProjectPermission(req,res,p,"vessel.view");if(!canView){const canShip=await requireProjectPermission(req,res,p,"shipping.view");if(!canShip)return;}
  try{const q=await req.db.query("SELECT c.*,v.voyage_code,ve.name vessel_name,pt.name port_name,t.name terminal_name FROM public.vessel_port_calls c JOIN public.voyages v ON v.id=c.voyage_id AND v.project_id=c.project_id JOIN public.vessels ve ON ve.id=c.vessel_id JOIN public.ports pt ON pt.id=c.port_id LEFT JOIN public.port_terminals t ON t.id=c.terminal_id WHERE c.project_id=$1::uuid ORDER BY COALESCE(c.actual_at,c.predicted_at) DESC LIMIT 300",[p]);return res.json({portCalls:q.rows,projectId:p});}
  catch{return bad(res,500,"PORT_CALL_LIST_FAILED","Unable to load port calls.");}
 });
 app.post("/api/v1/projects/:projectId/vessel-port-calls",requireAuth,async(req:R,res:Response)=>{
  const p=String(req.params.projectId||""),b=req.body??{},key=str(req.get("Idempotency-Key")||b.idempotencyKey,200),voy=String(b.voyageId||""),v=String(b.vesselId||""),port=String(b.portId||""),event=str(b.eventType,32),status=str(b.status||"planned",24),actual=time(b.actualAt),predicted=time(b.predictedAt),actualEvent=["arrived","berthed","departed"].includes(event);
  if(!uuidPattern.test(p)||!uuidPattern.test(voy)||!uuidPattern.test(v)||!uuidPattern.test(port)||key.length<8||!["planned_arrival","eta_update","arrived","berthed","departed","cancelled"].includes(event)||(b.actualAt&&!actual)||(b.predictedAt&&!predicted))return bad(res,400,"INVALID_PORT_CALL","Port call fields are invalid.");if(actualEvent){if(!(await requireProjectPermission(req,res,p,"vessel.port_call.confirm")))return;if(status!=="actual"||!actual)return bad(res,422,"ACTUAL_TIME_REQUIRED","Actual milestones require explicit actualAt and actual status.");}else if(!(await requireProjectPermission(req,res,p,"vessel.port_call.manage")))return;
  try{const old=await req.db.query("SELECT * FROM public.vessel_port_calls WHERE project_id=$1::uuid AND idempotency_key=$2",[p,key]);if(old.rows.length)return res.json({portCall:old.rows[0],replayed:true});const qv=await req.db.query("SELECT vessel_id,port_id,origin_port_id,destination_port_id FROM public.voyages WHERE id=$1::uuid AND project_id=$2::uuid",[voy,p]);if(!qv.rows.length||String(qv.rows[0].vessel_id)!==v||![qv.rows[0].port_id,qv.rows[0].origin_port_id,qv.rows[0].destination_port_id].filter(Boolean).map(String).includes(port))return bad(res,422,"PORT_CALL_VOYAGE_MISMATCH","Vessel and port must match same-Project voyage route.");const terminalId=str(b.terminalId,36)||null;if(terminalId){if(!uuidPattern.test(terminalId))return bad(res,400,"INVALID_TERMINAL","Valid terminal id is required.");const terminal=await req.db.query("SELECT id FROM public.port_terminals WHERE id=$1::uuid AND port_id=$2::uuid",[terminalId,port]);if(!terminal.rows.length)return bad(res,422,"TERMINAL_PORT_MISMATCH","Terminal must belong to the selected port.");}if(["planned_arrival","eta_update"].includes(event)&&!predicted)return bad(res,422,"PREDICTED_TIME_REQUIRED","Planned/ETA port calls require predictedAt.");const q=await req.db.query("INSERT INTO public.vessel_port_calls(project_id,voyage_id,vessel_id,port_id,terminal_id,event_type,predicted_at,actual_at,status,idempotency_key,created_by,updated_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11::uuid,$11::uuid) RETURNING *",[p,voy, v,port,terminalId,event,predicted,actual,event==="cancelled"?"cancelled":actualEvent?"actual":status,key,req.user?.id]);await req.db.query("INSERT INTO public.maritime_workflow_events(project_id,entity_type,entity_id,event_code,to_status,actor_id,idempotency_key,event_payload) VALUES($1,'vessel_port_call',$2,$3,$4,$5,$6,$7::jsonb)",[p,q.rows[0].id,event,status,req.user?.id,key,JSON.stringify({voyageId:voy,portId:port,actualAt:actual,predictedAt:predicted})]);return res.status(201).json({portCall:q.rows[0],operationalClearance:false});}
  catch(e:any){if(e?.code==="23514"||e?.code==="42501")return bad(res,409,"PORT_CALL_GUARD_REJECTED","Route or independent confirmation guard rejected event.");if(e?.code==="23503")return bad(res,422,"PORT_CALL_REFERENCE_INVALID","Port-call references are invalid.");return bad(res,500,"PORT_CALL_CREATE_FAILED","Unable to create port call.");}
 });
}
