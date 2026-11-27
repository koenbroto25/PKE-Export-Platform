import { getBearerToken as getAuthToken } from './auth-client';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: any;
  constructor(message: string, status: number, code?: string, payload?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload?.error || payload?.message || `Permintaan gagal (${response.status})`, response.status, payload?.code, payload);
  }
  return payload as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export async function postBinary<T>(path: string, body: Blob, contentType: string, customHeaders: Record<string,string> = {}): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(customHeaders);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', contentType);
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    method: 'POST',
    headers,
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload?.error || payload?.message || `Permintaan upload gagal (${response.status})`, response.status, payload?.code, payload);
  }
  return payload as T;
}

export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
