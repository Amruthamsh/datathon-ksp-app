import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getMe } from "../api/auth";

const AuthContext = createContext(null);

const TOKEN_KEY = "ksp_auth_token";
const OFFICER_KEY = "ksp_auth_officer";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  const [officer, setOfficer] = useState(() => {
    const stored = localStorage.getItem(OFFICER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  // Step 4: refresh officer from /auth/me so tier/scope/district/unit are
  // present even for sessions created before RBAC (stored officer lacks them).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getMe(token);
        if (!cancelled && fresh) {
          setOfficer((prev) => {
            const merged = { ...(prev || {}), ...fresh };
            localStorage.setItem(OFFICER_KEY, JSON.stringify(merged));
            return merged;
          });
        }
      } catch {
        // Keep stored officer; a 401 here is handled globally via session-expired.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      officer,
      loading: false,
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
    [token, officer],
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
