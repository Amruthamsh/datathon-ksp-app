import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import toast from "react-hot-toast";

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
    console.log("Error response data:", data);
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
      const response = await fetch("/api/auth/verify", {
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
          await getErrorMessage(response, "Unable to verify officer"),
        );
      }

      const data = await response.json();
      setVerifiedOfficer(data.officer);
      setStep(2);
    } catch (err) {
      console.log(err.message);
      const message = err.message || "Unable to verify officer";
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
      const response = await fetch("/api/auth/signup", {
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
          await getErrorMessage(response, "Unable to create account"),
        );
      }

      const signInResponse = await fetch("/api/auth/signin", {
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
            "Account created, but sign in failed",
          ),
        );
      }

      const signInData = await signInResponse.json();
      signIn(signInData.access_token, signInData.officer);
      navigate("/", { replace: true });
    } catch (err) {
      console.log(err.message);
      const message = err.message || "Unable to create account";
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
            Karnataka State Police
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Create Account</h1>
          <p className="mt-2 text-sm text-gray-400">
            Verify your identity first, then set your credentials.
          </p>
        </div>

        <div className="mb-6 flex gap-2">
          {["Verify Identity", "Set Credentials"].map((label, index) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full ${step > index ? "bg-blue-500" : "bg-gray-700"}`}
              aria-label={label}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-400">
                KGID
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 font-mono uppercase text-white focus:border-blue-500 focus:outline-none"
                placeholder="KGIDxxxxxxxx"
                value={form.kgid}
                onChange={set("kgid")}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-400">
                Date of Birth
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                value={form.dob}
                onChange={set("dob")}
              />
            </div>
            <button
              onClick={handleVerify}
              disabled={!form.kgid || !form.dob || loading}
              className="mt-2 w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              {loading ? "Verifying..." : "Verify Identity"}
            </button>
            {verifiedOfficer && (
              <p className="text-sm text-emerald-400">
                Verified {verifiedOfficer.full_name} ({verifiedOfficer.rank})
              </p>
            )}
            <p className="text-center text-sm text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                Sign in
              </Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-400">
                Password
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                value={form.password}
                onChange={set("password")}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-400">
                Phone{" "}
                <span className="normal-case text-gray-600">(optional)</span>
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={set("phone")}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-400">
                Email{" "}
                <span className="normal-case text-gray-600">(optional)</span>
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                value={form.email}
                onChange={set("email")}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="mt-2 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg bg-gray-800 py-3 text-gray-300 transition hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.password || loading}
                className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                {loading ? "Creating..." : "Create Account"}
              </button>
            </div>

            <p className="text-center text-sm text-gray-400">
              Already have an account?{" "}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
