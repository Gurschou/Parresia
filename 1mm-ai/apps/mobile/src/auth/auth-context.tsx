import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserProfile } from "@1mm/shared";
import { apiFetch, getToken, setToken } from "../api/client";

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName?: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on app start.
  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const body = await apiFetch<{ user: UserProfile }>("/api/auth/me");
        setUser(body.user);
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const body = await apiFetch<{ user: UserProfile; token: string }>("/api/auth/login", {
      body: { email, password },
    });
    await setToken(body.token);
    setUser(body.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const body = await apiFetch<{ user: UserProfile; token: string }>("/api/auth/register", {
        body: { email, password, displayName },
      });
      await setToken(body.token);
      setUser(body.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
