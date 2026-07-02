import { useState } from "react";
import Header from "../components/Header";
import LeftNav from "../components/LeftNav";
import { ArrowUp, Paperclip } from "lucide-react";

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

  const messages = [
    { role: "user", text: "Show burglary hotspots in Bengaluru." },
    {
      role: "assistant",
      text: "I found 326 burglary incidents. I've prepared an investigation view.",
      snapshot: 0,
    },
    { role: "user", text: "Only after 10 PM." },
    {
      role: "assistant",
      text: "Updated the investigation using the new filter.",
      snapshot: 1,
    },
    { role: "user", text: "Compare with last month." },
    { role: "assistant", text: "Generated a comparison view.", snapshot: 2 },
    { role: "user", text: "Compare with last month." },
    { role: "assistant", text: "Generated a comparison view." },
    { role: "user", text: "Compare with last month." },
    { role: "assistant", text: "Generated a comparison view." },
  ];

  const s = snapshots[activeSnapshot];

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav expanded={expanded} setExpanded={setExpanded} />
        <main className="flex-1 flex overflow-hidden">
          <section className="w-[47%] bg-white border-slate-300 border-r flex flex-col">
            <div className="flex-1 overflow-auto p-6 space-y-5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[80%] bg-red-50 text-black text-sm rounded-2xl px-4 py-3"
                        : "max-w-[85%] bg-slate-100 text-black text-sm rounded-2xl px-4 py-3"
                    }
                  >
                    <div>{m.text}</div>
                    {m.snapshot !== undefined && (
                      <button
                        onClick={() => setActiveSnapshot(m.snapshot)}
                        className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm cursor-pointer
                        ${
                          activeSnapshot === m.snapshot
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>
                          {activeSnapshot === m.snapshot
                            ? "Viewing Investigation"
                            : "Open Investigation"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pt-2 pb-4">
              <div className="flex items-end gap-2 rounded-[28px] border border-slate-300 bg-white px-2 py-1 shadow-sm transition focus-within:border-slate-400 focus-within:shadow-md">
                {/* Attachment */}
                <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                  <Paperclip size={18} />
                </button>

                {/* Input */}
                <textarea
                  rows={1}
                  placeholder="Ask a question or provide instructions..."
                  className="
                      flex-1
                      resize-none
                      overflow-hidden
                      bg-transparent
                      py-2
                      text-[15px]
                      leading-6
                      text-slate-800
                      placeholder:text-slate-400
                      outline-none
                    "
                />
                {/* Send */}
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:bg-slate-300">
                  <ArrowUp size={18} strokeWidth={2.5} />
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
