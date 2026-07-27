import { useEffect, useRef, useState } from "react";
import i18n from "../i18n";

export default function useSpeechRecognition(onTranscript) {
  const recognitionRef = useRef(null);
  const callbackRef = useRef(onTranscript);

  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);

  // Keep latest callback
  useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  // Initialize only once
  useEffect(() => {
    console.log("Initializing speech");

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = i18n.language === "kn" ? "kn-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      console.log("Recognition started");
      setIsListening(true);
    };

    recognition.onend = () => {
      console.log("Recognition ended");
      setIsListening(false);
    };

    recognition.onerror = (e) => {
      console.log("Speech Error:", e.error);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");

      console.log("Transcript:", transcript);

      callbackRef.current(transcript);
    };

    recognitionRef.current = recognition;
  }, []);

  const startListening = () => {
    console.log("Start clicked");

    // Update language dynamically before each listen
    if (recognitionRef.current) {
      recognitionRef.current.lang = i18n.language === "kn" ? "kn-IN" : "en-IN";
    }
    recognitionRef.current?.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  return {
    supported,
    isListening,
    startListening,
    stopListening,
  };
}
