import { createInternalNeonAuth } from '@neondatabase/neon-js/auth';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';
import type { ReactBetterAuthClient } from '@neondatabase/neon-js/auth';

let neonAuth: ReturnType<typeof createInternalNeonAuth> | null = null;
let neonClient: ReactBetterAuthClient | null = null;
function getNeon() {
  if (!neonAuth) {
    const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
    if (!authUrl) throw new Error('VITE_NEON_AUTH_URL belum diatur pada frontend/.env.local.');
    neonAuth = createInternalNeonAuth(authUrl, { adapter: BetterAuthReactAdapter() });
    neonClient = neonAuth.adapter as unknown as ReactBetterAuthClient;
  }
  return { neonAuth: neonAuth!, neonClient: neonClient! };
}

function safeAuthMessage(err: any, fallback: string) {
  const msg = err?.message || err?.error?.message;
  if (typeof msg !== 'string') return fallback;
  const lower = msg.toLowerCase();
  if (lower.includes('invalid') || lower.includes('credential') || lower.includes('password') || lower.includes('user not found')) {
    return 'Email atau password tidak sesuai, atau akun belum dapat digunakan.';
  }
  if (lower.includes('verify') || lower.includes('verification')) {
    return 'Akun memerlukan verifikasi email sebelum dapat masuk.';
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
  }
  return fallback;
}

export const authClient = {
  useSession: () => {
    const { neonClient } = getNeon();
    return neonClient.useSession();
  },
  signIn: {
    email: async (args: { email: string; password: string }) => {
      const { neonClient } = getNeon();
      const email = String(args.email || '').trim().toLowerCase();
      const password = String(args.password ?? '');
      try {
        return await neonClient.signIn.email({ email, password });
      } catch (e: any) {
        return { data: null, error: { message: safeAuthMessage(e, 'Login tidak berhasil. Periksa kredensial Anda.') } };
      }
    }
  },
  signOut: async () => {
    const { neonClient } = getNeon();
    return neonClient.signOut();
  },
  requestPasswordReset: async (args: { email: string; redirectTo?: string }) => {
    const { neonClient } = getNeon();
    const email = String(args.email || '').trim().toLowerCase();
    const client: any = neonClient as any;
    try {
      if (typeof client.requestPasswordReset === 'function') return await client.requestPasswordReset({ email, redirectTo: args.redirectTo });
      if (typeof client.forgetPassword === 'function') return await client.forgetPassword({ email, redirectTo: args.redirectTo });
      return { data: null, error: { message: 'Fitur reset password tidak tersedia pada klien autentikasi saat ini.' } };
    } catch (e: any) {
      return { data: null, error: { message: safeAuthMessage(e, 'Permintaan reset password tidak dapat diproses saat ini.') } };
    }
  },
  resetPassword: async (args: { newPassword: string; token?: string }) => {
    const { neonClient } = getNeon();
    const client: any = neonClient as any;
    try {
      if (typeof client.resetPassword === 'function') return await client.resetPassword({ newPassword: args.newPassword, token: args.token });
      return { data: null, error: { message: 'Fitur reset password tidak tersedia pada klien autentikasi saat ini.' } };
    } catch (e: any) {
      return { data: null, error: { message: safeAuthMessage(e, 'Reset password tidak dapat diproses. Token mungkin tidak valid atau kedaluwarsa.') } };
    }
  }
};

export async function getBearerToken(): Promise<string> {
  const { neonAuth } = getNeon();
  const token = await neonAuth.getJWTToken();
  if (!token || typeof token !== 'string') {
    throw new Error('Sesi autentikasi tidak tersedia. Silakan masuk kembali.');
  }
  return token;
}
