import { useEffect, useState, useMemo, useRef } from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2,
  Search,
  X,
  Bot,
  Trash2,
  Send,
  ExternalLink,
  ArrowRight,
  MapPin,
  Sparkles,
  Clock3,
  Users,
  FileClock,
  CalendarDays,
  Siren,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import {
  getCaseDetails,
  getCaseIntel,
  getSimilarCases,
} from "../api/investigations";
import { generateResponse } from "../api/chat";
import { useAuth } from "../auth/AuthContext";
import { getOfficerRank } from "../utils/role";
import { getMockExtensions } from "../data/mockCaseExtensions";
import actSectionMeta from "../data/actSectionMetadata.json";

function formatDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime())
      ? String(d)
      : dt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  } catch {
    return String(d);
  }
}
function formatMonoDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime())
      ? String(d)
      : dt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  } catch {
    return String(d);
  }
}
function useChargesheet(caseData, mock) {
  return useMemo(() => {
    const arrests =
      mock?.mockAccused?.filter((a) => a.arrestDate).map((a) => a.arrestDate) ||
      [];
    const earliestArrest = arrests.length ? arrests.sort()[0] : null;
    const baseDate = earliestArrest || caseData?.CrimeRegisteredDate;
    const isArrestBased = Boolean(earliestArrest);
    if (!baseDate) return null;
    const acts = (caseData?.acts || []).map((a) => a.ActID);
    const isSerious =
      acts.includes("NDPS") ||
      String(caseData?.Gravity).toLowerCase().includes("heinous") ||
      acts.includes("POCSO");
    const limitDays = isSerious ? 90 : 60;
    const base = new Date(baseDate);
    const due = new Date(base.getTime() + limitDays * 864e5);
    const diff = Math.ceil((due - Date.now()) / 864e5);
    let tone = "neutral";
    if (diff < 0) tone = "overdue";
    else if (diff <= 14) tone = "critical";
    else if (diff <= 30) tone = "warning";
    return { baseDate, due, diff, limitDays, isArrestBased, tone };
  }, [caseData, mock]);
}

