import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Boxes, BriefcaseBusiness,
  BookOpen, CalendarClock, Check, CheckCircle2, ChevronDown, CircleAlert, CircleDollarSign,
  ClipboardCheck, Clock3, Edit, FileCheck2, FileText, Flag, Gauge, Globe2, LayoutDashboard,
  LogOut, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck, Ship, Truck,
  Users, Wallet, X, Building2, MapPin, PackageCheck, TrendingUp,
} from 'lucide-react';
import { authClient, getBearerToken } from './auth-client';
import { api, get, patch, post } from './api';
import { hasAnyProjectPermission, hasPageAccess, hasProjectPermission, visiblePageKeys } from './role-permissions';

type AnyRecord = Record<string, any>;
type PageKey = 'dashboard' | 'projects' | 'contracts' | 'operations' | 'finance' | 'compliance' | 'reports' | 'notifications' | 'access' | 'journal-entries' | 'shipment-allocations' | 'cash-advances' | 'payment-instructions' | 'my-work' | 'buyer' | 'supplier' | 'transporter' | 'warehouse' | 'funder';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const navItems: { to: string; key: PageKey; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { to: '/', key: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, group: 'Workspace' },
  { to: '/projects', key: 'projects', label: 'Proyek', icon: BriefcaseBusiness, group: 'Workspace' },
  { to: '/contracts', key: 'contracts', label: 'Program Kontrak', icon: FileText, group: 'Workspace' },
  { to: '/operations', key: 'operations', label: 'Operasional', icon: Truck, group: 'Eksekusi' },
  { to: '/my-work', key: 'my-work', label: 'Tugas Saya', icon: ClipboardCheck, group: 'Eksekusi' },
  { to: '/finance', key: 'finance', label: 'Keuangan & FX', icon: Wallet, group: 'Kontrol' },
  { to: '/compliance', key: 'compliance', label: 'Dokumen & Compliance', icon: ShieldCheck, group: 'Kontrol' },
  { to: '/journal-entries', key: 'journal-entries', label: 'Jurnal Umum', icon: BookOpen, group: 'Kontrol' },
  { to: '/shipment-allocations', key: 'shipment-allocations', label: 'Alokasi Pengiriman', icon: Ship, group: 'Eksekusi' },
  { to: '/cash-advances', key: 'cash-advances', label: 'Uang Muka Operasional', icon: Wallet, group: 'Kontrol' },
  { to: '/payment-instructions', key: 'payment-instructions', label: 'Instruksi Pembayaran', icon: FileText, group: 'Kontrol' },
  { to: '/reports', key: 'reports', label: 'Laporan', icon: TrendingUp, group: 'Kontrol' },
  { to: '/notifications', key: 'notifications', label: 'Notifikasi', icon: Bell, group: 'Sistem' },
  { to: '/access', key: 'access', label: 'Role & Permission', icon: Users, group: 'Sistem' },
  { to: '/buyer', key: 'buyer', label: 'Buyer Portal', icon: Building2, group: 'Stakeholder' },
  { to: '/supplier', key: 'supplier', label: 'Supplier / PKS', icon: PackageCheck, group: 'Stakeholder' },
  { to: '/transporter', key: 'transporter', label: 'Transporter', icon: Truck, group: 'Stakeholder' },
  { to: '/warehouse', key: 'warehouse', label: 'Warehouse', icon: Boxes, group: 'Stakeholder' },
  { to: '/funder', key: 'funder', label: 'Funder', icon: Flag, group: 'Stakeholder' },
];

const idr = (value: unknown) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value: unknown, digits = 2) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(Number(value || 0));
const dateTime = (value: unknown) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(String(value))) : '—';
const shortId = (value: unknown) => typeof value === 'string' ? `${value.slice(0, 8)}…` : '—';

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    loader().then(value => { if (alive) setData(value); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Data tidak dapat dimuat.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Loader is intentionally represented by explicit dependencies plus refresh revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);
  return { data, loading, error, refresh, setData };
}

