import { useEffect, useState, type FormEvent } from "react";
import { api, get, post, patch } from "./api";

type Source = Record<string, any>;
type RightsDraft = {
 rightsStatus:string; commercialUseAllowed:boolean; internalProcessingAllowed:boolean;
 customerDisplayAllowed:boolean; redistributionAllowed:boolean; derivativeUseAllowed:boolean;
 cachingAllowed:boolean; retentionDays:string; termsUrl:string; rightsEvidenceUrl:string;
 attributionText:string; rightsExpiresAt:string;
};
const blankSource={sourceCode:"",providerName:"",sourceClass:"other",datasetCode:"",endpointUrl:"",termsUrl:"",licenseCode:"",accessMethod:"manual"};
const makeRights=(s:Source):RightsDraft=>({
 rightsStatus:String(s.rights_status||"pending_review"),
 commercialUseAllowed:s.commercial_use_allowed===true,
 internalProcessingAllowed:s.internal_processing_allowed===true,
 customerDisplayAllowed:s.customer_display_allowed===true,
 redistributionAllowed:s.redistribution_allowed===true,
 derivativeUseAllowed:s.derivative_use_allowed===true,
 cachingAllowed:s.caching_allowed===true,
 retentionDays:s.retention_days==null?"":String(s.retention_days),
 termsUrl:String(s.terms_url||""),rightsEvidenceUrl:String(s.rights_evidence_url||""),
 attributionText:String(s.attribution_text||""),
 rightsExpiresAt:s.rights_expires_at?new Date(s.rights_expires_at).toISOString().slice(0,16):""
});

