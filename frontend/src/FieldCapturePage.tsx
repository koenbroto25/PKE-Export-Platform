import React, { useEffect, useState } from 'react';
import { get, post } from './api';
import { createFieldDraft, saveFieldDraft, listFieldDrafts, deleteFieldDraft, deleteFieldDrafts, saveFieldAssignmentCache, getFieldAssignmentCache, deleteFieldAssignmentCache, deleteFieldLocalDataForPrincipal, type FieldDraft } from '../../src/components/field/field-offline-queue';

type WorkItem = { id: string; title: string; description?: string | null; status: string; priority?: string; due_at?: string | null; assignee_user_id?: string | null; owner_role_code?: string };
type Props = { projectId: string; activeUser?: Record<string, any>; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void };

export default function FieldCapturePage({ projectId, activeUser, onNotice }: Props) {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [scope, setScope] = useState<'assigned' | 'project' | 'cached' | ''>('');
  const [tasksFromCache,setTasksFromCache]=useState(false);
  const [taskCacheAt,setTaskCacheAt]=useState('');
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [taskId, setTaskId] = useState('');
  const [kind, setKind] = useState('checkpoint');
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<{latitude:number;longitude:number;accuracy:number;capturedAt:string}|null>(null);
  const [file, setFile] = useState<File|null>(null);
  const [drafts, setDrafts] = useState<FieldDraft[]>([]);\n  const [serverSubmissions,setServerSubmissions]=useState<Record<string,any>[]>([]);\n  const [serverSubmissionError,setServerSubmissionError]=useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : false);

  const refreshDrafts = async () => {
    if (!activeUser?.id || !projectId) { setDrafts([]); return; }
    try { setDrafts(await listFieldDrafts(String(activeUser.id), projectId)); }
    catch (e) { onNotice('error', e instanceof Error ? e.message : 'Draft lokal tidak dapat dibaca.'); }
  };

  useEffect(() => {
    let alive = true;
    setWorkItems([]); setTaskId(''); setTaskError(''); setScope(''); setTasksFromCache(false); setTaskCacheAt('');
    if (!projectId || !activeUser?.id) return;
    setLoadingTasks(true);
    const load = async () => {
      try {
        const payload = await get<{workItems?:WorkItem[];scope?:string}>(`/projects/${encodeURIComponent(projectId)}/work-items`);
        if (!alive) return;
        const rows = Array.isArray(payload.workItems) ? payload.workItems : [];
        const activeRows = rows.filter(row => !['resolved','closed','cancelled'].includes(String(row.status||'').toLowerCase()));
        const visible = payload.scope === 'project' ? activeRows.filter(row => row.assignee_user_id === activeUser.id) : activeRows;
        setWorkItems(visible); setScope(payload.scope === 'project' ? 'project' : 'assigned');
        if (payload.scope === 'project') setTaskError('PM memiliki scope Project; Field Capture hanya menampilkan tugas yang ditugaskan secara eksplisit kepada akun ini.');
        try { await saveFieldAssignmentCache(String(activeUser.id),projectId,visible.map(({id,title,status,priority,due_at,assignee_user_id,owner_role_code})=>({id,title,status,priority,due_at,assignee_user_id,owner_role_code}))); } catch { /* server list remains usable if local cache write fails */ }
      } catch (e) {
        const cached = await getFieldAssignmentCache(String(activeUser.id),projectId).catch(()=>null);
        if (!alive) return;
        if (cached) {
          const activeRows=cached.assignments.filter(row=>!['resolved','closed','cancelled'].includes(String(row.status||'').toLowerCase()));
          setWorkItems(activeRows);setScope('cached');setTasksFromCache(true);setTaskCacheAt(cached.cachedAt);
          setTaskError('API tugas tidak tersedia. Daftar cache digunakan; Assignment tidak dapat diverifikasi ulang secara online.');
        } else { setWorkItems([]);setTaskError(e instanceof Error ? e.message : 'Daftar tugas gagal dimuat; cache offline tidak tersedia.'); }
      } finally { if (alive) setLoadingTasks(false); }
    };
    void load();
    return () => { alive = false; };
  }, [projectId, activeUser?.id]);

  const refreshServerSubmissions=async()=>{if(!projectId||!activeUser?.id||!online){setServerSubmissions([]);setServerSubmissionError('');return;}try{const payload=await get<{submissions?:Record<string,any>[]>('/projects/'+encodeURIComponent(projectId)+'/field-captures');setServerSubmissions(Array.isArray(payload.submissions)?payload.submissions:[]);setServerSubmissionError('');}catch(e){setServerSubmissions([]);setServerSubmissionError(e instanceof Error?e.message:'Receipt server belum dapat dimuat.');}};\n  useEffect(() => { void refreshDrafts();void refreshServerSubmissions(); }, [projectId, activeUser?.id,online]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const captureGps = () => {
    if (!navigator.geolocation) { onNotice('error','Browser tidak mendukung GPS.'); return; }
    navigator.geolocation.getCurrentPosition(position => setGps({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()}), error => onNotice('error',error.code===1?'Izin GPS ditolak.':error.code===2?'Lokasi tidak tersedia.':'Pengambilan GPS timeout/gagal.'), {enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
  const chooseEvidence = (selected: File|null) => {
    if (selected && (selected.size > 15*1024*1024 || !/^image\/(jpeg|png|webp)$/i.test(selected.type))) {
      setFile(null); onNotice('error','Bukti harus JPG/PNG/WebP maksimal 15 MB.'); return;
    }
    setFile(selected);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const selected = workItems.find(item => item.id === taskId);
    if (!activeUser?.id || !projectId || !selected || !note.trim()) { onNotice('error','Pilih tugas server yang tersedia dan isi catatan.'); return; }
    setBusy(true);
    try {
      const draft = await createFieldDraft({principalId:String(activeUser.id),projectId,assignmentId:selected.id,assignmentLabel:selected.title,kind,note:note.trim(),...(gps?{latitude:gps.latitude,longitude:gps.longitude,accuracy:gps.accuracy,gpsCapturedAt:gps.capturedAt}:{}),...(file?{evidenceName:file.name,evidenceType:file.type,evidenceSize:file.size,evidenceBlob:file}:{})});
      await saveFieldDraft(draft); setNote(''); setGps(null); setFile(null); await refreshDrafts();
      onNotice('success','Draft dan bukti tersimpan lokal. Belum dikirim atau diterima server.');
    } catch (e) { onNotice('error',e instanceof Error?e.message:'Draft lokal gagal disimpan.'); }
    finally { setBusy(false); }
  };
  const clearProjectDrafts = async () => {
    if (!activeUser?.id || !projectId || !window.confirm('Hapus semua draft lokal dan cache assignment untuk akun dan Project ini? Submission server tidak dihapus; tindakan lokal tidak dapat dibatalkan.')) return;
    setBusy(true); try { const removed=await deleteFieldDrafts(String(activeUser.id),projectId); await deleteFieldAssignmentCache(String(activeUser.id),projectId); await refreshDrafts(); onNotice('success',removed+' draft lokal dan cache assignment dihapus.'); } catch(e) { onNotice('error',e instanceof Error?e.message:'Draft lokal gagal dibersihkan.'); } finally { setBusy(false); }
  };
  const syncDraft = async (draft:FieldDraft):Promise<'synced'|'conflict'|'failed'> => {
    if(!online) throw new Error('Tidak dapat sync saat offline.');
    if(!activeUser?.id||!projectId) throw new Error('User dan Project aktif diperlukan.');
    if(draft.status==='synced') return 'synced';
    await saveFieldDraft({...draft,status:'syncing',lastError:undefined});
    await refreshDrafts();
    try {
      const fresh=await get<{workItems?:WorkItem[];scope?:string}>('/projects/'+encodeURIComponent(projectId)+'/work-items');
      const current=(fresh.workItems||[]).find(row=>row.id===draft.assignmentId&&row.assignee_user_id===activeUser.id&&!['resolved','closed','cancelled'].includes(String(row.status||'').toLowerCase()));
      if(!current) throw Object.assign(new Error('Assignment tidak lagi aktif atau tidak ditugaskan kepada akun ini.'),{status:403});
      let evidence:Record<string,unknown>={};
      if(draft.evidenceName&&!draft.evidenceBlob)throw new Error('Foto bukti lokal tidak tersedia; buat capture baru tanpa foto atau lampirkan ulang.');
      if(draft.evidenceBlob){
        const presigned=await post<{upload:{uploadUrl:string;requiredHeaders:Record<string,string>};objectKey:string}>('/projects/'+encodeURIComponent(projectId)+'/field-captures/presigned-upload',{captureId:draft.id,workItemId:draft.assignmentId,filename:draft.evidenceName,mimeType:draft.evidenceType,contentLength:draft.evidenceBlob.size,objectKey:draft.evidenceObjectKey});
        await saveFieldDraft({...draft,status:'syncing',evidenceObjectKey:presigned.objectKey});
        const uploaded=await fetch(presigned.upload.uploadUrl,{method:'PUT',headers:presigned.upload.requiredHeaders,body:draft.evidenceBlob});
        if(!uploaded.ok)throw new Error('Upload bukti gagal ('+uploaded.status+').');
        if(!draft.checksum)throw new Error('Checksum bukti lokal tidak tersedia.');
        evidence={evidenceObjectKey:presigned.objectKey,evidenceSha256:draft.checksum,evidenceSizeBytes:draft.evidenceBlob.size,evidenceMimeType:draft.evidenceType,evidenceOriginalFilename:draft.evidenceName};
      }
      const result=await post<{submission:Record<string,any>;replay:boolean}>('/projects/'+encodeURIComponent(projectId)+'/field-captures/sync',{captureId:draft.id,workItemId:draft.assignmentId,captureKind:draft.kind,note:draft.note,capturedAt:draft.capturedAt,...(draft.latitude!==undefined?{latitude:draft.latitude,longitude:draft.longitude,gpsAccuracyM:draft.accuracy,gpsCapturedAt:draft.gpsCapturedAt}:{}),...evidence});
      await saveFieldDraft({...draft,status:'synced',serverSubmissionId:String(result.submission.id),serverReceivedAt:String(result.submission.server_received_at||''),evidenceBlob:undefined,lastError:undefined});
      return 'synced';
    } catch(e:any) {
      const status=e?.status===403||e?.status===409||e?.status===422?'conflict':'failed';
      const message=e instanceof Error?e.message:'Sync gagal.';
      await saveFieldDraft({...draft,status,lastError:message});
      return status;
    }
  };
  const syncOne = async (draft:FieldDraft) => {
    setBusy(true);try{const status=await syncDraft(draft);await refreshDrafts();await refreshServerSubmissions();onNotice(status==='synced'?'success':status==='conflict'?'error':'info',status==='synced'?'Capture diterima server dan receipt disimpan.':draft.lastError||'Sync gagal; draft lokal tetap disimpan.');}catch(e){onNotice('error',e instanceof Error?e.message:'Sync gagal.')}finally{setBusy(false);}
  };
  const syncAll = async () => {
    if(!online){onNotice('error','Sync semua hanya tersedia saat online.');return;}
    const candidates=drafts.filter(d=>d.status==='queued'||d.status==='failed');if(!candidates.length){onNotice('info','Tidak ada draft yang siap disinkronkan.');return;}
    setBusy(true);let synced=0,conflicts=0,failed=0;try{for(const draft of candidates){const status=await syncDraft(draft);if(status==='synced')synced++;else if(status==='conflict')conflicts++;else failed++;}await refreshDrafts();await refreshServerSubmissions();onNotice(synced?'success':'info','Sync selesai: '+synced+' diterima server, '+conflicts+' conflict, '+failed+' gagal.');}finally{setBusy(false);}
  };
  const remove = async (id:string) => {
    if (!window.confirm('Hapus draft lokal dan bukti dari perangkat ini?')) return;
    setBusy(true); try { await deleteFieldDraft(id); await refreshDrafts(); onNotice('success','Draft lokal dihapus.'); }
    catch(e) { onNotice('error',e instanceof Error?e.message:'Draft gagal dihapus.'); } finally { setBusy(false); }
  };

  return <div className="page-stack">
    <div className="page-heading"><div><div className="eyebrow">FIELD OPERATIONS · OFFLINE CAPTURE</div><h1>Field Capture</h1><p>Tugas divalidasi ulang server saat sync. Draft offline tetap lokal sampai server menerima submission.</p></div><span className={online?'status-pill pill-green':'status-pill pill-amber'}>{online?'ONLINE':'OFFLINE'}</span></div>
    {!projectId && <div className="inline-warning">Pilih Project aktif terlebih dahulu untuk memuat tugas.</div>}
    <section className="card"><div className="panel-heading"><div><h2>Capture tugas</h2><p>Project scope dan task list dikontrol server.</p></div></div>
      {loadingTasks ? <div className="loading-state">Memuat tugas…</div> : taskError && !workItems.length ? <div className="inline-warning">{taskError}</div> : null}
      {taskError && workItems.length>0 && <p className="muted">{taskError}</p>}
      {tasksFromCache&&<div className="inline-warning">Cache tugas terakhir diperbarui {new Date(taskCacheAt).toLocaleString()}. Capture hanya draft lokal; status assignment belum divalidasi ulang.</div>}
      {!loadingTasks&&!taskError&&!workItems.length&&projectId&&<div className="empty-state"><h3>Tidak ada tugas aktif</h3><p>Hanya tugas yang belum ditutup atau dibatalkan yang dapat dipilih untuk capture.</p></div>}
      <form onSubmit={save} className="form-grid">
        <label className="form-field form-wide"><span>Tugas / Assignment</span><select value={taskId} onChange={e=>setTaskId(e.target.value)} required disabled={!workItems.length||loadingTasks}><option value="">Pilih tugas aktif</option>{workItems.map(item=><option key={item.id} value={item.id}>{item.title} · {item.status}{item.priority?' · '+item.priority:''}</option>)}</select></label>
        <label className="form-field"><span>Jenis capture</span><select value={kind} onChange={e=>setKind(e.target.value)}><option value="checkpoint">Checkpoint</option><option value="warehouse">Warehouse / receiving</option><option value="inspection">Inspection</option><option value="exception">Exception / discrepancy</option></select></label>
        <label className="form-field form-wide"><span>Catatan lapangan</span><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} required maxLength={4000} placeholder="Catatan singkat hasil pekerjaan"/></label>
        <div className="form-field"><span>GPS (opsional)</span><button type="button" className="secondary-button" onClick={captureGps}>Ambil lokasi</button>{gps&&<small>{gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)} · ±{Math.round(gps.accuracy)} m</small>}</div>
        <label className="form-field"><span>Foto bukti (opsional)</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>chooseEvidence(e.target.files?.[0]??null)}/>{file&&<small>{file.name} · {(file.size/1048576).toFixed(2)} MB · lokal</small>}</label>
        <div className="form-actions form-wide"><button className="primary-button" disabled={busy||!taskId||!note.trim()}>{busy?'Menyimpan…':'Simpan draft offline'}</button></div>
      </form>
    </section>
    <section className="card"><div className="panel-heading"><div><h2>Submission server</h2><p>Receipt resmi dari API; hanya data yang diizinkan untuk Project ini.</p></div></div>{serverSubmissionError&&<div className="inline-warning">{serverSubmissionError}</div>}{!serverSubmissions.length&&!serverSubmissionError?<div className="empty-state"><h3>Belum ada submission server</h3><p>Capture yang diterima server akan muncul di sini.</p></div>:<div className="data-list">{serverSubmissions.map(s=><article key={s.id} className="data-list-row"><div><strong>{s.capture_kind} · {s.work_item_id}</strong><p>{s.status} · Receipt {s.id}</p><p>{s.note}</p><small>Capture {new Date(s.captured_at).toLocaleString()} · Server {new Date(s.server_received_at).toLocaleString()}{s.evidence_object_key?" · Foto terverifikasi":""}{s.latitude!==null&&s.latitude!==undefined?" · GPS "+Number(s.latitude).toFixed(6)+", "+Number(s.longitude).toFixed(6):""}</small></div></article>)}</div>}</section>\n    <section className="card"><div className="panel-heading"><div><h2>Draft lokal</h2><p>{drafts.length} draft untuk akun dan Project saat ini. Status tidak berarti sudah dikirim.</p></div><div className="form-actions"><button type="button" className="secondary-button" onClick={()=>{void refreshDrafts();void refreshServerSubmissions();}}>Refresh</button><button type="button" className="secondary-button" disabled={busy||!online||!drafts.some(d=>d.status==="queued"||d.status==="failed")} onClick={()=>void syncAll()}>Sync semua draft</button><button type="button" className="text-button danger" disabled={busy} onClick={()=>void clearProjectDrafts()}>Hapus data lokal (draft + cache)</button><button type="button" className="text-button danger" disabled={busy||!activeUser?.id} onClick={()=>{if(!activeUser?.id||!window.confirm('HAPUS PERMANEN semua draft lokal, foto bukti dan cache assignment untuk akun ini dari perangkat ini? Data server tidak dihapus.'))return;setBusy(true);void deleteFieldLocalDataForPrincipal(String(activeUser.id)).then(async result=>{await refreshDrafts();setWorkItems([]);setScope('');setTasksFromCache(false);setTaskCacheAt('');onNotice('success',`Data lokal dihapus: ${result.drafts} draft dan ${result.assignmentCaches} cache assignment.`);}).catch(e=>onNotice('error',e instanceof Error?e.message:'Data lokal gagal dihapus.')).finally(()=>setBusy(false));}}>Hapus semua data lokal akun</button></div></div>
      {!drafts.length?<div className="empty-state"><h3>Belum ada draft lokal</h3><p>Capture baru akan muncul di sini.</p></div>:<div className="data-list">{drafts.map(d=><article key={d.id} className="data-list-row"><div><strong>{d.assignmentLabel||d.assignmentId}</strong><p>{d.kind} · {d.status}{d.serverSubmissionId?" · Server receipt "+d.serverSubmissionId:""}</p><p>{d.note}</p><small>{new Date(d.capturedAt).toLocaleString()} · {d.evidenceName||'Tanpa foto'}{d.gpsCapturedAt?' · GPS capture '+new Date(d.gpsCapturedAt).toLocaleString():''}{d.checksum?" · SHA-256 tersimpan":""}{d.serverReceivedAt?" · Diterima "+new Date(d.serverReceivedAt).toLocaleString():""}{d.lastError?" · "+d.lastError:""}</small></div><div className="form-actions">{(d.status==="queued"||d.status==="failed")&&<button type="button" className="secondary-button" disabled={busy||!online} onClick={()=>void syncOne(d)}>{d.status==="failed"?"Retry sync":"Sync"}</button>}{d.status==="conflict"&&<span className="status-pill pill-amber">Conflict · buat capture baru</span>}<button type="button" className="text-button danger" disabled={busy} onClick={()=>void remove(d.id)}>Hapus lokal</button></div></article>)}</div>}
    </section>
    <div className="inline-warning">Capture tetap offline-first. Submission server hanya dianggap diterima setelah assignment diverifikasi ulang, foto di-upload ke private storage, checksum diverifikasi, dan server memberikan receipt. Conflict/failed draft tetap tersimpan lokal; submission server tidak dapat dihapus dari perangkat.</div>
  </div>;
}
