import { useTranslation } from "react-i18next";

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  function setLang(lng) {
    i18n.changeLanguage(lng);
  }

  return (
    <div className="flex rounded-lg overflow-hidden">
      <button
        onClick={() => setLang("en")}
        className={`px-3 py-1.5 text-sm transition cursor-pointer ${
          lang === "en"
            ? "bg-red-700 text-white"
            : "bg-slate-100 hover:bg-slate-200"
        }`}
      >
        English
      </button>

      <button
        onClick={() => setLang("kn")}
        className={`px-3 py-1.5 text-sm transition cursor-pointer ${
          lang === "kn"
            ? "bg-red-700 text-white"
            : "bg-slate-100 hover:bg-slate-200"
        }`}
      >
        ಕನ್ನಡ
      </button>
    </div>
  );
}