function App() {
  const session = authClient.useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [projectId, setProjectId] = useState(() => sessionStorage.getItem('pke.projectId') || '');
  const location = useLocation();
  const navigate = useNavigate();
  const user = session.data?.user as AnyRecord | undefined;
  const pkeIdentity = useLoad<{ user?: AnyRecord } | null>(() => user ? get('/me') : Promise.resolve(null), [user?.id]);
  const activeUser = pkeIdentity.data?.user || user;
  const projectAccess = useLoad<{ projectId?: string; permissions?: string[] }>(
    () => activeUser && activeUser.platformAdmin !== true && !pkeIdentity.loading && projectId
      ? get(`/projects/${encodeURIComponent(projectId)}/my-permissions`)
      : Promise.resolve({ projectId, permissions: [] }),
    [projectId, activeUser?.id, pkeIdentity.loading],
  );
  const workspaceUser: AnyRecord | undefined = activeUser ? {
    ...activeUser,
    selectedProjectId: projectId,
    projectPermissions: projectAccess.data?.projectId === projectId ? projectAccess.data.permissions || [] : [],
    projectPermissionsLoading: Boolean(projectId && activeUser?.platformAdmin !== true && (projectAccess.loading || projectAccess.data?.projectId !== projectId)),
    projectPermissionsError: projectAccess.error,
  } : activeUser;
  const selectedMembership = workspaceUser?.projectMemberships?.find((membership: AnyRecord) => membership.projectId === projectId && membership.isActive === true);
  const selectedProjectRoles = (selectedMembership?.roleAssignments || [])
    .filter((assignment: AnyRecord) => assignment.isActive === true && !assignment.revokedAt && assignment.roleIsActive === true
      && (!assignment.expiresAt || new Date(assignment.expiresAt).getTime() > Date.now()))
    .map((assignment: AnyRecord) => assignment.roleName || assignment.roleCode)
    .filter(Boolean);
  const roleSummary = workspaceUser?.platformAdmin === true ? 'Platform Admin'
    : projectId ? (selectedProjectRoles.length ? [...new Set(selectedProjectRoles)].join(' · ') : 'Tidak ada role aktif di Project')
    : 'Pilih Project untuk melihat role';

  const notify = useCallback((kind: 'success' | 'error' | 'info', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(current => current?.text === text ? null : current), 4200);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { if (projectId) sessionStorage.setItem('pke.projectId', projectId); else sessionStorage.removeItem('pke.projectId'); }, [projectId]);
  useEffect(() => { const active = document.querySelector('.nav-active'); if (active && typeof (active as any).scrollIntoView === 'function') (active as any).scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [location.pathname]);

  const signOut = async () => {
    await authClient.signOut();
    navigate('/login');
  };

  if (session.isPending) return <div className="screen-center"><div className="loader" /><span>Memuat sesi PKE…</span></div>;
  if (!user) return (
    <Routes>
      <Route path="/login" element={<LoginPage onNotice={notify} />} />
      <Route path="/login/" element={<LoginPage onNotice={notify} />} />
      <Route path="/login." element={<Navigate to={{ pathname: '/login', search: window.location.search }} replace />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage onNotice={notify} />} />
      <Route path="/reset-password" element={<ResetPasswordPage onNotice={notify} />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
  if (pkeIdentity.loading) return <div className="screen-center"><div className="loader" /><span>Menghubungkan akun ke workspace PKE…</span></div>;
  if (pkeIdentity.error) return <IdentityLinkRequired message={pkeIdentity.error} onSignOut={signOut} />;

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Boxes size={21} strokeWidth={2.3} /></div>
          <div><strong>PKE<span>CTRL</span></strong><small>EXPORT INTELLIGENCE</small></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"><X size={18} /></button>
        </div>
        <div className="sidebar-label">OPERATIONS</div>
        <div className="sidebar-navigation">
        {['Workspace', 'Eksekusi', 'Kontrol', 'Sistem', 'Stakeholder'].map(group => {
          const allowedKeys = visiblePageKeys(workspaceUser || {});
          return (
            <div className="nav-group" key={group}>
              <div className="nav-group-title">{group}</div>
              {navItems
                .filter(item => item.group === group && allowedKeys.includes(item.key))
                .map(item => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
                    <Icon size={18} /><span>{item.label}</span>{item.key === 'notifications' ? <span className="nav-dot" /> : null}
                  </NavLink>;
                })}
            </div>
          );
        })}
        </div>
        <div className="sidebar-bottom">
          <div className="environment"><span className="status-dot" /> Authenticated session active</div>
          <div className="profile-row">
            <div className="avatar">{String(activeUser?.name || activeUser?.email || 'P').slice(0, 1).toUpperCase()}</div>
            <div className="profile-meta"><strong>{activeUser?.name || 'Pengguna PKE'}</strong><small>{activeUser?.email}</small><br /><small style={{ opacity: 0.7 }}>{roleSummary}</small></div>
            <button className="icon-button" onClick={signOut} title="Keluar"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu" />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={20} /></button>
            <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{navItems.find(item => item.to === location.pathname)?.label || 'PKE Platform'}</strong></div>
          </div>
          <div className="topbar-actions">
            <ProjectPicker value={projectId} onChange={setProjectId} />
            <div className="topbar-divider" />
            <div className="top-user"><div className="avatar avatar-small">{String(activeUser?.name || activeUser?.email || 'P').slice(0, 1).toUpperCase()}</div><span>{activeUser?.name || activeUser?.email}</span><ChevronDown size={15} /></div>
          </div>
        </header>
        <div className="page-content">
          <Routes>
            <Route path="/" element={<RoleGuard allowedKeys={['dashboard']} activeUser={workspaceUser}><DashboardPage projectId={projectId} activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/projects" element={<RoleGuard allowedKeys={['projects']} activeUser={workspaceUser}><ProjectsPage activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/projects/create" element={<RoleGuard allowedKeys={['projects']} activeUser={workspaceUser}><ProjectWizardPage onNotice={notify} /></RoleGuard>} />
            <Route path="/projects/:id" element={<RoleGuard allowedKeys={['project-detail']} activeUser={workspaceUser}><ProjectDetailPage activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/projects/:id/edit" element={<RoleGuard allowedKeys={['project-edit']} activeUser={workspaceUser}><ProjectEditPage onNotice={notify} /></RoleGuard>} />
            <Route path="/projects/:id/configuration" element={<RoleGuard allowedKeys={['project-configuration']} activeUser={workspaceUser}><ProjectConfigurationPage onNotice={notify} /></RoleGuard>} />
            <Route path="/projects/:id/roles" element={<RoleGuard allowedKeys={['project-roles']} activeUser={workspaceUser}><ProjectRolesPage onNotice={notify} /></RoleGuard>} />
            <Route path="/projects/:id/members" element={<RoleGuard allowedKeys={['project-members']} activeUser={workspaceUser}><ProjectMembersPage onNotice={notify} /></RoleGuard>} />
            <Route path="/contracts" element={<RoleGuard allowedKeys={['contracts']} activeUser={workspaceUser}><ContractsPage activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/operations" element={<RoleGuard allowedKeys={['operations']} activeUser={workspaceUser}><OperationsPage projectId={projectId} activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/my-work" element={<RoleGuard allowedKeys={['my-work']} activeUser={workspaceUser}><MyWorkPage projectId={projectId} activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/finance" element={<RoleGuard allowedKeys={['finance']} activeUser={workspaceUser}><FinancePage projectId={projectId} activeUser={activeUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/compliance" element={<RoleGuard allowedKeys={['compliance']} activeUser={workspaceUser}><CompliancePage projectId={projectId} activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/journal-entries" element={<RoleGuard allowedKeys={['journal-entries']} activeUser={workspaceUser}><JournalEntriesPage projectId={projectId} activeUser={activeUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/reports" element={<RoleGuard allowedKeys={['reports']} activeUser={workspaceUser}><ReportsPage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/notifications" element={<RoleGuard allowedKeys={['notifications']} activeUser={workspaceUser}><NotificationsPage onNotice={notify} onOpenTask={(taskProjectId: string) => { setProjectId(taskProjectId); navigate("/my-work"); }} /></RoleGuard>} />
            <Route path="/access" element={<RoleGuard allowedKeys={['access']} activeUser={workspaceUser}><AccessPage activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/shipment-allocations" element={<RoleGuard allowedKeys={['shipment-allocations']} activeUser={workspaceUser}><ShipmentAllocationPage projectId={projectId} activeUser={workspaceUser} onNotice={notify} /></RoleGuard>} />
            <Route path="/cash-advances" element={<RoleGuard allowedKeys={["cash-advances"]} activeUser={workspaceUser}><CashAdvancesPage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/payment-instructions" element={<RoleGuard allowedKeys={['payment-instructions']} activeUser={workspaceUser}><PaymentInstructionsPage onNotice={notify} /></RoleGuard>} />
            <Route path="/buyer" element={<RoleGuard allowedKeys={['buyer']} activeUser={workspaceUser}><BuyerWorkspacePage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/supplier" element={<RoleGuard allowedKeys={['supplier']} activeUser={workspaceUser}><SupplierWorkspacePage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/transporter" element={<RoleGuard allowedKeys={['transporter']} activeUser={workspaceUser}><TransporterWorkspacePage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/warehouse" element={<RoleGuard allowedKeys={['warehouse_manager']} activeUser={workspaceUser}><WarehouseWorkspacePage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/funder" element={<RoleGuard allowedKeys={['funder']} activeUser={workspaceUser}><FunderWorkspacePage projectId={projectId} onNotice={notify} /></RoleGuard>} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/login/" element={<Navigate to="/" replace />} />
            <Route path="/login." element={<Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/" replace />} />
            <Route path="/reset-password" element={<ResetPasswordPage onNotice={notify} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <footer className="app-footer"><span>PKE Export Intelligence & Project Control</span><span>Single-company workspace · IDR base currency</span></footer>
      </main>
      {notice && <div className={`toast toast-${notice.kind}`}><span>{notice.kind === 'success' ? <CheckCircle2 size={18} /> : notice.kind === 'error' ? <CircleAlert size={18} /> : <Activity size={18} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Tutup notifikasi"><X size={15} /></button></div>}
    </div>
  );
}

function ProjectPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useLoad<{ projects?: AnyRecord[] }>(() => get('/projects'), []);
  const projects = data?.projects || [];
  return <label className="project-picker"><span>PROJECT</span><select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">Semua proyek</option>
    {projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}
  </select><ChevronDown size={14} /></label>;
}

function IdentityLinkRequired({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return <div className="identity-screen"><div className="identity-card"><div className="identity-icon"><ShieldCheck size={24} /></div><div className="eyebrow">ACCOUNT LINK REQUIRED</div><h1>Akun belum terhubung ke PKE</h1><p>Sesi Neon Auth terdeteksi, tetapi API PKE belum mengenali akun ini sebagai pengguna aktif. Akun harus dipetakan secara eksplisit ke tabel pengguna PKE oleh proses bootstrap Admin.</p><div className="identity-error">{message}</div><button className="primary-button" onClick={onSignOut}><LogOut size={16} /> Keluar</button></div></div>;
}

function LoginPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      onNotice('error', 'Email dan password wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.signIn.email({ email: normalizedEmail, password });
      const errMsg = (result as any)?.error?.message || (result as any)?.error;
      if (errMsg) throw new Error(typeof errMsg === 'string' ? errMsg : 'Email atau password tidak sesuai, atau akun belum dapat digunakan.');
      await getBearerToken();
      onNotice('success', 'Berhasil masuk ke PKE.');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login tidak berhasil. Periksa kredensial Anda.';
      onNotice('error', msg);
    } finally { setBusy(false); }
  };

  return <div className="login-screen">
    <div className="login-visual">
      <div className="login-brand"><div className="brand-mark"><Boxes size={22} /></div><strong>PKE<span>CTRL</span></strong></div>
      <div className="login-visual-copy"><div className="eyebrow"><span className="status-dot" /> EXPORT OPERATIONS PLATFORM</div><h1>One view.<br /><em>Every shipment.</em><br />Every decision.</h1><p>Kontrol operasional, keuangan, dan kepatuhan ekspor PKE dalam satu workspace.</p></div>
      <div className="login-visual-foot"><span>01 / CONTROL</span><span>02 / EXECUTION</span><span>03 / VISIBILITY</span></div>
    </div>
    <div className="login-form-side"><form className="login-card" onSubmit={submit}>
      <div className="login-kicker">WELCOME BACK</div><h2>Masuk ke workspace</h2><p className="muted">Gunakan akun PKE yang telah diaktifkan oleh Platform Admin.</p>
      <label className="field"><span>Email kerja</span><input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@perusahaan.com" required maxLength={254} /></label>
      <label className="field"><span>Password</span><div className="password-wrap"><input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Masukkan password" required minLength={1} /><button type="button" className="text-button" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Sembunyikan' : 'Lihat'}</button></div></label>
      <button type="submit" className="primary-button login-submit" disabled={busy}>{busy ? <><span className="button-spinner" /> Menghubungkan…</> : <>Masuk <ArrowRight size={17} /></>}</button>
      <div className="login-links"><button type="button" className="text-button" onClick={() => navigate('/forgot-password')}>Lupa password?</button></div>
      <div className="login-security"><ShieldCheck size={16} /><span>Autentikasi dikelola oleh Neon Auth. PKE tidak menyimpan password pengguna.</span></div>
      <div className="login-bottom">Akses hanya melalui undangan Admin · Self-registration dinonaktifkan</div>
    </form></div>
  </div>;
}

function RoleGuard({ children, allowedKeys, activeUser }: { children: ReactNode; allowedKeys: string[]; activeUser: AnyRecord | undefined }) {
  if (!activeUser) return <div className="panel"><p>Memuat identitas pengguna…</p></div>;
  if (activeUser.projectPermissionsLoading) return <Loading text="Memverifikasi permission Project…" />;
  if (activeUser.projectPermissionsError && activeUser.selectedProjectId && activeUser.platformAdmin !== true) {
    return <ErrorState message="Hak akses Project tidak dapat diverifikasi. Akses ditutup sementara." />;
  }
  const allowed = allowedKeys.some(key => hasPageAccess(key, activeUser));
  if (!allowed) return <div className="panel"><p style={{ color: '#c45555' }}><CircleAlert size={18} /> Akses tidak diizinkan. Pastikan Project yang benar dipilih dan role Anda aktif pada Project tersebut.</p></div>;
  return <>{children}</>;
}

function PageTitle({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section>; }
function PanelHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="panel-heading"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{action}</div>; }
function Loading({ text = 'Memuat data…' }: { text?: string }) { return <div className="loading-state"><div className="loader loader-small" />{text}</div>; }
function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="error-state"><CircleAlert size={18} /><span>{message}</span>{retry && <button className="text-button" onClick={retry}>Coba lagi</button>}</div>; }
function EmptyState({ title, desc }: { title: string; desc: string }) { return <div className="empty-state"><div className="empty-icon"><Boxes size={21} /></div><strong>{title}</strong><span>{desc}</span></div>; }
function Metric({ label, value, foot, icon: Icon, tone = 'navy' }: { label: string; value: string; foot?: string; icon: typeof Activity; tone?: string }) {
  return <Card className="metric-card"><div className={`metric-icon tone-${tone}`}><Icon size={19} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot || 'Belum ada data tercatat'}</div></Card>;
}
function DataTable({ columns, rows, rowKey = 'id', emptyTitle = 'Belum ada data', emptyText = 'Data akan muncul setelah dicatat di sistem.' }: { columns: { key: string; label: string; render?: (row: AnyRecord) => ReactNode; width?: string }[]; rows: AnyRecord[]; rowKey?: string; emptyTitle?: string; emptyText?: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} desc={emptyText} />;
  return <div className="table-wrap"><table><thead><tr>{columns.map(col => <th key={col.key} style={{ width: col.width }}>{col.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row[rowKey] || index}>{columns.map(col => <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}
function StatusPill({ value }: { value: unknown }) {
  const raw = String(value || 'unknown'); const lower = raw.toLowerCase();
  const tone = ['active', 'completed', 'accepted', 'verified', 'settled', 'delivered', 'applied'].includes(lower) ? 'green' : ['pending', 'draft', 'requires_human_review', 'partial', 'processing'].includes(lower) ? 'amber' : ['failed', 'rejected', 'closed', 'inactive', 'expired'].includes(lower) ? 'red' : 'slate';
  return <span className={`status-pill pill-${tone}`}>{raw.replaceAll('_', ' ')}</span>;
}
function FormField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={`form-field ${wide ? 'form-wide' : ''}`}><span>{label}</span>{children}</label>; }
function ActionButton({ children, onClick, variant = 'primary', disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean }) { return <button type="button" className={`${variant}-button`} disabled={disabled} onClick={onClick}>{children}</button>; }

function DashboardPage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const canViewTasks = hasProjectPermission('project.tasks.view', activeUser);
  const canViewContracts = hasProjectPermission('contract.view', activeUser);
  const canViewInventory = hasProjectPermission('inventory.view', activeUser);
  const canViewDocuments = hasProjectPermission('documents.view', activeUser);
  const canViewReports = hasProjectPermission('reports.view', activeUser);
  const portfolio = useLoad<AnyRecord>(() => activeUser?.platformAdmin === true ? get('/reports/portfolio') : Promise.resolve({}), [activeUser?.platformAdmin]);
  const projects = useLoad<{ projects?: AnyRecord[] }>(() => get('/projects'), []);
  const canViewLogistics = activeUser?.platformAdmin === true || activeUser?.projectPermissions?.includes('logistics.view') === true;
  const trips = useLoad<{ truckTrips?: AnyRecord[] }>(() => projectId && canViewLogistics ? get(`/truck-trips?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ truckTrips: [] }), [projectId, canViewLogistics]);
  const events = useLoad<{ trackingEvents?: AnyRecord[] }>(() => projectId && canViewLogistics ? get(`/tracking-events?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ trackingEvents: [] }), [projectId, canViewLogistics]);
  const projectReport = useLoad<AnyRecord>(() => projectId && canViewTasks && canViewReports ? get(`/reports/project/${encodeURIComponent(projectId)}`) : Promise.resolve({}), [projectId, canViewTasks, canViewReports]);
  const contractPrograms = useLoad<{ contractPrograms?: AnyRecord[] }>(() => projectId && canViewTasks && canViewContracts ? get(`/contract-programs?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ contractPrograms: [] }), [projectId, canViewTasks, canViewContracts]);
  const contracts = useLoad<{ contracts?: AnyRecord[] }>(() => projectId && canViewTasks && canViewContracts ? get(`/contracts?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ contracts: [] }), [projectId, canViewTasks, canViewContracts]);
  const inventoryLots = useLoad<{ inventoryLots?: AnyRecord[] }>(() => projectId && canViewTasks && canViewInventory ? get(`/inventory-lots?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryLots: [] }), [projectId, canViewTasks, canViewInventory]);
  const documentRequirements = useLoad<{ documentRequirements?: AnyRecord[] }>(() => projectId && canViewTasks && canViewDocuments ? get(`/projects/${encodeURIComponent(projectId)}/document-requirements`) : Promise.resolve({ documentRequirements: [] }), [projectId, canViewTasks, canViewDocuments]);
  const projectDocuments = useLoad<{ documents?: AnyRecord[] }>(() => projectId && canViewTasks && canViewDocuments ? get(`/projects/${encodeURIComponent(projectId)}/documents`) : Promise.resolve({ documents: [] }), [projectId, canViewTasks, canViewDocuments]);
  const workItems = useLoad<{ workItems?: AnyRecord[] }>(() => projectId && canViewTasks ? get(`/projects/${encodeURIComponent(projectId)}/work-items`) : Promise.resolve({ workItems: [] }), [projectId, canViewTasks]);
  const recentTrips = (trips.data?.truckTrips || []).slice(0, 5);
  const p = portfolio.data || {};
  const visibleProjects = (projects.data?.projects || []).filter(project => !projectId || project.id === projectId);
  const activeProjectCount = p.activeProjects ?? visibleProjects.filter(project => project.status === 'active').length;
  const visibleContractVolume = p.contractVolume ?? visibleProjects.reduce((sum, project) => sum + Number(project.target_quantity || 0), 0);
  const visibleTripCount = p.shipmentCount ?? trips.data?.truckTrips?.length ?? 0;
  const loading = portfolio.loading || projects.loading || trips.loading;
  const refresh = () => { portfolio.refresh(); projects.refresh(); trips.refresh(); events.refresh(); workItems.refresh(); projectReport.refresh(); contractPrograms.refresh(); contracts.refresh(); inventoryLots.refresh(); documentRequirements.refresh(); projectDocuments.refresh(); };
  return <>
    <PageTitle eyebrow="EXECUTIVE OVERVIEW" title="Ringkasan operasional" subtitle="Pantau portofolio ekspor dan aktivitas terbaru dari satu tempat." actions={<ActionButton variant="secondary" onClick={refresh}><RefreshCw size={16} /> Segarkan</ActionButton>} />
    {loading && <Loading />}
    <div className="metric-grid">
      <Metric label="Proyek aktif" value={number(activeProjectCount, 0)} foot="Proyek yang terlihat oleh akun" icon={BriefcaseBusiness} tone="navy" />
      <Metric label="Target volume" value={`${number(visibleContractVolume)} MT`} foot="Akumulasi target proyek yang terlihat" icon={Boxes} tone="blue" />
      <Metric label="Anggaran RAB" value={activeUser?.platformAdmin === true ? idr(p.approvedBudget) : "—"} foot={activeUser?.platformAdmin === true ? "Nilai anggaran aktif" : "Ringkasan RAB tersedia di Finance Workspace"} icon={CircleDollarSign} tone="amber" />
      <Metric label="Perjalanan truk" value={number(visibleTripCount, 0)} foot="Trip dalam cakupan yang dipilih" icon={Truck} tone="green" />
    </div>
    {!projectId && activeUser?.platformAdmin !== true && <div className="inline-warning"><CircleAlert size={17} /> Pilih Project pada bagian atas untuk membuka ringkasan operasional Project.</div>}
    {canViewTasks && <Card><PanelHeading title="PM Control Tower · Tindak lanjut" description="Tugas, instruksi dan exception yang tercatat pada Project aktif." action={<Link className="inline-link" to="/my-work">Buka work queue <ArrowRight size={14} /></Link>} />
      {workItems.loading ? <Loading /> : workItems.error ? <ErrorState message={workItems.error} retry={workItems.refresh} /> : <>
        <div className="metric-grid four"><Metric label="Open" value={number((workItems.data?.workItems || []).filter(t => t.status === "open").length, 0)} icon={ClipboardCheck} tone="blue" /><Metric label="Overdue" value={number((workItems.data?.workItems || []).filter(t => t.is_overdue).length, 0)} icon={Clock3} tone="amber" /><Metric label="Blocked" value={number((workItems.data?.workItems || []).filter(t => t.status === "blocked").length, 0)} icon={CircleAlert} tone="amber" /><Metric label="Menunggu review PM" value={number((workItems.data?.workItems || []).filter(t => t.status === "submitted").length, 0)} icon={CheckCircle2} tone="green" /></div>
        {(workItems.data?.workItems || []).slice(0, 5).map(task => <div className="activity-item" key={task.id}><div className="activity-icon"><ClipboardCheck size={16} /></div><div className="activity-copy"><strong>{task.title}</strong><span>{task.owner_role_code} · {task.status} · {task.priority}</span><small>{task.is_overdue ? "Terlambat · " : "Tenggat · "}{dateTime(task.due_at)}</small></div></div>)}
        {!workItems.data?.workItems?.length && <EmptyState title="Belum ada tugas aktif" desc="Instruksi dan tindak lanjut Project akan muncul di sini setelah dibuat." />}</>}</Card>}
    {canViewTasks && <Card><PanelHeading title="Kesiapan Project · sumber data" description="Status berikut hanya mencerminkan data yang tersedia pada aplikasi; keberadaan record bukan persetujuan atau readiness operasional." action={<span className="muted">Cut-off: {dateTime(projectReport.data?.dataFreshness)}</span>} />
      <div className="service-list">
        <div><span>Kontrak & Contract Program</span><strong>{number(contracts.data?.contracts?.length || 0, 0)} kontrak · {number(contractPrograms.data?.contractPrograms?.length || 0, 0)} program</strong><small>{contracts.error || contractPrograms.error ? "Sumber tidak dapat diverifikasi" : (contracts.data?.contracts?.length || contractPrograms.data?.contractPrograms?.length) ? "Data tersedia · perlu review siklus/CoB" : "Belum ada data kontrak/program"}</small></div>
        <div><span>Warehouse & inventory</span><strong>{number(inventoryLots.data?.inventoryLots?.length || 0, 0)} lot tercatat</strong><small>{inventoryLots.error ? "Sumber tidak dapat diverifikasi" : inventoryLots.data?.inventoryLots?.length ? "Lot tersedia · status hold/reservation perlu diperiksa" : "Belum ada lot inventori"}</small></div>
        <div><span>Inland logistics</span><strong>{number(trips.data?.truckTrips?.length || 0, 0)} perjalanan</strong><small>{trips.error ? "Sumber tidak dapat diverifikasi" : trips.data?.truckTrips?.length ? "Trip tercatat · cek checkpoint dan keterlambatan" : "Belum ada trip tercatat"}</small></div>
        <div><span>Export documents</span><strong>{number(projectDocuments.data?.documents?.length || 0, 0)} dokumen / {number(documentRequirements.data?.documentRequirements?.length || 0, 0)} persyaratan</strong><small>{projectDocuments.error || documentRequirements.error ? "Sumber tidak dapat diverifikasi" : documentRequirements.data?.documentRequirements?.length ? "Checklist tersedia · verifikasi status dan bukti" : "Persyaratan dokumen belum dikonfigurasi"}</small></div>
        <div><span>Finance & RAB</span><strong>{projectReport.data?.approvedBudget !== undefined ? idr(projectReport.data.approvedBudget) : "Tidak tersedia"}</strong><small>{projectReport.error ? "Sumber laporan tidak dapat diverifikasi" : Number(projectReport.data?.approvedBudget || 0) > 0 ? "RAB tercatat · bukan bukti pembayaran/LC cair" : "Belum ada RAB yang tercatat"}</small></div>
        <div><span>Production & QA release</span><strong>Belum terintegrasi</strong><small>Belum tersedia sumber batch produksi, hasil QC/Lab dan keputusan QA release yang dapat dijadikan readiness.</small></div>
        <div><span>Vessel, loading & laytime</span><strong>Belum terintegrasi</strong><small>Vessel call, berth, shift loading, survey dan laytime planner belum tersedia sebagai workflow operasional.</small></div>
        <div><span>LC discrepancy & presentation</span><strong>Belum terintegrasi</strong><small>LC clause checker, discrepancy resolution dan deadline presentasi bank belum tersedia sebagai workflow.</small></div>
      </div>
    </Card>}
    <div className="dashboard-grid">
      <Card className="span-2"><PanelHeading title="Proyek berjalan" description="Ringkasan proyek aktif dalam portofolio." action={<Link className="inline-link" to="/projects">Lihat proyek <ArrowRight size={14} /></Link>} />
        {projects.loading ? <Loading /> : projects.error ? <ErrorState message={projects.error} retry={projects.refresh} /> : <DataTable rows={visibleProjects.slice(0, 6)} columns={[
          { key: 'name', label: 'Nama proyek', render: r => <div className="primary-cell"><strong>{r.name}</strong><small>{shortId(r.id)}</small></div> },
          { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
          { key: 'target_quantity', label: 'Target volume', render: r => `${number(r.target_quantity)} ${r.settlement_unit || 'MT'}` },
          { key: 'created_at', label: 'Dibuat', render: r => dateTime(r.created_at) },
        ]} emptyTitle="Belum ada proyek" emptyText="Buat program kontrak, lalu buat project instance pertama." />}
      </Card>
      <Card><PanelHeading title="Aktivitas terakhir" description="Checkpoint perjalanan truk." />
        {events.loading ? <Loading /> : events.error ? <ErrorState message={events.error} retry={events.refresh} /> : <div className="activity-list">{(events.data?.trackingEvents || []).slice(0, 6).map((event, i) => <div className="activity-item" key={event.id || i}><div className="activity-icon"><MapPin size={16} /></div><div className="activity-copy"><strong>{event.event_type || 'Checkpoint'}</strong><span>{event.description || 'Pembaruan perjalanan'}</span><small>{dateTime(event.server_timestamp)}</small></div></div>)}{!events.data?.trackingEvents?.length && <EmptyState title="Belum ada checkpoint" desc="Checkpoint lapangan akan tampil di sini." />}</div>}
      </Card>
      <Card><PanelHeading title="Kesiapan sistem" description="Sumber data dan layanan inti." />
        <div className="service-list"><div><span><span className="service-dot online" /> Database production</span><StatusPill value="connected" /></div><div><span><span className="service-dot online" /> Neon Auth</span><StatusPill value="enabled" /></div><div><span><span className="service-dot online" /> PKE API</span><StatusPill value="available" /></div><div><span><span className="service-dot warning" /> Email / SMS</span><StatusPill value="not_configured" /></div></div>
        <p className="source-note">Status layanan email dan SMS mengikuti konfigurasi backend saat ini.</p>
      </Card>
      <Card className="span-2"><PanelHeading title="Ringkasan biaya & risiko" description="Angka yang belum tersedia pada API ditampilkan sebagai belum dihitung." />
        <div className="insight-grid"><div><span>Biaya committed</span><strong>{p.committedCost != null ? idr(p.committedCost) : 'Belum dihitung'}</strong></div><div><span>Biaya aktual</span><strong>{p.actualCost != null ? idr(p.actualCost) : 'Belum dihitung'}</strong></div><div><span>Piutang terbuka</span><strong>{p.outstandingReceivables != null ? idr(p.outstandingReceivables) : 'Belum dihitung'}</strong></div><div><span>Blocker compliance</span><strong>{p.criticalComplianceBlockers ?? 'Belum dihitung'}</strong></div></div>
        <div className="data-freshness"><Clock3 size={14} /> Data diperbarui {dateTime(p.dataFreshness)}</div>
      </Card>
    </div>
  </>;
}

function ProjectsPage({ activeUser, onNotice }: { activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const canCreateProject = activeUser?.platformAdmin === true;
  const projects = useLoad<{ projects?: AnyRecord[] }>(() => get('/projects'), []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', settlementUnit: 'MT', targetQuantity: '', status: 'draft' });
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!canCreateProject) return; setBusy(true);
    try { await post('/projects', { ...form, targetQuantity: Number(form.targetQuantity) }); onNotice('success', 'Proyek berhasil dibuat.'); setShowForm(false); setForm((v: any) => ({ ...v, name: '', description: '', targetQuantity: '' })); projects.refresh(); }
    catch (e) { onNotice('error', e instanceof Error ? e.message : 'Proyek tidak dapat dibuat.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageTitle eyebrow="PROJECT PORTFOLIO" title="Proyek ekspor" subtitle="Setiap project instance mewakili satu unit pemenuhan atau settlement buyer." actions={canCreateProject ? <ActionButton onClick={() => setShowForm(v => !v)}><Plus size={16} /> Proyek baru</ActionButton> : undefined} />
    {showForm && canCreateProject && <Card className="form-panel"><PanelHeading title="Buat project instance" description="Admin membuat shell Project terlebih dahulu. PM menambahkan Contract Program setelah Project tersedia." action={<button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button>} />
      <form className="form-grid" onSubmit={save}>
        <FormField label="Nama proyek"><input value={form.name} onChange={e => setForm((v: any) => ({ ...v, name: e.target.value }))} required placeholder="Contoh: PKE China Cycle 01" /></FormField>
        <FormField label="Target kuantitas"><input type="number" min="0.01" step="0.01" value={form.targetQuantity} onChange={e => setForm((v: any) => ({ ...v, targetQuantity: e.target.value }))} required /></FormField>
        <FormField label="Satuan settlement"><select value={form.settlementUnit} onChange={e => setForm((v: any) => ({ ...v, settlementUnit: e.target.value }))}><option>MT</option><option>Ton</option><option>Shipment</option><option>Tranche</option></select></FormField>
        <FormField label="Status"><select value={form.status} onChange={e => setForm((v: any) => ({ ...v, status: e.target.value }))}><option value="draft">Draft</option><option value="active">Active</option></select></FormField>
        <FormField label="Deskripsi" wide><textarea rows={2} value={form.description} onChange={e => setForm((v: any) => ({ ...v, description: e.target.value }))} /></FormField>
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => setShowForm(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan proyek'}</button></div>
      </form>
    </Card>}
    <Card><PanelHeading title="Daftar proyek" description="Status, target volume, dan waktu pembuatan." action={<button className="icon-button" onClick={() => projects.refresh()} title="Refresh"><RefreshCw size={16} /></button>} />
      {projects.loading ? <Loading /> : projects.error ? <ErrorState message={projects.error} retry={projects.refresh} /> : <DataTable rows={projects.data?.projects || []} columns={[
        { key: 'name', label: 'Proyek', render: r => <div className="primary-cell"><strong>{r.name}</strong><small>{shortId(r.id)}</small></div> },
        { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
        { key: 'target_quantity', label: 'Target', render: r => `${number(r.target_quantity)} ${r.settlement_unit || 'MT'}` },
        { key: 'started_at', label: 'Mulai', render: r => dateTime(r.started_at) },
        { key: 'created_at', label: 'Dibuat', render: r => dateTime(r.created_at) },
      ]} />}
    </Card>
  </>;
}

function ContractsPage({ activeUser, onNotice }: { activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const canManagePrograms = hasProjectPermission('manage_contract_programs', activeUser);
  const canViewContracts = hasProjectPermission('contract.view', activeUser);
  const programs = useLoad<{ contractPrograms?: AnyRecord[] }>(() => canViewContracts ? get('/contract-programs') : Promise.resolve({ contractPrograms: [] }), [canViewContracts]);
  const cycles = useLoad<{ cyclePolicies?: AnyRecord[] }>(() => canViewContracts ? get('/cycle-policies') : Promise.resolve({ cyclePolicies: [] }), [canViewContracts]);
  const [mode, setMode] = useState<'program' | 'cycle'>('program');
  const [showForm, setShowForm] = useState(false); const [busy, setBusy] = useState(false);
  const [program, setProgram] = useState({ name: '', description: '', settlementUnit: 'MT', targetQuantity: '', cadence: 'monthly', generationMode: 'scheduled_draft' });
  const [cycle, setCycle] = useState({ contractProgramId: '', cadence: 'monthly', targetQuantity: '', generationMode: 'scheduled_draft' });
  useEffect(() => { if (!cycle.contractProgramId && programs.data?.contractPrograms?.[0]) setCycle(v => ({ ...v, contractProgramId: programs.data!.contractPrograms![0].id })); }, [programs.data, cycle.contractProgramId]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!canManagePrograms) return; setBusy(true);
    try {
      if (mode === 'program') await post('/contract-programs', { ...program, targetQuantity: Number(program.targetQuantity) });
      else await post('/cycle-policies', { ...cycle, targetQuantity: cycle.targetQuantity ? Number(cycle.targetQuantity) : null });
      onNotice('success', mode === 'program' ? 'Program kontrak berhasil dibuat.' : 'Kebijakan siklus berhasil dibuat.');
      setShowForm(false); programs.refresh(); cycles.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Data tidak dapat disimpan.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageTitle eyebrow="COMMERCIAL FOUNDATION" title="Program kontrak" subtitle="Kelola kerangka kontrak buyer dan aturan recurring delivery cycle." actions={canManagePrograms ? <ActionButton onClick={() => setShowForm(v => !v)}><Plus size={16} /> Tambah data</ActionButton> : undefined} />
    <div className="segmented"><button className={mode === 'program' ? 'selected' : ''} onClick={() => setMode('program')}>Program kontrak</button><button className={mode === 'cycle' ? 'selected' : ''} onClick={() => setMode('cycle')}>Kebijakan siklus</button></div>
    {showForm && canManagePrograms && <Card className="form-panel"><PanelHeading title={mode === 'program' ? 'Program kontrak baru' : 'Kebijakan siklus baru'} action={<button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button>} />
      <form className="form-grid" onSubmit={save}>
        {mode === 'program' ? <>
          <FormField label="Nama program"><input value={program.name} onChange={e => setProgram(v => ({ ...v, name: e.target.value }))} required placeholder="Framework PKE Buyer" /></FormField>
          <FormField label="Satuan settlement"><select value={program.settlementUnit} onChange={e => setProgram(v => ({ ...v, settlementUnit: e.target.value }))}><option>MT</option><option>Shipment</option><option>Tranche</option></select></FormField>
          <FormField label="Target kuantitas"><input type="number" min="0.01" step="0.01" value={program.targetQuantity} onChange={e => setProgram(v => ({ ...v, targetQuantity: e.target.value }))} required /></FormField>
          <FormField label="Cadence"><select value={program.cadence} onChange={e => setProgram(v => ({ ...v, cadence: e.target.value }))}><option value="monthly">Bulanan</option><option value="weekly">Mingguan</option><option value="quarterly">Triwulanan</option><option value="on_demand">Sesuai kebutuhan</option></select></FormField>
          <FormField label="Mode generasi"><select value={program.generationMode} onChange={e => setProgram(v => ({ ...v, generationMode: e.target.value }))}><option value="scheduled_draft">Scheduled draft</option><option value="admin_manual">Admin manual</option><option value="quantity_triggered_draft">Quantity triggered draft</option></select></FormField>
          <FormField label="Deskripsi" wide><textarea rows={2} value={program.description} onChange={e => setProgram(v => ({ ...v, description: e.target.value }))} /></FormField>
        </> : <>
          <FormField label="Program kontrak"><select value={cycle.contractProgramId} onChange={e => setCycle(v => ({ ...v, contractProgramId: e.target.value }))} required>{(programs.data?.contractPrograms || []).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></FormField>
          <FormField label="Cadence"><select value={cycle.cadence} onChange={e => setCycle(v => ({ ...v, cadence: e.target.value }))}><option value="monthly">Bulanan</option><option value="weekly">Mingguan</option><option value="quarterly">Triwulanan</option><option value="on_demand">Sesuai kebutuhan</option></select></FormField>
          <FormField label="Target kuantitas"><input type="number" step="0.01" value={cycle.targetQuantity} onChange={e => setCycle(v => ({ ...v, targetQuantity: e.target.value }))} /></FormField>
          <FormField label="Mode generasi"><select value={cycle.generationMode} onChange={e => setCycle(v => ({ ...v, generationMode: e.target.value }))}><option value="scheduled_draft">Scheduled draft</option><option value="admin_manual">Admin manual</option><option value="quantity_triggered_draft">Quantity triggered draft</option></select></FormField>
        </>}
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => setShowForm(false)}>Batal</ActionButton><button className="primary-button" disabled={busy || (mode === 'cycle' && !programs.data?.contractPrograms?.length)}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
      </form>
    </Card>}
    <Card><PanelHeading title={mode === 'program' ? 'Program kontrak terdaftar' : 'Kebijakan siklus'} description="Data tersimpan pada database production." action={<button className="icon-button" onClick={() => { programs.refresh(); cycles.refresh(); }}><RefreshCw size={16} /></button>} />
      {mode === 'program' ? programs.loading ? <Loading /> : programs.error ? <ErrorState message={programs.error} retry={programs.refresh} /> : <DataTable rows={programs.data?.contractPrograms || []} columns={[
        { key: 'name', label: 'Nama program', render: r => <div className="primary-cell"><strong>{r.name}</strong><small>{shortId(r.id)}</small></div> },
        { key: 'settlement_unit', label: 'Settlement' }, { key: 'target_quantity', label: 'Target', render: r => number(r.target_quantity) },
        { key: 'cadence', label: 'Cadence' }, { key: 'generation_mode', label: 'Mode', render: r => <StatusPill value={r.generation_mode} /> },
      ]} /> : cycles.loading ? <Loading /> : cycles.error ? <ErrorState message={cycles.error} retry={cycles.refresh} /> : <DataTable rows={cycles.data?.cyclePolicies || []} columns={[
        { key: 'contract_program_id', label: 'Program', render: r => <span className="mono">{shortId(r.contract_program_id)}</span> }, { key: 'cadence', label: 'Cadence' },
        { key: 'target_quantity', label: 'Target', render: r => number(r.target_quantity) }, { key: 'generation_mode', label: 'Mode', render: r => <StatusPill value={r.generation_mode} /> },
      ]} />}
    </Card>
  </>;
}

function OperationsPage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const can = (permission: string) => hasProjectPermission(permission, activeUser);
  const canLogisticsView = can('logistics.view');
  const canWarehouseView = can('warehouse.view');
  const canInventoryView = can('inventory.view');
  const canShippingView = can('shipping.view');
  const trips = useLoad<{ truckTrips?: AnyRecord[] }>(() => projectId && canLogisticsView ? get(`/truck-trips?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ truckTrips: [] }), [projectId, canLogisticsView]);
  const events = useLoad<{ trackingEvents?: AnyRecord[] }>(() => projectId && canLogisticsView ? get(`/tracking-events?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ trackingEvents: [] }), [projectId, canLogisticsView]);
  const receipts = useLoad<{ warehouseReceipts?: AnyRecord[] }>(() => projectId && canWarehouseView ? get(`/warehouse-receipts?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ warehouseReceipts: [] }), [projectId, canWarehouseView]);
  const lots = useLoad<{ inventoryLots?: AnyRecord[] }>(() => projectId && canInventoryView ? get(`/inventory-lots?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryLots: [] }), [projectId, canInventoryView]);
  const movements = useLoad<{ inventoryMovements?: AnyRecord[] }>(() => projectId && canInventoryView ? get(`/inventory-movements?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryMovements: [] }), [projectId, canInventoryView]);
  const reservations = useLoad<{ inventoryReservations?: AnyRecord[] }>(() => projectId && canInventoryView ? get(`/inventory-reservations?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryReservations: [] }), [projectId, canInventoryView]);
  const holds = useLoad<{ inventoryHolds?: AnyRecord[] }>(() => projectId && canInventoryView ? get(`/inventory-holds?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryHolds: [] }), [projectId, canInventoryView]);
  const allocations = useLoad<{ shipmentAllocations?: AnyRecord[] }>(() => projectId && canShippingView ? get(`/shipment-allocations?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ shipmentAllocations: [] }), [projectId, canShippingView]);
  const legs = useLoad<{ transportLegs?: AnyRecord[] }>(() => Promise.resolve({ transportLegs: [] }), []);
  const [formOpen, setFormOpen] = useState(false); const [eventOpen, setEventOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState({ projectId: projectId || '', transportLegId: '', licensePlate: '', driverName: '', pksSiteId: '', vehicleId: '', departureTime: new Date().toISOString().slice(0, 16), arrivalTime: '' });
  const [event, setEvent] = useState({ truckTripId: '', eventType: 'checkpoint', checkerId: '', latitude: '', longitude: '', gpsAccuracy: '', source: 'checker_device', captureTimestamp: new Date().toISOString().slice(0, 16), notes: '' });
  const [receipt, setReceipt] = useState({ projectId: projectId || '', truckTripId: '', lotId: '', receivedQuantity: '', unit: 'MT', checkerId: '', conditionStatus: '', exceptionReason: '', weighbridgeTicketKey: '', checkTimestamp: new Date().toISOString().slice(0, 16), status: 'pending' });
  const [lot, setLot] = useState({ projectId: projectId || '', pksSiteId: '', quantity: '', unit: 'MT', location: '', status: 'incoming' });
  const [reservationOpen, setReservationOpen] = useState(false);
  const [reservation, setReservation] = useState({ projectId: projectId || '', lotId: '', reservedQuantity: '', unit: 'MT', referenceType: '', idempotencyKey: '' });
  const [reservationAvailableQty, setReservationAvailableQty] = useState(0);
  const [holdOpen, setHoldOpen] = useState(false);
  const [hold, setHold] = useState({ projectId: projectId || '', lotId: '', heldQuantity: '', unit: 'MT', reason: '', idempotencyKey: '' });
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocation, setAllocation] = useState({ projectId: projectId || '', lotId: '', allocatedQuantity: '', unit: 'MT', idempotencyKey: '' });
  const [movementOpen, setMovementOpen] = useState(false);
  const [movement, setMovement] = useState({ projectId: projectId || '', lotId: '', movementType: 'receipt', quantity: '', unit: 'MT', warehouseReceiptId: '', sourceLocation: '', destinationLocation: '', reason: '', referenceId: '', referenceType: '' });
  useEffect(() => {
    setTrip(v => ({ ...v, projectId })); setReceipt(v => ({ ...v, projectId })); setLot(v => ({ ...v, projectId }));
    setReservation(v => ({ ...v, projectId })); setHold(v => ({ ...v, projectId })); setAllocation(v => ({ ...v, projectId })); setMovement(v => ({ ...v, projectId }));
  }, [projectId]);
  useEffect(() => { if (projectId) { setTrip(v => ({ ...v, projectId })); setReceipt(v => ({ ...v, projectId })); setLot(v => ({ ...v, projectId })); setReservation(v => ({ ...v, projectId })); setHold(v => ({ ...v, projectId })); setAllocation(v => ({ ...v, projectId })); setMovement(v => ({ ...v, projectId })); } }, [projectId]);
  useEffect(() => { if (!trip.transportLegId) setTrip(v => ({ ...v, transportLegId: '' })); }, []);
  useEffect(() => { if (!event.truckTripId && trips.data?.truckTrips?.[0]) setEvent(v => ({ ...v, truckTripId: trips.data!.truckTrips![0].id })); }, [trips.data, event.truckTripId]);
  useEffect(() => { if (!receipt.checkerId) setReceipt(v => ({ ...v, checkerId: '' })); }, []);
  useEffect(() => { if (!lot.pksSiteId) setLot(v => ({ ...v, pksSiteId: '' })); }, []);

  useEffect(() => {
    if (!reservation.lotId) { setReservationAvailableQty(0); return; }
    const lot = (lots.data?.inventoryLots || []).find(l => l.id === reservation.lotId);
    if (!lot) { setReservationAvailableQty(0); return; }
    const lotQty = Number(lot.quantity || 0);
    const res = (reservations.data?.inventoryReservations || [])
      .filter(r => r.lot_id === reservation.lotId && r.status === 'active');
    const used = res.reduce((sum, r) => sum + (Number(r.reserved_quantity || 0) - Number(r.fulfilled_quantity || 0)), 0);
    setReservationAvailableQty(Math.max(0, lotQty - used));
  }, [reservation.lotId, lots.data, reservations.data]);

  const saveTrip = async (e: FormEvent) => {
    e.preventDefault(); if (!can('record_truck_trips')) return; setBusy(true);
    try {
      await post('/truck-trips', { ...trip, departureTime: trip.departureTime ? new Date(trip.departureTime).toISOString() : null, arrivalTime: trip.arrivalTime ? new Date(trip.arrivalTime).toISOString() : null });
      onNotice('success', 'Perjalanan truk berhasil dicatat.'); setFormOpen(false); trips.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Trip gagal disimpan.'); }
    finally { setBusy(false); }
  };
  const saveEvent = async (e: FormEvent) => {
    e.preventDefault(); if (event.eventType === 'checkpoint' ? !can('verify_checkpoints') : !can('record_truck_trips')) return; setBusy(true);
    try {
      await post('/tracking-events', { ...event, latitude: event.latitude ? Number(event.latitude) : null, longitude: event.longitude ? Number(event.longitude) : null, gpsAccuracy: event.gpsAccuracy ? Number(event.gpsAccuracy) : null, captureTimestamp: event.captureTimestamp ? new Date(event.captureTimestamp).toISOString() : null });
      onNotice('success', 'Checkpoint berhasil dikirim.'); setEventOpen(false); events.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Checkpoint gagal disimpan.'); }
    finally { setBusy(false); }
  };
  const saveReceipt = async (e: FormEvent) => {
    e.preventDefault(); if (!can('warehouse.receipt.create')) return; setBusy(true);
    try {
      await post('/warehouse-receipts', { ...receipt, receivedQuantity: receipt.receivedQuantity ? Number(receipt.receivedQuantity) : null, checkTimestamp: receipt.checkTimestamp ? new Date(receipt.checkTimestamp).toISOString() : null });
      onNotice('success', 'Terima gudang berhasil dicatat.'); setReceipt(v => ({ ...v, receivedQuantity: '', conditionStatus: '', exceptionReason: '', weighbridgeTicketKey: '', status: 'pending' })); receipts.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Terima gudang gagal disimpan.'); }
    finally { setBusy(false); }
  };
  const saveLot = async (e: FormEvent) => {
    e.preventDefault(); if (!can('inventory.create')) return; setBusy(true);
    try {
      await post('/inventory-lots', { ...lot, quantity: lot.quantity ? Number(lot.quantity) : null });
      onNotice('success', 'Lot inventori berhasil dibuat.'); setFormOpen(false); lots.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Lot inventori gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const saveReservation = async (e: FormEvent) => {
    e.preventDefault(); if (!can('inventory.reserve')) return; setBusy(true);
    try {
      const reservedQty = Number(reservation.reservedQuantity || 0);
      if (reservedQty > reservationAvailableQty) {
        onNotice('error', `Kuantitas reservasi melebihi stok tersedia (tersedia ${number(reservationAvailableQty)} ${reservation.unit || 'MT'}).`);
        return;
      }
      await post('/inventory-reservations', { ...reservation, reservedQuantity: reservedQty });
      onNotice('success', 'Reservasi inventori berhasil dibuat.'); setReservationOpen(false); reservations.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Reservasi gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const saveHold = async (e: FormEvent) => {
    e.preventDefault(); if (!can('inventory.hold')) return; setBusy(true);
    try {
      await post('/inventory-holds', { ...hold, heldQuantity: Number(hold.heldQuantity) });
      onNotice('success', 'Tahanan inventori berhasil dibuat.'); setHoldOpen(false); holds.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Tahanan gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const saveAllocation = async (e: FormEvent) => {
    e.preventDefault(); if (!can('shipping.update')) return; setBusy(true);
    try {
      await post('/shipment-allocations', { ...allocation, allocatedQuantity: Number(allocation.allocatedQuantity) });
      onNotice('success', 'Alokasi pengiriman berhasil dibuat.'); setAllocationOpen(false); allocations.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Alokasi gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const saveMovement = async (e: FormEvent) => {
    e.preventDefault(); if (!can('inventory.update')) return; setBusy(true);
    try {
      await post('/inventory-movements', { ...movement, quantity: Number(movement.quantity) });
      onNotice('success', 'Gerakan inventori berhasil dicatat.'); setMovementOpen(false); movements.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gerakan inventori gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const captureLocation = () => { if (!navigator.geolocation) { onNotice('error', 'Browser tidak mendukung geolocation.'); return; } navigator.geolocation.getCurrentPosition(pos => setEvent(v => ({ ...v, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude), gpsAccuracy: String(Math.round(pos.coords.accuracy)) })), err => onNotice('error', `Lokasi tidak tersedia: ${err.message}`), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }); };
  return <>
    <PageTitle eyebrow="FIELD & LOGISTICS" title="Operasional pengiriman" subtitle="Panel dan tindakan ditampilkan sesuai permission Project aktif." actions={<>{(can("record_truck_trips") || can("verify_checkpoints")) && <ActionButton variant="secondary" onClick={() => setEventOpen(v => !v)}><MapPin size={16} /> Catat checkpoint</ActionButton>}{can("inventory.reserve") && <ActionButton variant="ghost" onClick={() => setReservationOpen(v => !v)}><Plus size={14} /> Reservasi</ActionButton>}{can("inventory.hold") && <ActionButton variant="ghost" onClick={() => setHoldOpen(v => !v)}><Plus size={14} /> Tahanan</ActionButton>}{can("shipping.update") && <ActionButton variant="ghost" onClick={() => setAllocationOpen(v => !v)}><Plus size={14} /> Alokasi</ActionButton>}{can("inventory.update") && <ActionButton variant="ghost" onClick={() => setMovementOpen(v => !v)}><Plus size={14} /> Gerakan</ActionButton>}</>} />
    <div className="metric-grid three"><Metric label="Total perjalanan" value={number(trips.data?.truckTrips?.length || 0, 0)} icon={Truck} tone="navy" /><Metric label="Checkpoint tercatat" value={number(events.data?.trackingEvents?.length || 0, 0)} icon={MapPin} tone="blue" /><Metric label="Proyek terhubung" value={number(new Set((trips.data?.truckTrips || []).map(t => t.project_id)).size, 0)} icon={BriefcaseBusiness} tone="green" /></div>
    {formOpen && <Card className="form-panel"><PanelHeading title="Perjalanan truk baru" action={<button className="icon-button" onClick={() => setFormOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveTrip}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="Transport leg ID"><select value={trip.transportLegId} onChange={e => setTrip(v => ({ ...v, transportLegId: e.target.value }))} required><option value="">Pilih transport leg</option>{(legs.data?.transportLegs || []).map(l => <option key={l.id} value={l.id}>{l.origin} → {l.destination} ({l.status})</option>)}</select></FormField>
      <FormField label="Nomor polisi"><input value={trip.licensePlate} onChange={e => setTrip(v => ({ ...v, licensePlate: e.target.value.toUpperCase() }))} required /></FormField>
      <FormField label="Nama sopir"><input value={trip.driverName} onChange={e => setTrip(v => ({ ...v, driverName: e.target.value }))} /></FormField>
      <FormField label="PKS site ID"><input value={trip.pksSiteId} onChange={e => setTrip(v => ({ ...v, pksSiteId: e.target.value }))} /></FormField>
      <FormField label="Kendaraan ID"><input value={trip.vehicleId} onChange={e => setTrip(v => ({ ...v, vehicleId: e.target.value }))} /></FormField>
      <FormField label="Waktu keberangkatan"><input type="datetime-local" value={trip.departureTime} onChange={e => setTrip(v => ({ ...v, departureTime: e.target.value }))} required /></FormField>
      <FormField label="Waktu kedatangan"><input type="datetime-local" value={trip.arrivalTime} onChange={e => setTrip(v => ({ ...v, arrivalTime: e.target.value }))} /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setFormOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perjalanan'}</button></div>
    </form></Card>}
    {eventOpen && (can("record_truck_trips") || can("verify_checkpoints")) && <Card className="form-panel"><PanelHeading title="Checkpoint perjalanan" description="Ambil koordinat dari perangkat checker saat checkpoint terjadi." action={<button className="icon-button" onClick={() => setEventOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveEvent}>
      <FormField label="Perjalanan"><select value={event.truckTripId} onChange={e => setEvent(v => ({ ...v, truckTripId: e.target.value }))} required>{(trips.data?.truckTrips || []).map(t => <option key={t.id} value={t.id}>{t.license_plate || shortId(t.id)}</option>)}</select></FormField>
      <FormField label="Checker ID"><input value={event.checkerId} onChange={e => setEvent(v => ({ ...v, checkerId: e.target.value }))} required /></FormField>
      <FormField label="Jenis event"><select value={event.eventType} onChange={e => setEvent(v => ({ ...v, eventType: e.target.value }))}>{can("record_truck_trips") && <><option value="departure">Departure</option><option value="arrival">Arrival</option><option value="weighbridge">Weighbridge</option><option value="exception">Exception</option></>}<option value="checkpoint">Checkpoint</option></select></FormField>
      <FormField label="Latitude"><input value={event.latitude} onChange={e => setEvent(v => ({ ...v, latitude: e.target.value }))} required /></FormField><FormField label="Longitude"><input value={event.longitude} onChange={e => setEvent(v => ({ ...v, longitude: e.target.value }))} required /></FormField><FormField label="Akurasi GPS (meter)"><input value={event.gpsAccuracy} onChange={e => setEvent(v => ({ ...v, gpsAccuracy: e.target.value }))} required /></FormField>
      <FormField label="Waktu capture"><input type="datetime-local" value={event.captureTimestamp} onChange={e => setEvent(v => ({ ...v, captureTimestamp: e.target.value }))} required /></FormField>
      <FormField label="Catatan" wide><textarea rows={2} value={event.notes} onChange={e => setEvent(v => ({ ...v, notes: e.target.value }))} /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={captureLocation}><MapPin size={15} /> Ambil GPS perangkat</ActionButton><ActionButton variant="secondary" onClick={() => setEventOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy || !event.truckTripId}>{busy ? 'Mengirim…' : 'Kirim checkpoint'}</button></div>
    </form><div className="source-note">Unggah foto bukti belum tersedia di endpoint saat ini. Koordinat dan catatan dapat dikirim melalui form ini.</div></Card>}
    {can("warehouse.receipt.create") && (<Card className="span-2"><PanelHeading title="Terima gudang baru" description="Catatan penerimaan barang dari perjalanan truk." action={<ActionButton onClick={() => setReceipt(v => ({ ...v, projectId: projectId || '', status: 'pending' }))}><Plus size={16} /> Terima baru</ActionButton>} /><form className="form-grid" onSubmit={saveReceipt}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="Perjalanan ID"><input value={receipt.truckTripId} onChange={e => setReceipt(v => ({ ...v, truckTripId: e.target.value }))} /></FormField>
      <FormField label="Lot ID"><input value={receipt.lotId} onChange={e => setReceipt(v => ({ ...v, lotId: e.target.value }))} /></FormField>
      <FormField label="Kuantitas diterima"><input type="number" step="0.01" value={receipt.receivedQuantity} onChange={e => setReceipt(v => ({ ...v, receivedQuantity: e.target.value }))} required /></FormField>
      <FormField label="Satuan"><input value={receipt.unit} onChange={e => setReceipt(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Checker ID"><input value={receipt.checkerId} onChange={e => setReceipt(v => ({ ...v, checkerId: e.target.value }))} required /></FormField>
      <FormField label="Status kondisi"><input value={receipt.conditionStatus} onChange={e => setReceipt(v => ({ ...v, conditionStatus: e.target.value }))} /></FormField>
      <FormField label="No. tiket timbang"><input value={receipt.weighbridgeTicketKey} onChange={e => setReceipt(v => ({ ...v, weighbridgeTicketKey: e.target.value }))} /></FormField>
      <FormField label="Waktu check"><input type="datetime-local" value={receipt.checkTimestamp} onChange={e => setReceipt(v => ({ ...v, checkTimestamp: e.target.value }))} /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setReceipt(v => ({ ...v, receivedQuantity: '', conditionStatus: '', exceptionReason: '', weighbridgeTicketKey: '', status: 'pending' }))}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan terima gudang'}</button></div>
    </form></Card>)} 
    {can("inventory.create") && (<Card className="span-2"><PanelHeading title="Lot inventori baru" description="Buat lot inventori dari penerimaan yang sah." action={<ActionButton onClick={() => setLot(v => ({ ...v, projectId: projectId || '', status: 'incoming' }))}><Plus size={16} /> Lot baru</ActionButton>} /><form className="form-grid" onSubmit={saveLot}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="PKS site ID"><input value={lot.pksSiteId} onChange={e => setLot(v => ({ ...v, pksSiteId: e.target.value }))} /></FormField>
      <FormField label="Kuantitas"><input type="number" step="0.01" value={lot.quantity} onChange={e => setLot(v => ({ ...v, quantity: e.target.value }))} required /></FormField>
      <FormField label="Satuan"><input value={lot.unit} onChange={e => setLot(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Lokasi"><input value={lot.location} onChange={e => setLot(v => ({ ...v, location: e.target.value }))} /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setLot(v => ({ ...v, quantity: '', location: '', status: 'incoming' }))}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan lot'}</button></div>
    </form></Card>)} 
    {reservationOpen && can("inventory.reserve") && <Card className="form-panel"><PanelHeading title="Reservasi inventori baru" action={<button className="icon-button" onClick={() => setReservationOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveReservation}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="Lot ID"><select value={reservation.lotId} onChange={e => setReservation(v => ({ ...v, lotId: e.target.value }))} required>{(lots.data?.inventoryLots || []).map(l => { const lqty = Number(l.quantity || 0); const used = (reservations.data?.inventoryReservations || []).filter(r => r.lot_id === l.id && r.status === 'active').reduce((s, r) => s + (Number(r.reserved_quantity || 0) - Number(r.fulfilled_quantity || 0)), 0); const avail = Math.max(0, lqty - used); return <option key={l.id} value={l.id} disabled={avail <= 0}>{l.id.slice(0, 8)}… (tersedia ${number(avail)} ${l.unit || 'MT'})</option>; })}</select></FormField>
      <FormField label="Kuantitas yang dipesan"><input type="number" step="0.01" value={reservation.reservedQuantity} onChange={e => setReservation(v => ({ ...v, reservedQuantity: e.target.value }))} required /></FormField>
      {reservation.lotId && <div className="source-note">Stok tersedia untuk lot ini: <strong>{number(reservationAvailableQty)}</strong> {reservation.unit || 'MT'}</div>}
      <FormField label="Satuan"><input value={reservation.unit} onChange={e => setReservation(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Tipe referensi"><input value={reservation.referenceType} onChange={e => setReservation(v => ({ ...v, referenceType: e.target.value }))} /></FormField>
      <FormField label="Idempotency key"><input value={reservation.idempotencyKey} onChange={e => setReservation(v => ({ ...v, idempotencyKey: e.target.value }))} required placeholder="Kunci unik untuk idempotensi" /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setReservationOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy || Number(reservation.reservedQuantity || 0) > reservationAvailableQty}>{busy ? 'Menyimpan…' : Number(reservation.reservedQuantity || 0) > reservationAvailableQty ? 'Kuantitas melebihi stok' : 'Simpan reservasi'}</button></div>
    </form></Card>}
    {holdOpen && can("inventory.hold") && <Card className="form-panel"><PanelHeading title="Tahanan inventori baru" action={<button className="icon-button" onClick={() => setHoldOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveHold}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="Lot ID"><input value={hold.lotId} onChange={e => setHold(v => ({ ...v, lotId: e.target.value }))} required /></FormField>
      <FormField label="Kuantitas yang ditahan"><input type="number" step="0.01" value={hold.heldQuantity} onChange={e => setHold(v => ({ ...v, heldQuantity: e.target.value }))} required /></FormField>
      <FormField label="Satuan"><input value={hold.unit} onChange={e => setHold(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Alasan"><input value={hold.reason} onChange={e => setHold(v => ({ ...v, reason: e.target.value }))} required /></FormField>
      <FormField label="Idempotency key"><input value={hold.idempotencyKey} onChange={e => setHold(v => ({ ...v, idempotencyKey: e.target.value }))} required placeholder="Kunci unik untuk idempotensi" /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setHoldOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan tahanan'}</button></div>
    </form></Card>}
    {allocationOpen && can("shipping.update") && <Card className="form-panel"><PanelHeading title="Alokasi pengiriman baru" action={<button className="icon-button" onClick={() => setAllocationOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveAllocation}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="Lot ID"><input value={allocation.lotId} onChange={e => setAllocation(v => ({ ...v, lotId: e.target.value }))} required /></FormField>
      <FormField label="Kuantitas dialokasikan"><input type="number" step="0.01" value={allocation.allocatedQuantity} onChange={e => setAllocation(v => ({ ...v, allocatedQuantity: e.target.value }))} required /></FormField>
      <FormField label="Satuan"><input value={allocation.unit} onChange={e => setAllocation(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Idempotency key"><input value={allocation.idempotencyKey} onChange={e => setAllocation(v => ({ ...v, idempotencyKey: e.target.value }))} required placeholder="Kunci unik untuk idempotensi" /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setAllocationOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan alokasi'}</button></div>
    </form></Card>}
    {movementOpen && can("inventory.update") && <Card className="form-panel"><PanelHeading title="Gerakan inventori baru" action={<button className="icon-button" onClick={() => setMovementOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveMovement}>
      <FormField label="Project aktif"><input value={projectId} readOnly /></FormField>
      <FormField label="Lot ID"><select value={movement.lotId} onChange={e => setMovement(v => ({ ...v, lotId: e.target.value }))} required>{(lots.data?.inventoryLots || []).map(l => <option key={l.id} value={l.id}>{shortId(l.id)} ({l.quantity} {l.unit})</option>)}</select></FormField>
      <FormField label="Tipe gerakan"><select value={movement.movementType} onChange={e => setMovement(v => ({ ...v, movementType: e.target.value }))} required><option value="receipt">Penerimaan</option><option value="transfer">Transfer</option><option value="issue">Pengeluaran</option><option value="adjustment">Penyesuaian</option><option value="return">Retur</option></select></FormField>
      <FormField label="Kuantitas"><input type="number" step="0.01" min="0.01" value={movement.quantity} onChange={e => setMovement(v => ({ ...v, quantity: e.target.value }))} required /></FormField>
      <FormField label="Satuan"><input value={movement.unit} onChange={e => setMovement(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Warehouse receipt ID (opsional)"><input value={movement.warehouseReceiptId} onChange={e => setMovement(v => ({ ...v, warehouseReceiptId: e.target.value }))} /></FormField>
      <FormField label="Lokasi sumber"><input value={movement.sourceLocation} onChange={e => setMovement(v => ({ ...v, sourceLocation: e.target.value }))} /></FormField>
      <FormField label="Lokasi tujuan"><input value={movement.destinationLocation} onChange={e => setMovement(v => ({ ...v, destinationLocation: e.target.value }))} /></FormField>
      <FormField label="Alasan"><input value={movement.reason} onChange={e => setMovement(v => ({ ...v, reason: e.target.value }))} /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setMovementOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan gerakan'}</button></div>
    </form></Card>}
    {can("logistics.view") && (<Card><PanelHeading title="Daftar perjalanan" description="Perjalanan yang tercatat pada seluruh proyek." action={<button className="icon-button" onClick={trips.refresh}><RefreshCw size={16} /></button>} />{trips.loading ? <Loading /> : trips.error ? <ErrorState message={trips.error} retry={trips.refresh} /> : <DataTable rows={(trips.data?.truckTrips || []).filter(t => !projectId || t.project_id === projectId)} columns={[
      { key: 'id', label: 'Trip ID', render: r => <div className="primary-cell"><strong>{shortId(r.id)}</strong><small>{r.license_plate || '—'}</small></div> }, { key: 'driver_name', label: 'Sopir' }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> }, { key: 'departure_time', label: 'Berangkat', render: r => dateTime(r.departure_time) },
    ]} />}</Card>)} 
    {can("logistics.view") && (<Card><PanelHeading title="Riwayat checkpoint" description="Lokasi dan event yang dikirim checker." action={<button className="icon-button" onClick={events.refresh}><RefreshCw size={16} /></button>} />{events.loading ? <Loading /> : events.error ? <ErrorState message={events.error} retry={events.refresh} /> : <DataTable rows={(events.data?.trackingEvents || []).filter(e => !projectId || e.project_id === projectId || (trips.data?.truckTrips || []).some(t => t.id === e.truck_trip_id && t.project_id === projectId))} columns={[
      { key: 'event_type', label: 'Event', render: r => <StatusPill value={r.event_type} /> }, { key: 'checker_id', label: 'Checker', render: r => shortId(r.checker_id) }, { key: 'latitude', label: 'Koordinat', render: r => r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : '—' }, { key: 'server_received_timestamp', label: 'Waktu server', render: r => dateTime(r.server_received_timestamp) },
    ]} />}</Card>)} 
    {can("warehouse.view") && (<Card><PanelHeading title="Terima gudang" description="Penerimaan barang dari perjalanan truk." action={<button className="icon-button" onClick={receipts.refresh}><RefreshCw size={16} /></button>} />{receipts.loading ? <Loading /> : receipts.error ? <ErrorState message={receipts.error} retry={receipts.refresh} /> : <DataTable rows={(receipts.data?.warehouseReceipts || []).filter(r => !projectId || r.project_id === projectId)} columns={[
      { key: 'id', label: 'Receipt ID', render: r => shortId(r.id) }, { key: 'received_quantity', label: 'Kuantitas', render: r => `${number(r.received_quantity)} ${r.unit || 'MT'}` }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> }, { key: 'check_timestamp', label: 'Waktu check', render: r => dateTime(r.check_timestamp) },
    ]} />}</Card>)} 
    {can("inventory.view") && (<Card><PanelHeading title="Lot inventori" description="Lot inventori yang tersedia per proyek." action={<button className="icon-button" onClick={lots.refresh}><RefreshCw size={16} /></button>} />{lots.loading ? <Loading /> : lots.error ? <ErrorState message={lots.error} retry={lots.refresh} /> : <DataTable rows={(lots.data?.inventoryLots || []).filter(l => !projectId || l.project_id === projectId)} columns={[
      { key: 'id', label: 'Lot ID', render: r => shortId(r.id) }, { key: 'quantity', label: 'Kuantitas', render: r => `${number(r.quantity)} ${r.unit || 'MT'}` }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> }, { key: 'created_at', label: 'Dibuat', render: r => dateTime(r.created_at) },
    ]} />}</Card>)} 
    {can("inventory.view") && (<Card><PanelHeading title="Gerakan inventori" description="Pencatan pergerakan stok antar lot." action={<button className="icon-button" onClick={movements.refresh}><RefreshCw size={16} /></button>} />{movements.loading ? <Loading /> : movements.error ? <ErrorState message={movements.error} retry={movements.refresh} /> : <DataTable rows={(movements.data?.inventoryMovements || []).filter(m => !projectId || m.project_id === projectId)} columns={[
      { key: 'id', label: 'Movement ID', render: r => shortId(r.id) }, { key: 'movement_type', label: 'Tipe', render: r => r.movement_type }, { key: 'quantity', label: 'Kuantitas', render: r => `${number(r.quantity)} ${r.unit || 'MT'}` }, { key: 'timestamp', label: 'Waktu', render: r => dateTime(r.timestamp) },
    ]} />}</Card>)} 
    {can("inventory.view") && (<Card><PanelHeading title="Reservasi inventori" description="Penguncian stok untuk alokasi pengiriman." action={<button className="icon-button" onClick={reservations.refresh}><RefreshCw size={16} /></button>} />{reservations.loading ? <Loading /> : reservations.error ? <ErrorState message={reservations.error} retry={reservations.refresh} /> : <DataTable rows={(reservations.data?.inventoryReservations || []).filter(r => !projectId || r.project_id === projectId)} columns={[
      { key: 'id', label: 'Reservation ID', render: r => shortId(r.id) }, { key: 'reserved_quantity', label: 'Dipesan', render: r => `${number(r.reserved_quantity)} ${r.unit || 'MT'}` }, { key: 'fulfilled_quantity', label: 'Terpenuhi', render: r => `${number(r.fulfilled_quantity || 0)} ${r.unit || 'MT'}` }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
    ]} />}</Card>)} 
    {can("inventory.view") && (<Card><PanelHeading title="Tahanan inventori (Hold)" description="Stok yang ditahan sementara untuk alasan tertentu." action={<button className="icon-button" onClick={holds.refresh}><RefreshCw size={16} /></button>} />{holds.loading ? <Loading /> : holds.error ? <ErrorState message={holds.error} retry={holds.refresh} /> : <DataTable rows={(holds.data?.inventoryHolds || []).filter(r => !projectId || r.project_id === projectId)} columns={[
      { key: 'id', label: 'Hold ID', render: r => shortId(r.id) }, { key: 'held_quantity', label: 'Ditahan', render: r => `${number(r.held_quantity)} ${r.unit || 'MT'}` }, { key: 'reason', label: 'Alasan' }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
    ]} />}</Card>)} 
    {can("shipping.view") && (<Card><PanelHeading title="Alokasi pengiriman" description="Alokasi stok yang tersedia untuk shipment." action={<button className="icon-button" onClick={allocations.refresh}><RefreshCw size={16} /></button>} />{allocations.loading ? <Loading /> : allocations.error ? <ErrorState message={allocations.error} retry={allocations.refresh} /> : <DataTable rows={(allocations.data?.shipmentAllocations || []).filter(r => !projectId || r.project_id === projectId)} columns={[
      { key: 'id', label: 'Allocation ID', render: r => shortId(r.id) }, { key: 'allocated_quantity', label: 'Dialokasikan', render: r => `${number(r.allocated_quantity)} ${r.unit || 'MT'}` }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> }, { key: 'created_at', label: 'Dibuat', render: r => dateTime(r.created_at) },
    ]} />}</Card>)} 
  </>;
}

function FinancePage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const projectAccess = useLoad<{ permissions?: string[] }>(() => projectId ? get(`/projects/${encodeURIComponent(projectId)}/my-permissions`) : Promise.resolve({ permissions: [] }), [projectId]);
  const projectPermissions = projectAccess.data?.permissions || [];
  const canCreateFinance = activeUser?.platformAdmin === true || projectPermissions.includes('finance.create');
  const canManageGlobalReference = activeUser?.platformAdmin === true;
  const rab = useLoad<{ rab?: AnyRecord[] }>(() => projectId ? get(`/rab?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ rab: [] }), [projectId]);
  const fxRates = useLoad<{ fxRates?: AnyRecord[] }>(() => get('/fx-rates'), []);
  const exposure = useLoad<{ fxExposure?: AnyRecord[] }>(() => projectId ? get(`/fx-exposure?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ fxExposure: [] }), [projectId]);
  const [form, setForm] = useState<'rab' | 'rate' | 'exposure' | null>(null); const [busy, setBusy] = useState(false);
  const [rabForm, setRabForm] = useState({ projectId: projectId || '', description: '', amount: '', category: 'fixed' });
  const [rateForm, setRateForm] = useState({ fromCurrency: 'USD', toCurrency: 'IDR', rate: '', rateType: 'reference', source: '', effectiveDate: new Date().toISOString().slice(0, 10) });
  const [exposureForm, setExposureForm] = useState({ projectId: projectId || '', amountIdr: '', amountFx: '', fxRate: '', exposureType: 'open' });
  useEffect(() => { if (projectId) { setRabForm(v => ({ ...v, projectId })); setExposureForm(v => ({ ...v, projectId })); } }, [projectId]);
  const save = async (e: FormEvent) => { e.preventDefault(); if (!form || (form === 'rate' ? !canManageGlobalReference : !canCreateFinance)) return; setBusy(true); try {
    if (form === 'rab') await post('/rab', { ...rabForm, amount: Number(rabForm.amount) });
    if (form === 'rate') await post('/fx-rates', { ...rateForm, rate: Number(rateForm.rate) });
    if (form === 'exposure') await post('/fx-exposure', { ...exposureForm, amountIdr: Number(exposureForm.amountIdr), amountFx: exposureForm.amountFx ? Number(exposureForm.amountFx) : null, fxRate: exposureForm.fxRate ? Number(exposureForm.fxRate) : null });
    onNotice('success', 'Data keuangan berhasil dicatat.'); setForm(null); rab.refresh(); fxRates.refresh(); exposure.refresh();
  } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Data keuangan tidak dapat disimpan.'); } finally { setBusy(false); } };
  const budget = (rab.data?.rab || []).filter(r => !projectId || r.project_id === projectId).reduce((s, r) => s + Number(r.amount || 0), 0);
  return <>
    <PageTitle eyebrow="FINANCE CONTROL" title="Keuangan & eksposur FX" subtitle="RAB proyek, referensi kurs, dan eksposur mata uang asing." actions={<>{canManageGlobalReference && <ActionButton variant="secondary" onClick={() => setForm('rate')}><Plus size={15} /> Kurs FX</ActionButton>}{canCreateFinance && <><ActionButton onClick={() => setForm('rab')}><Plus size={15} /> Catat RAB</ActionButton><ActionButton variant="secondary" onClick={() => setForm('exposure')}><Plus size={15} /> Eksposur FX</ActionButton></>}</>} />
    <div className="metric-grid three"><Metric label="Total anggaran RAB" value={idr(budget)} foot="Sesuai filter proyek" icon={Wallet} tone="amber" /><Metric label="Data kurs aktif" value={number(fxRates.data?.fxRates?.length || 0, 0)} icon={Globe2} tone="blue" /><Metric label="Eksposur FX" value={number(exposure.data?.fxExposure?.length || 0, 0)} foot="Posisi tercatat" icon={TrendingUp} tone="green" /></div>
    {form && (form === 'rate' ? canManageGlobalReference : canCreateFinance) && <Card className="form-panel"><PanelHeading title={form === 'rab' ? 'Tambah RAB proyek' : form === 'rate' ? 'Catat kurs valuta' : 'Catat eksposur FX'} action={<button className="icon-button" onClick={() => setForm(null)}><X size={18} /></button>} />
      <form className="form-grid" onSubmit={save}>
        {form === 'rab' && <><FormField label="Proyek"><select value={rabForm.projectId} onChange={e => setRabForm(v => ({ ...v, projectId: e.target.value }))} required><ProjectOptions /></select></FormField><FormField label="Deskripsi"><input value={rabForm.description} onChange={e => setRabForm(v => ({ ...v, description: e.target.value }))} required /></FormField><FormField label="Nilai (IDR)"><input type="number" min="1" step="1" value={rabForm.amount} onChange={e => setRabForm(v => ({ ...v, amount: e.target.value }))} required /></FormField><FormField label="Kategori"><select value={rabForm.category} onChange={e => setRabForm(v => ({ ...v, category: e.target.value }))}><option value="fixed">Fixed</option><option value="variable">Variable</option><option value="contingency">Contingency</option><option value="tax">Tax</option><option value="overhead">Overhead</option></select></FormField></>}
        {form === 'rate' && <><FormField label="Dari mata uang"><select value={rateForm.fromCurrency} onChange={e => setRateForm(v => ({ ...v, fromCurrency: e.target.value }))}><option>USD</option><option>CNY</option><option>PKR</option><option>EUR</option><option>IDR</option></select></FormField><FormField label="Ke mata uang"><select value={rateForm.toCurrency} onChange={e => setRateForm(v => ({ ...v, toCurrency: e.target.value }))}><option>IDR</option><option>USD</option><option>CNY</option><option>PKR</option><option>EUR</option></select></FormField><FormField label="Nilai kurs"><input type="number" step="0.000001" value={rateForm.rate} onChange={e => setRateForm(v => ({ ...v, rate: e.target.value }))} required /></FormField><FormField label="Jenis kurs"><select value={rateForm.rateType} onChange={e => setRateForm(v => ({ ...v, rateType: e.target.value }))}><option value="reference">Reference</option><option value="buy">Buy</option><option value="sell">Sell</option><option value="transaction">Transaction</option></select></FormField><FormField label="Sumber"><input value={rateForm.source} onChange={e => setRateForm(v => ({ ...v, source: e.target.value }))} /></FormField><FormField label="Tanggal efektif"><input type="date" value={rateForm.effectiveDate} onChange={e => setRateForm(v => ({ ...v, effectiveDate: e.target.value }))} /></FormField></>}
        {form === 'exposure' && <><FormField label="Proyek"><select value={exposureForm.projectId} onChange={e => setExposureForm(v => ({ ...v, projectId: e.target.value }))} required><ProjectOptions /></select></FormField><FormField label="Nilai ekuivalen IDR"><input type="number" step="0.01" value={exposureForm.amountIdr} onChange={e => setExposureForm(v => ({ ...v, amountIdr: e.target.value }))} required /></FormField><FormField label="Nilai valuta asing"><input type="number" step="0.01" value={exposureForm.amountFx} onChange={e => setExposureForm(v => ({ ...v, amountFx: e.target.value }))} /></FormField><FormField label="Kurs pencatatan"><input type="number" step="0.000001" value={exposureForm.fxRate} onChange={e => setExposureForm(v => ({ ...v, fxRate: e.target.value }))} /></FormField><FormField label="Jenis exposure"><select value={exposureForm.exposureType} onChange={e => setExposureForm(v => ({ ...v, exposureType: e.target.value }))}><option value="open">Open</option><option value="revalued">Revalued</option><option value="realized">Realized</option><option value="unrealized">Unrealized</option></select></FormField></>}
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => setForm(null)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></div>
      </form>
    </Card>}
    <div className="content-two"><Card><PanelHeading title="RAB proyek" description="Anggaran yang telah dicatat." action={<button className="icon-button" onClick={rab.refresh}><RefreshCw size={16} /></button>} />{rab.loading ? <Loading /> : rab.error ? <ErrorState message={rab.error} retry={rab.refresh} /> : <DataTable rows={(rab.data?.rab || []).filter(r => !projectId || r.project_id === projectId)} columns={[{ key: 'description', label: 'Deskripsi' }, { key: 'category', label: 'Kategori' }, { key: 'amount', label: 'Nilai', render: r => idr(r.amount) }, { key: 'created_at', label: 'Tanggal', render: r => dateTime(r.created_at) }]} />}</Card>
      <Card><PanelHeading title="Kurs FX" description="Referensi kurs yang tercatat." action={<button className="icon-button" onClick={fxRates.refresh}><RefreshCw size={16} /></button>} />{fxRates.loading ? <Loading /> : fxRates.error ? <ErrorState message={fxRates.error} retry={fxRates.refresh} /> : <DataTable rows={(fxRates.data?.fxRates || []).slice(0, 12)} columns={[{ key: 'from_currency', label: 'Pasangan', render: r => <strong>{r.from_currency}/{r.to_currency}</strong> }, { key: 'rate', label: 'Kurs', render: r => number(r.rate, 6) }, { key: 'rate_type', label: 'Jenis' }, { key: 'effective_date', label: 'Efektif', render: r => dateTime(r.effective_date || r.rate_date) }]} />}</Card></div>
    <Card><PanelHeading title="Eksposur valuta asing" description="Posisi eksposur yang tercatat untuk tiap proyek." action={canCreateFinance ? <ActionButton variant="secondary" onClick={() => setForm('exposure')}><Plus size={15} /> Catat exposure</ActionButton> : undefined} />{exposure.loading ? <Loading /> : exposure.error ? <ErrorState message={exposure.error} retry={exposure.refresh} /> : <DataTable rows={(exposure.data?.fxExposure || []).filter(r => !projectId || r.project_id === projectId)} columns={[{ key: 'project_id', label: 'Proyek', render: r => shortId(r.project_id) }, { key: 'amount_idr', label: 'Nilai IDR', render: r => idr(r.amount_idr) }, { key: 'amount_fx', label: 'Nilai FX', render: r => number(r.amount_fx) }, { key: 'fx_rate', label: 'Kurs', render: r => number(r.fx_rate, 6) }, { key: 'exposure_type', label: 'Jenis', render: r => <StatusPill value={r.exposure_type} /> }]} />}</Card>
    <FinanceSubledgerPanel projectId={projectId} canCreateFinance={canCreateFinance} onNotice={onNotice} />
  </>;
}

function FinanceSubledgerPanel({ projectId, canCreateFinance, onNotice }: { projectId: string; canCreateFinance: boolean; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const ap = useLoad<{ apInvoices?: AnyRecord[] }>(() => projectId ? get(`/ap-invoices?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ apInvoices: [] }), [projectId]);
  const ar = useLoad<{ arInvoices?: AnyRecord[] }>(() => projectId ? get(`/ar-invoices?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ arInvoices: [] }), [projectId]);
  const vendors = useLoad<{ vendors?: AnyRecord[] }>(() => projectId ? get(`/vendors?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ vendors: [] }), [projectId]);
  const buyers = useLoad<{ buyers?: AnyRecord[] }>(() => projectId ? get(`/buyers?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ buyers: [] }), [projectId]);
  const [mode, setMode] = useState<'ap' | 'ar' | null>(null);
  const [busy, setBusy] = useState(false);
  const [apForm, setApForm] = useState({ supplierId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0,10), dueDate: '', currencyCode: 'USD', invoiceAmount: '', taxAmount: '0' });
  const [arForm, setArForm] = useState({ buyerMasterId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0,10), dueDate: '', currencyCode: 'USD', invoiceAmount: '', acceptedQuantity: '', unit: 'MT', sellingPrice: '', relatedShipmentId: '' });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectId || !mode) return;
    setBusy(true);
    try {
      if (mode === 'ap') await post('/ap-invoices', { ...apForm, projectId, invoiceAmount: Number(apForm.invoiceAmount), taxAmount: Number(apForm.taxAmount) });
      else await post('/ar-invoices', { ...arForm, projectId, invoiceAmount: Number(arForm.invoiceAmount), acceptedQuantity: arForm.acceptedQuantity ? Number(arForm.acceptedQuantity) : undefined, sellingPrice: arForm.sellingPrice ? Number(arForm.sellingPrice) : undefined, relatedShipmentId: arForm.relatedShipmentId || undefined });
      onNotice('success', mode === 'ap' ? 'Tagihan pemasok tersimpan dengan status pending.' : 'Tagihan buyer tersimpan dengan status pending.');
      setMode(null); ap.refresh(); ar.refresh();
    } catch (error) { onNotice('error', error instanceof Error ? error.message : 'Invoice tidak dapat disimpan.'); }
    finally { setBusy(false); }
  };
  return <>
    <div className="content-two">
      <Card><PanelHeading title="Accounts Payable" description="Tagihan pemasok per Project." action={canCreateFinance ? <ActionButton onClick={() => setMode('ap')}><Plus size={15} /> Catat AP</ActionButton> : undefined} />
        {ap.loading ? <Loading /> : ap.error ? <ErrorState message={ap.error} retry={ap.refresh} /> : <DataTable rows={ap.data?.apInvoices || []} columns={[
          { key: 'invoice_number', label: 'Invoice' }, { key: 'supplier_id', label: 'Pemasok', render: r => shortId(r.supplier_id) },
          { key: 'total_amount', label: 'Total', render: r => number(r.total_amount, 2) }, { key: 'outstanding_amount', label: 'Outstanding', render: r => number(r.outstanding_amount, 2) },
          { key: 'verification_status', label: 'Verifikasi', render: r => <StatusPill value={r.verification_status} /> },
        ]} />}
        <div className="inline-warning"><CircleAlert size={16} /> Verifikasi AP tetap dikunci sampai pencocokan Purchase Order, Goods Receipt, dan invoice pemasok dapat dibuktikan oleh sistem. Checkbox atau klaim dari browser tidak dianggap bukti.</div>
      </Card>
      <Card><PanelHeading title="Accounts Receivable" description="Tagihan buyer per Project." action={canCreateFinance ? <ActionButton onClick={() => setMode('ar')}><Plus size={15} /> Catat AR</ActionButton> : undefined} />
        {ar.loading ? <Loading /> : ar.error ? <ErrorState message={ar.error} retry={ar.refresh} /> : <DataTable rows={ar.data?.arInvoices || []} columns={[
          { key: 'invoice_number', label: 'Invoice' }, { key: 'buyer_master_id', label: 'Buyer', render: r => shortId(r.buyer_master_id) },
          { key: 'total_amount', label: 'Total', render: r => number(r.total_amount, 2) }, { key: 'approval_status', label: 'Approval', render: r => <StatusPill value={r.approval_status} /> },
          { key: 'settlement_status', label: 'Settlement', render: r => <StatusPill value={r.settlement_status} /> },
        ]} />}
      </Card>
    </div>
    {mode && <Card className="form-panel"><PanelHeading title={mode === 'ap' ? 'Buat AP Invoice' : 'Buat AR Invoice'} action={<button className="icon-button" onClick={() => setMode(null)}><X size={18} /></button>} />
      <form className="form-grid" onSubmit={save}>
        {mode === 'ap' ? <>
          <FormField label="Pemasok"><select value={apForm.supplierId} onChange={e => setApForm(v => ({ ...v, supplierId: e.target.value }))} required><option value="">Pilih pemasok</option>{(vendors.data?.vendors || []).map(v => <option key={v.id} value={v.id}>{v.name} {v.code ? `· ${v.code}` : ''}</option>)}</select></FormField>
          <FormField label="Nomor invoice"><input value={apForm.invoiceNumber} onChange={e => setApForm(v => ({ ...v, invoiceNumber: e.target.value }))} required /></FormField>
          <FormField label="Tanggal invoice"><input type="date" value={apForm.invoiceDate} onChange={e => setApForm(v => ({ ...v, invoiceDate: e.target.value }))} required /></FormField>
          <FormField label="Jatuh tempo"><input type="date" value={apForm.dueDate} onChange={e => setApForm(v => ({ ...v, dueDate: e.target.value }))} /></FormField>
          <FormField label="Mata uang"><select value={apForm.currencyCode} onChange={e => setApForm(v => ({ ...v, currencyCode: e.target.value }))}><option>USD</option><option>IDR</option><option>EUR</option><option>CNY</option><option>PKR</option></select></FormField>
          <FormField label="Nilai invoice"><input type="number" min="0.01" step="0.01" value={apForm.invoiceAmount} onChange={e => setApForm(v => ({ ...v, invoiceAmount: e.target.value }))} required /></FormField>
          <FormField label="Pajak"><input type="number" min="0" step="0.01" value={apForm.taxAmount} onChange={e => setApForm(v => ({ ...v, taxAmount: e.target.value }))} /></FormField>
        </> : <>
          <FormField label="Buyer"><select value={arForm.buyerMasterId} onChange={e => setArForm(v => ({ ...v, buyerMasterId: e.target.value }))} required><option value="">Pilih buyer</option>{(buyers.data?.buyers || []).map(b => <option key={b.id} value={b.id}>{b.name} {b.code ? `· ${b.code}` : ''}</option>)}</select></FormField>
          <FormField label="Nomor invoice"><input value={arForm.invoiceNumber} onChange={e => setArForm(v => ({ ...v, invoiceNumber: e.target.value }))} required /></FormField>
          <FormField label="Tanggal invoice"><input type="date" value={arForm.invoiceDate} onChange={e => setArForm(v => ({ ...v, invoiceDate: e.target.value }))} required /></FormField>
          <FormField label="Jatuh tempo"><input type="date" value={arForm.dueDate} onChange={e => setArForm(v => ({ ...v, dueDate: e.target.value }))} /></FormField>
          <FormField label="Mata uang"><select value={arForm.currencyCode} onChange={e => setArForm(v => ({ ...v, currencyCode: e.target.value }))}><option>USD</option><option>IDR</option><option>EUR</option><option>CNY</option><option>PKR</option></select></FormField>
          <FormField label="Nilai invoice"><input type="number" min="0.01" step="0.01" value={arForm.invoiceAmount} onChange={e => setArForm(v => ({ ...v, invoiceAmount: e.target.value }))} required /></FormField>
          <FormField label="Kuantitas diterima (MT)"><input type="number" min="0.01" step="0.01" value={arForm.acceptedQuantity} onChange={e => setArForm(v => ({ ...v, acceptedQuantity: e.target.value }))} /></FormField>
          <FormField label="Harga jual per unit"><input type="number" min="0" step="0.01" value={arForm.sellingPrice} onChange={e => setArForm(v => ({ ...v, sellingPrice: e.target.value }))} /></FormField>
          <FormField label="Shipment ID (opsional)"><input value={arForm.relatedShipmentId} onChange={e => setArForm(v => ({ ...v, relatedShipmentId: e.target.value }))} /></FormField>
        </>}
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => setMode(null)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan invoice'}</button></div>
      </form>
    </Card>}
  </>;
}

function JournalEntriesPage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const projectAccess = useLoad<{ permissions?: string[] }>(() => projectId ? get(`/projects/${encodeURIComponent(projectId)}/my-permissions`) : Promise.resolve({ permissions: [] }), [projectId]);
  const projectPermissions = projectAccess.data?.permissions || [];
  const canCreateJournal = activeUser?.platformAdmin === true || projectPermissions.includes('accounting.create');
  const canPostJournal = activeUser?.platformAdmin === true || projectPermissions.includes('accounting.update');
  const entries = useLoad<{ journalEntries?: AnyRecord[] }>(() => projectId ? get(`/journal-entries?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ journalEntries: [] }), [projectId]);
  const accounts = useLoad<{ accounts?: AnyRecord[] }>(() => get('/chart-of-accounts'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState({ projectId: projectId || '', entryType: 'manual', description: '', entryDate: new Date().toISOString().slice(0, 10) });
  const [line, setLine] = useState({ journalEntryId: '', accountId: '', debit: '', credit: '', description: '', lineOrder: '' });
  const [draftLines, setDraftLines] = useState<AnyRecord[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const saveEntry = async (e: FormEvent) => {
    e.preventDefault(); if (!canCreateJournal) return; setBusy(true);
    try {
      const res: any = await post('/journal-entries', { ...entry, entryDate: entry.entryDate || new Date().toISOString() });
      setBusy(false);
      setEditingEntryId(res?.journalEntry?.id || null);
      setDraftLines([]);
      onNotice('success', 'Jurnal draft berhasil dibuat. Tambahkan baris debit/kredit sebelum posting.');
      setFormOpen(false); entries.refresh();
      setEntry({ projectId: projectId || '', entryType: 'manual', description: '', entryDate: new Date().toISOString().slice(0, 10) });
    } catch (e) { setBusy(false); onNotice('error', e instanceof Error ? e.message : 'Jurnal gagal dibuat.'); }
  };

  const addLine = (e: FormEvent) => {
    e.preventDefault(); if (!canCreateJournal) return;
    if (!line.accountId || line.debit === undefined || line.credit === undefined) {
      onNotice('error', 'Account, debit, dan credit wajib diisi.');
      return;
    }
    const d = Number(line.debit || 0);
    const c = Number(line.credit || 0);
    if (d > 0 && c > 0) { onNotice('error', 'Baris tidak boleh memiliki debit dan kredit sekaligus.'); return; }
    const newLine = { ...line, debit: d, credit: c, lineOrder: draftLines.length + 1 };
    setDraftLines([...draftLines, newLine]);
    setLine({ journalEntryId: '', accountId: '', debit: '', credit: '', description: '', lineOrder: '' });
  };

  const removeLine = (index: number) => {
    setDraftLines(draftLines.filter((_, i) => i !== index));
  };

  const saveLines = async () => {
    if (!canCreateJournal) return;
    if (!editingEntryId || draftLines.length < 2) { onNotice('error', 'Minimal dua baris jurnal diperlukan.'); return; }
    if (Math.abs(totalDebit - totalCredit) > 0.005) { onNotice('error', 'Total debit dan kredit harus seimbang.'); return; }
    setBusy(true);
    try {
      await post(`/journal-entries/${encodeURIComponent(editingEntryId)}/lines`, {
        lines: draftLines.map((line, index) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit, description: line.description, lineOrder: index + 1 })),
      });
      onNotice('success', 'Baris jurnal tersimpan. Jurnal tetap berstatus draft sampai diposting oleh petugas berwenang.');
      setDraftLines([]); setEditingEntryId(null); entries.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Baris jurnal gagal disimpan.'); }
    finally { setBusy(false); }
  };

  const postEntry = async (entryId: string) => {
    if (!canPostJournal) return;
    setBusy(true);
    try {
      await post(`/journal-entries/${encodeURIComponent(entryId)}/post`, {});
      onNotice('success', 'Jurnal berhasil diposting.');
      entries.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal memposting jurnal.'); }
    finally { setBusy(false); }
  };

  const totalDebit = draftLines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = draftLines.reduce((s, l) => s + Number(l.credit || 0), 0);

  return <>
    <PageTitle eyebrow="AKUNTANSI" title="Jurnal Umum" subtitle="Buat dan posting jurnal double-entry per proyek." actions={canCreateJournal ? <ActionButton variant="secondary" onClick={() => setFormOpen(true)}><Plus size={15} /> Buat Jurnal Draft</ActionButton> : undefined} />
    <div className="metric-grid three"><Metric label="Jurnal" value={number(entries.data?.journalEntries?.length || 0, 0)} icon={FileText} tone="navy" /><Metric label="Total Debit Draft" value={idr(totalDebit)} foot="Belum diposting" icon={CircleDollarSign} tone="amber" /><Metric label="Total Kredit Draft" value={idr(totalCredit)} foot="Belum diposting" icon={CircleDollarSign} tone="amber" /></div>
    {formOpen && canCreateJournal && <Card className="form-panel"><PanelHeading title="Jurnal Draft Baru" action={<button className="icon-button" onClick={() => setFormOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveEntry}>
      <FormField label="Proyek"><select value={entry.projectId} onChange={e => setEntry(v => ({ ...v, projectId: e.target.value }))} required><ProjectOptions /></select></FormField>
      <FormField label="Tipe Jurnal"><select value={entry.entryType} onChange={e => setEntry(v => ({ ...v, entryType: e.target.value }))}><option value="manual">Manual</option><option value="adjustment">Adjustment</option><option value="closing">Closing</option></select></FormField>
      <FormField label="Deskripsi"><input value={entry.description} onChange={e => setEntry(v => ({ ...v, description: e.target.value }))} required placeholder="Contoh: Pembelian bahan baku" /></FormField>
      <FormField label="Tanggal Jurnal"><input type="date" value={entry.entryDate} onChange={e => setEntry(v => ({ ...v, entryDate: e.target.value }))} required /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setFormOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Draft'}</button></div>
    </form></Card>}
    {editingEntryId && canCreateJournal && <Card className="form-panel"><PanelHeading title="Tambah Baris Jurnal" action={<button className="icon-button" onClick={() => setEditingEntryId(null)}><X size={18} /></button>} /><form className="form-grid" onSubmit={addLine}>
      <FormField label="Akun"><select value={line.accountId} onChange={e => setLine(v => ({ ...v, accountId: e.target.value }))} required>{(accounts.data?.accounts || []).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></FormField>
      <FormField label="Debit"><input type="number" step="0.01" min="0" value={line.debit} onChange={e => setLine(v => ({ ...v, debit: e.target.value }))} /></FormField>
      <FormField label="Kredit"><input type="number" step="0.01" min="0" value={line.credit} onChange={e => setLine(v => ({ ...v, credit: e.target.value }))} /></FormField>
      <FormField label="Deskripsi Baris"><input value={line.description} onChange={e => setLine(v => ({ ...v, description: e.target.value }))} /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setEditingEntryId(null)}>Batal</ActionButton><button className="primary-button" disabled={!line.accountId || (line.debit === undefined && line.credit === undefined)}>Tambah Baris</button></div>
    </form>
    <div className="inline-info"><strong>Baris draft:</strong> {draftLines.length} baris · Total Debit: {idr(totalDebit)} · Total Kredit: {idr(totalCredit)} · <span style={{ color: Math.abs(totalDebit - totalCredit) <= 0.005 ? '#16a34a' : '#dc2626' }}>{Math.abs(totalDebit - totalCredit) <= 0.005 ? 'Seimbang' : 'Tidak seimbang'}</span></div>
    <div className="table-wrap"><table><thead><tr><th>Akun</th><th>Debit</th><th>Kredit</th><th>Deskripsi</th><th>Aksi</th></tr></thead><tbody>{draftLines.map((l, i) => <tr key={i}><td>{l.accountId}</td><td>{number(l.debit)}</td><td>{number(l.credit)}</td><td>{l.description || '—'}</td><td><button className="text-button" onClick={() => removeLine(i)}>Hapus</button></td></tr>)}</tbody></table></div>
    <div className="form-actions"><ActionButton variant="secondary" onClick={() => setEditingEntryId(null)}>Batal</ActionButton><button className="primary-button" disabled={busy || Math.abs(totalDebit - totalCredit) > 0.005 || draftLines.length < 2} onClick={saveLines}>Simpan Baris Jurnal</button></div></Card>}
    <Card><PanelHeading title="Daftar Jurnal" description="Semua jurnal draft dan yang sudah diposting." action={<button className="icon-button" onClick={entries.refresh}><RefreshCw size={16} /></button>} />{entries.loading ? <Loading /> : entries.error ? <ErrorState message={entries.error} retry={entries.refresh} /> : <DataTable rows={(entries.data?.journalEntries || []).filter(r => !projectId || r.project_id === projectId)} columns={[{ key: 'id', label: 'ID', render: r => shortId(r.id) }, { key: 'entry_type', label: 'Tipe' }, { key: 'description', label: 'Deskripsi' }, { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> }, { key: 'created_at', label: 'Dibuat', render: r => dateTime(r.created_at) }, { key: 'actions', label: 'Aksi', render: r => <>{r.status === 'draft' && canCreateJournal && <button className="text-button" onClick={() => { setEditingEntryId(r.id); setDraftLines([]); }}>Tambah baris</button>}{r.status === 'draft' && canPostJournal && <button className="text-button" disabled={busy} onClick={() => postEntry(r.id)}>Posting</button>}</> }]} />}</Card>
    <div className="inline-warning"><CircleAlert size={17} /> Jurnal hanya dapat diposting setelah debit dan kredit seimbang. Hak posting memerlukan permission `accounting.update` yang diberikan secara terpisah; Finance dan Project Admin tidak otomatis memperoleh hak ini.</div>
  </>;
}

function ShipmentAllocationPage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const canUpdateShipping = hasProjectPermission('shipping.update', activeUser);
  const canReadInventory = hasProjectPermission('inventory.view', activeUser);
  const allocations = useLoad<{ shipmentAllocations?: AnyRecord[] }>(() => projectId ? get(`/shipment-allocations?projectId=${encodeURIComponent(projectId)}`) : get('/shipment-allocations'), [projectId]);
  const lots = useLoad<{ inventoryLots?: AnyRecord[] }>(() => projectId && canReadInventory ? get(`/inventory-lots?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryLots: [] }), [projectId, canReadInventory]);
  const reservations = useLoad<{ inventoryReservations?: AnyRecord[] }>(() => projectId && canReadInventory ? get(`/inventory-reservations?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ inventoryReservations: [] }), [projectId, canReadInventory]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ projectId: projectId || '', lotId: '', allocatedQuantity: '', unit: 'MT', idempotencyKey: '' });

  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!canUpdateShipping || !canReadInventory) return; setBusy(true);
    try {
      await post('/shipment-allocations', { ...form, allocatedQuantity: Number(form.allocatedQuantity) });
      onNotice('success', 'Alokasi pengiriman berhasil dibuat.'); setOpen(false); allocations.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Alokasi gagal dibuat.'); }
    finally { setBusy(false); }
  };

  const reverse = async (id: string) => {
    if (!canUpdateShipping) return;
    if (!window.confirm('Batalkan alokasi ini?')) return;
    setBusy(true);
    try {
      await patch(`/shipment-allocations/${encodeURIComponent(id)}`, { status: 'reversed', reversalReason: 'Dibatalkan oleh pengguna' });
      onNotice('success', 'Alokasi dibatalkan.'); allocations.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal membatalkan alokasi.'); }
    finally { setBusy(false); }
  };

  return <>
    <PageTitle eyebrow="P06 OPERASI" title="Alokasi Pengiriman" subtitle="Alokasi stok dari reservasi ke shipment dengan pelacakan kuantitas dan idempotensi." actions={canUpdateShipping && canReadInventory ? <ActionButton onClick={() => setOpen(true)}><Plus size={15} /> Alokasi Baru</ActionButton> : undefined} />
    <div className="metric-grid three"><Metric label="Total alokasi" value={number(allocations.data?.shipmentAllocations?.length || 0, 0)} icon={Ship} tone="navy" /><Metric label="Kuantitas dialokasi" value={number((allocations.data?.shipmentAllocations || []).reduce((s, a) => s + Number(a.allocated_quantity || 0), 0), 2)} foot="MT" icon={Boxes} tone="blue" /><Metric label="Status aktif" value={number((allocations.data?.shipmentAllocations || []).filter(a => a.status === 'active').length, 0)} icon={CheckCircle2} tone="green" /></div>
    {open && canUpdateShipping && canReadInventory && <Card className="form-panel"><PanelHeading title="Alokasi Pengiriman Baru" action={<button className="icon-button" onClick={() => setOpen(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={save}>
      <FormField label="Proyek"><select value={form.projectId} onChange={e => setForm(v => ({ ...v, projectId: e.target.value }))} required><ProjectOptions /></select></FormField>
      <FormField label="Lot ID"><select value={form.lotId} onChange={e => setForm(v => ({ ...v, lotId: e.target.value }))} required>{(lots.data?.inventoryLots || []).map(l => <option key={l.id} value={l.id}>{shortId(l.id)} ({l.quantity} {l.unit})</option>)}</select></FormField>
      <FormField label="Kuantitas dialokasikan"><input type="number" step="0.01" min="0.01" value={form.allocatedQuantity} onChange={e => setForm(v => ({ ...v, allocatedQuantity: e.target.value }))} required /></FormField>
      <FormField label="Satuan"><input value={form.unit} onChange={e => setForm(v => ({ ...v, unit: e.target.value }))} required /></FormField>
      <FormField label="Idempotency key"><input value={form.idempotencyKey} onChange={e => setForm(v => ({ ...v, idempotencyKey: e.target.value }))} required placeholder="Kunci unik untuk idempotensi" /></FormField>
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setOpen(false)}>Batal</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Alokasi'}</button></div>
    </form></Card>}
    <Card><PanelHeading title="Daftar Alokasi" description="Setiap alokasi terikat ke lot dan reservasi inventori." action={<button className="icon-button" onClick={allocations.refresh}><RefreshCw size={16} /></button>} />{allocations.loading ? <Loading /> : allocations.error ? <ErrorState message={allocations.error} retry={allocations.refresh} /> : <DataTable rows={(allocations.data?.shipmentAllocations || []).filter(r => !projectId || r.project_id === projectId)} columns={[
      { key: 'id', label: 'ID', render: r => shortId(r.id) },
      { key: 'lot_id', label: 'Lot', render: r => shortId(r.lot_id) },
      { key: 'allocated_quantity', label: 'Kuantitas', render: r => `${number(r.allocated_quantity)} ${r.unit || 'MT'}` },
      { key: 'status', label: 'Status', render: r => <StatusPill value={r.status} /> },
      { key: 'idempotency_key', label: 'Idempotency', render: r => r.idempotency_key ? shortId(r.idempotency_key) : '—' },
      { key: 'created_at', label: 'Dibuat', render: r => dateTime(r.created_at) },
      { key: 'actions', label: 'Aksi', render: r => canUpdateShipping && r.status === 'active' ? <button className="text-button" onClick={() => reverse(r.id)}>Batalkan</button> : <span className="muted">—</span> },
    ]} />}</Card>
  </>;
}

function CashAdvancesPage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const advances = useLoad<{ cashAdvances?: AnyRecord[]; canRequest?: boolean; canApprove?: boolean; canViewAll?: boolean }>(
    () => projectId ? get(`/cash-advances?projectId=${encodeURIComponent(projectId)}`) : Promise.resolve({ cashAdvances: [], canRequest: false, canApprove: false, canViewAll: false }),
    [projectId],
  );
  const currencies = useLoad<{ currencies?: AnyRecord[] }>(() => get('/currencies'), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ amount: '', currencyId: '', purpose: '', advanceDate: new Date().toISOString().slice(0, 10) });
  useEffect(() => {
    const functional = currencies.data?.currencies?.find(c => c.is_functional);
    if (functional && !form.currencyId) setForm(v => ({ ...v, currencyId: functional.id }));
  }, [currencies.data, form.currencyId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!advances.data?.canRequest) return;
    if (!projectId) return onNotice('error', 'Pilih Project terlebih dahulu.');
    setBusy(true);
    try {
      await post('/cash-advances', { projectId, amount: Number(form.amount), currencyId: form.currencyId, purpose: form.purpose, advanceDate: form.advanceDate });
      onNotice('success', 'Cash Advance berhasil diajukan sebagai draft.');
      setOpen(false);
      setForm(v => ({ ...v, amount: '', purpose: '' }));
      advances.refresh();
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'Cash Advance tidak dapat diajukan.');
    } finally { setBusy(false); }
  };

  const decide = async (row: AnyRecord, decision: 'approved' | 'rejected') => {
    if (!advances.data?.canApprove) return;
    setBusy(true);
    try {
      await patch(`/cash-advances/${row.id}/decision`, { decision });
      onNotice('success', decision === 'approved' ? 'Cash Advance disetujui.' : 'Cash Advance ditolak.');
      advances.refresh();
    } catch (error) {
      onNotice('error', error instanceof Error ? error.message : 'Keputusan Finance gagal disimpan.');
    } finally { setBusy(false); }
  };

  return <>
    <PageTitle eyebrow="P07 FINANCE · CASH ADVANCE" title="Uang Muka Operasional"
      subtitle="Pengajuan dibuat oleh pemohon; keputusan hanya oleh Finance Project yang berbeda dari pemohon."
      actions={advances.data?.canRequest ? <ActionButton onClick={() => setOpen(v => !v)}><Plus size={15} /> Ajukan Cash Advance</ActionButton> : undefined} />
    {!projectId && <div className="inline-warning"><CircleAlert size={17} /> Pilih Project pada bagian atas untuk melihat atau mengajukan Cash Advance.</div>}
    {projectId && advances.error && <ErrorState message={advances.error} retry={advances.refresh} />}
    {projectId && advances.data && <div className="metric-grid three">
      <Metric label="Permohonan terlihat" value={number(advances.data.cashAdvances?.length || 0, 0)} icon={FileText} tone="blue" />
      <Metric label="Menunggu keputusan" value={number((advances.data.cashAdvances || []).filter(row => ['draft', 'pending'].includes(row.approval_status)).length, 0)} icon={Clock3} tone="amber" />
      <Metric label="Akses" value={advances.data.canViewAll ? 'Finance' : 'Pemohon'} foot={advances.data.canViewAll ? 'Daftar Project' : 'Permohonan sendiri'} icon={ShieldCheck} tone="slate" />
    </div>}
    {open && advances.data?.canRequest && <Card className="form-panel">
      <PanelHeading title="Ajukan uang muka" description="Identitas pemohon berasal dari akun aktif. Status pencairan dan saldo tidak dapat diubah dari formulir ini."
        action={<button className="icon-button" onClick={() => setOpen(false)}><X size={18} /></button>} />
      <form className="form-grid" onSubmit={submit}>
        <FormField label="Jumlah"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} /></FormField>
        <FormField label="Mata uang"><select required value={form.currencyId} onChange={e => setForm(v => ({ ...v, currencyId: e.target.value }))}>
          <option value="">Pilih mata uang</option>
          {(currencies.data?.currencies || []).map(currency => <option key={currency.id} value={currency.id}>{currency.code} — {currency.name}</option>)}
        </select></FormField>
        <FormField label="Tanggal pengajuan"><input type="date" required value={form.advanceDate} onChange={e => setForm(v => ({ ...v, advanceDate: e.target.value }))} /></FormField>
        <FormField label="Tujuan penggunaan"><textarea required minLength={3} maxLength={4000} value={form.purpose} onChange={e => setForm(v => ({ ...v, purpose: e.target.value }))} /></FormField>
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => setOpen(false)}>Batal</ActionButton>
          <button className="primary-button" disabled={busy || !form.currencyId}>{busy ? 'Mengirim…' : 'Kirim Permohonan'}</button></div>
      </form>
    </Card>}
    <Card>
      <PanelHeading title="Permohonan Cash Advance"
        description={advances.data?.canViewAll ? "Daftar permohonan Project; Finance dapat memberi keputusan independen." : "Hanya permohonan yang dibuat oleh akun ini yang ditampilkan."}
        action={<button className="icon-button" onClick={advances.refresh}><RefreshCw size={16} /></button>} />
      {advances.loading ? <Loading /> : advances.error ? <ErrorState message={advances.error} retry={advances.refresh} /> :
        !projectId ? <div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Project belum dipilih</div></div> :
        <DataTable rows={advances.data?.cashAdvances || []} columns={[
          { key: 'created_at', label: 'Diajukan', render: row => dateTime(row.created_at) },
          { key: 'requestor_email', label: 'Pemohon', render: row => row.requestor_email || shortId(row.requestor_id) },
          { key: 'amount', label: 'Jumlah', render: row => `${row.currency_code || '—'} ${number(row.amount)}` },
          { key: 'purpose', label: 'Tujuan', render: row => row.purpose },
          { key: 'approval_status', label: 'Persetujuan', render: row => <StatusPill value={row.approval_status} /> },
          { key: 'disbursement_status', label: 'Pencairan', render: row => <StatusPill value={row.disbursement_status} /> },
          { key: 'actions', label: 'Aksi', render: row => advances.data?.canApprove && ['draft', 'pending'].includes(row.approval_status)
            ? <div className="table-actions"><button className="text-button" disabled={busy || row.requestor_id === undefined} onClick={() => decide(row, 'approved')}>Setujui</button>
              <button className="text-button danger" disabled={busy} onClick={() => decide(row, 'rejected')}>Tolak</button></div>
            : <span className="muted">—</span> },
        ]} />}
    </Card>
    <div className="inline-warning"><ShieldCheck size={16} /> Persetujuan bukan pencairan. Pencairan, saldo, refund, dan settlement hanya berubah melalui workflow rekonsiliasi terkontrol.</div>
  </>;
}

function PaymentInstructionsPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const instructions = useLoad<{ paymentInstructions?: AnyRecord[] }>(() => get('/payment-instructions'), []);
  const concepts = [
    { name: 'RAB (anggaran)', table: 'rab', status: 'tersedia' },
    { name: 'Cost Obligation (komitmen)', table: 'cost_obligations', status: 'tersedia' },
    { name: 'Payment Obligation (kewajiban)', table: 'payment_obligations', status: 'tersedia' },
    { name: 'AP/AR Invoice', table: 'ap_invoices, ar_invoices', status: 'tersedia' },
    { name: 'Cash Advance / Schedule', table: 'cash_advances, cash_schedules', status: 'tersedia' },
    { name: 'Payment Instruction', table: 'payment_instructions', status: 'belum tersedia' },
    { name: 'Payment Execution', table: 'payments (belum ada)', status: 'disabled' },
  ];
  return <>
    <PageTitle eyebrow="P07 FINANCE" title="Instruksi Pembayaran" subtitle="Pengajuan instruksi pembayaran. Eksekusi pembayaran tetap tersedia setelah owner menyetujui data model pembayaran." actions={<ActionButton variant="secondary" disabled><Plus size={15} /> Instruksi Baru</ActionButton>} />
    <div className="inline-warning"><CircleAlert size={17} /> Eksekusi pembayaran tidak tersedia. Data model pembayaran membutuhkan persetujuan dan desain skema dari owner. Tidak ada tabel payments di Production. Instruksi pembayaran tidak dapat dibuat, diedit, atau dieksekusi sampai skema disetujui.</div>
    <div className="metric-grid three"><Metric label="Instruksi tercatat" value={number((instructions.data?.paymentInstructions || []).length, 0)} icon={FileText} tone="slate" /><Metric label="Eksekusi tersedia" value="Tidak" foot="Fail-closed" icon={CircleAlert} tone="red" /><Metric label="Skema pembayaran" value="Belum disetujui" foot="Owner approval diperlukan" icon={ShieldCheck} tone="amber" /></div>
    <Card><PanelHeading title="Status Eksekusi Pembayaran" description="Tabel payment_instructions akan tersedia setelah skema pembayaran disetujui owner." />{instructions.loading ? <Loading /> : instructions.error ? <ErrorState message={instructions.error} retry={instructions.refresh} /> : <div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Belum ada instruksi pembayaran</div><div className="empty-desc">Jika skema pembayaran sudah disetujui owner, instruksi dapat diajukan melalui halaman ini.</div></div>}</Card>
    <Card><PanelHeading title="Perbedaan Konsep" description="PKE mempertahankan pemisahan antara anggaran, komitmen, kewajiban, dan pembayaran aktual." /><div className="concept-list">{concepts.map(c => <div key={c.name} className="concept-row"><div className="concept-name">{c.name}</div><div className="concept-table">{c.table}</div><div className="concept-status"><StatusPill value={c.status} /></div></div>)}</div></Card>
    <Card><PanelHeading title="Alur yang Telah Disetujui" description="Eksekusi pembayaran akan tersedia setelah skema dan owner approval selesai." /><ol className="workflow-list"><li>Request instruksi pembayaran → validasi → approval → Payment Instruction</li><li>Executor Acknowledgement → External Manual Execution → Evidence Upload</li><li>Finance Verification → Reconciliation → Accounting Journal</li><li>Setiap tahapan tercatat pada tabel Production yang sah</li></ol><div className="inline-warning"><CircleAlert size={16} /> Jangan membuat tabel payments secara sepihak, jangan menandai kewajiban sebagai paid tanpa bukti settlement, dan jangan mengeksekusi transfer bank dari sistem ini.</div></Card>
  </>;
}

