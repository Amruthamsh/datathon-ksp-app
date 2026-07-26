import {
  ArrowUp,
  Paperclip,
  Mic,
  MicOff,
  Volume2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useSpeechRecognition from "../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../hooks/useSpeechSynthesis";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import AnalysisPanel from "../components/AnalysisPanel";
import { useAuth } from "../auth/AuthContext";
import { generateResponse, getConversation, sendFeedback } from "../api/chat";

export default function Home() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshConversations } = useOutletContext();
  const { t, i18n } = useTranslation();

  const GREETING = {
    role: "assistant",
    content: t("chat.greeting"),
  };

  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [conversationId, setConversationId] = useState(id || null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const { speak, stop } = useSpeechSynthesis();

  const handleTranscript = useCallback((text) => {
    setInput(text);
  }, []);

  const { supported, isListening, startListening, stopListening } =
    useSpeechRecognition(handleTranscript);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getConversation(token, id)
        .then((data) => {
          setMessages(data.messages || [GREETING]);
          setConversationId(id);

          const lastMsg = data.messages?.[data.messages.length - 1];
          setActiveAnalysis(lastMsg?.analysis || null);
        })
        .catch((err) => {
          console.error("Failed to load conversation:", err);

          // --- FIX HERE ---
          // Redirect to home and replace history so the back button doesn't
          // get stuck on the invalid ID
          navigate("/", { replace: true });
        })
        .finally(() => setLoading(false));
    } else {
      // Reset state for "New Chat"
      setMessages([GREETING]);
      setConversationId(null);
      setActiveAnalysis(null);
      setFollowUps([]);
    }
  }, [id, token, navigate]); // Ensure navigate is in the dependency array

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, followUps]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const sendMessage = async (message = input) => {
    if (!message.trim() || loading) return;

    stop();

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: message,
      },
    ]);

    setInput("");
    setLoading(true);
    setFollowUps([]);

    try {
      const data = await generateResponse(token, message, id || null, i18n.language);
      // If this was a new chat, refresh the sidebar and redirect
      if (!id && data.conversation_id) {
        refreshConversations();
        navigate(`/chat/${data.conversation_id}`, { replace: true });
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          analysis: data.analysis,
          message_id: data.message_id,
          created_at: data.created_at,
          feedback: null,
        },
      ]);
      setActiveAnalysis(data.analysis || null);
      setFollowUps(data.follow_up_questions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [copiedIndex, setCopiedIndex] = useState(null);
  const [speakingIndex, setSpeakingIndex] = useState(null);

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFeedback = (index, value) => {
    const msg = messages[index];
    if (!msg || msg.role !== "assistant") return;

    const newFeedback = msg.feedback === value ? null : value;

    setMessages((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], feedback: newFeedback };
      return updated;
    });

    if (conversationId && msg.created_at) {
      sendFeedback(token, conversationId, msg.created_at, newFeedback).catch(
        (err) => console.error("Failed to save feedback:", err),
      );
    }
  };

  const retryMessage = (index) => {
    const userMsg = messages[index - 1];
    if (!userMsg || userMsg.role !== "user") return;

    setMessages((prev) => prev.slice(0, index));
    sendMessage(userMsg.content);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-white">
      {/* Chat column */}
      <section className="w-[47%] border-r border-slate-200 flex flex-col">
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
          {messages.map((m, i) => {
            // Ensure analysis contains actual data (SQL query or SQL results)
            const hasAnalysis =
              m.analysis &&
              (m.analysis.sql_query ||
                (Array.isArray(m.analysis.sql_result) &&
                  m.analysis.sql_result.length > 0));

            // Value-based comparison to accurately detect active item across re-renders
            const isCurrentlyActive =
              activeAnalysis &&
              hasAnalysis &&
              (activeAnalysis === m.analysis ||
                activeAnalysis.sql_query === m.analysis.sql_query);

            return (
              <div
                key={i}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`rounded-3xl px-5 py-3 shadow-sm text-[15px] leading-7 ${
                    m.role === "user"
                      ? "bg-red-50 max-w-[78%]"
                      : "bg-slate-100 max-w-[84%]"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-2xl font-bold mt-6 mb-4 text-slate-900">
                          {children}
                        </h1>
                      ),

                      h2: ({ children }) => (
                        <h2 className="text-xl font-semibold mt-6 mb-3 border-b border-slate-300 pb-1 text-slate-900">
                          {children}
                        </h2>
                      ),

                      h3: ({ children }) => (
                        <h3 className="text-lg font-semibold mt-5 mb-2 text-slate-900">
                          {children}
                        </h3>
                      ),

                      p: ({ children }) => (
                        <p className="mb-2 leading-8 text-slate-800">
                          {children}
                        </p>
                      ),

                      ul: ({ children }) => (
                        <ul className="list-disc pl-6 mb-2 space-y-1">
                          {children}
                        </ul>
                      ),

                      ol: ({ children }) => (
                        <ol className="list-decimal pl-6 mb-4 space-y-1">
                          {children}
                        </ol>
                      ),

                      li: ({ children }) => (
                        <li className="leading-7">{children}</li>
                      ),

                      strong: ({ children }) => (
                        <strong className="font-semibold text-slate-900">
                          {children}
                        </strong>
                      ),

                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 my-4">
                          {children}
                        </blockquote>
                      ),

                      code: ({ children }) => (
                        <code className="rounded bg-slate-200 px-1 py-0.5 text-sm font-mono">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>

                  {/* Open Investigation button */}
                  {hasAnalysis && (
                    <button
                      onClick={() => setActiveAnalysis(m.analysis)}
                      className={`rounded-lg border px-4 py-2 mb-2 text-sm transition cursor-pointer ${
                        isCurrentlyActive
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-medium shadow-xs"
                          : "border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {isCurrentlyActive
                        ? t("chat.viewingInvestigation")
                        : t("chat.openInvestigation")}
                    </button>
                  )}

                  {/* Action bar */}
                  {m.role === "assistant" && m !== GREETING && (
                    <div className="mt-1 flex items-center gap-0.5">
                      <button
                        onClick={() => handleCopy(m.content, i)}
                        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition cursor-pointer"
                        title={t("chat.copy")}
                      >
                        {copiedIndex === i ? (
                          <span className="text-[10px] font-medium text-green-600">
                            {t("chat.copied")}
                          </span>
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          if (speakingIndex === i) {
                            stop();
                            setSpeakingIndex(null);
                          } else {
                            stop();
                            speak(m.content);
                            setSpeakingIndex(i);
                          }
                        }}
                        className={`flex h-6 w-6 items-center justify-center rounded transition cursor-pointer ${
                          speakingIndex === i
                            ? "bg-red-100 text-red-600"
                            : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        }`}
                        title={speakingIndex === i ? t("chat.stop") : t("chat.readAloud")}
                      >
                        <Volume2 size={12} />
                      </button>

                      <button
                        onClick={() => handleFeedback(i, "up")}
                        className={`flex h-6 w-6 items-center justify-center rounded transition cursor-pointer ${
                          m.feedback === "up"
                            ? "text-blue-600 bg-blue-100 hover:bg-blue-200"
                            : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        }`}
                        title={t("chat.helpful")}
                      >
                        <ThumbsUp size={12} />
                      </button>

                      <button
                        onClick={() => handleFeedback(i, "down")}
                        className={`flex h-6 w-6 items-center justify-center rounded transition cursor-pointer ${
                          m.feedback === "down"
                            ? "text-red-600 bg-red-100 hover:bg-red-200"
                            : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        }`}
                        title={t("chat.notHelpful")}
                      >
                        <ThumbsDown size={12} />
                      </button>

                      <button
                        onClick={() => retryMessage(i)}
                        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition cursor-pointer"
                        title={t("chat.retry")}
                      >
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-3xl bg-slate-100 px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                  <span
                    className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: ".15s" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: ".3s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4">
          <div className="flex items-end gap-2 rounded-[28px] border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 transition">
            <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
              <Paperclip size={18} />
            </button>

            {supported && (
              <button
                onClick={() => {
                  console.log("Mic button clicked. Listening:", isListening);
                  if (isListening) stopListening();
                  else startListening();
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition cursor-pointer ${
                  isListening
                    ? "bg-red-100 text-red-600 animate-pulse"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              placeholder={t("chat.inputPlaceholder")}
              className="flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none overflow-y-auto max-h-45 min-h-6 py-2 placeholder:text-slate-400"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <button
              disabled={loading}
              onClick={() => sendMessage()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 transition"
            >
              <ArrowUp size={18} />
            </button>
          </div>

          {isListening && (
            <div className="mt-2">
              <span className="text-xs text-red-500 font-medium">
                🎤 {t("chat.listening")}
              </span>
            </div>
          )}

          {followUps.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {followUps.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm transition hover:bg-slate-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Analysis panel */}
      <section className="flex-1 overflow-auto bg-linear-to-br from-slate-100 to-slate-200 p-2">
        <AnalysisPanel analysis={activeAnalysis} />
      </section>
    </div>
  );
}
