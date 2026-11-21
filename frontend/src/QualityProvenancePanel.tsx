import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { get, post, patch } from './api';

type AnyRecord = Record<string, any>;
type Notice = (kind: 'success' | 'error' | 'info', text: string) => void;

const emptySample = {
  sampleNumber: '', sampleType: 'composite', samplingMethod: '',
  sampledAt: new Date().toISOString().slice(0, 16), status: 'pending',
  laboratoryName: '', laboratoryAccreditationReference: '',
  labReportDocumentId: '', sourceType: 'manual', sourceReference: '',
  lotId: '', sampleLocation: '', sealNumber: '', sampleCondition: '',
};
const emptyResult = { attributeId: '', value: '', unitCode: '', measurementBasis: 'as_received', methodCode: '', detectionLimit: '', uncertainty: '' };

export default function QualityProvenancePanel({ projectId, onNotice }: { projectId: string; onNotice: Notice }) {
  const [data, setData] = useState<AnyRecord>({ canView: false, canCreate: false, canCreateResults: false, canReview: false, samples: [], results: [], attributes: [], evidenceDocuments: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(emptySample);
  const [resultForms, setResultForms] = useState<Record<string, typeof emptyResult>>({});

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true); setError('');
    try {
      const next = await get('/projects/' + encodeURIComponent(projectId) + '/quality-samples');
      setData(next || { canView: false, samples: [], results: [], attributes: [], evidenceDocuments: [] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Data kualitas tidak dapat dimuat.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let alive = true;
    if (!projectId) { setData({ canView: false, samples: [], results: [], attributes: [], evidenceDocuments: [] }); return () => { alive = false; }; }
    get('/projects/' + encodeURIComponent(projectId) + '/quality-samples')
      .then(next => { if (alive) setData(next || {}); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Data kualitas tidak dapat dimuat.'); });
    return () => { alive = false; };
  }, [projectId]);

  const createSample = async (e: FormEvent) => {
    e.preventDefault();
    if (!data.canCreate || !projectId) return;
    if (sample.status === 'tested' && (!sample.labReportDocumentId || !sample.laboratoryName.trim())) {
      onNotice('error', 'Sampel berstatus tested wajib memiliki laporan lab approved dan nama laboratorium.'); return;
    }
    setBusy(true);
    try {
      await post('/projects/' + projectId + '/quality-samples', {
        ...sample,
        sampledAt: new Date(sample.sampledAt).toISOString(),
        lotId: sample.lotId || null,
        labReportDocumentId: sample.labReportDocumentId || null,
        laboratoryName: sample.laboratoryName || null,
        laboratoryAccreditationReference: sample.laboratoryAccreditationReference || null,
      });
      onNotice('success', 'Sampel kualitas tersimpan dengan provenance Project.');
      setSample(emptySample); await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Sampel kualitas gagal disimpan.'); }
    finally { setBusy(false); }
  };

  const createResult = async (sampleId: string) => {
    if (!data.canCreateResults) return;
    const draft = resultForms[sampleId] || emptyResult;
    const attribute = (data.attributes || []).find((a: AnyRecord) => a.id === draft.attributeId);
    if (!attribute || !draft.value.trim() || !draft.measurementBasis.trim() || !draft.methodCode.trim()) {
      onNotice('error', 'Atribut, nilai, basis pengukuran dan metode wajib diisi.'); return;
    }
    const body: AnyRecord = {
      attributeId: draft.attributeId,
      unitCode: draft.unitCode || attribute.unit_code || null,
      measurementBasis: draft.measurementBasis,
      methodCode: draft.methodCode,
      detectionLimit: draft.detectionLimit === '' ? null : Number(draft.detectionLimit),
      uncertainty: draft.uncertainty === '' ? null : Number(draft.uncertainty),
    };
    if (attribute.data_type === 'numeric' || attribute.data_type === 'range') body.resultNumeric = Number(draft.value);
    else if (attribute.data_type === 'boolean') body.resultBoolean = draft.value === 'true';
    else body.resultText = draft.value;
    setBusy(true);
    try {
      await post('/projects/' + projectId + '/quality-samples/' + sampleId + '/results', body);
      onNotice('success', 'Hasil uji tersimpan dengan tautan sampel dan bukti laboratorium.');
      setResultForms(v => ({ ...v, [sampleId]: emptyResult })); await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Hasil uji gagal disimpan.'); }
    finally { setBusy(false); }
  };

  const reviewSample = async (sampleId: string, status: 'reviewed' | 'rejected') => {
    setBusy(true);
    try {
      await patch('/projects/' + projectId + '/quality-samples/' + sampleId + '/review', { status, reviewNote: 'Reviewed in Project quality workspace' });
      onNotice('success', 'Status sampel kualitas diperbarui dan reviewer dicatat.'); await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Review sampel gagal.'); }
    finally { setBusy(false); }
  };

  const reviewResult = async (resultId: string, reviewStatus: 'accepted' | 'rejected' | 'retest_required') => {
    setBusy(true);
    try {
      await patch('/projects/' + projectId + '/quality-results/' + resultId + '/review', { reviewStatus, reviewNote: 'Reviewed in Project quality workspace' });
      onNotice('success', 'Keputusan hasil uji diperbarui dan reviewer dicatat.'); await refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Review hasil uji gagal.'); }
    finally { setBusy(false); }
  };

  if (!projectId || data.canView !== true) return null;
  return <section className="panel quality-provenance-panel">
    <div className="panel-heading">
      <div><h3>Quality provenance & COA</h3><p>Catat sampel, metode, chain of custody, laporan laboratorium, hasil ukur dan keputusan QA. Nilai hasil uji harus tertaut pada sampel dan dokumen bukti Project.</p></div>
      <button type="button" className="icon-button" onClick={refresh} title="Refresh">↻</button>
    </div>
    {error && <div className="error-state">{error}</div>}
    {data.canCreate && <form className="form-grid" onSubmit={createSample}>
      <FormField label="Nomor sampel"><input required maxLength={100} value={sample.sampleNumber} onChange={e => setSample(v => ({ ...v, sampleNumber: e.target.value }))} /></FormField>
      <FormField label="Jenis sampel"><select value={sample.sampleType} onChange={e => setSample(v => ({ ...v, sampleType: e.target.value }))}><option value="composite">Composite</option><option value="retained">Retained</option><option value="pre_shipment">Pre-shipment</option><option value="discharge">Discharge</option><option value="claim">Claim</option><option value="other">Other</option></select></FormField>
      <FormField label="Waktu sampling"><input type="datetime-local" required value={sample.sampledAt} onChange={e => setSample(v => ({ ...v, sampledAt: e.target.value }))} /></FormField>
      <FormField label="Metode sampling"><input required minLength={2} maxLength={500} value={sample.samplingMethod} onChange={e => setSample(v => ({ ...v, samplingMethod: e.target.value }))} /></FormField>
      <FormField label="Status"><select value={sample.status} onChange={e => setSample(v => ({ ...v, status: e.target.value }))}><option value="pending">Pending</option><option value="submitted">Submitted</option><option value="tested">Tested (butuh bukti lab)</option></select></FormField>
      <FormField label="Lot ID (opsional)"><input value={sample.lotId} onChange={e => setSample(v => ({ ...v, lotId: e.target.value }))} placeholder="UUID lot Project" /></FormField>
      <FormField label="Laboratorium"><input value={sample.laboratoryName} onChange={e => setSample(v => ({ ...v, laboratoryName: e.target.value }))} /></FormField>
      <FormField label="Akreditasi laboratorium"><input value={sample.laboratoryAccreditationReference} onChange={e => setSample(v => ({ ...v, laboratoryAccreditationReference: e.target.value }))} /></FormField>
      <FormField label="Laporan lab approved + checksum" wide><select value={sample.labReportDocumentId} onChange={e => setSample(v => ({ ...v, labReportDocumentId: e.target.value }))}><option value="">Belum ada / pilih bila tersedia</option>{(data.evidenceDocuments || []).map((d: AnyRecord) => <option key={d.id} value={d.id}>{d.original_filename || d.document_type_code} · SHA-256 {String(d.sha256_checksum).slice(0,12)}…</option>)}</select></FormField>
      <FormField label="Lokasi sampling"><input value={sample.sampleLocation} onChange={e => setSample(v => ({ ...v, sampleLocation: e.target.value }))} /></FormField>
      <FormField label="Nomor seal"><input value={sample.sealNumber} onChange={e => setSample(v => ({ ...v, sealNumber: e.target.value }))} /></FormField>
      <FormField label="Kondisi sampel"><input value={sample.sampleCondition} onChange={e => setSample(v => ({ ...v, sampleCondition: e.target.value }))} /></FormField>
      <FormField label="Tipe sumber"><select value={sample.sourceType} onChange={e => setSample(v => ({ ...v, sourceType: e.target.value }))}><option value="manual">Manual</option><option value="official_document">Dokumen resmi</option><option value="buyer_confirmed">Konfirmasi buyer</option><option value="public_reference">Referensi publik</option></select></FormField>
      <FormField label="Referensi sumber"><input value={sample.sourceReference} onChange={e => setSample(v => ({ ...v, sourceReference: e.target.value }))} maxLength={500} /></FormField>
      <div className="form-actions form-wide"><button className="primary-button" disabled={busy || sample.sampleNumber.trim().length < 2 || sample.samplingMethod.trim().length < 2}>{busy ? 'Menyimpan…' : 'Simpan sampel'}</button></div>
    </form>}
    {loading ? <div className="loading-state">Memuat sampel dan hasil uji…</div> : !(data.samples || []).length ? <div className="empty-state"><strong>Belum ada sampel kualitas</strong><span>Catatan sampel akan muncul setelah dibuat oleh role QA yang berwenang.</span></div> :
      <div className="quality-sample-list">
        {(data.samples || []).map((s: AnyRecord) => <article className="quality-sample-card" key={s.id}>
          <div className="panel-heading"><div><strong>{s.sample_number}</strong><p>{s.sample_type} · {s.status} · {new Date(s.sampled_at).toLocaleString('id-ID')}</p></div>
            {data.canReview && s.status !== 'reviewed' && s.status !== 'rejected' && <div className="table-actions"><button type="button" className="primary-button" disabled={busy || !s.lab_report_document_id || !s.laboratory_name} onClick={() => reviewSample(s.id,'reviewed')}>Review sampel</button><button type="button" className="secondary-button" disabled={busy} onClick={() => reviewSample(s.id,'rejected')}>Tolak</button></div>}
          </div>
          <p>Metode: {s.sampling_method} · Lab: {s.laboratory_name || 'Belum ditetapkan'} · Sumber: {s.source_type} / {s.source_reference || '—'}</p>
          <p>Bukti lab: {s.lab_report_document_id || 'Belum ada'} · SHA-256 {s.lab_report_sha256 || '—'} · Chain of custody: {JSON.stringify(s.chain_of_custody || {})}</p>
          {(data.results || []).filter((r: AnyRecord) => r.sample_id === s.id).map((r: AnyRecord) => <div className="quality-result-row" key={r.id}>
            <span><strong>{r.attribute_name || r.attribute_code || r.attribute_id}</strong> · {r.result_numeric ?? r.result_text ?? String(r.result_boolean)} {r.unit_code || ''}<small>{r.measurement_basis} · {r.method_code} · {r.review_status} · SHA-256 {r.evidence_sha256 || '—'}</small></span>
            {data.canReview && r.review_status === 'unreviewed' && <div className="table-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => reviewResult(r.id,'accepted')}>Terima</button><button type="button" className="secondary-button" disabled={busy} onClick={() => reviewResult(r.id,'rejected')}>Tolak</button><button type="button" className="secondary-button" disabled={busy} onClick={() => reviewResult(r.id,'retest_required')}>Uji ulang</button></div>}
          </div>)}
          {data.canCreateResults && ['tested','reviewed'].includes(s.status) && <div className="form-grid compact-form">
            <FormField label="Atribut"><select value={(resultForms[s.id] || emptyResult).attributeId} onChange={e => setResultForms(v => ({ ...v, [s.id]: { ...(v[s.id] || emptyResult), attributeId: e.target.value } }))}><option value="">Pilih atribut</option>{(data.attributes || []).map((a: AnyRecord) => <option key={a.id} value={a.id}>{a.attribute_code} · {a.name} ({a.data_type})</option>)}</select></FormField>
            <FormField label="Nilai"><input value={(resultForms[s.id] || emptyResult).value} onChange={e => setResultForms(v => ({ ...v, [s.id]: { ...(v[s.id] || emptyResult), value: e.target.value } }))} placeholder="Angka / teks / true / false" /></FormField>
            <FormField label="Unit"><input value={(resultForms[s.id] || emptyResult).unitCode} onChange={e => setResultForms(v => ({ ...v, [s.id]: { ...(v[s.id] || emptyResult), unitCode: e.target.value } }))} placeholder="Gunakan unit atribut" /></FormField>
            <FormField label="Basis ukur"><input value={(resultForms[s.id] || emptyResult).measurementBasis} onChange={e => setResultForms(v => ({ ...v, [s.id]: { ...(v[s.id] || emptyResult), measurementBasis: e.target.value } }))} /></FormField>
            <FormField label="Metode uji"><input value={(resultForms[s.id] || emptyResult).methodCode} onChange={e => setResultForms(v => ({ ...v, [s.id]: { ...(v[s.id] || emptyResult), methodCode: e.target.value } }))} /></FormField>
            <div className="form-actions form-wide"><button type="button" className="primary-button" disabled={busy} onClick={() => createResult(s.id)}>Tambah hasil uji</button></div>
          </div>}
        </article>)}
      </div>}
  </section>;
}

function FormField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={'form-field ' + (wide ? 'form-wide' : '')}><span>{label}</span>{children}</label>;
}