function BuyerWorkspacePage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  return <>
    <PageTitle eyebrow="BUYER PORTAL" title="Workspace Buyer" subtitle="Lihat kontrak, pengiriman, dan dokumen yang dibagikan untuk buyer." />
    <div className="metric-grid three"><Metric label="Kontrak aktif" value="—" foot="Tidak ada data dummy" icon={BriefcaseBusiness} tone="navy" /><Metric label="Pengiriman" value="—" foot="Menunggu data nyata" icon={Truck} tone="blue" /><Metric label="Dokumen dibagikan" value="—" foot="Tidak ada dummy" icon={FileCheck2} tone="green" /></div>
    <Card><PanelHeading title="Kontrak Saya" description="Kontrak yang terikat pada buyer ini." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada data kontrak</div><div className="empty-desc">Data kontrak hanya ditampilkan setelah buyer ditetapkan pada project dan memiliki sharing grant yang sah.</div></div></Card>
    <Card><PanelHeading title="Pengiriman Saya" description="Status pengiriman yang terkait pada buyer." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada data pengiriman</div><div className="empty-desc">Pengiriman hanya ditampilkan setelah allocation dan shipment dibuat dengan sharing grant.</div></div></Card>
    <Card><PanelHeading title="Dokumen yang Dibagikan" description="Dokumen kompatibilitas dan persetujuan buyer." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada dokumen</div><div className="empty-desc">Dokumen hanya ditampilkan setelah diunggah dan dibagikan dengan buyer.</div></div></Card>
  </>;
}

