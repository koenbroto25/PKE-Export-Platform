import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { get, post, patch } from './api';
import QualityProvenancePanel from './QualityProvenancePanel';

type AnyRecord = Record<string, any>;
type Notice = (kind: 'success' | 'error' | 'info', text: string) => void;

const defaultOrgJson = '{\n  "legal_name": "",\n  "organization_type": "supplier",\n  "country_code": "ID"\n}';
const defaultFacilityJson = '{\n  "name": "",\n  "facility_type": "kernel_crushing_plant",\n  "country_code": "ID",\n  "operating_status": "planned"\n}';
const defaultFacilityProductJson = '{\n  "process_type": "mechanical_screw_press"\n}';
const defaultCapacityJson = '{\n  "process_type": "kernel_crushing",\n  "capacity_kind": "nominal",\n  "capacity_value": 0,\n  "unit_code": "PKE_MT_PER_DAY",\n  "period_type": "day",\n  "effective_from": "2026-11-21"\n}';
const defaultCertificationJson = '{\n  "certification_type": "",\n  "certificate_number": "",\n  "issuer": "",\n  "scope": "",\n  "valid_from": "",\n  "valid_to": ""\n}';
const emptyForm = {
  entityType: 'organization', operation: 'create', targetId: '',
  proposedData: defaultOrgJson, requestReason: '', sourceType: 'manual',
  sourceReference: '', sourceUrl: '', evidenceDocumentId: '', facilityId: '', productId: '',
};

