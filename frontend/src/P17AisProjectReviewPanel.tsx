import { useEffect,useState } from "react";
import { get,patch } from "./api";
type Row=Record<string,any>;
export default function P17AisProjectReviewPanel({projectId,permissions}:{projectId:string;permissions:string[]}){
 const canReview=permissions.includes("vessel.position.review");
 const [rows,setRows]=useState<Row[]>([]),[notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const base="/projects/"+encodeURIComponent(projectId)+"/vessel-positions";
 const refresh=async()=>{
  if(!projectId||!canReview)return;
  setError("");
  try{const r=await get<{observations?:Row[]}>(base+"/review-queue");setRows(Array.isArray(r.observations)?r.observations:[]);}
  catch(e){setError(e instanceof Error?e.message:"Antrean review AIS Project tidak tersedia.");}
 };
 useEffect(()=>{void refresh();},[projectId,canReview]);
 if(!canReview)return null;
 async function review(id:string,status:"accepted"|"rejected"|"superseded"){
  const note=(notes[id]||"").trim();if(note.length<5){setError("Catatan review minimal 5 karakter.");return;}
  setBusy(true);setError("");setNotice("");
  try{await patch(base+"/"+encodeURIComponent(id)+"/review",{reviewStatus:status,reviewNote:note});setNotice("Keputusan review AIS Project tersimpan.");await refresh();}
  catch(e){setError(e instanceof Error?e.message:"Review ditolak oleh permission, source rights atau maker-checker.");}
  finally{setBusy(false);}
 }
 return <section className="card">
  <div className="panel-heading"><div><h3>P17-D · Project AIS independent review</h3><p>Antrean hanya menampilkan observasi pending untuk kapal yang terhubung ke Project aktif. Reviewer harus berbeda dari pembuat observasi.</p></div><span>{rows.length} pending</span></div>
  {error&&<div className="inline-warning" role="alert">{error}</div>}
  {notice&&<div className="inline-warning" role="status">{notice}</div>}
  <div className="stack-list">{rows.length?rows.map(r=><div className="list-row" key={r.id}>
   <strong>{r.vessel_name||r.vessel_id} · MMSI {r.mmsi}</strong>
   <p>{r.latitude}, {r.longitude} · observed {r.observed_at?new Date(r.observed_at).toLocaleString("id-ID"):"—"} · {r.source_quality||"unknown"}</p>
   <small>{r.provider_code} · {r.provider_reference} · {r.source_reference}</small>
   <label>Catatan reviewer<input value={notes[r.id]||""} onChange={e=>setNotes(v=>({...v,[r.id]:e.target.value}))} placeholder="Catatan independen (min. 5 karakter)"/></label>
   <div className="inline-form">
    <button disabled={busy||(notes[r.id]||"").trim().length<5} onClick={()=>void review(r.id,"accepted")}>Accept</button>
    <button disabled={busy||(notes[r.id]||"").trim().length<5} onClick={()=>void review(r.id,"rejected")}>Reject</button>
    <button disabled={busy||(notes[r.id]||"").trim().length<5} onClick={()=>void review(r.id,"superseded")}>Supersede</button>
   </div>
  </div>):<p className="empty-state">Tidak ada observasi AIS pending untuk Project ini.</p>}</div>
 </section>;
}