function SupplierWorkspacePage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  return <>
    <PageTitle eyebrow="SUPPLIER PORTAL" title="Workspace Supplier / PKS" subtitle="Lihat fasilitas, produk, kapasitas, dan alokasi pengiriman untuk supplier." />
    <div className="metric-grid three"><Metric label="Fasilitas" value="—" foot="Tidak ada data dummy" icon={Building2} tone="navy" /><Metric label="Produk" value="—" foot="Menunggu data nyata" icon={Boxes} tone="blue" /><Metric label="Alokasi" value="—" foot="Tidak ada dummy" icon={PackageCheck} tone="green" /></div>
    <Card><PanelHeading title="Profil Supplier" description="Informasi profil dan fasilitas supplier." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada data supplier</div><div className="empty-desc">Data supplier hanya ditampilkan setelah profile ditetapkan pada project.</div></div></Card>
    <Card><PanelHeading title="Kapasitas & Produk" description="Kapasitas produksi dan produk yang tersedia." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada data produk</div><div className="empty-desc">Produk dan kapasitas hanya ditampilkan setelah ditetapkan pada project supplier.</div></div></Card>
    <Card><PanelHeading title="Alokasi Pengiriman" description="Alokasi stok yang terkait pada supplier ini." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada alokasi</div><div className="empty-desc">Alokasi hanya ditampilkan setelah dibuat dengan supplier scope yang sah.</div></div></Card>
  </>;
}

