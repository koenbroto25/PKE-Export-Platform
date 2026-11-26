import React,{useMemo,useState}from"react";
import{createReviewItem,transitionReviewItem,summarizeReviewQueue,type ReviewItem,type ReviewActor,type ReviewDecision}from"../../src/knowledge/knowledge-review-queue";
import{UXPanel,UXStateBadge,UXEmpty}from"./UXFoundation";
import"./UXFoundation.css";
const NOW="2026-11-26T12:00:00Z";
const demoActor:ReviewActor={id:"demo-human-reviewer",projectId:"demo-project",permissions:["knowledge.review.view","knowledge.review.decide"],isHuman:true};
const seed:ReviewItem[]=[
createReviewItem({id:"KREV-001",projectId:"demo-project",dependencyId:"DEP-QUALITY-WAREHOUSE",findingKind:"missing-evidence",severity:"warning",sourceIds:["SRC-QC"],evidenceRecordIds:["EV-QC-01"],provenance:["Synthetic fixture: QC sample record"],summary:"QC result exists, but explicit lot release evidence is missing.",aiSuggestion:"Check lot identity, hold state and authorized release record; do not infer release."},NOW),
createReviewItem({id:"KREV-002",projectId:"demo-project",dependencyId:"DEP-LOADING-DOCUMENTS",findingKind:"quantity-mismatch",severity:"error",sourceIds:["SRC-TALLY","SRC-SURVEY"],evidenceRecordIds:["EV-TALLY-02","EV-SURVEY-02"],provenance:["Synthetic fixture: loading tally 10 MT","Synthetic fixture: survey 9.6 MT"],summary:"Two synthetic quantity records disagree; basis comparison has not been confirmed.",aiSuggestion:"Retain both values and check net/gross basis, time, source authority and correction trail."},NOW),
createReviewItem({id:"KREV-003",projectId:"demo-project",dependencyId:"DEP-PORT-VOYAGE",findingKind:"stale",severity:"warning",sourceIds:["SRC-PORT"],evidenceRecordIds:["EV-PORT-03"],provenance:["Synthetic fixture: suitability review date"],summary:"Port suitability observation is outside its configured freshness window.",aiSuggestion:"Refresh source observation and review port/terminal scope before operational use."},NOW)
];
const statusLabel:Record<string,string>={open:"Open",assigned:"Assigned",verified:"Human reviewed",rejected:"Rejected by reviewer",deferred:"Deferred"};
export default function KnowledgeReviewQueuePanel(){
 const[items,setItems]=useState(seed);const[selected,setSelected]=useState(items[0].id);const[note,setNote]=useState("");const[assignee,setAssignee]=useState("demo-human-reviewer");const[message,setMessage]=useState("");
 const scoped=useMemo(()=>items.filter(i=>i.projectId===demoActor.projectId),[items]);const current=scoped.find(i=>i.id===selected)||scoped[0];
 const summary=summarizeReviewQueue(scoped,demoActor.projectId,demoActor);
 const act=(decision:ReviewDecision)=>{if(!current)return;const result=transitionReviewItem({item:current,actor:demoActor,decision,at:new Date().toISOString(),note,assignTo:assignee});if(!result.ok){setMessage(result.message||"Transition ditolak.");return;}setItems(prev=>prev.map(i=>i.id===current.id?result.item!:i));setMessage("Perubahan simulasi diterapkan di state browser; tidak tersimpan ke server.");setNote("");};
 return <UXPanel title="Knowledge Review Queue — Demo" subtitle="Review sumber/evidence sintetis. Aksi hanya state browser demo; tidak mengubah data operasional atau memberikan approval.">
 <div className="ux-dependency-provenance" role="status"><strong>DEMO / SYNTHETIC</strong><span>Human review boundary: AI suggestion bukan keputusan. Tidak ada API persistence atau audit backend.</span></div>
 <div className="ux-metric-grid"><div><strong>{summary.open}</strong><span>Open</span></div><div><strong>{summary.assigned}</strong><span>Assigned</span></div><div><strong>{summary.verified}</strong><span>Reviewed</span></div><div><strong>{summary.rejected}</strong><span>Rejected</span></div><div><strong>{summary.deferred}</strong><span>Deferred</span></div></div>
 {!current?<UXEmpty title="Queue kosong" description="Tidak ada item demo."/>:<div className="ux-review-queue-grid">
 <nav aria-label="Review item list" style={{display:"grid",gap:".5rem",alignContent:"start"}}>{scoped.map(item=><button type="button" key={item.id} onClick={()=>{setSelected(item.id);setNote("");setMessage("");}} className={selected===item.id?"primary-button":"secondary-button"} style={{textAlign:"left",whiteSpace:"normal"}}><strong>{item.id}</strong><span style={{display:"block"}}>{item.findingKind} · {statusLabel[item.status]}</span></button>)}</nav>
 <section aria-labelledby="review-detail-heading"><h3 id="review-detail-heading">{current.summary}</h3><p><strong>Dependency:</strong> {current.dependencyId}</p><p><strong>Finding:</strong> {current.findingKind} · {current.severity}</p><UXStateBadge state={current.status==="verified"?"available":current.status==="rejected"?"blocked":current.status==="deferred"?"partial":"unknown"} label={statusLabel[current.status]}/>
 <h4>Provenance</h4><ul>{current.provenance.map((p,i)=><li key={i}>{p}</li>)}</ul><h4>Evidence references</h4><p>{current.evidenceRecordIds.join(", ")||"No evidence reference"}</p><h4>AI suggestion (non-authoritative)</h4><p>{current.aiSuggestion||"No suggestion."}</p>
 <label htmlFor="review-note">Human review note (required for verify/reject/defer)</label><textarea id="review-note" value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{width:"100%",margin:"0.5rem 0"}}/>
 <label htmlFor="review-assignee">Assign to (demo reviewer ID)</label><input id="review-assignee" value={assignee} onChange={e=>setAssignee(e.target.value)} style={{width:"100%",margin:"0.5rem 0"}}/>
 <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}><button type="button" className="secondary-button" onClick={()=>act("assign")}>Assign</button><button type="button" className="secondary-button" onClick={()=>act("verify")}>Mark human-reviewed</button><button type="button" className="secondary-button" onClick={()=>act("reject")}>Reject evidence</button><button type="button" className="secondary-button" onClick={()=>act("defer")}>Defer</button></div>
 {message&&<p role="status">{message}</p>}{current.decisionNote&&<p><strong>Last demo note:</strong> {current.decisionNote}</p>}
 </section></div>}
 </UXPanel>;
}
