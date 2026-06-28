import { useState } from "react";

export default function LanguageSelector() {
  const [lang, setLang] = useState("en");

  return (
    <div className="flex rounded-lg overflow-hidden">
      <button
        onClick={() => setLang("en")}
        className={`px-3 py-1.5 text-sm transition cursor-pointer ${
          lang === "en"
            ? "bg-blue-600 text-white"
            : "bg-slate-100 hover:bg-slate-200"
        }`}
      >
        English
      </button>

      <button
        onClick={() => setLang("kn")}
        className={`px-3 py-1.5 text-sm transition cursor-pointer ${
          lang === "kn"
            ? "bg-blue-600 text-white"
            : "bg-slate-100 hover:bg-slate-200"
        }`}
      >
        ಕನ್ನಡ
      </button>
    </div>
  );
}
