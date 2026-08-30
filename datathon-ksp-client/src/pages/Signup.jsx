import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import logo from "../assets/Seal_of_Karnataka.svg";
import { UserPlus, CheckCircle2 } from "lucide-react";
import { API_BASE } from "../api/config";

function formatErrorDetail(detail) {
  if (!detail) {
    return "";
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => formatErrorDetail(item))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof detail === "object") {
    const fieldName = Array.isArray(detail.loc)
      ? detail.loc[detail.loc.length - 1]
      : null;
    const message = detail.msg || detail.message || detail.error || "";

    if (fieldName && message) {
      return `${String(fieldName).toUpperCase()}: ${message}`;
    }

    return message;
  }

  return String(detail);
}

async function getErrorMessage(response, fallbackMessage) {
  try {
    const data = await response.json();
    return formatErrorDetail(data.detail) || data.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export default function Signup() {
  const [step, setStep] = useState(1);
  const [verifiedOfficer, setVerifiedOfficer] = useState(null);
  const [form, setForm] = useState({
    kgid: "",
    dob: "",
    password: "",
    phone: "",
    email: "",
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

  async function handleVerify() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kgid: form.kgid.toUpperCase(),
          dob: form.dob,
          password: form.password || "temporary-password",
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, t("auth.unableToVerify")),
        );
      }

      const data = await response.json();
      setVerifiedOfficer(data.officer);
      setStep(2);
    } catch (err) {
      const message = err.message || t("auth.unableToVerify");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kgid: form.kgid.toUpperCase(),
          dob: form.dob,
          password: form.password,
          phone: form.phone || null,
          email: form.email || null,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, t("auth.unableToCreate")),
        );
      }

      const signInResponse = await fetch(`${API_BASE}/auth/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kgid: form.kgid.toUpperCase(),
          password: form.password,
        }),
      });

      if (!signInResponse.ok) {
        throw new Error(
          await getErrorMessage(
            signInResponse,
            t("auth.accountCreatedSignInFailed"),
          ),
        );
      }

      const signInData = await signInResponse.json();
      signIn(signInData.access_token, signInData.officer);
      navigate("/", { replace: true });
    } catch (err) {
      const message = err.message || t("auth.unableToCreate");
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
            {t("auth.signupSubtitle")}
          </p>
        </div>

        <div className="relative z-10 pb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-red-200">
            {t("auth.signupTitle")}
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
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                <UserPlus size={18} className="text-red-700" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-red-700">
                  {t("auth.signUp")}
                </h1>
              </div>
            </div>

            {/* Step indicators */}
            <div className="mb-6 flex gap-2">
              {[t("auth.verifyIdentity"), t("auth.setCredentials")].map(
                (label, index) => (
                  <div key={label} className="flex flex-1 items-center gap-2">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                        step > index + 1
                          ? "bg-red-700 text-white"
                          : step === index + 1
                            ? "bg-red-700 text-white"
                            : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {step > index + 1 ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className="hidden text-xs font-medium text-slate-500 sm:inline">
                      {label}
                    </span>
                  </div>
                ),
              )}
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("auth.kgid")}
                  </label>
                  <input
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-mono text-sm uppercase text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                    placeholder={t("auth.kgidPlaceholder")}
                    value={form.kgid}
                    onChange={set("kgid")}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("auth.dob")}
                  </label>
                  <input
                    type="date"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                    value={form.dob}
                    onChange={set("dob")}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleVerify}
                  disabled={!form.kgid || !form.dob || loading}
                  className="w-full rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-40 cursor-pointer"
                >
                  {loading ? t("auth.verifying") : t("auth.verifyIdentity")}
                </button>

                {verifiedOfficer && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                    <CheckCircle2 size={16} />
                    Verified {verifiedOfficer.full_name} ({verifiedOfficer.rank}
                    )
                  </div>
                )}

                <p className="text-center text-sm text-slate-500">
                  {t("auth.alreadyHaveAccount")}{" "}
                  <Link
                    to="/login"
                    className="font-medium text-red-700 hover:text-red-800 transition"
                  >
                    {t("auth.signIn")}
                  </Link>
                </p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("auth.password")}
                  </label>
                  <input
                    type="password"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                    value={form.password}
                    onChange={set("password")}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("auth.phone")}
                  </label>
                  <input
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={set("phone")}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("auth.email")}
                  </label>
                  <input
                    type="email"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                    value={form.email}
                    onChange={set("email")}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => {
                      setStep(1);
                      setError("");
                    }}
                    className="flex-1 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer"
                  >
                    {t("auth.back")}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!form.password || loading}
                    className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-40 cursor-pointer"
                  >
                    {loading ? t("auth.creating") : t("auth.signUp")}
                  </button>
                </div>

                <p className="text-center text-sm text-slate-500">
                  {t("auth.alreadyHaveAccount")}{" "}
                  <Link
                    to="/login"
                    className="font-medium text-red-700 hover:text-red-800 transition"
                  >
                    {t("auth.signIn")}
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
