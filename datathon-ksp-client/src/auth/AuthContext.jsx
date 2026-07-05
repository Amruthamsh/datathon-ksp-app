import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "ksp_auth_token";
const OFFICER_KEY = "ksp_auth_officer";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [officer, setOfficer] = useState(() => {
    const storedOfficer = localStorage.getItem(OFFICER_KEY);
    return storedOfficer ? JSON.parse(storedOfficer) : null;
  });
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Session invalid");
        }

        const data = await response.json();
        if (cancelled) return;

        setOfficer(data.officer);
        localStorage.setItem(OFFICER_KEY, JSON.stringify(data.officer));
      } catch {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(OFFICER_KEY);
        setToken(null);
        setOfficer(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    validateSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      officer,
      loading,
      isAuthenticated: Boolean(token && officer),
      signIn: (nextToken, nextOfficer) => {
        setToken(nextToken);
        setOfficer(nextOfficer);
        localStorage.setItem(TOKEN_KEY, nextToken);
        localStorage.setItem(OFFICER_KEY, JSON.stringify(nextOfficer));
      },
      signOut: () => {
        setToken(null);
        setOfficer(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(OFFICER_KEY);
      },
    }),
    [token, officer, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
