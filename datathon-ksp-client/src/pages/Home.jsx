import Header from "../components/Header";
import LeftNav from "../components/LeftNav";
import { ArrowUp, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [expanded, setExpanded] = useState(true);

  const snapshots = [
    {
      id: 1,
      title: "Burglary hotspots",
      filters: { Crime: "Burglary", District: "Bengaluru", Period: "30 Days" },
      kpi: { incidents: 326, change: "+18%" },
      summary:
        "Whitefield and Bellandur show the highest concentration of burglaries.",
      trend: [30, 44, 58, 71, 63],
      areas: [
        { name: "Whitefield", value: 82 },
        { name: "Bellandur", value: 70 },
        { name: "KR Puram", value: 56 },
        { name: "Marathahalli", value: 49 },
      ],
    },
    {
      id: 2,
      title: "Night only",
      filters: { Crime: "Burglary", Time: "After 10 PM" },
      kpi: { incidents: 142, change: "-56%" },
      summary: "Most incidents occur between 10 PM and 2 AM.",
      trend: [12, 19, 27, 36, 48],
      areas: [
        { name: "Whitefield", value: 66 },
        { name: "Bellandur", value: 54 },
        { name: "Electronic City", value: 40 },
        { name: "HSR", value: 35 },
      ],
    },
    {
      id: 3,
      title: "Comparison",
      filters: { Compare: "Previous Month" },
      kpi: { incidents: 142, change: "+11%" },
      summary: "Night burglaries increased compared to last month.",
      trend: [15, 17, 21, 29, 42],
      areas: [
        { name: "Whitefield", value: 74 },
        { name: "Bellandur", value: 58 },
        { name: "KR Puram", value: 45 },
        { name: "HSR", value: 39 },
      ],
    },
  ];

  const [activeSnapshot, setActiveSnapshot] = useState(0);

  const s = snapshots[activeSnapshot];

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello! Ask me anything about the crime database.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [followUps, setFollowUps] = useState([]);

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

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.response,
          snapshot: data.snapshot,
        },
      ]);

      setFollowUps(data.follow_up_questions ?? []);

      console.log(data.sql_query);
      console.table(data.sql_result);
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

                    {m.snapshot !== undefined && (
                      <button
                        onClick={() => setActiveSnapshot(m.snapshot)}
                        className={`mt-4 rounded-lg border px-4 py-2 text-sm transition
                        ${
                          activeSnapshot === m.snapshot
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white hover:bg-slate-50"
                        }`}
                      >
                        {activeSnapshot === m.snapshot
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

            {/* Follow Ups */}

            {followUps.length > 0 && (
              <div className="border-t border-slate-100 px-5 pt-4">
                <div className="flex flex-wrap gap-2">
                  {followUps.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="
                      rounded-full
                      border
                      border-slate-300
                      bg-white
                      px-4
                      py-2
                      text-sm
                      hover:bg-slate-50
                      transition
                      "
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                    max-h-[180px]
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
            </div>
          </section>

          <section className="flex-1 overflow-auto p-6 bg-slate-100">
            <div className="flex gap-3 flex-wrap mb-6">
              {Object.entries(s.filters).map(([k, v]) => (
                <div key={k} className="bg-white rounded-xl px-4 py-2 shadow">
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="font-medium">{v}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl p-5 shadow">
                <div className="font-semibold mb-4">Crime Heatmap</div>
                <div className="h-72 rounded-xl bg-gradient-to-br from-red-100 via-orange-100 to-blue-100 flex items-center justify-center text-5xl">
                  🗺️
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow">
                <div className="font-semibold mb-4">Summary</div>
                <div className="text-5xl font-bold">{s.kpi.incidents}</div>
                <div className="text-slate-500 mb-4">Incidents</div>
                <div className="text-green-600 font-semibold">
                  {s.kpi.change}
                </div>
                <p className="mt-5 text-sm text-slate-600">{s.summary}</p>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow">
                <div className="font-semibold mb-4">Weekly Trend</div>
                <div className="flex items-end h-52 gap-3">
                  {s.trend.map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="bg-blue-600 w-full rounded-t"
                        style={{ height: v * 2 }}
                      />
                      <div className="text-xs mt-2">W{i + 1}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow">
                <div className="font-semibold mb-4">Top Locations</div>
                {s.areas.map((a) => (
                  <div key={a.name} className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>{a.name}</span>
                      <span>{a.value}</span>
                    </div>
                    <div className="h-3 bg-slate-200 rounded-full">
                      <div
                        className="h-3 bg-blue-600 rounded-full"
                        style={{ width: a.value + "%" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