export default function InvestigationWorkspace() {
  const { caseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, officer } = useAuth();
  const { t } = useTranslation();
  const rank = getOfficerRank(officer);
  const activeTab = searchParams.get("tab") || "overview";
  const [caseData, setCaseData] = useState(null);
  const [caseIntel, setCaseIntel] = useState(null);
  const [similarCases, setSimilarCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scopeQuery, setScopeQuery] = useState("");
  const [mock, setMock] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const scrollRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);
  const chatKey = `ksp_case_chat_${caseId}_${today}`;
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const v = localStorage.getItem(chatKey);
      return v ? JSON.parse(v) : [];
    } catch {
      return [];
    }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(chatKey, JSON.stringify(chatMessages));
    } catch {}
  }, [chatKey, chatMessages]);
  useEffect(() => {
    const h = (e) => {
      const sp = new URLSearchParams(location.search);
      sp.set("tab", e.detail);
      setSearchParams(sp, { replace: true });
    };
    window.addEventListener("ksp-tab-change", h);
    return () => window.removeEventListener("ksp-tab-change", h);
  }, [location.search, setSearchParams]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [detailsRes, intelRes, similarRes] = await Promise.all([
          getCaseDetails(token, caseId),
          getCaseIntel(token, caseId),
          getSimilarCases(token, caseId),
        ]);
        if (cancelled) return;
        const details = detailsRes?.data ?? null;
        const intel = intelRes?.data ?? null;
        const similar =
          similarRes?.data?.data ??
          similarRes?.data?.cases ??
          (Array.isArray(similarRes?.data) ? similarRes.data : []);
        setCaseData(details);
        setCaseIntel(intel);
        setSimilarCases(similar);
        setMock(getMockExtensions(caseId, intel));
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [caseId, token]);
  const chargesheet = useChargesheet(caseData, mock);
  const actSectionDetails = useMemo(() => {
    if (!caseIntel?.acts) return [];
    return caseIntel.acts.map((a) => {
      const actMeta = actSectionMeta.acts?.[a.ActID];
      return {
        actId: a.ActID,
        sectionId: a.SectionID,
        actMeta,
        sectionMeta: actMeta?.sections?.[a.SectionID],
      };
    });
  }, [caseIntel]);
  const isEscalated = useMemo(() => {
    if (!caseData) return false;
    const heinous = String(caseData.Gravity).toLowerCase().includes("heinous");
    const overdue =
      chargesheet?.tone === "overdue" || chargesheet?.tone === "critical";
    const highProfile = (caseIntel?.accused?.length || 0) >= 3;
    return heinous || overdue || highProfile;
  }, [caseData, chargesheet, caseIntel]);
  const inspectorHealth = useMemo(() => {
    if (!caseData || !mock) return "";
    const parts = [];
    const abscond = mock.mockAccused.filter(
      (a) => a.arrestStatus === "Absconding",
    ).length;
    if (abscond) parts.push(`${abscond} absconding`);
    if (mock.fsl.status === "overdue" || mock.fsl.status === "pending")
      parts.push(`FSL ${mock.fsl.status}`);
    const onTrack = chargesheet?.diff > 14 ? "on track" : "at risk";
    parts.push(`chargesheet ${onTrack}`);
    if (mock.witnesses.filter((w) => !w.examined).length)
      parts.push(
        `${mock.witnesses.filter((w) => !w.examined).length} witnesses pending`,
      );
    return parts.join(" · ");
  }, [caseData, mock, chargesheet]);
  const handleChatSend = async (override) => {
    const qRaw = typeof override === "string" ? override : chatInput;
    if (!qRaw.trim() || chatSending) return;
    const userMsg = {
      role: "user",
      content: qRaw.trim(),
      at: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    const q = qRaw.trim();
    if (typeof override !== "string") setChatInput("");
    setChatSending(true);
    setCopilotOpen(true);
    try {
      const ctx = `Case ${caseData?.CrimeNo} (${caseData?.CrimeGroupName}, ${caseData?.Gravity}). Accused: ${(caseIntel?.accused || []).map((a) => a.AccusedName).join(", ")}. Acts: ${(caseIntel?.acts || []).map((a) => `${a.ActID} ${a.SectionID}`).join(", ")}. Timeline: ${(mock?.timeline || []).map((e) => `${e.title} ${formatDate(e.date)}`).join("; ")}. FSL:${mock?.fsl.status} Court:${mock?.court.purpose} ${formatDate(mock?.court.nextHearingDate)} Similar:${similarCases
        .slice(0, 3)
        .map((s) => s.CrimeNo)
        .join(",")}`;
      const res = await generateResponse(
        token,
        `Context: ${ctx}\n\nQuestion about this case (${activeTab} tab): ${q}`,
        null,
        "en",
        [],
      );
      const answer =
        res?.data?.answer || res?.answer || res?.response || "No response.";
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: String(answer),
          at: new Date().toISOString(),
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Unable to get response. Check Investigation Checklist and People table for next steps.",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatSending(false);
    }
  };
  const copilotPlaceholder = useMemo(() => {
    const map = {
      overview: "Ask about this case — evidence gaps, next steps, similar MO",
      people: "Ask about these people — prior cases, associates, whereabouts",
      evidence: "Ask about evidence — FSL, seizure, legal sections",
      timeline: "Ask about this timeline — why stalled, what's pending",
      intel: "Ask about these connections — patterns, networks, similar cases",
    };
    return map[activeTab] || "Ask CrimeLens about this case…";
  }, [activeTab]);
  const starterPrompts = useMemo(() => {
    const base = {
      overview: [
        "Why is this case critical?",
        "What should I do next?",
        "Summarize this investigation",
      ],
      people: [
        "What other cases involve this accused?",
        "Who are their known associates?",
        "Where have they appeared?",
      ],
      evidence: [
        "What evidence is missing?",
        "What sections apply?",
        "Is FSL blocking chargesheet?",
      ],
      timeline: [
        "Why has this investigation stalled?",
        "What's happened so far?",
        "What is still pending?",
      ],
      intel: [
        "Find similar cases",
        "Is this part of a larger pattern?",
        "Show shared accused links",
      ],
    };
    return base[activeTab] || base.overview;
  }, [activeTab]);

  if (loading)
    return (
      <div className="ksp-workspace flex h-full items-center justify-center bg-[#F4F6F9]">
        <Loader2 className="animate-spin text-[#6B7280]" size={22} />
        <span className="ml-2 text-sm text-[#374151]">Loading case…</span>
      </div>
    );
  if (!caseData)
    return (
      <div className="ksp-workspace p-8 text-sm text-[#374151]">
        Case not found.{" "}
        <button
          onClick={() => navigate("/investigations")}
          className="underline"
        >
          Back to queue
        </button>
      </div>
    );
  const showDySPGate = (rank === "DySP" || rank === "SP") && !isEscalated;
  const matchesScope = (text) =>
    !scopeQuery.trim() ||
    String(text || "")
      .toLowerCase()
      .includes(scopeQuery.toLowerCase());

  return (
    <div className="ksp-workspace flex h-full flex-col overflow-hidden bg-[#F4F6F9] relative">
      {/* Header — Case Brief identity */}
      <div className="shrink-0 border-b border-[#DDE3EC] bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pt-3 pb-2.5">
          <h1 className="ksp-mono text-[19px] font-black tracking-tight text-[#1A1A2E]">
            {caseData.CrimeNo || `#${caseData.CaseMasterID}`}
          </h1>
          <span className="border border-blue-900/90 bg-blue-900/90 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
            {caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}
          </span>
          <span
            className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${String(caseData.Gravity).toLowerCase().includes("heinous") ? "bg-[#D62828] text-white shadow-sm" : "border border-[#DDE3EC] bg-white text-[#374151]"}`}
          >
            {caseData.Gravity || "—"}
          </span>
          {chargesheet?.tone === "overdue" && (
            <span className="bg-[#D62828] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-white">
              Chargesheet {Math.abs(chargesheet.diff)}d late
            </span>
          )}
          {chargesheet?.tone === "critical" && (
            <span className="bg-[#C85A00] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
              Due in {chargesheet.diff}d
            </span>
          )}
          <span className="hidden h-4 w-px bg-[#E5E7EB] sm:block" />
          <span className="text-xs text-[#4B5563]">
            <span className="font-bold text-[#1A1A2E]">
              IO {caseData.FirstName || "—"}
            </span>{" "}
            <span className="text-[#9CA3AF]">·</span>{" "}
            {caseData.CaseStatusName || "Open"}
          </span>
          <span className="ml-auto hidden items-center gap-1.5 text-xs font-medium text-[#4B5563] sm:flex">
            <CalendarDays size={13} className="text-[#6B7280]" />
            {formatDate(caseData.CrimeRegisteredDate)}{" "}
            <span className="text-[#9CA3AF]">·</span>{" "}
            {caseData.DistrictName || ""}
            {caseData.DistrictName && caseData.UnitName ? " · " : ""}
            {caseData.UnitName || "—"}
          </span>
        </div>
        <div className="flex gap-1 border-t border-[#DDE3EC] bg-white px-6 overflow-x-auto">
          {[
            ["overview", "Case Brief"],
            ["people", "People"],
            ["evidence", "Evidence"],
            ["timeline", "Timeline"],
            ["intel", "Intelligence"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                const sp = new URLSearchParams(location.search);
                sp.set("tab", id);
                setSearchParams(sp, { replace: true });
              }}
              aria-current={activeTab === id ? "page" : undefined}
              className={`whitespace-nowrap border-b-[3px] px-3 py-2.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors ${activeTab === id ? "border-[#D62828] text-[#1A1A2E]" : "border-transparent text-[#6B7280] hover:text-blue-900"}`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto hidden sm:flex items-center gap-2 py-1">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              />
              <input
                value={scopeQuery}
                onChange={(e) => setScopeQuery(e.target.value)}
                placeholder="Search within this case…"
                className="w-56 border border-[#DDE3EC] bg-white py-1 pl-7 pr-7 text-xs placeholder:text-[#9CA3AF] focus:border-[#1A1A2E] focus:outline-none"
              />
              {scopeQuery && (
                <button
                  onClick={() => setScopeQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1160px] px-6 py-6 pb-20">
          {showDySPGate ? (
            <div className="border border-[#DDE3EC] bg-white p-8 text-center">
              <p className="text-sm font-semibold text-[#1A1A2E]">
                No escalation for this case
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Heinous / high-profile / deadline breach — none detected.
                Routine supervision not required.
              </p>
              <button
                onClick={() => {
                  const sp = new URLSearchParams(location.search);
                  sp.set("tab", "overview");
                  setSearchParams(sp, { replace: true });
                }}
                className="mt-4 border border-[#1A1A2E] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#1A1A2E] hover:bg-[#F4F6F9]"
              >
                View full file anyway
              </button>
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <CaseBriefTab
                  caseData={caseData}
                  caseIntel={caseIntel}
                  mock={mock}
                  chargesheet={chargesheet}
                  actSectionDetails={actSectionDetails}
                  similarCases={similarCases}
                  rank={rank}
                  inspectorHealth={inspectorHealth}
                  matchesScope={matchesScope}
                  onNavigate={(tab) => {
                    const sp = new URLSearchParams(location.search);
                    sp.set("tab", tab);
                    setSearchParams(sp, { replace: true });
                  }}
                  onAsk={(q) => handleChatSend(q)}
                  onOpenIntel={() => {
                    const sp = new URLSearchParams(location.search);
                    sp.set("tab", "intel");
                    setSearchParams(sp, { replace: true });
                  }}
                />
              )}
              {activeTab === "people" && (
                <PeopleTab
                  caseIntel={caseIntel}
                  mock={mock}
                  rank={rank}
                  matchesScope={matchesScope}
                  onAsk={handleChatSend}
                  caseId={caseId}
                />
              )}
              {activeTab === "evidence" && (
                <EvidenceTab
                  actSectionDetails={actSectionDetails}
                  mock={mock}
                  caseData={caseData}
                  matchesScope={matchesScope}
                />
              )}
              {activeTab === "timeline" && (
                <TimelineTab
                  caseData={caseData}
                  mock={mock}
                  caseIntel={caseIntel}
                  chargesheet={chargesheet}
                />
              )}
              {activeTab === "intel" && (
                <IntelTab
                  similarCases={similarCases}
                  caseData={caseData}
                  mock={mock}
                  matchesScope={matchesScope}
                  onAsk={handleChatSend}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Persistent copilot bar — floating compact pill (not full-width dock) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center px-4 sm:bottom-3">
        <div className="relative w-full max-w-[480px]">
          <button
            onClick={() => setCopilotOpen(true)}
            className="pointer-events-auto group flex w-full cursor-pointer items-center gap-2.5 rounded-full border border-[#DDE3EC] bg-white px-3 py-2 text-left shadow-[0_8px_24px_rgba(26,26,46,0.16),0_2px_8px_rgba(26,26,46,0.08)] transition hover:border-[#1A1A2E] hover:shadow-[0_12px_32px_rgba(26,26,46,0.2)] sm:gap-3 sm:px-4 sm:py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A1A2E] text-white">
              <Sparkles size={12} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold leading-none text-[#1A1A2E]">Ask CrimeLens about this case</span>
              <span className="hidden truncate text-[11px] leading-tight text-[#6B7280] sm:block">{copilotPlaceholder}</span>
              <span className="block truncate text-[11px] leading-tight text-[#6B7280] sm:hidden">Tap to ask — evidence, next steps, MO</span>
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F4F6F9] text-[#1A1A2E] transition group-hover:bg-[#1A1A2E] group-hover:text-white">
              <ArrowRight size={14} />
            </span>
          </button>
          {chatMessages.length > 0 && (
            <span className="pointer-events-none absolute -right-2 -top-2 hidden h-5 min-w-[20px] items-center justify-center rounded-full bg-[#D62828] px-1.5 text-[10px] font-bold leading-none text-white shadow sm:flex">
              {chatMessages.length}
            </span>
          )}
        </div>
      </div>

      {/* Copilot Drawer */}
      {copilotOpen && (
        <div className="absolute inset-0 z-30 flex justify-end">
          <div
            className="absolute inset-0 bg-[#1A1A2E]/20 backdrop-blur-[1px]"
            onClick={() => setCopilotOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-[480px] flex-col border-l border-[#DDE3EC] bg-white shadow-2xl animate-[slideIn_0.2s_ease]">
            <div className="flex items-center justify-between border-b border-[#DDE3EC] bg-[#F4F6F9] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center bg-[#1A1A2E] text-white">
                  <Bot size={14} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#1A1A2E]">
                    Case Copilot
                  </p>
                  <p className="ksp-mono text-[11px] text-[#6B7280]">
                    {caseData.CrimeNo}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCopilotOpen(false)}
                className="flex h-7 w-7 items-center justify-center border border-[#DDE3EC] bg-white text-[#6B7280] hover:text-[#1A1A2E]"
              >
                <X size={14} />
              </button>
            </div>
            {chatMessages.length === 0 && (
              <div className="px-4 py-4 border-b border-[#DDE3EC] bg-white">
                <p className="text-xs font-semibold text-[#374151] mb-2">
                  What can I help investigate?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {starterPrompts.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleChatSend(q)}
                      className="border border-[#DDE3EC] bg-white px-2.5 py-1 text-xs font-medium text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white hover:border-[#1A1A2E] transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-[#9CA3AF]">
                  Context: {caseData.CrimeGroupName} ·{" "}
                  {caseIntel?.accused?.length || 0} accused ·{" "}
                  {similarCases.length} related · {mock?.fsl.status} FSL
                </p>
              </div>
            )}
            <div className="flex-1 overflow-auto p-4 space-y-3 bg-[#F4F6F9]/50">
              {chatMessages.length === 0 && (
                <p className="text-xs leading-relaxed text-[#6B7280]">
                  Ask about evidence gaps, next steps, similar MO, or trace the
                  accused. CrimeLens has the full case graph — timeline, people,
                  evidence, and {similarCases.length} related FIRs.
                </p>
              )}
              {chatMessages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] bg-[#1A1A2E] px-3 py-2 text-sm leading-6 text-white">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[92%] border border-[#DDE3EC] bg-white px-3.5 py-3 text-sm leading-6 text-[#1A1A2E]">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 leading-6 last:mb-0">
                              {children}
                            </p>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">
                              {children}
                            </strong>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc pl-5 mb-2 space-y-1">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-5 mb-2 space-y-1">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="leading-6">{children}</li>
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ),
              )}
              {chatSending && (
                <div className="flex justify-start">
                  <div className="border border-[#DDE3EC] bg-white px-3 py-2 text-xs text-[#6B7280]">
                    Thinking…
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-[#DDE3EC] bg-white p-3">
              <div className="flex items-center gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                  placeholder={copilotPlaceholder}
                  className="flex-1 border border-[#DDE3EC] bg-white px-3 py-2 text-sm placeholder:text-[#9CA3AF] focus:border-[#1A1A2E] focus:outline-none"
                />
                <button
                  onClick={() => handleChatSend()}
                  disabled={chatSending || !chatInput.trim()}
                  className="flex h-9 w-9 items-center justify-center bg-[#1A1A2E] text-white disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF]">
                  Auditable — answers reference case facts, timeline & intel
                </span>
                {chatMessages.length > 0 && (
                  <button
                    onClick={() => {
                      setChatMessages([]);
                      localStorage.removeItem(chatKey);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#D62828]"
                  >
                    <Trash2 size={11} /> Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, badge, children, action }) {
  return (
    <div className="h-full rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#FAFBFC] px-4 py-2.5 rounded-t-xl">
        <div className="flex items-center gap-2">
          <h3 className="text-[12.5px] font-bold uppercase tracking-[0.07em] text-[#1A1A2E]">
            {title}
          </h3>
          {badge && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border rounded-full ${badge.tone === "intel" ? "bg-[#EEF2FF] border-[#C7D2FE] text-[#3730A3]" : badge.tone === "ai" ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]" : "bg-white border-[#E5E7EB] text-[#6B7280]"}`}
            >
              {badge.label}
            </span>
          )}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DossierSection({ eyebrow, title, children }) {
  return (
    <section className="px-5 py-4">
      {eyebrow && (
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6B7280]">
          {eyebrow}
        </p>
      )}
      {title && (
        <h3 className="mt-1 text-[15px] font-bold text-[#1A1A2E]">{title}</h3>
      )}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Synopsis({ caseData, actSectionDetails }) {
  const secs = actSectionDetails;
  let charges;
  if (secs.length) {
    const names = secs.map(
      (s) =>
        `${s.actMeta?.fullName || s.actId} Section ${s.sectionId}${s.sectionMeta?.title ? ` (${s.sectionMeta.title})` : ""}`,
    );
    charges =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names.slice(-1)[0]}`;
  }
  return (
    <div className="space-y-2 text-[14px] leading-7 text-[#374151]">
      <p>
        Reported on{" "}
        <span className="font-bold text-[#1A1A2E]">
          {formatDate(caseData.CrimeRegisteredDate)}
        </span>{" "}
        at{" "}
        <span className="font-bold text-[#1A1A2E]">
          {caseData.UnitName || "—"}
        </span>
        {caseData.DistrictName ? `, ${caseData.DistrictName} district` : ""} and
        registered as{" "}
        <span className="ksp-mono font-semibold text-[#1A1A2E]">
          {caseData.CrimeNo}
        </span>
        .
      </p>
      <p>
        Classified{" "}
        <span className="font-bold text-[#1A1A2E]">
          {caseData.Gravity || "—"}
        </span>
        .{" "}
        {charges ? (
          <>
            Charged under{" "}
            <span className="font-bold text-[#1A1A2E]">{charges}</span>.
          </>
        ) : (
          "No acts recorded on this FIR yet."
        )}
      </p>
      <p className="text-[13px] text-[#6B7280]">
        The FIR's own account of the incident is reproduced below — cross-check
        the scenario before filing the chargesheet.
      </p>
    </div>
  );
}

function PeopleNarrative({ caseIntel, mock }) {
  const rows = (caseIntel?.accused || []).map((a, idx) => ({
    a,
    m: mock?.mockAccused[idx] || {},
  }));
  const absconding = rows.filter(
    ({ m }) => m.arrestStatus === "Absconding",
  ).length;
  const arrested = rows.filter(({ m }) => m.arrestStatus === "Arrested").length;
  const victims = caseIntel?.victims || [];
  const witnesses = mock?.witnesses || [];
  const examined = witnesses.filter((w) => w.examined).length;
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[14px] leading-7 text-[#374151]">
        <span className="font-bold text-[#1A1A2E]">{rows.length} accused</span>{" "}
        identified
        {arrested ? ` — ${arrested} arrested` : " — none arrested yet"}
        {absconding ? `, ${absconding} still at large` : ""}.
      </p>
      <div className="mt-3 divide-y divide-[#F3F4F6] overflow-hidden rounded-lg border border-[#E5E7EB]">
        {rows.map(({ a, m }) => (
          <div
            key={a.AccusedMasterID}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A1A2E] text-[11px] font-black text-white">
              {String(a.AccusedName || "?")
                .charAt(0)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#1A1A2E]">
                {a.AccusedName}
              </p>
              <p className="text-[11px] text-[#6B7280]">
                {a.AgeYear}y · {a.GenderID}
                {m.priorCases ? ` · ${m.priorCases} prior cases` : ""}
              </p>
            </div>
            {m.arrestStatus === "Absconding" ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#D62828]/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[#D62828]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D62828]" />
                Absconding
              </span>
            ) : m.arrestStatus === "Arrested" ? (
              <span className="rounded-sm bg-[#2D6A4F]/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[#2D6A4F]">
                Arrested {formatDate(m.arrestDate)}
              </span>
            ) : (
              <span className="rounded-sm bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                {m.bailStatus || "On record"}
              </span>
            )}
            {m.warrantIssued && (
              <span className="rounded-sm border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-[#92400E]">
                Warrant
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#6B7280]">
        {victims.length} {victims.length === 1 ? "victim" : "victims"} ·{" "}
        {examined}/{witnesses.length} witnesses examined
      </p>
    </div>
  );
}

function ChargesNarrative({ actSectionDetails }) {
  if (!actSectionDetails.length)
    return (
      <p className="text-sm text-[#6B7280]">
        No acts recorded on this FIR — verify against the registration details.
      </p>
    );
  return (
    <div className="space-y-2.5">
      {actSectionDetails.map((item, i) => (
        <div
          key={i}
          className="rounded-lg border border-[#E5E7EB] bg-[#FCFDFE] p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-[#1A1A2E]">
              {item.actMeta?.fullName || item.actId} — Section{" "}
              <span className="font-black">{item.sectionId}</span>
              {item.sectionMeta?.title && (
                <span className="ml-1 font-medium text-[#4B5563]">
                  · {item.sectionMeta.title}
                </span>
              )}
            </p>
            {item.sectionMeta?.bailable !== undefined && (
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.sectionMeta.bailable ? "border border-[#2D6A4F] text-[#2D6A4F]" : "bg-[#D62828] text-white"}`}
              >
                {item.sectionMeta.bailable ? "Bailable" : "Non-bailable"}
              </span>
            )}
          </div>
          {item.sectionMeta?.plain_language && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#374151]">
              “{item.sectionMeta.plain_language}”
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium">
            {(item.sectionMeta?.indiacode_url ||
              item.actMeta?.indiacode_url) && (
              <a
                href={
                  item.sectionMeta?.indiacode_url || item.actMeta?.indiacode_url
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#1A1A2E] underline"
              >
                <ExternalLink size={10} />
                IndiaCode
              </a>
            )}
            {(item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url) && (
              <a
                href={item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#1A1A2E] underline"
              >
                <ExternalLink size={10} />
                Indian Kanoon
              </a>
            )}
            {item.sectionMeta?.punishment && (
              <span className="text-[#6B7280]">
                {item.sectionMeta.punishment}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CaseBriefTab({
  caseData,
  caseIntel,
  mock,
  chargesheet,
  actSectionDetails,
  similarCases,
  rank,
  inspectorHealth,
  matchesScope,
  onNavigate,
  onAsk,
  onOpenIntel,
}) {
  const isField = rank === "ASI" || rank === "HC";
  if (isField) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-[#FFFBEB] px-4 py-3 text-xs leading-relaxed text-[#92400E]">
          You're seeing a focused task view — arrests, seizures and locations
          only. Switch to SI/Inspector for the full file.
        </div>
        <PeopleTab
          caseIntel={caseIntel}
          mock={mock}
          rank={rank}
          matchesScope={matchesScope}
          taskOnly
        />
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
            Where to go / What to seize
          </p>
          <p className="mt-1 text-sm text-[#1A1A2E]">
            {mock.property.items}{" "}
            <span className="ml-1 text-[10px] text-[#9CA3AF]">· mock</span>
          </p>
          <p className="mt-1 text-xs text-[#374151]">
            Station: {caseData.UnitName} · District: {caseData.DistrictName}
          </p>
          {caseData.latitude && caseData.longitude && (
            <a
              href={`https://www.google.com/maps?q=${caseData.latitude},${caseData.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1A1A2E] underline"
            >
              View on map <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    );
  }
  const ageDays = Math.floor(
    (Date.now() - new Date(caseData.CrimeRegisteredDate).getTime()) / 864e5,
  );
  const coords =
    caseData.latitude && caseData.longitude
      ? `${caseData.latitude},${caseData.longitude}`
      : null;
  const placeQuery = encodeURIComponent(
    `${caseData.UnitName || ""} ${caseData.DistrictName || ""} Karnataka`.trim(),
  );
  const mapEmbedSrc = coords
    ? `https://maps.google.com/maps?q=${coords}&z=13&output=embed`
    : `https://www.google.com/maps?q=${placeQuery}&output=embed`;
  const mapsHref = coords
    ? `https://www.google.com/maps?q=${coords}`
    : `https://www.google.com/maps/search/${placeQuery}`;
  return (
    <div className="space-y-5">
      <CriticalBanner
        caseData={caseData}
        mock={mock}
        chargesheet={chargesheet}
        inspectorHealth={inspectorHealth}
        rank={rank}
        onAsk={onAsk}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#E5E7EB] bg-[#FAFBFC] px-5 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-[#1A1A2E] text-white">
                <FileClock size={13} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[12.5px] font-black uppercase tracking-[0.1em] text-[#1A1A2E]">
                  Investigation dossier
                </h2>
                <p className="ksp-mono text-[10.5px] text-[#6B7280]">
                  {caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}
                  {caseData.Gravity ? ` · ${caseData.Gravity}` : ""}
                </p>
              </div>
              <span className="ml-auto rounded-sm bg-blue-900/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                {ageDays} days since FIR
              </span>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
              <DossierSection title="Summary of the offense">
                <Synopsis
                  caseData={caseData}
                  actSectionDetails={actSectionDetails}
                />
              </DossierSection>
              <DossierSection
                eyebrow="People in the file"
                title="Accused, victims & witnesses"
              >
                <PeopleNarrative caseIntel={caseIntel} mock={mock} />
              </DossierSection>
              <DossierSection
                eyebrow="Legal charges"
                title="Acts & sections on this FIR"
              >
                <ChargesNarrative actSectionDetails={actSectionDetails} />
              </DossierSection>
              {caseData.BriefFacts && (
                <DossierSection
                  eyebrow={`FIR transcript · ${caseData.BriefFacts.length} characters`}
                  title="What happened, in the FIR's own words"
                >
                  <p className="whitespace-pre-line text-[14px] leading-7 text-[#1A1A2E]">
                    {caseData.BriefFacts}
                  </p>
                </DossierSection>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E5E7EB] bg-[#FAFBFC] px-5 py-2.5">
              <button
                onClick={() => onNavigate("people")}
                className="text-[11px] font-bold text-[#1A1A2E] hover:underline"
              >
                People →
              </button>
              <span className="text-[#DDE3EC]">·</span>
              <button
                onClick={() => onNavigate("evidence")}
                className="text-[11px] font-bold text-[#1A1A2E] hover:underline"
              >
                Evidence & FSL →
              </button>
              <span className="text-[#DDE3EC]">·</span>
              <button
                onClick={() => onNavigate("timeline")}
                className="text-[11px] font-bold text-[#1A1A2E] hover:underline"
              >
                Timeline →
              </button>
              <span className="ml-auto text-[10px] text-[#9CA3AF]">
                Details live in the tabs above
              </span>
            </div>
          </div>

          <IntelDrawer
            similarCases={similarCases}
            onAsk={onAsk}
            onOpenIntel={onOpenIntel}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <KeyFactsPanel caseData={caseData} coords={coords} />
          <DeadlinesPanel mock={mock} chargesheet={chargesheet} />
          <SideMap
            caseData={caseData}
            coords={coords}
            mapEmbedSrc={mapEmbedSrc}
            mapsHref={mapsHref}
          />
        </aside>
      </div>
    </div>
  );
}

function CriticalBanner({
  caseData,
  mock,
  chargesheet,
  inspectorHealth,
  rank,
  onAsk,
}) {
  const accused = mock?.mockAccused || [];
  const absconders = accused.filter((a) => a.arrestStatus === "Absconding");
  const abscond = absconders.length;
  const ageDays = Math.floor(
    (Date.now() - new Date(caseData.CrimeRegisteredDate).getTime()) / 864e5,
  );
  const ageMo = Math.floor(ageDays / 30);
  const fslOverdue = mock?.fsl.status === "overdue";
  const witnessesPending = (mock?.witnesses || []).filter(
    (w) => !w.examined,
  ).length;
  const hearingDate = formatDate(mock?.court.nextHearingDate);

  let state;
  if (abscond > 0) {
    state = {
      tone: "critical",
      kicker: "Requires immediate action",
      title: `${abscond} accused still absconding`,
      body: `The hearing on ${hearingDate} (${mock?.court.purpose}) cannot move forward until ${abscond === accused.length ? "they are" : absconders.map((a) => a.AccusedName).join(", ")} located — ${ageMo} months since the FIR.`,
      action: "Issue arrest warrants",
      ask: "What steps are needed to issue arrest warrants for the absconding accused?",
    };
  } else if (chargesheet?.tone === "overdue") {
    state = {
      tone: "critical",
      kicker: "Deadline breached",
      title: `Chargesheet is ${Math.abs(chargesheet.diff)} days past its ${chargesheet.limitDays}-day deadline`,
      body: `Filing the chargesheet is the single action that moves this file to court.${fslOverdue ? " The FSL report is also stuck — chase it before filing." : " Confirm witness statements are recorded, then file."}`,
      action: "Prep chargesheet",
      ask: "Help me prepare the chargesheet — what is needed to file it now?",
    };
  } else if (fslOverdue) {
    state = {
      tone: "critical",
      kicker: "Evidence blocked",
      title: "FSL report overdue",
      body: `Forensic evidence was sent ${formatDate(mock.fsl.sentDate)} with no report yet — the chargesheet cannot be filed without it.`,
      action: "Chase FSL",
      ask: "How do I chase the overdue FSL report for this case?",
    };
  } else if (chargesheet?.tone === "critical") {
    state = {
      tone: "warning",
      kicker: "Deadline approaching",
      title: `Chargesheet due in ${chargesheet.diff} days`,
      body: `The ${chargesheet.limitDays}-day window (${chargesheet.isArrestBased ? "from first arrest" : "from FIR registration"}) closes soon — line up statements and FSL now to file on time.`,
      action: "Prep chargesheet",
      ask: "Draft the chargesheet for this case.",
    };
  } else if (witnessesPending) {
    state = {
      tone: "warning",
      kicker: "Next steps",
      title: `${witnessesPending} witness statements pending`,
      body: `Record them before the ${hearingDate} hearing (${mock?.court.purpose}) — examined statements strengthen the chargesheet.`,
      action: "Plan questioning",
      ask: "List the pending witness statements and the best order to record them.",
    };
  } else {
    state = {
      tone: "ok",
      kicker: "On track",
      title: "No critical blockers right now",
      body:
        (inspectorHealth ? `${inspectorHealth}. ` : "") +
        `Next hearing ${hearingDate} (${mock?.court.purpose}). Keep gathering statements and FSL documents.`,
      action: "Review next steps",
      ask: "Summarize what remains to be done on this case.",
    };
  }

  const styles = {
    critical: {
      border: "border-[#FECACA]",
      stroke: "border-l-[#D62828]",
      iconBg: "bg-[#D62828]",
      label: "text-[#D62828]",
      icon: <Siren size={16} />,
      btn: "bg-[#D62828] text-white hover:bg-[#B01E1E]",
    },
    warning: {
      border: "border-[#FDE68A]",
      stroke: "border-l-[#C85A00]",
      iconBg: "bg-[#C85A00]",
      label: "text-[#C85A00]",
      icon: <Clock3 size={16} />,
      btn: "bg-[#C85A00] text-white hover:bg-[#A34D00]",
    },
    ok: {
      border: "border-[#CDE5D8]",
      stroke: "border-l-[#2D6A4F]",
      iconBg: "bg-[#2D6A4F]",
      label: "text-[#2D6A4F]",
      icon: <CheckCircle2 size={16} />,
      btn: "border border-[#2D6A4F] bg-white text-[#2D6A4F] hover:bg-[#F0FDF4]",
    },
  }[state.tone];

  return (
    <div
      className={`rounded-xl border ${styles.border} bg-white px-5 py-4 shadow-sm`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <span
          className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-white lg:flex ${styles.iconBg}`}
        >
          {styles.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[10.5px] font-black uppercase tracking-[0.16em] ${styles.label}`}
          >
            {state.kicker}
          </p>
          <h3 className="mt-0.5 text-[15.5px] font-black leading-tight text-[#1A1A2E]">
            {state.title}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[#4B5563]">
            {state.body}
          </p>
        </div>
        {state.action && (
          <button
            onClick={() => onAsk && onAsk(state.ask)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.06em] ${styles.btn}`}
          >
            {state.action} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function IntelDrawer({ similarCases, onAsk, onOpenIntel }) {
  const [open, setOpen] = useState(false);
  if (!similarCases.length) return null;
  const shared = similarCases.filter((s) => s.shared_accused_count > 0).length;
  const districts = new Set(similarCases.map((s) => s.DistrictName)).size;
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[#FAFBFC]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-[#1A1A2E]">
            Intelligence — {similarCases.length} related FIRs
          </p>
          <p className="text-[11.5px] text-[#6B7280]">
            {shared ? `${shared} share the same people` : "Similar MO"} ·{" "}
            {districts} {districts === 1 ? "district" : "districts"} · surfaced
            by CrimeLens
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[#6B7280] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-[#E5E7EB]">
          {similarCases.slice(0, 5).map((s) => (
            <div
              key={s.CaseMasterID}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F3F4F6] px-5 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="ksp-mono text-xs font-bold text-[#1A1A2E]">
                  {s.CrimeNo}{" "}
                  <span className="ml-1 font-sans font-medium text-[#6B7280]">
                    · {s.DistrictName || s.UnitName}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-[#6B7280]">
                  {s.reasons?.slice(0, 2).join(" · ") ||
                    [s.CrimeGroupName, s.Gravity].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.shared_accused_count > 0 && (
                  <span className="rounded-sm bg-[#EEF2FF] px-1.5 py-1 text-[10px] font-bold uppercase text-[#3730A3]">
                    {s.shared_accused_count} shared accused
                  </span>
                )}
                <button
                  onClick={() => onAsk && onAsk(`Tell me about ${s.CrimeNo}`)}
                  className="border border-[#1A1A2E] bg-white px-2 py-1 text-[11px] font-semibold text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white"
                >
                  Ask
                </button>
              </div>
            </div>
          ))}
          <div className="px-5 py-3">
            <button
              onClick={onOpenIntel}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3730A3] hover:underline"
            >
              Open Intelligence tab — full network <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarPanel({ title, icon, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#F3F4F6] bg-[#FAFBFC] px-4 py-2.5">
        <span className="text-[#6B7280]">{icon}</span>
        <h3 className="text-[11px] font-black uppercase tracking-[0.1em] text-[#1A1A2E]">
          {title}
        </h3>
      </div>
      <div className="px-4 py-1.5">{children}</div>
    </div>
  );
}

function MetaRow({ label, value, tone }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F3F4F6] py-2.5 last:border-0">
      <span className="shrink-0 pt-px text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">
        {label}
      </span>
      <span
        className={`text-right text-[12.5px] font-semibold leading-snug ${tone === "danger" ? "text-[#D62828]" : tone === "warn" ? "text-[#C85A00]" : tone === "ok" ? "text-[#2D6A4F]" : "text-[#1A1A2E]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function KeyFactsPanel({ caseData, coords }) {
  return (
    <SidebarPanel title="Key facts" icon={<Users size={13} />}>
      <MetaRow label="Station" value={caseData.UnitName || "—"} />
      <MetaRow label="District" value={caseData.DistrictName || "—"} />
      <MetaRow
        label="Crime group"
        value={caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}
      />
      <MetaRow label="Status" value={caseData.CaseStatusName || "Open"} />
      <MetaRow label="IO" value={caseData.FirstName || "—"} />
      <MetaRow
        label="Registered"
        value={formatDate(caseData.CrimeRegisteredDate)}
      />
      {coords && (
        <MetaRow
          label="Coordinates"
          value={<span className="ksp-mono">{coords}</span>}
        />
      )}
    </SidebarPanel>
  );
}

function DeadlinesPanel({ mock, chargesheet }) {
  const csTone =
    chargesheet?.tone === "critical"
      ? "warn"
      : chargesheet?.tone === "overdue"
        ? "danger"
        : "ok";
  const csValue = chargesheet
    ? chargesheet.diff < 0
      ? `${Math.abs(chargesheet.diff)}d late`
      : `${chargesheet.diff}d left`
    : "—";
  const csSub = chargesheet
    ? `${chargesheet.limitDays}-day limit · ${chargesheet.isArrestBased ? "from arrest" : "from FIR"}`
    : null;
  const fslVal = mock?.fsl.reportReceived
    ? `Reported ${formatDate(mock.fsl.reportDate)}`
    : mock?.fsl.status === "overdue"
      ? "Overdue"
      : mock?.fsl.sent
        ? "Awaiting report"
        : "Not sent";
  return (
    <SidebarPanel title="Court & deadlines" icon={<FileClock size={13} />}>
      <MetaRow
        label="Next hearing"
        value={formatDate(mock?.court.nextHearingDate)}
      />
      <MetaRow label="Purpose" value={mock?.court.purpose} />
      <MetaRow
        label="Court"
        value={`${mock?.court.courtType} · by ${mock?.court.bailGrantableBy}`}
      />
      <MetaRow label="Chargesheet" value={csValue} tone={csTone} />
      {csSub && <MetaRow label="Limit" value={csSub} />}
      <MetaRow
        label="FSL"
        value={fslVal}
        tone={mock?.fsl.status === "overdue" ? "danger" : "ok"}
      />
      <MetaRow label="Property" value={mock?.property.items} />
    </SidebarPanel>
  );
}

function SideMap({ caseData, coords, mapEmbedSrc, mapsHref }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="relative h-40 bg-[#F4F6F9]">
        <iframe
          title="Map of incident location"
          src={mapEmbedSrc}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <MapPin size={20} className="text-[#D62828]" aria-hidden />
          <span className="rounded-sm bg-[#1A1A2E] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Incident
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold text-[#1A1A2E]">
            {caseData.UnitName || "—"}
          </p>
          <p className="ksp-mono text-[10px] text-[#6B7280]">
            {coords
              ? `${Number(caseData.latitude).toFixed(4)}, ${Number(caseData.longitude).toFixed(4)}`
              : "Search by station name"}
          </p>
        </div>
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#1A1A2E] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black"
        >
          Open Maps <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

function PeopleTab({
  caseIntel,
  mock,
  rank,
  matchesScope,
  taskOnly,
  onAsk,
  caseId,
}) {
  const showAll = !taskOnly && rank !== "ASI" && rank !== "HC";
  const rows = (caseIntel?.accused || [])
    .map((a, idx) => ({ a, m: mock?.mockAccused[idx] || {} }))
    .filter(({ a }) => matchesScope(a.AccusedName) || matchesScope(a.GenderID));
  const filteredRows = taskOnly
    ? rows.filter(({ m }) => m.arrestStatus === "Absconding" || m.warrantIssued)
    : rows;
  return (
    <div className="space-y-4">
      <Section
        title={`Accused (${filteredRows.length}${taskOnly ? " — task-relevant" : ""})`}
        badge={{ label: "Fact", tone: "fact" }}
      >
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#DDE3EC]">
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Name
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Age
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Arrest
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Bail
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Prior cases
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filteredRows.map(({ a, m }) => (
                <tr
                  key={a.AccusedMasterID}
                  className={
                    m.arrestStatus === "Absconding" ? "bg-[#FFFBEB]" : ""
                  }
                >
                  <td className="px-2 py-1.5 font-medium text-[#1A1A2E]">
                    {a.AccusedName}{" "}
                    {m.arrestStatus === "Absconding" && (
                      <span className="ml-1 text-[11px] font-bold text-[#92400E]">
                        ⚠ ABSCONDING
                      </span>
                    )}{" "}
                    {m.warrantIssued && (
                      <span className="ml-1 border border-amber-300 bg-amber-100 px-1 text-[10px] font-bold uppercase text-[#92400E]">
                        Warrant
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[#374151]">
                    {a.AgeYear}y · {a.GenderID}
                  </td>
                  <td className="px-2 py-1.5 text-[#374151]">
                    {m.arrestStatus === "Absconding"
                      ? "—"
                      : `${m.arrestStatus} · ${formatDate(m.arrestDate)}`}
                  </td>
                  <td className="px-2 py-1.5 text-[#374151]">{m.bailStatus}</td>
                  <td className="px-2 py-1.5 text-[#374151]">
                    {m.priorCases} cases
                    {m.convictions ? ` (${m.convictions} conviction)` : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() =>
                        onAsk &&
                        onAsk(`What other FIRs involve ${a.AccusedName}?`)
                      }
                      className="text-[11px] font-semibold text-[#1A1A2E] underline"
                    >
                      Trace
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-xs text-[#9CA3AF]"
                  >
                    No accused match filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[#9CA3AF]">
          Arrest/bail/warrant/prior — mocked in frontend (isMock) until
          ArrestSurrender/conviction tables land.
        </p>
      </Section>
      {showAll && (
        <>
          <Section
            title={`Victims (${(caseIntel?.victims || []).filter((v) => matchesScope(v.VictimName)).length})`}
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#DDE3EC]">
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Name
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Age
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Statement recorded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {(caseIntel?.victims || [])
                  .filter((v) => matchesScope(v.VictimName))
                  .map((v, idx) => (
                    <tr key={v.VictimMasterID}>
                      <td className="px-2 py-1.5 font-medium text-[#1A1A2E]">
                        {v.VictimName}
                        {v.VictimPolice && (
                          <span className="ml-1 border border-[#DDE3EC] bg-white px-1 text-[10px] font-bold uppercase text-[#374151]">
                            Police
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {v.AgeYear}y · {v.GenderID}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {(mock?.victimStatements[idx] ?? true) ? "Yes" : "No"}{" "}
                        <span className="text-[10px] text-[#9CA3AF]">
                          · mock
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Section>
          <Section
            title={`Witnesses (${(mock?.witnesses || []).filter((w) => matchesScope(w.name)).length})`}
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#DDE3EC]">
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Name
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Summons sent
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Examined
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    Statement
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {(mock?.witnesses || [])
                  .filter((w) => matchesScope(w.name))
                  .map((w, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 font-medium text-[#1A1A2E]">
                        {w.name}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {w.summonsSent ? "Yes" : "No"}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {w.examined ? "Yes" : "No"}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {w.statementRecorded ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-[#9CA3AF]">
              Witness data is mock — wire to Witness table when available.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

function EvidenceTab({ actSectionDetails, mock, caseData, matchesScope }) {
  return (
    <div className="space-y-4">
      <Section
        title="Acts & Sections — authoritative"
        badge={{ label: "Fact", tone: "fact" }}
      >
        <div className="space-y-3">
          {actSectionDetails
            .filter((x) => matchesScope(x.actId) || matchesScope(x.sectionId))
            .map((item, i) => (
              <div key={i} className="border border-[#DDE3EC] bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1A2E]">
                    {item.actMeta?.fullName || item.actId} /{" "}
                    {item.sectionMeta?.title
                      ? `Section ${item.sectionId} — ${item.sectionMeta.title}`
                      : `Section ${item.sectionId}`}
                  </span>
                  {item.sectionMeta?.bailable !== undefined && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.sectionMeta.bailable ? "border border-[#2D6A4F] text-[#2D6A4F]" : "bg-[#D62828] text-white"}`}
                    >
                      {item.sectionMeta.bailable ? "Bailable" : "Non-Bailable"}
                    </span>
                  )}
                </div>
                {item.sectionMeta?.plain_language && (
                  <p className="mt-1 text-xs leading-relaxed text-[#374151]">
                    {item.sectionMeta.plain_language}
                  </p>
                )}
                <div className="mt-1 flex gap-3 text-[10px] font-medium">
                  {(item.sectionMeta?.indiacode_url ||
                    item.actMeta?.indiacode_url) && (
                    <a
                      href={
                        item.sectionMeta?.indiacode_url ||
                        item.actMeta?.indiacode_url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#1A1A2E] underline"
                    >
                      <ExternalLink size={10} />
                      IndiaCode
                    </a>
                  )}
                  {(item.sectionMeta?.kanoon_url ||
                    item.actMeta?.kanoon_url) && (
                    <a
                      href={
                        item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#1A1A2E] underline"
                    >
                      <ExternalLink size={10} />
                      Indian Kanoon
                    </a>
                  )}
                  {item.sectionMeta?.punishment && (
                    <span className="text-[#6B7280]">
                      {item.sectionMeta.punishment}
                    </span>
                  )}
                </div>
              </div>
            ))}
          {actSectionDetails.length === 0 && (
            <p className="text-xs text-[#6B7280]">No acts recorded.</p>
          )}
        </div>
        {actSectionDetails.some((x) => x.actId === "IPC") && (
          <div className="mt-4 border border-amber-200 bg-[#FFFBEB] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">
              Replaced by Bharatiya Nyaya Sanhita (BNS) from 1 July 2024
            </p>
            <p className="mt-1 text-xs text-[#78350F]">
              Cases before 1 July 2024 continue under IPC. New FIRs use BNS
              sections — verify mapping before chargesheet.
            </p>
          </div>
        )}
      </Section>
      <Section
        title="Court, proof & FSL — single source"
        badge={{ label: "Fact", tone: "fact" }}
      >
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Applicable court
            </p>
            <p className="font-medium text-[#1A1A2E]">
              {mock?.court.courtType}{" "}
              <span className="text-[10px] font-normal text-[#9CA3AF]">
                · mock
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Bail
            </p>
            <p className="font-medium text-[#1A1A2E]">
              {mock?.court.bailGrantableBy}{" "}
              <span className="text-[10px] font-normal text-[#9CA3AF]">
                · mock
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Property
            </p>
            <p className="text-xs text-[#1A1A2E]">
              {mock?.property.items}{" "}
              <span className="text-[10px] text-[#9CA3AF]">· mock</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              FSL
            </p>
            <p className="text-xs text-[#1A1A2E]">
              {mock?.fsl.status}{" "}
              {mock?.fsl.sentDate && `· sent ${formatDate(mock.fsl.sentDate)}`}{" "}
              {mock?.fsl.reportReceived &&
                `· report ${formatDate(mock.fsl.reportDate)}`}{" "}
              <span className="text-[10px] text-[#9CA3AF]">· mock</span>
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Standard proof for chargesheet
            </p>
            <p className="text-xs text-[#374151]">
              FIR + arrest memo + seizure panchanama + witness statements + FSL
              report + medical report + CDR/location where relevant.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function InvestigationProgress({ caseData, caseIntel, mock, chargesheet }) {
  const rawItems = [
    {
      label: "FIR registered",
      done: true,
      detail: formatDate(caseData.CrimeRegisteredDate),
    },
    {
      label: "Accused arrested",
      done:
        (mock?.mockAccused.filter((a) => a.arrestStatus === "Arrested")
          .length || 0) > 0,
      detail:
        `${mock?.mockAccused.filter((a) => a.arrestStatus === "Arrested").length || 0}/${mock?.mockAccused.length || 0} arrested` +
        (mock?.mockAccused.filter((a) => a.arrestStatus === "Absconding")
          .length || 0
          ? ` · ${mock.mockAccused.filter((a) => a.arrestStatus === "Absconding").length} absconding`
          : ""),
    },
    {
      label: "Remand obtained",
      done: mock?.mockAccused.some((a) => a.bailStatus === "Remand"),
      detail: mock?.mockAccused.some((a) => a.bailStatus === "Remand")
        ? "Remand recorded"
        : "Pending",
    },
    {
      label: "Property seized",
      done: mock?.property.seized,
      detail: mock?.property.items,
    },
    {
      label: "FSL sent",
      done: mock?.fsl.sent,
      detail: mock?.fsl.sent
        ? `Sent ${formatDate(mock.fsl.sentDate)}`
        : "Pending",
      overdue: mock?.fsl.status === "overdue",
    },
    {
      label: "FSL report received",
      done: mock?.fsl.reportReceived,
      detail: mock?.fsl.reportReceived
        ? formatDate(mock.fsl.reportDate)
        : "Overdue",
      overdue: !mock?.fsl.reportReceived && mock?.fsl.status === "overdue",
    },
    {
      label: "Witnesses examined",
      done:
        (mock?.witnesses.filter((w) => w.examined).length || 0) ===
        (mock?.witnesses.length || 0),
      detail: `${mock?.witnesses.filter((w) => w.examined).length || 0}/${mock?.witnesses.length || 0} examined`,
    },
    {
      label: "Statements recorded",
      done:
        (mock?.victimStatements.filter(Boolean).length || 0) >=
        (caseIntel?.victims?.length || 0) / 2,
      detail: `${mock?.victimStatements.filter(Boolean).length || 0}/${caseIntel?.victims?.length || 0} victims`,
    },
    {
      label: `Chargesheet filed (${chargesheet?.limitDays || 60}d limit)`,
      done: false,
      detail: chargesheet
        ? chargesheet.diff < 0
          ? `Overdue by ${Math.abs(chargesheet.diff)}d`
          : `Due in ${chargesheet.diff}d`
        : "—",
      overdue:
        chargesheet?.tone === "overdue" || chargesheet?.tone === "critical",
    },
  ];
  const items = rawItems.map((it) => {
    const isDone = it.done;
    const isOverdue = !isDone && it.overdue;
    const isPending = !isDone && !isOverdue && it.detail === "Pending";
    const isInProgress = !isDone && !isOverdue && !isPending;
    const hasProgress =
      !isDone &&
      !isOverdue &&
      /\d+\/\d+/.test(it.detail) &&
      !it.detail.startsWith("0/");
    let tone = "pending";
    if (isDone) tone = "done";
    else if (isOverdue) tone = "overdue";
    else if (hasProgress || isInProgress) tone = "progress";
    return { ...it, tone };
  });
  return (
    <Section
      title="Investigation Progress"
      badge={{ label: "Fact", tone: "fact" }}
    >
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div
            key={i}
            className={`flex items-center justify-between border px-3 py-2 text-sm ${it.tone === "done" ? "border-[#2D6A4F]/30 bg-[#F0FDF4]" : it.tone === "overdue" ? "border-[#D62828]/30 bg-[#FEF2F2]" : "border-[#DDE3EC] bg-white"}`}
          >
            <span
              className={`flex items-center gap-2 font-medium ${it.tone === "done" ? "text-[#2D6A4F]" : it.tone === "overdue" ? "text-[#D62828]" : "text-[#1A1A2E]"}`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center border text-[10px] ${it.tone === "done" ? "border-[#2D6A4F] bg-[#2D6A4F] text-white" : it.tone === "overdue" ? "border-[#D62828] text-[#D62828]" : it.tone === "progress" ? "border-[#C85A00] text-[#C85A00]" : "border-[#DDE3EC] text-[#6B7280]"}`}
              >
                {it.tone === "done" ? "✓" : it.tone === "overdue" ? "!" : "○"}
              </span>
              {it.label}
            </span>
            <span
              className={`text-xs ${it.tone === "overdue" ? "font-semibold text-[#D62828]" : "text-[#6B7280]"}`}
            >
              {it.detail}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TimelineTab({ caseData, mock, caseIntel, chargesheet }) {
  const events = mock?.timeline || [];
  return (
    <div className="space-y-4">
      <InvestigationProgress
        caseData={caseData}
        caseIntel={caseIntel}
        mock={mock}
        chargesheet={chargesheet}
      />
      <Section title="Case progression" badge={{ label: "Fact", tone: "fact" }}>
        <div className="relative border-l border-[#DDE3EC] pl-6">
          {events.map((ev, i) => (
            <div key={i} className="relative mb-6">
              <span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#1A1A2E]" />
              <p className="ksp-mono text-xs font-semibold text-[#1A1A2E]">
                {formatMonoDate(ev.date)}
              </p>
              <p className="text-sm font-semibold text-[#1A1A2E]">{ev.title}</p>
              <p className="text-xs text-[#6B7280]">{ev.detail}</p>
            </div>
          ))}
          <div className="relative mb-2">
            <span className="absolute -left-[25px] top-1 h-2 w-2 border border-[#1A1A2E] bg-white" />
            <p className="ksp-mono text-xs font-semibold text-[#374151]">
              Registered {formatMonoDate(caseData.CrimeRegisteredDate)} · FIR
            </p>
            <p className="text-xs text-[#6B7280]">
              Incident {formatDate(caseData.IncidentFromDate)} at{" "}
              {caseData.UnitName}
            </p>
          </div>
          {mock?.fsl.status === "overdue" && (
            <div className="relative mb-2">
              <span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#D62828]" />
              <p className="ksp-mono text-xs font-semibold text-[#D62828]">
                TODAY — FSL report pending
              </p>
              <p className="text-xs text-[#6B7280]">
                Sent {formatDate(mock.fsl.sentDate)} · overdue
              </p>
            </div>
          )}
          <div className="relative">
            <span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#D62828]" />
            <p className="ksp-mono text-xs font-bold text-[#D62828]">
              {formatMonoDate(mock?.court.nextHearingDate)} — COURT HEARING
            </p>
            <p className="text-xs text-[#6B7280]">{mock?.court.purpose}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-[#9CA3AF]">
          Timeline is mock-seeded per caseId (deterministic). Wire to
          ArrestSurrender / CourtHearings / FSL tables when available.
        </p>
      </Section>
    </div>
  );
}

function IntelTab({ similarCases, caseData, mock, matchesScope, onAsk }) {
  const filtered = similarCases.filter(
    (s) => matchesScope(s.CrimeNo) || matchesScope(s.CrimeGroupName),
  );
  const byStation = filtered.reduce((acc, s) => {
    const k = s.UnitName || "Unknown";
    (acc[k] = acc[k] || []).push(s);
    return acc;
  }, {});
  return (
    <div className="space-y-4">
      <Section
        title="Co-accused links"
        badge={{ label: "System-derived", tone: "intel" }}
      >
        <p className="text-sm text-[#1A1A2E]">
          {filtered.filter((s) => s.shared_accused_count > 0).length > 0
            ? `${filtered.filter((s) => s.shared_accused_count > 0).length} cases share accused with this FIR`
            : "No co-accused links detected."}
        </p>
        <div className="mt-3 space-y-2">
          {Object.entries(byStation)
            .slice(0, 3)
            .map(([station, arr]) => (
              <p key={station} className="text-xs text-[#374151]">
                {arr.length} accused appear in {arr.length} other FIRs at{" "}
                {station}{" "}
                <span className="text-[#6B7280]">
                  —{" "}
                  {arr
                    .slice(0, 2)
                    .map((a) => a.CrimeNo)
                    .join(", ")}
                </span>
              </p>
            ))}
        </div>
        {filtered.filter((s) => s.shared_accused_count > 0).length > 0 && (
          <button
            onClick={() =>
              onAsk && onAsk("Are these accused connected to other burglaries?")
            }
            className="mt-3 border border-[#1A1A2E] bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white"
          >
            Ask CrimeLens about links →
          </button>
        )}
      </Section>
      <Section
        title={`Similar MO — ${filtered.length} cases`}
        badge={{ label: "System-derived", tone: "intel" }}
      >
        <div className="space-y-2">
          {filtered.map((s) => (
            <div
              key={s.CaseMasterID}
              className="border border-[#DDE3EC] bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <span className="ksp-mono text-xs font-bold text-[#1A1A2E]">
                  {s.CrimeNo} · {s.DistrictName || s.UnitName}
                </span>
                <span className="border border-[#DDE3EC] bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#374151]">
                  {s.similarity || "Similar"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                Why similar
              </p>
              <p className="text-xs text-[#374151]">
                {s.reasons?.slice(0, 3).join(" · ") ||
                  [s.CrimeGroupName, s.Gravity].filter(Boolean).join(" · ")}
              </p>
              {(s.shared_accused_count > 0 || s.shared_act_count > 0) && (
                <p className="mt-1 text-[11px] font-medium text-[#1A1A2E]">
                  {s.shared_accused_count > 0 &&
                    `${s.shared_accused_count} shared accused`}{" "}
                  {s.shared_accused_count > 0 && s.shared_act_count > 0 && "·"}{" "}
                  {s.shared_act_count > 0 &&
                    `${s.shared_act_count} shared acts`}
                </p>
              )}
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() =>
                    onAsk && onAsk(`Compare this case with ${s.CrimeNo}`)
                  }
                  className="border border-[#DDE3EC] bg-white px-2 py-1 text-[11px] font-medium text-[#1A1A2E] hover:border-[#1A1A2E]"
                >
                  Compare
                </button>
                <button
                  onClick={() => onAsk && onAsk(`Tell me about ${s.CrimeNo}`)}
                  className="border border-[#1A1A2E] bg-[#1A1A2E] px-2 py-1 text-[11px] font-medium text-white"
                >
                  Ask about this
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-[#6B7280]">
              No matches for scoped query.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
