import React from 'react';
import { Link } from 'react-router-dom';
import { UXPanel, UXMetric, UXStateBadge, UXFreshness, UXEmpty } from './UXFoundation';
import './UXFoundation.css';

type Row = Record<string, any>;
type SourceBlock = { rows?: Row[]; loading?: boolean; error?: string; label: string; available?: boolean; authorized?: boolean };
const stages = [
  { name:'Contract & Buyer', key:'contracts', page:'contracts', description:'Contract, buyer terms, quantity, pricing, and contract program.', link:'/contracts' },
  { name:'Supply & PKS', key:'supply', page:'pks-sites', description:'PKS participation, capacity, delivery commitments, and source traceability.', link:'/pks-sites' },
  { name:'Production', key:'production', page:'operations', description:'Production batches, genealogy, output, and yield are not confirmed by project metadata.', link:'/operations' },
  { name:'QA & Lab Release', key:'qa', page:'operations', description:'Quality checks, laboratory evidence, hold/release decision, and specification comparison.', link:'/operations' },
  { name:'Warehouse', key:'warehouse', page:'warehouse', description:'Inventory lots, quality status, reservations, and availability.', link:'/warehouse' },
  { name:'Allocation & Transport', key:'transport', page:'shipment-allocations', description:'Shipment allocation, dispatch, truck checkpoints, ETA, and handover.', link:'/shipment-allocations' },
  { name:'Port & Terminal', key:'port', page:'port-network', description:'Port suitability, berth/terminal readiness, vessel call, and source freshness.', link:'/port-network' },
  { name:'Loading & Survey', key:'loading', page:'maritime-operations', description:'Loading events, tally, survey, quantity reconciliation, and sign-off.', link:'/maritime-operations' },
  { name:'Export Documents', key:'documents', page:'compliance', description:'Checklist, document versions, evidence, expiry, and cross-checks.', link:'/compliance' },
  { name:'Shipment & Voyage', key:'voyage', page:'maritime-operations', description:'Vessel/voyage, shipment status, and independent source confirmation.', link:'/maritime-operations' },
  { name:'Finance & Settlement', key:'finance', page:'finance', description:'Budget, obligations, cash planning, FX, AP/AR, and settlement evidence.', link:'/finance' },
];
export default function PMProject360({ project, sources, projectId, freshness, allowedPages }: { project?: Row; sources: Record<string,SourceBlock>; projectId: string; freshness?: string | null; allowedPages: string[] }) {
  const sourceRows = (key:string) => sources[key]?.rows || [];
  const canOpen = (page:string) => allowedPages.includes(page);
  const contracts=sourceRows('contracts'), programs=sourceRows('programs'), tasks=sourceRows('tasks'), lots=sourceRows('inventory'), trips=sourceRows('trips'), docs=sourceRows('documents'), requirements=sourceRows('requirements');
  const allErrors=Object.values(sources).filter(s=>s.error).map(s=>s.label+': '+s.error);
  const evidenceSummary = [
    {label:'Contract',count:contracts.length+programs.length,key:'contracts'},
    {label:'Task / blocker',count:tasks.length,key:'tasks'},
    {label:'Inventory lot',count:lots.length,key:'inventory'},
    {label:'Transport trip',count:trips.length,key:'trips'},
    {label:'Document',count:docs.length+requirements.length,key:'documents'},
  ];
  const sourceState=(key:string):'available'|'partial'|'unavailable'|'unknown' => {
    const s=sources[key]; if(!s) return 'unknown'; if(s.error) return 'unknown'; if(s.authorized===false) return 'unknown'; if(s.available===false) return 'unavailable'; return (s.rows?.length||0)>0?'partial':'unknown';
  };
  return <div className="pm-project-360">
    <UXPanel title="PM Project 360" subtitle="Single-project lifecycle view. Record existence is evidence of data, not proof of stage approval or readiness." >
      <div className="ux-metric-grid">
        <UXMetric label="Project status" value={project?.status || 'Unknown'} detail="Project metadata" state={project?.status?'available':'unknown'}/>
        <UXMetric label="Contract target" value={project?.target_quantity != null ? Number(project.target_quantity).toLocaleString('id-ID')+' '+(project?.settlement_unit||'MT') : '—'} detail="Target baseline" state={project?.target_quantity!=null?'available':'unknown'}/>
        <UXMetric label="Task queue" value={tasks.length} detail="Work items returned by source" state={sources.tasks?.error?'unknown':sources.tasks?'available':'unknown'}/>
        <UXMetric label="Document evidence" value={docs.length+' / '+requirements.length} detail="Documents / requirements" state={sources.documents?.error||sources.requirements?.error?'unknown':'partial'}/>
      </div>
      <UXFreshness source="Project / related APIs" value={freshness}/>
      {allErrors.length>0 && <div className="inline-warning" role="status">Sebagian source gagal: {allErrors.join(' · ')}. Data dari source tersebut tidak digunakan untuk menyimpulkan kesiapan.</div>}
      <p className="source-note">Project ID: {projectId}. Tahap yang belum mempunyai integrasi verified akan ditandai, bukan dianggap selesai.</p>
    </UXPanel>
    <UXPanel title="Lifecycle & dependencies" subtitle="Klik tahap untuk membuka workspace terkait. Status disimpulkan hanya dari source yang diketahui; status approval tidak diinferensikan.">
      <div className="ux-stage-grid">{stages.map(stage=>{
        let sourceKey=stage.key;
        if(stage.key==='contracts') sourceKey='contracts';
        if(stage.key==='supply') sourceKey='supply';
        if(stage.key==='production'||stage.key==='qa'||stage.key==='port'||stage.key==='loading'||stage.key==='voyage'||stage.key==='finance') sourceKey=stage.key;
        const source=sources[sourceKey];
        const state: 'available'|'partial'|'unavailable'|'unknown' = source ? sourceState(sourceKey) : 'unavailable';
        const stateLabel=source?.loading?'Memuat source…':source?.authorized===false?'Akses source tidak tersedia untuk role ini':source?.available===false?'Belum terintegrasi':source?.error?'Tidak dapat diverifikasi':(source?.rows?.length||0)>0?'Record tersedia · review diperlukan':'Belum ada record / belum diverifikasi';
        return <article className="ux-stage" key={stage.key}><h3>{stage.name}</h3><UXStateBadge state={state} label={stateLabel}/><p>{stage.description}</p><div className="ux-stage-meta">{source?.loading?'Loading source…':source?.error?'Source error':source?.rows?.length!==undefined?'Records: '+source.rows.length:'No verified source'}</div>{canOpen(stage.page) ? <Link className="ux-action-link" to={stage.link}>Open workspace →</Link> : <span className="ux-stage-meta">Workspace access not granted</span>}</article>;
      })}</div>
    </UXPanel>
    <UXPanel title="Evidence snapshot" subtitle="Counts are source records only; no quality, quantity, release, or settlement conclusion is made from counts.">
      <div className="ux-metric-grid">{evidenceSummary.map(x=><UXMetric key={x.key} label={x.label} value={x.count} detail="Records found" state={sources[x.key]?.error?'unknown':sources[x.key]?'partial':'unknown'}/>)}</div>
      {!contracts.length&&!programs.length&&!tasks.length&&!lots.length&&!trips.length&&!docs.length&&!requirements.length && <UXEmpty title="Evidence belum tersedia" description="Source belum mengembalikan record. Ini tidak berarti tahap gagal atau lulus; status harus diverifikasi dari workspace sumber."/>}
    </UXPanel>
    <UXPanel title="PM next-action checklist" subtitle="Action links membuka source of truth. Keputusan approval dan sign-off tetap pada role/authority yang berwenang.">
      <div className="ux-exception-list">
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Review contract & supply baseline</strong><span>Konfirmasi buyer, contract program, target, PKS, kapasitas, dan delivery commitment.</span></div>{canOpen('contracts') ? <Link className="ux-action-link" to="/contracts">Review →</Link> : <span className="ux-stage-meta">Access not granted</span>}</div>
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Resolve task blockers and handoffs</strong><span>{tasks.filter(t=>t.status==='blocked').length} blocked task(s); {tasks.filter(t=>t.is_overdue===true).length} overdue task(s) in returned scope.</span></div>{canOpen('my-work') ? <Link className="ux-action-link" to="/my-work">Work queue →</Link> : <span className="ux-stage-meta">Access not granted</span>}</div>
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Verify inventory, allocation, transport</strong><span>Check lot status, allocation, checkpoints, ETA and discrepancy evidence.</span></div>{canOpen('operations') ? <Link className="ux-action-link" to="/operations">Operations →</Link> : <span className="ux-stage-meta">Access not granted</span>}</div>
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Document completeness & cross-check</strong><span>Checklist, required documents, versions, source consistency and deadlines.</span></div>{canOpen('compliance') ? <Link className="ux-action-link" to="/compliance">Compliance →</Link> : <span className="ux-stage-meta">Access not granted</span>}</div>
      </div>
    </UXPanel>
  </div>;
}