function TransporterWorkspacePage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  return <>
    <PageTitle eyebrow="TRANSPORTER PORTAL" title="Workspace Transporter" subtitle="Lihat tugas angkutan, trip, checkpoint, dan status pengiriman." />
    <div className="metric-grid three"><Metric label="Trip ditugaskan" value="—" foot="Tidak ada data dummy" icon={Truck} tone="navy" /><Metric label="Checkpoint" value="—" foot="Menunggu data nyata" icon={MapPin} tone="blue" /><Metric label="Pengiriman" value="—" foot="Tidak ada dummy" icon={Ship} tone="green" /></div>
    <Card><PanelHeading title="Tugas Angkutan" description="Trip yang ditugaskan pada transporter ini." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada tugas</div><div className="empty-desc">Trip hanya ditampilkan setelah ditugaskan pada transporter yang sah.</div></div></Card>
    <Card><PanelHeading title="Checkpoint" description="Catatan checkpoint dan evidence GPS." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada checkpoint</div><div className="empty-desc">Checkpoint hanya ditampilkan setelah dicatat oleh checker yang berwenang.</div></div></Card>
    <Card><PanelHeading title="Status Pengiriman" description="Status terkini pengiriman yang ditangani." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada pengiriman</div><div className="empty-desc">Pengiriman hanya ditampilkan setelah terkait pada tugas angkutan.</div></div></Card>
  </>;
}

function WarehouseWorkspacePage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  return <>
    <PageTitle eyebrow="WAREHOUSE PORTAL" title="Workspace Gudang" subtitle="Lihat penerimaan, inspeksi, lot inventori, dan gerakan stok." />
    <div className="metric-grid three"><Metric label="Penerimaan" value="—" foot="Tidak ada data dummy" icon={PackageCheck} tone="navy" /><Metric label="Lot inventori" value="—" foot="Menunggu data nyata" icon={Boxes} tone="blue" /><Metric label="Gerakan stok" value="—" foot="Tidak ada dummy" icon={Activity} tone="green" /></div>
    <Card><PanelHeading title="Penerimaan Gudang" description="Barang yang diterima dari perjalanan truk." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada penerimaan</div><div className="empty-desc">Penerimaan hanya ditampilkan setelah warehouse receipt dibuat dan diverifikasi.</div></div></Card>
    <Card><PanelHeading title="Lot Inventori" description="Lot stok yang tersedia di gudang." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada lot</div><div className="empty-desc">Lot inventori hanya ditampilkan setelah dibuat dari penerimaan yang sah.</div></div></Card>
    <Card><PanelHeading title="Gerakan Stok" description="Pencatan pergerakan stok antar lot." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada gerakan</div><div className="empty-desc">Gerakan stok hanya ditampilkan setelah dicatat dengan validasi yang sah.</div></div></Card>
  </>;
}

function FunderWorkspacePage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  return <>
    <PageTitle eyebrow="FUNDER PORTAL" title="Workspace Funder" subtitle="Lihat informasi keuangan proyek yang diizinkan oleh funding agreement." />
    <div className="metric-grid three"><Metric label="Dana dialokasikan" value="—" foot="Tidak ada data dummy" icon={Wallet} tone="navy" /><Metric label="Drawdown" value="—" foot="Menunggu data nyata" icon={ArrowDownRight} tone="blue" /><Metric label="Milestone" value="—" foot="Tidak ada dummy" icon={Flag} tone="green" /></div>
    <Card><PanelHeading title="Dana yang Diizinkan" description="Informasi keuangan proyek yang diizinkan oleh funding agreement." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada data dana</div><div className="empty-desc">Informasi dana hanya ditampilkan setelah funding agreement ditetapkan dan sharing grant diberikan.</div></div></Card>
    <Card><PanelHeading title="Milestone & Utilisasi" description="Progres milestone dan utilizasi dana." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada milestone</div><div className="empty-desc">Milestone hanya ditampilkan setelah disetujui pada funding agreement.</div></div></Card>
    <Card><PanelHeading title="Laporan yang Disetujui" description="Laporan keuangan yang diizinkan untuk dilihat funder." /><div className="empty-state"><CircleAlert size={24} /><div className="empty-title">Tidak ada laporan</div><div className="empty-desc">Laporan hanya ditampilkan setelah dihasilkan dan sharing grant diberikan.</div></div></Card>
  </>;
}

