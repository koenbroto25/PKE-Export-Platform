import React from 'react';
import { Link } from 'react-router-dom';
import { UXPanel, UXMetric, UXStateBadge, UXFreshness, UXEmpty, UXError } from './UXFoundation';
import './UXFoundation.css';

type Row = Record<string, any>;
export default function AdminControlCenter({ portfolio, projects, workItems, selectedProjectId, loading, errors, freshness, refresh }: {
  portfolio?: Row; projects?: Row[]; workItems?: Row[]; selectedProjectId?: string;
  loading?: boolean; errors?: string[]; freshness?: string | null; refresh?: () => void;
}) {
  const projectSourceAvailable = Array.isArray(projects);
  const projectRows = projectSourceAvailable ? projects : [];
  const taskSourceAvailable = Array.isArray(workItems);
  const tasks = workItems || [];
  const overdue = tasks.filter(t => t.is_overdue === true);
  const blocked = tasks.filter(t => t.status === 'blocked');
  const unassigned = tasks.filter(t => !t.assignee_user_id && ['open','in_progress','blocked','submitted'].includes(t.status));
  const exceptionRows = tasks.filter(t => t.is_overdue === true || t.status === 'blocked' || (!t.assignee_user_id && ['open','in_progress','blocked','submitted'].includes(t.status)));
  const uniqueExceptions = Array.from(new Map(exceptionRows.map(t => [String(t.id || t.title || JSON.stringify(t)), t])).values())
    .sort((a,b) => Number(b.is_overdue===true)-Number(a.is_overdue===true) || Number(b.status==='blocked')-Number(a.status==='blocked'));
  const exceptionCount = uniqueExceptions.length;
  const activeCount = portfolio?.activeProjects ?? (projectSourceAvailable && projectRows.every(p => typeof p.status === 'string') ? projectRows.filter(p => p.status === 'active').length : '—');
  const projectVolumeKnown = projectSourceAvailable && projectRows.every(p => p.target_quantity !== null && p.target_quantity !== undefined && Number.isFinite(Number(p.target_quantity)));
  const volume = portfolio?.contractVolume ?? (projectVolumeKnown ? projectRows.reduce((n,p)=>n+Number(p.target_quantity),0) : '—');
  const hasPortfolio = portfolio && Object.keys(portfolio).length > 0;
  return <div className="admin-control-center">
    <UXPanel title="Admin Control Center" subtitle="Portfolio oversight, governance entry points, and verified operational attention. Unknown indicators are not treated as healthy." action={<button className="secondary-button" onClick={refresh} disabled={loading}>Refresh</button>}>
      {errors?.length ? <UXError title="Sebagian sumber tidak dapat diverifikasi" detail={errors.join(' · ')} retry={refresh}/> : null}
      {loading && <div className="muted">Memuat sumber portofolio…</div>}
      <div className="ux-metric-grid">
        <UXMetric label="Project terlihat" value={projectSourceAvailable ? projectRows.length : '—'} detail="API /projects" state={projectSourceAvailable ? 'available' : 'unknown'}/>
        <UXMetric label="Project aktif" value={activeCount ?? '—'} detail="Status portfolio / project" state={hasPortfolio ? 'available' : projectSourceAvailable ? 'partial' : 'unknown'}/>
        <UXMetric label="Target volume" value={Number.isFinite(Number(volume)) ? Number(volume).toLocaleString('id-ID')+' MT' : '—'} detail="Target agregat, bukan volume aktual" state={hasPortfolio || projectVolumeKnown ? 'available' : 'unknown'}/>
        <UXMetric label="Task exception" value={taskSourceAvailable ? exceptionCount : '—'} detail={taskSourceAvailable ? overdue.length+' overdue · '+blocked.length+' blocked · '+unassigned.length+' unassigned' : 'Task source belum dapat diverifikasi'} state={taskSourceAvailable ? (overdue.length+blocked.length+unassigned.length ? 'partial':'available') : 'unknown'}/>
      </div>
      <UXFreshness source="Portfolio API" value={freshness}/>
    </UXPanel>
    <UXPanel title="Prioritas tindakan Admin" subtitle="Shortcut menuju sumber resmi untuk melakukan review atau tindakan; panel ini tidak mengubah status governance secara otomatis.">
      <div className="ux-exception-list">
        <div className="ux-exception ux-exception-critical"><div className="ux-exception-copy"><strong>Review akses & role governance</strong><span>Periksa akun, membership, role aktif/expired, penunjukan PM, dan status provisioning.</span></div><Link className="ux-action-link" to="/access">Buka Access →</Link></div>
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Portfolio & project lifecycle</strong><span>Review project status, target, owner, dan konfigurasi. Data PM assignment tidak diasumsikan jika belum disediakan sumber.</span></div><Link className="ux-action-link" to="/projects">Buka Projects →</Link></div>
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Operational task exceptions {selectedProjectId ? '(Project terpilih)' : '(scope task tersedia)'}</strong><span>{workItems ? overdue.length+' overdue · '+blocked.length+' blocked · '+unassigned.length+' belum ditugaskan' : 'Task source belum dapat diverifikasi.'}</span></div><Link className="ux-action-link" to="/my-work">Buka Work Queue →</Link></div>
        <div className="ux-exception"><div className="ux-exception-copy"><strong>Reports & portfolio risk</strong><span>Finance, compliance, committed/actual cost, dan risk metrics hanya ditampilkan jika API memberikan angka.</span></div><Link className="ux-action-link" to="/reports">Buka Reports →</Link></div>
      </div>
    </UXPanel>
      <UXPanel title="Actionable task exceptions" subtitle="Distinct work items; an item may have more than one exception reason.">
        {taskSourceAvailable && uniqueExceptions.length === 0 ? <UXEmpty title="Tidak ada exception dari task source" description="Ini hanya mencerminkan task yang berhasil dimuat; tidak menggantikan audit atau monitoring operasional."/> : null}
        {!taskSourceAvailable ? <UXStateBadge state="unknown" label="Task source belum terverifikasi"/> : null}
        {taskSourceAvailable && uniqueExceptions.length > 0 ? <div className="ux-exception-list">{uniqueExceptions.slice(0,8).map(t=>{
          const reasons=[t.is_overdue===true?'Overdue':null,t.status==='blocked'?'Blocked':null,!t.assignee_user_id&&['open','in_progress','blocked','submitted'].includes(t.status)?'Unassigned':null].filter(Boolean);
          return <div className={`ux-exception ${t.is_overdue===true||t.status==='blocked'?'ux-exception-critical':''}`} key={t.id||t.title}>
            <div className="ux-exception-copy"><strong>{t.title||'Task tanpa judul'}</strong><span>{reasons.join(' · ')} · Status: {t.status||'unknown'}</span><small>{t.id||'ID tidak tersedia'}{t.due_at?' · Due: '+t.due_at:''}</small></div>
            <Link className="ux-action-link" to="/my-work">Review task →</Link>
          </div>;
        })}</div> : null}
        {uniqueExceptions.length>8 ? <p className="muted">Menampilkan 8 dari {uniqueExceptions.length} task exception unik. Buka Work Queue untuk daftar lengkap.</p> : null}
      </UXPanel>
    <UXPanel title="Project attention list" subtitle="Project yang dapat diakses API. Belum ada auto-judgement kesiapan operasional.">
      {projectSourceAvailable && projectRows.length ? <div className="ux-exception-list">{projectRows.slice(0,8).map((p,index)=><div className="ux-exception" key={p.id || p.name || index}><div className="ux-exception-copy"><strong>{p.name || 'Project tanpa nama'}</strong><span>Status: {p.status || 'unknown'} · Target: {p.target_quantity ?? '—'} {p.settlement_unit || 'MT'}</span><small>{p.id || 'ID tidak tersedia'}</small></div>{typeof p.id === 'string' && p.id ? <Link className="ux-action-link" to={'/projects/'+encodeURIComponent(p.id)}>Review →</Link> : <span className="ux-stage-meta">ID Project tidak tersedia</span>}</div>)}</div> : projectSourceAvailable && projectRows.length===0 ? <UXEmpty title="Belum ada project dalam source" description="Project list API terverifikasi mengembalikan nol record."/> : <UXStateBadge state="unknown" label="Project source belum terverifikasi"/>}
    </UXPanel>
    <div className="ux-exception-list">
      <UXPanel title="Security & governance"><p className="muted">Review wajib tetap melalui Access page dan API audit. Panel tidak menyimpulkan akun/membership sehat tanpa hasil audit.</p><UXStateBadge state="unknown" label="Audit status belum dihitung"/><Link className="ux-action-link" to="/access">Review governance →</Link></UXPanel>
      <UXPanel title="Integration & source health"><p className="muted">Health, provider freshness, rights/licensing, sync receipts dan service availability harus bersumber dari monitoring resmi.</p><UXStateBadge state="unavailable" label="Monitoring terpusat belum terverifikasi"/><Link className="ux-action-link" to="/reports">Lihat reports →</Link></UXPanel>
    </div>
  </div>;
}
