import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { get, post, patch } from "./api";

type Row = Record<string, any>;
type Props = { projectId: string; activeUser?: { projectPermissions?: string[]; platformAdmin?: boolean } };

const statusLabel = (value: unknown) => {
  const key = String(value || "unverified").toLowerCase();
  const labels: Record<string, string> = {
    verified: "Terverifikasi",
    submitted: "Diajukan",
    under_review: "Ditinjau",
    reviewed: "Ditinjau",
    unverified: "Belum diverifikasi",
    stale: "Kedaluwarsa / stale",
    rejected: "Ditolak",
    expired: "Kedaluwarsa",
    operational: "Operasional",
    maintenance: "Pemeliharaan",
    suspended: "Ditangguhkan",
    closed: "Ditutup",
  };
  return labels[key] || key.replaceAll("_", " ");
};

function Status({ value }: { value: unknown }) {
  const key = String(value || "unverified").toLowerCase();
  return <span className={`p16-status p16-status--${key}`}>{statusLabel(value)}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p16-empty">{children}</div>;
}

export default function PortNetworkPage({ projectId, activeUser }: Props) {
  const [tab, setTab] = useState<"ports" | "warehouses">("ports");
  const [ports, setPorts] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Row[]>([]);
  const [selectedPort, setSelectedPort] = useState<Row | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Row | null>(null);
  const [portDetail, setPortDetail] = useState<Row | null>(null);
  const [warehouseDetail, setWarehouseDetail] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [masterResource, setMasterResource] = useState("ports");
  const [masterId, setMasterId] = useState<string | null>(null);
  const [masterDraft, setMasterDraft] = useState("");
  const [masterMessage, setMasterMessage] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [depthDraft, setDepthDraft] = useState({ depthValue: "", depthDatum: "", observedAt: "", surveyDate: "", sourceAuthority: "", evidenceObjectKey: "", evidenceSha256: "" });
  const [tideDraft, setTideDraft] = useState({ tideHeightM: "", verticalDatum: "", observedAt: "", sourceReference: "", evidenceObjectKey: "", evidenceSha256: "" });
  const [vessels, setVessels] = useState<Row[]>([]);
  const [routes, setRoutes] = useState<Row[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState("");
  const [selectedBerthId, setSelectedBerthId] = useState("");
  const [assessment, setAssessment] = useState<Row | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const permissions = activeUser?.projectPermissions || [];
  const platformAdmin = activeUser?.platformAdmin === true;
  const canViewPorts = platformAdmin || permissions.includes("port.view");
  const canViewWarehouses = platformAdmin || permissions.includes("warehouse.view");
  const canSubmitDepth = permissions.includes("port.depth.submit");
  const canEstimateRoutes = platformAdmin || permissions.includes("route.estimate");
  const canAssessVessel = permissions.includes("vessel.port.assess") && permissions.includes("vessel.view");


  useEffect(() => {
    if (!canViewPorts && canViewWarehouses) setTab("warehouses");
  }, [canViewPorts, canViewWarehouses]);

  useEffect(() => {
    let active = true;
    if (!projectId) return;
    setLoading(true);
    setError("");
    const requests: Promise<any>[] = [];
    if (canViewPorts) requests.push(get<{ ports?: Row[] }>(`/ports?projectId=${encodeURIComponent(projectId)}`).then(data => { if (active) setPorts(Array.isArray(data?.ports) ? data.ports : []); }).catch(() => { if (active) setError("Katalog pelabuhan tidak dapat dimuat."); }));
    if (canViewWarehouses) requests.push(get<{ warehouses?: Row[] }>(`/warehouses?projectId=${encodeURIComponent(projectId)}`).then(data => { if (active) setWarehouses(Array.isArray(data?.warehouses) ? data.warehouses : []); }).catch(() => { if (active) setError("Katalog gudang tidak dapat dimuat."); }));
    Promise.allSettled(requests).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    if (!selectedPort || !projectId || !canViewPorts) { setPortDetail(null); return; }
    setDetailLoading(true);
    get<Row>(`/ports/${encodeURIComponent(String(selectedPort.id))}?projectId=${encodeURIComponent(projectId)}`)
      .then(data => { if (active) setPortDetail(data); })
      .catch(() => { if (active) setError("Detail pelabuhan gagal dimuat."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedPort?.id, projectId, canViewPorts]);

  useEffect(() => {
    let active = true;
    if (!selectedWarehouse || !projectId || !canViewWarehouses) { setWarehouseDetail(null); return; }
    setDetailLoading(true);
    get<Row>(`/warehouses/${encodeURIComponent(String(selectedWarehouse.id))}?projectId=${encodeURIComponent(projectId)}`)
      .then(data => { if (active) setWarehouseDetail(data); })
      .catch(() => { if (active) setError("Detail gudang gagal dimuat."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedWarehouse?.id, projectId, canViewWarehouses]);

  useEffect(() => {
    let active = true;
    if (!projectId || !canAssessVessel) return;
    get<{ vessels?: Row[] }>(`/vessels?projectId=${encodeURIComponent(projectId)}`)
      .then(data => { if (active) setVessels(Array.isArray(data?.vessels) ? data.vessels : []); })
      .catch(() => { if (active) setError("Daftar kapal tidak dapat dimuat."); });
    return () => { active = false; };
  }, [projectId, canAssessVessel]);

  useEffect(() => {
    let active = true;
    if ((!projectId && !platformAdmin) || !canEstimateRoutes) return;
    get<{ routes?: Row[] }>(`/port-routes?projectId=${encodeURIComponent(projectId)}`)
      .then(data => { if (active) setRoutes(Array.isArray(data?.routes) ? data.routes : []); })
      .catch(() => { if (active) setError("Referensi rute tidak dapat dimuat."); });
    return () => { active = false; };
  }, [projectId, canEstimateRoutes, platformAdmin]);

  async function saveMaster(event: FormEvent) {
    event.preventDefault(); setActionBusy(true); setMasterMessage("");
    try {
      const body = JSON.parse(masterDraft);
      const saved = masterId
        ? await patch<{record?:Row}>(`/p16/master/${masterResource}/${encodeURIComponent(masterId)}`, body)
        : await post<{record?:Row}>(`/p16/master/${masterResource}`, body);
      setMasterMessage("Data tersimpan sebagai Diajukan; verifikasi independen masih diperlukan.");
      if (saved?.record?.id) setMasterId(String(saved.record.id));
      if (canViewPorts) { const p = await get<{ports?:Row[]}>(`/ports?projectId=${encodeURIComponent(projectId)}`); setPorts(p.ports || []); }
      if (canViewWarehouses) { const w = await get<{warehouses?:Row[]}>(`/warehouses?projectId=${encodeURIComponent(projectId)}`); setWarehouses(w.warehouses || []); }
    } catch (e: any) { setMasterMessage(e?.message || "Data tidak berhasil disimpan."); }
    finally { setActionBusy(false); }
  }

  async function reviewPort() {
    if (!portDetail?.port?.id || reviewNote.trim().length < 5) return;
    setActionBusy(true);
    try {
      await patch(`/p16/master/ports/${encodeURIComponent(portDetail.port.id)}/review`, { status: "verified", reviewNote });
      setMasterMessage("Review pelabuhan tersimpan.");
      const refreshed = await get<Row>(`/ports/${encodeURIComponent(portDetail.port.id)}?projectId=${encodeURIComponent(projectId)}`);
      setPortDetail(refreshed);
    } catch (e: any) { setMasterMessage(e?.message || "Verifikasi gagal; pastikan reviewer berbeda dari pengaju dan bukti valid."); }
    finally { setActionBusy(false); }
  }

  async function reviewWarehouse() {
    if (!warehouseDetail?.warehouse?.id || reviewNote.trim().length < 5) return;
    setActionBusy(true);
    try {
      await patch(`/p16/master/warehouses/${encodeURIComponent(warehouseDetail.warehouse.id)}/review`, { status: "verified", reviewNote });
      setMasterMessage("Review gudang tersimpan.");
      const refreshed = await get<Row>(`/warehouses/${encodeURIComponent(warehouseDetail.warehouse.id)}?projectId=${encodeURIComponent(projectId)}`);
      setWarehouseDetail(refreshed);
    } catch (e: any) { setMasterMessage(e?.message || "Verifikasi gudang gagal; pastikan reviewer berbeda dari pengaju dan bukti valid."); }
    finally { setActionBusy(false); }
  }

  async function reviewPortEvidence(kind: "depth" | "tide", recordId: string, status: "verified" | "rejected") {
    if (!selectedPort?.id || reviewNote.trim().length < 5) return;
    setActionBusy(true);
    try {
      const path = kind === "depth" ? "port-depth-observations" : "port-tide-observations";
      await patch(`/${path}/${encodeURIComponent(recordId)}/review`, { status, reviewNote });
      setMasterMessage(`Review ${kind === "depth" ? "kedalaman" : "pasang-surut"} tersimpan.`);
      const refreshed = await get<Row>(`/ports/${encodeURIComponent(selectedPort.id)}?projectId=${encodeURIComponent(projectId)}`);
      setPortDetail(refreshed);
    } catch (e: any) { setMasterMessage(e?.message || "Review observasi gagal; pastikan reviewer berbeda dari pengaju."); }
    finally { setActionBusy(false); }
  }

  async function submitDepth(event: FormEvent) {
    event.preventDefault(); if (!selectedPort?.id) return; setActionBusy(true);
    try {
      await post(`/ports/${encodeURIComponent(selectedPort.id)}/depth-observations`, { projectId, ...depthDraft });
      setMasterMessage("Observasi kedalaman diajukan untuk review Admin.");
      const refreshed = await get<Row>(`/ports/${encodeURIComponent(selectedPort.id)}?projectId=${encodeURIComponent(projectId)}`); setPortDetail(refreshed);
    } catch (e: any) { setMasterMessage(e?.message || "Pengajuan kedalaman gagal."); }
    finally { setActionBusy(false); }
  }

  async function submitTide(event: FormEvent) {
    event.preventDefault(); if (!selectedPort?.id) return; setActionBusy(true);
    try {
      await post(`/ports/${encodeURIComponent(selectedPort.id)}/tide-observations`, { projectId, ...tideDraft });
      setMasterMessage("Observasi pasang-surut diajukan untuk review Admin.");
      const refreshed = await get<Row>(`/ports/${encodeURIComponent(selectedPort.id)}?projectId=${encodeURIComponent(projectId)}`); setPortDetail(refreshed);
    } catch (e: any) { setMasterMessage(e?.message || "Pengajuan pasang-surut gagal."); }
    finally { setActionBusy(false); }
  }

  async function assessVessel(event: FormEvent) {
    event.preventDefault(); if (!selectedPort?.id || !selectedVesselId) return; setActionBusy(true); setAssessment(null);
    try {
      const result = await post<{assessment:Row;limitations:string[]}>("/vessel-port-assessments", { projectId, portId: selectedPort.id, vesselId: selectedVesselId, berthId: selectedBerthId || undefined });
      setAssessment(result.assessment);
    } catch (e: any) { setMasterMessage(e?.message || "Penilaian awal kapal gagal."); }
    finally { setActionBusy(false); }
  }

  const detail = tab === "ports" ? portDetail : warehouseDetail;
  const list = tab === "ports" ? ports : warehouses;

  return (
    <div className="p16-page">
      <header className="p16-header">
        <div>
          <div className="p16-eyebrow">P2-B · P16 PORT & MULTIMODAL NETWORK</div>
          <h1>Jaringan Pelabuhan & Gudang</h1>
          <p>Referensi pelabuhan, terminal, batas operasional, layanan loading, fasilitas gudang dan reservasi dalam konteks Project aktif.</p>
        </div>
        {platformAdmin ? <div className="p16-header-actions"><button type="button" onClick={() => { setMasterResource("ports"); setMasterId(null); setMasterDraft(JSON.stringify({name:"",code:"",city:"",province:"",country_code:"ID",source_reference:"",evidence_sha256:""},null,2)); }}>Tambah Pelabuhan</button><button type="button" onClick={() => { setMasterResource("warehouses"); setMasterId(null); setMasterDraft(JSON.stringify({name:"",code:"",location:"",storage_mode:"",source_reference:"",evidence_sha256:""},null,2)); }}>Tambah Gudang</button></div> : <span className="p16-readonly">Data Project</span>}
      </header>

      <div className="p16-notice" role="status">
        <strong>Status provenance harus eksplisit.</strong> Data yang belum memiliki sumber, datum, tanggal pengukuran, checksum atau reviewer tetap ditampilkan sebagai belum diverifikasi. Penilaian kapal bersifat awal dan bukan izin navigasi.
      </div>

      {masterResource && platformAdmin && masterDraft && <form className="p16-editor" onSubmit={saveMaster}>
        <div className="p16-editor__heading"><strong>{masterId ? "Edit master P16" : "Tambah master P16"}</strong><button type="button" onClick={() => { setMasterDraft(""); setMasterId(null); }}>Tutup</button></div>
        <label>Jenis master
          <select value={masterResource} disabled={!!masterId} onChange={e => setMasterResource(e.target.value)}>
            {Object.entries({ports:"Pelabuhan",terminals:"Terminal",berths:"Berth",channels:"Channel",anchorages:"Anchorage","loading-services":"Layanan loading","port-equipment":"Peralatan pelabuhan","operating-limits":"Batas operasional",warehouses:"Gudang","warehouse-zones":"Zona gudang","warehouse-bins":"Bin gudang","warehouse-equipment":"Peralatan gudang",routes:"Rute PKS–pelabuhan"}).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>Data master (JSON, hanya kolom yang diizinkan akan disimpan)
          <textarea rows={7} value={masterDraft} onChange={e => setMasterDraft(e.target.value)} spellCheck={false} />
        </label>
        <div className="p16-editor__actions"><button type="submit" disabled={actionBusy}>{actionBusy ? "Menyimpan…" : "Simpan sebagai diajukan"}</button>{masterId && <button type="button" disabled={actionBusy || reviewNote.trim().length<5} onClick={async () => { setActionBusy(true); try { await patch(`/p16/master/${masterResource}/${encodeURIComponent(masterId)}/review`, {status:"verified",reviewNote}); setMasterMessage("Verifikasi independen tersimpan."); } catch (e:any) { setMasterMessage(e?.message || "Verifikasi gagal: reviewer harus berbeda dari pengaju."); } finally { setActionBusy(false); } }}>Verifikasi independen</button>}{masterMessage && <span role="status">{masterMessage}</span>}</div>
      </form>}
      {error && <div className="p16-error" role="alert">{error}</div>}

      <div className="p16-tabs" role="tablist" aria-label="Jenis data jaringan">
        {canViewPorts && <button type="button" role="tab" aria-selected={tab === "ports"} className={tab === "ports" ? "active" : ""} onClick={() => { setTab("ports"); setSelectedWarehouse(null); }}>Pelabuhan & Terminal <span>{ports.length}</span></button>}
        {canViewWarehouses && <button type="button" role="tab" aria-selected={tab === "warehouses"} className={tab === "warehouses" ? "active" : ""} onClick={() => { setTab("warehouses"); setSelectedPort(null); }}>Gudang & Kapabilitas <span>{warehouses.length}</span></button>}
      </div>

      {loading ? <Empty>Memuat data jaringan…</Empty> : (
        <div className="p16-layout">
          <section className="p16-list" aria-label={tab === "ports" ? "Daftar pelabuhan" : "Daftar gudang"}>
            {list.length === 0 ? <Empty>Belum ada data pada katalog ini.</Empty> : list.map(item => {
              const selected = tab === "ports" ? selectedPort?.id === item.id : selectedWarehouse?.id === item.id;
              return (
                <button type="button" key={item.id} className={`p16-list-card ${selected ? "selected" : ""}`} onClick={() => tab === "ports" ? setSelectedPort(item) : setSelectedWarehouse(item)}>
                  <span className="p16-list-card__top">
                    <strong>{item.name || item.code || "Tanpa nama"}</strong>
                    <Status value={item.effective_verification_status || item.verification_status} />
                  </span>
                  <span className="p16-muted">{[item.code, item.unlocode, item.city, item.province, item.country_code].filter(Boolean).join(" · ") || item.location || "Lokasi belum tersedia"}</span>
                  <span className="p16-muted">{tab === "ports" ? `${item.terminal_count || 0} terminal · ${item.depth_observation_count || 0} observasi kedalaman` : `${item.storage_mode || "mode belum diisi"} · ${item.zone_count || 0} zona · ${item.equipment_count || 0} peralatan`}</span>
                </button>
              );
            })}
          </section>

          <section className="p16-detail" aria-label="Detail jaringan">
            {!detail && !detailLoading ? <Empty>Pilih pelabuhan atau gudang untuk melihat rincian.</Empty> : detailLoading ? <Empty>Memuat rincian…</Empty> : tab === "ports" ? (
              <PortDetail data={portDetail} />
            ) : <WarehouseDetail data={warehouseDetail} />}
          </section>
        </div>
      )}
      {masterMessage && <div className="p16-notice" role="status">{masterMessage}</div>}
      {tab === "ports" && selectedPort && portDetail?.port && <section className="p16-workflows">
        <h3>Alur kerja pelabuhan · {portDetail.port.name}</h3>
        {platformAdmin && <div className="p16-workflow-row"><button type="button" onClick={() => { setMasterResource("ports"); setMasterId(String(portDetail.port.id)); setMasterDraft(JSON.stringify(portDetail.port,null,2)); }}>Edit master pelabuhan</button><input aria-label="Catatan verifikasi" placeholder="Catatan review independen (min. 5 karakter)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} /><button type="button" disabled={actionBusy || reviewNote.trim().length<5} onClick={reviewPort}>Verifikasi pelabuhan</button></div>}
        {platformAdmin && <div className="p16-workflow-form"><h4>Review observasi yang diajukan</h4><label>Catatan review independen<input value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Min. 5 karakter; reviewer tidak boleh sama dengan pengaju"/></label>
          {(portDetail.depthObservations||[]).filter((o:Row)=>o.quality_status==="submitted").map((o:Row)=><div className="p16-workflow-row" key={o.id}><span>Survei kedalaman · {o.depth_value} m · {o.survey_date}</span><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("depth",String(o.id),"verified")}>Verifikasi</button><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("depth",String(o.id),"rejected")}>Tolak</button></div>)}
          {(portDetail.tideObservations||[]).filter((o:Row)=>o.quality_status==="submitted").map((o:Row)=><div className="p16-workflow-row" key={o.id}><span>Pasang-surut · {o.tide_height_m} m · {o.observed_at}</span><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("tide",String(o.id),"verified")}>Verifikasi</button><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("tide",String(o.id),"rejected")}>Tolak</button></div>)}
          {!(portDetail.depthObservations||[]).some((o:Row)=>o.quality_status==="submitted") && !(portDetail.tideObservations||[]).some((o:Row)=>o.quality_status==="submitted") && <p className="p16-muted">Tidak ada observasi menunggu review.</p>}
        </div>}
        {canSubmitDepth && <form className="p16-workflow-form" onSubmit={submitDepth}><h4>Ajukan survei kedalaman</h4>
          <div className="p16-form-grid"><label>Kedalaman (m)<input required type="number" min="0.01" step="0.01" value={depthDraft.depthValue} onChange={e=>setDepthDraft({...depthDraft,depthValue:e.target.value})}/></label><label>Datum vertikal<input required value={depthDraft.depthDatum} onChange={e=>setDepthDraft({...depthDraft,depthDatum:e.target.value})}/></label><label>Waktu observasi<input required type="datetime-local" value={depthDraft.observedAt} onChange={e=>setDepthDraft({...depthDraft,observedAt:e.target.value})}/></label><label>Tanggal survei<input required type="date" value={depthDraft.surveyDate} onChange={e=>setDepthDraft({...depthDraft,surveyDate:e.target.value})}/></label><label>Otoritas survei<input required value={depthDraft.sourceAuthority} onChange={e=>setDepthDraft({...depthDraft,sourceAuthority:e.target.value})}/></label><label>Object key dokumen<input required value={depthDraft.evidenceObjectKey} onChange={e=>setDepthDraft({...depthDraft,evidenceObjectKey:e.target.value})}/></label><label>SHA-256 dokumen<input required pattern="[0-9a-f]{64}" value={depthDraft.evidenceSha256} onChange={e=>setDepthDraft({...depthDraft,evidenceSha256:e.target.value})}/></label></div>
          <p className="p16-muted">Dokumen harus sudah diunggah, checksum terverifikasi, dan berstatus Approved pada Project aktif.</p><button type="submit" disabled={actionBusy}>Ajukan kedalaman</button>
        </form>}
        {canSubmitDepth && <form className="p16-workflow-form" onSubmit={submitTide}><h4>Ajukan observasi pasang-surut</h4>
          <div className="p16-form-grid"><label>Tinggi pasang (m)<input required type="number" step="0.01" value={tideDraft.tideHeightM} onChange={e=>setTideDraft({...tideDraft,tideHeightM:e.target.value})}/></label><label>Datum vertikal<input required value={tideDraft.verticalDatum} onChange={e=>setTideDraft({...tideDraft,verticalDatum:e.target.value})}/></label><label>Waktu observasi<input required type="datetime-local" value={tideDraft.observedAt} onChange={e=>setTideDraft({...tideDraft,observedAt:e.target.value})}/></label><label>Sumber observasi<input required value={tideDraft.sourceReference} onChange={e=>setTideDraft({...tideDraft,sourceReference:e.target.value})}/></label><label>Object key dokumen<input required value={tideDraft.evidenceObjectKey} onChange={e=>setTideDraft({...tideDraft,evidenceObjectKey:e.target.value})}/></label><label>SHA-256 dokumen<input required pattern="[0-9a-f]{64}" value={tideDraft.evidenceSha256} onChange={e=>setTideDraft({...tideDraft,evidenceSha256:e.target.value})}/></label></div>
          <p className="p16-muted">Hanya dokumen Project berstatus Approved dan terverifikasi checksum yang diterima.</p><button type="submit" disabled={actionBusy}>Ajukan pasang-surut</button>
        </form>}
        {canAssessVessel && <form className="p16-workflow-form" onSubmit={assessVessel}><h4>Screening awal kompatibilitas kapal</h4><div className="p16-form-grid"><label>Kapal<select required value={selectedVesselId} onChange={e=>setSelectedVesselId(e.target.value)}><option value="">Pilih kapal</option>{vessels.map(v=><option key={v.id} value={v.id}>{v.name} · {v.imo_number || "IMO belum tersedia"} · {statusLabel(v.verification_status)}</option>)}</select></label><label>Berth (opsional)<select value={selectedBerthId} onChange={e=>setSelectedBerthId(e.target.value)}><option value="">Semua berth / tingkat port</option>{(portDetail.berths||[]).map((b:Row)=><option key={b.id} value={b.id}>{b.berth_code || b.name}</option>)}</select></label></div><button type="submit" disabled={actionBusy || !selectedVesselId}>Jalankan screening</button>
          {assessment && <div className="p16-assessment"><strong>Hasil: {statusLabel(assessment.result)}</strong><p>Mode advisory only. Tidak memberikan izin navigasi atau persetujuan sandar.</p></div>}
        </form>}
      </section>}
      {tab === "warehouses" && selectedWarehouse && warehouseDetail?.warehouse && platformAdmin && <section className="p16-workflows">
        <h3>Pengelolaan master gudang · {warehouseDetail.warehouse.name}</h3>
        <div className="p16-workflow-row"><button type="button" onClick={() => { setMasterResource("warehouses"); setMasterId(String(warehouseDetail.warehouse.id)); setMasterDraft(JSON.stringify(warehouseDetail.warehouse,null,2)); }}>Edit master gudang</button><input aria-label="Catatan verifikasi gudang" placeholder="Catatan review independen (min. 5 karakter)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} /><button type="button" disabled={actionBusy || reviewNote.trim().length<5} onClick={reviewWarehouse}>Verifikasi gudang</button></div>
      </section>}
      {canEstimateRoutes && <section className="p16-workflows"><h3>Referensi rute Project (advisory)</h3>{routes.length ? routes.map(r=><div className="p16-record" key={r.id}><div><strong>{r.pks_site_name} → {r.port_name}</strong><small>{r.route_mode} · {r.distance_km ?? "—"} km · {r.estimated_travel_minutes ?? "—"} menit · sumber: {r.source_reference || "belum ada"}</small></div><Status value={r.effective_verification_status}/></div>) : <p className="p16-muted">Belum ada referensi rute untuk PKS dan Project ini.</p>}<p className="p16-muted">Estimasi rute adalah referensi logistik, bukan instruksi pelayaran atau navigasi.</p></section>}
      <p className="p16-footer">Master global hanya dapat diubah Platform Admin. PM dan Terminal Representative dapat mengajukan bukti dalam Project aktif; hasil verifikasi memerlukan reviewer independen. Semua screening kapal/rute bersifat advisory.</p>
    </div>
  );
}

function PortDetail({ data }: { data: Row | null }) {
  if (!data?.port) return <Empty>Detail pelabuhan tidak tersedia.</Empty>;
  const port = data.port;
  const groups: Array<[string, Row[]]> = [
    ["Terminal", data.terminals || []], ["Berth / Jetty", data.berths || []],
    ["Channel", data.channels || []], ["Anchorage", data.anchorages || []],
    ["Observasi kedalaman", data.depthObservations || []], ["Observasi pasang-surut", data.tideObservations || []],
    ["Layanan loading", data.loadingServices || []], ["Peralatan pelabuhan", data.equipment || []],
    ["Batas operasional", data.operatingLimits || []],
  ];
  return (
    <div className="p16-detail-stack">
      <div className="p16-detail-heading"><div><span className="p16-eyebrow">PORT MASTER</span><h2>{port.name}</h2><p>{[port.city, port.province, port.country_code].filter(Boolean).join(", ") || port.address || "Lokasi belum diverifikasi"}</p></div><Status value={port.effective_verification_status || port.verification_status} /></div>
      <div className="p16-facts">
        <Fact label="Kode pelabuhan" value={port.code || port.national_code} />
        <Fact label="UN/LOCODE" value={port.unlocode} />
        <Fact label="Otoritas" value={port.authority_name} />
        <Fact label="Operator" value={port.operator_name} />
        <Fact label="Sumber" value={port.source_reference} />
        <Fact label="Terverifikasi pada" value={port.verified_at ? new Date(port.verified_at).toLocaleString("id-ID") : "Belum diverifikasi"} />
      </div>
      {groups.map(([title, rows]) => <div className="p16-group" key={title}><h3>{title} <span>{rows.length}</span></h3>{rows.length ? rows.map(row => <div className="p16-record" key={row.id}><div><strong>{row.name || row.channel_name || row.anchorage_code || row.berth_code || row.service_type || row.equipment_type || row.feature_type || row.authority_name || "Record"}</strong><small>{row.depth_value ? `${row.depth_value} ${row.depth_unit || "m"} · datum: ${row.vertical_datum || row.depth_datum || "tidak dicantumkan"}` : row.source_reference || row.source_authority || "Sumber belum dicantumkan"}</small></div><Status value={row.effective_verification_status || row.quality_status || row.approval_status || row.verification_status || row.status || row.condition_status} /></div>) : <p className="p16-muted">Belum ada record.</p>}</div>)}
      <p className="p16-warning">Kompatibilitas kapal belum dihitung di workspace ini. Kedalaman tanpa datum, tanggal survei dan sumber otoritatif tidak boleh dipakai sebagai dasar keputusan operasional.</p>
    </div>
  );
}

function WarehouseDetail({ data }: { data: Row | null }) {
  if (!data?.warehouse) return <Empty>Detail gudang tidak tersedia.</Empty>;
  const w = data.warehouse;
  return (
    <div className="p16-detail-stack">
      <div className="p16-detail-heading"><div><span className="p16-eyebrow">WAREHOUSE MASTER</span><h2>{w.name}</h2><p>{w.location || [w.port_name, w.terminal_name].filter(Boolean).join(" · ") || "Lokasi belum tersedia"}</p></div><Status value={w.effective_verification_status || w.verification_status} /></div>
      <div className="p16-facts">
        <Fact label="Kode" value={w.code} /><Fact label="Mode penyimpanan" value={w.storage_mode} />
        <Fact label="Kapasitas (MT)" value={w.storage_capacity_mt} /><Fact label="Luas lantai (m²)" value={w.floor_area_m2} />
        <Fact label="Volume guna (m³)" value={w.usable_volume_m3} /><Fact label="Koordinat" value={w.latitude && w.longitude ? `${w.latitude}, ${w.longitude}` : null} />
      </div>
      <div className="p16-group"><h3>Zona gudang <span>{(data.zones || []).length}</span></h3>{(data.zones || []).length ? data.zones.map((z: Row) => <div className="p16-record" key={z.id}><div><strong>{z.zone_code} · {z.zone_type}</strong><small>Kapasitas: {z.capacity || "—"} {z.unit_code || ""}</small></div><Status value={z.effective_verification_status || z.verification_status || z.status} /></div>) : <p className="p16-muted">Belum ada zona.</p>}</div>
      <div className="p16-group"><h3>Bin <span>{(data.bins || []).length}</span></h3>{(data.bins || []).length ? data.bins.map((b: Row) => <div className="p16-record" key={b.id}><div><strong>{b.bin_code}</strong><small>Kapasitas: {b.capacity || "—"} {b.unit_code || ""}</small></div><Status value={b.effective_verification_status || b.verification_status || b.status} /></div>) : <p className="p16-muted">Belum ada bin.</p>}</div>
      <div className="p16-group"><h3>Peralatan <span>{(data.equipment || []).length}</span></h3>{(data.equipment || []).length ? data.equipment.map((e: Row) => <div className="p16-record" key={e.id}><div><strong>{e.equipment_type}</strong><small>{e.asset_code || "Kode aset belum tersedia"} · {e.rated_capacity || "—"} {e.capacity_unit || ""}</small></div><Status value={e.effective_verification_status || e.verification_status || e.condition_status} /></div>) : <p className="p16-muted">Belum ada peralatan.</p>}</div>
      <div className="p16-group"><h3>Reservasi Project ini <span>{(data.reservations || []).length}</span></h3>{(data.reservations || []).length ? data.reservations.map((r: Row) => <div className="p16-record" key={r.id}><div><strong>{r.reserved_quantity} {r.unit_code}</strong><small>{new Date(r.window_start).toLocaleString("id-ID")} – {new Date(r.window_end).toLocaleString("id-ID")}</small></div><Status value={r.status} /></div>) : <p className="p16-muted">Belum ada reservasi Project.</p>}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) {
  return <div className="p16-fact"><span>{label}</span><strong>{value === null || value === undefined || value === "" ? "—" : String(value)}</strong></div>;
}
