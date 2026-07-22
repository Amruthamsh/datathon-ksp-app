import { ArrowUp, Paperclip, Mic, MicOff, Volume2 } from "lucide-react";
import useSpeechRecognition from "../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../hooks/useSpeechSynthesis";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import AnalysisPanel from "../components/AnalysisPanel";
import { useAuth } from "../auth/AuthContext";
import { generateResponse, getConversation } from "../api/chat";
import { useCallback } from "react";

const GREETING = {
  role: "assistant",
  content: "Hello! Ask me anything about the crime database.",
};

export default function Home() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshConversations } = useOutletContext();

  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    stop();

    setMessages((prev) => [...prev, { role: "user", content: input }]);
    setInput("");
    setLoading(true);

    try {
      const data = await generateResponse(token, input, id || null);

      // If this was a new chat, refresh the sidebar and redirect
      if (!id && data.conversation_id) {
        refreshConversations();
        navigate(`/chat/${data.conversation_id}`, { replace: true });
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response, analysis: data.analysis },
      ]);
      setActiveAnalysis(data.analysis || null);

      if (voiceEnabled) {
        speak(data.response);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
                  className={`rounded-3xl px-5 py-4 shadow-sm text-[15px] leading-7 ${
                    m.role === "user"
                      ? "bg-red-50 max-w-[78%]"
                      : "bg-slate-100 max-w-[84%]"
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.content}
                  </ReactMarkdown>

                  {/* Button renders reliably on any response containing analysis data */}
                  {hasAnalysis && (
                    <button
                      onClick={() => setActiveAnalysis(m.analysis)}
                      className={`mt-4 rounded-lg border px-4 py-2 text-sm transition cursor-pointer ${
                        isCurrentlyActive
                          ? "border-blue-500 bg-blue-50 text-blue-700 font-medium shadow-xs"
                          : "border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {isCurrentlyActive
                        ? "Viewing Investigation"
                        : "Open Investigation"}
                    </button>
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
              placeholder="Ask a question or provide instructions..."
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
              disabled={loading}
              onClick={() => sendMessage()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 transition"
            >
              <ArrowUp size={18} />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <div>
              {isListening && (
                <span className="text-red-500 font-medium">
                  🎤 Listening...
                </span>
              )}
            </div>

            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 transition ${
                voiceEnabled ? "bg-blue-100 text-blue-700" : "bg-slate-100"
              }`}
            >
              <Volume2 size={14} />
              Voice
            </button>
          </div>

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
