import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, LogOut, KeyRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import logo from "../assets/Seal_of_Karnataka.svg";
import profile from "../assets/profile.svg";
import LanguageSelector from "./LanguageSelector";
import { useAuth } from "../auth/AuthContext";
import { changePassword } from "../api/auth";

const Header = ({ hideSearch = true }) => {
  const { officer, token, signOut } = useAuth();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openPasswordModal() {
    setPwForm({ current: "", next: "", confirm: "" });
    setPwError("");
    setMenuOpen(false);
    setPwOpen(true);
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwError("");

    if (pwForm.next !== pwForm.confirm) {
      setPwError(t("auth.passwordsDoNotMatch"));
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError(t("auth.passwordTooShort"));
      return;
    }
    if (pwForm.next === pwForm.current) {
      setPwError(t("auth.passwordMustDiffer"));
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(token, pwForm.current, pwForm.next);
      toast.success(t("auth.passwordUpdated"));
      setPwOpen(false);
    } catch (err) {
      const message = err?.message || t("auth.unableToUpdatePassword");
      setPwError(message);
      toast.error(message);
    } finally {
      setPwLoading(false);
    }
  }

  const pwSet = (key) => (e) =>
    setPwForm((cur) => ({ ...cur, [key]: e.target.value }));

  return (
    <header className="h-12 border-b border-line bg-surface flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <img src={logo} alt={t("header.logoAlt")} className="h-8 w-8" />
        <h1 className="text-lg font-semibold tracking-tight text-brand">
          {t("app.title")}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {!hideSearch && (
          <div className="relative w-96">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="text"
              placeholder={t("header.searchPlaceholder")}
              className="
                w-full
                rounded-control
                border
                border-line-strong
                bg-surface-subtle
                py-2
                pl-10
                pr-14
                text-sm
                placeholder:text-ink-muted
                focus:border-primary
                focus:bg-surface
                focus:outline-none
                focus:ring-2
                focus:ring-primary/15
                transition
              "
            />
          </div>
        )}

        <LanguageSelector />

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-control border border-line bg-surface py-1.5 pl-1.5 pr-3 text-slate-700 hover:bg-surface-subtle transition cursor-pointer"
          >
            <img
              src={profile}
              alt={t("header.profileAlt")}
              className="h-7 w-7 rounded-full border border-line"
            />
            <span className="text-sm font-medium text-ink">
              {officer?.full_name ?? t("header.unknownUser")}
            </span>
            <ChevronDown
              size={14}
              className={`text-ink-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-popover border border-line bg-surface shadow-lg">
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-semibold text-ink">
                  {officer?.full_name ?? t("header.unknownUser")}
                </p>
                {officer?.rank && (
                  <p className="mt-0.5 text-xs text-ink-secondary">
                    {officer.rank}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={openPasswordModal}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-subtle transition cursor-pointer"
              >
                <KeyRound size={15} />
                {t("auth.changePassword")}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-critical hover:bg-brand-soft transition cursor-pointer"
              >
                <LogOut size={15} />
                {t("auth.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>

      {pwOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4"
          onClick={() => !pwLoading && setPwOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("auth.changePassword")}
            className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
                  <KeyRound size={18} className="text-red-700" />
                </div>
                <h2 className="text-base font-semibold text-ink">
                  {t("auth.changePassword")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !pwLoading && setPwOpen(false)}
                className="rounded-md p-1.5 text-ink-muted hover:bg-surface-subtle transition cursor-pointer"
                aria-label={t("auth.close")}
              >
                <X size={16} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-secondary">
                  {t("auth.currentPassword")}
                </label>
                <input
                  type="password"
                  value={pwForm.current}
                  onChange={pwSet("current")}
                  autoComplete="current-password"
                  className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-secondary">
                  {t("auth.newPassword")}
                </label>
                <input
                  type="password"
                  value={pwForm.next}
                  onChange={pwSet("next")}
                  autoComplete="new-password"
                  className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-ink-secondary">
                  {t("auth.confirmPassword")}
                </label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={pwSet("confirm")}
                  autoComplete="new-password"
                  className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition"
                />
              </div>

              {pwError && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {pwError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPwOpen(false)}
                  disabled={pwLoading}
                  className="flex-1 rounded-lg border border-line-strong bg-surface py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:opacity-40 cursor-pointer"
                >
                  {t("auth.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={
                    !pwForm.current || !pwForm.next || !pwForm.confirm || pwLoading
                  }
                  className="flex-1 rounded-lg bg-red-700 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-40 cursor-pointer"
                >
                  {pwLoading ? t("auth.updating") : t("auth.updatePassword")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;