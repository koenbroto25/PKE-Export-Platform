import { useEffect,useState,type FormEvent } from "react";
import { get,post,patch } from "./api";
type Row=Record<string,any>;
const empty={sourceId:"",vesselId:"",mmsi:"",latitude:"",longitude:"",observedAt:"",sogKnots:"",cogDegrees:"",sourceReference:"",providerReference:"",attributionText:""};
export default function P17AisAdminPanel({platformAdmin}:{platformAdmin:boolean}){
 const [form,setForm]=useState(empty),[rows,setRows]=useState<Row[]>([]),[notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const refresh=async()=>{if(!platformAdmin)return;try{const r=await get<{observations?:Row[]}>("/admin/maritime/vessel-positions?reviewStatus=pending");setRows(Array.isArray(r.observations)?r.observations:[]);}catch(e){setError(e instanceof Error?e.message:"AIS review queue tidak tersedia.");}};
 useEffect(()=>{void refresh();},[platformAdmin]);
 if(!platformAdmin)return null;
 const change=(key:keyof typeof empty,value:string)=>setForm(v=>({...v,[key]:value}));
 async function ingest(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   const payload:Row={mmsi:form.mmsi.trim(),latitude:Number(form.latitude),longitude:Number(form.longitude),observed_at:new Date(form.observedAt).toISOString()};
   if(form.sogKnots!=="")payload.sog_knots=Number(form.sogKnots);
   if(form.cogDegrees!=="")payload.cog_degrees=Number(form.cogDegrees);
   const canonical=JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a],[b])=>a.localeCompare(b))));
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));
   const payloadSha256=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
   await post("/admin/maritime/vessel-positions",{sourceId:form.sourceId.trim(),vesselId:form.vesselId.trim(),mmsi:form.mmsi.trim(),latitude:Number(form.latitude),longitude:Number(form.longitude),observedAt:payload.observed_at,sogKnots:payload.sog_knots??null,cogDegrees:payload.cog_degrees??null,sourceReference:form.sourceReference.trim(),providerReference:form.providerReference.trim(),attributionText:form.attributionText.trim(),rawPayload:payload,payloadSha256});
   setForm(empty);setNotice("Observasi AIS tersimpan sebagai pending; belum ditampilkan sebelum review independen.");await refresh();
  }catch(e){setError(e instanceof Error?e.message:"AIS observation ditolak oleh rights, identity atau payload guard.");}
  finally{setBusy(false);}
 }
 async function review(id:string,status:"accepted"|"rejected"|"superseded"){
  const note=(notes[id]||"").trim();if(note.length<5){setError("Catatan review minimal 5 karakter.");return;}
  setBusy(true);setError("");setNotice("");
  try{await patch("/admin/maritime/vessel-positions/"+encodeURIComponent(id)+"/review",{reviewStatus:status,reviewNote:note});setNotice("Review AIS tersimpan.");await refresh();}
  catch(e){setError(e instanceof Error?e.message:"Review ditolak oleh maker-checker atau rights guard.");}
  finally{setBusy(false);}
 }
 return <section className="card"><div className="panel-heading"><div><h3>P17-D · AIS ingestion & independent review</h3><p>Ingestion hanya untuk sumber berlisensi yang aktif, MMSI yang cocok dengan vessel master, payload ter-hash dan timestamp provider. Review harus oleh admin berbeda.</p></div><span>{rows.length} pending</span></div>
 {error&&<div className="inline-warning" role="alert">{error}</div>}{notice&&<div className="inline-warning" role="status">{notice}</div>}
 <form className="form-grid" onSubmit={ingest}>
  <label>Source ID<input required value={form.sourceId} onChange={e=>change("sourceId",e.target.value)} placeholder="UUID AIS source aktif"/></label>
  <label>Vessel ID<input required value={form.vesselId} onChange={e=>change("vesselId",e.target.value)} placeholder="UUID vessel master"/></label>
  <label>MMSI<input required pattern="[0-9]{9}" value={form.mmsi} onChange={e=>change("mmsi",e.target.value)}/></label>
  <label>Latitude<input required type="number" min="-90" max="90" step="any" value={form.latitude} onChange={e=>change("latitude",e.target.value)}/></label>
  <label>Longitude<input required type="number" min="-180" max="180" step="any" value={form.longitude} onChange={e=>change("longitude",e.target.value)}/></label>
  <label>Provider observed at<input required type="datetime-local" value={form.observedAt} onChange={e=>change("observedAt",e.target.value)}/></label>
  <label>SOG knots (opsional)<input type="number" min="0" max="120" step="any" value={form.sogKnots} onChange={e=>change("sogKnots",e.target.value)}/></label>
  <label>COG degrees (opsional)<input type="number" min="0" max="360" step="any" value={form.cogDegrees} onChange={e=>change("cogDegrees",e.target.value)}/></label>
  <label>Provider reference<input required value={form.providerReference} onChange={e=>change("providerReference",e.target.value)}/></label>
  <label>Source reference<input required value={form.sourceReference} onChange={e=>change("sourceReference",e.target.value)}/></label>
  <label>Attribution text<input required value={form.attributionText} onChange={e=>change("attributionText",e.target.value)}/></label>
  <button disabled={busy}>Ingest observation as pending</button>
 </form>
 <h4>Pending AIS review</h4>{rows.length?rows.map(r=><div className="list-row" key={r.id}><strong>{r.vessel_name} · MMSI {r.mmsi}</strong><p>{r.latitude}, {r.longitude} · {String(r.observed_at||"")} · {r.source_quality}</p><small>{r.provider_code} · {r.provider_reference} · {r.source_reference}</small><label>Catatan reviewer<input value={notes[r.id]||""} onChange={e=>setNotes(v=>({...v,[r.id]:e.target.value}))}/></label><div className="inline-form"><button disabled={busy||!(notes[r.id]||"").trim()||notes[r.id].trim().length<5} onClick={()=>void review(r.id,"accepted")}>Accept</button><button disabled={busy||!(notes[r.id]||"").trim()||notes[r.id].trim().length<5} onClick={()=>void review(r.id,"rejected")}>Reject</button><button disabled={busy||!(notes[r.id]||"").trim()||notes[r.id].trim().length<5} onClick={()=>void review(r.id,"superseded")}>Supersede</button></div></div>):<p className="empty-state">Tidak ada AIS observation pending. Tidak ada koordinat yang dibuat otomatis.</p>}
 </section>;
}
