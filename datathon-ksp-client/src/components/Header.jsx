import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import logo from "../assets/Seal_of_Karnataka.svg";
import profile from "../assets/profile.svg";
import LanguageSelector from "./LanguageSelector";
import { useAuth } from "../auth/AuthContext";

const Header = ({ hideSearch = true }) => {
  const { officer, signOut } = useAuth();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
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

  return (
    <header className="h-12 border-b border-line bg-surface flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <img src={logo} alt="Logo" className="h-8 w-8" />
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
              alt="Profile"
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
    </header>
  );
};

export default Header;