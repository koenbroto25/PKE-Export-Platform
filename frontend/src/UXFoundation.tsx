import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Database, Info, ShieldAlert } from 'lucide-react';

export type UXState = 'available' | 'partial' | 'stale' | 'unavailable' | 'blocked' | 'unknown';

const STATE_LABEL: Record<UXState, string> = {
  available: 'Data tersedia',
  partial: 'Data parsial',
  stale: 'Data stale',
  unavailable: 'Belum terintegrasi',
  blocked: 'Terblokir',
  unknown: 'Belum diverifikasi',
};

export function UXStateBadge({ state, label }: { state: UXState; label?: string }) {
  const icon = state === 'available' ? <CheckCircle2 size={14}/> : state === 'blocked' ? <ShieldAlert size={14}/> : state === 'stale' ? <Clock3 size={14}/> : state === 'unavailable' ? <Database size={14}/> : state === 'unknown' ? <Info size={14}/> : <AlertCircle size={14}/>;
  return <span className={`ux-state-badge ux-state-${state}`}>{icon}{label || STATE_LABEL[state]}</span>;
}

export function UXPanel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`ux-panel ${className}`}><header className="ux-panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}

export function UXMetric({ label, value, detail, state = 'unknown' }: { label: string; value: React.ReactNode; detail?: string; state?: UXState }) {
  return <div className="ux-metric"><span className="ux-metric-label">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}<UXStateBadge state={state}/></div>;
}

export function UXEmpty({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="ux-empty"><Info size={20}/><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function UXError({ title = 'Data tidak dapat diverifikasi', detail, retry }: { title?: string; detail?: string; retry?: () => void }) {
  return <div className="ux-error" role="alert"><AlertCircle size={18}/><div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>{retry && <button type="button" onClick={retry}>Coba lagi</button>}</div>;
}

export function UXFreshness({ value, source }: { value?: string | null; source?: string }) {
  return <div className="ux-freshness"><Clock3 size={13}/><span>{source ? source + ' · ' : ''}Cut-off: {value ? new Date(value).toLocaleString('id-ID') : 'tidak tersedia'}</span></div>;
}


export function UXLoading({ label = 'Memuat data…' }: { label?: string }) { return <div className="ux-loading" role="status"><span className="ux-spinner" aria-hidden="true"/><span>{label}</span></div>; }

export function UXDenied({ title = 'Akses tidak tersedia', detail = 'Permission atau scope Project tidak mengizinkan tindakan ini.' }: { title?: string; detail?: string }) { return <div className="ux-denied" role="status"><ShieldAlert size={18}/><div><strong>{title}</strong><p>{detail}</p></div></div>; }

export function UXConflict({ title = 'Data berubah', detail = 'Data perlu dimuat ulang sebelum melanjutkan.' , refresh }: { title?: string; detail?: string; refresh?: () => void }) { return <div className="ux-conflict" role="alert"><AlertCircle size={18}/><div><strong>{title}</strong><p>{detail}</p></div>{refresh && <button type="button" onClick={refresh}>Muat ulang</button>}</div>; }

export function UXActionLink({ to, label }: { to: string; label: string }) {
  return <Link className="ux-action-link" to={to}>{label}<ArrowRight size={15}/></Link>;
}
