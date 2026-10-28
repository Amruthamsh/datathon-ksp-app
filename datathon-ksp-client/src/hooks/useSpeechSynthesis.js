import { useRef, useState } from "react";
import toast from "react-hot-toast";
import i18n from "../i18n";

// Kannada read-aloud: browsers silently fall back to their default (English)
// voice when no kn-IN voice is installed, and that voice can't pronounce
// Kannada script — it reads only the punctuation ("comma, dot"). So we pick
// the voice from the *text's* script, select it explicitly, and fall back to
// a Hindi voice via Kannada→Devanagari transliteration (parallel Unicode
// blocks, offset 0x380) when the device has no Kannada voice.

const KANNADA_RE = /[ಀ-೿]/g;
const LETTER_RE = /\p{L}/gu;
const MAX_CHUNK = 180; // Chrome stops long utterances after ~15s

export function isKannadaText(text) {
  const letters = String(text || "").match(LETTER_RE) || [];
  const kn = String(text || "").match(KANNADA_RE) || [];
  return letters.length > 0 && kn.length / letters.length >= 0.3;
}

// Markdown → plain speakable prose.
export function toSpeakable(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, " ") // table separator rows
    .replace(/\|/g, ", ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[→←↑↓·•—–()[\]{}]/g, ", ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/([,.:;])(\s*[,.:;])+/g, "$1")
    .replace(/^[\s,.]+/, "")
    .trim();
}

function kannadaToDevanagari(text) {
  return text.replace(KANNADA_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x380));
}

function chunk(text) {
  const parts = text.match(/[^.!?।\n]+[.!?।]?/g) || [text];
  const out = [];
  let cur = "";
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if ((cur + " " + p).length > MAX_CHUNK && cur) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur} ${p}` : p;
    }
  }
  if (cur) out.push(cur);
  // A single over-long sentence still needs splitting (on commas/spaces).
  return out.flatMap((s) =>
    s.length <= MAX_CHUNK ? [s] : s.match(new RegExp(`.{1,${MAX_CHUNK}}(\\s|,|$)`, "g")) || [s],
  );
}

function loadVoices() {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  // Chrome populates voices asynchronously.
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    setTimeout(done, 1200);
  });
}

function findVoice(voices, prefix) {
  const matches = voices.filter((v) => v.lang?.toLowerCase().replace("_", "-").startsWith(prefix));
  // Prefer India locale and network ("Google") voices, which sound better.
  return (
    matches.find((v) => /-in$/i.test(v.lang.replace("_", "-")) && /google/i.test(v.name)) ||
    matches.find((v) => /-in$/i.test(v.lang.replace("_", "-"))) ||
    matches[0] ||
    null
  );
}

export default function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const runRef = useRef(0);

  /**
   * Speak markdown text. Resolves to how it was spoken:
   *  "native" | "hindi-fallback" | "unavailable" | "unsupported"
   */
  const speak = async (text, { onEnd } = {}) => {
    if (!window.speechSynthesis) return "unsupported";
    const synth = window.speechSynthesis;
    synth.cancel();
    const run = ++runRef.current;

    let spoken = toSpeakable(text);
    if (!spoken) return "unavailable";

    const voices = await loadVoices();
    if (run !== runRef.current) return "native"; // superseded by stop()/another speak

    let voice;
    let lang;
    let mode = "native";
    if (isKannadaText(spoken)) {
      voice = findVoice(voices, "kn");
      lang = "kn-IN";
      if (!voice) {
        const hindi = findVoice(voices, "hi");
        if (!hindi) {
          toast.error(i18n.t("speech.noKannadaVoice"), { id: "tts-voice", duration: 6000 });
          onEnd?.();
          return "unavailable";
        }
        toast(i18n.t("speech.hindiFallback"), { id: "tts-voice", icon: "🔊", duration: 5000 });
        voice = hindi;
        lang = hindi.lang;
        spoken = kannadaToDevanagari(spoken);
        mode = "hindi-fallback";
      }
    } else {
      voice = findVoice(voices, "en");
      lang = voice?.lang || "en-IN";
    }

    const chunks = chunk(spoken);
    setIsSpeaking(true);
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (voice) u.voice = voice;
      u.lang = lang;
      u.rate = 1;
      u.pitch = 1;
      if (i === chunks.length - 1) {
        u.onend = () => {
          if (run === runRef.current) {
            setIsSpeaking(false);
            onEnd?.();
          }
        };
      }
      u.onerror = (e) => {
        // "interrupted"/"canceled" fire on stop(); only the active run reports.
        if (run === runRef.current && e.error !== "interrupted" && e.error !== "canceled") {
          setIsSpeaking(false);
          onEnd?.();
        }
      };
      synth.speak(u);
    });
    return mode;
  };

  const stop = () => {
    if (!window.speechSynthesis) return;
    runRef.current += 1;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return {
    speak,
    stop,
    isSpeaking,
  };
}
