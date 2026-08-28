import React from "react";
import { Search, Bell, BadgeQuestionMarkIcon, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import logo from "../assets/Seal_of_Karnataka.svg";
import profile from "../assets/profile.svg";
import LanguageSelector from "./LanguageSelector";
import { useAuth } from "../auth/AuthContext";

const Header = ({ hideSearch = false }) => {
  const { officer, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        <img src={logo} alt="Logo" className="h-8 w-8" />
        <h1 className="text-xl font-semibold text-red-700">
          {t("app.title")}
        </h1>
      </div>
      <div className="flex items-center gap-6">
        {!hideSearch && (
          <div className="relative w-96">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
            />
            <input
              type="text"
              placeholder={t("header.searchPlaceholder")}
              className="
                w-full
                rounded-xl
                border
                border-slate-300
                bg-slate-50
                py-2
                pl-10
                pr-14
                text-sm
                placeholder:text-slate-400
                focus:border-blue-500
                focus:bg-white
                focus:outline-none
                focus:ring-2
                focus:ring-blue-100
                transition
              "
            />
          </div>
        )}
        <LanguageSelector />
        <Bell size={24} />
        <BadgeQuestionMarkIcon size={24} />
        <p>{officer?.full_name ?? t("header.unknownUser")}</p>
        <img src={profile} alt="Profile" className="h-8 w-8 rounded-full" />
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          <LogOut size={16} />
          {t("auth.signOut")}
        </button>
      </div>
    </header>
  );
};

export default Header;
