import { useEffect, useState, type FormEvent } from "react";
import { get, post, patch } from "./api";

type Row=Record<string,any>;
export default function MaritimeIdentityReview({platformAdmin}:{platformAdmin:boolean}){
 const [crosswalk,setCrosswalk]=useState<Row[]>([]),[features,setFeatures]=useState<Row[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [crossForm,setCrossForm]=useState({sourceCode:"",externalRecordId:"",externalCode:"",portId:"",matchMethod:"manual",matchConfidence:"",sourceReference:"",sourceSnapshot:"{}"});
 const [geoForm,setGeoForm]=useState({sourceId:"",portId:"",pksSiteId:"",sourceFeatureId:"",featureType:"port_point",geometry:"{}",datasetVersion:"",licenseCode:"",attributionText:"",sourceReference:""});
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
 async function submitCrosswalk(e:FormEvent){e.preventDefault();setBusy(true);setError("");setNotice("");try{const snapshot=JSON.parse(crossForm.sourceSnapshot);const canonical=JSON.stringify(Object.fromEntries(Object.entries(snapshot).sort(([a],[b])=>a.localeCompare(b))));const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));const evidenceSha256=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");await post("/admin/maritime/port-crosswalk",{...crossForm,matchConfidence:crossForm.matchConfidence===""?null:Number(crossForm.matchConfidence),sourceSnapshot:snapshot,evidenceSha256});setNotice("Crosswalk candidate dibuat pending review.");await refresh();}catch(e:any){setError(e instanceof Error?e.message:"Crosswalk candidate gagal dibuat.");}finally{setBusy(false);}}
 async function submitGeometry(e:FormEvent){e.preventDefault();setBusy(true);setError("");setNotice("");try{const geometry=JSON.parse(geoForm.geometry);const canonical=JSON.stringify(Object.fromEntries(Object.entries(geometry).sort(([a],[b])=>a.localeCompare(b))));const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));const geometrySha256=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");await post("/admin/maritime/port-geospatial-features",{...geoForm,portId:geoForm.portId||null,pksSiteId:geoForm.pksSiteId||null,geometryGeojson:geometry,geometrySha256});setNotice("Geospatial candidate dibuat pending review.");await refresh();}catch(e:any){setError(e instanceof Error?e.message:"Geospatial candidate gagal dibuat.");}finally{setBusy(false);}}
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
  <details><summary>Ajukan port identity crosswalk</summary><form className="form-grid" onSubmit={submitCrosswalk}><label>Source code<input required value={crossForm.sourceCode} onChange={e=>setCrossForm(v=>({...v,sourceCode:e.target.value}))}/></label><label>External record ID<input required value={crossForm.externalRecordId} onChange={e=>setCrossForm(v=>({...v,externalRecordId:e.target.value}))}/></label><label>External code<input value={crossForm.externalCode} onChange={e=>setCrossForm(v=>({...v,externalCode:e.target.value}))}/></label><label>Canonical port ID<input required value={crossForm.portId} onChange={e=>setCrossForm(v=>({...v,portId:e.target.value}))}/></label><label>Match method<select value={crossForm.matchMethod} onChange={e=>setCrossForm(v=>({...v,matchMethod:e.target.value}))}>{["manual","official_code","unlocode","name_location","coordinate","fuzzy_candidate"].map(x=><option key={x}>{x}</option>)}</select></label><label>Confidence 0–1<input type="number" min="0" max="1" step="any" value={crossForm.matchConfidence} onChange={e=>setCrossForm(v=>({...v,matchConfidence:e.target.value}))}/></label><label>Source reference<input required value={crossForm.sourceReference} onChange={e=>setCrossForm(v=>({...v,sourceReference:e.target.value}))}/></label><label>Source snapshot JSON<textarea rows={5} value={crossForm.sourceSnapshot} onChange={e=>setCrossForm(v=>({...v,sourceSnapshot:e.target.value}))}/></label><button disabled={busy}>Submit crosswalk candidate</button></form></details>
  <details><summary>Ajukan port / PKS GeoJSON feature</summary><form className="form-grid" onSubmit={submitGeometry}><label>Source ID<input required value={geoForm.sourceId} onChange={e=>setGeoForm(v=>({...v,sourceId:e.target.value}))}/></label><label>Port ID (isi salah satu subject)<input value={geoForm.portId} onChange={e=>setGeoForm(v=>({...v,portId:e.target.value,pksSiteId:""}))}/></label><label>PKS site ID (isi salah satu subject)<input value={geoForm.pksSiteId} onChange={e=>setGeoForm(v=>({...v,pksSiteId:e.target.value,portId:""}))}/></label><label>Source feature ID<input required value={geoForm.sourceFeatureId} onChange={e=>setGeoForm(v=>({...v,sourceFeatureId:e.target.value}))}/></label><label>Feature type<select value={geoForm.featureType} onChange={e=>setGeoForm(v=>({...v,featureType:e.target.value}))}>{["port_point","terminal_point","port_boundary","terminal_boundary","pks_point","pks_boundary","road_access","road_route"].map(x=><option key={x}>{x}</option>)}</select></label><label>GeoJSON<textarea rows={7} value={geoForm.geometry} onChange={e=>setGeoForm(v=>({...v,geometry:e.target.value}))}/></label><label>Dataset version<input required value={geoForm.datasetVersion} onChange={e=>setGeoForm(v=>({...v,datasetVersion:e.target.value}))}/></label><label>License code<input required value={geoForm.licenseCode} onChange={e=>setGeoForm(v=>({...v,licenseCode:e.target.value}))}/></label><label>Attribution<input required value={geoForm.attributionText} onChange={e=>setGeoForm(v=>({...v,attributionText:e.target.value}))}/></label><label>Source reference<input required value={geoForm.sourceReference} onChange={e=>setGeoForm(v=>({...v,sourceReference:e.target.value}))}/></label><button disabled={busy||(!geoForm.portId&&!geoForm.pksSiteId)}>Submit geospatial candidate</button></form></details>
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
