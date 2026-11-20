import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, ArrowRight, Boxes, BriefcaseBusiness, ClipboardList, Clock3, FileCheck2, RefreshCw, ShieldCheck, Ship, Truck, Wallet } from 'lucide-react';
import { get } from './api';
import './RoleDashboardPage.css';
import { hasProjectPermission } from './role-permissions';

type RecordData = Record<string, any>;
type DashboardData = {
  projects?: RecordData[];
  portfolio?: RecordData;
  workItems?: RecordData[];
  contracts?: RecordData[];
  contractPrograms?: RecordData[];
  warehouseReceipts?: RecordData[];
  inventoryLots?: RecordData[];
  truckTrips?: RecordData[];
  shipmentAllocations?: RecordData[];
  documents?: RecordData[];
  documentRequirements?: RecordData[];
  apInvoices?: RecordData[];
  arInvoices?: RecordData[];
  cashAdvances?: RecordData[];
  journalEntries?: RecordData[];
  projectReport?: RecordData;
};
type LoadState = { data: DashboardData; loading: boolean; errors: string[] };

const ROLE_META: Record<string, { label: string; focus: string; outputs: string; links: Array<{ label: string; to: string }> }> = {
  platform_admin: { label: 'Platform Administrator', focus: 'Governance platform, onboarding akun, provisioning Project, dan penunjukan PM.', outputs: 'Akun dan Project tertata; perubahan governance dapat ditelusuri.', links: [{ label: 'Kelola Project', to: '/projects' }, { label: 'Akses & role', to: '/access' }] },
  project_admin: { label: 'Project Administrator', focus: 'Konfigurasi Project, keanggotaan, role assignment, dokumen dan audit konfigurasi.', outputs: 'Konfigurasi Project dan akses anggota terpelihara; Finance hanya dapat dilihat.', links: [{ label: 'Detail Project', to: '/projects' }, { label: 'Role & permission', to: '/access' }, { label: 'Dokumen', to: '/compliance' }] },
  pm: { label: 'Project Manager', focus: 'Koordinasi lintas fungsi, instruksi kerja, tenggat, exception dan kesiapan Project.', outputs: 'Tindak lanjut teralokasi, diakui, diselesaikan, dan dapat dieskalasi.', links: [{ label: 'Tugas & instruksi', to: '/my-work' }, { label: 'Kontrak', to: '/contracts' }, { label: 'Operasional', to: '/operations' }, { label: 'Laporan', to: '/reports' }] },
  internal_auditor: { label: 'Internal Auditor', focus: 'Review bukti operasional, inventori, logistik, dokumen, Finance dan Accounting secara read-only.', outputs: 'Temuan berbasis bukti; tidak mengubah transaksi yang diaudit.', links: [{ label: 'Laporan', to: '/reports' }, { label: 'Dokumen', to: '/compliance' }] },
  procurement: { label: 'Procurement Officer', focus: 'Kebutuhan buyer, supplier, fasilitas, produk dan kesiapan kapasitas.', outputs: 'Kelengkapan pemasok dan rekomendasi pengadaan; PO belum tersedia.', links: [{ label: 'Kontrak', to: '/contracts' }, { label: 'Supplier', to: '/supplier' }] },
  pks_site_manager: { label: 'PKS Site Manager', focus: 'Kesiapan fasilitas, kapasitas, produk dan komitmen pasokan.', outputs: 'Status kapasitas dan kesiapan site; data produksi aktual belum terintegrasi.', links: [{ label: 'Supplier / PKS', to: '/supplier' }, { label: 'Operasional', to: '/operations' }] },
  supplier: { label: 'Supplier', focus: 'Dokumen, produk/lot, dan progres pengiriman yang secara eksplisit ditugaskan.', outputs: 'Bukti pasokan dan status objek yang ditugaskan; akses tidak lintas Project.', links: [{ label: 'Supplier portal', to: '/supplier' }, { label: 'Dokumen', to: '/compliance' }] },
  buyer: { label: 'Buyer', focus: 'Persyaratan buyer dan bukti shipment milik buyer yang ditugaskan.', outputs: 'Respons requirement dan acknowledgement shipment.', links: [{ label: 'Buyer portal', to: '/buyer' }, { label: 'Dokumen', to: '/compliance' }] },
  contract_manager: { label: 'Contract Manager', focus: 'Kontrak, program kontrak, cycle policy dan requirement buyer.', outputs: 'Kontrak/program yang terjaga dan hand-off yang jelas ke PM/Finance.', links: [{ label: 'Program kontrak', to: '/contracts' }, { label: 'Laporan', to: '/reports' }] },
  production_manager: { label: 'Production Manager', focus: 'Rencana dan aktual produksi berdasarkan fasilitas, kapasitas dan kebutuhan produk.', outputs: 'Produksi aktual dan exception; workflow produksi belum tersedia.', links: [{ label: 'Operasional', to: '/operations' }, { label: 'Inventori', to: '/warehouse' }] },
  packing_supervisor: { label: 'Packing Supervisor', focus: 'Pelaksanaan packing, kuantitas kemasan dan traceability lot.', outputs: 'Realisasi packing; pencatatan packing khusus belum tersedia.', links: [{ label: 'Operasional', to: '/operations' }, { label: 'Warehouse', to: '/warehouse' }] },
  qc_officer: { label: 'Quality Control Officer', focus: 'Sampling dan pencatatan hasil QC.', outputs: 'Sampel dan hasil QC; modul sampel/hasil belum tersedia.', links: [{ label: 'Dokumen', to: '/compliance' }, { label: 'Operasional', to: '/operations' }] },
  qa_manager: { label: 'Quality Assurance Manager', focus: 'Review hasil QC/Lab dan keputusan release/hold independen.', outputs: 'Keputusan QA dengan jejak bukti; workflow QA belum tersedia.', links: [{ label: 'Compliance', to: '/compliance' }, { label: 'Warehouse', to: '/warehouse' }] },
  laboratory_officer: { label: 'Laboratory Officer', focus: 'Hasil uji laboratorium, metode, referensi dan bukti pendukung.', outputs: 'Hasil Lab; modul sampel/hasil belum tersedia.', links: [{ label: 'Dokumen', to: '/compliance' }] },
  hse_officer: { label: 'HSE Officer', focus: 'Inspeksi HSE, penilaian risiko dan tindakan korektif.', outputs: 'Bukti inspeksi dan corrective action; workflow HSE belum tersedia.', links: [{ label: 'Compliance', to: '/compliance' }, { label: 'Tugas Saya', to: '/my-work' }] },
  warehouse_manager: { label: 'Warehouse Manager', focus: 'Penerimaan, lot, movement, reservation, hold dan rekonsiliasi stok.', outputs: 'Stok tersedia/tertahan/teralokasi dan exception gudang.', links: [{ label: 'Warehouse', to: '/warehouse' }, { label: 'Alokasi shipment', to: '/shipment-allocations' }] },
  warehouse_officer: { label: 'Warehouse Officer', focus: 'Pencatatan penerimaan barang dan bukti kuantitas/berat.', outputs: 'Goods receipt dan hand-off lot; PO matching belum tersedia.', links: [{ label: 'Warehouse', to: '/warehouse' }] },
  inventory_controller: { label: 'Inventory Controller', focus: 'Lot balance, movement, reservation, hold dan rekonsiliasi.', outputs: 'Posisi stok yang dapat ditelusuri; quality linkage perlu dilengkapi.', links: [{ label: 'Warehouse', to: '/warehouse' }, { label: 'Alokasi shipment', to: '/shipment-allocations' }] },
  transport_manager: { label: 'Transport Manager', focus: 'Kapasitas transport, dispatch, perjalanan, checkpoint dan keterlambatan.', outputs: 'Trip status dan exception; dispatch board/SLA belum lengkap.', links: [{ label: 'Operasional', to: '/operations' }, { label: 'Tugas Saya', to: '/my-work' }] },
  dispatcher: { label: 'Dispatcher', focus: 'Penugasan kendaraan/pengemudi dan monitoring trip.', outputs: 'Dispatch assignment; board dan ETA planning belum tersedia.', links: [{ label: 'Operasional', to: '/operations' }] },
  transporter: { label: 'Transporter', focus: 'Perjalanan yang ditugaskan dan pengiriman checkpoint/evidence.', outputs: 'Status trip dan bukti checkpoint sesuai assignment.', links: [{ label: 'Transporter', to: '/transporter' }, { label: 'Operasional', to: '/operations' }] },
  checker: { label: 'Checker', focus: 'Verifikasi checkpoint dan discrepancy perjalanan yang ditugaskan.', outputs: 'Checkpoint terverifikasi; penugasan checker perlu UAT.', links: [{ label: 'Operasional', to: '/operations' }] },
  driver: { label: 'Driver', focus: 'Pelaksanaan trip dan checkpoint sesuai penugasan.', outputs: 'Progres trip dan checkpoint; assignment driver perlu UAT.', links: [{ label: 'Transporter', to: '/transporter' }] },
  master_of_loading: { label: 'Master of Loading', focus: 'Koordinasi readiness shipment, stok, vessel dan bukti loading.', outputs: 'Loading plan/ticket; workflow loading belum tersedia.', links: [{ label: 'Alokasi shipment', to: '/shipment-allocations' }, { label: 'Dokumen', to: '/compliance' }] },
  loading_supervisor: { label: 'Loading Supervisor', focus: 'Shift loading, crew, equipment, actual quantity dan downtime.', outputs: 'Laporan shift; workflow loading belum tersedia.', links: [{ label: 'Alokasi shipment', to: '/shipment-allocations' }, { label: 'Operasional', to: '/operations' }] },
  loading_operator: { label: 'Loading Operator', focus: 'Eksekusi tugas loading yang ditugaskan.', outputs: 'Event ticket dan actual quantity; workflow loading belum tersedia.', links: [{ label: 'Alokasi shipment', to: '/shipment-allocations' }] },
  terminal_representative: { label: 'Terminal Representative', focus: 'Readiness terminal, slot/berth dan hand-off terminal.', outputs: 'Status terminal; vessel call/berth API belum tersedia.', links: [{ label: 'Alokasi shipment', to: '/shipment-allocations' }] },
  shipping_agent: { label: 'Shipping Agent', focus: 'Vessel/voyage, shipping document dan komunikasi carrier/terminal.', outputs: 'Status vessel/voyage dan dokumen; vessel call/ETA workflow belum tersedia.', links: [{ label: 'Alokasi shipment', to: '/shipment-allocations' }, { label: 'Dokumen', to: '/compliance' }] },
  marine_surveyor: { label: 'Marine Surveyor', focus: 'Bukti independen kuantitas/kondisi cargo dan survey report.', outputs: 'Survey certificate; modul survey belum tersedia.', links: [{ label: 'Dokumen', to: '/compliance' }, { label: 'Alokasi shipment', to: '/shipment-allocations' }] },
  ship_master: { label: 'Ship Master', focus: 'Konfirmasi readiness kapal/voyage dan acknowledgement cargo.', outputs: 'Konfirmasi sisi kapal; workflow ship-master belum tersedia.', links: [{ label: 'Alokasi shipment', to: '/shipment-allocations' }] },
  finance: { label: 'Finance Officer', focus: 'RAB, FX, AP/AR, Cash Advance dan financial reporting.', outputs: 'Keputusan Finance dan posisi finansial; pembayaran/bank reconciliation tidak termasuk workflow aktif.', links: [{ label: 'Keuangan & FX', to: '/finance' }, { label: 'Cash Advance', to: '/cash-advances' }, { label: 'Laporan', to: '/reports' }] },
  accounting: { label: 'Accountant', focus: 'Jurnal, supporting lines dan pelaporan Accounting.', outputs: 'Draft jurnal dan rekonsiliasi; posting/reversal tetap dibatasi permission terpisah.', links: [{ label: 'Jurnal Umum', to: '/journal-entries' }, { label: 'Laporan', to: '/reports' }] },
  cashier: { label: 'Cashier / Treasury', focus: 'Melihat instruksi pembayaran yang diotorisasi dan bukti bank.', outputs: 'Bukti eksekusi/reconciliation; payment execution belum tersedia.', links: [{ label: 'Instruksi Pembayaran', to: '/payment-instructions' }, { label: 'Keuangan', to: '/finance' }] },
  funder: { label: 'Project Funder', focus: 'Posisi pendanaan, exposure dan laporan Project yang ditugaskan.', outputs: 'Ringkasan read-only; funder-specific API masih perlu dikonfirmasi.', links: [{ label: 'Funder portal', to: '/funder' }, { label: 'Laporan', to: '/reports' }] },
};

