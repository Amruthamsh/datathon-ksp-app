import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en/common.json";
import kn from "./locales/kn/common.json";
import enWorkspace from "./locales/en/workspace.json";
import knWorkspace from "./locales/kn/workspace.json";
import enExtra from "./locales/en/networks_extra.json";
import knExtra from "./locales/kn/networks_extra.json";
import enMapExtra from "./locales/en/map_extra.json";
import knMapExtra from "./locales/kn/map_extra.json";

function deepMerge(...objs) {
  const out = {};
  for (const obj of objs) {
    if (!obj || typeof obj !== "object") continue;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = deepMerge(out[k], v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

const savedLang = localStorage.getItem("ksp-lang") || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: deepMerge(en, enExtra, enMapExtra, enWorkspace) },
    kn: { translation: deepMerge(kn, knExtra, knMapExtra, knWorkspace) },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("ksp-lang", lng);
  document.documentElement.lang = lng === "kn" ? "kn" : "en";
});

export default i18n;
