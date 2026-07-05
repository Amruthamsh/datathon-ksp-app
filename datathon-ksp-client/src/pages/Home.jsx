import Header from "../components/Header";
import LeftNav from "../components/LeftNav";
import { ArrowUp, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect } from "react";
import AnalysisPanel from "../components/AnalysisPanel";

export default function Home() {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello! Ask me anything about the crime database.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [activeAnalysis, setActiveAnalysis] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const chatContainerRef = useRef(null);

  const sendMessage = async (overrideQuestion = null) => {
    const question = overrideQuestion ?? input;

    if (!question.trim() || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: question,
      },
    ]);

    setInput("");
    setFollowUps([]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_query: question,
        }),
      });

      const data = await response.json();
      const analysis = {
        ...data,
        user_query: question,
      };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.response,
          analysis,
        },
      ]);

      setActiveAnalysis(analysis);
      setFollowUps(data.follow_up_questions ?? []);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading, followUps]);

  // Auto grow textarea
  useEffect(() => {
    const el = textareaRef.current;

    if (!el) return;

    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav expanded={expanded} setExpanded={setExpanded} />
        <main className="flex-1 flex overflow-hidden">
          <section className="w-[47%] border-r border-slate-200 bg-white flex flex-col">
            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto px-7 py-6 space-y-5"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`rounded-3xl px-5 py-4 shadow-sm text-[15px] leading-7
                      ${
                        m.role === "user"
                          ? "bg-red-50 max-w-[78%]"
                          : "bg-slate-100 max-w-[84%]"
                      }`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.text}
                    </ReactMarkdown>

                    {m.analysis && (
                      <button
                        onClick={() => setActiveAnalysis(m.analysis)}
                        className={`mt-4 rounded-lg border px-4 py-2 text-sm transition
                        ${
                          activeAnalysis === m.analysis
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white hover:bg-slate-50"
                        }`}
                      >
                        {activeAnalysis === m.analysis
                          ? "Viewing Investigation"
                          : "Open Investigation"}
                      </button>
                    )}
                  </div>
                </div>
              ))}

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

                      <span className="ml-3 text-sm text-slate-600">
                        Thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4">
              <div
                className="
                flex
                items-end
                gap-2
                rounded-[28px]
                border
                border-slate-300
                bg-white
                px-3
                py-2
                shadow-sm
                focus-within:border-blue-500
                focus-within:shadow-md
                transition
                "
              >
                <button
                  className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-full
                  text-slate-500
                  hover:bg-slate-100
                  "
                >
                  <Paperclip size={18} />
                </button>

                <textarea
                  ref={textareaRef}
                  value={input}
                  placeholder="Ask a question or provide instructions..."
                  className="
                    flex-1
                    resize-none
                    bg-transparent
                    text-[15px]
                    leading-6
                    outline-none
                    overflow-y-auto
                    max-h-45
                    py-2
                    placeholder:text-slate-400
                  "
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
                  className="
                    flex
                    h-11
                    w-11
                    items-center
                    justify-center
                    rounded-full
                    bg-slate-900
                    text-white
                    hover:bg-slate-800
                    disabled:bg-slate-300
                    transition
                  "
                >
                  <ArrowUp size={18} />
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

          <section className="flex-1 overflow-auto bg-linear-to-br from-slate-100 to-slate-200 p-6">
            <AnalysisPanel analysis={activeAnalysis} />
          </section>
        </main>
      </div>
    </div>
  );
}
