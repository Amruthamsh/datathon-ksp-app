import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en/common.json";
import kn from "./locales/kn/common.json";

const savedLang = localStorage.getItem("ksp-lang") || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    kn: { translation: kn },
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