export default function MaritimeSourceRegistry({platformAdmin}:{platformAdmin:boolean}){
 const [sources,setSources]=useState<Source[]>([]);
 const [draft,setDraft]=useState(blankSource);
 const [rights,setRights]=useState<Record<string,RightsDraft>>({});
 const [field,setField]=useState({sourceId:"",fieldCode:"",purposeCode:"internal_operations",allowed:false,evidenceReference:""});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const refresh=async()=>{
  if(!platformAdmin)return;
  try{const r=await get<{sources?:Source[]}>("/admin/maritime/sources");const rows=Array.isArray(r.sources)?r.sources:[];setSources(rows);setRights(v=>{const next={...v};for(const s of rows)next[s.id]=makeRights(s);return next;});}
  catch(e:any){setError(e?.message||"Registry sumber maritim gagal dimuat.");}
 };
 useEffect(()=>{void refresh();},[platformAdmin]);
 if(!platformAdmin)return null;
 async function register(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{await post("/admin/maritime/sources",draft);setDraft(blankSource);setNotice("Sumber terdaftar dalam status pending review dan tetap nonaktif.");await refresh();}
  catch(e:any){setError(e?.message||"Sumber gagal didaftarkan.");}
  finally{setBusy(false);}
 }
 async function saveRights(e:FormEvent,id:string){
  e.preventDefault();const r=rights[id];if(!r)return;
  if(r.rightsStatus==="approved"&&(!r.internalProcessingAllowed||!r.termsUrl.trim()||!r.rightsEvidenceUrl.trim()||!r.attributionText.trim()||!r.rightsExpiresAt)){setError("Persetujuan membutuhkan hak pemrosesan internal, terms, bukti, atribusi, dan masa berlaku.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   await patch(`/admin/maritime/sources/${encodeURIComponent(id)}/rights`,{
    rightsStatus:r.rightsStatus,commercialUseAllowed:r.commercialUseAllowed,
    internalProcessingAllowed:r.internalProcessingAllowed,customerDisplayAllowed:r.customerDisplayAllowed,
    redistributionAllowed:r.redistributionAllowed,derivativeUseAllowed:r.derivativeUseAllowed,
    cachingAllowed:r.cachingAllowed,retentionDays:r.retentionDays===""?null:Number(r.retentionDays),
    termsUrl:r.termsUrl,rightsEvidenceUrl:r.rightsEvidenceUrl,attributionText:r.attributionText,
    rightsExpiresAt:r.rightsExpiresAt?new Date(r.rightsExpiresAt).toISOString():null
   });
   setNotice("Keputusan hak sumber tersimpan.");await refresh();
  }catch(e:any){setError(e?.message||"Hak sumber gagal diperbarui.");}
  finally{setBusy(false);}
 }
 async function saveField(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   await api(`/admin/maritime/sources/${encodeURIComponent(field.sourceId)}/field-permissions`,{
    method:"PUT",body:JSON.stringify({fields:[{fieldCode:field.fieldCode,purposeCode:field.purposeCode,allowed:field.allowed,evidenceReference:field.evidenceReference}]})
   });
   setNotice("Hak penggunaan field tersimpan.");setField(v=>({...v,fieldCode:"",allowed:false,evidenceReference:""}));
  }catch(e:any){setError(e?.message||"Hak penggunaan field gagal disimpan.");}
  finally{setBusy(false);}
 }
 async function enableSource(id:string){
  if(!window.confirm("Aktifkan sumber ini? Pastikan hak internal dan field-purpose sudah disetujui secara sah."))return;
  setBusy(true);setError("");setNotice("");
  try{await patch(`/admin/maritime/sources/${encodeURIComponent(id)}/enable`,{});setNotice("Sumber berhasil diaktifkan.");await refresh();}
  catch(e:any){setError(e?.message||"Sumber belum memenuhi syarat aktivasi.");}
  finally{setBusy(false);}
 }
 return <section className="p17-source-registry">
  <header><div><span className="p17-source-eyebrow">P17-A · SOURCE GOVERNANCE</span><h2>Registry Sumber Maritim</h2><p>Hak sumber, field-purpose, masa berlaku, atribusi dan status aktivasi. Sumber tanpa bukti persetujuan tetap nonaktif.</p></div><span className="p17-source-admin">Platform Admin</span></header>
  {error&&<div className="p17-source-alert p17-source-alert--error" role="alert">{error}</div>}
  {notice&&<div className="p17-source-alert" role="status">{notice}</div>}
  <div className="p17-source-grid">
   {sources.map(s=>{const r=rights[s.id]||makeRights(s);return <article className="p17-source-card" key={s.id}>
    <div className="p17-source-card__head"><div><strong>{s.provider_name}</strong><small>{s.source_code} · {s.source_class} · {s.dataset_code}</small></div><span className={s.enabled?"p17-source-state p17-source-state--on":"p17-source-state"}>{s.enabled?"AKTIF":"NONAKTIF"}</span></div>
    <p>{s.endpoint_url||"Belum ada endpoint"}</p><small>Hak: {s.rights_status} · Lisensi: {s.license_code||"belum ditetapkan"} · Berakhir: {s.rights_expires_at?new Date(s.rights_expires_at).toLocaleDateString("id-ID"):"—"}</small>
    <details><summary>Review hak sumber</summary>
     <form onSubmit={e=>void saveRights(e,s.id)}>
      <label>Status hak<select value={r.rightsStatus} onChange={e=>setRights(v=>({...v,[s.id]:{...r,rightsStatus:e.target.value}}))}>{["pending_review","approved","restricted","suspended","revoked","expired"].map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="p17-source-checks">
       {([["commercialUseAllowed","Penggunaan komersial"],["internalProcessingAllowed","Pemrosesan internal"],["customerDisplayAllowed","Tampilan ke customer"],["redistributionAllowed","Redistribusi"],["derivativeUseAllowed","Produk turunan"],["cachingAllowed","Caching"]] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={r[key]} onChange={e=>setRights(v=>({...v,[s.id]:{...r,[key]:e.target.checked}}))}/>{label}</label>)}
      </div>
      <label>URL terms<input type="url" value={r.termsUrl} onChange={e=>setRights(v=>({...v,[s.id]:{...r,termsUrl:e.target.value}}))}/></label>
      <label>Bukti hak / keputusan<input type="url" value={r.rightsEvidenceUrl} onChange={e=>setRights(v=>({...v,[s.id]:{...r,rightsEvidenceUrl:e.target.value}}))}/></label>
      <label>Teks atribusi<input value={r.attributionText} onChange={e=>setRights(v=>({...v,[s.id]:{...r,attributionText:e.target.value}}))}/></label>
      <label>Masa berlaku hak<input type="datetime-local" value={r.rightsExpiresAt} onChange={e=>setRights(v=>({...v,[s.id]:{...r,rightsExpiresAt:e.target.value}}))}/></label>
      <label>Retention days<input type="number" min="0" max="3650" value={r.retentionDays} onChange={e=>setRights(v=>({...v,[s.id]:{...r,retentionDays:e.target.value}}))}/></label>
      <button type="submit" disabled={busy}>Simpan keputusan hak</button>
     </form>
    </details>
    <details><summary>Field-purpose permission</summary>
     <form onSubmit={saveField}>
      <input type="hidden" value={field.sourceId===s.id?s.id:""} readOnly/>
      <label>Kode field<input required pattern="[a-z][a-z0-9_]{1,95}" value={field.sourceId===s.id?field.fieldCode:""} onFocus={()=>setField(v=>({...v,sourceId:s.id}))} onChange={e=>setField(v=>({...v,sourceId:s.id,fieldCode:e.target.value}))}/></label>
      <label>Tujuan<select value={field.sourceId===s.id?field.purposeCode:"internal_operations"} onChange={e=>setField(v=>({...v,sourceId:s.id,purposeCode:e.target.value}))}>{["internal_operations","customer_display","analytics","redistribution","derived_product"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label><input type="checkbox" checked={field.sourceId===s.id&&field.allowed} onChange={e=>setField(v=>({...v,sourceId:s.id,allowed:e.target.checked}))}/> Izinkan penggunaan</label>
      <label>Referensi bukti<input value={field.sourceId===s.id?field.evidenceReference:""} onChange={e=>setField(v=>({...v,sourceId:s.id,evidenceReference:e.target.value}))}/></label>
      <button type="submit" disabled={busy||!s.id||s.rights_status!=="approved"}>Simpan izin field</button>
      {s.rights_status!=="approved"&&<small>Aktifkan izin field setelah hak sumber disetujui.</small>}
     </form>
    </details>
    {!s.enabled&&<button type="button" disabled={busy||s.rights_status!=="approved"} onClick={()=>void enableSource(s.id)}>Aktifkan sumber</button>}
   </article>})}
  </div>
  <details className="p17-source-register-form"><summary>Daftarkan sumber kandidat baru</summary>
   <form onSubmit={register}>
    <label>Kode sumber<input required pattern="[a-z][a-z0-9_]{1,63}" value={draft.sourceCode} onChange={e=>setDraft(v=>({...v,sourceCode:e.target.value}))}/></label>
    <label>Penyedia<input required value={draft.providerName} onChange={e=>setDraft(v=>({...v,providerName:e.target.value}))}/></label>
    <label>Kelas sumber<select value={draft.sourceClass} onChange={e=>setDraft(v=>({...v,sourceClass:e.target.value}))}>{["port_master","marine_weather","ais","port_geometry","navigation_notice","other"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Kode dataset<input required pattern="[a-z][a-z0-9_]{1,63}" value={draft.datasetCode} onChange={e=>setDraft(v=>({...v,datasetCode:e.target.value}))}/></label>
    <label>Metode akses<select value={draft.accessMethod} onChange={e=>setDraft(v=>({...v,accessMethod:e.target.value}))}>{["manual","https_api","file_download","webhook"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Endpoint / katalog<input type="url" value={draft.endpointUrl} onChange={e=>setDraft(v=>({...v,endpointUrl:e.target.value}))}/></label>
    <label>Terms URL<input type="url" value={draft.termsUrl} onChange={e=>setDraft(v=>({...v,termsUrl:e.target.value}))}/></label>
    <label>License code<input value={draft.licenseCode} onChange={e=>setDraft(v=>({...v,licenseCode:e.target.value}))}/></label>
    <button type="submit" disabled={busy}>Daftarkan sebagai pending review</button>
   </form>
  </details>
 </section>;
}
