import { useEffect, useMemo, useState, type FormEvent } from "react";
import { get, post, patch } from "./api";

type Row = Record<string, any>;
type Props = { projectId: string; activeUser?: { id?: string; platformAdmin?: boolean; projectPermissions?: string[] } };
const nodeLabels: Record<string,string> = {
 pks_site:"PKS / KCP",road_route:"Rute darat",port:"Pelabuhan",terminal:"Terminal",
 loading_service:"Layanan loading",warehouse:"Gudang"
};
const edgeLabels: Record<string,string> = {
 pks_to_road_route:"PKS menuju rute darat",road_route_to_port:"Rute darat menuju port",
 port_has_terminal:"Port memiliki terminal",terminal_has_loading_service:"Terminal memiliki layanan loading",
 terminal_has_warehouse:"Terminal memiliki gudang"
};
const requestTemplates: Record<string,string> = {
 port: JSON.stringify({name:"",code:"",city:"",province:"Kalimantan Tengah",country_code:"ID",operator_name:"",address:""},null,2),
 route: JSON.stringify({pks_site_id:"",port_id:"",route_mode:"road",distance_km:null,estimated_travel_minutes:null,distance_method:null,route_notes:""},null,2),
 terminal: JSON.stringify({port_id:"",terminal_code:"",name:"",cargo_types:["general_cargo"],operating_restrictions:{}},null,2),
 loading_service: JSON.stringify({port_id:"",terminal_id:"",service_type:"",cargo_type:"PKE",handling_mode:"loose_bulk",rate_value:null,rate_unit:null},null,2),
 warehouse: JSON.stringify({name:"",code:"",port_id:"",terminal_id:"",storage_mode:"mixed",storage_capacity_mt:null,floor_area_m2:null},null,2)
};

