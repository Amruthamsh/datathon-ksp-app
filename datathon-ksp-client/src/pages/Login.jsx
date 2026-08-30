import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import logo from "../assets/Seal_of_Karnataka.svg";
import { ShieldCheck } from "lucide-react";
import { API_BASE } from "../api/config";

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
      const response = await fetch(`${API_BASE}/auth/signin`, {
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
    <div className="flex min-h-screen bg-slate-200">
      {/* Left branding panel */}
      <div className="relative hidden w-[440px] shrink-0 overflow-hidden bg-red-700 lg:flex lg:flex-col lg:items-center lg:justify-between">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Top decorative line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-12 text-center">
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-white ring-1 ring-white/20 shadow-lg">
            <img
              src={logo}
              alt="Karnataka State Police"
              className="h-16 w-16"
            />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-yellow-200">
            KSP CrimeLens
          </h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-red-100">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <div className="relative z-10 pb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-red-200">
            {t("auth.loginTitle")}
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only branding */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-100">
              <img
                src={logo}
                alt="Karnataka State Police"
                className="h-10 w-10"
              />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">KSP CrimeLens</h2>
          </div>

          {/* Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                <ShieldCheck size={18} className="text-red-700" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-red-700">
                  {t("auth.signIn")}
                </h1>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("auth.kgid")}
                </label>
                <input
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-mono text-sm uppercase text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                  placeholder={t("auth.kgidPlaceholder")}
                  value={form.kgid}
                  onChange={set("kgid")}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("auth.password")}
                </label>
                <input
                  type="password"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!form.kgid || !form.password || loading}
                className="w-full rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-40 cursor-pointer"
              >
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t("auth.needAccount")}{" "}
            <Link
              to="/signup"
              className="font-medium text-red-700 hover:text-red-800 transition"
            >
              {t("auth.createOne")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