export default function MasterDataChangeRequests({ projectId, activeUser, onNotice }: {
  projectId: string; activeUser?: AnyRecord; onNotice: Notice;
}) {
  const [data, setData] = useState<AnyRecord>({ requests: [], organizations: [], facilities: [], products: [], evidenceDocuments: [], facilityProducts: [], capacityRecords: [], certifications: [], canManage: false, canReview: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [decisionNotes, setDecisionNotes] = useState<Record<string,string>>({});
  const [identityEvidence, setIdentityEvidence] = useState<Record<string,string>>({});
  const [identityRefs, setIdentityRefs] = useState<Record<string,string>>({});

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
      evidenceDocumentId: row.evidence_document_id || '',
      facilityId: row.proposed_data?.facility_id || '', productId: row.proposed_data?.product_id || '',
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage || !projectId) return;
    let proposedData: AnyRecord;
    try {
      proposedData = JSON.parse(form.proposedData);
      if (['facility_product','capacity_record','certification'].includes(form.entityType)) {
        if (!form.facilityId) throw new Error('Pilih fasilitas yang sudah terverifikasi.');
        proposedData.facility_id = form.facilityId;
      }
      if (form.entityType === 'facility_product') {
        if (!form.productId) throw new Error('Pilih produk yang klasifikasinya sudah terverifikasi.');
        proposedData.product_id = form.productId;
      }
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
        evidenceDocumentId: form.evidenceDocumentId || null,
      };
      if (editingId) {
        await patch('/projects/' + projectId + '/master-data-change-requests/' + editingId, {
          proposedData, requestReason: form.requestReason, sourceType: form.sourceType,
          sourceReference: form.sourceReference, sourceUrl: form.sourceUrl || null, sourceSnapshot: {},
          evidenceDocumentId: form.evidenceDocumentId || null,
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

  const verifyProduct = async (id: string) => {
    const key = 'products:' + id;
    if (!identityEvidence[key] || (identityRefs[key] || '').trim().length < 2) {
      onNotice('error', 'Pilih dokumen approved dan isi referensi klasifikasi.');
      return;
    }
    setBusy(true);
    try {
      await patch('/projects/' + projectId + '/master-data/products/' + id + '/classification', {
        evidenceDocumentId: identityEvidence[key], sourceReference: identityRefs[key].trim(),
      });
      onNotice('success', 'Klasifikasi produk diverifikasi dengan bukti dan reviewer Admin.');
      await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Verifikasi klasifikasi produk gagal.'); }
    finally { setBusy(false); }
  };

  const verifyIdentity = async (entity: 'organizations' | 'facilities', id: string) => {
    const key = entity + ':' + id;
    if (!identityEvidence[key] || (identityRefs[key] || '').trim().length < 2) {
      onNotice('error', 'Pilih dokumen approved dan isi referensi verifikasi.');
      return;
    }
    setBusy(true);
    try {
      const route = entity === 'organizations' ? 'organizations' : 'facilities';
      await patch('/projects/' + projectId + '/master-data/' + route + '/' + id + '/verification', {
        evidenceDocumentId: identityEvidence[key], sourceReference: identityRefs[key].trim(),
      });
      onNotice('success', 'Identitas kanonis berhasil diverifikasi dengan bukti dan reviewer Admin.');
      await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Verifikasi identitas gagal.'); }
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
        <FormField label="Jenis master"><select value={form.entityType} onChange={e => setForm(v => ({
          ...v, entityType: e.target.value, targetId: '', operation: 'create', evidenceDocumentId: '', facilityId: '', productId: '',
          sourceType: ['facility_product','capacity_record','certification'].includes(e.target.value) ? 'official_document' : 'manual',
          proposedData: e.target.value === 'facility' ? defaultFacilityJson :
            e.target.value === 'facility_product' ? defaultFacilityProductJson :
            e.target.value === 'capacity_record' ? defaultCapacityJson :
            e.target.value === 'certification' ? defaultCertificationJson : defaultOrgJson,
        }))}>
          <option value="organization">Organisasi / supplier</option>
          <option value="facility">Fasilitas / PKS / KCP</option>
          <option value="facility_product">Bukti kapabilitas produk fasilitas</option>
          <option value="capacity_record">Catatan kapasitas</option>
          <option value="certification">Sertifikasi fasilitas</option>
        </select></FormField>
        <FormField label="Operasi"><select value={form.operation} disabled={['facility_product','capacity_record','certification'].includes(form.entityType)} onChange={e => setForm(v => ({ ...v, operation: e.target.value, targetId: '' }))}><option value="create">Buat / usulkan record baru</option><option value="update" disabled={['facility_product','capacity_record','certification'].includes(form.entityType)}>Usulkan perubahan identitas</option></select></FormField>
        {['facility_product','capacity_record','certification'].includes(form.entityType) && <FormField label="Fasilitas terverifikasi"><select required value={form.facilityId} onChange={e => setForm(v => ({ ...v, facilityId: e.target.value }))}><option value="">Pilih fasilitas terverifikasi</option>{(data.facilities || []).filter((r: AnyRecord) => r.verification_status === 'verified').map((r: AnyRecord) => <option key={r.id} value={r.id}>{r.name} · {r.city || r.province || r.country_code}</option>)}</select></FormField>}
        {form.entityType === 'facility_product' && <FormField label="Produk terverifikasi"><select required value={form.productId} onChange={e => setForm(v => ({ ...v, productId: e.target.value }))}><option value="">Pilih produk terverifikasi</option>{(data.products || []).filter((r: AnyRecord) => r.classification_status === 'verified').map((r: AnyRecord) => <option key={r.id} value={r.id}>{r.product_code} · {r.product_name}</option>)}</select></FormField>}
        {['facility_product','capacity_record','certification'].includes(form.entityType) && <FormField label="Dokumen bukti approved + checksum" wide><select required value={form.evidenceDocumentId} onChange={e => setForm(v => ({ ...v, evidenceDocumentId: e.target.value }))}><option value="">Pilih dokumen Project yang sudah approved</option>{(data.evidenceDocuments || []).map((r: AnyRecord) => <option key={r.id} value={r.id}>{r.original_filename || r.document_type_code || r.id} · SHA-256 {String(r.sha256_checksum).slice(0,12)}…</option>)}</select></FormField>}
        {['facility_product','capacity_record','certification'].includes(form.entityType) && <div className="notice notice-info form-wide">Sistem tidak menyimpulkan kemampuan PKE dari nama atau tipe fasilitas. Fasilitas dan produk harus berstatus verified, serta bukti dokumen Project harus approved dan checksum-terverifikasi sebelum Admin dapat mengesahkan.</div>}
        {form.operation === 'update' && <FormField label="Record kanonis"><select required value={form.targetId} onChange={e => setForm(v => ({ ...v, targetId: e.target.value }))}><option value="">Pilih record</option>{targets.map((r: AnyRecord) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></FormField>}
        <FormField label="Alasan perubahan" wide><textarea required minLength={10} maxLength={2000} rows={2} value={form.requestReason} onChange={e => setForm(v => ({ ...v, requestReason: e.target.value }))} /></FormField>
        <FormField label="Tipe sumber"><select value={form.sourceType} onChange={e => setForm(v => ({ ...v, sourceType: e.target.value }))}><option value="manual">Manual</option><option value="public_reference">Referensi publik</option><option value="official_document">Dokumen resmi</option><option value="buyer_confirmed">Konfirmasi buyer</option></select></FormField>
        <FormField label="Referensi / nomor dokumen"><input required maxLength={500} value={form.sourceReference} onChange={e => setForm(v => ({ ...v, sourceReference: e.target.value }))} /></FormField>
        <FormField label="URL bukti (opsional)" wide><input type="url" value={form.sourceUrl} onChange={e => setForm(v => ({ ...v, sourceUrl: e.target.value }))} placeholder="https://..." /></FormField>
        <FormField label="Proposal perubahan (JSON)" wide><textarea required rows={9} spellCheck={false} value={form.proposedData} onChange={e => setForm(v => ({ ...v, proposedData: e.target.value }))} /></FormField>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={reset}>Batal</button><button className="primary-button" disabled={busy || !form.requestReason.trim() || !form.sourceReference.trim() || (form.operation === 'update' && !form.targetId) || (['facility_product','capacity_record','certification'].includes(form.entityType) && (!form.evidenceDocumentId || !form.facilityId || (form.entityType === 'facility_product' && !form.productId)))}>{busy ? 'Menyimpan…' : editingId ? 'Simpan draft' : 'Simpan draft permintaan'}</button></div>
      </form>}
      {loading ? <div className="loading-state">Memuat permintaan…</div> : error ? <div className="error-state">{error}</div> : !(data.requests || []).length ? <div className="empty-state"><strong>Belum ada permintaan perubahan</strong><span>Pengajuan perubahan legal name, nomor registrasi, alamat, atau identitas fasilitas akan tercatat di sini.</span></div> :
        <div className="table-wrap"><table><thead><tr><th>Entitas / Operasi</th><th>Alasan & Sumber</th><th>Status</th><th>Jejak persetujuan</th><th>Aksi</th></tr></thead><tbody>
          {(data.requests || []).map((row: AnyRecord) => <tr key={row.id}>
            <td><div className="primary-cell"><strong>{({ organization: 'Organisasi', facility: 'Fasilitas', facility_product: 'Kapabilitas produk fasilitas', capacity_record: 'Catatan kapasitas fasilitas', certification: 'Sertifikasi fasilitas' } as Record<string,string>)[row.entity_type] || 'Master data'} · {row.operation === 'create' ? 'Buat' : 'Perbarui'}</strong><small>{row.target_id || 'Record baru saat disetujui'}</small></div></td>
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
      {(data.facilityProducts || []).length > 0 && <div className="master-data-verification">
        <h4>Register kapabilitas produk fasilitas</h4>
        <div className="table-wrap"><table><thead><tr><th>Fasilitas</th><th>Produk / Proses</th><th>Status / Bukti</th><th>Reviewer</th></tr></thead><tbody>
          {(data.facilityProducts || []).map((r: AnyRecord) => <tr key={r.id}><td>{r.facility_name}</td><td>{r.product_code} · {r.product_name}<small>{r.process_type}</small></td><td><strong>{r.capability_status}</strong><small>{r.source_type} · {r.source_reference || 'Referensi belum diisi'}</small><small>{r.evidence_document_id || 'Bukti belum tersedia'}</small><small>SHA-256 {r.evidence_sha256 || '—'}</small></td><td>{r.verified_at ? new Date(r.verified_at).toLocaleString('id-ID') : 'Belum diverifikasi'}</td></tr>)}
        </tbody></table></div>
      </div>}
      {(data.capacityRecords || []).length > 0 && <div className="master-data-verification">
        <h4>Riwayat kapasitas dan provenance</h4>
        <div className="table-wrap"><table><thead><tr><th>Fasilitas / Proses</th><th>Kapasitas</th><th>Periode berlaku</th><th>Status / Sumber / Bukti</th></tr></thead><tbody>
          {(data.capacityRecords || []).map((r: AnyRecord) => <tr key={r.id}><td>{r.facility_name}<small>{r.process_type} · {r.capacity_kind}</small></td><td>{Number(r.capacity_value).toLocaleString('id-ID')} {r.unit_code} / {r.period_type}</td><td>{String(r.effective_from).slice(0,10)} – {r.effective_to ? String(r.effective_to).slice(0,10) : 'berjalan'}</td><td><strong>{r.verified_at ? 'Terverifikasi' : 'Belum terverifikasi'}</strong><small>{r.source_type} · {r.source_reference || 'Referensi belum diisi'}</small><small>{r.evidence_document_id || 'Bukti belum tersedia'}</small><small>SHA-256 {r.evidence_sha256 || '—'}</small></td></tr>)}
        </tbody></table></div>
      </div>}
      {(data.certifications || []).length > 0 && <div className="master-data-verification">
        <h4>Sertifikasi fasilitas</h4>
        <div className="table-wrap"><table><thead><tr><th>Fasilitas</th><th>Sertifikasi</th><th>Masa berlaku</th><th>Status / Bukti</th></tr></thead><tbody>
          {(data.certifications || []).map((r: AnyRecord) => <tr key={r.id}><td>{r.facility_name}</td><td>{r.certification_type}<small>{r.certificate_number} · {r.issuer}</small></td><td>{r.valid_from ? String(r.valid_from).slice(0,10) : '—'} – {r.valid_to ? String(r.valid_to).slice(0,10) : '—'}</td><td>{r.status}<small>{r.evidence_document_id || '—'}</small></td></tr>)}
        </tbody></table></div>
      </div>}
      {canReview && <div className="master-data-verification">
        <h4>Verifikasi identitas kanonis</h4>
        <p>Hanya record yang belum verified ditampilkan. Setiap verifikasi harus memakai dokumen Project yang approved dan checksum-terverifikasi.</p>
        <div className="verification-list">
          {(data.organizations || []).filter((r: AnyRecord) => r.verification_status !== 'verified').map((row: AnyRecord) => {
            const key = 'organizations:' + row.id;
            return <div className="verification-row" key={key}>
              <div><strong>{row.legal_name}</strong><small>Organisasi · {row.organization_type} · {row.country_code} · {row.verification_status}</small></div>
              <select value={identityEvidence[key] || ''} onChange={e => setIdentityEvidence(v => ({ ...v, [key]: e.target.value }))}><option value="">Pilih dokumen bukti</option>{(data.evidenceDocuments || []).map((d: AnyRecord) => <option key={d.id} value={d.id}>{d.original_filename || d.document_type_code} · {String(d.sha256_checksum).slice(0,10)}…</option>)}</select>
              <input value={identityRefs[key] || ''} onChange={e => setIdentityRefs(v => ({ ...v, [key]: e.target.value }))} placeholder="Referensi pemeriksaan / dokumen" />
              <button type="button" className="primary-button" disabled={busy || !identityEvidence[key] || (identityRefs[key] || '').trim().length < 2} onClick={() => verifyIdentity('organizations',row.id)}>Verifikasi organisasi</button>
            </div>;
          })}
          {(data.products || []).filter((r: AnyRecord) => r.classification_status !== 'verified').map((row: AnyRecord) => {
            const key = 'products:' + row.id;
            return <div className="verification-row" key={key}>
              <div><strong>{row.product_code} · {row.product_name}</strong><small>Produk · {row.classification_status}</small></div>
              <select value={identityEvidence[key] || ''} onChange={e => setIdentityEvidence(v => ({ ...v, [key]: e.target.value }))}><option value="">Pilih dokumen bukti</option>{(data.evidenceDocuments || []).map((d: AnyRecord) => <option key={d.id} value={d.id}>{d.original_filename || d.document_type_code} · {String(d.sha256_checksum).slice(0,10)}…</option>)}</select>
              <input value={identityRefs[key] || ''} onChange={e => setIdentityRefs(v => ({ ...v, [key]: e.target.value }))} placeholder="Referensi klasifikasi / standar" />
              <button type="button" className="primary-button" disabled={busy || !identityEvidence[key] || (identityRefs[key] || '').trim().length < 2} onClick={() => verifyProduct(row.id)}>Verifikasi produk</button>
            </div>;
          })}
          {(data.facilities || []).filter((r: AnyRecord) => r.verification_status !== 'verified').map((row: AnyRecord) => {
            const key = 'facilities:' + row.id;
            return <div className="verification-row" key={key}>
              <div><strong>{row.name}</strong><small>Fasilitas · {row.facility_type} · {row.city || row.province || row.country_code} · {row.verification_status}</small></div>
              <select value={identityEvidence[key] || ''} onChange={e => setIdentityEvidence(v => ({ ...v, [key]: e.target.value }))}><option value="">Pilih dokumen bukti</option>{(data.evidenceDocuments || []).map((d: AnyRecord) => <option key={d.id} value={d.id}>{d.original_filename || d.document_type_code} · {String(d.sha256_checksum).slice(0,10)}…</option>)}</select>
              <input value={identityRefs[key] || ''} onChange={e => setIdentityRefs(v => ({ ...v, [key]: e.target.value }))} placeholder="Referensi pemeriksaan / dokumen" />
              <button type="button" className="primary-button" disabled={busy || !identityEvidence[key] || (identityRefs[key] || '').trim().length < 2} onClick={() => verifyIdentity('facilities',row.id)}>Verifikasi fasilitas</button>
            </div>;
          })}
        </div>
      </div>}
    </>}
    <QualityProvenancePanel projectId={projectId} onNotice={onNotice} />
  </section>;
}

function FormField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={'form-field ' + (wide ? 'form-wide' : '')}><span>{label}</span>{children}</label>;
}