function ProjectOptions() {
  const { data } = useLoad<{ projects?: AnyRecord[] }>(() => get('/projects'), []);
  return <>{(data?.projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</>;
}

function CompliancePage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const can = (permission: string) => hasProjectPermission(permission, activeUser);
  const canViewDocuments = can('documents.view');
  const canCreateDocuments = can('documents.create');
  const canUpdateDocuments = can('documents.update');
  const canAdminRegulatory = activeUser?.platformAdmin === true;
  const knowledge = useLoad<{ regulatoryKnowledge?: AnyRecord[] }>(() => canAdminRegulatory ? get('/regulatory-knowledge') : Promise.resolve({ regulatoryKnowledge: [] }), [canAdminRegulatory]);
  const packs = useLoad<{ countryPacks?: AnyRecord[] }>(() => canAdminRegulatory ? get('/country-packs') : Promise.resolve({ countryPacks: [] }), [canAdminRegulatory]);
  const requirements = useLoad<{ documentRequirements?: AnyRecord[] }>(() => projectId && canViewDocuments ? get(`/projects/${encodeURIComponent(projectId)}/document-requirements`) : Promise.resolve({ documentRequirements: [] }), [projectId, canViewDocuments]);
  const docs = useLoad<{ documents?: AnyRecord[] }>(() => projectId && canViewDocuments ? get(`/projects/${encodeURIComponent(projectId)}/documents`) : Promise.resolve({ documents: [] }), [projectId, canViewDocuments]);
  const storage = useLoad<{ available: boolean; bucket: string; reason?: string }>(() => canCreateDocuments ? get('/storage/status') : Promise.resolve({ available: false, bucket: 'pke-private-documents', reason: 'Permission documents.create tidak tersedia.' }), [canCreateDocuments]);
  const [showForm, setShowForm] = useState(false); const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState({ projectRequirementId: '', originalFilename: '', mimeType: '', sha256Checksum: '', expiryDate: '', notes: '', objectKey: '', contentLength: 0 });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [check, setCheck] = useState({ entityType: 'project', entityId: '', targetCountry: 'CN', checkType: 'document_readiness' });
  const [checkResult, setCheckResult] = useState<AnyRecord | null>(null);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');

  const saveDoc = async (e: FormEvent) => {
    e.preventDefault(); if (!canCreateDocuments) return onNotice('error', 'Permission documents.create diperlukan.'); setBusy(true);
    try {
      if (!doc.objectKey || !doc.contentLength || !doc.sha256Checksum) throw new Error('Unggah file terlebih dahulu.');
      await post(`/projects/${encodeURIComponent(projectId)}/documents`, {
        projectRequirementId: doc.projectRequirementId, fileReference: doc.objectKey, objectKey: doc.objectKey,
        originalFilename: doc.originalFilename, mimeType: doc.mimeType, contentLength: doc.contentLength,
        sha256Checksum: doc.sha256Checksum, expiryDate: doc.expiryDate || undefined, notes: doc.notes || undefined,
      });
      onNotice('success', 'Referensi dokumen berhasil tercatat.'); setShowForm(false); docs.refresh(); requirements.refresh();
      setDoc({ projectRequirementId: '', originalFilename: '', mimeType: '', sha256Checksum: '', expiryDate: '', notes: '', objectKey: '', contentLength: 0 });
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Dokumen gagal dicatat.'); }
    finally { setBusy(false); }
  };
  const requestUpload = async () => {
    if (!canCreateDocuments || !uploadFile || !projectId) return;
    setUploadBusy(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await uploadFile.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      const safeName = uploadFile.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'document';
      const objectKey = `projects/${projectId}/documents/${crypto.randomUUID()}-${safeName}`;
      const { upload } = await post<{ upload: { uploadUrl: string } }>('/storage/presigned-upload', {
        objectKey, mimeType: uploadFile.type || 'application/octet-stream', contentLength: uploadFile.size, filename: uploadFile.name,
      });
      const response = await fetch(upload.uploadUrl, { method: 'PUT', body: uploadFile, headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' } });
      if (!response.ok) throw new Error(`Penyimpanan menolak unggahan (HTTP ${response.status}).`);
      setDoc(v => ({ ...v, objectKey, contentLength: uploadFile.size, sha256Checksum: checksum, originalFilename: uploadFile.name, mimeType: uploadFile.type || 'application/octet-stream' }));
      onNotice('success', 'File berhasil diunggah. Server akan memverifikasi ulang SHA-256 sebelum registrasi.');
      setUploadFile(null);
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Unggah file gagal.'); }
    finally { setUploadBusy(false); }
  };

  const updateDocStatus = async (id: string) => {
    if (!canUpdateDocuments || !editStatus) return;
    setBusy(true);
    try {
      await patch(`/documents/${encodeURIComponent(id)}`, { status: editStatus, notes: '' });
      onNotice('success', `Status dokumen diperbarui menjadi ${editStatus}.`);
      docs.refresh(); requirements.refresh();
      setEditDocId(null); setEditStatus('');
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal memperbarui status dokumen.'); }
    finally { setBusy(false); }
  };

  const runCheck = async (e: FormEvent) => {
    e.preventDefault(); if (!canAdminRegulatory) return onNotice('error', 'Pemeriksaan regulasi hanya tersedia untuk Platform Admin.'); setBusy(true);
    try {
      const result = await post<{ complianceResult: AnyRecord }>('/compliance-check', check);
      setCheckResult(result.complianceResult);
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Pemeriksaan tidak dapat dibuat.'); }
    finally { setBusy(false); }
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      uploaded: 'Uploaded', under_review: 'Under review', approved: 'Approved',
      rejected: 'Rejected', expired: 'Expired', superseded: 'Superseded',
      pending: 'Required', waived: 'Waived', not_applicable: 'Not applicable',
      completed: 'Completed',
    };
    return labels[status] || status;
  };

  const requirementRows = (requirements.data?.documentRequirements || []).map((r: any) => {
    const projectDocs = (docs.data?.documents || []).filter((d: any) => d.projectRequirementId === r.id);
    const latest = projectDocs.length ? projectDocs[0] : null;
    return {
      ...r,
      latestDocument: latest,
      documentStatus: latest ? latest.status : (r.is_required ? 'missing' : 'not_required'),
    };
  });

  return <>
    <PageTitle eyebrow="EXPORT COMPLIANCE" title="Dokumen & kepatuhan" subtitle="Persyaratan dokumen dan status siklus hidup sesuai hak akses Project." actions={<>{canCreateDocuments && <ActionButton onClick={() => setShowForm(v => !v)}><Plus size={16} /> Catat dokumen</ActionButton>}</>} />
    {canCreateDocuments && !storage.data?.available && <div className="inline-warning"><CircleAlert size={17} /> Penyimpanan objek pribadi ({storage.data?.bucket || 'pke-private-documents'}) belum tersedia: {storage.data?.reason || 'Kredensial server belum dikonfigurasi.'}. Unggah file fisik dinonaktifkan sampai kredensial penyimpanan disediakan.</div>}
    {canViewDocuments && <div className="metric-grid"><Metric label="Dokumen tercatat" value={number(docs.data?.documents?.length || 0, 0)} icon={FileCheck2} tone="amber" /></div>}
    {showForm && canCreateDocuments && <Card className="form-panel"><PanelHeading title="Catat referensi dokumen" description="Pilih persyaratan dokumen proyek dan berikan referensi berkas, checksum SHA-256, dan metadata. Unggah file fisik melalui penyimpanan pribadi saat tersedia." action={<button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button>} /><form className="form-grid" onSubmit={saveDoc}>
      <FormField label="Persyaratan dokumen proyek"><select value={doc.projectRequirementId} onChange={e => setDoc(v => ({ ...v, projectRequirementId: e.target.value }))} required>{(requirements.data?.documentRequirements || []).map((r: any) => <option key={r.id} value={r.id}>{r.documentCode} · {r.countryName} ({r.status})</option>)}</select></FormField>
      <FormField label="Nama berkas asli"><input value={doc.originalFilename} onChange={e => setDoc(v => ({ ...v, originalFilename: e.target.value }))} required placeholder="Contoh: invoice-001.pdf" /></FormField>
      <FormField label="TIPE MIME"><input value={doc.mimeType} onChange={e => setDoc(v => ({ ...v, mimeType: e.target.value }))} placeholder="Contoh: application/pdf" /></FormField>
      <FormField label="Checksum SHA-256"><input value={doc.sha256Checksum} readOnly placeholder="Dihitung otomatis setelah unggah" /></FormField>
      <FormField label="Tanggal kedaluwarsa"><input type="date" value={doc.expiryDate} onChange={e => setDoc(v => ({ ...v, expiryDate: e.target.value }))} /></FormField>
      <FormField label="Catatan" wide><textarea rows={2} value={doc.notes} onChange={e => setDoc(v => ({ ...v, notes: e.target.value }))} /></FormField>
      {storage.data?.available ? <>
      <FormField label="Pilih berkas untuk diunggah"><input type="file" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} /></FormField>
      <div className="form-actions" style={{ marginTop: 12 }}><ActionButton variant="secondary" onClick={() => requestUpload()} disabled={!uploadFile || uploadBusy}>{uploadBusy ? 'Mengunggah & memverifikasi…' : 'Unggah file & hitung checksum'}</ActionButton>{doc.objectKey && <span className="muted">File siap diregistrasi · {doc.contentLength.toLocaleString('id-ID')} byte</span>}</div>
      </> : <span className="muted">Unggah file fisik dinonaktifkan — kredensial penyimpanan belum dikonfigurasi.</span>}
      <div className="form-actions"><ActionButton variant="secondary" onClick={() => setShowForm(false)}>Batal</ActionButton><button className="primary-button" disabled={busy || !storage.data?.available || !doc.objectKey}>{busy ? 'Menyimpan…' : 'Verifikasi & simpan dokumen'}</button>{!storage.data?.available && <span style={{ marginLeft: 8, fontSize: '12px', color: '#dc2626' }}>Tidak tersedia</span>}</div>
    </form></Card>}
    {canAdminRegulatory && <div className="content-two"><Card><PanelHeading title="Paket negara tujuan" description="Persyaratan dokumen per negara tujuan dari katalog regulasi." />{packs.loading ? <Loading /> : packs.error ? <ErrorState message={packs.error} retry={packs.refresh} /> : <div className="country-list">{(packs.data?.countryPacks || []).map((pack, i) => <div className="country-card" key={pack.countryCode || i}><div className="country-flag">{pack.countryCode === 'CN' ? 'CN' : pack.countryCode === 'PK' ? 'PK' : 'ID'}</div><div className="country-copy"><strong>{pack.country}</strong><span>{pack.packName}</span><small>{(pack.requirements || []).join(' · ')}</small></div><div className="country-tax">{number(Number(pack.taxRate || 0) * 100, 1)}%<small>indikatif</small></div></div>)}</div>}</Card>
      <Card><PanelHeading title="Referensi regulasi" description="Sumber regulasi terverifikasi dari regulatory_sources." />{knowledge.loading ? <Loading /> : knowledge.error ? <ErrorState message={knowledge.error} retry={knowledge.refresh} /> : <div className="activity-list">{(knowledge.data?.regulatoryKnowledge || []).map((item, i) => <div className="activity-item" key={item.id || i}><div className="activity-icon"><Globe2 size={16} /></div><div className="activity-copy"><strong>{item.title}</strong><span>{item.issuingAuthority} · {item.jurisdiction}</span><small><StatusPill value={item.verificationStatus || item.status} /></small></div></div>)}</div>}</Card></div>}
    {canViewDocuments && <Card><PanelHeading title="Persyaratan dokumen proyek" description="Setiap baris menunjukkan dokumen yang diwajibkan untuk proyek ini dan status berkas terkait." action={<button className="icon-button" onClick={() => { requirements.refresh(); docs.refresh(); }}><RefreshCw size={16} /></button>} />
      {requirements.loading ? <Loading /> : requirements.error ? <ErrorState message={requirements.error} retry={requirements.refresh} /> : <div className="document-lifecycle">
        {requirementRows.length === 0 && <EmptyState title="Belum ada persyaratan dokumen" desc="Persyaratan dokumen akan muncul setelah negara tujuan dan produk proyek ditetapkan." />}
        {requirementRows.map((r: any) => {
          const latest = r.latestDocument;
          const tone = r.documentStatus === 'approved' ? 'green' : r.documentStatus === 'under_review' ? 'amber' : r.documentStatus === 'rejected' || r.documentStatus === 'expired' || r.documentStatus === 'superseded' ? 'red' : r.documentStatus === 'missing' ? 'slate' : 'slate';
          return <div className="document-requirement-row" key={r.id}>
            <div className="document-requirement-info">
              <div className="document-requirement-head"><strong>{r.documentCode}</strong> · {r.documentName}<span className={`status-pill pill-${tone}`}>{statusLabel(r.documentStatus)}</span></div>
              <div className="document-requirement-meta">{r.countryName} · {r.documentCategory} · {r.isRequired ? 'Wajib' : 'Opsional'} · Sumber: {r.officialSourceUrl || '—'}</div>
              {latest && <div className="document-requirement-file"><strong>Berkas:</strong> {latest.originalFilename} · <strong>Versi:</strong> {latest.versionNo} · <strong>Checksum:</strong> {latest.sha256Checksum ? latest.sha256Checksum.slice(0, 16) + '…' : '—'} · <strong>Diunggah:</strong> {dateTime(latest.uploaded_at)}</div>}
              {!latest && r.isRequired && <div className="document-requirement-missing"><CircleAlert size={14} /> Berkas belum diunggah — referensi dokumen belum tercantum.</div>}
            </div>
            <div className="document-requirement-actions">
              {latest && canUpdateDocuments && <div className="document-status-select"><label>Status</label><select value={editDocId === r.id ? editStatus : latest.status} onChange={e => { if (editDocId === r.id) setEditStatus(e.target.value); }} disabled={editDocId !== null && editDocId !== r.id}><option value="uploaded">Uploaded</option><option value="under_review">Under review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="superseded">Superseded</option></select>{editDocId === r.id && <button className="text-button" onClick={() => updateDocStatus(latest.id)}>Simpan</button>}</div>}
              {!latest && canCreateDocuments && <ActionButton variant="ghost" onClick={() => { setDoc(v => ({ ...v, projectRequirementId: r.id })); setShowForm(true); }}><Plus size={14} /> Catat berkas</ActionButton>}
            </div>
          </div>
        })}
      </div>}
    </Card>}
    {canAdminRegulatory && <Card><PanelHeading title="Pemeriksaan kepatuhan" description="Hasil pemeriksaan memerlukan review manusia karena aturan kepatuhan belum sepenuhnya diverifikasi." /><form className="form-grid" onSubmit={runCheck}><FormField label="Jenis entitas"><select value={check.entityType} onChange={e => setCheck(v => ({ ...v, entityType: e.target.value }))}><option value="project">Project</option><option value="shipment">Shipment</option><option value="contract">Contract</option></select></FormField><FormField label="ID entitas"><input value={check.entityId} onChange={e => setCheck(v => ({ ...v, entityId: e.target.value }))} required placeholder="UUID entitas" /></FormField><FormField label="Negara tujuan"><select value={check.targetCountry} onChange={e => setCheck(v => ({ ...v, targetCountry: e.target.value }))}><option value="CN">China</option><option value="PK">Pakistan</option></select></FormField><FormField label="Jenis pemeriksaan"><select value={check.checkType} onChange={e => setCheck(v => ({ ...v, checkType: e.target.value }))}><option value="document_readiness">Document readiness</option><option value="shipment_compliance">Shipment compliance</option><option value="contract_compliance">Contract compliance</option></select></FormField><div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? 'Memproses…' : 'Buat hasil review'}</button></div></form>{checkResult && <div className="review-result"><div className="review-result-head"><CircleAlert size={18} /><strong>Perlu review manusia</strong></div><p>{checkResult.message}</p><small>Target: {checkResult.targetCountry} · Entitas: {shortId(checkResult.entityId)}</small></div>}</Card>}
  </>;
}


function ReportsPage({ projectId, onNotice }: { projectId: string; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const portfolio = useLoad<AnyRecord>(() => projectId ? get(`/reports/project/${encodeURIComponent(projectId)}`) : get('/reports/portfolio'), [projectId]);
  const templates = useLoad<{ templates?: AnyRecord[] }>(() => get('/reports/templates'), []);
  const runs = useLoad<{ runs?: AnyRecord[] }>(() => get('/reports/runs'), []);
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const tpl = templates.data?.templates?.[0]?.id;
      if (!tpl) {
        onNotice('error', 'Template laporan belum tersedia. Konfigurasi template laporan diperlukan sebelum generate.');
        return;
      }
      await post('/reports/generate', { template: tpl, projectId: projectId || null });
      onNotice('success', 'Permintaan laporan dibuat.');
      runs.refresh();
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal generate laporan.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageTitle eyebrow="REPORTS" title="Laporan" subtitle="Ringkasan laporan dan riwayat report run dari API." actions={<ActionButton onClick={generate} disabled={busy || templates.loading}>{busy ? 'Memproses…' : 'Generate report'}</ActionButton>} />
    <Card><PanelHeading title="Ringkasan" description="Data ringkasan dari API." />{portfolio.loading ? <Loading /> : portfolio.error ? <ErrorState message={portfolio.error} retry={portfolio.refresh} /> : <JsonSummary data={portfolio.data} />}</Card>
    <Card><PanelHeading title="Report runs" description="Riwayat run. Status completed hanya valid bila file laporan privat terverifikasi oleh backend." />{runs.loading ? <Loading /> : runs.error ? <ErrorState message={runs.error} retry={runs.refresh} /> : <DataTable rows={runs.data?.runs || []} columns={[{key:'id',label:'ID',render:r=>shortId(r.id)},{key:'status',label:'Status',render:r=><StatusPill value={r.status||'queued'}/>},{key:'created_at',label:'Dibuat',render:r=>dateTime(r.created_at)},{key:'note',label:'Catatan',render:r=>r.note||'—'}]} emptyTitle="Belum ada run" emptyText="Generate report untuk membuat run." />}</Card>
  </>;
}

function JsonSummary({ data }: { data: AnyRecord | null }) {
  if (!data) return <EmptyState title="Belum ada data" desc="Tidak ada ringkasan yang dikembalikan API." />;
  const entries = Object.entries(data).filter(([, value]) => typeof value !== 'object' && value !== null);
  return <div className="insight-grid">{entries.slice(0, 12).map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{typeof value === 'number' ? number(value) : String(value)}</strong></div>)}</div>;
}

function MyWorkPage({ projectId, activeUser, onNotice }: { projectId: string; activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const canCreate = hasProjectPermission("project.tasks.create", activeUser);
  const canAssign = hasProjectPermission("project.tasks.assign", activeUser);
  const canResolve = hasProjectPermission("project.tasks.resolve", activeUser);
  const canEscalate = hasProjectPermission("project.tasks.escalate", activeUser);
  const selectedMembership = (activeUser?.projectMemberships || []).find((membership: AnyRecord) => membership.projectId === projectId && membership.isActive === true);
  const activeRoleCodes = new Set((selectedMembership?.roleAssignments || [])
    .filter((assignment: AnyRecord) => assignment.isActive === true && !assignment.revokedAt && assignment.roleIsActive === true
      && (!assignment.expiresAt || new Date(assignment.expiresAt).getTime() > Date.now()))
    .map((assignment: AnyRecord) => assignment.roleCode));
  const isTaskOwner = (task: AnyRecord) => activeRoleCodes.has(task.owner_role_code)
    && (!task.assignee_user_id || task.assignee_user_id === activeUser?.id);
  const detail = useLoad<{ roles?: AnyRecord[]; members?: AnyRecord[] }>(
    () => projectId && canCreate ? get("/projects/" + encodeURIComponent(projectId) + "/detail") : Promise.resolve({ roles: [], members: [] }),
    [projectId, canCreate],
  );
  const tasks = useLoad<{ workItems?: AnyRecord[]; scope?: string }>(
    () => projectId ? get("/projects/" + encodeURIComponent(projectId) + "/work-items") : Promise.resolve({ workItems: [], scope: "assigned" }),
    [projectId],
  );
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [draft, setDraft] = useState({ title: "", description: "", ownerRoleCode: "", assigneeUserId: "", priority: "normal", dueAt: "" });
  const [assignDraft, setAssignDraft] = useState({ ownerRoleCode: "", assigneeUserId: "", dueAt: "", priority: "normal", reason: "" });
  const [assignTaskId, setAssignTaskId] = useState("");
  const events = useLoad<{ events?: AnyRecord[] }>(
    () => selectedTaskId && projectId
      ? get("/projects/" + encodeURIComponent(projectId) + "/work-items/" + encodeURIComponent(selectedTaskId) + "/events")
      : Promise.resolve({ events: [] }),
    [selectedTaskId, projectId],
  );
  const activeRoles = (detail.data?.roles || []).filter(role => role.is_active === true);
  const activeMembers = (detail.data?.members || []).filter(member => member.is_active === true);
  const eligibleMembers = (roleCode: string) => activeMembers.filter(member =>
    (member.role_assignments || []).some((assignment: AnyRecord) =>
      assignment.roleCode === roleCode && assignment.isActive === true && !assignment.revokedAt &&
      (!assignment.expiresAt || new Date(assignment.expiresAt).getTime() > Date.now())
    )
  );
  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || !draft.ownerRoleCode) return;
    setBusy(true);
    try {
      await post("/projects/" + encodeURIComponent(projectId) + "/work-items", {
        ...draft, dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        assigneeUserId: draft.assigneeUserId || null,
      });
      onNotice("success", "Tugas/instruksi berhasil dibuat dan notifikasi penugasan dikirim.");
      setDraft({ title: "", description: "", ownerRoleCode: "", assigneeUserId: "", priority: "normal", dueAt: "" });
      setShowCreate(false); tasks.refresh();
    } catch (error) { onNotice("error", error instanceof Error ? error.message : "Tugas gagal dibuat."); }
    finally { setBusy(false); }
  };
  const act = async (task: AnyRecord, action: string, extra: AnyRecord = {}) => {
    setBusy(true);
    try {
      await patch("/projects/" + encodeURIComponent(projectId) + "/work-items/" + encodeURIComponent(task.id), { action, ...extra });
      onNotice("success", "Status tugas diperbarui.");
      tasks.refresh();
      if (selectedTaskId === task.id) events.refresh();
      setActionReason("");
      if (assignTaskId === task.id) setAssignTaskId("");
    } catch (error) { onNotice("error", error instanceof Error ? error.message : "Tindakan tugas gagal."); }
    finally { setBusy(false); }
  };
  const assign = async (task: AnyRecord) => {
    if (!assignDraft.ownerRoleCode) return;
    await act(task, "assign", {
      ownerRoleCode: assignDraft.ownerRoleCode,
      reason: assignDraft.reason,
      assigneeUserId: assignDraft.assigneeUserId || null,
      dueAt: assignDraft.dueAt ? new Date(assignDraft.dueAt).toISOString() : task.due_at,
      priority: assignDraft.priority || task.priority,
    });
  };
  const rows = tasks.data?.workItems || [];
  return <>
    <PageTitle eyebrow="PROJECT WORK QUEUE" title="Tugas & instruksi" subtitle={tasks.data?.scope === "project" ? "Antrean seluruh Project untuk PM; penugasan, tenggat, eskalasi dan review." : "Tugas yang ditugaskan kepada Anda melalui role aktif pada Project ini."} actions={<>{canCreate && <ActionButton onClick={() => setShowCreate(v => !v)}><Plus size={16} /> Instruksi baru</ActionButton>}<ActionButton variant="secondary" onClick={() => tasks.refresh()}><RefreshCw size={16} /> Segarkan</ActionButton></>} />
    {showCreate && canCreate && <Card className="form-panel"><PanelHeading title="Buat tugas / instruksi PM" description="Tugas harus ditujukan ke role aktif dalam Project ini." action={<button className="icon-button" onClick={() => setShowCreate(false)}><X size={18} /></button>} />
      <form className="form-grid" onSubmit={createTask}>
        <FormField label="Judul tugas"><input value={draft.title} onChange={e => setDraft(v => ({ ...v, title: e.target.value }))} minLength={3} maxLength={240} required /></FormField>
        <FormField label="Role penanggung jawab"><select value={draft.ownerRoleCode} onChange={e => setDraft(v => ({ ...v, ownerRoleCode: e.target.value, assigneeUserId: "" }))} required><option value="">Pilih role aktif</option>{activeRoles.map(role => <option key={role.id} value={role.role_code}>{role.name}</option>)}</select></FormField>
        <FormField label="User tertentu (opsional)"><select value={draft.assigneeUserId} onChange={e => setDraft(v => ({ ...v, assigneeUserId: e.target.value }))}><option value="">Seluruh pemegang role</option>{eligibleMembers(draft.ownerRoleCode).map(member => <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>)}</select></FormField>
        <FormField label="Prioritas"><select value={draft.priority} onChange={e => setDraft(v => ({ ...v, priority: e.target.value }))}><option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Tinggi</option><option value="critical">Kritis</option></select></FormField>
        <FormField label="Batas waktu"><input type="datetime-local" value={draft.dueAt} onChange={e => setDraft(v => ({ ...v, dueAt: e.target.value }))} /></FormField>
        <FormField label="Deskripsi / instruksi" wide><textarea rows={3} value={draft.description} onChange={e => setDraft(v => ({ ...v, description: e.target.value }))} /></FormField>
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => setShowCreate(false)}>Batal</ActionButton><button className="primary-button" disabled={busy || !draft.ownerRoleCode || !draft.title.trim()}>{busy ? "Menyimpan…" : "Buat & tugaskan"}</button></div>
      </form>
    </Card>}
    <div className="metric-grid four">
      <Metric label="Total antrean" value={number(rows.length, 0)} icon={ClipboardCheck} tone="blue" />
      <Metric label="Terlambat" value={number(rows.filter(task => task.is_overdue).length, 0)} icon={Clock3} tone="amber" />
      <Metric label="Terblokir" value={number(rows.filter(task => task.status === "blocked").length, 0)} icon={CircleAlert} tone="red" />
      <Metric label="Menunggu review" value={number(rows.filter(task => task.status === "submitted").length, 0)} icon={CheckCircle2} tone="green" />
    </div>
    {tasks.loading ? <Loading /> : tasks.error ? <ErrorState message={tasks.error} retry={tasks.refresh} /> : rows.length === 0
      ? <EmptyState title="Belum ada tugas" desc="Tugas yang ditugaskan kepada role atau akun Anda akan muncul di sini." />
      : <div className="dashboard-grid">{rows.map(task => <Card key={task.id}>
        <div className="notification-head"><strong>{task.title}</strong><StatusPill value={task.priority} /></div>
        <p>{task.description || "Tidak ada deskripsi tambahan."}</p>
        <div className="service-list">
          <div><span>Penanggung jawab</span><strong>{task.owner_role_code}{task.assignee_user_id ? " · " + shortId(task.assignee_user_id) : " · seluruh role"}</strong></div>
          <div><span>Status</span><StatusPill value={task.status} /></div>
          <div><span>Tenggat</span><strong>{dateTime(task.due_at)}</strong></div>
          <div><span>Eskalasi</span><strong>{number(task.escalation_level, 0)}</strong></div>
        </div>
        {task.is_overdue && <div className="inline-warning"><Clock3 size={15} /> Melewati tenggat.</div>}
        <div className="form-actions">
          {task.status === "open" && <ActionButton onClick={() => act(task, "acknowledge")} disabled={busy}>Akui tugas</ActionButton>}
          {["acknowledged","blocked"].includes(task.status) && <ActionButton onClick={() => act(task, "start")} disabled={busy}>Mulai</ActionButton>}
          {["acknowledged","in_progress"].includes(task.status) && <ActionButton variant="secondary" onClick={() => act(task, "submit")} disabled={busy}>Kirim selesai</ActionButton>}
          {["acknowledged","in_progress"].includes(task.status) && <ActionButton variant="ghost" onClick={() => act(task, "block", { reason: actionReason })} disabled={busy || actionReason.trim().length < 5}>Blokir</ActionButton>}
          {task.status === "submitted" && canResolve && <ActionButton onClick={() => act(task, "resolve")} disabled={busy}>Setujui penyelesaian</ActionButton>}
          {task.status === "resolved" && canResolve && <ActionButton onClick={() => act(task, "close")} disabled={busy}>Tutup tugas</ActionButton>}
          {["resolved","closed"].includes(task.status) && canResolve && <ActionButton variant="ghost" onClick={() => act(task, "reopen", { reason: actionReason })} disabled={busy || actionReason.trim().length < 5}>Buka kembali</ActionButton>}
          {!["resolved","closed","cancelled"].includes(task.status) && (isTaskOwner(task) || canEscalate) && <ActionButton variant="ghost" onClick={() => act(task, "escalate", { reason: actionReason })} disabled={busy || actionReason.trim().length < 5}>Eskalasi ke PM</ActionButton>}
          {actionReason.trim().length >= 2 && (isTaskOwner(task) || hasProjectPermission("project.tasks.update", activeUser)) && <ActionButton variant="ghost" onClick={() => act(task, "comment", { comment: actionReason })} disabled={busy}>Catat komentar</ActionButton>}
          {canAssign && !["closed","cancelled"].includes(task.status) && <ActionButton variant="secondary" onClick={() => { setAssignTaskId(task.id); setAssignDraft({ ownerRoleCode: task.owner_role_code, assigneeUserId: task.assignee_user_id || "", dueAt: task.due_at ? new Date(task.due_at).toISOString().slice(0,16) : "", priority: task.priority, reason: "" }); }}>Alihkan</ActionButton>}
          <ActionButton variant="ghost" onClick={() => setSelectedTaskId(task.id)}>Riwayat</ActionButton>
        </div>
        {(isTaskOwner(task) || canResolve || canEscalate) && <FormField label="Catatan / alasan blokir / eskalasi / buka kembali"><input value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Minimal 5 karakter" /></FormField>}
        {assignTaskId === task.id && canAssign && <form className="form-grid" onSubmit={e => { e.preventDefault(); assign(task); }}>
          <FormField label="Role baru"><select value={assignDraft.ownerRoleCode} onChange={e => setAssignDraft(v => ({ ...v, ownerRoleCode: e.target.value, assigneeUserId: "" }))}>{activeRoles.map(role => <option key={role.id} value={role.role_code}>{role.name}</option>)}</select></FormField>
          <FormField label="User tertentu"><select value={assignDraft.assigneeUserId} onChange={e => setAssignDraft(v => ({ ...v, assigneeUserId: e.target.value }))}><option value="">Seluruh role</option>{eligibleMembers(assignDraft.ownerRoleCode).map(member => <option key={member.user_id} value={member.user_id}>{member.name || member.email}</option>)}</select></FormField>
          <FormField label="Tenggat baru"><input type="datetime-local" value={assignDraft.dueAt} onChange={e => setAssignDraft(v => ({ ...v, dueAt: e.target.value }))} /></FormField>
          <FormField label="Alasan pengalihan"><input value={assignDraft.reason} onChange={e => setAssignDraft(v => ({ ...v, reason: e.target.value }))} minLength={5} required /></FormField>
          <div className="form-actions"><ActionButton variant="secondary" onClick={() => setAssignTaskId("")}>Batal</ActionButton><button className="primary-button" disabled={busy || assignDraft.reason.trim().length < 5}>Simpan penugasan</button></div>
        </form>}
      </Card>)}</div>}
    {selectedTaskId && <Card><PanelHeading title="Riwayat tugas" description="Event append-only untuk penugasan, acknowledgment dan penyelesaian." action={<button className="icon-button" onClick={() => setSelectedTaskId("")}><X size={16} /></button>} />
      {events.loading ? <Loading /> : events.error ? <ErrorState message={events.error} retry={events.refresh} /> : <div className="activity-list">{(events.data?.events || []).map(event => <div className="activity-item" key={event.id}><div className="activity-icon"><Clock3 size={16} /></div><div className="activity-copy"><strong>{event.event_type}</strong><span>{event.reason || (event.payload?.comment ? String(event.payload.comment) : "")}</span><small>{dateTime(event.occurred_at)} · {shortId(event.actor_user_id)}</small></div></div>)}</div>}
    </Card>}
  </>;
}

function NotificationsPage({ onNotice, onOpenTask }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void; onOpenTask: (projectId: string) => void }) {
  const notifications = useLoad<{ notifications?: AnyRecord[]; unreadCount?: number }>(() => get('/notifications'), []);
  const providers = useLoad<AnyRecord>(() => get('/notifications/providers'), []);
  const markRead = async (id: string) => { try { await patch(`/notifications/${id}/read`, {}); notifications.refresh(); } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Notifikasi tidak dapat diperbarui.'); } };
  return <>
    <PageTitle eyebrow="SYSTEM FEED" title="Notifikasi" subtitle="Pesan sistem dan status provider yang dikembalikan backend." actions={<ActionButton variant="secondary" onClick={() => notifications.refresh()}><RefreshCw size={16} /> Segarkan</ActionButton>} />
    <div className="metric-grid three"><Metric label="Belum dibaca" value={number(notifications.data?.unreadCount || 0, 0)} icon={Bell} tone="amber" /><Metric label="Email provider" value={String(providers.data?.email || '—')} icon={FileText} tone="blue" /><Metric label="In-app" value={String(providers.data?.inApp || '—')} icon={Activity} tone="green" /></div>
    <Card><PanelHeading title="Inbox" description="Notifikasi terbaru untuk akun yang sedang masuk." />{notifications.loading ? <Loading /> : notifications.error ? <ErrorState message={notifications.error} retry={notifications.refresh} /> : (notifications.data?.notifications || []).length ? <div className="notification-list">{notifications.data!.notifications!.map((item, i) => <div className={`notification-item ${item.readAt ? 'is-read' : ''}`} key={item.id || i}><div className="notification-icon"><Bell size={17} /></div><div className="notification-body"><div className="notification-head"><strong>{String(item.title || 'Notifikasi')}</strong><StatusPill value={item.priority || 'normal'} /></div><p>{String(item.message || '')}</p><small>{dateTime(item.createdAt)}</small>{item.workItemId && <button className="text-button" onClick={() => onOpenTask(String(item.projectId))}>Buka tugas</button>}</div>{!item.readAt && item.id && <button className="text-button" onClick={() => markRead(String(item.id))}>Tandai dibaca</button>}</div>)}</div> : <EmptyState title="Inbox kosong" desc="Belum ada notifikasi untuk akun ini." />}</Card>
    <div className="inline-warning"><CircleAlert size={17} /> Provider email, SMS, dan WhatsApp belum dikonfigurasi. Notifikasi in-app disimpan di backend, tetapi pengiriman ke kanal eksternal dan jaminan delivery end-to-end belum tersedia.</div>
  </>;
}

function AccessPage({ activeUser, onNotice }: { activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const canPlatformAdmin = activeUser?.platformAdmin === true;
  const canManageProjectRoles = hasProjectPermission('project.roles.manage', activeUser);
  const canManageMemberships = hasProjectPermission('project.members.manage', activeUser);
  const roles = useLoad<{ roles?: AnyRecord[]; permissions?: AnyRecord[] }>(() => canPlatformAdmin ? get('/roles') : Promise.resolve({ roles: [], permissions: [] }), [canPlatformAdmin]);
  const users = useLoad<{ users?: AnyRecord[] }>(() => canPlatformAdmin ? get('/users') : Promise.resolve({ users: [] }), [canPlatformAdmin]);
  const projects = useLoad<{ projects?: AnyRecord[] }>(() => get('/projects'), []);
  const provisioning = useLoad<{ ready?: boolean; reason?: string | null }>(() => canPlatformAdmin ? get('/admin/provisioning/status') : Promise.resolve({ ready: false }), [canPlatformAdmin]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const projectDetail = useLoad<{ members?: AnyRecord[]; roles?: AnyRecord[]; project?: AnyRecord }>(
    () => selectedProjectId ? get(`/projects/${selectedProjectId}/detail`) : Promise.resolve({ members: [], roles: [] }),
    [selectedProjectId],
  );
  const [resettingId, setResettingId] = useState('');
  const [membershipBusyId, setMembershipBusyId] = useState('');
  const [globalBusyId, setGlobalBusyId] = useState('');
  const [memberAddUserId, setMemberAddUserId] = useState('');
  const [memberAddRoleId, setMemberAddRoleId] = useState('');
  const [memberAddReason, setMemberAddReason] = useState('');
  const [memberAddExpiresAt, setMemberAddExpiresAt] = useState('');
  const [memberAddBusy, setMemberAddBusy] = useState(false);
  const [pmAppointUserId, setPmAppointUserId] = useState('');
  const [pmAppointReason, setPmAppointReason] = useState('');
  const [pmAppointBusy, setPmAppointBusy] = useState(false);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionEmail, setProvisionEmail] = useState('');
  const [provisionName, setProvisionName] = useState('');
  const [provisionReason, setProvisionReason] = useState('');
  const [temporaryCredential, setTemporaryCredential] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (!selectedProjectId && projects.data?.projects?.[0]?.id) setSelectedProjectId(String(projects.data.projects[0].id));
  }, [projects.data, selectedProjectId]);

  const makeTemporaryPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = new Uint8Array(28);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
  };

  const createAccount = async (e: FormEvent) => {
    e.preventDefault(); if (!canPlatformAdmin) return;
    if (!provisioning.data?.ready) {
      onNotice('error', 'Provisioning belum diaktifkan pada environment ini.');
      return;
    }
    const email = provisionEmail.trim().toLowerCase();
    const name = provisionName.trim();
    const reason = provisionReason.trim();
    if (!email || name.length < 2 || reason.length < 5) {
      onNotice('error', 'Email, nama, dan alasan minimal 5 karakter wajib diisi.');
      return;
    }
    if (!window.confirm(`Buat akun PKE dan identitas Neon Auth untuk ${email}? Akun akan tetap nonaktif sampai Admin mengaktifkannya.`)) return;

    setProvisionBusy(true);
    setTemporaryCredential(null);
    let pendingPkeCreated = false;
    try {
      await post('/admin/users/provision', { email, name, reason });
      pendingPkeCreated = true;
      const temporaryPassword = makeTemporaryPassword();
      const authResult: any = await authClient.admin.createUser({
        email,
        name,
        password: temporaryPassword,
        role: 'user',
      });
      if (authResult?.error) {
        throw new Error(authResult.error.message || 'Neon Auth menolak pembuatan identitas.');
      }
      setTemporaryCredential({ email, password: temporaryPassword });
      setProvisionEmail('');
      setProvisionName('');
      setProvisionReason('');
      users.refresh();
      onNotice('success', 'Identitas Neon Auth berhasil dibuat. Pemetaan PKE menunggu webhook terverifikasi; akun tetap nonaktif.');
    } catch (e) {
      onNotice('error', pendingPkeCreated
        ? `Akun PKE pending telah dicatat, tetapi pembuatan/sinkronisasi Neon Auth belum selesai: ${e instanceof Error ? e.message : 'gagal'}`
        : (e instanceof Error ? e.message : 'Provisioning akun gagal.'));
      users.refresh();
    } finally {
      setProvisionBusy(false);
    }
  };

  const updateGlobalStatus = async (user: AnyRecord) => {
    if (!canPlatformAdmin) return;
    const id = String(user.id || '');
    const authUserId = String(user.neon_auth_user_id || '');
    if (!id || !authUserId) {
      onNotice('error', 'Akun belum memiliki identitas Neon Auth terverifikasi.');
      return;
    }
    const activate = user.is_active !== true;
    const reason = window.prompt(`Alasan ${activate ? 'mengaktifkan' : 'menonaktifkan'} akun global ${user.email || id}:`);
    if (!reason || reason.trim().length < 5) {
      onNotice('info', 'Perubahan dibatalkan. Alasan minimal 5 karakter wajib dicatat.');
      return;
    }
    setGlobalBusyId(id);
    try {
      if (activate) {
        const unban: any = await authClient.admin.unbanUser({ userId: authUserId });
        if (unban?.error) throw new Error(unban.error.message || 'Neon Auth tidak dapat mengaktifkan identitas.');
        await patch(`/admin/users/${id}/status`, { isActive: true, reason: reason.trim() });
        onNotice('success', 'Akun global berhasil diaktifkan. Role dan membership tiap proyek tidak berubah.');
      } else {
        // Disable PKE access first (fail-closed), then ban the Auth account and revoke its sessions.
        await patch(`/admin/users/${id}/status`, { isActive: false, reason: reason.trim() });
        const ban: any = await authClient.admin.banUser({ userId: authUserId, banReason: reason.trim() });
        const revoke: any = await authClient.admin.revokeUserSessions({ userId: authUserId });
        if (ban?.error || revoke?.error) {
          const detail = ban?.error?.message || revoke?.error?.message || 'operasi Auth belum terkonfirmasi';
          onNotice('error', `Akun PKE sudah nonaktif dan akses aplikasi ditolak, tetapi ban/pencabutan sesi Neon Auth perlu diperiksa: ${detail}`);
        } else {
          onNotice('success', 'Akun global dinonaktifkan; sesi Neon Auth dicabut. Membership proyek tetap tersimpan dan terpisah.');
        }
      }
      users.refresh();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Perubahan status akun global gagal.');
      users.refresh();
    } finally {
      setGlobalBusyId('');
    }
  };

  const addMemberToProject = async (e: FormEvent) => {
    e.preventDefault(); if (!canPlatformAdmin) return;
    if (!selectedProjectId || !memberAddUserId || !memberAddRoleId || memberAddReason.trim().length < 5) {
      onNotice('error', 'Pilih akun aktif, role proyek, dan alasan minimal 5 karakter.');
      return;
    }
    setMemberAddBusy(true);
    try {
      await post(`/admin/projects/${selectedProjectId}/members`, {
        userId: memberAddUserId,
        projectRoleId: memberAddRoleId,
        reason: memberAddReason.trim(),
        ...(memberAddExpiresAt ? { expiresAt: new Date(memberAddExpiresAt).toISOString() } : {}),
      });
      setMemberAddReason('');
      setMemberAddExpiresAt('');
      onNotice('success', 'Role berhasil ditambahkan pada proyek ini. Role lain dan membership proyek lain tidak berubah.');
      projectDetail.refresh();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Penetapan role proyek gagal.');
    } finally {
      setMemberAddBusy(false);
    }
  };

  const revokeRoleAssignment = async (member: AnyRecord, assignment: AnyRecord) => {
    if (!selectedProjectId || !member.user_id || !assignment.id) return;
    const reason = window.prompt(`Alasan menonaktifkan role ${assignment.roleCode || assignment.roleName} untuk ${member.email || member.user_id}:`);
    if (!reason || reason.trim().length < 5) {
      onNotice('info', 'Perubahan dibatalkan. Alasan minimal 5 karakter wajib dicatat.');
      return;
    }
    setMembershipBusyId(String(member.id));
    try {
      if (assignment.roleCode === 'pm') {
        await post(`/admin/projects/${selectedProjectId}/pm-appointment/${member.user_id}/deactivate`, { reason: reason.trim() });
      } else {
        await post(`/projects/${selectedProjectId}/role-assignments/${assignment.id}/revoke`, { reason: reason.trim() });
      }
      onNotice('success', `Role ${assignment.roleCode || assignment.roleName} berhasil dinonaktifkan. Keanggotaan dan role lain tetap dipertahankan.`);
      projectDetail.refresh();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Penonaktifan role gagal.');
    } finally {
      setMembershipBusyId('');
    }
  };

  const appointProjectManager = async (e: FormEvent) => {
    e.preventDefault(); if (!canPlatformAdmin) return;
    if (!selectedProjectId || !pmAppointUserId || pmAppointReason.trim().length < 5) {
      onNotice('error', 'Pilih akun aktif dan isi alasan penunjukan PM minimal 5 karakter.');
      return;
    }
    setPmAppointBusy(true);
    try {
      await post(`/admin/projects/${selectedProjectId}/pm-appointment`, {
        userId: pmAppointUserId,
        reason: pmAppointReason.trim(),
      });
      setPmAppointUserId('');
      setPmAppointReason('');
      onNotice('success', 'Project Manager berhasil ditunjuk oleh Admin. Riwayat penunjukan tercatat.');
      projectDetail.refresh();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Penunjukan Project Manager gagal.');
    } finally {
      setPmAppointBusy(false);
    }
  };

  const requestReset = async (user: AnyRecord) => {
    if (!canPlatformAdmin) return;
    const id = String(user.id || '');
    if (!id) return;
    const label = String(user.email || user.id || 'pengguna ini');
    if (!window.confirm(`Kirim permintaan reset password untuk ${label}?`)) return;
    setResettingId(id);
    try {
      const res = await post<{ ok?: boolean; message?: string }>(`/admin/users/${id}/password-reset`, {});
      onNotice('success', res?.message || 'Permintaan reset password diproses.');
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Permintaan reset password gagal.');
    } finally {
      setResettingId('');
    }
  };

  const updateMembership = async (member: AnyRecord, changes: AnyRecord) => {
    if (!selectedProjectId || !member.id) return;
    const action = changes.isActive === false ? 'menonaktifkan keanggotaan' : 'mengaktifkan kembali keanggotaan';
    const reason = window.prompt(`Alasan ${action} untuk ${member.email || member.user_id}:`);
    if (!reason || reason.trim().length < 3) {
      onNotice('info', 'Perubahan dibatalkan. Alasan minimal 3 karakter wajib dicatat.');
      return;
    }
    setMembershipBusyId(String(member.id));
    try {
      await patch(`/projects/${selectedProjectId}/members/${member.id}`, { ...changes, reason: reason.trim() });
      onNotice('success', 'Keanggotaan proyek berhasil diperbarui.');
      projectDetail.refresh();
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Keanggotaan proyek tidak dapat diperbarui.');
    } finally {
      setMembershipBusyId('');
    }
  };

  return <>
    <PageTitle eyebrow="IDENTITY & GOVERNANCE" title="Role & permission" subtitle="Status akun bersifat global; role dan status keanggotaan ditetapkan terpisah untuk setiap proyek." actions={<ActionButton variant="secondary" onClick={() => { roles.refresh(); users.refresh(); projects.refresh(); projectDetail.refresh(); provisioning.refresh(); }}><RefreshCw size={16} /> Segarkan</ActionButton>} />
    {canPlatformAdmin && <>
    <Card>
      <PanelHeading title="Pembuatan akun oleh Admin" description="Pendaftaran publik tetap ditutup. Akun baru dibuat melalui Neon Auth Admin SDK, lalu dipetakan oleh webhook bertanda tangan; akun PKE tetap nonaktif sampai diaktifkan Admin." />
      {provisioning.loading ? <Loading /> : provisioning.error ? <ErrorState message={provisioning.error} retry={provisioning.refresh} /> : !provisioning.data?.ready ? <div className="muted">{provisioning.data?.reason || 'Provisioning belum diaktifkan pada environment ini.'}</div> : <>
        <form className="form-grid" onSubmit={createAccount}>
          <FormField label="Email pengguna"><input type="email" autoComplete="off" value={provisionEmail} onChange={e => setProvisionEmail(e.target.value)} required placeholder="nama@perusahaan.com" /></FormField>
          <FormField label="Nama pengguna"><input value={provisionName} onChange={e => setProvisionName(e.target.value)} required minLength={2} maxLength={160} placeholder="Nama lengkap" /></FormField>
          <FormField label="Alasan pembuatan akun"><input value={provisionReason} onChange={e => setProvisionReason(e.target.value)} required minLength={5} maxLength={500} placeholder="Dasar pemberian akses" /></FormField>
          <div className="form-actions"><button className="primary-button" disabled={provisionBusy}>{provisionBusy ? 'Membuat akun…' : 'Buat akun baru'}</button></div>
        </form>
        <p className="muted">Password sementara dibuat acak dan hanya ditampilkan satu kali. Sampaikan kepada pengguna melalui kanal terpisah yang aman; jangan simpan di catatan PKE.</p>
      </>}
      {temporaryCredential && <div className="identity-error" role="status">
        <strong>Password sementara — tampil satu kali</strong>
        <p>{temporaryCredential.email}</p>
        <code>{temporaryCredential.password}</code>
        <div className="form-actions"><button className="secondary-button" type="button" onClick={() => {
          void navigator.clipboard.writeText(temporaryCredential.password).then(() => onNotice('success', 'Password sementara disalin.')).catch(() => onNotice('error', 'Clipboard tidak tersedia; salin password secara manual.'));
        }}>Salin password</button><button className="secondary-button" type="button" onClick={() => setTemporaryCredential(null)}>Tutup</button></div>
        <p className="muted">Akun masih nonaktif. Setelah identitas tersinkron, Admin harus mengaktifkan akun global dan menetapkan role pada masing-masing proyek.</p>
      </div>}
    </Card>
    <Card><PanelHeading title="Akun pengguna" description="Akun autentikasi global. Menonaktifkan membership proyek tidak menonaktifkan akun ini atau membership proyek lainnya." />{users.loading ? <Loading /> : users.error ? <ErrorState message={users.error} retry={users.refresh} /> : <DataTable rows={users.data?.users || []} columns={[
      { key: 'email', label: 'Email', render: r => <strong>{String(r.email || '—')}</strong> },
      { key: 'name', label: 'Nama', render: r => r.name || '—' },
      { key: 'role', label: 'Role global', render: r => <StatusPill value={r.role || 'viewer'} /> },
      { key: 'is_active', label: 'Akun', render: r => <StatusPill value={r.is_active ? 'active' : 'inactive'} /> },
      { key: 'neon_auth_user_id', label: 'Neon Auth', render: r => <span className="mono">{shortId(r.neon_auth_user_id)}</span> },
      { key: 'global_action', label: 'Akun global', render: r => <ActionButton variant="secondary" disabled={!!globalBusyId || !r.neon_auth_user_id} onClick={() => updateGlobalStatus(r)}>{globalBusyId === String(r.id) ? 'Memproses…' : r.is_active ? 'Nonaktifkan global' : 'Aktifkan global'}</ActionButton> },
      { key: 'action', label: 'Pemulihan', render: r => <ActionButton variant="secondary" disabled={!!resettingId || !r.neon_auth_user_id} onClick={() => requestReset(r)}>{resettingId === String(r.id) ? 'Memproses…' : 'Kirim reset password'}</ActionButton> }
    ]} />}</Card>
    </>}
    <Card>
      <PanelHeading title="Role & status per proyek" description="Satu pengguna dapat mempunyai role berbeda dan status aktif/nonaktif yang independen pada setiap proyek." />
      {projects.loading ? <Loading /> : projects.error ? <ErrorState message={projects.error} retry={projects.refresh} /> : !projects.data?.projects?.length ? <EmptyState title="Belum ada proyek" desc="Keanggotaan proyek dapat dikelola setelah proyek tersedia." /> : <>
        <FormField label="Pilih proyek"><select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>{(projects.data?.projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
        {canPlatformAdmin && <form className="form-grid" onSubmit={addMemberToProject}>
          <FormField label="Akun aktif"><select value={memberAddUserId} onChange={e => setMemberAddUserId(e.target.value)} required>
            <option value="">Pilih akun PKE</option>
            {(users.data?.users || []).filter(user => user.is_active === true && !!user.neon_auth_user_id).map(user => <option key={user.id} value={user.id}>{user.name || user.email} — {user.email}</option>)}
          </select></FormField>
          <FormField label="Role pada proyek ini"><select value={memberAddRoleId} onChange={e => setMemberAddRoleId(e.target.value)} required>
            <option value="">Pilih role proyek</option>
            {(projectDetail.data?.roles || []).filter(role => role.is_active && role.role_code !== 'pm').map(role => <option key={role.id} value={role.id}>{role.name} ({role.role_code})</option>)}
          </select></FormField>
          <FormField label="Alasan penetapan akses"><input value={memberAddReason} onChange={e => setMemberAddReason(e.target.value)} minLength={5} maxLength={500} required placeholder="Dasar pemberian role pada proyek ini" /></FormField>
          <FormField label="Masa berlaku role (opsional)"><input type="datetime-local" value={memberAddExpiresAt} onChange={e => setMemberAddExpiresAt(e.target.value)} min={new Date(Date.now() + 60_000).toISOString().slice(0,16)} /></FormField>
          <div className="form-actions"><button className="primary-button" disabled={memberAddBusy || projectDetail.loading || !users.data?.users?.length}>{memberAddBusy ? 'Menyimpan…' : 'Tambahkan ke proyek'}</button></div>
        </form>}
        {canPlatformAdmin && <div className="panel-subsection">
          <PanelHeading title="Penunjukan Project Manager" description="Keputusan penunjukan dan penonaktifan PM sepenuhnya milik Admin. Jika Project masih memiliki PM aktif, nonaktifkan penugasan PM yang dipilih Admin terlebih dahulu." />
          <form className="form-grid" onSubmit={appointProjectManager}>
            <FormField label="Akun PM"><select value={pmAppointUserId} onChange={e => setPmAppointUserId(e.target.value)} required>
              <option value="">Pilih akun PKE aktif</option>
              {(users.data?.users || []).filter(user => user.is_active === true && !!user.neon_auth_user_id).map(user => <option key={user.id} value={user.id}>{user.name || user.email} — {user.email}</option>)}
            </select></FormField>
            <FormField label="Alasan penunjukan"><input value={pmAppointReason} onChange={e => setPmAppointReason(e.target.value)} minLength={5} maxLength={500} required placeholder="Dasar keputusan Admin" /></FormField>
            <div className="form-actions"><button className="primary-button" disabled={pmAppointBusy || !selectedProjectId}>{pmAppointBusy ? 'Menyimpan…' : 'Tunjuk Project Manager'}</button></div>
          </form>
        </div>}
        {projectDetail.loading ? <Loading /> : projectDetail.error ? <ErrorState message={projectDetail.error} retry={projectDetail.refresh} /> : <DataTable rows={projectDetail.data?.members || []} columns={[
          { key: 'email', label: 'Pengguna', render: r => <div className="primary-cell"><strong>{r.email || '—'}</strong><small>{r.name || shortId(r.user_id)}</small></div> },
          { key: 'role_assignments', label: 'Role assignments', render: r => <div className="stacked-cell">{(r.role_assignments || []).length ? (r.role_assignments || []).map((a: AnyRecord) => {
            const expired = !!a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now();
            const active = a.isActive === true && !a.revokedAt && !expired && r.is_active === true && !r.deactivated_at;
            return <div key={a.id} className="inline-actions"><span>{a.roleName || a.roleCode} <StatusPill value={active ? 'active' : a.revokedAt ? 'revoked' : expired ? 'expired' : 'inactive'} /></span>{active && (a.roleCode === "pm" ? canPlatformAdmin : canManageProjectRoles) && <ActionButton variant="secondary" disabled={membershipBusyId === String(r.id)} onClick={() => revokeRoleAssignment(r, a)}>Nonaktifkan role</ActionButton>}</div>;
          }) : <span className="muted">Belum ada role</span>}</div> },
          { key: 'is_active', label: 'Status membership', render: r => <StatusPill value={r.is_active && !r.deactivated_at && (!r.expires_at || new Date(r.expires_at).getTime() > Date.now()) ? 'active' : 'inactive'} /> },
          { key: 'action', label: 'Membership', render: r => canManageMemberships ? <ActionButton variant="secondary" disabled={membershipBusyId === String(r.id)} onClick={() => {
            const currentlyActive = r.is_active && !r.deactivated_at && (!r.expires_at || new Date(r.expires_at).getTime() > Date.now());
            updateMembership(r, currentlyActive
              ? { isActive: false }
              : { isActive: true, ...(r.expires_at && new Date(r.expires_at).getTime() <= Date.now() ? { expiresAt: null } : {}) });
          }}>{membershipBusyId === String(r.id) ? 'Memproses…' : r.is_active && !r.deactivated_at && (!r.expires_at || new Date(r.expires_at).getTime() > Date.now()) ? 'Nonaktifkan membership' : 'Aktifkan membership'}</ActionButton> : <span className="muted">—</span> }
        ]} emptyTitle="Belum ada anggota" emptyText="Belum ada keanggotaan untuk proyek ini." />}
      </>}
    </Card>
    {canPlatformAdmin && <>
    <Card><PanelHeading title="Role katalog" description="Role katalog global bukan pengganti project role yang melekat pada membership." />{roles.loading ? <Loading /> : roles.error ? <ErrorState message={roles.error} retry={roles.refresh} /> : <DataTable rows={roles.data?.roles || []} columns={[{ key: 'name', label: 'Role', render: r => <strong>{r.name}</strong> }, { key: 'description', label: 'Deskripsi' }, { key: 'is_active', label: 'Status', render: r => <StatusPill value={r.is_active ? 'active' : 'inactive'} /> }]} />}</Card>
    <Card><PanelHeading title="Permission katalog" description="Kunci permission yang dapat dipakai oleh role dan policy." />{roles.loading ? <Loading /> : roles.error ? <ErrorState message={roles.error} retry={roles.refresh} /> : <DataTable rows={roles.data?.permissions || []} columns={[{ key: 'code', label: 'Code', render: r => <span className="mono">{String(r.code || '')}</span> }, { key: 'name', label: 'Permission' }, { key: 'description', label: 'Keterangan' }]} />}</Card>
    </>}
  </>;
}
function ForgotPasswordPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) { onNotice('error', 'Email wajib diisi.'); return; }
    setBusy(true);
    try {
      const res: any = await authClient.requestPasswordReset({ email: normalized, redirectTo: `${window.location.origin}/reset-password` });
      if (res?.error) throw new Error(res.error.message || 'Permintaan reset password gagal.');
      onNotice('success', res?.data?.message || 'Jika email terdaftar, instruksi reset password telah dikirim.');
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Permintaan reset password gagal.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="login-screen">
    <div className="login-form-side" style={{ gridColumn: '1 / -1' }}>
      <form className="login-card" onSubmit={submit}>
        <div className="login-kicker">PASSWORD RECOVERY</div>
        <h2>Lupa password</h2>
        <p className="muted">Masukkan email akun PKE. Sistem akan mengirim instruksi reset jika akun terdaftar.</p>
        
        <FormField label="Email"><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="nama@perusahaan.com" /></FormField>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => navigate('/login')}>Kembali ke login</button><button className="primary-button" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim instruksi'}</button></div>
      </form>
    </div>
  </div>;
}

function ResetPasswordPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) { onNotice('error', 'Token reset tidak ditemukan. Buka tautan dari email reset.'); return; }
    if (password.length < PASSWORD_MIN_LENGTH) { onNotice('error', `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`); return; }
    if (password.length > PASSWORD_MAX_LENGTH) { onNotice('error', `Password maksimal ${PASSWORD_MAX_LENGTH} karakter.`); return; }
    if (password !== confirm) { onNotice('error', 'Konfirmasi password tidak cocok.'); return; }
    setBusy(true);
    try {
      const res: any = await authClient.resetPassword({ newPassword: password, token });
      if (res?.error) throw new Error(res.error.message || 'Reset password gagal.');
      onNotice('success', 'Password berhasil diubah. Silakan masuk kembali.');
      navigate('/login');
    } catch (e) {
      onNotice('error', e instanceof Error ? e.message : 'Reset password gagal.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="login-screen">
    <div className="login-form-side" style={{ gridColumn: '1 / -1' }}>
      <form className="login-card" onSubmit={submit}>
        <div className="login-kicker">RESET PASSWORD</div>
        <h2>Atur password baru</h2>
        <p className="muted">Password minimal {PASSWORD_MIN_LENGTH} karakter, maksimal {PASSWORD_MAX_LENGTH} karakter.</p>
        {!token && <div className="identity-error">Token reset tidak ditemukan atau tidak valid. Buka tautan dari email reset.</div>}
        
        <FormField label="Password baru"><div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} placeholder="Minimal 8 karakter" /><button type="button" className="icon-button" onClick={() => setShowPassword(v => !v)} aria-label="Tampilkan/sembunyikan password">{showPassword ? 'Sembunyikan' : 'Tampilkan'}</button></div></FormField>
        <FormField label="Konfirmasi password"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} placeholder="Ulangi password" /></FormField>
        {password && confirm && password !== confirm && <p className="muted">Konfirmasi password belum cocok.</p>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => navigate('/login')}>Kembali ke login</button><button className="primary-button" disabled={busy || !token}>{busy ? 'Menyimpan…' : 'Simpan password baru'}</button></div>
      </form>
    </div>
  </div>;
}
function ProjectDetailPage({ activeUser, onNotice }: { activeUser?: AnyRecord; onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detail = useLoad<any>(() => id ? get('/projects/' + id + '/detail') : Promise.resolve({}), [id]);
  return <div>
    <p>Detail proyek ID: {id}</p>
    {detail.loading ? <Loading /> : detail.error ? <ErrorState message={detail.error} retry={detail.refresh} /> : <div>
      <h2>{detail.data?.project?.name || '—'}</h2>
      <p>Status: {detail.data?.project?.status || '—'}</p>
      <p>Target: {detail.data?.project?.target_quantity || 0} {detail.data?.project?.settlement_unit || 'MT'}</p>
      <button onClick={() => navigate('/projects')}><ArrowLeft size={16} /> Kembali</button>
      <div className="form-actions">{hasProjectPermission("project.update", activeUser) && <ActionButton onClick={() => navigate("/projects/" + id + "/edit")}>Edit Project</ActionButton>}{hasProjectPermission("project.configuration.manage", activeUser) && <ActionButton variant="secondary" onClick={() => navigate("/projects/" + id + "/configuration")}>Konfigurasi</ActionButton>}{hasAnyProjectPermission(["project.members.view", "project.members.manage"], activeUser) && <ActionButton variant="secondary" onClick={() => navigate("/projects/" + id + "/members")}>Anggota</ActionButton>}{hasProjectPermission("project.roles.manage", activeUser) && <ActionButton variant="secondary" onClick={() => navigate("/projects/" + id + "/roles")}>Role</ActionButton>}</div>
    </div>}
  </div>;
};

// ============================================
// Project Roles Page
// ============================================
function ProjectRolesPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const roles = useLoad<{ roles?: AnyRecord[] }>(() => id ? get(`/projects/${id}/roles`) : Promise.resolve({}), [id]);
  return <>
    <PageTitle eyebrow="PROJECT ROLES" title="Role proyek" subtitle="Role RBAC yang ditetapkan pada proyek ini." actions={<ActionButton variant="secondary" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /> Kembali</ActionButton>} />
    {roles.loading ? <Loading /> : roles.error ? <ErrorState message={roles.error} retry={roles.refresh} /> : <Card><DataTable rows={roles.data?.roles || []} columns={[{ key: 'role_code', label: 'Kode', render: r => <strong>{r.role_code}</strong> }, { key: 'name', label: 'Nama' }, { key: 'description', label: 'Deskripsi' }, { key: 'is_active', label: 'Status', render: r => <StatusPill value={r.is_active ? 'active' : 'inactive'} /> }]} /></Card>}
  </>;
}

