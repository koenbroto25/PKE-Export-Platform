import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { get, post, patch } from './api';

type AnyRecord = Record<string, any>;
type Notice = (kind: 'success' | 'error' | 'info', text: string) => void;

const defaultOrgJson = '{\n  "legal_name": "",\n  "organization_type": "supplier",\n  "country_code": "ID"\n}';
const defaultFacilityJson = '{\n  "name": "",\n  "facility_type": "kernel_crushing_plant",\n  "country_code": "ID",\n  "operating_status": "planned"\n}';
const emptyForm = {
  entityType: 'organization', operation: 'create', targetId: '',
  proposedData: defaultOrgJson, requestReason: '', sourceType: 'manual',
  sourceReference: '', sourceUrl: '',
};

export default function MasterDataChangeRequests({ projectId, activeUser, onNotice }: {
  projectId: string; activeUser?: AnyRecord; onNotice: Notice;
}) {
  const [data, setData] = useState<AnyRecord>({ requests: [], organizations: [], facilities: [], canManage: false, canReview: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [decisionNotes, setDecisionNotes] = useState<Record<string,string>>({});

  const canManage = data.canManage === true && data.canReview !== true;
  const canReview = data.canReview === true;

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true); setError('');
    try {
      const result = await get('/projects/' + encodeURIComponent(projectId) + '/master-data-change-requests');
      setData(result || { requests: [], organizations: [], facilities: [], canManage: false, canReview: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Master-data change requests tidak dapat dimuat.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let alive = true;
    if (!projectId) {
      setData({ requests: [], organizations: [], facilities: [], canManage: false, canReview: false });
      return () => { alive = false; };
    }
    setLoading(true); setError('');
    get('/projects/' + encodeURIComponent(projectId) + '/master-data-change-requests')
      .then(result => { if (alive) setData(result || {}); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Master-data change requests tidak dapat dimuat.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  const targets = useMemo(() => form.entityType === 'organization'
    ? (data.organizations || []).map((r: AnyRecord) => ({ id: r.id, label: r.legal_name + ' · ' + r.organization_type + ' · ' + r.verification_status }))
    : (data.facilities || []).map((r: AnyRecord) => ({ id: r.id, label: r.name + ' · ' + r.facility_type + ' · ' + r.verification_status })),
  [form.entityType, data.organizations, data.facilities]);

  const reset = () => { setEditingId(''); setForm(emptyForm); setFormOpen(false); };
  const startNew = () => { setEditingId(''); setForm(emptyForm); setFormOpen(true); };
  const edit = (row: AnyRecord) => {
    if (row.status !== 'draft' || row.requested_by !== activeUser?.id) return;
    setEditingId(row.id); setFormOpen(true);
    setForm({
      entityType: row.entity_type, operation: row.operation, targetId: row.target_id || '',
      proposedData: JSON.stringify(row.proposed_data || {}, null, 2),
      requestReason: row.request_reason || '', sourceType: row.source_type || 'manual',
      sourceReference: row.source_reference || '', sourceUrl: row.source_url || '',
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage || !projectId) return;
    let proposedData: AnyRecord;
    try {
      proposedData = JSON.parse(form.proposedData);
      if (!proposedData || typeof proposedData !== 'object' || Array.isArray(proposedData) || !Object.keys(proposedData).length)
        throw new Error('Proposal harus berupa objek JSON yang tidak kosong.');
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'JSON proposal tidak valid.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        entityType: form.entityType, operation: form.operation,
        targetId: form.operation === 'update' ? form.targetId : null,
        proposedData, requestReason: form.requestReason, sourceType: form.sourceType,
        sourceReference: form.sourceReference, sourceUrl: form.sourceUrl || null, sourceSnapshot: {},
      };
      if (editingId) {
        await patch('/projects/' + projectId + '/master-data-change-requests/' + editingId, {
          proposedData, requestReason: form.requestReason, sourceType: form.sourceType,
          sourceReference: form.sourceReference, sourceUrl: form.sourceUrl || null, sourceSnapshot: {},
        });
        onNotice('success', 'Draft perubahan master data diperbarui.');
      } else {
        await post('/projects/' + projectId + '/master-data-change-requests', body);
        onNotice('success', 'Draft tersimpan. Periksa proposal, lalu kirim untuk persetujuan Admin.');
      }
      reset(); await refresh();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Draft perubahan master data tidak dapat disimpan.');
    } finally { setBusy(false); }
  };

  const submit = async (id: string) => {
    setBusy(true);
    try {
      await patch('/projects/' + projectId + '/master-data-change-requests/' + id, { status: 'submitted' });
      onNotice('success', 'Permintaan dikirim ke Platform Admin untuk ditinjau.');
      await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Permintaan tidak dapat dikirim.'); }
    finally { setBusy(false); }
  };

  const decide = async (row: AnyRecord, status: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      await patch('/projects/' + projectId + '/master-data-change-requests/' + row.id, {
        status,
        decisionNote: decisionNotes[row.id] || (status === 'approved' ? 'Disetujui setelah pemeriksaan bukti dan proposal.' : ''),
      });
      onNotice('success', status === 'approved'
        ? 'Perubahan kanonis diterapkan dan dicatat dalam audit.'
        : 'Permintaan ditolak dan alasan keputusan dicatat.');
      await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Keputusan Admin tidak dapat diterapkan.'); }
    finally { setBusy(false); }
  };

  return <section className="panel">
    <div className="panel-heading">
      <div><h3>Permintaan perubahan identitas master</h3><p>PM mengajukan perubahan supplier/fasilitas global. Hanya Platform Admin yang dapat menyetujui; identitas material yang berubah kembali berstatus belum terverifikasi.</p></div>
      {canManage && <button type="button" className="primary-button" onClick={startNew}>Buat permintaan</button>}
      <button type="button" className="icon-button" onClick={refresh} title="Refresh">↻</button>
    </div>
    {!projectId ? <div className="empty-state"><strong>Pilih Project</strong><span>Permintaan perubahan master data terikat pada Project aktif.</span></div> : <>
      {canReview && <div className="notice notice-info">Mode Platform Admin: tinjau bukti dan proposal. Pengaju tidak dapat menyetujui permintaannya sendiri.</div>}
      {canManage && <div className="notice notice-info">Mode PM: perubahan identitas global tidak langsung diterapkan. Simpan draft, lalu kirim untuk persetujuan Platform Admin.</div>}
      {formOpen && canManage && <form className="form-grid" onSubmit={save}>
        <FormField label="Jenis master"><select value={form.entityType} onChange={e => setForm(v => ({ ...v, entityType: e.target.value, targetId: '', operation: 'create', proposedData: e.target.value === 'facility' ? defaultFacilityJson : defaultOrgJson }))}><option value="organization">Organisasi / supplier</option><option value="facility">Fasilitas / PKS / KCP</option></select></FormField>
        <FormField label="Operasi"><select value={form.operation} onChange={e => setForm(v => ({ ...v, operation: e.target.value, targetId: '' }))}><option value="create">Buat identitas baru</option><option value="update">Usulkan perubahan identitas</option></select></FormField>
        {form.operation === 'update' && <FormField label="Record kanonis"><select required value={form.targetId} onChange={e => setForm(v => ({ ...v, targetId: e.target.value }))}><option value="">Pilih record</option>{targets.map((r: AnyRecord) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></FormField>}
        <FormField label="Alasan perubahan" wide><textarea required minLength={10} maxLength={2000} rows={2} value={form.requestReason} onChange={e => setForm(v => ({ ...v, requestReason: e.target.value }))} /></FormField>
        <FormField label="Tipe sumber"><select value={form.sourceType} onChange={e => setForm(v => ({ ...v, sourceType: e.target.value }))}><option value="manual">Manual</option><option value="public_reference">Referensi publik</option><option value="official_document">Dokumen resmi</option><option value="buyer_confirmed">Konfirmasi buyer</option></select></FormField>
        <FormField label="Referensi / nomor dokumen"><input required maxLength={500} value={form.sourceReference} onChange={e => setForm(v => ({ ...v, sourceReference: e.target.value }))} /></FormField>
        <FormField label="URL bukti (opsional)" wide><input type="url" value={form.sourceUrl} onChange={e => setForm(v => ({ ...v, sourceUrl: e.target.value }))} placeholder="https://..." /></FormField>
        <FormField label="Proposal perubahan (JSON)" wide><textarea required rows={9} spellCheck={false} value={form.proposedData} onChange={e => setForm(v => ({ ...v, proposedData: e.target.value }))} /></FormField>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={reset}>Batal</button><button className="primary-button" disabled={busy || !form.requestReason.trim() || !form.sourceReference.trim() || (form.operation === 'update' && !form.targetId)}>{busy ? 'Menyimpan…' : editingId ? 'Simpan draft' : 'Simpan draft permintaan'}</button></div>
      </form>}
      {loading ? <div className="loading-state">Memuat permintaan…</div> : error ? <div className="error-state">{error}</div> : !(data.requests || []).length ? <div className="empty-state"><strong>Belum ada permintaan perubahan</strong><span>Pengajuan perubahan legal name, nomor registrasi, alamat, atau identitas fasilitas akan tercatat di sini.</span></div> :
        <div className="table-wrap"><table><thead><tr><th>Entitas / Operasi</th><th>Alasan & Sumber</th><th>Status</th><th>Jejak persetujuan</th><th>Aksi</th></tr></thead><tbody>
          {(data.requests || []).map((row: AnyRecord) => <tr key={row.id}>
            <td><div className="primary-cell"><strong>{row.entity_type === 'organization' ? 'Organisasi' : 'Fasilitas'} · {row.operation === 'create' ? 'Buat' : 'Perbarui'}</strong><small>{row.target_id || 'Record baru saat disetujui'}</small></div></td>
            <td><div className="primary-cell"><strong>{row.request_reason}</strong><small>{row.source_type} · {row.source_reference}</small>{row.source_url && <a href={row.source_url} target="_blank" rel="noreferrer">Buka sumber</a>}</div></td>
            <td><span className="status-pill pill-slate">{row.status}</span></td>
            <td><div className="primary-cell"><strong>{row.reviewed_by ? 'Reviewer ' + String(row.reviewed_by).slice(0,8) : 'Belum ditinjau'}</strong><small>{row.reviewed_at ? new Date(row.reviewed_at).toLocaleString('id-ID') : '—'}</small>{row.applied_target_id && <small>Record: {row.applied_target_id}</small>}{row.decision_note && <small>{row.decision_note}</small>}</div></td>
            <td><div className="table-actions">
              <details><summary>Detail</summary><pre>{JSON.stringify({ proposed_data: row.proposed_data, base_snapshot: row.base_snapshot, source_snapshot: row.source_snapshot }, null, 2)}</pre></details>
              {canManage && row.status === 'draft' && row.requested_by === activeUser?.id && <><button type="button" className="secondary-button" onClick={() => edit(row)}>Edit</button><button type="button" className="primary-button" disabled={busy} onClick={() => submit(row.id)}>Kirim</button></>}
              {canReview && row.status === 'submitted' && row.requested_by !== activeUser?.id && <div className="decision-actions"><textarea rows={2} placeholder="Catatan keputusan (wajib jika menolak)" value={decisionNotes[row.id] || ''} onChange={e => setDecisionNotes(v => ({ ...v, [row.id]: e.target.value }))} /><button type="button" className="primary-button" disabled={busy} onClick={() => decide(row,'approved')}>Setujui & terapkan</button><button type="button" className="secondary-button" disabled={busy || (decisionNotes[row.id] || '').trim().length < 5} onClick={() => decide(row,'rejected')}>Tolak</button></div>}
            </div></td>
          </tr>)}
        </tbody></table></div>}
    </>}
  </section>;
}

function FormField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={'form-field ' + (wide ? 'form-wide' : '')}><span>{label}</span>{children}</label>;
}
