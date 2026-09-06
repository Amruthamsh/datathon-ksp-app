import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
  Trash2,
  ExternalLink,
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  Sparkles,
  RefreshCw,
  Clock3,
  ChevronRight,
  Siren,
  CheckCircle2,
  Mic,
  MicOff,
} from "lucide-react";
import useSpeechRecognition from "../hooks/useSpeechRecognition";
import {
  getCaseDetails,
  getCaseIntel,
  getSimilarCases,
  getCaseBrief,
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
      <div className="ksp-workspace flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-500" size={22} />
        <span className="ml-2 text-sm text-slate-700">{t("workspace.loading")}</span>
      </div>
    );
  if (!caseData)
    return (
      <div className="ksp-workspace p-8 text-sm text-slate-700">
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
  const setTab = (id) => {
    const sp = new URLSearchParams(location.search);
    sp.set("tab", id);
    setSearchParams(sp, { replace: true });
  };
  const priority =
    chargesheet?.tone === "overdue" ||
    (mock?.mockAccused || []).some((a) => a.arrestStatus === "Absconding") ||
    String(caseData.Gravity).toLowerCase().includes("heinous")
      ? "critical"
      : chargesheet?.tone === "critical" ||
          chargesheet?.tone === "warning" ||
          mock?.fsl.status === "overdue" ||
          (mock?.witnesses || []).some((w) => !w.examined)
        ? "high"
        : "normal";

  const TABS = [
    ["overview", t("workspace.tabs.caseBrief")],
    ["people", t("workspace.tabs.people")],
    ["evidence", t("workspace.tabs.evidence")],
    ["timeline", t("workspace.tabs.timeline")],
    ["intel", t("workspace.tabs.intel")],
  ];

  return (
    <div className="ksp-workspace flex h-full overflow-hidden bg-slate-50 relative">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Sub-header — breadcrumb + identity, tags moved to Key Facts */}
      <div className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 pt-2.5 sm:px-5">
          <button
            onClick={() => navigate("/investigations")}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline"
          >
            {t("nav.investigations")}
          </button>
          <ChevronRight size={12} className="shrink-0 text-slate-400" />
          <span className="ksp-mono truncate text-xs font-semibold text-slate-900">
            {caseData.CrimeNo || `#${caseData.CaseMasterID}`}
          </span>
          <div className="ml-auto hidden sm:block">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={scopeQuery}
                onChange={(e) => setScopeQuery(e.target.value)}
                placeholder={t("workspace.header.searchPlaceholder")}
                className="w-52 rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-xs placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none lg:w-64"
              />
              {scopeQuery && (
                <button
                  onClick={() => setScopeQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 pt-1 sm:px-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {t("workspace.header.crimeNo")} {caseData.CrimeNo || `#${caseData.CaseMasterID}`}
          </h1>
          {priority === "critical" ? (
            <span className="rounded-sm border border-[#D62828] bg-[#D62828] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              {t("workspace.header.priorityCritical", "Critical")}
            </span>
          ) : priority === "high" ? (
            <span className="rounded-sm border border-[#F97316] bg-[#F97316] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              {t("workspace.header.priorityHigh", "High")}
            </span>
          ) : (
            <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              {caseData.CaseStatusName || t("workspace.header.open")}
            </span>
          )}
          <span className="w-full text-xs text-slate-500 sm:w-auto">
            {t("workspace.header.io", { name: caseData.FirstName || "—" })}
            {" · "}
            {caseData.CaseStatusName || t("workspace.header.open")}
            {" · "}
            {t("workspace.side.registered")} {formatDate(caseData.CrimeRegisteredDate)}
            {(caseData.DistrictName || caseData.UnitName) &&
              ` · ${[caseData.DistrictName, caseData.UnitName].filter(Boolean).join(" · ")}`}
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 sm:px-5">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${activeTab === id ? "border-red-700 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto">
          <div className="w-full px-4 py-4 sm:px-5 xl:px-6 2xl:px-8">
          {showDySPGate ? (
            <div className="border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-900">
                {t("workspace.gate.noEscalation")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t("workspace.gate.sub")}
              </p>
              <button
                onClick={() => {
                  const sp = new URLSearchParams(location.search);
                  sp.set("tab", "overview");
                  setSearchParams(sp, { replace: true });
                }}
                className="mt-4 border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 hover:bg-slate-50"
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
                  rank={rank}
                  inspectorHealth={inspectorHealth}
                  matchesScope={matchesScope}
                  onNavigate={(tab) => {
                    const sp = new URLSearchParams(location.search);
                    sp.set("tab", tab);
                    setSearchParams(sp, { replace: true });
                  }}
                  onAsk={(q) => handleChatSend(q)}
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

        {/* Right column (35%) — Case Copilot on top, Live Activity pinned below */}
        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white lg:flex xl:w-[380px] 2xl:w-[400px]">
          <CopilotPanel
            caseData={caseData}
            caseIntel={caseIntel}
            similarCases={similarCases}
            mock={mock}
            chatMessages={chatMessages}
            chatSending={chatSending}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={handleChatSend}
            onClear={() => {
              setChatMessages([]);
              localStorage.removeItem(chatKey);
            }}
            placeholder={copilotPlaceholder}
            starterPrompts={starterPrompts}
            variant="docked"
          />
        </aside>
      </div>

      </div>

      {/* Mobile copilot entry — compact FAB, no text-covering pill */}
      <div className="absolute bottom-4 right-4 z-20 lg:hidden">
        <button
          onClick={() => setCopilotOpen(true)}
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-blue-900/90 text-white shadow-[0_8px_24px_rgba(30,58,138,0.35)] transition hover:bg-blue-900"
          aria-label={t("workspace.copilot.askCrimeLens")}
        >
          <Sparkles size={18} />
          {chatMessages.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white shadow">
              {chatMessages.length}
            </span>
          )}
        </button>
      </div>

      {/* Copilot drawer — mobile / tablet only (desktop uses docked panel) */}
      {copilotOpen && (
        <div className="absolute inset-0 z-30 flex justify-end lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]"
            onClick={() => setCopilotOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-[480px] flex-col border-l border-slate-200 bg-white shadow-2xl animate-[slideIn_0.2s_ease]">
            <div className="flex items-center justify-end border-b border-slate-200 bg-white px-4 py-2">
              <button
                onClick={() => setCopilotOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <CopilotPanel
                caseData={caseData}
                caseIntel={caseIntel}
                similarCases={similarCases}
                mock={mock}
                chatMessages={chatMessages}
                chatSending={chatSending}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSend={handleChatSend}
                onClear={() => {
                  setChatMessages([]);
                  localStorage.removeItem(chatKey);
                }}
                placeholder={copilotPlaceholder}
                starterPrompts={starterPrompts}
                variant="drawer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CopilotPanel({
  caseData,
  caseIntel,
  similarCases,
  mock,
  chatMessages,
  chatSending,
  chatInput,
  setChatInput,
  onSend,
  onClear,
  placeholder,
  starterPrompts,
  variant = "docked",
}) {
  const { t } = useTranslation();
  const isDocked = variant === "docked";
  const handleTranscript = useCallback(
    (text) => setChatInput(text),
    [setChatInput],
  );
  const { supported, isListening, startListening, stopListening } =
    useSpeechRecognition(handleTranscript);
  return (
    <div className={`flex min-h-0 flex-col bg-white ${isDocked ? "min-h-0 flex-1" : "flex-1"}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            CrimeLens
          </p>
          <p className="ksp-mono truncate text-[10.5px] text-slate-500">
            {caseData?.CrimeNo}
          </p>
        </div>
        {chatMessages.length > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-700">
            {chatMessages.length}
          </span>
        )}
      </div>
      {chatMessages.length === 0 && (
        <div className="border-b border-slate-200 bg-white px-3 py-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <Sparkles size={11} className="text-amber-500" />
              {t("workspace.copilot.whatHelp")}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          </div>
          <div className="flex flex-col gap-2">
            {starterPrompts.map((q, idx) => (
              <button
                key={q}
                onClick={() => onSend && onSend(q)}
                style={{ animationDelay: `${idx * 60}ms` }}
                className="group flex w-full items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[12.5px] font-medium leading-5 text-slate-800 shadow-sm transition-all hover:border-red-200 hover:bg-red-50/30 hover:shadow-md cursor-pointer"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white transition-colors group-hover:bg-red-600">
                  <ArrowUpRight size={12} strokeWidth={2.4} />
                </span>
                <span className="flex-1">{q}</span>
                <ChevronRight size={14} className="mt-1 shrink-0 text-slate-300 group-hover:text-red-400" />
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-slate-400">
            {t("workspace.copilot.contextLine", {
              group: caseData?.CrimeGroupName,
              accusedCount: caseIntel?.accused?.length || 0,
              relatedCount: similarCases?.length || 0,
              fsl: mock?.fsl.status,
            })}
          </p>
        </div>
      )}
      <div className={`space-y-2.5 overflow-y-auto bg-white px-3 py-3 ${isDocked ? "min-h-[160px] flex-1" : "flex-1"}`}>
        {chatMessages.length === 0 && (
          <p className="px-1 text-[12.5px] leading-6 text-slate-500">
            {t("workspace.copilot.emptyHint", { count: similarCases?.length || 0 })}
          </p>
        )}
        {chatMessages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[92%] rounded-2xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[13px] leading-5 text-slate-900 shadow-sm">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[95%] rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] leading-5 text-slate-800 shadow-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p className="mb-1.5 leading-5 last:mb-0">{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-slate-900">{children}</strong>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 mb-1.5 space-y-0.5">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-5 mb-1.5 space-y-0.5">{children}</ol>
                    ),
                    li: ({ children }) => <li className="leading-5">{children}</li>,
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
            <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: ".15s" }} />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: ".3s" }} />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-slate-200 bg-white px-3 py-3">
        <div className="flex items-end gap-1.5 rounded-[22px] border border-slate-300 bg-white px-2 py-1.5 shadow-sm transition focus-within:border-slate-400">
          {supported && (
            <button
              onClick={() => (isListening ? stopListening() : startListening())}
              title={t("workspace.copilot.voice", "Voice input")}
              aria-label={t("workspace.copilot.voice", "Voice input")}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition cursor-pointer ${isListening ? "bg-red-100 text-red-600 animate-pulse" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend && onSend()}
            placeholder={placeholder}
            className="flex-1 bg-transparent px-2 py-1.5 text-[13px] placeholder:text-slate-400 focus:outline-none"
          />
          <button
            onClick={() => onSend && onSend()}
            disabled={chatSending || !chatInput.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-900 text-white transition hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
          >
            <ArrowUp size={15} strokeWidth={2.2} />
          </button>
        </div>
        {isListening && (
          <p className="mt-1.5 px-1 text-[11px] font-medium text-red-500">
            {t("workspace.copilot.listening", "Listening…")}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-400">{t("workspace.copilot.auditable")}</span>
          {chatMessages.length > 0 && (
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-red-700 transition cursor-pointer"
            >
              <Trash2 size={11} /> {t("workspace.copilot.clear")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, badge, children, action }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
            {title}
          </h3>
          {badge && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.tone === "intel" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : badge.tone === "ai" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}
            >
              {badge.label}
            </span>
          )}
        </div>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function DossierSection({ eyebrow, title, children }) {
  return (
    <section className="px-5 py-4">
      {eyebrow && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {eyebrow}
        </p>
      )}
      {title && (
        <h3 className="mt-1 text-[15px] font-bold text-slate-900">{title}</h3>
      )}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function CaseSummary({ caseData, actSectionDetails }) {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const lang = String(i18n.language || "en").startsWith("kn") ? "kn" : "en";
  const cacheKey = `ksp_case_summary_${caseData?.CaseMasterID || caseData?.CrimeNo}_${lang}`;
  const [summary, setSummary] = useState(() => {
    try {
      const v = localStorage.getItem(cacheKey);
      return v ? JSON.parse(v)?.text || "" : "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!caseData) return;
    setLoading(true);
    try {
      const res = await getCaseBrief(
        token,
        caseData.CaseMasterID || caseData.CrimeNo,
        { language: lang },
      );
      const text = String(res?.data?.brief || "").trim();
      if (text) {
        setSummary(text);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ text, at: new Date().toISOString() }));
        } catch {
          setSummary(text);
        }
      } else {
        setSummary("");
      }
    } catch {
      setSummary("");
      /* falls back to the templated synopsis below */
    } finally {
      setLoading(false);
    }
  }, [token, lang, cacheKey, caseData]);

  useEffect(() => {
    if (!summary) fetchSummary();
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !summary) {
    return (
      <div className="animate-pulse space-y-2" aria-label={t("workspace.loading")}>
        <div className="h-3.5 w-full rounded bg-slate-100" />
        <div className="h-3.5 w-11/12 rounded bg-slate-100" />
        <div className="h-3.5 w-4/6 rounded bg-slate-100" />
      </div>
    );
  }
  if (summary) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-sm bg-blue-900/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <Sparkles size={10} /> CrimeLens
          </span>
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-900 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            {t("workspace.dossier.regenerate", "Regenerate")}
          </button>
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-2 text-sm leading-7 text-slate-700 last:mb-0">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-blue-900">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-2 list-decimal space-y-1 pl-5 marker:text-blue-900">{children}</ol>
            ),
            li: ({ children }) => <li className="text-sm leading-7 text-slate-700">{children}</li>,
          }}
        >
          {summary}
        </ReactMarkdown>
      </div>
    );
  }
  return <Synopsis caseData={caseData} actSectionDetails={actSectionDetails} />;
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
    <div className="space-y-2 text-sm leading-7 text-slate-600">
      <p>
        {t("workspace.synopsis.reportedOn")}{" "}
        <span className="font-bold text-slate-900">
          {formatDate(caseData.CrimeRegisteredDate)}
        </span>{" "}
        {t("workspace.synopsis.at")}{" "}
        <span className="font-bold text-slate-900">
          {caseData.UnitName || "—"}
        </span>
        {caseData.DistrictName ? t("workspace.synopsis.districtSuffix", { district: caseData.DistrictName }) : ""} {t("workspace.synopsis.andRegistered")}{" "}
        <span className="ksp-mono font-semibold text-slate-900">
          {caseData.CrimeNo}
        </span>
        .
      </p>
      <p>
        {t("workspace.synopsis.classified")}{" "}
        <span className="font-bold text-slate-900">
          {caseData.Gravity || "—"}
        </span>
        .{" "}
        {charges ? (
          <>
            {t("workspace.synopsis.chargedUnder")}{" "}
            <span className="font-bold text-slate-900">{charges}</span>.
          </>
        ) : (
          t("workspace.synopsis.noActs")
        )}
      </p>
      <p className="text-[13px] text-slate-500">
        {t("workspace.synopsis.note")}
      </p>
    </div>
  );
}

function CaseBriefTab({
  caseData,
  caseIntel,
  mock,
  chargesheet,
  actSectionDetails,
  rank,
  inspectorHealth,
  matchesScope,
  onNavigate,
  onAsk,
}) {
  const { t } = useTranslation();
  const isField = rank === "ASI" || rank === "HC";
  if (isField) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          {t("workspace.field.focusedTask")}
        </div>
        <PeopleTab
          caseIntel={caseIntel}
          mock={mock}
          rank={rank}
          matchesScope={matchesScope}
          taskOnly
        />
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {t("workspace.field.whereToGo")}
          </p>
          <p className="mt-1 text-sm text-slate-900">
            {mock.property.items}{" "}
            <span className="ml-1 text-[10px] text-slate-400">{t("workspace.field.mockBadge")}</span>
          </p>
          <p className="mt-1 text-xs text-slate-700">
            {t("workspace.field.station")} {caseData.UnitName} · {t("workspace.field.district")} {caseData.DistrictName}
          </p>
          {caseData.latitude && caseData.longitude && (
            <a
              href={`https://www.google.com/maps?q=${caseData.latitude},${caseData.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-900 underline"
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
    <div className="max-w-[880px] space-y-4">
      <KeyFactsStrip caseData={caseData} ageDays={ageDays} />

      <CriticalBanner
        caseData={caseData}
        mock={mock}
        chargesheet={chargesheet}
        inspectorHealth={inspectorHealth}
        rank={rank}
        onAsk={onAsk}
      />

      <DeadlinesStrip mock={mock} chargesheet={chargesheet} />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white [&_p]:max-w-[70ch]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-900">
              {t("workspace.dossier.title")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}
              {caseData.Gravity ? ` · ${caseData.Gravity}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-sm bg-blue-900/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            {t("workspace.dossier.daysSinceFIR", { count: ageDays })}
          </span>
        </div>
        <div className="divide-y divide-slate-200">
          <DossierSection title={t("workspace.dossier.summaryTitle")}>
            <CaseSummary
              caseData={caseData}
              actSectionDetails={actSectionDetails}
            />
          </DossierSection>
          {caseData.BriefFacts && (
            <DossierSection
              eyebrow={t("workspace.dossier.firTranscript", { count: caseData.BriefFacts.length })}
              title={t("workspace.dossier.firOwnWords")}
            >
              <p className="whitespace-pre-line text-sm leading-7 text-slate-900">
                {caseData.BriefFacts}
              </p>
            </DossierSection>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 px-5 py-2.5">
          <button
            onClick={() => onNavigate("people")}
            className="text-xs font-semibold text-slate-900 hover:underline"
          >
            {t("workspace.dossier.peopleLink")}
          </button>
          <span className="text-slate-300">·</span>
          <button
            onClick={() => onNavigate("evidence")}
            className="text-xs font-semibold text-slate-900 hover:underline"
          >
            {t("workspace.dossier.evidenceLink")}
          </button>
          <span className="text-slate-300">·</span>
          <button
            onClick={() => onNavigate("timeline")}
            className="text-xs font-semibold text-slate-900 hover:underline"
          >
            {t("workspace.dossier.timelineLink")}
          </button>
          <span className="ml-auto text-[11px] text-slate-400">
            {t("workspace.dossier.detailsInTabs")}
          </span>
        </div>
      </div>

      <LocationStrip
        caseData={caseData}
        coords={coords}
        mapEmbedSrc={mapEmbedSrc}
        mapsHref={mapsHref}
      />
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
      panel: "border-red-200 bg-red-50",
      label: "text-red-700",
      icon: <Siren size={15} />,
      btn: "bg-[#D62828] text-white hover:bg-red-700",
    },
    warning: {
      panel: "border-orange-200 bg-orange-50",
      label: "text-orange-700",
      icon: <Clock3 size={15} />,
      btn: "bg-[#F97316] text-white hover:bg-orange-600",
    },
    ok: {
      panel: "border-green-200 bg-green-50",
      label: "text-green-700",
      icon: <CheckCircle2 size={15} />,
      btn: "border border-green-700 bg-white text-green-800 hover:bg-green-100",
    },
  }[state.tone];

  return (
    <div className={`rounded-lg border px-4 py-3.5 ${styles.panel}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <span className={`hidden shrink-0 lg:block ${styles.label}`}>
          {styles.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-bold uppercase tracking-wide ${styles.label}`}>
            {state.kicker}
          </p>
          <h3 className="mt-0.5 text-[15px] font-bold leading-snug text-slate-900">
            {state.title}
          </h3>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-slate-600">
            {state.body}
          </p>
        </div>
        {state.action && (
          <button
            onClick={() => onAsk && onAsk(state.ask)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-bold uppercase tracking-wide ${styles.btn}`}
          >
            {state.action} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function StripItem({ label, value, tone }) {
  return (
    <div className="min-w-0 border-b border-slate-100 px-4 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-[13px] font-semibold leading-snug ${tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-green-700" : "text-slate-900"}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function KeyFactsStrip({ caseData, ageDays }) {
  const { t } = useTranslation();
  const items = [
    { label: t("workspace.side.station"), value: caseData.UnitName || "—" },
    { label: t("workspace.side.district"), value: caseData.DistrictName || "—" },
    {
      label: t("workspace.side.crimeGroup"),
      value: caseData.CrimeGroupName || caseData.CrimeHeadName || "—",
    },
    { label: t("workspace.side.status"), value: caseData.CaseStatusName || t("workspace.header.open") },
    { label: t("workspace.side.io"), value: caseData.FirstName || "—" },
    {
      label: t("workspace.side.registered"),
      value: `${formatDate(caseData.CrimeRegisteredDate)} · ${t("workspace.dossier.daysSinceFIR", { count: ageDays })}`,
    },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-900">
          {t("workspace.side.keyFacts")}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3">
        {items.map((it) => (
          <StripItem key={it.label} {...it} />
        ))}
      </div>
    </div>
  );
}

function DeadlinesStrip({ mock, chargesheet }) {
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
  const fslVal = mock?.fsl.reportReceived
    ? t("workspace.side.fslReported", { date: formatDate(mock.fsl.reportDate) })
    : mock?.fsl.status === "overdue"
      ? t("workspace.side.fslOverdue")
      : mock?.fsl.sent
        ? t("workspace.side.fslAwaiting")
        : t("workspace.side.fslNotSent");
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-900">
          {t("workspace.side.deadlines")}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <StripItem
          label={t("workspace.side.nextHearing")}
          value={`${formatDate(mock?.court.nextHearingDate)}${mock?.court.purpose ? ` · ${mock.court.purpose}` : ""}`}
        />
        <StripItem
          label={t("workspace.side.court")}
          value={t("workspace.side.courtValue", { court: mock?.court.courtType, by: mock?.court.bailGrantableBy })}
        />
        <StripItem label={t("workspace.side.chargesheet")} value={csValue} tone={csTone} />
        <StripItem
          label={t("workspace.side.fsl")}
          value={fslVal}
          tone={mock?.fsl.status === "overdue" ? "danger" : "ok"}
        />
      </div>
    </div>
  );
}

function LocationStrip({ caseData, coords, mapEmbedSrc, mapsHref }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative h-28 bg-slate-100">
        <iframe
          title={t("workspace.side.mapTitle")}
          src={mapEmbedSrc}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900">
            {caseData.UnitName || "—"}
          </p>
          <p className="ksp-mono text-[11px] text-slate-500">
            {coords
              ? `${Number(caseData.latitude).toFixed(4)}, ${Number(caseData.longitude).toFixed(4)}`
              : t("workspace.side.searchByStation")}
          </p>
        </div>
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
              <tr className="border-b border-slate-200">
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("workspace.peopleTab.thName")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("workspace.peopleTab.thAge")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("workspace.peopleTab.thArrest")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("workspace.peopleTab.thBail")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("workspace.peopleTab.thPrior")}
                </th>
                <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("workspace.peopleTab.thActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRows.map(({ a, m }) => (
                <tr
                  key={a.AccusedMasterID}
                  className={
                    m.arrestStatus === "Absconding" ? "bg-amber-50" : ""
                  }
                >
                  <td className="px-2 py-1.5 font-medium text-slate-900">
                    {a.AccusedName}{" "}
                    {m.arrestStatus === "Absconding" && (
                      <span className="ml-1 text-[11px] font-bold text-amber-800">
                        {t("workspace.people.abscondingBadge")}
                      </span>
                    )}{" "}
                    {m.warrantIssued && (
                      <span className="ml-1 border border-amber-300 bg-amber-100 px-1 text-[10px] font-bold uppercase text-amber-800">
                        {t("workspace.people.warrant")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-slate-700">
                    {a.AgeYear}y · {a.GenderID}
                  </td>
                  <td className="px-2 py-1.5 text-slate-700">
                    {m.arrestStatus === "Absconding"
                      ? "—"
                      : `${m.arrestStatus} · ${formatDate(m.arrestDate)}`}
                  </td>
                  <td className="px-2 py-1.5 text-slate-700">{m.bailStatus}</td>
                  <td className="px-2 py-1.5 text-slate-700">
                    {t("workspace.peopleTab.priorCasesCell", { count: m.priorCases })}
                    {m.convictions ? t("workspace.peopleTab.convictionFrag", { count: m.convictions }) : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() =>
                        onAsk &&
                        onAsk(`What other FIRs involve ${a.AccusedName}?`)
                      }
                      className="text-[11px] font-semibold text-slate-900 underline"
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
                    className="py-6 text-center text-xs text-slate-400"
                  >
                    {t("workspace.peopleTab.noAccused")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
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
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thName")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thAge")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thStatementRecorded")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(caseIntel?.victims || [])
                  .filter((v) => matchesScope(v.VictimName))
                  .map((v, idx) => (
                    <tr key={v.VictimMasterID}>
                      <td className="px-2 py-1.5 font-medium text-slate-900">
                        {v.VictimName}
                        {v.VictimPolice && (
                          <span className="ml-1 border border-slate-200 bg-white px-1 text-[10px] font-bold uppercase text-slate-700">
                            {t("workspace.peopleTab.police")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {v.AgeYear}y · {v.GenderID}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {(mock?.victimStatements[idx] ?? true) ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}{" "}
                        <span className="text-[10px] text-slate-400">
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
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thName")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thSummons")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thExamined")}
                  </th>
                  <th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("workspace.peopleTab.thStatement")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(mock?.witnesses || [])
                  .filter((w) => matchesScope(w.name))
                  .map((w, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 font-medium text-slate-900">
                        {w.name}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {w.summonsSent ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {w.examined ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">
                        {w.statementRecorded ? t("workspace.peopleTab.yes") : t("workspace.peopleTab.no")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-slate-400">
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
              <div key={i} className="border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    {item.actMeta?.fullName || item.actId} /{" "}
                    {item.sectionMeta?.title
                      ? `${t("workspace.evidence.sectionWord")} ${item.sectionId} — ${item.sectionMeta.title}`
                      : `${t("workspace.evidence.sectionWord")} ${item.sectionId}`}
                  </span>
                  {item.sectionMeta?.bailable !== undefined && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.sectionMeta.bailable ? "border border-green-700 text-green-700" : "bg-red-600 text-white"}`}
                    >
                      {item.sectionMeta.bailable ? t("workspace.evidence.bailable") : t("workspace.evidence.nonBailable")}
                    </span>
                  )}
                </div>
                {item.sectionMeta?.plain_language && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
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
                      className="inline-flex items-center gap-1 text-slate-900 underline"
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
                      className="inline-flex items-center gap-1 text-slate-900 underline"
                    >
                      <ExternalLink size={10} />
                      {t("workspace.dossier.indianKanoon")}
                    </a>
                  )}
                  {item.sectionMeta?.punishment && (
                    <span className="text-slate-500">
                      {item.sectionMeta.punishment}
                    </span>
                  )}
                </div>
              </div>
            ))}
          {actSectionDetails.length === 0 && (
            <p className="text-xs text-slate-500">{t("workspace.evidence.noActs")}</p>
          )}
        </div>
        {actSectionDetails.some((x) => x.actId === "IPC") && (
          <div className="mt-4 border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              {t("workspace.evidence.bnsTitle")}
            </p>
            <p className="mt-1 text-xs text-amber-900">
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.evidence.applicableCourt")}
            </p>
            <p className="font-medium text-slate-900">
              {mock?.court.courtType}{" "}
              <span className="text-[10px] font-normal text-slate-400">
                {t("workspace.evidence.mockBadge")}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.evidence.bail")}
            </p>
            <p className="font-medium text-slate-900">
              {mock?.court.bailGrantableBy}{" "}
              <span className="text-[10px] font-normal text-slate-400">
                {t("workspace.evidence.mockBadge")}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.evidence.property")}
            </p>
            <p className="text-xs text-slate-900">
              {mock?.property.items}{" "}
              <span className="text-[10px] text-slate-400">{t("workspace.evidence.mockBadge")}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.evidence.fsl")}
            </p>
            <p className="text-xs text-slate-900">
              {mock?.fsl.status}{" "}
              {mock?.fsl.sentDate && t("workspace.evidence.sentFrag", { date: formatDate(mock.fsl.sentDate) })}{" "}
              {mock?.fsl.reportReceived &&
                t("workspace.evidence.reportFrag", { date: formatDate(mock.fsl.reportDate) })}{" "}
              <span className="text-[10px] text-slate-400">{t("workspace.evidence.mockBadge")}</span>
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.evidence.standardProof")}
            </p>
            <p className="text-xs text-slate-700">
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
            className={`flex items-center justify-between border px-3 py-2 text-sm ${it.tone === "done" ? "border-green-700/30 bg-green-50" : it.tone === "overdue" ? "border-red-600/30 bg-red-50" : "border-slate-200 bg-white"}`}
          >
            <span
              className={`flex items-center gap-2 font-medium ${it.tone === "done" ? "text-green-700" : it.tone === "overdue" ? "text-red-700" : "text-slate-900"}`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center border text-[10px] ${it.tone === "done" ? "border-green-700 bg-green-700 text-white" : it.tone === "overdue" ? "border-red-600 text-red-700" : it.tone === "progress" ? "border-amber-600 text-amber-700" : "border-slate-200 text-slate-500"}`}
              >
                {it.tone === "done" ? "✓" : it.tone === "overdue" ? "!" : "○"}
              </span>
              {it.label}
            </span>
            <span
              className={`text-xs ${it.tone === "overdue" ? "font-semibold text-red-700" : "text-slate-500"}`}
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
        <div className="relative border-l border-slate-200 pl-6">
          {events.map((ev, i) => (
            <div key={i} className="relative mb-6">
              <span className="absolute -left-[25px] top-1 h-2 w-2 bg-slate-900" />
              <p className="ksp-mono text-xs font-semibold text-slate-900">
                {formatMonoDate(ev.date)}
              </p>
              <p className="text-sm font-semibold text-slate-900">{ev.title}</p>
              <p className="text-xs text-slate-500">{ev.detail}</p>
            </div>
          ))}
          <div className="relative mb-2">
            <span className="absolute -left-[25px] top-1 h-2 w-2 border border-slate-900 bg-white" />
            <p className="ksp-mono text-xs font-semibold text-slate-700">
              {t("workspace.timeline.registeredFIR", { date: formatMonoDate(caseData.CrimeRegisteredDate) })}
            </p>
            <p className="text-xs text-slate-500">
              {t("workspace.timeline.incidentAt", { date: formatDate(caseData.IncidentFromDate), station: caseData.UnitName })}
            </p>
          </div>
          {mock?.fsl.status === "overdue" && (
            <div className="relative mb-2">
              <span className="absolute -left-[25px] top-1 h-2 w-2 bg-red-600" />
              <p className="ksp-mono text-xs font-semibold text-red-700">
                {t("workspace.timeline.todayFSL")}
              </p>
              <p className="text-xs text-slate-500">
                {t("workspace.timeline.sentOverdue", { date: formatDate(mock.fsl.sentDate) })}
              </p>
            </div>
          )}
          <div className="relative">
            <span className="absolute -left-[25px] top-1 h-2 w-2 bg-red-600" />
            <p className="ksp-mono text-xs font-bold text-red-700">
              {t("workspace.timeline.courtHearing", { date: formatMonoDate(mock?.court.nextHearingDate) })}
            </p>
            <p className="text-xs text-slate-500">{mock?.court.purpose}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-400">
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
        <p className="text-sm text-slate-900">
          {filtered.filter((s) => s.shared_accused_count > 0).length > 0
            ? t("workspace.intel.shareCases", { count: filtered.filter((s) => s.shared_accused_count > 0).length })
            : t("workspace.intel.noLinks")}
        </p>
        <div className="mt-3 space-y-2">
          {Object.entries(byStation)
            .slice(0, 3)
            .map(([station, arr]) => (
              <p key={station} className="text-xs text-slate-700">
                {t("workspace.intel.accusedAppear", { count: arr.length, total: arr.length, station })}{" "}
                <span className="text-slate-500">
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
            className="mt-3 border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
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
              className="border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <span className="ksp-mono text-xs font-bold text-slate-900">
                  {s.CrimeNo} · {s.DistrictName || s.UnitName}
                </span>
                <span className="border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                  {s.similarity || t("workspace.intelDrawer.similarDefault")}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("workspace.intel.whySimilar")}
              </p>
              <p className="text-xs text-slate-700">
                {s.reasons?.slice(0, 3).join(" · ") ||
                  [s.CrimeGroupName, s.Gravity].filter(Boolean).join(" · ")}
              </p>
              {(s.shared_accused_count > 0 || s.shared_act_count > 0) && (
                <p className="mt-1 text-[11px] font-medium text-slate-900">
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
                  className="border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-900 hover:border-slate-900"
                >
                  {t("workspace.intel.compare")}
                </button>
                <button
                  onClick={() => onAsk && onAsk(`Tell me about ${s.CrimeNo}`)}
                  className="rounded-sm bg-blue-900/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-900"
                >
                  {t("workspace.intel.askAbout")}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-slate-500">
              {t("workspace.intel.noMatches")}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
