import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

async function getErrorMessage(response, fallbackMessage) {
  try {
    const data = await response.json();
    return data.detail || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export default function Login() {
  const [form, setForm] = useState({
    kgid: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kgid: form.kgid.toUpperCase(),
          password: form.password,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, t("auth.unableToSignIn")),
        );
      }

      const data = await response.json();
      signIn(data.access_token, data.officer);
      navigate("/", { replace: true });
    } catch (err) {
      const message = err?.message || t("auth.unableToSignIn");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-gray-500">
            {t("auth.loginTitle")}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">{t("auth.signIn")}</h1>
          <p className="mt-2 text-sm text-gray-400">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400">
              {t("auth.kgid")}
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 font-mono uppercase text-white focus:border-blue-500 focus:outline-none"
              placeholder={t("auth.kgidPlaceholder")}
              value={form.kgid}
              onChange={set("kgid")}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400">
              {t("auth.password")}
            </label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
              value={form.password}
              onChange={set("password")}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={!form.kgid || !form.password || loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          {t("auth.needAccount")}{" "}
          <Link to="/signup" className="text-blue-400 hover:text-blue-300">
            {t("auth.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