// ============================================
// Project Members Page
// ============================================
function ProjectMembersPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const members = useLoad<{ members?: AnyRecord[] }>(() => id ? get(`/projects/${id}/members`) : Promise.resolve({}), [id]);
  return <>
    <PageTitle eyebrow="PROJECT MEMBERS" title="Anggota proyek" subtitle="Anggota yang terdaftar pada proyek ini." actions={<ActionButton variant="secondary" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /> Kembali</ActionButton>} />
    {members.loading ? <Loading /> : members.error ? <ErrorState message={members.error} retry={members.refresh} /> : <Card><DataTable rows={members.data?.members || []} columns={[
      { key: 'name', label: 'Nama', render: r => <strong>{r.name || r.email}</strong> },
      { key: 'email', label: 'Email' },
      { key: 'role_assignments', label: 'Role', render: r => (r.role_assignments || []).filter((a: AnyRecord) => a.isActive && !a.revokedAt && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())).map((a: AnyRecord) => a.roleCode).join(', ') || '—' },
      { key: 'is_active', label: 'Membership', render: r => <StatusPill value={r.is_active ? 'active' : 'inactive'} /> }
    ]} /></Card>}
  </>;
}

// ============================================
// Project Edit Page
// ============================================
function ProjectEditPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const detail = useLoad<{ project?: AnyRecord }>(() => id ? get(`/projects/${id}/detail`) : Promise.resolve({}), [id]);
  const [form, setForm] = useState({ name: '', description: '', status: 'draft', settlementUnit: 'MT', targetQuantity: '', exportCountryCode: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (detail.data?.project && !form.name) setForm({ name: detail.data.project.name || '', description: detail.data.project.description || '', status: detail.data.project.status || 'draft', settlementUnit: detail.data.project.settlement_unit || 'MT', targetQuantity: String(detail.data.project.target_quantity || ''), exportCountryCode: detail.data.project.export_country_code || '' }); }, [detail.data]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await patch(`/projects/${id}`, { ...form, targetQuantity: Number(form.targetQuantity) });
      onNotice('success', 'Proyek berhasil diperbarui.');
      navigate(`/projects/${id}`);
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal memperbarui proyek.'); }
    finally { setBusy(false); }
  };
  return <>
    <PageTitle eyebrow="EDIT PROJECT" title="Ubah proyek" subtitle="Ubah informasi proyek. Kontrak dan buyer tidak dihapus saat proyek diubah." actions={<ActionButton variant="secondary" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /> Kembali</ActionButton>} />
    <Card className="form-panel"><PanelHeading title="Informasi proyek" description="Simpan perubahan sebagai draft." />
      <form className="form-grid" onSubmit={save}>
        <FormField label="Nama proyek"><input value={form.name} onChange={e => setForm((v: any) => ({ ...v, name: e.target.value }))} required placeholder="Contoh: PKE China Cycle 01" /></FormField>
        <FormField label="Status"><select value={form.status} onChange={e => setForm((v: any) => ({ ...v, status: e.target.value }))}><option value="draft">Draft</option><option value="active">Active</option></select></FormField>
        <FormField label="Target kuantitas"><input type="number" min="0.01" step="0.01" value={form.targetQuantity} onChange={e => setForm((v: any) => ({ ...v, targetQuantity: e.target.value }))} required /></FormField>
        <FormField label="Satuan settlement"><select value={form.settlementUnit} onChange={e => setForm((v: any) => ({ ...v, settlementUnit: e.target.value }))}><option>MT</option><option>Ton</option><option>Shipment</option><option>Tranche</option></select></FormField>
        <FormField label="Kode negara tujuan (opsional)"><input value={form.exportCountryCode} onChange={e => setForm((v: any) => ({ ...v, exportCountryCode: e.target.value }))} maxLength={2} placeholder="Contoh: CN" /></FormField>
        <FormField label="Deskripsi" wide><textarea rows={2} value={form.description} onChange={e => setForm((v: any) => ({ ...v, description: e.target.value }))} /></FormField>
        <div className="form-actions"><ActionButton variant="secondary" onClick={() => navigate(`/projects/${id}`)}>Batal</ActionButton><button className="primary-button">{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button></div>
      </form>
    </Card>
  </>;
};

