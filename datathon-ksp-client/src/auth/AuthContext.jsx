import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "ksp_auth_token";
const OFFICER_KEY = "ksp_auth_officer";
const TOKEN_TTL_MS = 480 * 60 * 1000; // 8 hours — must match backend TOKEN_EXPIRE_MINUTES

// itsdangerous URL-safe timed token format: <b64-payload>.<timestamp-seconds>.<signature>
// The timestamp segment is seconds since epoch — we use it to check expiry client-side
// so we never hit the network just to validate a stored session on page reload.
function isTokenExpired(token) {
  try {
    const ts = parseInt(token.split(".")[1], 10);
    if (!ts || isNaN(ts)) return false;
    return Date.now() > ts * 1000 + TOKEN_TTL_MS;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(OFFICER_KEY);
      return null;
    }
    return stored;
  });

  const [officer, setOfficer] = useState(() => {
    const stored = localStorage.getItem(OFFICER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

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
