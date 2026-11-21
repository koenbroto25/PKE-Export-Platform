import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Workflow } from "lucide-react";
import { get, patch, post } from "./api";
import { hasProjectPermission } from "./role-permissions";

type AnyRecord = Record<string, any>;
type Notice = (kind:"success"|"error"|"info",text:string)=>void;
type WorkflowType = {code:string;label:string;read:string[];create:string;example:AnyRecord};

const WORKFLOW_TYPES:WorkflowType[]=[
 {code:"purchase_requisition",label:"Purchase Requisition",read:["procurement.po.view"],create:"procurement.po.create",example:{currencyCode:"IDR",supplierId:"",items:[{description:"Palm kernel cake",quantity:1,unitCode:"MT",unitPrice:0}]}},
 {code:"purchase_order",label:"Purchase Order",read:["procurement.po.view"],create:"procurement.po.create",example:{supplierId:"",currencyCode:"IDR",items:[{description:"Palm kernel cake",quantity:1,unitCode:"MT",unitPrice:0}]}},
 {code:"supplier_commitment",label:"Supplier Delivery Commitment",read:["procurement.commitment.view","procurement.po.manage"],create:"procurement.po.manage",example:{purchaseOrderRecordId:"",committedQuantity:1,unitCode:"MT",committedAt:"2026-11-25T08:00:00Z"}},
 {code:"goods_receipt_match",label:"PO–GRN–Invoice Match",read:["procurement.match.view"],create:"procurement.match.create",example:{purchaseOrderRecordId:"",warehouseReceiptId:"",apInvoiceId:"",matchedQuantity:1,matchedAmount:0,unitCode:"MT",currencyCode:"IDR"}},
 {code:"production_batch",label:"Production Batch",read:["operations.view"],create:"operations.create",example:{quantity:1,unitCode:"MT",startedAt:"2026-11-21T08:00:00Z"}},
 {code:"packing_batch",label:"Packing Batch",read:["operations.view"],create:"operations.create",example:{quantity:1,unitCode:"MT",startedAt:"2026-11-21T08:00:00Z"}},
 {code:"quality_sample",label:"QC Sample",read:["quality.sample.view"],create:"quality.sample.create",example:{sampleNumber:"",sampleType:"pre_shipment"}},
 {code:"quality_result",label:"Laboratory / QC Result",read:["quality.result.view"],create:"quality.result.create",example:{sampleId:"",attributeId:"",methodCode:"",resultNumeric:0}},
 {code:"qa_release",label:"Independent QA Release",read:["quality.release.view"],create:"quality.release.decide",example:{sourceRecordId:"",decision:"release",decisionReason:""}},
 {code:"hse_inspection",label:"HSE Inspection",read:["hse.inspection.view"],create:"hse.inspection.create",example:{category:"",severity:"moderate",observedAt:"2026-11-21T08:00:00Z"}},
 {code:"hse_action",label:"HSE Corrective Action",read:["hse.action.view","hse.action.respond"],create:"hse.action.manage",example:{findingRecordId:"",actionOwnerRoleCode:"hse_officer",dueAt:"2026-11-28T08:00:00Z"}},
 {code:"dispatch_assignment",label:"Dispatch & SLA",read:["dispatch.view"],create:"dispatch.create",example:{tripId:"",driverUserId:"",vehicleId:"",plannedDepartureAt:"2026-11-21T08:00:00Z",plannedArrivalAt:"2026-11-21T18:00:00Z"}},
 {code:"vessel_call",label:"Vessel / Port Call",read:["shipping.view"],create:"shipping.create",example:{voyageId:"",vesselId:"",portId:"",predictedArrivalAt:"2026-11-25T08:00:00Z"}},
 {code:"loading_plan",label:"Loading Plan",read:["shipping.view"],create:"shipping.update",example:{loadingOperationId:"",shipmentId:"",plannedQuantity:1,unitCode:"MT"}},
 {code:"loading_survey",label:"Independent Loading Survey",read:["shipping.survey.view"],create:"shipping.survey.submit",example:{loadingOperationId:"",certificateObjectKey:"",sha256Checksum:"",certificateFileSizeBytes:1,surveyedQuantity:1}},
 {code:"ship_master_ack",label:"Ship Master Acknowledgement",read:["shipping.ack.view"],create:"shipping.acknowledge",example:{voyageId:"",acknowledgementType:"cargo_receipt",acknowledgedAt:"2026-11-25T08:00:00Z"}},
 {code:"laytime_event",label:"Laytime Event",read:["shipping.laytime.view"],create:"shipping.laytime.manage",example:{voyageId:"",eventCode:"NOR_TENDERED",eventAt:"2026-11-25T08:00:00Z",startAt:"2026-11-25T08:00:00Z",endAt:"2026-11-25T09:00:00Z",allowedHours:24,excludedHours:0}},
 {code:"lc_record",label:"Letter of Credit",read:["lc.view"],create:"lc.create",example:{lcNumber:"",issuingBank:"",currencyCode:"USD",amount:1,expiryAt:"2026-12-31T00:00:00Z",latestShipmentAt:"2026-12-15T00:00:00Z"}},
 {code:"lc_clause",label:"LC Clause",read:["lc.view"],create:"lc.create",example:{lcRecordId:"",clauseCode:"46A-1",requirementText:"",documentTypeCode:"",requiredOriginals:1,requiredCopies:2}},
 {code:"lc_discrepancy",label:"LC Discrepancy",read:["lc.view"],create:"lc.discrepancy.manage",example:{lcRecordId:"",clauseRecordId:"",description:"",resolutionDueAt:"2026-11-28T08:00:00Z"}},
 {code:"lc_presentation",label:"LC Presentation",read:["lc.view"],create:"lc.present",example:{lcRecordId:"",presentationReference:"",documentSelections:[{documentRecordId:"",clauseCode:"46A-1",copyType:"original"}]}},
 {code:"audit_finding",label:"Audit Finding",read:["audit.finding.view","audit.finding.respond"],create:"audit.finding.create",example:{findingCode:"AF-001",severity:"moderate",criteria:"",condition:"",cause:"",effect:"",recommendation:"",ownerRoleCode:"procurement",dueAt:"2026-11-28T08:00:00Z"}},
 {code:"audit_response",label:"Audit Owner Response",read:["audit.finding.respond"],create:"audit.finding.respond",example:{findingRecordId:"",response:"",correctiveAction:"",dueAt:"2026-11-28T08:00:00Z"}},
 {code:"audit_closure",label:"Independent Audit Closure",read:["audit.finding.view"],create:"audit.finding.close",example:{findingRecordId:"",verificationResult:"effective",closureReason:""}},
];

