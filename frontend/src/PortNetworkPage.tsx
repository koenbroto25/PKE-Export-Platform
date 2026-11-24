import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { get, post, patch, del } from "./api";
import PkeLogisticsScenarioWorkbench from "./PkeLogisticsScenarioWorkbench";
import MaritimeSourceRegistry from "./MaritimeSourceRegistry";
import MaritimeIdentityReview from "./MaritimeIdentityReview";

type Row = Record<string, any>;
type Props = { projectId: string; activeUser?: { id?: string; projectPermissions?: string[]; platformAdmin?: boolean } };

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
  const [documentRequirements, setDocumentRequirements] = useState<Row[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<Row[]>([]);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState("");
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [depthDraft, setDepthDraft] = useState({ depthValue: "", depthDatum: "", observedAt: "", surveyDate: "", sourceAuthority: "", evidenceObjectKey: "", evidenceSha256: "" });
  const [tideDraft, setTideDraft] = useState({ tideHeightM: "", verticalDatum: "", observedAt: "", sourceReference: "", evidenceObjectKey: "", evidenceSha256: "" });
  const [vessels, setVessels] = useState<Row[]>([]);
  const [routes, setRoutes] = useState<Row[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState("");
  const [selectedBerthId, setSelectedBerthId] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [p17Advisory, setP17Advisory] = useState<Row | null>(null);
  const [assessment, setAssessment] = useState<Row | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const permissions = activeUser?.projectPermissions || [];
  const projectQuery = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const platformAdmin = activeUser?.platformAdmin === true;
  const canViewPorts = platformAdmin || permissions.includes("port.view");
  const canViewWarehouses = platformAdmin || permissions.includes("warehouse.view");
  const canSubmitDepth = permissions.includes("port.depth.submit");
  const canEstimateRoutes = platformAdmin || permissions.includes("route.estimate");
  const canAssessVessel = permissions.includes("vessel.port.assess") && permissions.includes("vessel.view") && permissions.includes("port.view");
  const canUploadDocuments = platformAdmin || permissions.includes("documents.create");
  const canManageDocuments = platformAdmin || permissions.includes("documents.view") || permissions.includes("documents.create") || permissions.includes("documents.update");
  const canReviewDocuments = platformAdmin || permissions.includes("documents.update");
  const eligibleEvidence = projectDocuments.filter(d=>d.status==="approved"&&d.uploadVerifiedAt&&d.storageBucket==="pke-private-documents"&&(!d.expiryDate||new Date(d.expiryDate).getTime()>=Date.now()));


  useEffect(() => {
    if (!canViewPorts && canViewWarehouses) setTab("warehouses");
  }, [canViewPorts, canViewWarehouses]);
  useEffect(() => {
    setSelectedTerminalId("");
    setP17Advisory(null);
  }, [selectedPort?.id]);

  useEffect(() => {
    let active = true;
    if (!projectId && !platformAdmin) return;
    setLoading(true);
    setError("");
    const requests: Promise<any>[] = [];
    if (canViewPorts) requests.push(get<{ ports?: Row[] }>(`/ports${projectQuery}`).then(data => { if (active) setPorts(Array.isArray(data?.ports) ? data.ports : []); }).catch(() => { if (active) setError("Katalog pelabuhan tidak dapat dimuat."); }));
    if (canViewWarehouses) requests.push(get<{ warehouses?: Row[] }>(`/warehouses${projectQuery}`).then(data => { if (active) setWarehouses(Array.isArray(data?.warehouses) ? data.warehouses : []); }).catch(() => { if (active) setError("Katalog gudang tidak dapat dimuat."); }));
    Promise.allSettled(requests).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, platformAdmin, canViewPorts, canViewWarehouses]);

  useEffect(() => {
    let active = true;
    if (!selectedPort || (!projectId && !platformAdmin) || !canViewPorts) { setPortDetail(null); return; }
    setDetailLoading(true);
    get<Row>(`/ports/${encodeURIComponent(String(selectedPort.id))}${projectQuery}`)
      .then(data => { if (active) setPortDetail(data); })
      .catch(() => { if (active) setError("Detail pelabuhan gagal dimuat."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedPort?.id, projectId, canViewPorts, platformAdmin]);

  useEffect(() => {
    let active = true;
    if (!selectedWarehouse || (!projectId && !platformAdmin) || !canViewWarehouses) { setWarehouseDetail(null); return; }
    setDetailLoading(true);
    get<Row>(`/warehouses/${encodeURIComponent(String(selectedWarehouse.id))}${projectQuery}`)
      .then(data => { if (active) setWarehouseDetail(data); })
      .catch(() => { if (active) setError("Detail gudang gagal dimuat."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedWarehouse?.id, projectId, canViewWarehouses, platformAdmin]);

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
    if (!projectId || !canManageDocuments) { setDocumentRequirements([]); setProjectDocuments([]); return; }
    setSelectedRequirementId("");
    Promise.all([
      get<{documentRequirements?:Row[]}>(`/projects/${encodeURIComponent(projectId)}/document-requirements`),
      get<{documents?:Row[]}>(`/projects/${encodeURIComponent(projectId)}/documents`)
    ]).then(([requirements,documents]) => {
      if (!active) return;
      const reqs=Array.isArray(requirements?.documentRequirements)?requirements.documentRequirements:[];
      setDocumentRequirements(reqs);
      setProjectDocuments(Array.isArray(documents?.documents)?documents.documents:[]);
      if (!selectedRequirementId && reqs[0]?.id) setSelectedRequirementId(String(reqs[0].id));
    }).catch(() => { if (active) setEvidenceMessage("Daftar dokumen Project tidak dapat dimuat."); });
    return () => { active=false; };
  }, [projectId, canManageDocuments]);

  useEffect(() => {
    let active = true;
    if ((!projectId && !platformAdmin) || !canEstimateRoutes) return;
    get<{ routes?: Row[] }>(`/port-routes${projectQuery}`)
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
      const refreshed = await get<Row>(`/ports/${encodeURIComponent(selectedPort.id)}${projectQuery}`);
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

  async function refreshProjectDocuments() {
    const [requirements,documents]=await Promise.all([
      get<{documentRequirements?:Row[]}>(`/projects/${encodeURIComponent(projectId)}/document-requirements`),
      get<{documents?:Row[]}>(`/projects/${encodeURIComponent(projectId)}/documents`)
    ]);
    setDocumentRequirements(requirements.documentRequirements||[]);
    setProjectDocuments(documents.documents||[]);
  }

  async function uploadProjectEvidence(event: FormEvent) {
    event.preventDefault();
    if (!evidenceFile || !selectedRequirementId || !projectId) return;
    setActionBusy(true); setEvidenceMessage("");
    try {
      if (evidenceFile.size<=0 || evidenceFile.size>50*1024*1024) throw new Error("Ukuran dokumen harus 1 byte–50 MB.");
      const bytes=await evidenceFile.arrayBuffer();
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const sha256=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
      const extension=evidenceFile.name.toLowerCase().slice(evidenceFile.name.lastIndexOf("."));
      const inferredMime:Record<string,string>={".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".csv":"text/csv"};
      const mimeType=evidenceFile.type||inferredMime[extension];
      if(!mimeType) throw new Error("Format evidence harus PDF, PNG, JPEG, WEBP, atau CSV.");
      const safeName=evidenceFile.name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g,"-").slice(-120)||"evidence";
      const objectKey=`projects/${projectId}/documents/${selectedRequirementId}/${Date.now()}-${safeName}`;
      const signed=await post<{upload:{uploadUrl:string;requiredHeaders:Record<string,string>}}>(
        "/storage/presigned-upload",{objectKey,mimeType,contentLength:evidenceFile.size,filename:evidenceFile.name}
      );
      const uploaded=await fetch(signed.upload.uploadUrl,{method:"PUT",headers:signed.upload.requiredHeaders,body:evidenceFile,redirect:"error"});
      if(!uploaded.ok) throw new Error(`Upload object gagal (HTTP ${uploaded.status}).`);
      await post(`/projects/${encodeURIComponent(projectId)}/documents`,{
        projectRequirementId:selectedRequirementId,fileReference:objectKey,objectKey,originalFilename:evidenceFile.name,
        mimeType,sha256Checksum:sha256,contentLength:evidenceFile.size
      });
      setDepthDraft(v=>({...v,evidenceObjectKey:objectKey,evidenceSha256:sha256}));
      setTideDraft(v=>({...v,evidenceObjectKey:objectKey,evidenceSha256:sha256}));
      setEvidenceFile(null);
      setEvidenceMessage("Dokumen berhasil diunggah, diverifikasi ulang dari object storage, dan didaftarkan dengan status Uploaded. Dokumen belum dapat dipakai sebagai evidence sampai reviewer independen menyetujuinya.");
      await refreshProjectDocuments();
    } catch(e:any) { setEvidenceMessage(e?.message||"Upload evidence gagal; dokumen belum didaftarkan."); }
    finally { setActionBusy(false); }
  }

  async function deleteMaster() {
    if(!masterId || !window.confirm("Hapus record master P16 ini? Record yang sudah dipakai data operasional akan ditolak database.")) return;
    setActionBusy(true); setMasterMessage("");
    try {
      await del(`/p16/master/${masterResource}/${encodeURIComponent(masterId)}`);
      setMasterId(null); setMasterDraft(""); setMasterMessage("Record master berhasil dihapus.");
      if(canViewPorts){const p=await get<{ports?:Row[]}>(`/ports${projectQuery}`);setPorts(p.ports||[]);}
      if(canViewWarehouses){const w=await get<{warehouses?:Row[]}>(`/warehouses${projectQuery}`);setWarehouses(w.warehouses||[]);}
    } catch(e:any) { setMasterMessage(e?.message||"Penghapusan ditolak karena record masih direferensikan atau tidak diizinkan."); }
    finally { setActionBusy(false); }
  }

  async function reviewProjectDocument(documentId:string,status:"under_review"|"approved"|"rejected") {
    setActionBusy(true); setEvidenceMessage("");
    try {
      await patch(`/documents/${encodeURIComponent(documentId)}`,{status,notes:reviewNote.trim()||undefined});
      await refreshProjectDocuments();
      setEvidenceMessage(status==="approved"?"Dokumen disetujui setelah pemeriksaan independen.":status==="rejected"?"Dokumen ditolak.":"Dokumen masuk antrean review.");
    } catch(e:any) { setEvidenceMessage(e?.message||"Perubahan status dokumen ditolak oleh aturan review."); }
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

  async function runP17Advisory() {
    if (!selectedPort?.id || !selectedVesselId || !selectedTerminalId) return;
    setActionBusy(true); setP17Advisory(null); setMasterMessage("");
    try {
      const result = await get<Row>(`/projects/${encodeURIComponent(projectId)}/vessels/${encodeURIComponent(selectedVesselId)}/advisory-screening?portId=${encodeURIComponent(String(selectedPort.id))}&terminalId=${encodeURIComponent(selectedTerminalId)}`);
      setP17Advisory(result);
    } catch (e: any) { setMasterMessage(e?.message || "Advisory vessel/terminal screening P17 gagal."); }
    finally { setActionBusy(false); }
  }

  const detail = tab === "ports" ? portDetail : warehouseDetail;
  const list = tab === "ports" ? ports : warehouses;
  const typedMasterFields: Record<string, Array<{ key: string; label: string; type?: string; required?: boolean }>> = {
    ports: [
      { key: "name", label: "Nama pelabuhan", required: true }, { key: "code", label: "Kode nasional" },
      { key: "unlocode", label: "UN/LOCODE" }, { key: "city", label: "Kota" }, { key: "province", label: "Provinsi / wilayah" },
      { key: "country_code", label: "Kode negara (ISO)" }, { key: "latitude", label: "Latitude", type: "number" },
      { key: "longitude", label: "Longitude", type: "number" }, { key: "authority_name", label: "Otoritas pelabuhan" },
      { key: "operator_name", label: "Operator" }, { key: "source_reference", label: "Referensi sumber", required: true },
      { key: "evidence_sha256", label: "Evidence SHA-256", required: true },
    ],
    warehouses: [
      { key: "name", label: "Nama gudang", required: true }, { key: "code", label: "Kode gudang" },
      { key: "location", label: "Alamat / lokasi" }, { key: "port_id", label: "ID pelabuhan terkait" },
      { key: "terminal_id", label: "ID terminal (jika ada)" }, { key: "storage_mode", label: "Mode penyimpanan" },
      { key: "storage_capacity_mt", label: "Kapasitas (MT)", type: "number" }, { key: "floor_area_m2", label: "Luas lantai (m²)", type: "number" },
      { key: "usable_volume_m3", label: "Volume guna (m³)", type: "number" }, { key: "latitude", label: "Latitude", type: "number" },
      { key: "longitude", label: "Longitude", type: "number" }, { key: "source_reference", label: "Referensi sumber", required: true },
      { key: "evidence_sha256", label: "Evidence SHA-256", required: true },
    ],
    routes: [
      { key: "pks_site_id", label: "ID fasilitas PKS/KCP", required: true }, { key: "port_id", label: "ID pelabuhan", required: true },
      { key: "route_mode", label: "Moda rute (road/river/sea/multimodal)", required: true },
      { key: "distance_km", label: "Jarak (km)", type: "number" },
      { key: "distance_method", label: "Metode jarak (road_network/operator_quote/gps_track)", required: true },
      { key: "route_notes", label: "Catatan rute" }, { key: "source_reference", label: "Referensi sumber", required: true },
      { key: "evidence_sha256", label: "Evidence SHA-256", required: true },
    ],
  };
  const masterDraftValue = (() => { try { return JSON.parse(masterDraft || "{}") as Row; } catch { return {}; } })();
  const updateMasterField = (key: string, value: string) => {
    setMasterDraft(JSON.stringify({ ...masterDraftValue, [key]: value }, null, 2));
  };

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

      <PkeLogisticsScenarioWorkbench projectId={projectId} activeUser={activeUser} />
      {platformAdmin && <MaritimeSourceRegistry platformAdmin={platformAdmin} />}
      {platformAdmin && <MaritimeIdentityReview platformAdmin={platformAdmin} />}

      {masterResource && platformAdmin && masterDraft && <form className="p16-editor" onSubmit={saveMaster}>
        <div className="p16-editor__heading"><strong>{masterId ? "Edit master P16" : "Tambah master P16"}</strong><button type="button" onClick={() => { setMasterDraft(""); setMasterId(null); }}>Tutup</button></div>
        <label>Jenis master
          <select value={masterResource} disabled={!!masterId} onChange={e => setMasterResource(e.target.value)}>
            {Object.entries({ports:"Pelabuhan",terminals:"Terminal",berths:"Berth",channels:"Channel",anchorages:"Anchorage","loading-services":"Layanan loading","port-equipment":"Peralatan pelabuhan","operating-limits":"Batas operasional",warehouses:"Gudang","warehouse-zones":"Zona gudang","warehouse-bins":"Bin gudang","warehouse-equipment":"Peralatan gudang",routes:"Rute PKS–pelabuhan"}).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {typedMasterFields[masterResource] ? <>
          <div className="p16-notice"><strong>Formulir master terstruktur.</strong> Isi hanya informasi yang didukung sumber. Record baru berstatus diajukan dan memerlukan reviewer independen; SHA-256 harus sesuai dengan evidence yang disimpan.</div>
          <div className="p16-form-grid">{typedMasterFields[masterResource].map(field => <label key={field.key}>{field.label}
            <input type={field.type || "text"} required={!!field.required} value={String(masterDraftValue[field.key] ?? "")} onChange={e => updateMasterField(field.key, e.target.value)} />
          </label>)}</div>
          <details><summary>Advanced JSON (opsional)</summary><textarea rows={7} value={masterDraft} onChange={e => setMasterDraft(e.target.value)} spellCheck={false} /></details>
        </> : <label>Data master (JSON, hanya kolom yang diizinkan akan disimpan)
          <textarea rows={7} value={masterDraft} onChange={e => setMasterDraft(e.target.value)} spellCheck={false} />
        </label>}
        <div className="p16-editor__actions"><button type="submit" disabled={actionBusy}>{actionBusy ? "Menyimpan…" : "Simpan sebagai diajukan"}</button>{masterId && <button type="button" disabled={actionBusy || reviewNote.trim().length<5} onClick={async () => { setActionBusy(true); try { await patch(`/p16/master/${masterResource}/${encodeURIComponent(masterId)}/review`, {status:"verified",reviewNote}); setMasterMessage("Verifikasi independen tersimpan."); } catch (e:any) { setMasterMessage(e?.message || "Verifikasi gagal: reviewer harus berbeda dari pengaju."); } finally { setActionBusy(false); } }}>Verifikasi independen</button>}{masterId && <button type="button" className="p16-danger" disabled={actionBusy} onClick={deleteMaster}>Hapus master</button>}{masterMessage && <span role="status">{masterMessage}</span>}</div>
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
      {projectId && canManageDocuments && <section className="p16-workflows">
        <h3>Dokumen evidence Project</h3>
        {canUploadDocuments && <form className="p16-workflow-form" onSubmit={uploadProjectEvidence}>
          <p className="p16-muted">Unggah bukti resmi ke bucket privat. Sistem menghitung SHA-256, memeriksa ulang ukuran dan isi object dari storage, lalu mencatat dokumen pada Project aktif.</p>
          <div className="p16-form-grid">
            <label>Jenis persyaratan dokumen<select required value={selectedRequirementId} onChange={e=>setSelectedRequirementId(e.target.value)}>
              <option value="">Pilih persyaratan</option>{documentRequirements.map(r=><option key={r.id} value={r.id}>{r.documentCode} · {r.documentName}</option>)}
            </select></label>
            <label>File evidence<input required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv" onChange={e=>setEvidenceFile(e.target.files?.[0]||null)}/></label>
          </div>
          <button type="submit" disabled={actionBusy||!evidenceFile||!selectedRequirementId}>{actionBusy?"Memproses…":"Unggah & verifikasi object"}</button>
        </form>}
        {evidenceMessage && <p role="status" className="p16-muted">{evidenceMessage}</p>}
        {canReviewDocuments && <label>Catatan review dokumen<input value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Catatan independen (wajib saat menolak)"/></label>}
        {projectDocuments.length ? projectDocuments.map(d=><div className="p16-record" key={d.id}>
          <div><strong>{d.documentCode} · {d.originalFilename}</strong><small>{d.mimeType} · {d.fileSizeBytes||"—"} bytes · SHA-256 {String(d.sha256Checksum||"").slice(0,16)}…</small></div>
          <Status value={d.status}/>
          {canReviewDocuments && d.status==="uploaded" && <button type="button" disabled={actionBusy} onClick={()=>reviewProjectDocument(String(d.id),"under_review")}>Mulai review</button>}
          {canReviewDocuments && d.status==="under_review" && <><button type="button" disabled={actionBusy||String(d.uploadedBy||"")===String(activeUser?.id||"")} onClick={()=>reviewProjectDocument(String(d.id),"approved")}>Setujui</button><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewProjectDocument(String(d.id),"rejected")}>Tolak</button></>}
        </div>) : <p className="p16-muted">Belum ada dokumen terdaftar pada Project ini.</p>}
      </section>}
      {tab === "ports" && selectedPort && portDetail?.port && <section className="p16-workflows">
        <h3>Alur kerja pelabuhan · {portDetail.port.name}</h3>
        {platformAdmin && <div className="p16-workflow-row"><button type="button" onClick={() => { setMasterResource("ports"); setMasterId(String(portDetail.port.id)); setMasterDraft(JSON.stringify(portDetail.port,null,2)); }}>Edit master pelabuhan</button><input aria-label="Catatan verifikasi" placeholder="Catatan review independen (min. 5 karakter)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} /><button type="button" disabled={actionBusy || reviewNote.trim().length<5} onClick={reviewPort}>Verifikasi pelabuhan</button></div>}
        {platformAdmin && <div className="p16-workflow-form"><h4>Review observasi yang diajukan</h4><label>Catatan review independen<input value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Min. 5 karakter; reviewer tidak boleh sama dengan pengaju"/></label>
          {(portDetail.depthObservations||[]).filter((o:Row)=>o.quality_status==="submitted").map((o:Row)=><div className="p16-workflow-row" key={o.id}><span>Survei kedalaman · {o.depth_value} m · {o.survey_date}</span><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("depth",String(o.id),"verified")}>Verifikasi</button><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("depth",String(o.id),"rejected")}>Tolak</button></div>)}
          {(portDetail.tideObservations||[]).filter((o:Row)=>o.quality_status==="submitted").map((o:Row)=><div className="p16-workflow-row" key={o.id}><span>Pasang-surut · {o.tide_height_m} m · {o.observed_at}</span><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("tide",String(o.id),"verified")}>Verifikasi</button><button type="button" disabled={actionBusy||reviewNote.trim().length<5} onClick={()=>reviewPortEvidence("tide",String(o.id),"rejected")}>Tolak</button></div>)}
          {!(portDetail.depthObservations||[]).some((o:Row)=>o.quality_status==="submitted") && !(portDetail.tideObservations||[]).some((o:Row)=>o.quality_status==="submitted") && <p className="p16-muted">Tidak ada observasi menunggu review.</p>}
        </div>}
        {canSubmitDepth && <form className="p16-workflow-form" onSubmit={submitDepth}><h4>Ajukan survei kedalaman</h4>
          <div className="p16-form-grid"><label>Kedalaman (m)<input required type="number" min="0.01" step="0.01" value={depthDraft.depthValue} onChange={e=>setDepthDraft({...depthDraft,depthValue:e.target.value})}/></label><label>Datum vertikal<input required value={depthDraft.depthDatum} onChange={e=>setDepthDraft({...depthDraft,depthDatum:e.target.value})}/></label><label>Waktu observasi<input required type="datetime-local" value={depthDraft.observedAt} onChange={e=>setDepthDraft({...depthDraft,observedAt:e.target.value})}/></label><label>Tanggal survei<input required type="date" value={depthDraft.surveyDate} onChange={e=>setDepthDraft({...depthDraft,surveyDate:e.target.value})}/></label><label>Otoritas survei<input required value={depthDraft.sourceAuthority} onChange={e=>setDepthDraft({...depthDraft,sourceAuthority:e.target.value})}/></label><label>Dokumen evidence Approved<select required value={depthDraft.evidenceObjectKey} onChange={e=>{const d=eligibleEvidence.find(x=>x.objectKey===e.target.value);setDepthDraft({...depthDraft,evidenceObjectKey:d?.objectKey||"",evidenceSha256:d?.sha256Checksum||""});}}><option value="">Pilih dokumen terverifikasi</option>{eligibleEvidence.map(d=><option key={d.id} value={d.objectKey}>{d.documentCode} · {d.originalFilename}</option>)}</select></label></div>
          <p className="p16-muted">Dokumen harus sudah diunggah, checksum terverifikasi, dan berstatus Approved pada Project aktif.</p><button type="submit" disabled={actionBusy}>Ajukan kedalaman</button>
        </form>}
        {canSubmitDepth && <form className="p16-workflow-form" onSubmit={submitTide}><h4>Ajukan observasi pasang-surut</h4>
          <div className="p16-form-grid"><label>Tinggi pasang (m)<input required type="number" step="0.01" value={tideDraft.tideHeightM} onChange={e=>setTideDraft({...tideDraft,tideHeightM:e.target.value})}/></label><label>Datum vertikal<input required value={tideDraft.verticalDatum} onChange={e=>setTideDraft({...tideDraft,verticalDatum:e.target.value})}/></label><label>Waktu observasi<input required type="datetime-local" value={tideDraft.observedAt} onChange={e=>setTideDraft({...tideDraft,observedAt:e.target.value})}/></label><label>Sumber observasi<input required value={tideDraft.sourceReference} onChange={e=>setTideDraft({...tideDraft,sourceReference:e.target.value})}/></label><label>Dokumen evidence Approved<select required value={tideDraft.evidenceObjectKey} onChange={e=>{const d=eligibleEvidence.find(x=>x.objectKey===e.target.value);setTideDraft({...tideDraft,evidenceObjectKey:d?.objectKey||"",evidenceSha256:d?.sha256Checksum||""});}}><option value="">Pilih dokumen terverifikasi</option>{eligibleEvidence.map(d=><option key={d.id} value={d.objectKey}>{d.documentCode} · {d.originalFilename}</option>)}</select></label></div>
          <p className="p16-muted">Hanya dokumen Project berstatus Approved dan terverifikasi checksum yang diterima.</p><button type="submit" disabled={actionBusy}>Ajukan pasang-surut</button>
        </form>}
        {canAssessVessel && <form className="p16-workflow-form" onSubmit={assessVessel}><h4>Screening awal kompatibilitas kapal</h4><div className="p16-form-grid"><label>Kapal<select required value={selectedVesselId} onChange={e=>setSelectedVesselId(e.target.value)}><option value="">Pilih kapal</option>{vessels.map(v=><option key={v.id} value={v.id}>{v.name} · {v.imo_number || "IMO belum tersedia"} · {statusLabel(v.verification_status)}</option>)}</select></label><label>Berth (opsional)<select value={selectedBerthId} onChange={e=>setSelectedBerthId(e.target.value)}><option value="">Semua berth / tingkat port</option>{(portDetail.berths||[]).map((b:Row)=><option key={b.id} value={b.id}>{b.berth_code || b.name}</option>)}</select></label></div><button type="submit" disabled={actionBusy || !selectedVesselId}>Jalankan screening</button>
          {assessment && <div className="p16-assessment"><strong>Hasil: {statusLabel(assessment.result)}</strong><p>Mode advisory only. Tidak memberikan izin navigasi atau persetujuan sandar.</p></div>}
        </form>}
        <form className="p16-workflow-form" onSubmit={e=>{e.preventDefault();void runP17Advisory();}}>
          <h4>P17-C · Advisory kompatibilitas kapal–terminal PKE</h4>
          <p>Perbandingan dimensi kapal dengan batas terminal yang diketahui. Hasil tidak merupakan izin sandar atau clearance operasional.</p>
          <label>Terminal tujuan<select required value={selectedTerminalId} onChange={e=>{setSelectedTerminalId(e.target.value);setP17Advisory(null);}}>
            <option value="">Pilih terminal</option>{(portDetail?.terminals||[]).map((t:Row)=><option key={t.id} value={t.id}>{t.name} · {t.status||"status unknown"}</option>)}
          </select></label>
          <button type="submit" disabled={actionBusy||!selectedVesselId||!selectedTerminalId}>Jalankan advisory P17-C</button>
          {p17Advisory&&<div className="p16-assessment"><strong>Hasil advisory: {p17Advisory.advisoryStatus}</strong><p>Operational clearance: {String(p17Advisory.operationalClearance===true)}</p>{(p17Advisory.checks||[]).map((x:Row)=><p key={x.code}>{x.code}: {x.status}</p>)}<small>{p17Advisory.disclaimer}</small></div>}
        </form>
      </section>}
      {tab === "warehouses" && selectedWarehouse && warehouseDetail?.warehouse && platformAdmin && <section className="p16-workflows">
        <h3>Pengelolaan master gudang · {warehouseDetail.warehouse.name}</h3>
        <div className="p16-workflow-row"><button type="button" onClick={() => { setMasterResource("warehouses"); setMasterId(String(warehouseDetail.warehouse.id)); setMasterDraft(JSON.stringify(warehouseDetail.warehouse,null,2)); }}>Edit master gudang</button><input aria-label="Catatan verifikasi gudang" placeholder="Catatan review independen (min. 5 karakter)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} /><button type="button" disabled={actionBusy || reviewNote.trim().length<5} onClick={reviewWarehouse}>Verifikasi gudang</button></div>
      </section>}
      {canEstimateRoutes && <section className="p16-workflows"><h3>Prioritas rute PKS → port ekspor PKE (advisory)</h3><p className="p16-muted">Rujukan utama hanya diberikan pada rute darat yang terverifikasi, PKS operasional dan terverifikasi, port terverifikasi, serta layanan loading PKE aktif dan terverifikasi. Urutan berikutnya memakai rute darat terverifikasi terdekat; data yang belum lengkap tidak dinaikkan menjadi rujukan utama.</p>{routes.length ? routes.map(r=><div className="p16-record" key={r.id}><div><strong>{r.pks_site_name} · {r.producer_company_name || "Produsen belum ditautkan"} → {r.port_name} {r.is_primary_reference && <span className="p16-readonly">· Rujukan utama PKE</span>}</strong><small>{r.route_mode} · {r.distance_km ?? "—"} km · {r.estimated_travel_minutes ?? "—"} menit · metode: {r.distance_method || "belum ditentukan"} · produsen: {r.producer_company_verified ? "terverifikasi" : "belum terverifikasi"} · gudang terverifikasi: {r.verified_warehouse_count ?? 0} · layanan loading PKE: {r.pke_loading_service_verified ? "terverifikasi" : "belum terverifikasi"} · sumber: {r.source_reference || "belum ada"}</small></div><Status value={r.effective_verification_status}/></div>) : <p className="p16-muted">Belum ada referensi rute untuk PKS dan Project ini. Hubungkan PKS ke port melalui master rute setelah lokasi dan fasilitas diverifikasi.</p>}<p className="p16-muted">Jarak dan waktu adalah referensi transportasi darat, bukan instruksi pelayaran atau navigasi. Port yang hanya dekat secara garis lurus belum tentu menjadi pilihan operasional.</p></section>}
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
      <p className="p16-warning">Screening kompatibilitas kapal tersedia pada formulir di atas. Hasil hanya advisory: data kapal/port tanpa sumber, datum, tanggal survei, batas operasional, atau observasi pasang-surut yang masih berlaku akan menghasilkan insufficient_data/manual_review_required dan tidak pernah menjadi izin sandar atau navigasi.</p>
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
