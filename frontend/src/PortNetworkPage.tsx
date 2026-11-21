import { useEffect, useState, type ReactNode } from "react";
import { get } from "./api";

type Row = Record<string, any>;
type Props = { projectId: string };

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

export default function PortNetworkPage({ projectId }: Props) {
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

  useEffect(() => {
    let active = true;
    if (!projectId) return;
    setLoading(true);
    setError("");
    Promise.all([
      get(`/ports?projectId=${encodeURIComponent(projectId)}`),
      get(`/warehouses?projectId=${encodeURIComponent(projectId)}`),
    ]).then(([portData, warehouseData]) => {
      if (!active) return;
      setPorts(Array.isArray(portData?.ports) ? portData.ports : []);
      setWarehouses(Array.isArray(warehouseData?.warehouses) ? warehouseData.warehouses : []);
    }).catch(() => {
      if (active) setError("Data pelabuhan atau gudang tidak dapat dimuat. Periksa permission dan koneksi database.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    if (!selectedPort || !projectId) { setPortDetail(null); return; }
    setDetailLoading(true);
    get(`/ports/${encodeURIComponent(String(selectedPort.id))}?projectId=${encodeURIComponent(projectId)}`)
      .then(data => { if (active) setPortDetail(data); })
      .catch(() => { if (active) setError("Detail pelabuhan gagal dimuat."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedPort?.id, projectId]);

  useEffect(() => {
    let active = true;
    if (!selectedWarehouse || !projectId) { setWarehouseDetail(null); return; }
    setDetailLoading(true);
    get(`/warehouses/${encodeURIComponent(String(selectedWarehouse.id))}?projectId=${encodeURIComponent(projectId)}`)
      .then(data => { if (active) setWarehouseDetail(data); })
      .catch(() => { if (active) setError("Detail gudang gagal dimuat."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedWarehouse?.id, projectId]);

  const list = tab === "ports" ? ports : warehouses;

  return (
    <div className="p16-page">
      <header className="p16-header">
        <div>
          <div className="p16-eyebrow">P2-B · P16 PORT & MULTIMODAL NETWORK</div>
          <h1>Jaringan Pelabuhan & Gudang</h1>
          <p>Referensi pelabuhan, terminal, batas operasional, layanan loading, fasilitas gudang dan reservasi dalam konteks Project aktif.</p>
        </div>
        <span className="p16-readonly">Mode baca</span>
      </header>

      <div className="p16-notice" role="status">
        <strong>Status provenance harus eksplisit.</strong> Data yang belum memiliki sumber, datum, tanggal pengukuran, checksum atau reviewer tetap ditampilkan sebagai belum diverifikasi. Penilaian kapal bersifat awal dan bukan izin navigasi.
      </div>

      {error && <div className="p16-error" role="alert">{error}</div>}

      <div className="p16-tabs" role="tablist" aria-label="Jenis data jaringan">
        <button type="button" role="tab" aria-selected={tab === "ports"} className={tab === "ports" ? "active" : ""} onClick={() => { setTab("ports"); setSelectedWarehouse(null); }}>Pelabuhan & Terminal <span>{ports.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === "warehouses"} className={tab === "warehouses" ? "active" : ""} onClick={() => { setTab("warehouses"); setSelectedPort(null); }}>Gudang & Kapabilitas <span>{warehouses.length}</span></button>
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
                    <Status value={item.verification_status} />
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
      <p className="p16-footer">Pengelolaan master global dan perubahan data operasional belum dibuka pada tahap ini. Hak tulis akan diaktifkan setelah kebijakan RLS, maker-checker, audit provenance dan backtest P16 diselesaikan di UAT.</p>
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
      <div className="p16-detail-heading"><div><span className="p16-eyebrow">PORT MASTER</span><h2>{port.name}</h2><p>{[port.city, port.province, port.country_code].filter(Boolean).join(", ") || port.address || "Lokasi belum diverifikasi"}</p></div><Status value={port.verification_status} /></div>
      <div className="p16-facts">
        <Fact label="Kode pelabuhan" value={port.code || port.national_code} />
        <Fact label="UN/LOCODE" value={port.unlocode} />
        <Fact label="Otoritas" value={port.authority_name} />
        <Fact label="Operator" value={port.operator_name} />
        <Fact label="Sumber" value={port.source_reference} />
        <Fact label="Terverifikasi pada" value={port.verified_at ? new Date(port.verified_at).toLocaleString("id-ID") : "Belum diverifikasi"} />
      </div>
      {groups.map(([title, rows]) => <div className="p16-group" key={title}><h3>{title} <span>{rows.length}</span></h3>{rows.length ? rows.map(row => <div className="p16-record" key={row.id}><div><strong>{row.name || row.channel_name || row.anchorage_code || row.berth_code || row.service_type || row.equipment_type || row.feature_type || row.authority_name || "Record"}</strong><small>{row.depth_value ? `${row.depth_value} ${row.depth_unit || "m"} · datum: ${row.vertical_datum || row.depth_datum || "tidak dicantumkan"}` : row.source_reference || row.source_authority || "Sumber belum dicantumkan"}</small></div><Status value={row.quality_status || row.approval_status || row.status || row.condition_status} /></div>) : <p className="p16-muted">Belum ada record.</p>}</div>)}
      <p className="p16-warning">Kompatibilitas kapal belum dihitung di workspace ini. Kedalaman tanpa datum, tanggal survei dan sumber otoritatif tidak boleh dipakai sebagai dasar keputusan operasional.</p>
    </div>
  );
}

function WarehouseDetail({ data }: { data: Row | null }) {
  if (!data?.warehouse) return <Empty>Detail gudang tidak tersedia.</Empty>;
  const w = data.warehouse;
  return (
    <div className="p16-detail-stack">
      <div className="p16-detail-heading"><div><span className="p16-eyebrow">WAREHOUSE MASTER</span><h2>{w.name}</h2><p>{w.location || [w.port_name, w.terminal_name].filter(Boolean).join(" · ") || "Lokasi belum tersedia"}</p></div><Status value={w.verification_status} /></div>
      <div className="p16-facts">
        <Fact label="Kode" value={w.code} /><Fact label="Mode penyimpanan" value={w.storage_mode} />
        <Fact label="Kapasitas (MT)" value={w.storage_capacity_mt} /><Fact label="Luas lantai (m²)" value={w.floor_area_m2} />
        <Fact label="Volume guna (m³)" value={w.usable_volume_m3} /><Fact label="Koordinat" value={w.latitude && w.longitude ? `${w.latitude}, ${w.longitude}` : null} />
      </div>
      <div className="p16-group"><h3>Zona gudang <span>{(data.zones || []).length}</span></h3>{(data.zones || []).length ? data.zones.map((z: Row) => <div className="p16-record" key={z.id}><div><strong>{z.zone_code} · {z.zone_type}</strong><small>Kapasitas: {z.capacity || "—"} {z.unit_code || ""}</small></div><Status value={z.status} /></div>) : <p className="p16-muted">Belum ada zona.</p>}</div>
      <div className="p16-group"><h3>Bin <span>{(data.bins || []).length}</span></h3>{(data.bins || []).length ? data.bins.map((b: Row) => <div className="p16-record" key={b.id}><div><strong>{b.bin_code}</strong><small>Kapasitas: {b.capacity || "—"} {b.unit_code || ""}</small></div><Status value={b.status} /></div>) : <p className="p16-muted">Belum ada bin.</p>}</div>
      <div className="p16-group"><h3>Peralatan <span>{(data.equipment || []).length}</span></h3>{(data.equipment || []).length ? data.equipment.map((e: Row) => <div className="p16-record" key={e.id}><div><strong>{e.equipment_type}</strong><small>{e.asset_code || "Kode aset belum tersedia"} · {e.rated_capacity || "—"} {e.capacity_unit || ""}</small></div><Status value={e.condition_status} /></div>) : <p className="p16-muted">Belum ada peralatan.</p>}</div>
      <div className="p16-group"><h3>Reservasi Project ini <span>{(data.reservations || []).length}</span></h3>{(data.reservations || []).length ? data.reservations.map((r: Row) => <div className="p16-record" key={r.id}><div><strong>{r.reserved_quantity} {r.unit_code}</strong><small>{new Date(r.window_start).toLocaleString("id-ID")} – {new Date(r.window_end).toLocaleString("id-ID")}</small></div><Status value={r.status} /></div>) : <p className="p16-muted">Belum ada reservasi Project.</p>}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) {
  return <div className="p16-fact"><span>{label}</span><strong>{value === null || value === undefined || value === "" ? "—" : String(value)}</strong></div>;
}
