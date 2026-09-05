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
    if (abscond) parts.push(t("workspace.health.absconding", { count: abscond }));
    if (mock.fsl.status === "overdue" || mock.fsl.status === "pending")
      parts.push(t("workspace.health.fslStatus", { status: mock.fsl.status }));
    const onTrack = chargesheet?.diff > 14 ? t("workspace.health.chargesheetOnTrack") : t("workspace.health.chargesheetAtRisk");
    parts.push(`chargesheet ${onTrack}`);
    if (mock.witnesses.filter((w) => !w.examined).length)
      parts.push(
        t("workspace.health.witnessesPending", {
          count: mock.witnesses.filter((w) => !w.examined).length,
        }),
      );
    return parts.join(" · ");
  }, [caseData, mock, chargesheet, t]);
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
        res?.data?.answer || res?.answer || res?.response || t("workspace.copilot.noResponse");
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
          content: t("workspace.copilot.errorFallback"),
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatSending(false);
    }
  };
  const copilotPlaceholder = useMemo(() => {
    const map = {
      overview: t("workspace.copilot.placeholders.overview"),
      people: t("workspace.copilot.placeholders.people"),
      evidence: t("workspace.copilot.placeholders.evidence"),
      timeline: t("workspace.copilot.placeholders.timeline"),
      intel: t("workspace.copilot.placeholders.intel"),
    };
    return map[activeTab] || t("workspace.copilot.placeholders.default");
  }, [activeTab, t]);
  const starterPrompts = useMemo(() => {
    const base = {
      overview: [
        t("workspace.copilot.prompts.overview0"),
        t("workspace.copilot.prompts.overview1"),
        t("workspace.copilot.prompts.overview2"),
      ],
      people: [
        t("workspace.copilot.prompts.people0"),
        t("workspace.copilot.prompts.people1"),
        t("workspace.copilot.prompts.people2"),
      ],
      evidence: [
        t("workspace.copilot.prompts.evidence0"),
        t("workspace.copilot.prompts.evidence1"),
        t("workspace.copilot.prompts.evidence2"),
      ],
      timeline: [
        t("workspace.copilot.prompts.timeline0"),
        t("workspace.copilot.prompts.timeline1"),
        t("workspace.copilot.prompts.timeline2"),
      ],
      intel: [
        t("workspace.copilot.prompts.intel0"),
        t("workspace.copilot.prompts.intel1"),
        t("workspace.copilot.prompts.intel2"),
      ],
    };
    return base[activeTab] || base.overview;
  }, [activeTab, t]);

  if (loading)
    return (
      <div className="ksp-workspace flex h-full items-center justify-center bg-[#F4F6F9]">
        <Loader2 className="animate-spin text-[#6B7280]" size={22} />
        <span className="ml-2 text-sm text-[#374151]">{t("workspace.loading")}</span>
      </div>
    );
  if (!caseData)
    return (
      <div className="ksp-workspace p-8 text-sm text-[#374151]">
        {t("workspace.notFound.title")}{" "}
        <button
          onClick={() => navigate("/investigations")}
          className="underline"
        >
          {t("workspace.notFound.backToQueue")}
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
            {t("workspace.header.crimeNo")} {caseData.CrimeNo || `#${caseData.CaseMasterID}`}
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
              {t("workspace.header.chargesheetLate", { count: Math.abs(chargesheet.diff) })}
            </span>
          )}
          {chargesheet?.tone === "critical" && (
            <span className="bg-[#C85A00] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
              {t("workspace.header.dueIn", { count: chargesheet.diff })}
            </span>
          )}
          <span className="hidden h-4 w-px bg-[#E5E7EB] sm:block" />
          <span className="text-xs text-[#4B5563]">
            <span className="font-bold text-[#1A1A2E]">
              {t("workspace.header.io", { name: caseData.FirstName || "—" })}
            </span>{" "}
            <span className="text-[#9CA3AF]">·</span>{" "}
            {caseData.CaseStatusName || t("workspace.header.open")}
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
            ["overview", t("workspace.tabs.caseBrief")],
            ["people", t("workspace.tabs.people")],
            ["evidence", t("workspace.tabs.evidence")],
            ["timeline", t("workspace.tabs.timeline")],
            ["intel", t("workspace.tabs.intel")],
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
                placeholder={t("workspace.header.searchPlaceholder")}
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
                {t("workspace.gate.noEscalation")}
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                {t("workspace.gate.sub")}
              </p>
              <button
                onClick={() => {
                  const sp = new URLSearchParams(location.search);
                  sp.set("tab", "overview");
                  setSearchParams(sp, { replace: true });
                }}
                className="mt-4 border border-[#1A1A2E] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#1A1A2E] hover:bg-[#F4F6F9]"
              >
                {t("workspace.gate.viewFull")}
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
              <span className="block text-xs font-semibold leading-none text-[#1A1A2E]">
                {t("workspace.copilot.askCrimeLens")}
              </span>
              <span className="hidden truncate text-[11px] leading-tight text-[#6B7280] sm:block">
                {copilotPlaceholder}
              </span>
              <span className="block truncate text-[11px] leading-tight text-[#6B7280] sm:hidden">
                {t("workspace.copilot.tapToAsk")}
              </span>
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
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#1A1A2E]">
                  {t("workspace.copilot.caseCopilot")}
                </p>
                <p className="ksp-mono text-[11px] text-[#6B7280]">
                  {caseData.CrimeNo}
                </p>
              </div>
              <button
                onClick={() => setCopilotOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            {chatMessages.length === 0 && (
              <div className="px-4 py-4 border-b border-slate-200 bg-white">
                <p className="text-xs font-semibold text-slate-800 mb-2.5">
                  {t("workspace.copilot.whatHelp")}
                </p>
                <div className="flex flex-col gap-2">
                  {starterPrompts.map((q, idx) => (
                    <button
                      key={q}
                      onClick={() => handleChatSend(q)}
                      style={{ animationDelay: `${idx * 60}ms` }}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-[13.5px] font-medium leading-5 text-slate-800 shadow-sm transition-all hover:border-red-200 hover:bg-red-50/40 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A1A2E] text-white shadow-sm transition-colors group-hover:bg-red-600">
                        <ArrowRight size={12} />
                      </span>
                      <span className="flex-1">{q}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                  {t("workspace.copilot.contextLine", {
                    group: caseData.CrimeGroupName,
                    accusedCount: caseIntel?.accused?.length || 0,
                    relatedCount: similarCases.length,
                    fsl: mock?.fsl.status,
                  })}
                </p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-white">
              {chatMessages.length === 0 && (
                <p className="text-[13px] leading-6 text-slate-500">
                  {t("workspace.copilot.emptyHint", { count: similarCases.length })}
                </p>
              )}
              {chatMessages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-red-50 px-4 py-2.5 text-[14px] leading-6 text-slate-900 shadow-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl bg-slate-100 px-4 py-2.5 text-[14px] leading-6 text-slate-800 shadow-sm">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-1.5 leading-6 last:mb-0">
                              {children}
                            </p>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-slate-900">
                              {children}
                            </strong>
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
                  <div className="rounded-2xl bg-slate-100 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" />
                      <span
                        className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
                        style={{ animationDelay: ".15s" }}
                      />
                      <span
                        className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
                        style={{ animationDelay: ".3s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-4">
              <div className="flex items-end gap-2 rounded-[28px] border border-slate-300 bg-white px-3 py-2 shadow-sm focus-within:border-slate-400 transition">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                  placeholder={copilotPlaceholder}
                  className="flex-1 bg-transparent px-2 py-2 text-sm placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  onClick={() => handleChatSend()}
                  disabled={chatSending || !chatInput.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A1A2E] text-white shadow-sm transition hover:bg-black disabled:opacity-40 cursor-pointer"
                >
                  <Send size={14} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-[10px] text-slate-400">
                  {t("workspace.copilot.auditable")}
                </span>
                {chatMessages.length > 0 && (
                  <button
                    onClick={() => {
                      setChatMessages([]);
                      localStorage.removeItem(chatKey);
                    }}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-[#D62828] transition cursor-pointer"
                  >
                    <Trash2 size={11} /> {t("workspace.copilot.clear")}
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
  const { t } = useTranslation();
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
        {t("workspace.synopsis.reportedOn")}{" "}
        <span className="font-bold text-[#1A1A2E]">
          {formatDate(caseData.CrimeRegisteredDate)}
        </span>{" "}
        {t("workspace.synopsis.at")}{" "}
        <span className="font-bold text-[#1A1A2E]">
          {caseData.UnitName || "—"}
        </span>
        {caseData.DistrictName ? t("workspace.synopsis.districtSuffix", { district: caseData.DistrictName }) : ""} {t("workspace.synopsis.andRegistered")}{" "}
        <span className="ksp-mono font-semibold text-[#1A1A2E]">
          {caseData.CrimeNo}
        </span>
        .
      </p>
      <p>
        {t("workspace.synopsis.classified")}{" "}
        <span className="font-bold text-[#1A1A2E]">
          {caseData.Gravity || "—"}
        </span>
        .{" "}
        {charges ? (
          <>
            {t("workspace.synopsis.chargedUnder")}{" "}
            <span className="font-bold text-[#1A1A2E]">{charges}</span>.
          </>
        ) : (
          t("workspace.synopsis.noActs")
        )}
      </p>
      <p className="text-[13px] text-[#6B7280]">
        {t("workspace.synopsis.note")}
      </p>
    </div>
  );
}

function PeopleNarrative({ caseIntel, mock }) {
  const { t } = useTranslation();
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
        <span className="font-bold text-[#1A1A2E]">{t("workspace.people.accusedCount", { count: rows.length })}</span>{" "}
        {t("workspace.people.identified")}
        {arrested ? t("workspace.people.arrestedFrag", { count: arrested }) : t("workspace.people.noneArrested")}
        {absconding ? t("workspace.people.stillAtLarge", { count: absconding }) : ""}.
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
                {t("workspace.people.ageGender", { age: a.AgeYear, gender: a.GenderID })}
                {m.priorCases ? t("workspace.people.priorCasesFrag", { count: m.priorCases }) : ""}
              </p>
            </div>
            {m.arrestStatus === "Absconding" ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#D62828]/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[#D62828]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D62828]" />
                {t("workspace.people.absconding")}
              </span>
            ) : m.arrestStatus === "Arrested" ? (
              <span className="rounded-sm bg-[#2D6A4F]/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[#2D6A4F]">
                {t("workspace.people.arrestedWithDate", { date: formatDate(m.arrestDate) })}
              </span>
            ) : (
              <span className="rounded-sm bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                {m.bailStatus || t("workspace.people.onRecord")}
              </span>
            )}
            {m.warrantIssued && (
              <span className="rounded-sm border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-[#92400E]">
                {t("workspace.people.warrant")}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#6B7280]">
        {t("workspace.people.victimsLine", {
          count: victims.length,
          victimWord: victims.length === 1 ? t("workspace.people.victim") : t("workspace.people.victims"),
          examined,
          total: witnesses.length,
        })}
      </p>
    </div>
  );
}

function ChargesNarrative({ actSectionDetails }) {
  const { t } = useTranslation();
  if (!actSectionDetails.length)
    return (
      <p className="text-sm text-[#6B7280]">
        {t("workspace.charges.noActsVerify")}
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
              {item.actMeta?.fullName || item.actId} — {t("workspace.charges.sectionWord")}{" "}
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
                {item.sectionMeta.bailable ? t("workspace.dossier.bailable") : t("workspace.dossier.nonBailable")}
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
                {t("workspace.dossier.indiaCode")}
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
                {t("workspace.dossier.indianKanoon")}
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
  const { t } = useTranslation();
  const isField = rank === "ASI" || rank === "HC";
  if (isField) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-[#FFFBEB] px-4 py-3 text-xs leading-relaxed text-[#92400E]">
          {t("workspace.field.focusedTask")}
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
            {t("workspace.field.whereToGo")}
          </p>
          <p className="mt-1 text-sm text-[#1A1A2E]">
            {mock.property.items}{" "}
            <span className="ml-1 text-[10px] text-[#9CA3AF]">{t("workspace.field.mockBadge")}</span>
          </p>
          <p className="mt-1 text-xs text-[#374151]">
            {t("workspace.field.station")} {caseData.UnitName} · {t("workspace.field.district")} {caseData.DistrictName}
          </p>
          {caseData.latitude && caseData.longitude && (
            <a
              href={`https://www.google.com/maps?q=${caseData.latitude},${caseData.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1A1A2E] underline"
            >
              {t("workspace.field.viewOnMap")} <ExternalLink size={12} />
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
                  {t("workspace.dossier.title")}
                </h2>
                <p className="ksp-mono text-[10.5px] text-[#6B7280]">
                  {caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}
                  {caseData.Gravity ? ` · ${caseData.Gravity}` : ""}
                </p>
              </div>
              <span className="ml-auto rounded-sm bg-blue-900/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                {t("workspace.dossier.daysSinceFIR", { count: ageDays })}
              </span>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
              <DossierSection title={t("workspace.dossier.summaryTitle")}>
                <Synopsis
                  caseData={caseData}
                  actSectionDetails={actSectionDetails}
                />
              </DossierSection>
              <DossierSection
                eyebrow={t("workspace.dossier.peopleEyebrow")}
                title={t("workspace.dossier.peopleTitle")}
              >
                <PeopleNarrative caseIntel={caseIntel} mock={mock} />
              </DossierSection>
              <DossierSection
                eyebrow={t("workspace.dossier.legalEyebrow")}
                title={t("workspace.dossier.legalTitle")}
              >
                <ChargesNarrative actSectionDetails={actSectionDetails} />
              </DossierSection>
              {caseData.BriefFacts && (
                <DossierSection
                  eyebrow={t("workspace.dossier.firTranscript", { count: caseData.BriefFacts.length })}
                  title={t("workspace.dossier.firOwnWords")}
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
                {t("workspace.dossier.peopleLink")}
              </button>
              <span className="text-[#DDE3EC]">·</span>
              <button
                onClick={() => onNavigate("evidence")}
                className="text-[11px] font-bold text-[#1A1A2E] hover:underline"
              >
                {t("workspace.dossier.evidenceLink")}
              </button>
              <span className="text-[#DDE3EC]">·</span>
              <button
                onClick={() => onNavigate("timeline")}
                className="text-[11px] font-bold text-[#1A1A2E] hover:underline"
              >
                {t("workspace.dossier.timelineLink")}
              </button>
              <span className="ml-auto text-[10px] text-[#9CA3AF]">
                {t("workspace.dossier.detailsInTabs")}
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
  const { t } = useTranslation();
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
  const courtPurpose = mock?.court.purpose;

  let state;
  if (abscond > 0) {
    state = {
      tone: "critical",
      kicker: t("workspace.banner.abscondKicker"),
      title: t("workspace.banner.abscondTitle", { count: abscond }),
      body: abscond === accused.length ? t("workspace.banner.abscondBodyAll", { hearingDate, purpose: courtPurpose, months: ageMo }) : t("workspace.banner.abscondBodyNamed", { hearingDate, purpose: courtPurpose, names: absconders.map((a) => a.AccusedName).join(", "), months: ageMo }),
      action: t("workspace.banner.abscondAction"),
      ask: t("workspace.banner.abscondAsk"),
    };
  } else if (chargesheet?.tone === "overdue") {
    state = {
      tone: "critical",
      kicker: t("workspace.banner.overdueKicker"),
      title: t("workspace.banner.overdueTitle", { count: Math.abs(chargesheet.diff), limit: chargesheet.limitDays }),
      body: t("workspace.banner.overdueBody", { fslFrag: fslOverdue ? t("workspace.banner.overdueBodyFsl") : t("workspace.banner.overdueBodyConfirm") }),
      action: t("workspace.banner.overdueAction"),
      ask: t("workspace.banner.overdueAsk"),
    };
  } else if (fslOverdue) {
    state = {
      tone: "critical",
      kicker: t("workspace.banner.fslKicker"),
      title: t("workspace.banner.fslTitle"),
      body: t("workspace.banner.fslBody", { sentDate: formatDate(mock.fsl.sentDate) }),
      action: t("workspace.banner.fslAction"),
      ask: t("workspace.banner.fslAsk"),
    };
  } else if (chargesheet?.tone === "critical") {
    state = {
      tone: "warning",
      kicker: t("workspace.banner.criticalKicker"),
      title: t("workspace.banner.criticalTitle", { count: chargesheet.diff }),
      body: t("workspace.banner.criticalBody", { limit: chargesheet.limitDays, base: chargesheet.isArrestBased ? t("workspace.banner.criticalBaseArrest") : t("workspace.banner.criticalBaseFIR") }),
      action: t("workspace.banner.criticalAction"),
      ask: t("workspace.banner.criticalAsk"),
    };
  } else if (witnessesPending) {
    state = {
      tone: "warning",
      kicker: t("workspace.banner.witnessKicker"),
      title: t("workspace.banner.witnessTitle", { count: witnessesPending }),
      body: t("workspace.banner.witnessBody", { hearingDate, purpose: courtPurpose }),
      action: t("workspace.banner.witnessAction"),
      ask: t("workspace.banner.witnessAsk"),
    };
  } else {
    state = {
      tone: "ok",
      kicker: t("workspace.banner.okKicker"),
      title: t("workspace.banner.okTitle"),
      body:
        (inspectorHealth ? `${inspectorHealth}. ` : "") +
        t("workspace.banner.okBody", { hearingDate, purpose: courtPurpose }),
      action: t("workspace.banner.okAction"),
      ask: t("workspace.banner.okAsk"),
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
  const { t } = useTranslation();
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
            {t("workspace.intelDrawer.title", { count: similarCases.length })}
          </p>
          <p className="text-[11.5px] text-[#6B7280]">
            {shared ? t("workspace.intelDrawer.sharedPeople", { count: shared }) : t("workspace.intelDrawer.similarMO")} ·{" "}
            {t("workspace.intelDrawer.districts", { count: districts, word: districts === 1 ? t("workspace.intelDrawer.district") : t("workspace.intelDrawer.districtsPlural") })} · {t("workspace.intelDrawer.surfaced")}
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
                    {t("workspace.intelDrawer.sharedAccused", { count: s.shared_accused_count })}
                  </span>
                )}
                <button
                  onClick={() => onAsk && onAsk(`Tell me about ${s.CrimeNo}`)}
                  className="border border-[#1A1A2E] bg-white px-2 py-1 text-[11px] font-semibold text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white"
                >
                  {t("workspace.intelDrawer.ask")}
                </button>
              </div>
            </div>
          ))}
          <div className="px-5 py-3">
            <button
              onClick={onOpenIntel}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3730A3] hover:underline"
            >
              {t("workspace.intelDrawer.openIntel")} <ArrowRight size={12} />
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
  const { t } = useTranslation();
  return (
    <SidebarPanel title={t("workspace.side.keyFacts")} icon={<Users size={13} />}>
      <MetaRow label={t("workspace.side.station")} value={caseData.UnitName || "—"} />
      <MetaRow label={t("workspace.side.district")} value={caseData.DistrictName || "—"} />
      <MetaRow
        label={t("workspace.side.crimeGroup")}
        value={caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}
      />
      <MetaRow label={t("workspace.side.status")} value={caseData.CaseStatusName || t("workspace.header.open")} />
      <MetaRow label={t("workspace.side.io")} value={caseData.FirstName || "—"} />
      <MetaRow
        label={t("workspace.side.registered")}
        value={formatDate(caseData.CrimeRegisteredDate)}
      />
      {coords && (
        <MetaRow
          label={t("workspace.side.coordinates")}
          value={<span className="ksp-mono">{coords}</span>}
        />
      )}
    </SidebarPanel>
  );
}

function DeadlinesPanel({ mock, chargesheet }) {
  const { t } = useTranslation();
  const csTone =
    chargesheet?.tone === "critical"
      ? "warn"
      : chargesheet?.tone === "overdue"
        ? "danger"
        : "ok";
  const csValue = chargesheet
    ? chargesheet.diff < 0
      ? t("workspace.side.dLate", { count: Math.abs(chargesheet.diff) })
      : t("workspace.side.dLeft", { count: chargesheet.diff })
    : "—";
  const csSub = chargesheet
    ? t("workspace.side.limitSub", { limit: chargesheet.limitDays, base: chargesheet.isArrestBased ? t("workspace.side.fromArrest") : t("workspace.side.fromFIR") })
    : null;
  const fslVal = mock?.fsl.reportReceived
    ? t("workspace.side.fslReported", { date: formatDate(mock.fsl.reportDate) })
    : mock?.fsl.status === "overdue"
      ? t("workspace.side.fslOverdue")
      : mock?.fsl.sent
        ? t("workspace.side.fslAwaiting")
        : t("workspace.side.fslNotSent");
  return (
    <SidebarPanel title={t("workspace.side.deadlines")} icon={<FileClock size={13} />}>
      <MetaRow
        label={t("workspace.side.nextHearing")}
        value={formatDate(mock?.court.nextHearingDate)}
      />
      <MetaRow label={t("workspace.side.purpose")} value={mock?.court.purpose} />
      <MetaRow
        label={t("workspace.side.court")}
        value={t("workspace.side.courtValue", { court: mock?.court.courtType, by: mock?.court.bailGrantableBy })}
      />
      <MetaRow label={t("workspace.side.chargesheet")} value={csValue} tone={csTone} />
      {csSub && <MetaRow label={t("workspace.side.limit")} value={csSub} />}
      <MetaRow
        label={t("workspace.side.fsl")}
        value={fslVal}
        tone={mock?.fsl.status === "overdue" ? "danger" : "ok"}
      />
      <MetaRow label={t("workspace.side.property")} value={mock?.property.items} />
    </SidebarPanel>
  );
}

function SideMap({ caseData, coords, mapEmbedSrc, mapsHref }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="relative h-40 bg-[#F4F6F9]">
        <iframe
          title={t("workspace.side.mapTitle")}
          src={mapEmbedSrc}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <MapPin size={20} className="text-[#D62828]" aria-hidden />
          <span className="rounded-sm bg-[#1A1A2E] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            {t("workspace.side.incident")}
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
              : t("workspace.side.searchByStation")}
          </p>
        </div>
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#1A1A2E] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black"
        >
          {t("workspace.side.openMaps")} <ExternalLink size={11} />
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
  const { t } = useTranslation();
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
        title={t("workspace.peopleTab.accusedTitle", { count: filteredRows.length, suffix: taskOnly ? t("workspace.peopleTab.taskRelevant") : "" })}
        badge={{ label: t("workspace.peopleTab.fact"), tone: "fact" }}
      >
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#DDE3EC]">
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  {t("workspace.peopleTab.thName")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  {t("workspace.peopleTab.thAge")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  {t("workspace.peopleTab.thArrest")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  {t("workspace.peopleTab.thBail")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  {t("workspace.peopleTab.thPrior")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  {t("workspace.peopleTab.thActions")}
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
                        {t("workspace.people.abscondingBadge")}
                      </span>
                    )}{" "}
                    {m.warrantIssued && (
                      <span className="ml-1 border border-amber-300 bg-amber-100 px-1 text-[10px] font-bold uppercase text-[#92400E]">
                        {t("workspace.people.warrant")}
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
                    {t("workspace.peopleTab.priorCasesCell", { count: m.priorCases })}
                    {m.convictions ? t("workspace.peopleTab.convictionFrag", { count: m.convictions }) : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() =>
                        onAsk &&
                        onAsk(`What other FIRs involve ${a.AccusedName}?`)
                      }
                      className="text-[11px] font-semibold text-[#1A1A2E] underline"
                    >
                      {t("workspace.peopleTab.trace")}
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
                    {t("workspace.peopleTab.noAccused")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[#9CA3AF]">
          {t("workspace.peopleTab.mockNote")}
        </p>
      </Section>
      {showAll && (
        <>
          <Section
            title={t("workspace.peopleTab.victimsTitle", { count: (caseIntel?.victims || []).filter((v) => matchesScope(v.VictimName)).length })}
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#DDE3EC]">
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thName")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thAge")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thStatementRecorded")}
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
                            {t("workspace.peopleTab.police")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {v.AgeYear}y · {v.GenderID}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {(mock?.victimStatements[idx] ?? true) ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}{" "}
                        <span className="text-[10px] text-[#9CA3AF]">
                          {t("workspace.peopleTab.mockInline")}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Section>
          <Section
            title={t("workspace.peopleTab.witnessesTitle", { count: (mock?.witnesses || []).filter((w) => matchesScope(w.name)).length })}
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#DDE3EC]">
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thName")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thSummons")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thExamined")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                    {t("workspace.peopleTab.thStatement")}
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
                        {w.summonsSent ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {w.examined ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}
                      </td>
                      <td className="px-2 py-1.5 text-[#374151]">
                        {w.statementRecorded ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-[#9CA3AF]">
              {t("workspace.peopleTab.witnessNote")}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

function EvidenceTab({ actSectionDetails, mock, caseData, matchesScope }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Section
        title={t("workspace.evidence.actsTitle")}
        badge={{ label: t("workspace.peopleTab.fact"), tone: "fact" }}
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
                      ? `${t("workspace.evidence.sectionWord")} ${item.sectionId} — ${item.sectionMeta.title}`
                      : `${t("workspace.evidence.sectionWord")} ${item.sectionId}`}
                  </span>
                  {item.sectionMeta?.bailable !== undefined && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.sectionMeta.bailable ? "border border-[#2D6A4F] text-[#2D6A4F]" : "bg-[#D62828] text-white"}`}
                    >
                      {item.sectionMeta.bailable ? t("workspace.evidence.bailable") : t("workspace.evidence.nonBailable")}
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
                      {t("workspace.dossier.indiaCode")}
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
                      {t("workspace.dossier.indianKanoon")}
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
            <p className="text-xs text-[#6B7280]">{t("workspace.evidence.noActs")}</p>
          )}
        </div>
        {actSectionDetails.some((x) => x.actId === "IPC") && (
          <div className="mt-4 border border-amber-200 bg-[#FFFBEB] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">
              {t("workspace.evidence.bnsTitle")}
            </p>
            <p className="mt-1 text-xs text-[#78350F]">
              {t("workspace.evidence.bnsBody")}
            </p>
          </div>
        )}
      </Section>
      <Section
        title={t("workspace.evidence.courtProofTitle")}
        badge={{ label: t("workspace.peopleTab.fact"), tone: "fact" }}
      >
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              {t("workspace.evidence.applicableCourt")}
            </p>
            <p className="font-medium text-[#1A1A2E]">
              {mock?.court.courtType}{" "}
              <span className="text-[10px] font-normal text-[#9CA3AF]">
                {t("workspace.evidence.mockBadge")}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              {t("workspace.evidence.bail")}
            </p>
            <p className="font-medium text-[#1A1A2E]">
              {mock?.court.bailGrantableBy}{" "}
              <span className="text-[10px] font-normal text-[#9CA3AF]">
                {t("workspace.evidence.mockBadge")}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              {t("workspace.evidence.property")}
            </p>
            <p className="text-xs text-[#1A1A2E]">
              {mock?.property.items}{" "}
              <span className="text-[10px] text-[#9CA3AF]">{t("workspace.evidence.mockBadge")}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              {t("workspace.evidence.fsl")}
            </p>
            <p className="text-xs text-[#1A1A2E]">
              {mock?.fsl.status}{" "}
              {mock?.fsl.sentDate && t("workspace.evidence.sentFrag", { date: formatDate(mock.fsl.sentDate) })}{" "}
              {mock?.fsl.reportReceived &&
                t("workspace.evidence.reportFrag", { date: formatDate(mock.fsl.reportDate) })}{" "}
              <span className="text-[10px] text-[#9CA3AF]">{t("workspace.evidence.mockBadge")}</span>
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              {t("workspace.evidence.standardProof")}
            </p>
            <p className="text-xs text-[#374151]">
              {t("workspace.evidence.standardProofBody")}
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function InvestigationProgress({ caseData, caseIntel, mock, chargesheet }) {
  const { t } = useTranslation();
  const rawItems = [
    {
      label: t("workspace.progress.firRegistered"),
      done: true,
      detail: formatDate(caseData.CrimeRegisteredDate),
    },
    {
      label: t("workspace.progress.accusedArrested"),
      done:
        (mock?.mockAccused.filter((a) => a.arrestStatus === "Arrested")
          .length || 0) > 0,
      detail:
        t("workspace.progress.arrestedDetail", { arrested: mock?.mockAccused.filter((a) => a.arrestStatus === "Arrested").length || 0, total: mock?.mockAccused.length || 0 }) +
        (mock?.mockAccused.filter((a) => a.arrestStatus === "Absconding")
          .length || 0
          ? t("workspace.progress.abscondFrag", { count: mock.mockAccused.filter((a) => a.arrestStatus === "Absconding").length })
          : ""),
    },
    {
      label: t("workspace.progress.remandObtained"),
      done: mock?.mockAccused.some((a) => a.bailStatus === "Remand"),
      detail: mock?.mockAccused.some((a) => a.bailStatus === "Remand")
        ? t("workspace.progress.remandRecorded")
        : t("workspace.progress.pending"),
    },
    {
      label: t("workspace.progress.propertySeized"),
      done: mock?.property.seized,
      detail: mock?.property.items,
    },
    {
      label: t("workspace.progress.fslSent"),
      done: mock?.fsl.sent,
      detail: mock?.fsl.sent
        ? t("workspace.progress.sentDetail", { date: formatDate(mock.fsl.sentDate) })
        : t("workspace.progress.pending"),
      overdue: mock?.fsl.status === "overdue",
    },
    {
      label: t("workspace.progress.fslReceived"),
      done: mock?.fsl.reportReceived,
      detail: mock?.fsl.reportReceived
        ? formatDate(mock.fsl.reportDate)
        : t("workspace.progress.overdueWord"),
      overdue: !mock?.fsl.reportReceived && mock?.fsl.status === "overdue",
    },
    {
      label: t("workspace.progress.witnessesExamined"),
      done:
        (mock?.witnesses.filter((w) => w.examined).length || 0) ===
        (mock?.witnesses.length || 0),
      detail: t("workspace.progress.examinedDetail", { done: mock?.witnesses.filter((w) => w.examined).length || 0, total: mock?.witnesses.length || 0 }),
    },
    {
      label: t("workspace.progress.statementsRecorded"),
      done:
        (mock?.victimStatements.filter(Boolean).length || 0) >=
        (caseIntel?.victims?.length || 0) / 2,
      detail: t("workspace.progress.victimsDetail", { done: mock?.victimStatements.filter(Boolean).length || 0, total: caseIntel?.victims?.length || 0 }),
    },
    {
      label: t("workspace.progress.chargesheetFiled", { limit: chargesheet?.limitDays || 60 }),
      done: false,
      detail: chargesheet
        ? chargesheet.diff < 0
          ? t("workspace.progress.chargesheetOverdue", { count: Math.abs(chargesheet.diff) })
          : t("workspace.progress.chargesheetDue", { count: chargesheet.diff })
        : "—",
      overdue:
        chargesheet?.tone === "overdue" || chargesheet?.tone === "critical",
    },
  ];
  const items = rawItems.map((it) => {
    const isDone = it.done;
    const isOverdue = !isDone && it.overdue;
    const isPending =
      !isDone && !isOverdue && it.detail === t("workspace.progress.pending");
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
      title={t("workspace.progress.title")}
      badge={{ label: t("workspace.peopleTab.fact"), tone: "fact" }}
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
  const { t } = useTranslation();
  const events = mock?.timeline || [];
  return (
    <div className="space-y-4">
      <InvestigationProgress
        caseData={caseData}
        caseIntel={caseIntel}
        mock={mock}
        chargesheet={chargesheet}
      />
      <Section title={t("workspace.timeline.progression")} badge={{ label: t("workspace.peopleTab.fact"), tone: "fact" }}>
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
              {t("workspace.timeline.registeredFIR", { date: formatMonoDate(caseData.CrimeRegisteredDate) })}
            </p>
            <p className="text-xs text-[#6B7280]">
              {t("workspace.timeline.incidentAt", { date: formatDate(caseData.IncidentFromDate), station: caseData.UnitName })}
            </p>
          </div>
          {mock?.fsl.status === "overdue" && (
            <div className="relative mb-2">
              <span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#D62828]" />
              <p className="ksp-mono text-xs font-semibold text-[#D62828]">
                {t("workspace.timeline.todayFSL")}
              </p>
              <p className="text-xs text-[#6B7280]">
                {t("workspace.timeline.sentOverdue", { date: formatDate(mock.fsl.sentDate) })}
              </p>
            </div>
          )}
          <div className="relative">
            <span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#D62828]" />
            <p className="ksp-mono text-xs font-bold text-[#D62828]">
              {t("workspace.timeline.courtHearing", { date: formatMonoDate(mock?.court.nextHearingDate) })}
            </p>
            <p className="text-xs text-[#6B7280]">{mock?.court.purpose}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-[#9CA3AF]">
          {t("workspace.timeline.note")}
        </p>
      </Section>
    </div>
  );
}

function IntelTab({ similarCases, caseData, mock, matchesScope, onAsk }) {
  const { t } = useTranslation();
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
        title={t("workspace.intel.coAccused")}
        badge={{ label: t("workspace.intel.systemDerived"), tone: "intel" }}
      >
        <p className="text-sm text-[#1A1A2E]">
          {filtered.filter((s) => s.shared_accused_count > 0).length > 0
            ? t("workspace.intel.shareCases", { count: filtered.filter((s) => s.shared_accused_count > 0).length })
            : t("workspace.intel.noLinks")}
        </p>
        <div className="mt-3 space-y-2">
          {Object.entries(byStation)
            .slice(0, 3)
            .map(([station, arr]) => (
              <p key={station} className="text-xs text-[#374151]">
                {t("workspace.intel.accusedAppear", { count: arr.length, total: arr.length, station })}{" "}
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
              onAsk && onAsk(t("workspace.intel.askLinksPrompt"))
            }
            className="mt-3 border border-[#1A1A2E] bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white"
          >
            {t("workspace.intel.askLinks")}
          </button>
        )}
      </Section>
      <Section
        title={t("workspace.intel.similarMO", { count: filtered.length })}
        badge={{ label: t("workspace.intel.systemDerived"), tone: "intel" }}
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
                  {s.similarity || t("workspace.intelDrawer.similarDefault")}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                {t("workspace.intel.whySimilar")}
              </p>
              <p className="text-xs text-[#374151]">
                {s.reasons?.slice(0, 3).join(" · ") ||
                  [s.CrimeGroupName, s.Gravity].filter(Boolean).join(" · ")}
              </p>
              {(s.shared_accused_count > 0 || s.shared_act_count > 0) && (
                <p className="mt-1 text-[11px] font-medium text-[#1A1A2E]">
                  {s.shared_accused_count > 0 &&
                    t("workspace.intel.sharedAccusedFrag", { count: s.shared_accused_count })}{" "}
                  {s.shared_accused_count > 0 && s.shared_act_count > 0 && "·"}{" "}
                  {s.shared_act_count > 0 &&
                    t("workspace.intel.sharedActsFrag", { count: s.shared_act_count })}
                </p>
              )}
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() =>
                    onAsk && onAsk(`Compare this case with ${s.CrimeNo}`)
                  }
                  className="border border-[#DDE3EC] bg-white px-2 py-1 text-[11px] font-medium text-[#1A1A2E] hover:border-[#1A1A2E]"
                >
                  {t("workspace.intel.compare")}
                </button>
                <button
                  onClick={() => onAsk && onAsk(`Tell me about ${s.CrimeNo}`)}
                  className="border border-[#1A1A2E] bg-[#1A1A2E] px-2 py-1 text-[11px] font-medium text-white"
                >
                  {t("workspace.intel.askAbout")}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-[#6B7280]">
              {t("workspace.intel.noMatches")}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