export default function PkeLogisticsScenarioWorkbench({projectId,activeUser}:Props){
 const permissions=activeUser?.projectPermissions||[];
 const canView=activeUser?.platformAdmin===true||permissions.includes("pke.logistics.master.view");
 const canManage=activeUser?.platformAdmin===true||permissions.includes("pke.logistics.master.change_request.manage");
 const canReview=activeUser?.platformAdmin===true;
 const [scenarios,setScenarios]=useState<Row[]>([]);
 const [requests,setRequests]=useState<Row[]>([]);
 const [selectedId,setSelectedId]=useState("");
 const [graphDraft,setGraphDraft]=useState("");
 const [evidenceDraft,setEvidenceDraft]=useState("");
 const [assumptionsDraft,setAssumptionsDraft]=useState("");
 const [scenarioStatus,setScenarioStatus]=useState("simulation");
 const [editingRequestId,setEditingRequestId]=useState("");
 const [requestFormOpen,setRequestFormOpen]=useState(false);
 const [entityType,setEntityType]=useState("route");
 const [operation,setOperation]=useState("create");
 const [targetId,setTargetId]=useState("");
 const [proposalDraft,setProposalDraft]=useState(requestTemplates.route);
 const [reason,setReason]=useState("");
 const [sourceReference,setSourceReference]=useState("");
 const [sourceUrl,setSourceUrl]=useState("");
 const [decisionNotes,setDecisionNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const selected=useMemo(()=>scenarios.find(s=>s.id===selectedId)||scenarios[0]||null,[scenarios,selectedId]);
 const refresh=async()=>{
  if(!projectId||!canView)return;
  setError("");
  try{
   const [s,r]=await Promise.all([
    get<{scenarios?:Row[]}>(`/projects/${encodeURIComponent(projectId)}/pke-logistics/scenarios`),
    get<{requests?:Row[]}>(`/projects/${encodeURIComponent(projectId)}/pke-logistics/change-requests`)
   ]);
   const rows=Array.isArray(s.scenarios)?s.scenarios:[];
   setScenarios(rows);setRequests(Array.isArray(r.requests)?r.requests:[]);
   if(!selectedId&&rows[0]?.id)setSelectedId(String(rows[0].id));
  }catch(e:any){setError(e?.message||"Data jaringan logistik PKE tidak dapat dimuat.");}
 };
 useEffect(()=>{void refresh();},[projectId,canView]);
 useEffect(()=>{
  if(!selected)return;
  setGraphDraft(JSON.stringify(selected.graph||{},null,2));
  setEvidenceDraft(JSON.stringify(selected.source_evidence||[],null,2));
  setAssumptionsDraft(JSON.stringify(selected.assumptions||{},null,2));
  setScenarioStatus(String(selected.scenario_status||"simulation"));
 },[selected?.id]);
 useEffect(()=>{if(!editingRequestId){setProposalDraft(requestTemplates[entityType]||"{}");setTargetId("");}},[entityType,operation,editingRequestId]);

 if(!canView)return null;
 const graph=selected?.graph||{};
 const nodes=Array.isArray(graph.nodes)?graph.nodes:[];
 const edges=Array.isArray(graph.edges)?graph.edges:[];
 const parseJson=(value:string,label:string)=>{try{return JSON.parse(value);}catch{throw new Error(label+" harus berupa JSON yang valid.");}};

 async function saveScenario(e:FormEvent){
  e.preventDefault();if(!selected||!canManage)return;setBusy(true);setNotice("");setError("");
  try{
   const graphValue=parseJson(graphDraft,"Graph");
   const evidenceValue=parseJson(evidenceDraft,"Source evidence");
   const assumptionsValue=parseJson(assumptionsDraft,"Assumptions");
   await patch(`/projects/${encodeURIComponent(projectId)}/pke-logistics/simulation-scenarios/${encodeURIComponent(selected.id)}`,{
    graph:graphValue,sourceEvidence:evidenceValue,assumptions:assumptionsValue,scenarioStatus
   });
   setNotice("Simulasi tersimpan. Data tetap non-kanonis dan belum terverifikasi.");
   await refresh();
  }catch(e:any){setError(e?.message||"Perubahan simulasi gagal disimpan.");}
  finally{setBusy(false);}
 }
 async function createRequest(e:FormEvent){
  e.preventDefault();if(!canManage)return;setBusy(true);setNotice("");setError("");
  try{
   const proposedData=parseJson(proposalDraft,"Proposal");
   const body={entityType,operation,targetId:operation==="update"?targetId:null,proposedData,requestReason:reason,
    sourceReference,sourceUrl:sourceUrl||null,sourceSnapshot:{simulationContext:"P17-B Kumai logistics scenario"}};
   if(editingRequestId){
    await patch(`/projects/${encodeURIComponent(projectId)}/pke-logistics/change-requests/${encodeURIComponent(editingRequestId)}`,body);
    setNotice("Draft perubahan master diperbarui.");
   }else{
    await post(`/projects/${encodeURIComponent(projectId)}/pke-logistics/change-requests`,body);
    setNotice("Draft perubahan tersimpan. Kirim setelah target, data, dan bukti sumber diperiksa.");
   }
   setEditingRequestId("");setRequestFormOpen(false);setReason("");setSourceReference("");setSourceUrl("");setTargetId("");
   await refresh();
  }catch(e:any){setError(e?.message||"Draft perubahan master tidak dapat dibuat.");}
  finally{setBusy(false);}
 }
 async function editRequest(row:Row){
  if(row.status!=="draft"||row.requested_by!==activeUser?.id||!canManage)return;
  setEditingRequestId(String(row.id));setRequestFormOpen(true);
  setEntityType(String(row.entity_type));setOperation(String(row.operation));
  setTargetId(String(row.target_id||""));setProposalDraft(JSON.stringify(row.proposed_data||{},null,2));
  setReason(String(row.request_reason||""));setSourceReference(String(row.source_reference||""));
  setSourceUrl(String(row.source_url||""));
 }
 async function submitRequest(id:string){
  setBusy(true);setNotice("");setError("");
  try{await patch(`/projects/${encodeURIComponent(projectId)}/pke-logistics/change-requests/${encodeURIComponent(id)}`,{submit:true});setNotice("Permintaan dikirim untuk keputusan Platform Admin.");await refresh();}
  catch(e:any){setError(e?.message||"Permintaan gagal dikirim.");}
  finally{setBusy(false);}
 }
 async function decideRequest(id:string,status:"approved"|"rejected"){
  setBusy(true);setNotice("");setError("");
  try{
   const note=decisionNotes[id]|| (status==="approved"?"Disetujui setelah pemeriksaan sumber dan cakupan Project.":"");
   await patch(`/admin/projects/${encodeURIComponent(projectId)}/pke-logistics/change-requests/${encodeURIComponent(id)}/decision`,{status,decisionNote:note});
   setNotice(status==="approved"?"Proposal disetujui dan diterapkan ke master data.":"Proposal ditolak.");
   await refresh();
  }catch(e:any){setError(e?.message||"Keputusan Admin gagal disimpan.");}
  finally{setBusy(false);}
 }

 return <section className="p17b-workbench">
  <div className="p17b-workbench__header">
   <div><div className="p17b-eyebrow">P17-B · PROJECT LOGISTICS</div><h2>Rantai Operasional PKE</h2>
    <p>Hubungan PKS → rute darat → pelabuhan → terminal → loading → gudang. Simulasi tidak dianggap sebagai data operasional terverifikasi.</p></div>
   <span className="p17b-simulation-badge">SIMULATION ONLY</span>
  </div>
  {error&&<div className="p17b-alert p17b-alert--error" role="alert">{error}</div>}
  {notice&&<div className="p17b-alert" role="status">{notice}</div>}
  <div className="p17b-scenario-picker">
   <label htmlFor="p17b-scenario">Skenario Project</label>
   <select id="p17b-scenario" value={selected?.id||""} onChange={e=>setSelectedId(e.target.value)}>
    {scenarios.map(s=><option key={s.id} value={s.id}>{s.scenario_code} · {s.scenario_name}</option>)}
   </select>
   <button type="button" onClick={()=>void refresh()} disabled={busy}>Muat ulang</button>
  </div>
  {!selected?<div className="p17b-empty">Belum ada simulasi logistik untuk Project ini.</div>:<>
   <div className="p17b-chain">
    {nodes.map((node:Row,i:number)=><div className="p17b-node" key={node.id}>
     <div className="p17b-node__type">{nodeLabels[node.type]||node.type}</div>
     <strong>{node.name}</strong>
     <span className="p17b-unverified">Belum diverifikasi</span>
     {node.attributes?.location&&<small>{node.attributes.location}</small>}
     {node.attributes?.distance_km===null&&node.type==="road_route"&&<small>Jarak jalan belum diukur</small>}
     {node.attributes?.storage_capacity_mt===null&&node.type==="warehouse"&&<small>Kapasitas MT belum diketahui</small>}
    </div>)}
   </div>
   <div className="p17b-edge-list"><strong>Relasi antar tahap</strong>
    {edges.map((edge:Row)=><div key={edge.id}><span>{edgeLabels[edge.relationship_type]||edge.relationship_type}</span><small>{edge.from_id} → {edge.to_id}</small></div>)}
   </div>
   <div className="p17b-evidence">
    <h3>Bukti sumber dan batas penggunaan</h3>
    {(selected.source_evidence||[]).map((ev:Row,i:number)=><div key={i}>
     <strong>{ev.publisher}</strong> · <a href={ev.url} target="_blank" rel="noreferrer">Buka sumber</a>
     <p>{ev.claim}</p><small>{ev.scope}</small>
    </div>)}
    <p className="p17b-warning">Jarak dan waktu rute, penerimaan PKE, tarif/kecepatan loading, kapasitas gudang, serta koordinat belum diverifikasi. Jangan gunakan untuk dispatch atau komitmen ekspor.</p>
   </div>
   {canManage&&<details className="p17b-editor">
    <summary>Edit simulasi Project</summary>
    <form onSubmit={saveScenario}>
     <label>Status simulasi<select value={scenarioStatus} onChange={e=>setScenarioStatus(e.target.value)}><option value="simulation">Simulation</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
     <label>Graph JSON<textarea rows={14} value={graphDraft} onChange={e=>setGraphDraft(e.target.value)} spellCheck={false}/></label>
     <label>Source evidence JSON<textarea rows={8} value={evidenceDraft} onChange={e=>setEvidenceDraft(e.target.value)} spellCheck={false}/></label>
     <label>Assumptions JSON<textarea rows={8} value={assumptionsDraft} onChange={e=>setAssumptionsDraft(e.target.value)} spellCheck={false}/></label>
     <button type="submit" disabled={busy}>{busy?"Menyimpan…":"Simpan simulasi"}</button>
    </form>
   </details>}
  </>}
  {canManage&&<details className="p17b-editor">
   <summary>Ajukan perubahan master kanonis (PM draft / Admin approval)</summary>
   <form onSubmit={createRequest}>
    <div className="p17b-form-grid">
     <label>Jenis data<select disabled={!!editingRequestId} value={entityType} onChange={e=>setEntityType(e.target.value)}>{["port","route","terminal","loading_service","warehouse"].map(v=><option key={v} value={v}>{nodeLabels[v]||v}</option>)}</select></label>
     <label>Operasi<select disabled={!!editingRequestId} value={operation} onChange={e=>setOperation(e.target.value)}><option value="create">Buat kandidat</option><option value="update">Usulkan perubahan</option></select></label>
    </div>
    {operation==="update"&&<label>Target record UUID<input value={targetId} onChange={e=>setTargetId(e.target.value)} placeholder="UUID master record"/></label>}
    <label>Proposed data JSON<textarea rows={8} value={proposalDraft} onChange={e=>setProposalDraft(e.target.value)} spellCheck={false}/></label>
    <label>Alasan perubahan<input value={reason} onChange={e=>setReason(e.target.value)} minLength={10} required/></label>
    <label>Referensi sumber<input value={sourceReference} onChange={e=>setSourceReference(e.target.value)} minLength={8} required placeholder="Nama dokumen / klaim / sumber"/></label>
    <label>URL sumber<input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://…"/></label>
    <div className="p17b-form-actions"><button type="submit" disabled={busy}>{busy?"Menyimpan…":editingRequestId?"Perbarui draft":"Simpan draft perubahan"}</button>{editingRequestId&&<button type="button" disabled={busy} onClick={()=>{setEditingRequestId("");setRequestFormOpen(false);setReason("");setSourceReference("");setSourceUrl("");setTargetId("");}}>Batal edit</button>}</div>
   </form>
  </details>}
  <div className="p17b-requests">
   <h3>Permintaan perubahan master</h3>
   {!requests.length?<div className="p17b-empty">Belum ada permintaan perubahan untuk Project ini.</div>:requests.map((r:Row)=><article key={r.id}>
    <div><strong>{nodeLabels[r.entity_type]||r.entity_type} · {r.operation}</strong><span className={"p17b-request-status p17b-request-status--"+r.status}>{r.status}</span></div>
    <p>{r.request_reason}</p><small>{r.source_reference} · {r.created_at?new Date(r.created_at).toLocaleString("id-ID"):""}</small>
    <details className="p17b-proposal-detail"><summary>Lihat proposal dan bukti</summary><pre>{JSON.stringify(r.proposed_data||{},null,2)}</pre>{r.target_id&&<small>Target: {r.target_id}</small>}{r.source_url&&<p><a href={r.source_url} target="_blank" rel="noreferrer">Buka bukti sumber</a></p>}</details>
    {r.status==="draft"&&r.requested_by===activeUser?.id&&<div className="p17b-request-actions"><button type="button" disabled={busy} onClick={()=>editRequest(r)}>Edit draft</button><button type="button" disabled={busy} onClick={()=>void submitRequest(r.id)}>Kirim untuk review</button></div>}
    {canReview&&r.status==="submitted"&&<div className="p17b-admin-decision">
     <input value={decisionNotes[r.id]||""} onChange={e=>setDecisionNotes(v=>({...v,[r.id]:e.target.value}))} placeholder="Catatan keputusan / alasan penolakan"/>
     <button type="button" disabled={busy} onClick={()=>void decideRequest(r.id,"approved")}>Setujui</button>
     <button type="button" disabled={busy||String(decisionNotes[r.id]||"").trim().length<5} onClick={()=>void decideRequest(r.id,"rejected")}>Tolak</button>
    </div>}
   </article>)}
  </div>
 </section>;
}
