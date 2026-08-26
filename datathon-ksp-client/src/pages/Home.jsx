import {
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Paperclip,
  Mic,
  MicOff,
  Volume2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  File,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import useSpeechRecognition from "../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../hooks/useSpeechSynthesis";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useOutletContext,
} from "react-router-dom";
import AnalysisPanel from "../components/AnalysisPanel";
import { useAuth } from "../auth/AuthContext";
import { generateResponse, getConversation, sendFeedback } from "../api/chat";

const CHAT_WIDTH_DEFAULT = 47;
const CHAT_WIDTH_MIN = 25;
const CHAT_WIDTH_MAX = 75;

const clampChatWidth = (value) =>
  Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, value));

export default function Home() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [conversationId, setConversationId] = useState(id || null);

  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const didConsumeInitialState = useRef(false);
  const streamIntervalRef = useRef(null);

  const [attachedFiles, setAttachedFiles] = useState([]);

  const layoutRef = useRef(null);
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem("ksp-chat-width"));
    return Number.isFinite(saved) ? clampChatWidth(saved) : CHAT_WIDTH_DEFAULT;
  });
  const [isResizing, setIsResizing] = useState(false);

  const { speak, stop } = useSpeechSynthesis();

  const handleTranscript = useCallback((text) => {
    setInput(text);
  }, []);

  const { supported, isListening, startListening, stopListening } =
    useSpeechRecognition(handleTranscript);

  useEffect(() => {
    // Cancel any fake streaming if user switches conversation / new chat
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      setIsStreaming(false);
    }
    // Clear stale follow-ups immediately — they are conversation-dependent
    setFollowUps([]);
    if (id) {
      setLoading(true);
      getConversation(token, id)
        .then((data) => {
          setMessages(data.messages || [GREETING]);
          setConversationId(id);

          const lastMsg = data.messages?.[data.messages.length - 1];
          if (lastMsg?.analysis) {
            setActiveAnalysis({
              ...lastMsg.analysis,
              response: lastMsg.analysis.response || lastMsg.content || "",
            });
          } else {
            setActiveAnalysis(null);
          }
          // Conversation-dependent follow-ups: show only the last assistant's questions
          if (
            lastMsg?.role === "assistant" &&
            lastMsg?.analysis?.follow_up_questions?.length
          ) {
            setFollowUps(lastMsg.analysis.follow_up_questions);
          } else {
            setFollowUps([]);
          }
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

  // Pre-fill input when navigating from Investigations with context
  useEffect(() => {
    if (didConsumeInitialState.current) return;
    const initialMessage = location.state?.initialMessage;
    if (initialMessage) {
      didConsumeInitialState.current = true;
      setInput(initialMessage);
    }
  }, [location.state]);

  // Cleanup streaming interval on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // Gentle nudge when user starts a conversation or asks a follow-up:
  // scroll down *a little* to make breathing room for the upcoming
  // streaming bubble, but never auto-scroll while the assistant is streaming
  // or after it finishes (requirement: "don't autoscroll to bottom when response generated").
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "user") return;
    const el = chatScrollRef.current;
    if (!el) return;
    // Wait for the user bubble to paint before measuring / scrolling
    requestAnimationFrame(() => {
      // Nudge amount — enough to reveal ~one assistant bubble height of empty space
      const NUDGE_PX = 180;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;

      if (nearBottom) {
        // At bottom: scrollIntoView will reveal the bottom spacer padding
        // that lives below the sentinel, creating the empty space.
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
        // And nudge a touch more after the smooth scroll kicks in
        setTimeout(() => {
          el.scrollBy({ top: 32, behavior: "smooth" });
        }, 120);
      } else {
        el.scrollBy({ top: NUDGE_PX, behavior: "smooth" });
      }
    });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  // Drag-to-resize chat/analysis panes
  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const rect = layout.getBoundingClientRect();
      setChatWidth(
        clampChatWidth(((e.clientX - rect.left) / rect.width) * 100),
      );
    };
    const handleUp = () => setIsResizing(false);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem("ksp-chat-width", chatWidth.toFixed(2));
  }, [chatWidth]);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
      "image/gif",
    ];

    const valid = [];
    for (const file of selected) {
      if (!allowed.includes(file.type)) {
        alert(
          `"${file.name}" is unsupported. Upload PDF, Excel, Word, or image files.`,
        );
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`"${file.name}" exceeds the 10 MB limit.`);
        continue;
      }
      valid.push(file);
    }

    if (valid.length) {
      setAttachedFiles((prev) => [...prev, ...valid]);
    }
    e.target.value = "";
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // --- Fake streaming: reveal the full response in chunks after API returns ---
  const startFakeStreaming = useCallback(
    (fullText, analysis, meta, pendingConversationId) => {
      // Clear any previous interval
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }

      const text = fullText || "";
      if (!text) {
        // No content — just finalize immediately
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            analysis,
            ...meta,
            feedback: null,
          },
        ]);
        setActiveAnalysis(analysis);
        setFollowUps(analysis?.follow_up_questions || []);
        if (pendingConversationId) {
          refreshConversations();
          navigate(`/chat/${pendingConversationId}`, { replace: true });
        }
        return;
      }

      // Insert an empty assistant bubble that we will progressively fill
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          analysis,
          ...meta,
          feedback: null,
        },
      ]);
      setIsStreaming(true);

      // Chunk by characters for natural typing feel — ~22 chars ≈ 4-5 words per frame
      const CHUNK_SIZE = 22;
      const INTERVAL_MS = 28;
      let cursor = 0;

      streamIntervalRef.current = setInterval(() => {
        cursor = Math.min(cursor + CHUNK_SIZE, text.length);
        const chunk = text.slice(0, cursor);

        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
            next[lastIdx] = { ...next[lastIdx], content: chunk };
          }
          return next;
        });

        if (cursor >= text.length) {
          clearInterval(streamIntervalRef.current);
          streamIntervalRef.current = null;
          setIsStreaming(false);
          setActiveAnalysis(analysis);
          setFollowUps(analysis?.follow_up_questions || []);
          if (pendingConversationId) {
            refreshConversations();
            navigate(`/chat/${pendingConversationId}`, { replace: true });
          }
        }
      }, INTERVAL_MS);
    },
    [navigate, refreshConversations],
  );

  const sendMessage = async (message = input) => {
    if ((!message.trim() && !attachedFiles.length) || loading || isStreaming)
      return;

    // Cancel any ongoing fake stream (e.g. retry while streaming)
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      setIsStreaming(false);
    }

    stop();

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: message,
      },
    ]);

    const filesToSend = attachedFiles;
    setInput("");
    setAttachedFiles([]);
    setLoading(true);
    setFollowUps([]);

    try {
      const data = await generateResponse(
        token,
        message,
        id || null,
        i18n.language,
        filesToSend,
      );

      const analysis = {
        sql_query: data.sql_query,
        sql_result: data.sql_result,
        charts: data.charts,
        response: data.response,
        follow_up_questions: data.follow_up_questions,
      };

      const meta = {
        message_id: data.message_id,
        created_at: data.created_at,
      };

      // Keep loading spinner until API returns, then switch to streaming
      setLoading(false);

      const pendingConversationId =
        !id && data.conversation_id ? data.conversation_id : null;

      // If this is an existing conversation, keep the id in sync immediately
      if (!pendingConversationId && data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      startFakeStreaming(
        data.response || "",
        analysis,
        meta,
        pendingConversationId,
      );
    } catch (e) {
      console.error(e);
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
    if (isStreaming && streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      setIsStreaming(false);
    }
    const userMsg = messages[index - 1];
    if (!userMsg || userMsg.role !== "user") return;

    setMessages((prev) => prev.slice(0, index));
    sendMessage(userMsg.content);
  };

  return (
    <div
      ref={layoutRef}
      className={`flex-1 flex h-full overflow-hidden bg-white ${
        isResizing ? "select-none" : ""
      }`}
    >
      {/* Chat column */}
      <section
        className="flex flex-col min-w-0"
        style={{ width: `${chatWidth}%` }}
      >
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
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
                  className={`rounded-2xl px-4 py-2.5 shadow-sm text-[14px] leading-6 ${
                    m.role === "user"
                      ? "bg-red-50 max-w-[85%]"
                      : "bg-slate-100 max-w-[90%]"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold mt-3 mb-1.5 text-slate-900">
                          {children}
                        </h1>
                      ),

                      h2: ({ children }) => (
                        <h2 className="text-lg font-semibold mt-3 mb-1.5 border-b border-slate-300 pb-1 text-slate-900">
                          {children}
                        </h2>
                      ),

                      h3: ({ children }) => (
                        <h3 className="text-base font-semibold mt-2.5 mb-1 text-slate-900">
                          {children}
                        </h3>
                      ),

                      p: ({ children }) => (
                        <p className="mb-1.5 leading-6 text-slate-800">
                          {children}
                        </p>
                      ),

                      ul: ({ children }) => (
                        <ul className="list-disc pl-6 mb-1.5 space-y-0.5">
                          {children}
                        </ul>
                      ),

                      ol: ({ children }) => (
                        <ol className="list-decimal pl-6 mb-1.5 space-y-0.5">
                          {children}
                        </ol>
                      ),

                      li: ({ children }) => (
                        <li className="leading-6">{children}</li>
                      ),

                      strong: ({ children }) => (
                        <strong className="font-semibold text-slate-900">
                          {children}
                        </strong>
                      ),

                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 my-2">
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
                  {isStreaming &&
                    i === messages.length - 1 &&
                    m.role === "assistant" && (
                      <span className="inline-block w-2 h-4 bg-slate-500 animate-pulse ml-0.5 translate-y-0.5 align-middle" />
                    )}

                  {/* Open Investigation button */}
                  {hasAnalysis && (
                    <button
                      onClick={() =>
                        setActiveAnalysis({
                          ...m.analysis,
                          response: m.analysis.response || m.content || "",
                        })
                      }
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

                  {/* Action bar — hidden while this bubble is still streaming */}
                  {m.role === "assistant" &&
                    m !== GREETING &&
                    !(isStreaming && i === messages.length - 1) && (
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
                          title={
                            speakingIndex === i
                              ? t("chat.stop")
                              : t("chat.readAloud")
                          }
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
              <div className="rounded-2xl bg-slate-100 px-4 py-3 shadow-sm">
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

          {/* Follow-ups — distinctive investigative-chip design */}
          {!loading && !isStreaming && followUps.length > 0 && (
            <div className="w-full space-y-3 pt-2 pb-1 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-slate-500">
                  {t("chat.suggestedFollowUps") || "Suggested follow-ups"}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              </div>
              <div className="flex flex-col gap-2.5">
                {followUps.map((q, idx) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{ animationDelay: `${idx * 70}ms` }}
                    className="group relative flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all duration-200 hover:border-red-200 hover:bg-red-50/40 hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:border-red-300 cursor-pointer animate-in fade-in slide-in-from-bottom-1"
                  >
                    {/* Left accent icon */}
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition-colors duration-200 group-hover:bg-red-600 group-active:bg-red-700">
                      <ArrowUpRight size={14} strokeWidth={2.2} />
                    </span>
                    <span className="flex-1 text-[13.5px] font-medium leading-5 text-slate-800 group-hover:text-slate-900">
                      {q}
                    </span>
                    <ChevronRight
                      size={16}
                      className="mt-1 shrink-0 text-slate-300 transition-all duration-200 group-hover:text-red-500 group-hover:translate-x-0.5"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          {/* Breathing room so the gentle nudge has scrollable space */}
          <div className="h-28 shrink-0 pointer-events-none" aria-hidden />
        </div>

        {/* Input Area */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4">
          <div className="flex items-end gap-2 rounded-[28px] border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 transition">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
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
              className="flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none overflow-y-auto max-h-45 py-2 placeholder:text-slate-400"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />

            <button
              disabled={loading || isStreaming}
              onClick={() => sendMessage()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 transition"
            >
              <ArrowUp size={18} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.gif"
            onChange={handleFileSelect}
          />

          {attachedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-sm"
                >
                  <File size={13} className="text-slate-500 shrink-0" />
                  <span className="truncate text-slate-700 max-w-[180px]">
                    {file.name}
                  </span>
                  <span className="text-slate-400 shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    onClick={() =>
                      setAttachedFiles((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                    className="ml-0.5 shrink-0 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={t("chat.removeFile")}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isListening && (
            <div className="mt-2">
              <span className="text-xs text-red-500 font-medium">
                🎤 {t("chat.listening")}
              </span>
            </div>
          )}
        </div>
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        onDoubleClick={() => setChatWidth(CHAT_WIDTH_DEFAULT)}
        className="group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none flex items-center justify-center"
        title="Drag to resize — double-click to reset"
      >
        <div
          className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
            isResizing
              ? "w-0.5 bg-blue-500"
              : "bg-slate-200 group-hover:bg-blue-400"
          }`}
        />
      </div>

      {/* Analysis panel */}
      <section className="flex-1 min-w-0 overflow-auto bg-linear-to-br from-slate-100 to-slate-200 p-2">
        <AnalysisPanel analysis={activeAnalysis} />
      </section>
    </div>
  );
}
