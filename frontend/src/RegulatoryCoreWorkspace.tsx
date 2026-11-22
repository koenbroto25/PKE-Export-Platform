import { FormEvent, useCallback, useEffect, useState } from "react";
import { get, post, patch } from "./api";
import { hasProjectPermission } from "./role-permissions";

type AnyRecord=Record<string,any>;
type Props={projectId:string;activeUser?:AnyRecord;onNotice:(kind:"success"|"error"|"info",text:string)=>void};
const today=new Date().toISOString().slice(0,10);
const defaultConditions='[{"fieldPath":"shipment.destinationCountry","operator":"eq","value":"CN","conditionGroup":1}]';
const defaultDocuments='[]';

export default function RegulatoryCoreWorkspace({projectId,activeUser,onNotice}:Props){
  const can=(p:string)=>hasProjectPermission(p,activeUser);
  const canSourceView=can("regulatory.source.view")||can("regulatory.source.manage");
  const canSourceManage=can("regulatory.source.manage");
  const canRuleView=can("regulatory.rule.view")||can("regulatory.rule.manage");
  const canRuleManage=can("regulatory.rule.manage");
  const canDocView=can("regulatory.document.view")||can("regulatory.document.manage");
  const canDocManage=can("regulatory.document.manage");
  const canAssess=can("compliance.assess")&&Boolean(projectId);
  const [sources,setSources]=useState<AnyRecord[]>([]);
  const [rules,setRules]=useState<AnyRecord[]>([]);
  const [docTypes,setDocTypes]=useState<AnyRecord[]>([]);
  const [countryReqs,setCountryReqs]=useState<AnyRecord[]>([]);
  const [assessments,setAssessments]=useState<AnyRecord[]>([]);
  const [auditEvents,setAuditEvents]=useState<AnyRecord[]>([]);
  const [selectedAssessment,setSelectedAssessment]=useState<string>("");
  const [assessmentDetail,setAssessmentDetail]=useState<AnyRecord|null>(null);
  const [reviewReason,setReviewReason]=useState("Reviewed against verified source and attached Project evidence.");
  const [ruleReviewReason,setRuleReviewReason]=useState("Rule source or interpretation requires revision before approval.");
  const [versionTarget,setVersionTarget]=useState<string>("");
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [sourceForm,setSourceForm]=useState({sourceId:"",title:"",issuingAuthority:"",jurisdiction:"ID",effectiveDate:today,officialUrl:"",sha256Checksum:""});
  const [ruleForm,setRuleForm]=useState({ruleCode:"",title:"",jurisdiction:"CN",subjectType:"shipment",sourceId:"",outcome:"require",effectiveFrom:today,summary:"",conditions:defaultConditions,documents:defaultDocuments});
  const [docForm,setDocForm]=useState({documentCode:"",documentName:"",documentCategory:"export",description:""});
  const [countryForm,setCountryForm]=useState({countryCode:"CN",documentCode:"",regulatorySourceId:"",effectiveFrom:today,mandatory:true,importingAuthority:"",officialSourceUrl:"",notes:""});
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const jobs:Promise<any>[]=[];
      if(canSourceView){jobs.push(get<{sources?:AnyRecord[]}>("/regulatory-sources").then(r=>setSources(r.sources||[])));jobs.push(get<{events?:AnyRecord[]}>("/regulatory-audit-events").then(r=>setAuditEvents(r.events||[])));}
      if(canRuleView) jobs.push(get<{rules?:AnyRecord[]}>("/regulatory-rules").then(r=>setRules(r.rules||[])));
      if(canDocView){
        jobs.push(get<{documentTypes?:AnyRecord[]}>("/export-document-types").then(r=>setDocTypes(r.documentTypes||[])));
        jobs.push(get<{requirements?:AnyRecord[]}>("/country-document-requirements").then(r=>setCountryReqs(r.requirements||[])));
      }
      if(projectId&&can("compliance.view")) jobs.push(get<{assessments?:AnyRecord[]}>(`/projects/${encodeURIComponent(projectId)}/regulatory-assessments`).then(r=>setAssessments(r.assessments||[])));
      await Promise.all(jobs);
    }catch(e){onNotice("error",e instanceof Error?e.message:"Regulatory workspace gagal dimuat.");}
    finally{setLoading(false);}
  },[projectId,activeUser?.id,canSourceView,canRuleView,canDocView]);
  useEffect(()=>{void refresh();},[refresh]);
  const submitSource=async(e:FormEvent)=>{
    e.preventDefault();if(!canSourceManage)return;setBusy(true);
    try{await post("/regulatory-sources",sourceForm);onNotice("success","Sumber regulasi disimpan sebagai pending verification.");setSourceForm({sourceId:"",title:"",issuingAuthority:"",jurisdiction:"ID",effectiveDate:today,officialUrl:"",sha256Checksum:""});await refresh();}
    catch(e){onNotice("error",e instanceof Error?e.message:"Sumber regulasi gagal disimpan.");}finally{setBusy(false);}
  };
  const reviewSource=async(source:AnyRecord)=>{
    if(!canSourceManage||source.createdBy===activeUser?.id)return;
    setBusy(true);
    try{await patch(`/regulatory-sources/${encodeURIComponent(source.id)}/review`,{decision:"verified"});onNotice("success","Sumber ditandai verified setelah review independen.");await refresh();}
    catch(e){onNotice("error",e instanceof Error?e.message:"Review sumber gagal.");}finally{setBusy(false);}
  };
  const submitRule=async(e:FormEvent)=>{
    e.preventDefault();if(!canRuleManage)return;setBusy(true);
    try{
      const conditions=JSON.parse(ruleForm.conditions);const documents=JSON.parse(ruleForm.documents);
      if(!Array.isArray(conditions)||!Array.isArray(documents))throw new Error("Conditions dan documents harus berupa JSON array.");
      const payload={...ruleForm,conditions,documents};delete (payload as AnyRecord).conditionsText;
      if(versionTarget) await post(`/regulatory-rules/${encodeURIComponent(versionTarget)}/versions`,payload); else await post("/regulatory-rules",payload);
      onNotice("success",versionTarget?"Draft rule version baru berhasil dibuat.":"Rule dan draft version berhasil dibuat.");setVersionTarget("");setRuleForm(v=>({...v,ruleCode:"",title:"",summary:""}));await refresh();
    }catch(e){onNotice("error",e instanceof Error?e.message:"Rule gagal dibuat.");}finally{setBusy(false);}
  };
  const transitionRule=async(versionId:string,action:"submit-review"|"approve"|"reject"|"activate")=>{
    setBusy(true);
    try{await patch(`/regulatory-rule-versions/${encodeURIComponent(versionId)}/${action}`,action==="reject"?{reason:ruleReviewReason}:{});onNotice("success",`Transisi rule ${action} berhasil.`);await refresh();}
    catch(e){onNotice("error",e instanceof Error?e.message:"Transisi rule gagal.");}finally{setBusy(false);}
  };
  const submitDocType=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);
    try{await post("/export-document-types",docForm);onNotice("success","Katalog dokumen berhasil ditambahkan.");setDocForm({documentCode:"",documentName:"",documentCategory:"export",description:""});await refresh();}
    catch(e){onNotice("error",e instanceof Error?e.message:"Katalog dokumen gagal disimpan.");}finally{setBusy(false);}
  };
  const submitCountryRequirement=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);
    try{await post("/country-document-requirements",countryForm);onNotice("success","Persyaratan negara disimpan sebagai pending verification.");await refresh();}
    catch(e){onNotice("error",e instanceof Error?e.message:"Persyaratan negara gagal disimpan.");}finally{setBusy(false);}
  };
  const openAssessment=async(id:string)=>{setSelectedAssessment(id);setAssessmentDetail(null);try{const d=await get<AnyRecord>(`/projects/${encodeURIComponent(projectId)}/regulatory-assessments/${encodeURIComponent(id)}`);setAssessmentDetail(d);}catch(e){onNotice("error",e instanceof Error?e.message:"Assessment detail gagal dimuat.");}};
  const reviewAssessment=async(resultId:string,decision:"pass"|"fail"|"not_applicable")=>{
    if(!selectedAssessment||!reviewReason.trim())return;setBusy(true);
    try{await patch(`/projects/${encodeURIComponent(projectId)}/regulatory-assessments/${encodeURIComponent(selectedAssessment)}/review`,{decisions:[{resultId,decision,reason:reviewReason.trim()}]});onNotice("success","Review assessment tersimpan.");await refresh();await openAssessment(selectedAssessment);}
    catch(e){onNotice("error",e instanceof Error?e.message:"Review assessment gagal.");}finally{setBusy(false);}
  };
  const reviewCountryRequirement=async(id:string)=>{
    setBusy(true);
    try{await patch(`/country-document-requirements/${encodeURIComponent(id)}/review`,{decision:"verified"});onNotice("success","Persyaratan negara diverifikasi secara independen.");await refresh();}
    catch(e){onNotice("error",e instanceof Error?e.message:"Review persyaratan gagal.");}finally{setBusy(false);}
  };
  return <section className="regulatory-core-workspace">
    <div className="page-section-heading"><div><span className="eyebrow">P18 · REGULATORY CORE</span><h2>Registri regulasi & kontrol kepatuhan</h2><p>Registri sumber, versi aturan, katalog dokumen, review independen, dan riwayat assessment. RAG dan chatbot tidak termasuk dalam workspace ini.</p></div><button className="secondary-button" onClick={()=>void refresh()} disabled={loading}>{loading?"Memuat…":"Refresh"}</button></div>
    {canSourceView&&<section className="card">
      <h3>Regulatory Source Registry</h3><p className="muted">Sumber baru selalu berstatus pending. Verifikasi memerlukan reviewer yang berbeda dari pembuat.</p>
      {canSourceManage&&<form className="form-grid" onSubmit={submitSource}>
        <label>Source ID<input required value={sourceForm.sourceId} onChange={e=>setSourceForm(v=>({...v,sourceId:e.target.value}))}/></label>
        <label>Judul resmi<input required value={sourceForm.title} onChange={e=>setSourceForm(v=>({...v,title:e.target.value}))}/></label>
        <label>Otoritas penerbit<input required value={sourceForm.issuingAuthority} onChange={e=>setSourceForm(v=>({...v,issuingAuthority:e.target.value}))}/></label>
        <label>Jurisdiksi<select value={sourceForm.jurisdiction} onChange={e=>setSourceForm(v=>({...v,jurisdiction:e.target.value}))}><option value="ID">Indonesia</option><option value="CN">China</option><option value="PK">Pakistan</option><option value="GLOBAL">Global</option></select></label>
        <label>Tanggal berlaku<input type="date" required value={sourceForm.effectiveDate} onChange={e=>setSourceForm(v=>({...v,effectiveDate:e.target.value}))}/></label>
        <label>URL resmi HTTPS<input type="url" required value={sourceForm.officialUrl} onChange={e=>setSourceForm(v=>({...v,officialUrl:e.target.value}))}/></label>
        <label>SHA-256 sumber<input value={sourceForm.sha256Checksum} onChange={e=>setSourceForm(v=>({...v,sha256Checksum:e.target.value}))} placeholder="64 karakter hex"/></label>
        <div className="form-actions"><button className="primary-button" disabled={busy}>Tambah sumber sebagai draft</button></div>
      </form>}
      <div className="activity-list">{sources.map(s=><div className="activity-item" key={s.id}><div className="activity-copy"><strong>{s.title}</strong><span>{s.sourceId} · {s.issuingAuthority} · {s.jurisdiction}</span><small>{s.verificationStatus} · {s.officialUrl||"URL belum tersedia"}</small></div>{canSourceManage&&["pending","reviewed"].includes(s.verificationStatus)&&<button className="secondary-button" disabled={busy||s.createdBy===activeUser?.id} onClick={()=>void reviewSource(s)}>Verify (independent)</button>}</div>)}{!sources.length&&<p className="muted">Belum ada sumber yang dapat ditampilkan.</p>}</div>
    </section>}
    {canRuleView&&<section className="card">
      <h3>Regulatory Rules & Version Lifecycle</h3>{versionTarget&&<p className="muted">Membuat versi baru untuk rule {versionTarget}. Versi efektif saat ini tetap berlaku sampai versi baru diaktifkan.</p>}
      {canRuleManage&&<form className="form-grid" onSubmit={submitRule}>
        <label>Rule code<input required value={ruleForm.ruleCode} onChange={e=>setRuleForm(v=>({...v,ruleCode:e.target.value}))}/></label>
        <label>Judul<input required value={ruleForm.title} onChange={e=>setRuleForm(v=>({...v,title:e.target.value}))}/></label>
        <label>Jurisdiksi<select value={ruleForm.jurisdiction} onChange={e=>setRuleForm(v=>({...v,jurisdiction:e.target.value}))}><option value="CN">China</option><option value="PK">Pakistan</option><option value="ID">Indonesia</option><option value="GLOBAL">Global</option></select></label>
        <label>Subjek<select value={ruleForm.subjectType} onChange={e=>setRuleForm(v=>({...v,subjectType:e.target.value}))}><option value="shipment">Shipment</option><option value="product">Product</option><option value="project">Project</option><option value="all">All</option></select></label>
        <label>Source ID<input required value={ruleForm.sourceId} onChange={e=>setRuleForm(v=>({...v,sourceId:e.target.value}))} placeholder="UUID regulatory_sources"/></label>
        <label>Outcome<select value={ruleForm.outcome} onChange={e=>setRuleForm(v=>({...v,outcome:e.target.value}))}><option value="require">Require</option><option value="prohibit">Prohibit</option><option value="allow">Allow</option><option value="manual_review">Manual review</option><option value="informational">Informational</option></select></label>
        <label>Effective from<input type="date" required value={ruleForm.effectiveFrom} onChange={e=>setRuleForm(v=>({...v,effectiveFrom:e.target.value}))}/></label>
        <label>Ringkasan<textarea required value={ruleForm.summary} onChange={e=>setRuleForm(v=>({...v,summary:e.target.value}))}/></label>
        <label>Conditions JSON<textarea rows={4} value={ruleForm.conditions} onChange={e=>setRuleForm(v=>({...v,conditions:e.target.value}))}/></label>
        <label>Required documents JSON<textarea rows={4} value={ruleForm.documents} onChange={e=>setRuleForm(v=>({...v,documents:e.target.value}))}/></label>
        <div className="form-actions"><button className="primary-button" disabled={busy}>Create draft rule version</button></div>
      </form>}
      {canRuleManage&&<label>Alasan penolakan versi rule<input value={ruleReviewReason} onChange={e=>setRuleReviewReason(e.target.value)}/></label>}<div className="activity-list">{rules.map(r=><div className="activity-item" key={r.id}><div className="activity-copy"><strong>{r.rule_code} · {r.title}</strong><span>{r.jurisdiction} · {r.subject_type} · {r.status}</span><small>v{r.version_number||"—"} · {r.version_status||"no active version"} · Source: {r.source_id||"—"}</small></div>{canRuleManage&&r.version_id&&<div className="form-actions"><button className="secondary-button" disabled={busy||r.version_status!=="draft"} onClick={()=>void transitionRule(r.version_id,"submit-review")}>Submit review</button><button className="secondary-button" disabled={busy||r.version_status!=="under_review"||r.version_created_by===activeUser?.id} onClick={()=>void transitionRule(r.version_id,"approve")}>Approve</button><button className="secondary-button" disabled={busy||r.version_status!=="under_review"||r.version_created_by===activeUser?.id} onClick={()=>void transitionRule(r.version_id,"reject")}>Reject</button><button className="secondary-button" disabled={busy||r.version_status!=="approved"} onClick={()=>void transitionRule(r.version_id,"activate")}>Activate</button></div>}{canRuleManage&&<button className="secondary-button" disabled={busy} onClick={()=>{setVersionTarget(r.id);setRuleForm(v=>({...v,ruleCode:r.rule_code,title:r.title,jurisdiction:r.jurisdiction,subjectType:r.subject_type,sourceId:"",outcome:r.outcome||"require",summary:r.rule_summary||""}));}}>New version</button>}</div>)}{!rules.length&&<p className="muted">Belum ada rule yang dapat ditampilkan.</p>}</div>
    </section>}
    {canDocView&&<section className="card">
      <h3>Export Document Catalog & Country Requirements</h3>
      {canDocManage&&<><form className="form-grid" onSubmit={submitDocType}>
        <label>Document code<input required value={docForm.documentCode} onChange={e=>setDocForm(v=>({...v,documentCode:e.target.value.toUpperCase()}))}/></label>
        <label>Nama dokumen<input required value={docForm.documentName} onChange={e=>setDocForm(v=>({...v,documentName:e.target.value}))}/></label>
        <label>Kategori<input required value={docForm.documentCategory} onChange={e=>setDocForm(v=>({...v,documentCategory:e.target.value}))}/></label>
        <label>Deskripsi<input value={docForm.description} onChange={e=>setDocForm(v=>({...v,description:e.target.value}))}/></label>
        <div className="form-actions"><button className="primary-button" disabled={busy}>Tambah document type</button></div>
      </form><form className="form-grid" onSubmit={submitCountryRequirement}>
        <label>Negara tujuan<select value={countryForm.countryCode} onChange={e=>setCountryForm(v=>({...v,countryCode:e.target.value}))}><option value="CN">China</option><option value="PK">Pakistan</option><option value="ID">Indonesia</option></select></label>
        <label>Document code<select required value={countryForm.documentCode} onChange={e=>setCountryForm(v=>({...v,documentCode:e.target.value}))}><option value="">Pilih dokumen</option>{docTypes.filter(d=>d.is_active).map(d=><option key={d.id} value={d.document_code}>{d.document_code} · {d.document_name}</option>)}</select></label>
        <label>Verified source UUID<input required value={countryForm.regulatorySourceId} onChange={e=>setCountryForm(v=>({...v,regulatorySourceId:e.target.value}))}/></label>
        <label>Effective from<input type="date" required value={countryForm.effectiveFrom} onChange={e=>setCountryForm(v=>({...v,effectiveFrom:e.target.value}))}/></label>
        <label>Importing authority<input value={countryForm.importingAuthority} onChange={e=>setCountryForm(v=>({...v,importingAuthority:e.target.value}))}/></label>
        <label>Official source URL<input type="url" value={countryForm.officialSourceUrl} onChange={e=>setCountryForm(v=>({...v,officialSourceUrl:e.target.value}))}/></label>
        <label><input type="checkbox" checked={countryForm.mandatory} onChange={e=>setCountryForm(v=>({...v,mandatory:e.target.checked}))}/> Mandatory</label>
        <label>Notes<input value={countryForm.notes} onChange={e=>setCountryForm(v=>({...v,notes:e.target.value}))}/></label>
        <div className="form-actions"><button className="primary-button" disabled={busy}>Tambah country requirement draft</button></div>
      </form></>}
      <div className="activity-list">{countryReqs.map(r=><div className="activity-item" key={r.id}><div className="activity-copy"><strong>{r.country_code} · {r.document_code} · {r.document_name}</strong><span>{r.status} / {r.verification_status} · v{r.version_no}</span><small>Source: {r.source_id||"—"} · berlaku {String(r.effective_from||"").slice(0,10)}</small></div>{canDocManage&&["pending","reviewed"].includes(r.verification_status)&&<button className="secondary-button" disabled={busy||r.created_by===activeUser?.id||!r.regulatory_source_id} onClick={()=>void reviewCountryRequirement(r.id)}>Verify (independent)</button>}</div>)}{!countryReqs.length&&<p className="muted">Belum ada country requirement.</p>}</div>
      <p className="muted">{docTypes.length} document types · {countryReqs.length} country requirements</p>
    </section>}
    {canSourceView&&<section className="card"><h3>Regulatory Audit Trail</h3><div className="activity-list">{auditEvents.map(a=><div className="activity-item" key={a.id}><div className="activity-copy"><strong>{a.action} · {a.target_type}</strong><span>{a.reason}</span><small>{a.actor_user_id} · {new Date(a.occurred_at).toLocaleString()}</small></div></div>)}{!auditEvents.length&&<p className="muted">Belum ada aktivitas Regulatory Core.</p>}</div></section>}
    {canAssess&&<section className="card"><h3>Riwayat Regulatory Assessment</h3><div className="activity-list">{assessments.map(a=><div className="activity-item" key={a.id}><div className="activity-copy"><strong>{a.destination_country||"—"} · {a.overall_status}</strong><span>Shipment {a.shipment_id} · {String(a.assessment_date).slice(0,10)}</span><small>Failed: {a.failed_count} · Pending: {a.pending_count} · Assessed by: {a.assessed_by}</small></div><button className="secondary-button" onClick={()=>void openAssessment(a.id)}>Detail / review</button></div>)}{!assessments.length&&<p className="muted">Belum ada assessment untuk Project aktif.</p>}</div>
      {assessmentDetail?.assessment&&<div className="assessment-review"><h4>Assessment detail · {assessmentDetail.assessment.overall_status}</h4><p className="muted">Assessment maker: {assessmentDetail.assessment.assessed_by}. Maker tidak boleh menjadi reviewer.</p><label>Alasan review<input value={reviewReason} onChange={e=>setReviewReason(e.target.value)} /></label>{(assessmentDetail.results||[]).map((r:AnyRecord)=><div className="activity-item" key={r.id}><div className="activity-copy"><strong>{r.rule_code} · v{r.version_number} · {r.result_status}</strong><span>{r.reason_code}: {r.reason}</span><small>Source: {r.source_id} · {r.source_title} · {r.official_url}</small></div>{["pending","manual_review"].includes(r.result_status)&&<div className="form-actions"><button className="secondary-button" disabled={busy||assessmentDetail.assessment.assessed_by===activeUser?.id} onClick={()=>void reviewAssessment(r.id,"pass")}>Mark pass</button><button className="secondary-button" disabled={busy||assessmentDetail.assessment.assessed_by===activeUser?.id} onClick={()=>void reviewAssessment(r.id,"fail")}>Mark fail</button><button className="secondary-button" disabled={busy||assessmentDetail.assessment.assessed_by===activeUser?.id} onClick={()=>void reviewAssessment(r.id,"not_applicable")}>Not applicable</button></div>}</div>)}</div>}
    </section>}
  </section>;
}