// ============================================
// Project Configuration Page (module configuration engine)
// ============================================
function ProjectConfigurationPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profile = useLoad<{ configuration?: AnyRecord; configuration_version?: number }>(() => id ? get(`/projects/${id}/operating-profile`) : Promise.resolve({}), [id]);
  const readiness = useLoad<AnyRecord[]>(() => id ? get(`/projects/${id}/module-readiness`).then((r: any) => r.readiness || []) : Promise.resolve([]), [id]);
  const MODULES: { key: string; label: string; desc: string }[] = [
    { key: 'product_specs', label: 'Product Specifications', desc: 'Spesifikasi produk proyek.' },
    { key: 'documents', label: 'Documents', desc: 'Manajemen dokumen dan berkas.' },
    { key: 'compliance', label: 'Compliance', desc: 'Pemeriksaan kepatuhan ekspor.' },
    { key: 'workflow', label: 'Workflow', desc: 'Alur kerja dan persetujuan.' },
    { key: 'approvals', label: 'Approvals', desc: 'Manajemen persetujuan dokumen.' },
    { key: 'notifications', label: 'Notifications', desc: 'Notifikasi internal proyek.' },
    { key: 'pks', label: 'PKS', desc: 'Pusat pengolahan sawit.' },
    { key: 'supplier', label: 'Supplier', desc: 'Partisipasi supplier.' },
    { key: 'procurement', label: 'Procurement', desc: 'Pengadaan barang dan jasa.' },
    { key: 'inventory', label: 'Inventory', desc: 'Manajemen persediaan.' },
    { key: 'trucking', label: 'Trucking', desc: 'Angkutan darat.' },
    { key: 'warehouse', label: 'Warehouse', desc: 'Gudang dan penyimpanan.' },
    { key: 'port_operations', label: 'Port Operations', desc: 'Operasi pelabuhan.' },
    { key: 'loading', label: 'Loading', desc: 'Pemuatan kapal.' },
    { key: 'vessel', label: 'Vessel', desc: 'Manajemen kapal.' },
    { key: 'voyage', label: 'Voyage', desc: 'Perjalanan pelayaran.' },
    { key: 'shipment', label: 'Shipment', desc: 'Pengiriman barang.' },
    { key: 'tracking', label: 'Tracking', desc: 'Pelacakan pengiriman.' },
    { key: 'finance', label: 'Finance', desc: 'Keuangan proyek.' },
    { key: 'accounting', label: 'Accounting', desc: 'Akuntansi dan buku besar.' },
    { key: 'fx', label: 'FX', desc: 'Valuta asing.' },
    { key: 'financing', label: 'Financing', desc: 'Pembiayaan.' },
    { key: 'reporting', label: 'Reporting', desc: 'Laporan proyek.' },
    { key: 'visual_reporting', label: 'Visual Reporting', desc: 'Laporan visual.' }
  ];
  const DEPS: Record<string, string> = { procurement: 'pks', inventory: 'pks', trucking: 'logistics_mode', warehouse: 'inventory', port_operations: 'logistics_mode', loading: 'warehouse', vessel: 'port_operations', voyage: 'vessel', shipment: 'loading', tracking: 'shipment', finance: 'procurement', accounting: 'finance', fx: 'finance', financing: 'finance', reporting: 'documents', visual_reporting: 'reporting', workflow: 'documents', approvals: 'workflow' };
  const enabled = new Set(Object.entries(profile.data?.configuration?.modules || {}).filter(([_, v]: any) => v.enabled).map(([k]) => k));
  const isReady = (key: string) => readiness.data?.find((r: any) => r.module_name === key)?.readiness === 'ready';
  const toggle = async (key: string) => {
    const next = !enabled.has(key);
    const config = JSON.parse(JSON.stringify(profile.data?.configuration || { schema_version: 1, modules: {} }));
    config.modules[key] = { enabled: next };
    try {
      await patch(`/projects/${id}/operating-profile`, { configuration: config });
      onNotice('success', `Modul ${key} ${next ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal mengubah konfigurasi modul.'); }
  };
  return <>
    <PageTitle eyebrow="PROJECT CONFIGURATION" title="Konfigurasi modul" subtitle="Aktifkan/nonaktifkan modul per proyek. Beberapa modul bergantung pada modul lain." actions={<ActionButton variant="secondary" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /> Kembali</ActionButton>} />
    <div className="module-grid">
      {MODULES.map(m => {
        const on = enabled.has(m.key);
        const ready = isReady(m.key);
        const dep = DEPS[m.key];
        const blocked = !!dep && !enabled.has(dep);
        return <div className={`module-card ${blocked ? 'blocked' : ''}`} key={m.key}>
          <div className="module-head"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={on} disabled={blocked} onChange={() => toggle(m.key)} /><strong>{m.label}</strong>{dep && !blocked ? <span style={{ fontSize: '10px', color: '#758493' }}> · perlu {dep}</span> : null}</label><span className={`readiness-badge ${blocked ? 'blocked' : (ready ? 'ready' : 'disabled')}`}>{blocked ? 'blocked' : (ready ? 'ready' : 'disabled')}</span></div>
          <div className="module-body">{m.desc}</div>
        </div>;
      })}
    </div>
  </>;
};

// ============================================
// Project Wizard Page (9-step setup wizard)
// ============================================

function ProjectWizardPage({ onNotice }: { onNotice: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const programs = useLoad<{ contractPrograms?: AnyRecord[] }>(() => get('/contract-programs'), []);
  const [form, setForm] = useState<any>({ contractProgramId: '', createContractProgram: null as any, buyerId: '', contractId: '', name: '', targetQuantity: '', settlementUnit: 'MT', exportCountryCode: '', description: '' });
  const steps = [
    { n: 1, label: 'Identitas & kontrak' }, { n: 2, label: 'Produk & spesifikasi' }, { n: 3, label: 'Sumber pasokan' },
    { n: 4, label: 'Logistik & pelabuhan' }, { n: 5, label: 'Jadwal target' }, { n: 6, label: 'Dokumen & compliance' },
    { n: 7, label: 'Akses & notifikasi' }, { n: 8, label: 'Operasional' }, { n: 9, label: 'Review & aktivasi' },
  ];
  const saveDraft = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (step === 1) {
        await post('/projects', { ...form, targetQuantity: Number(form.targetQuantity) });
        onNotice('success', 'Draft proyek disimpan.');
        setStep(2);
      } else {
        onNotice('error', 'Penyimpanan draft untuk langkah ini belum tersedia pada backend. Lengkapi detail lanjutan setelah proyek dibuat atau saat endpoint draft per-langkah tersedia.');
      }
    } catch (e) { onNotice('error', e instanceof Error ? e.message : 'Gagal menyimpan draft.'); }
    finally { setBusy(false); }
  };
  const prev = () => setStep(s => Math.max(1, s - 1));
  const next = () => { if (step < 9) setStep(s => s + 1); };
  return <>
    <PageTitle eyebrow="PROJECT WIZARD" title="Buat proyek baru" subtitle={"Langkah " + step + " dari 9 - " + (steps.find(s => s.n === step)?.label || "")} actions={<div className="page-actions"><ActionButton variant="secondary" onClick={() => navigate('/projects')}><ArrowLeft size={16} /> Kembali ke daftar</ActionButton></div>} />
    <div className="wizard-steps">{steps.map(s => <div className={s.n <= step ? 'wizard-step active' : 'wizard-step'} key={s.n}><span className="step-num">{s.n}</span><span className="step-label">{s.label}</span></div>)}</div>
    <Card className="form-panel"><PanelHeading title={steps.find(s => s.n === step)?.label || ''} description={`Simpan draft pada setiap langkah. Proyek awalnya berstatus draft, belum aktif.`} />
      {step === 1 && <form className="form-grid" onSubmit={saveDraft}>
        {!programs.data?.contractPrograms?.length ? <div className="inline-warning"><CircleAlert size={17} /> Buat program kontrak terlebih dahulu pada menu Program Kontrak, atau aktifkan opsi buat baru di bawah.</div> : null}
        <FormField label="Gunakan program kontrak existing"><select value={form.contractProgramId} onChange={e => setForm((v: any) => ({ ...v, contractProgramId: e.target.value, createContractProgram: e.target.value ? null : form.createContractProgram }))}><option value="">— Pilih program kontrak —</option>{(programs.data?.contractPrograms || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
        <FormField label="Atau buat program kontrak baru"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!form.createContractProgram} onChange={e => setForm((v: any) => ({ ...v, createContractProgram: e.target.checked ? {} : null, contractProgramId: e.target.checked ? '' : v.contractProgramId }))} /> Buat program baru saat project dibuat</label></FormField>
        {form.createContractProgram && <>
          <FormField label="Nama program baru"><input value={form.createContractProgram.name || ''} onChange={e => setForm((v: any) => ({ ...v, createContractProgram: { ...v.createContractProgram!, name: e.target.value } }))} placeholder="Contoh: Program China 01" /></FormField>
          <FormField label="Cadence"><select value={form.createContractProgram.cadence || 'scheduled'} onChange={e => setForm((v: any) => ({ ...v, createContractProgram: { ...v.createContractProgram!, cadence: e.target.value } }))}><option value="scheduled">scheduled</option><option value="monthly">monthly</option><option value="quarterly">quarterly</option></select></FormField>
          <FormField label="Buyer ID (opsional)"><input value={form.buyerId} onChange={e => setForm((v: any) => ({ ...v, buyerId: e.target.value }))} placeholder="UUID buyer" /></FormField>
          <FormField label="Contract ID (opsional)"><input value={form.contractId} onChange={e => setForm((v: any) => ({ ...v, contractId: e.target.value }))} placeholder="UUID kontrak" /></FormField>
        </>}
        <FormField label="Nama proyek"><input value={form.name} onChange={e => setForm((v: any) => ({ ...v, name: e.target.value }))} required placeholder="Contoh: PKE China Cycle 01" /></FormField>
        <FormField label="Target kuantitas"><input type="number" min="0.01" step="0.01" value={form.targetQuantity} onChange={e => setForm((v: any) => ({ ...v, targetQuantity: e.target.value }))} required /></FormField>
        <FormField label="Satuan settlement"><select value={form.settlementUnit} onChange={e => setForm((v: any) => ({ ...v, settlementUnit: e.target.value }))}><option>MT</option><option>Ton</option><option>Shipment</option><option>Tranche</option></select></FormField>
        <FormField label="Kode negara tujuan (opsional)"><input value={form.exportCountryCode} onChange={e => setForm((v: any) => ({ ...v, exportCountryCode: e.target.value }))} maxLength={2} placeholder="Contoh: CN" /></FormField>
        <FormField label="Deskripsi" wide><textarea rows={2} value={form.description} onChange={e => setForm((v: any) => ({ ...v, description: e.target.value }))} /></FormField>
        <div className="form-actions"><ActionButton variant="secondary" disabled={step === 1} onClick={prev}><ArrowLeft size={16} /> Sebelumnya</ActionButton><button className="primary-button" disabled={busy}>{busy ? 'Menyimpan…' : (step < 9 ? 'Lanjutkan' : 'Buat proyek dan aktifkan')}</button></div>
      </form>}
      {step > 1 && <div className="inline-warning"><CircleAlert size={17} /> Langkah {step} ({steps.find(s => s.n === step)?.label}) belum memiliki endpoint penyimpanan draft terintegrasi. Langkah 1 (pembuatan proyek) sudah tersimpan; detail lanjutan harus diisi melalui modul terkait setelah proyek tersedia.</div>}
      {step > 1 && <div className="form-actions" style={{ marginTop: 16 }}><ActionButton variant="secondary" onClick={prev}><ArrowLeft size={16} /> Sebelumnya</ActionButton></div>}
    </Card>
  </>;
}

export default App;
