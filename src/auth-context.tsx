import React, { createContext, useContext, useEffect, useState } from "react";
import { createAuthClient } from "@neondatabase/auth";

export interface UserSession {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isAdmin: boolean;
  mfaVerified: boolean;
  projectMemberships: string[];
  partnerScope?: "buyer" | "supplier" | "transporter" | "warehouse" | null;
}

export interface AuthContextValue {
  user: UserSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
if (!authUrl) {
  throw new Error("VITE_NEON_AUTH_URL is required for the Neon Auth client.");
}

// Neon Auth owns the password/session lifecycle. The PKE API receives only a
// short-lived JWT in Authorization: Bearer; no password or session token is
// copied into the PKE database or browser localStorage.
const authClient = createAuthClient(authUrl);

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

async function fetchPkeUser(): Promise<UserSession | null> {
  const tokenResult = await authClient.token();
  if (tokenResult.error || !tokenResult.data?.token) return null;
  const token = tokenResult.data.token;

  const response = await fetch("/api/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (!payload?.user?.id || !payload?.user?.email) return null;
  return {
    id: payload.user.id,
    email: payload.user.email,
    name: payload.user.name ?? null,
    role: payload.user.role,
    isAdmin: payload.user.isAdmin === true,
    mfaVerified: payload.user.mfaVerified === true,
    projectMemberships: payload.user.projectMemberships ?? [],
    partnerScope: payload.user.partnerScope ?? null,
  };
}

export default AuthContext;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchPkeUser()
      .then((session) => { if (active) setUser(session); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function login(email: string, password: string) {
    try {
      const signIn = await authClient.signIn.email({ email, password });
      if (signIn.error) return { success: false, error: signIn.error.message || "Sign-in failed." };

      const pkeUser = await fetchPkeUser();
      if (!pkeUser) {
        await authClient.signOut();
        return { success: false, error: "Akun belum dihubungkan ke pengguna PKE yang aktif. Hubungi administrator." };
      }
      setUser(pkeUser);
      return { success: true };
    } catch {
      return { success: false, error: "Login tidak berhasil. Periksa koneksi dan status akun." };
    }
  }

  async function logout() {
    try {
      await authClient.signOut();
    } finally {
      setUser(null);
    }
  }

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.isAdmin ?? false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
