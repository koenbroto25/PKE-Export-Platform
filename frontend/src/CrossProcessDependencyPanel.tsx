import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PKE_PROCESS_DEPENDENCIES } from '../../src/knowledge/process-dependency-map';
import { get } from './api';
import { UXPanel, UXStateBadge, UXEmpty, UXError, UXLoading } from './UXFoundation';
import './UXFoundation.css';

const ROUTES:Record<string,string>={contracts:'/contracts',supply:'/pks-sites',production:'/operations',quality:'/p1-workflows',inventory:'/warehouse',transport:'/shipment-allocations',port:'/port-network',loading:'/maritime-operations',documents:'/compliance',customs:'/compliance',voyage:'/maritime-operations',settlement:'/finance'};
const PAGE:Record<string,string>={contracts:'contracts',supply:'pks-sites',production:'operations',quality:'p1-workflows',inventory:'warehouse',transport:'shipment-allocations',port:'port-network',loading:'maritime-operations',documents:'compliance',customs:'compliance',voyage:'maritime-operations',settlement:'finance'};
const LABELS:Record<string,string>={contract:'Contract',supply:'Supply / PKS',production:'Production',quality:'QA / QC',inventory:'Warehouse / Lot',transport:'Transport',port:'Port / Terminal',loading:'Loading / Survey',documents:'Export Documents',customs:'Customs',voyage:'Voyage / Shipment',settlement:'Finance / Settlement'};
type Summary=Record<string,any>;
type ApiResponse={mode:string;dataSource:string;liveIntegration:boolean;authorityDecision:boolean;summaries:Summary[]};
export default function CrossProcessDependencyPanel({projectId,allowedPages=[]}:{projectId:string;allowedPages?:string[]}){
 const [result,setResult]=useState<ApiResponse|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const [filter,setFilter]=useState<'all'|'gap'|'blocked'|'stale'|'unknown'|'satisfied'>('all');
 useEffect(()=>{
  let alive=true;
  if(!projectId){setResult(null);setError('Project belum dipilih.');return;}
  setLoading(true);setError('');
  get<ApiResponse>(`/projects/${encodeURIComponent(projectId)}/dependency-summaries?mode=demo`)
   .then(data=>{if(alive)setResult(data);})
   .catch(e=>{if(alive){setResult(null);setError(e instanceof Error?e.message:'Dependency summary tidak dapat dimuat.');}})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[projectId,revision]);
 const summaries=new Map((result?.summaries||[]).map(s=>[s.dependencyId,s]));
 const visibleDependencies=useMemo(()=>PKE_PROCESS_DEPENDENCIES.filter(d=>summaries.has(d.id)&&(filter==='all'||summaries.get(d.id)?.status===filter)),[result,filter]);
 const counts=useMemo(()=>{const values=result?.summaries||[];return {total:values.length,gap:values.filter(s=>s.status==='gap').length,blocked:values.filter(s=>s.status==='blocked').length,stale:values.filter(s=>s.status==='stale').length,unknown:values.filter(s=>s.status==='unknown'||s.freshness==='unknown').length,satisfied:values.filter(s=>s.status==='satisfied').length};},[result]);
 const canOpen=(stage:string)=>allowedPages.includes(PAGE[stage]||'');
 const statusState=(status:string):'available'|'partial'|'stale'|'unavailable'|'blocked'|'unknown'=>status==='satisfied'?'available':status==='gap'?'partial':status==='stale'?'stale':status==='blocked'?'blocked':status==='not-applicable'?'unavailable':'unknown';
 return <UXPanel title="Cross-process dependency map" subtitle="Status ringkasan evidence antarproses. Panel ini saat ini menggunakan adapter demo sintetis, bukan live readiness." action={<button type="button" className="secondary-button" onClick={()=>setRevision(v=>v+1)} disabled={loading}>{loading?'Memuat…':'Refresh'}</button>}>
  <div className="ux-dependency-provenance" role="status"><strong>DEMO / SYNTHETIC</strong><span>Live integration: tidak aktif. Evidence kosong dan freshness unknown; ini bukan status kesiapan atau approval.</span></div>
  {loading?<UXLoading label="Memuat dependency summary…"/>:error?<UXError title="Dependency summary belum dapat dimuat" detail="Periksa akses Project atau coba refresh. Detail sumber tidak ditampilkan." retry={()=>setRevision(v=>v+1)}/>:!result?.summaries?.length?<UXEmpty title="Tidak ada dependency yang dapat ditampilkan" description="Permission source-workspace mungkin belum tersedia untuk role Anda, atau adapter demo belum memberi data."/>:
  {result?.summaries?.length>0&&<div className="ux-dependency-summary-stats"><div><strong>{counts.total}</strong><span>Edges visible</span></div><div><strong>{counts.gap}</strong><span>Evidence gaps</span></div><div><strong>{counts.blocked}</strong><span>Blocked</span></div><div><strong>{counts.stale}</strong><span>Stale</span></div><div><strong>{counts.unknown}</strong><span>Unknown freshness/state</span></div><div><strong>{counts.satisfied}</strong><span>Evidence complete</span></div></div>}
  {result?.summaries?.length>0&&<div className="ux-dependency-filter"><label htmlFor="dependency-status-filter">Filter status</label><select id="dependency-status-filter" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All edges</option><option value="gap">Evidence gap</option><option value="blocked">Blocked</option><option value="stale">Stale</option><option value="unknown">Unknown</option><option value="satisfied">Evidence complete</option></select><span>{visibleDependencies.length} of {counts.total} shown</span></div>}
  {result?.summaries?.length>0&&visibleDependencies.length===0&&<UXEmpty title="No dependency matches this filter" description="Change the status filter to see other lifecycle dependencies."/>}
  <div className="ux-dependency-list">{visibleDependencies.map(d=>{
   const summary=summaries.get(d.id)!;
   return <article className="ux-dependency" key={d.id}>
    <div className="ux-dependency-flow">{canOpen(d.from)?<Link to={ROUTES[d.from]||'/'}>{LABELS[d.from]||d.from}</Link>:<span>{LABELS[d.from]||d.from}</span>}<span aria-hidden="true">→</span>{canOpen(d.to)?<Link to={ROUTES[d.to]||'/'}>{LABELS[d.to]||d.to}</Link>:<span>{LABELS[d.to]||d.to}</span>}</div>
    <div className="ux-dependency-meta"><UXStateBadge state={statusState(summary.status)} label={summary.status}/><span className="ux-dependency-strength">{d.strength}</span><span>Freshness: {summary.freshness}</span></div>
    <div className="ux-dependency-evidence"><strong>Evidence gap ({summary.missingEvidenceCount})</strong>{summary.evidenceLabels?.length?<ul>{summary.evidenceLabels.map((e:string)=><li key={e}>{e}</li></ul>:<p>Evidence belum diverifikasi.</p>}</div>
    <div className="ux-dependency-risk"><strong>Next action</strong><p>{summary.safeNextAction}</p>{summary.reasons?.length>0&&<small>{summary.reasons.join(' · ')}</small>}</div>
    <div className="ux-dependency-ai"><strong>AI assistance (non-approval)</strong><span>{d.aiAssist.join(' · ')}</span><small>Decision owner: {d.ownerRole}. Human decision: {d.humanDecision}</small></div>
   </article>;
  })}</div>}
 </UXPanel>;
}
