import { useEffect, useState } from "react";
import { get, patch } from "./api";

type Row=Record<string,any>;
export default function MaritimeIdentityReview({platformAdmin}:{platformAdmin:boolean}){
 const [crosswalk,setCrosswalk]=useState<Row[]>([]),[features,setFeatures]=useState<Row[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const refresh=async()=>{
  if(!platformAdmin)return;
  setError("");
  try{
   const [x,g]=await Promise.all([
    get<{crosswalk?:Row[]}>("/admin/maritime/port-crosswalk"),
    get<{features?:Row[]}>("/admin/maritime/port-geospatial-features")
   ]);
   setCrosswalk(Array.isArray(x.crosswalk)?x.crosswalk:[]);
   setFeatures(Array.isArray(g.features)?g.features:[]);
  }catch(e:any){setError(e?.message||"Data crosswalk dan geospasial gagal dimuat.");}
 };
 useEffect(()=>{void refresh();},[platformAdmin]);
 if(!platformAdmin)return null;
 async function reviewCrosswalk(id:string,status:"matched"|"rejected"|"superseded"){
  const note=(notes[id]||"").trim();if(note.length<5){setError("Catatan review minimal 5 karakter.");return;}
  setBusy(true);setError("");setNotice("");
  try{await patch(`/admin/maritime/port-crosswalk/${encodeURIComponent(id)}/review`,{reviewStatus:status,reviewNote:note});setNotice("Review identitas pelabuhan tersimpan.");await refresh();}
  catch(e:any){setError(e?.message||"Review crosswalk ditolak oleh kontrol maker-checker atau validasi.");}
  finally{setBusy(false);}
 }
 async function reviewFeature(id:string,status:"verified"|"rejected"|"superseded"){
  const note=(notes[id]||"").trim();if(note.length<5){setError("Catatan review minimal 5 karakter.");return;}
  setBusy(true);setError("");setNotice("");
  try{await patch(`/admin/maritime/port-geospatial-features/${encodeURIComponent(id)}/review`,{reviewStatus:status,reviewNote:note});setNotice("Review geospasial tersimpan.");await refresh();}
  catch(e:any){setError(e?.message||"Review geospasial ditolak oleh kontrol maker-checker atau validasi.");}
  finally{setBusy(false);}
 }
 return <section className="p17-identity-review">
  <header><div><span>P17-B · IDENTITY & GEOSPATIAL REVIEW</span><h2>Rekonsiliasi Identitas & Geospasial</h2><p>Crosswalk identitas pelabuhan dan GeoJSON ditinjau terpisah dari data kanonis. Reviewer tidak boleh menjadi pembuat record.</p></div><button type="button" onClick={()=>void refresh()} disabled={busy}>Muat ulang</button></header>
  {error&&<div className="p17-source-alert p17-source-alert--error" role="alert">{error}</div>}
  {notice&&<div className="p17-source-alert" role="status">{notice}</div>}
  <div className="p17-identity-grid">
   <article><h3>Port identity crosswalk</h3>
    {!crosswalk.length?<p>Belum ada identitas eksternal yang diajukan. Sumber port master belum disetujui atau belum diaktifkan.</p>:crosswalk.map(x=><div className="p17-identity-record" key={x.id}>
     <strong>{x.port_name||x.port_id}</strong><small>{x.source_code} · {x.external_record_id} · {x.external_code||"tanpa kode"}</small>
     <small>Match: {x.match_method} · confidence: {x.match_confidence??"—"} · status: {x.review_status}</small>
     <p>{x.source_reference}</p>
     {x.review_status==="pending"&&<><input value={notes[x.id]||""} onChange={e=>setNotes(v=>({...v,[x.id]:e.target.value}))} placeholder="Catatan review independen"/><div className="p17-identity-actions"><button disabled={busy} onClick={()=>void reviewCrosswalk(x.id,"matched")}>Cocokkan</button><button disabled={busy} onClick={()=>void reviewCrosswalk(x.id,"rejected")}>Tolak</button></div></>}
    </div>)}
   </article>
   <article><h3>Port / PKS GeoJSON features</h3>
    {!features.length?<p>Belum ada fitur geospasial. Import tetap tertutup sampai hak geometry_geojson dan atribusi disetujui.</p>:features.map(x=><div className="p17-identity-record" key={x.id}>
     <strong>{x.port_name||x.pks_site_name||x.port_id||x.pks_site_id}</strong><small>{x.source_code} · {x.feature_type} · dataset {x.dataset_version}</small>
     <small>SHA-256: {x.geometry_sha256} · status: {x.review_status}</small>
     <p>{x.source_reference}</p>
     {x.review_status==="pending"&&<><input value={notes[x.id]||""} onChange={e=>setNotes(v=>({...v,[x.id]:e.target.value}))} placeholder="Catatan review independen"/><div className="p17-identity-actions"><button disabled={busy} onClick={()=>void reviewFeature(x.id,"verified")}>Verifikasi</button><button disabled={busy} onClick={()=>void reviewFeature(x.id,"rejected")}>Tolak</button></div></>}
    </div>)}
   </article>
  </div>
 </section>;
}