const UPDATE_PERMISSION:Record<string,string>={
 purchase_requisition:"procurement.po.update",purchase_order:"procurement.po.update",supplier_commitment:"procurement.commitment.manage",goods_receipt_match:"procurement.match.create",
 production_batch:"operations.update",packing_batch:"operations.update",quality_sample:"quality.sample.create",quality_result:"quality.result.create",qa_release:"quality.release.decide",
 hse_inspection:"hse.inspection.update",hse_action:"hse.action.respond",dispatch_assignment:"dispatch.update",vessel_call:"shipping.update",loading_plan:"shipping.update",
 loading_survey:"shipping.survey.submit",ship_master_ack:"shipping.acknowledge",laytime_event:"shipping.laytime.manage",lc_record:"lc.update",lc_clause:"lc.update",
 lc_discrepancy:"lc.discrepancy.manage",lc_presentation:"lc.present",audit_finding:"audit.finding.respond",audit_response:"audit.finding.respond",audit_closure:"audit.finding.close",
};
const NEXT_STATUSES=["submitted","approved","issued","acknowledged","in_progress","blocked","partially_received","received","matched","held","released","rejected","completed","cancelled","responded","verified","closed","presented","accepted","discrepancy","expired"];

export default function P1WorkflowWorkbench({projectId,activeUser,onNotice}:{projectId:string;activeUser?:AnyRecord;onNotice:Notice}){
 const available=useMemo(()=>WORKFLOW_TYPES.filter(t=>t.read.some(p=>hasProjectPermission(p,activeUser))),[activeUser?.projectPermissions,activeUser?.selectedProjectId]);
 const [type,setType]=useState("");
 const selected=available.find(t=>t.code===type)||available[0];
 const [records,setRecords]=useState<AnyRecord[]>([]);
 const [kpis,setKpis]=useState<AnyRecord[]>([]);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(""),[payloadText,setPayloadText]=useState("{}"),[parentId,setParentId]=useState("");
 const [ownerRole,setOwnerRole]=useState(""),[assignee,setAssignee]=useState(""),[externalUser,setExternalUser]=useState(""),[dueAt,setDueAt]=useState("");
 const [idempotencyKey,setIdempotencyKey]=useState(()=>crypto.randomUUID());
 const [nextStatus,setNextStatus]=useState<Record<string,string>>({}),[reason,setReason]=useState<Record<string,string>>({});
 const [expanded,setExpanded]=useState(""),[events,setEvents]=useState<Record<string,AnyRecord[]>>({}),[evidence,setEvidence]=useState<Record<string,AnyRecord[]>>({});
 const [evidenceRecord,setEvidenceRecord]=useState(""),[objectKey,setObjectKey]=useState(""),[sha,setSha]=useState(""),[fileSize,setFileSize]=useState("");

 const loadRecords=useCallback(async()=>{
  if(!projectId||!selected){setRecords([]);return;}
  setLoading(true);
  try{const data=await get<{records?:AnyRecord[]}>(`/projects/${encodeURIComponent(projectId)}/p1-workflows?recordType=${encodeURIComponent(selected.code)}`);setRecords(data.records||[]);}
  catch(e){setRecords([]);onNotice("error",e instanceof Error?e.message:"Gagal memuat workflow.");}
  finally{setLoading(false);}
 },[projectId,selected?.code,onNotice]);
 const loadKpis=useCallback(async()=>{
  if(!projectId||(!hasProjectPermission("p1.kpi.view",activeUser)&&!hasProjectPermission("reports.view",activeUser))){setKpis([]);return;}
  try{const data=await get<{kpis?:AnyRecord[]}>(`/projects/${encodeURIComponent(projectId)}/p1-kpis`);setKpis(data.kpis||[]);}catch{setKpis([]);}
 },[projectId,activeUser?.projectPermissions]);
 useEffect(()=>{if(!available.some(x=>x.code===type))setType(available[0]?.code||"");},[available,type]);
 useEffect(()=>{void loadRecords();},[loadRecords]);
 useEffect(()=>{void loadKpis();},[loadKpis]);
 useEffect(()=>{if(selected)setPayloadText(JSON.stringify(selected.example,null,2));},[selected?.code]);

 const createRecord=async(e:FormEvent)=>{
  e.preventDefault();if(!selected||busy)return;
  let payload:AnyRecord;
  try{payload=JSON.parse(payloadText);if(!payload||Array.isArray(payload)||typeof payload!=="object")throw new Error("Payload harus object JSON.");}
  catch(err){onNotice("error",err instanceof Error?err.message:"JSON tidak valid.");return;}
  setBusy(true);
  try{
   await post(`/projects/${encodeURIComponent(projectId)}/p1-workflows`,{recordType:selected.code,title,payload,parentRecordId:parentId.trim()||undefined,ownerRoleCode:ownerRole.trim()||undefined,assigneeUserId:assignee.trim()||undefined,externalScopeUserId:externalUser.trim()||undefined,dueAt:dueAt?new Date(dueAt).toISOString():undefined,idempotencyKey});
   onNotice("success","Workflow P1 berhasil dicatat.");setTitle("");setParentId("");setOwnerRole("");setAssignee("");setExternalUser("");setDueAt("");setIdempotencyKey(crypto.randomUUID());await loadRecords();await loadKpis();
  }catch(err){onNotice("error",err instanceof Error?err.message:"Gagal membuat workflow.");}
  finally{setBusy(false);}
 };
 const updateStatus=async(record:AnyRecord)=>{
  if(!nextStatus[record.id])return;setBusy(true);
  try{await patch(`/projects/${encodeURIComponent(projectId)}/p1-workflows/${encodeURIComponent(record.id)}/transition`,{status:nextStatus[record.id],reason:reason[record.id]||"",expectedVersion:record.version});onNotice("success","Status workflow diperbarui.");await loadRecords();await loadKpis();}
  catch(err){onNotice("error",err instanceof Error?err.message:"Transisi ditolak.");}finally{setBusy(false);}
 };
 const showEvents=async(id:string)=>{
  if(expanded===id){setExpanded("");return;}setExpanded(id);
  if(events[id]&&evidence[id])return;
  try{
   const [eventData,evidenceData]=await Promise.all([
    get<{events?:AnyRecord[]}>(`/projects/${encodeURIComponent(projectId)}/p1-workflows/${encodeURIComponent(id)}/events`),
    get<{evidence?:AnyRecord[]}>(`/projects/${encodeURIComponent(projectId)}/p1-workflows/${encodeURIComponent(id)}/evidence`)
   ]);
   setEvents(v=>({...v,[id]:eventData.events||[]}));
   setEvidence(v=>({...v,[id]:evidenceData.evidence||[]}));
  }catch(err){onNotice("error",err instanceof Error?err.message:"Gagal memuat event/evidence history.");}
 };
 const addEvidence=async()=>{
  if(!evidenceRecord||!objectKey.trim()||!sha.trim())return;setBusy(true);
  try{await post(`/projects/${encodeURIComponent(projectId)}/p1-workflows/${encodeURIComponent(evidenceRecord)}/evidence`,{objectKey:objectKey.trim(),sha256Checksum:sha.trim(),fileSizeBytes:Number(fileSize),storageBucket:"pke-private-documents",evidenceType:"supporting"});onNotice("success","Referensi evidence dicatat.");setEvidenceRecord("");setObjectKey("");setSha("");setFileSize("");}
  catch(err){onNotice("error",err instanceof Error?err.message:"Gagal mencatat evidence.");}finally{setBusy(false);}
 };
 if(!projectId)return <section className="page"><div className="panel"><h2>Pilih Project</h2><p>Workflow P1 membutuhkan Project aktif.</p></div></section>;
 const canViewKpis=Boolean(hasProjectPermission("p1.kpi.view",activeUser)||hasProjectPermission("reports.view",activeUser));
 if(!available.length&&!canViewKpis)return <section className="page"><div className="panel"><h2>Workflow P1</h2><p>Role aktif belum memiliki izin untuk domain workflow P1.</p></div></section>;
 const canCreate=Boolean(selected&&hasProjectPermission(selected.create,activeUser));
 const canAttach=Boolean(selected&&hasProjectPermission(UPDATE_PERMISSION[selected.code],activeUser));
 return <section className="page">
  <div className="page-header"><div><div className="eyebrow">PROJECT EXECUTION / P1</div><h1>Workflow Operasional P1</h1><p className="muted">Procurement, produksi, QC/QA, HSE, dispatch, shipping, LC dan audit findings dalam scope Project aktif.</p></div><button className="secondary-button" onClick={()=>{void loadRecords();void loadKpis();}}><RefreshCw size={16}/> Refresh</button></div>
  {kpis.length>0&&<div className="metric-grid">{kpis.map(k=><div className="metric-card" key={k.metricKey}><span>{k.label}</span><strong>{k.value===null?"—":Number(k.value).toLocaleString("id-ID",{maximumFractionDigits:2})} {k.value===null?"":k.unit}</strong><small>{k.status==="available"?"Source tersedia":"Belum ada source data"} · {k.freshnessStatus}</small></div>)}</div>}
  {available.length>0&&<>
  <div className="panel"><div className="panel-heading"><div><h2>Domain workflow</h2><p className="muted">Pilihan dibatasi pada permission role aktif.</p></div><Workflow size={20}/></div>
   <label className="field"><span>Jenis workflow</span><select value={selected?.code||""} onChange={e=>setType(e.target.value)}>{available.map(t=><option key={t.code} value={t.code}>{t.label}</option>)}</select></label>
   {canCreate?<form className="p1-workflow-form" onSubmit={createRecord}>
    <label className="field"><span>Judul / ringkasan</span><input value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={240} required placeholder="Ringkasan transaksi atau aktivitas"/></label>
    <div className="form-grid">
     <label className="field"><span>Parent record ID (jika diperlukan)</span><input value={parentId} onChange={e=>setParentId(e.target.value)} placeholder="UUID record induk"/></label>
     <label className="field"><span>Owner role code (opsional)</span><input value={ownerRole} onChange={e=>setOwnerRole(e.target.value)} placeholder="Default mengikuti workflow"/></label>
     <label className="field"><span>Assignee user ID</span><input value={assignee} onChange={e=>setAssignee(e.target.value)} placeholder="UUID pengguna aktif"/></label>
     <label className="field"><span>External scope user ID</span><input value={externalUser} onChange={e=>setExternalUser(e.target.value)} placeholder="UUID supplier / driver / surveyor"/></label>
     <label className="field"><span>Due date</span><input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
    </div>
    <label className="field"><span>Payload (JSON sesuai jenis workflow)</span><textarea value={payloadText} onChange={e=>setPayloadText(e.target.value)} rows={9} spellCheck={false}/></label>
    <div className="p1-form-actions"><small className="muted">Idempotency key: {idempotencyKey.slice(0,18)}…</small><button className="primary-button" type="submit" disabled={busy}>{busy?"Menyimpan…":"Catat workflow"}</button></div>
   </form>:<p className="muted">Role ini dapat melihat workflow, tetapi tidak memiliki izin untuk membuat record baru.</p>}
  </div>
  <div className="panel"><div className="panel-heading"><div><h2>{selected?.label||"Workflow"}</h2><p className="muted">{records.length} record pada Project aktif</p></div><button className="secondary-button" onClick={()=>void loadRecords()}><RefreshCw size={15}/> Muat ulang</button></div>
   {loading?<p className="muted">Memuat data…</p>:records.length===0?<p className="muted">Belum ada record untuk jenis workflow ini. KPI tanpa source data ditampilkan sebagai unavailable, bukan nol.</p>:
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Record</th><th>Status</th><th>Owner / Assignee</th><th>Due</th><th>Action</th></tr></thead><tbody>
     {records.map(record=><Fragment key={record.id}><tr><td><strong>{record.record_code}</strong><small>{record.title}</small><small>{record.record_type} · v{record.version}</small></td><td><span className="status-pill">{record.status}</span></td><td>{record.owner_role_code}<small>{record.assignee_user_id||"Belum ditugaskan"}</small></td><td>{record.due_at?new Date(record.due_at).toLocaleString("id-ID"):"—"}</td><td><div className="p1-row-actions"><select aria-label="Status berikutnya" value={nextStatus[record.id]||""} onChange={e=>setNextStatus(v=>({...v,[record.id]:e.target.value}))}><option value="">Transisi…</option>{NEXT_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select><input aria-label="Alasan transisi" value={reason[record.id]||""} onChange={e=>setReason(v=>({...v,[record.id]:e.target.value}))} placeholder="Alasan bila perlu"/><button className="secondary-button" disabled={busy||!nextStatus[record.id]} onClick={()=>void updateStatus(record)}>Update</button><button className="text-button" onClick={()=>void showEvents(record.id)}>Events</button></div></td></tr>
      {expanded===record.id&&<tr><td colSpan={5}>
       <div className="p1-event-list"><strong>Riwayat workflow</strong>{(events[record.id]||[]).map(ev=><div key={ev.id}><strong>{ev.event_type}</strong><span>{ev.actor_role_code} · {new Date(ev.occurred_at).toLocaleString("id-ID")}</span><small>{ev.reason||""}</small></div>)}</div>
       <div className="p1-evidence-list"><strong>Evidence terverifikasi</strong>{(evidence[record.id]||[]).length?(evidence[record.id]||[]).map(ev=><div key={ev.id}><span>{ev.original_filename||ev.evidence_type} · {ev.status}</span><small>{ev.sha256_checksum} · {Number(ev.file_size_bytes||0).toLocaleString("id-ID")} bytes</small></div>):<small className="muted">Belum ada evidence.</small>}</div>
      </td></tr>}
     </Fragment>)}
    </tbody></table></div>}
   {canAttach&&<div className="p1-evidence-row"><select value={evidenceRecord} onChange={e=>setEvidenceRecord(e.target.value)}><option value="">Record untuk evidence</option>{records.map(r=><option key={r.id} value={r.id}>{r.record_code}</option>)}</select><input value={objectKey} onChange={e=>setObjectKey(e.target.value)} placeholder="Private object key (file sudah diunggah)"/><input value={sha} onChange={e=>setSha(e.target.value)} placeholder="SHA-256"/><input type="number" min="1" max="52428800" value={fileSize} onChange={e=>setFileSize(e.target.value)} placeholder="File size (bytes)"/><button className="secondary-button" disabled={busy||!evidenceRecord||!fileSize} onClick={()=>void addEvidence()}>Verifikasi & catat evidence</button></div>}
  </div>
  </>}
 </section>;
}