const ROLE_ALIASES: Record<string, string> = { admin: 'platform_admin', projectmanager: 'pm', project_manager: 'pm', warehouse: 'warehouse_manager', loading_manager: 'master_of_loading' };
const normalizeRole = (value: unknown) => String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
const labelRole = (code: string) => ROLE_META[code]?.label || code.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
const fmt = (value: unknown) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value || 0));
const money = (value: unknown) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function RoleDashboardPage({ projectId, activeUser }: { projectId: string; activeUser?: RecordData }) {
  const [state, setState] = useState<LoadState>({ data: {}, loading: true, errors: [] });
  const [revision, setRevision] = useState(0);
  const membership = activeUser?.projectMemberships?.find((m: RecordData) => m.projectId === projectId && m.isActive === true);
  const roles = useMemo(() => activeUser?.platformAdmin === true ? ['platform_admin'] : (membership?.roleAssignments || [])
    .filter((a: RecordData) => a.isActive === true && !a.revokedAt && a.roleIsActive === true && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now()))
    .map((a: RecordData) => ROLE_ALIASES[normalizeRole(a.roleCode || a.roleName)] || normalizeRole(a.roleCode || a.roleName))
    .filter((v: string, i: number, arr: string[]) => Boolean(v) && arr.indexOf(v) === i), [activeUser, membership]);
  const permissions = activeUser?.projectPermissions || [];
  const can = (permission: string) => activeUser?.platformAdmin === true ? false : hasProjectPermission(permission, activeUser);
  const canViewTasks = can('project.tasks.view');
  const canViewWork = Boolean(projectId);
  const canViewContracts = can('contract.view');
  const canViewInventory = can('inventory.view');
  const canViewWarehouse = can('warehouse.view');
  const canViewLogistics = can('logistics.view');
  const canViewShipping = can('shipping.view');
  const canViewDocuments = can('documents.view');
  const canViewFinance = can('finance.view');
  const canViewAccounting = can('accounting.view');
  const canViewReports = can('reports.view') || can('report.view');

  const load = useCallback(async () => {
    setState(current => ({ ...current, loading: true, errors: [] }));
    const requests: Array<[keyof DashboardData, string, boolean]> = [
      ['projects', '/projects', true],
      ['portfolio', '/reports/portfolio', activeUser?.platformAdmin === true],
      ['workItems', `/projects/${encodeURIComponent(projectId)}/work-items`, Boolean(projectId)],
      ['contracts', `/contracts?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewContracts)],
      ['contractPrograms', `/contract-programs?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewContracts)],
      ['warehouseReceipts', `/warehouse-receipts?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewWarehouse)],
      ['inventoryLots', `/inventory-lots?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewInventory)],
      ['truckTrips', `/truck-trips?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewLogistics)],
      ['shipmentAllocations', `/shipment-allocations?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewShipping)],
      ['documents', `/projects/${encodeURIComponent(projectId)}/documents`, Boolean(projectId && canViewDocuments)],
      ['documentRequirements', `/projects/${encodeURIComponent(projectId)}/document-requirements`, Boolean(projectId && canViewDocuments)],
      ['apInvoices', `/ap-invoices?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewFinance)],
      ['arInvoices', `/ar-invoices?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewFinance)],
      ['cashAdvances', `/cash-advances?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewFinance)],
      ['journalEntries', `/journal-entries?projectId=${encodeURIComponent(projectId)}`, Boolean(projectId && canViewAccounting)],
      ['projectReport', `/reports/project/${encodeURIComponent(projectId)}`, Boolean(projectId && canViewReports)],
    ];
    const enabled = requests.filter(([, , active]) => active);
    const results = await Promise.all(enabled.map(async ([key, path]) => {
      try { return { key, value: await get<RecordData>(path), error: '' }; }
      catch (error) { return { key, value: null, error: error instanceof Error ? error.message : 'Sumber data gagal dimuat.' }; }
    }));
    const data: DashboardData = {};
    const errors: string[] = [];
    for (const result of results) {
      if (result.value) Object.assign(data, { [result.key]: result.value });
      if (result.error) errors.push(`${String(result.key)}: ${result.error}`);
    }
    if (!projectId && activeUser?.platformAdmin !== true) errors.push('Pilih Project untuk memuat data dashboard.');
    setState({ data, loading: false, errors });
  }, [projectId, activeUser?.platformAdmin, canViewTasks, canViewContracts, canViewInventory, canViewWarehouse, canViewLogistics, canViewShipping, canViewDocuments, canViewFinance, canViewAccounting, canViewReports, revision]);

  useEffect(() => { void load(); }, [load]);

  const primaryRole = roles.length ? roles.map((r: string) => ROLE_META[r]?.label || labelRole(r)).join(' · ') : 'Belum ada role aktif pada Project ini';
  const roleCards = roles.map((role: string) => ROLE_META[role] || { label: labelRole(role), focus: 'Ikuti permission aktif dan tugas yang diberikan pada Project ini.', outputs: 'Data yang dapat diakses mengikuti assignment aktif.', links: [] });
  const data = state.data;
  const sourceFailed = (key: keyof DashboardData) => state.errors.some(error => error.startsWith(String(key) + ':'));
  const count = (key: keyof DashboardData, field: string) => sourceFailed(key) ? '—' : fmt((data[key] as RecordData | undefined)?.[field]?.length ?? 0);
  const metrics: Array<{ label: string; value: string; note: string; href: string; icon: typeof Activity }> = [];
  if (canViewWork) metrics.push({ label: 'Tugas Saya', value: count('workItems', 'workItems'), note: canViewTasks ? 'Antrean Project untuk PM' : 'Antrean role/assignee aktif', href: '/my-work', icon: ClipboardList });
  if (canViewContracts) metrics.push({ label: 'Kontrak', value: count('contracts', 'contracts'), note: 'Kontrak dalam Project', href: '/contracts', icon: BriefcaseBusiness });
  if (canViewWarehouse) metrics.push({ label: 'Penerimaan gudang', value: count('warehouseReceipts', 'warehouseReceipts'), note: 'Goods receipt tercatat', href: '/warehouse', icon: Boxes });
  if (canViewInventory) metrics.push({ label: 'Lot inventori', value: count('inventoryLots', 'inventoryLots'), note: 'Lot tercatat; bukan QA release', href: '/warehouse', icon: Boxes });
  if (canViewLogistics) metrics.push({ label: 'Trip transport', value: count('truckTrips', 'truckTrips'), note: 'Perjalanan tercatat', href: '/operations', icon: Truck });
  if (canViewShipping) metrics.push({ label: 'Alokasi shipment', value: count('shipmentAllocations', 'shipmentAllocations'), note: 'Alokasi yang terlihat', href: '/shipment-allocations', icon: Ship });
  if (canViewDocuments) metrics.push({ label: 'Dokumen', value: count('documents', 'documents'), note: 'Bukti dokumen tercatat', href: '/compliance', icon: FileCheck2 });
  if (canViewFinance) metrics.push({ label: 'AP + AR', value: sourceFailed('apInvoices') || sourceFailed('arInvoices') ? '—' : String(Number((data.apInvoices as RecordData)?.apInvoices?.length || 0) + Number((data.arInvoices as RecordData)?.arInvoices?.length || 0)), note: 'Invoice terlihat; bukan bukti pembayaran', href: '/finance', icon: Wallet });
  if (canViewAccounting) metrics.push({ label: 'Jurnal', value: count('journalEntries', 'journalEntries'), note: 'Entri jurnal yang terlihat', href: '/journal-entries', icon: FileCheck2 });
  if (activeUser?.platformAdmin === true) metrics.unshift({ label: 'Project terlihat', value: count('projects', 'projects'), note: 'Dalam cakupan akun platform', href: '/projects', icon: BriefcaseBusiness });

  const readiness = [
    { label: 'Kontrak & program', available: canViewContracts, count: sourceFailed('contracts') || sourceFailed('contractPrograms') ? '—' : fmt(Number((data.contracts as RecordData)?.contracts?.length || 0) + Number((data.contractPrograms as RecordData)?.contractPrograms?.length || 0)), note: 'Kontrak dan program kontrak' },
    { label: 'Warehouse & inventory', available: canViewWarehouse || canViewInventory, count: sourceFailed('warehouseReceipts') || sourceFailed('inventoryLots') ? '—' : fmt(Number((data.warehouseReceipts as RecordData)?.warehouseReceipts?.length || 0) + Number((data.inventoryLots as RecordData)?.inventoryLots?.length || 0)), note: 'Penerimaan dan lot; cek hold/reservation pada modul sumber' },
    { label: 'Inland logistics', available: canViewLogistics, count: sourceFailed('truckTrips') ? '—' : fmt(Number((data.truckTrips as RecordData)?.truckTrips?.length || 0)), note: 'Trip tercatat; ETA/SLA tidak diinferensikan' },
    { label: 'Shipment allocation', available: canViewShipping, count: sourceFailed('shipmentAllocations') ? '—' : fmt(Number((data.shipmentAllocations as RecordData)?.shipmentAllocations?.length || 0)), note: 'Alokasi; bukan bukti loading selesai' },
    { label: 'Export documents', available: canViewDocuments, count: sourceFailed('documents') || sourceFailed('documentRequirements') ? '—' : fmt(Number((data.documents as RecordData)?.documents?.length || 0)), note: 'Dokumen tercatat; LC check/presentasi belum terintegrasi' },
    { label: 'Finance & Accounting', available: canViewFinance || canViewAccounting, count: sourceFailed('apInvoices') || sourceFailed('arInvoices') || sourceFailed('journalEntries') ? '—' : fmt(Number((data.apInvoices as RecordData)?.apInvoices?.length || 0) + Number((data.arInvoices as RecordData)?.arInvoices?.length || 0) + Number((data.journalEntries as RecordData)?.journalEntries?.length || 0)), note: 'Invoice/jurnal; bank execution dan reconciliation belum tersedia' },
  ];

  return <div className="role-dashboard">
    <div className="page-heading"><div><div className="eyebrow">ROLE WORKSPACE · PROJECT SCOPED</div><h1>Dashboard Kerja</h1><p>Ringkasan, antrean dan hand-off mengikuti role aktif serta permission pada Project terpilih.</p></div><button className="secondary-button" onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} /> Segarkan</button></div>
    <section className="card role-identity"><div><div className="eyebrow">PROJECT / ROLE AKTIF</div><h2>{projectId ? 'Project terpilih' : activeUser?.platformAdmin ? 'Platform workspace' : 'Project belum dipilih'}</h2><p>{projectId || 'Pilih Project dari bagian atas untuk membuka data kerja.'}</p></div><div className="role-chip-list">{roles.map((r: string) => <span className="role-chip" key={r}>{ROLE_META[r]?.label || labelRole(r)}</span>)}</div></section>
    <section className="role-focus-grid">{roleCards.map((role: RecordData, i: number) => <article className="card role-focus-card" key={roles[i]}><div className="eyebrow">FOKUS ROLE</div><h3>{role.label}</h3><p>{role.focus}</p><small>{role.outputs}</small><div className="role-link-row">{role.links.map((link: RecordData) => <Link key={link.to} to={link.to}>{link.label} <ArrowRight size={13} /></Link>)}</div></article>)}</section>
    <section className="role-metric-grid">{metrics.map((metric, i) => { const Icon = metric.icon; return <Link className="card role-metric" to={metric.href} key={metric.label}><Icon size={19} /><span>{metric.label}</span><strong>{state.loading ? '…' : metric.value}</strong><small>{metric.note}</small></Link>; })}</section>
    {state.errors.length > 0 && <div className="inline-warning"><AlertCircle size={17} /><div><strong>Sumber belum seluruhnya berhasil dimuat</strong>{state.errors.map(error => <small key={error}>{error}</small>)}</div></div>}
    {state.loading && <div className="card"><p>Memuat data sesuai permission Project…</p></div>}
    {!state.loading && canViewWork && <section className="card"><div className="section-heading"><div><h2>{canViewTasks ? 'Antrean instruksi Project' : 'Antrean tugas saya'}</h2><p>{canViewTasks ? 'Task engine menjadi satu sumber antrean Project untuk PM.' : 'Task engine menampilkan tugas sesuai role aktif dan explicit assignee; tidak membuka antrean role lain.'} Notifikasi dibedakan dari acknowledgement dan penyelesaian tugas.</p></div><Link to="/my-work">Buka antrean <ArrowRight size={14} /></Link></div><div className="role-task-stats">{(['open', 'acknowledged', 'in_progress', 'blocked', 'submitted'] as const).map(status => <div key={status}><strong>{sourceFailed('workItems') ? '—' : fmt((data.workItems as RecordData)?.workItems?.filter((item: RecordData) => item.status === status).length || 0)}</strong><span>{status.replace(/_/g, ' ')}</span></div>)}</div>{((data.workItems as RecordData)?.workItems || []).slice(0, 6).map((task: RecordData) => <div className="role-task-row" key={task.id}><div><strong>{task.title}</strong><small>{task.owner_role_code || 'Role'} · {task.priority || 'normal'} · tenggat {task.due_at ? new Date(task.due_at).toLocaleString('id-ID') : '—'}</small></div><span className={task.is_overdue ? 'role-status overdue' : 'role-status'}>{task.is_overdue ? 'overdue' : task.status}</span></div>)}{!((data.workItems as RecordData)?.workItems || []).length && <p className="role-empty">Belum ada task pada cakupan antrean yang dapat diakses.</p>}</section>}
    <section className="card"><div className="section-heading"><div><h2>Data kerja yang tersedia</h2><p>Jumlah berasal dari API sumber; tidak mengisi angka untuk domain yang belum terintegrasi.</p></div><span className="muted">{state.loading ? 'Memuat…' : 'Data terkini dari API'}</span></div>{readiness.map(item => <div className="role-readiness-row" key={item.label}><div><strong>{item.label}</strong><small>{item.available ? item.note : 'Tidak termasuk permission aktif pada Project ini'}</small></div><span>{item.available ? item.count + ' record' : 'Tidak diakses'}</span></div>)}<div className="role-readiness-row unavailable"><div><strong>Produksi, packing & QA release</strong><small>Batch, hasil QC/Lab dan keputusan QA belum memiliki workflow operasional terintegrasi.</small></div><span>Belum tersedia</span></div><div className="role-readiness-row unavailable"><div><strong>Vessel, loading & laytime</strong><small>Vessel call, berth, shift, loading ticket, survey dan laytime belum tersedia sebagai workflow.</small></div><span>Belum tersedia</span></div><div className="role-readiness-row unavailable"><div><strong>LC discrepancy & bank presentation</strong><small>LC clause validation, discrepancy resolution, presentation deadline dan bank acceptance belum terintegrasi.</small></div><span>Belum tersedia</span></div><div className="role-readiness-row unavailable"><div><strong>Payment execution & bank reconciliation</strong><small>Instruksi/eksekusi pembayaran dan rekonsiliasi bank tidak boleh disimpulkan dari invoice atau jurnal.</small></div><span>Belum tersedia / di luar scope F1</span></div></section>
    <section className="card role-boundary"><ShieldCheck size={18} /><div><strong>Batas kewenangan tetap diterapkan oleh API dan database</strong><p>Dashboard hanya menampilkan navigasi dan ringkasan. Akses data, perubahan transaksi, approval Finance, posting Accounting, QA release, serta sign-off operasional tetap wajib diverifikasi oleh server dan RLS.</p></div></section>
  </div>;
}
