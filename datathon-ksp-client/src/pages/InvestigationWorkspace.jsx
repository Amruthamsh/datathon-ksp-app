import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Search, X, Bot, Trash2, Send, ExternalLink, ArrowRight, MapPin, Sparkles, AlertTriangle, Clock3, ShieldAlert, Users, FileClock, Gavel, Lightbulb, Scale, CalendarDays } from "lucide-react";
import { getCaseDetails, getCaseIntel, getSimilarCases } from "../api/investigations";
import { generateResponse } from "../api/chat";
import { useAuth } from "../auth/AuthContext";
import { getOfficerRank } from "../utils/role";
import { getMockExtensions } from "../data/mockCaseExtensions";
import actSectionMeta from "../data/actSectionMetadata.json";

function formatDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(d); }
}
function formatMonoDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(d); }
}
function useChargesheet(caseData, mock) {
  return useMemo(() => {
    const arrests = mock?.mockAccused?.filter((a) => a.arrestDate).map((a) => a.arrestDate) || [];
    const earliestArrest = arrests.length ? arrests.sort()[0] : null;
    const baseDate = earliestArrest || caseData?.CrimeRegisteredDate;
    const isArrestBased = Boolean(earliestArrest);
    if (!baseDate) return null;
    const acts = (caseData?.acts || []).map((a) => a.ActID);
    const isSerious = acts.includes("NDPS") || String(caseData?.Gravity).toLowerCase().includes("heinous") || acts.includes("POCSO");
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
    try { const v = localStorage.getItem(chatKey); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  useEffect(() => { try { localStorage.setItem(chatKey, JSON.stringify(chatMessages)); } catch {} }, [chatKey, chatMessages]);
  useEffect(() => {
    const h = (e) => { const sp = new URLSearchParams(location.search); sp.set("tab", e.detail); setSearchParams(sp, { replace: true }); };
    window.addEventListener("ksp-tab-change", h);
    return () => window.removeEventListener("ksp-tab-change", h);
  }, [location.search, setSearchParams]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [detailsRes, intelRes, similarRes] = await Promise.all([
          getCaseDetails(token, caseId), getCaseIntel(token, caseId), getSimilarCases(token, caseId),
        ]);
        if (cancelled) return;
        const details = detailsRes?.data ?? null;
        const intel = intelRes?.data ?? null;
        const similar = similarRes?.data?.data ?? similarRes?.data?.cases ?? (Array.isArray(similarRes?.data) ? similarRes.data : []);
        setCaseData(details); setCaseIntel(intel); setSimilarCases(similar);
        setMock(getMockExtensions(caseId, intel));
      } catch (e) { console.error(e); } finally { if (!cancelled) setLoading(false); }
    }
    load(); return () => { cancelled = true; };
  }, [caseId, token]);
  const chargesheet = useChargesheet(caseData, mock);
  const actSectionDetails = useMemo(() => {
    if (!caseIntel?.acts) return [];
    return caseIntel.acts.map((a) => {
      const actMeta = actSectionMeta.acts?.[a.ActID];
      return { actId: a.ActID, sectionId: a.SectionID, actMeta, sectionMeta: actMeta?.sections?.[a.SectionID] };
    });
  }, [caseIntel]);
  const isEscalated = useMemo(() => {
    if (!caseData) return false;
    const heinous = String(caseData.Gravity).toLowerCase().includes("heinous");
    const overdue = chargesheet?.tone === "overdue" || chargesheet?.tone === "critical";
    const highProfile = (caseIntel?.accused?.length || 0) >= 3;
    return heinous || overdue || highProfile;
  }, [caseData, chargesheet, caseIntel]);
  const inspectorHealth = useMemo(() => {
    if (!caseData || !mock) return "";
    const parts = [];
    const abscond = mock.mockAccused.filter((a) => a.arrestStatus === "Absconding").length;
    if (abscond) parts.push(`${abscond} absconding`);
    if (mock.fsl.status === "overdue" || mock.fsl.status === "pending") parts.push(`FSL ${mock.fsl.status}`);
    const onTrack = chargesheet?.diff > 14 ? "on track" : "at risk";
    parts.push(`chargesheet ${onTrack}`);
    if (mock.witnesses.filter((w) => !w.examined).length) parts.push(`${mock.witnesses.filter((w) => !w.examined).length} witnesses pending`);
    return parts.join(" · ");
  }, [caseData, mock, chargesheet]);
  const handleChatSend = async (override) => {
    const qRaw = typeof override === "string" ? override : chatInput;
    if (!qRaw.trim() || chatSending) return;
    const userMsg = { role: "user", content: qRaw.trim(), at: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMsg]);
    const q = qRaw.trim();
    if (typeof override !== "string") setChatInput("");
    setChatSending(true);
    setCopilotOpen(true);
    try {
      const ctx = `Case ${caseData?.CrimeNo} (${caseData?.CrimeGroupName}, ${caseData?.Gravity}). Accused: ${(caseIntel?.accused || []).map((a) => a.AccusedName).join(", ")}. Acts: ${(caseIntel?.acts || []).map((a) => `${a.ActID} ${a.SectionID}`).join(", ")}. Timeline: ${(mock?.timeline||[]).map(e=>`${e.title} ${formatDate(e.date)}`).join("; ")}. FSL:${mock?.fsl.status} Court:${mock?.court.purpose} ${formatDate(mock?.court.nextHearingDate)} Similar:${similarCases.slice(0,3).map(s=>s.CrimeNo).join(",")}`;
      const res = await generateResponse(token, `Context: ${ctx}\n\nQuestion about this case (${activeTab} tab): ${q}`, null, "en", []);
      const answer = res?.data?.answer || res?.answer || res?.response || "No response.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: String(answer), at: new Date().toISOString() }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Unable to get response. Check Investigation Checklist and People table for next steps.", at: new Date().toISOString() }]);
    } finally { setChatSending(false); }
  };
  const copilotPlaceholder = useMemo(() => {
    const map = { overview: "Ask about this case — evidence gaps, next steps, similar MO", people: "Ask about these people — prior cases, associates, whereabouts", evidence: "Ask about evidence — FSL, seizure, legal sections", timeline: "Ask about this timeline — why stalled, what's pending", intel: "Ask about these connections — patterns, networks, similar cases" };
    return map[activeTab] || "Ask CrimeLens about this case…";
  }, [activeTab]);
  const starterPrompts = useMemo(() => {
    const base = {
      overview: ["Why is this case critical?", "What should I do next?", "Summarize this investigation"],
      people: ["What other cases involve this accused?", "Who are their known associates?", "Where have they appeared?"],
      evidence: ["What evidence is missing?", "What sections apply?", "Is FSL blocking chargesheet?"],
      timeline: ["Why has this investigation stalled?", "What's happened so far?", "What is still pending?"],
      intel: ["Find similar cases", "Is this part of a larger pattern?", "Show shared accused links"],
    };
    return base[activeTab] || base.overview;
  }, [activeTab]);

  if (loading) return <div className="ksp-workspace flex h-full items-center justify-center bg-[#F4F6F9]"><Loader2 className="animate-spin text-[#6B7280]" size={22} /><span className="ml-2 text-sm text-[#374151]">Loading case…</span></div>;
  if (!caseData) return <div className="ksp-workspace p-8 text-sm text-[#374151]">Case not found. <button onClick={() => navigate("/investigations")} className="underline">Back to queue</button></div>;
  const showDySPGate = (rank === "DySP" || rank === "SP") && !isEscalated;
  const matchesScope = (text) => !scopeQuery.trim() || String(text || "").toLowerCase().includes(scopeQuery.toLowerCase());

  return (
    <div className="ksp-workspace flex h-full flex-col overflow-hidden bg-[#F4F6F9] relative">
      {/* Header — Case Brief identity */}
      <div className="shrink-0 border-b border-[#DDE3EC] bg-white">
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <span className="ksp-mono text-[18px] font-semibold tracking-tight text-[#1A1A2E]">{caseData.CrimeNo || `#${caseData.CaseMasterID}`}</span>
          <span className="border border-[#DDE3EC] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#374151]">{caseData.CrimeGroupName || caseData.CrimeHeadName || "—"}</span>
          <span className={`px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] border ${String(caseData.Gravity).toLowerCase().includes("heinous") ? "bg-[#D62828] text-white border-[#D62828]" : "bg-white text-[#374151] border-[#DDE3EC]"}`}>{caseData.Gravity || "—"}</span>
          <span className="text-xs text-[#6B7280]">IO {caseData.FirstName || "—"} · {caseData.CaseStatusName || "Open"}</span>
        </div>
        <div className="flex gap-1 border-t border-[#DDE3EC] bg-white px-6 overflow-x-auto">
          {[["overview","Case Brief"],["people","People"],["evidence","Evidence"],["timeline","Timeline"],["intel","Intelligence"]].map(([id,label])=>(
            <button key={id} onClick={()=>{const sp=new URLSearchParams(location.search); sp.set("tab",id); setSearchParams(sp,{replace:true});}} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${activeTab===id?"border-[#1A1A2E] text-[#1A1A2E]":"border-transparent text-[#6B7280] hover:text-[#1A1A2E]"}`}>{label}</button>
          ))}
          <div className="ml-auto hidden sm:flex items-center gap-2 py-1">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input value={scopeQuery} onChange={(e)=>setScopeQuery(e.target.value)} placeholder="Search within this case…" className="w-56 border border-[#DDE3EC] bg-white py-1 pl-7 pr-7 text-xs placeholder:text-[#9CA3AF] focus:border-[#1A1A2E] focus:outline-none" />
              {scopeQuery && <button onClick={()=>setScopeQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"><X size={12} /></button>}
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1160px] px-6 py-6 pb-20">
          {showDySPGate ? (
            <div className="border border-[#DDE3EC] bg-white p-8 text-center">
              <p className="text-sm font-semibold text-[#1A1A2E]">No escalation for this case</p>
              <p className="mt-1 text-xs text-[#6B7280]">Heinous / high-profile / deadline breach — none detected. Routine supervision not required.</p>
              <button onClick={()=>{const sp=new URLSearchParams(location.search); sp.set("tab","overview"); setSearchParams(sp,{replace:true});}} className="mt-4 border border-[#1A1A2E] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#1A1A2E] hover:bg-[#F4F6F9]">View full file anyway</button>
            </div>
          ) : (
            <>
              {activeTab==="overview" && <CaseBriefTab caseData={caseData} caseIntel={caseIntel} mock={mock} chargesheet={chargesheet} actSectionDetails={actSectionDetails} similarCases={similarCases} rank={rank} inspectorHealth={inspectorHealth} matchesScope={matchesScope} onNavigate={(tab)=>{const sp=new URLSearchParams(location.search); sp.set("tab",tab); setSearchParams(sp,{replace:true});}} onAsk={(q)=>handleChatSend(q)} onOpenIntel={()=>{const sp=new URLSearchParams(location.search); sp.set("tab","intel"); setSearchParams(sp,{replace:true});}} />}
              {activeTab==="people" && <PeopleTab caseIntel={caseIntel} mock={mock} rank={rank} matchesScope={matchesScope} onAsk={handleChatSend} caseId={caseId} />}
              {activeTab==="evidence" && <EvidenceTab actSectionDetails={actSectionDetails} mock={mock} caseData={caseData} matchesScope={matchesScope} />}
              {activeTab==="timeline" && <TimelineTab caseData={caseData} mock={mock} caseIntel={caseIntel} chargesheet={chargesheet} />}
              {activeTab==="intel" && <IntelTab similarCases={similarCases} caseData={caseData} mock={mock} matchesScope={matchesScope} onAsk={handleChatSend} />}
            </>
          )}
        </div>
      </div>

      {/* Persistent copilot bar */}
      <div className="shrink-0 border-t border-[#DDE3EC] bg-white px-4 sm:px-6 py-2.5 flex items-center gap-3">
        <button onClick={()=>setCopilotOpen(true)} className="flex flex-1 items-center gap-2.5 rounded-full border border-[#DDE3EC] bg-[#F4F6F9] px-4 py-2.5 text-left hover:bg-white hover:border-[#1A1A2E] transition group">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A2E] text-white"><Sparkles size={12} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-[#1A1A2E] group-hover:text-[#1A1A2E]">Ask CrimeLens about this case</span>
            <span className="block text-[11px] text-[#6B7280] truncate">{copilotPlaceholder}</span>
          </span>
          <ArrowRight size={14} className="shrink-0 text-[#9CA3AF] group-hover:text-[#1A1A2E]" />
        </button>
        <span className="hidden sm:inline text-[11px] text-[#9CA3AF]">{chatMessages.length>0?`${chatMessages.length} in thread`: ""}</span>
      </div>

      {/* Copilot Drawer */}
      {copilotOpen && (
        <div className="absolute inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-[#1A1A2E]/20 backdrop-blur-[1px]" onClick={()=>setCopilotOpen(false)} />
          <div className="relative flex h-full w-full max-w-[420px] flex-col border-l border-[#DDE3EC] bg-white shadow-2xl animate-[slideIn_0.2s_ease]">
            <div className="flex items-center justify-between border-b border-[#DDE3EC] bg-[#F4F6F9] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center bg-[#1A1A2E] text-white"><Bot size={14} /></span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#1A1A2E]">Case Copilot</p>
                  <p className="ksp-mono text-[11px] text-[#6B7280]">{caseData.CrimeNo}</p>
                </div>
              </div>
              <button onClick={()=>setCopilotOpen(false)} className="flex h-7 w-7 items-center justify-center border border-[#DDE3EC] bg-white text-[#6B7280] hover:text-[#1A1A2E]"><X size={14} /></button>
            </div>
            {chatMessages.length===0 && (
              <div className="px-4 py-4 border-b border-[#DDE3EC] bg-white">
                <p className="text-xs font-semibold text-[#374151] mb-2">What can I help investigate?</p>
                <div className="flex flex-wrap gap-1.5">
                  {starterPrompts.map(q=>(
                    <button key={q} onClick={()=>handleChatSend(q)} className="border border-[#DDE3EC] bg-white px-2.5 py-1 text-xs font-medium text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white hover:border-[#1A1A2E] transition">{q}</button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-[#9CA3AF]">Context: {caseData.CrimeGroupName} · {caseIntel?.accused?.length||0} accused · {similarCases.length} related · {mock?.fsl.status} FSL</p>
              </div>
            )}
            <div className="flex-1 overflow-auto p-4 space-y-3 bg-[#F4F6F9]/50">
              {chatMessages.length===0 && <p className="text-xs leading-relaxed text-[#6B7280]">Ask about evidence gaps, next steps, similar MO, or trace the accused. CrimeLens has the full case graph — timeline, people, evidence, and {similarCases.length} related FIRs.</p>}
              {chatMessages.map((m,i)=> m.role==="user" ? (
                <div key={i} className="flex justify-end"><div className="max-w-[85%] bg-[#1A1A2E] px-3 py-2 text-sm leading-6 text-white">{m.content}</div></div>
              ) : (
                <div key={i} className="flex justify-start"><div className="max-w-[92%] border border-[#DDE3EC] bg-white px-3.5 py-3 text-sm leading-6 text-[#1A1A2E]"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{p:({children})=><p className="mb-2 leading-6 last:mb-0">{children}</p>, strong:({children})=><strong className="font-semibold">{children}</strong>, ul:({children})=><ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>, ol:({children})=><ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>, li:({children})=><li className="leading-6">{children}</li>}}>{m.content}</ReactMarkdown></div></div>
              ))}
              {chatSending && <div className="flex justify-start"><div className="border border-[#DDE3EC] bg-white px-3 py-2 text-xs text-[#6B7280]">Thinking…</div></div>}
            </div>
            <div className="border-t border-[#DDE3EC] bg-white p-3">
              <div className="flex items-center gap-2">
                <input value={chatInput} onChange={(e)=>setChatInput(e.target.value)} onKeyDown={(e)=> e.key==="Enter" && handleChatSend()} placeholder={copilotPlaceholder} className="flex-1 border border-[#DDE3EC] bg-white px-3 py-2 text-sm placeholder:text-[#9CA3AF] focus:border-[#1A1A2E] focus:outline-none" />
                <button onClick={()=>handleChatSend()} disabled={chatSending || !chatInput.trim()} className="flex h-9 w-9 items-center justify-center bg-[#1A1A2E] text-white disabled:opacity-40"><Send size={14} /></button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-[#9CA3AF]">Auditable — answers reference case facts, timeline & intel</span>
                {chatMessages.length>0 && <button onClick={()=>{setChatMessages([]); localStorage.removeItem(chatKey);}} className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#D62828]"><Trash2 size={11} /> Clear</button>}
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
    <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#F3F4F6] bg-[#FAFBFC] px-4 py-2.5 rounded-t-xl">
        <div className="flex items-center gap-2">
          <h3 className="text-[12.5px] font-bold uppercase tracking-[0.07em] text-[#1A1A2E]">{title}</h3>
          {badge && <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border rounded-full ${badge.tone==="intel"?"bg-[#EEF2FF] border-[#C7D2FE] text-[#3730A3]": badge.tone==="ai"?"bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]":"bg-white border-[#E5E7EB] text-[#6B7280]"}`}>{badge.label}</span>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function WhyAttention({ caseData, mock, chargesheet }) {
  const abscond = mock?.mockAccused.filter((a)=>a.arrestStatus==="Absconding").length||0;
  const ageDays = Math.floor((Date.now() - new Date(caseData.CrimeRegisteredDate).getTime())/864e5);
  const ageMo = Math.floor(ageDays/30);
  const primary = abscond>0 ? `${abscond} of ${mock.mockAccused.length} people haven't been arrested — absconding ${ageMo>0?`${ageMo} months`:`${ageDays} days`} since FIR.` : chargesheet?.tone==="overdue" ? `Chargesheet is ${Math.abs(chargesheet.diff)} days late — past the ${chargesheet.limitDays}-day deadline.` : mock?.fsl.status==="overdue" ? `Forensic report is stuck — evidence sent ${formatDate(mock.fsl.sentDate)}, still no result.` : "This case needs a quick check — nothing is critically blocked, but a few loose ends remain.";
  const impact = abscond>0 ? `Your hearing on ${formatDate(mock?.court.nextHearingDate)} (${mock?.court.purpose}) can't move forward until they're found.` : mock?.fsl.status==="overdue" ? "You can't file the chargesheet without the forensic report." : chargesheet?.tone==="critical" ? `You have ${chargesheet.diff} days left to file the chargesheet before it goes overdue.` : "Get the pending witness statements and FSL follow-up done before the next hearing.";
  const risk = chargesheet?.tone==="overdue" ? `${Math.abs(chargesheet.diff)} days over the legal limit — needs escalation.` : mock?.witnesses.filter(w=>!w.examined).length ? `${mock.witnesses.filter(w=>!w.examined).length} witness statements still not recorded.` : null;
  const priorityReasons = caseData.priority_reasons || [];
  const tone = chargesheet?.tone==="overdue" || abscond>0 ? "critical" : chargesheet?.tone==="critical" ? "warning" : "neutral";
  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${tone==="critical" ? "border-[#FECACA]" : tone==="warning" ? "border-[#FDE68A]" : "border-[#E5E7EB]"}`}>
      <div className={`px-4 py-2.5 flex items-center gap-2 ${tone==="critical" ? "bg-[#FEF2F2]" : tone==="warning" ? "bg-[#FFFBEB]" : "bg-[#FAFBFC]"} border-b ${tone==="critical" ? "border-[#FECACA]" : tone==="warning" ? "border-[#FDE68A]" : "border-[#F3F4F6]"}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${tone==="critical" ? "bg-[#D62828] text-white" : tone==="warning" ? "bg-[#C85A00] text-white" : "bg-[#E5E7EB] text-[#374151]"}`}>
          {tone==="critical" ? <ShieldAlert size={13} /> : tone==="warning" ? <Clock3 size={13} /> : <Lightbulb size={13} />}
        </span>
        <h3 className="text-[12.5px] font-bold tracking-tight text-[#1A1A2E]">Why this needs your attention</h3>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">{String(caseData.Priority||"").toUpperCase() || "Priority"} · {ageDays} days old</span>
      </div>
      <div className="p-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[#FAFBFC] border border-[#F3F4F6] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]"><AlertTriangle size={12} className="text-[#D62828]" /> The block</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#1A1A2E]">{primary}</p>
        </div>
        <div className="rounded-lg bg-[#FAFBFC] border border-[#F3F4F6] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]"><Clock3 size={12} className="text-[#374151]" /> What it stops</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#374151]">{impact}</p>
        </div>
        <div className="rounded-lg bg-[#FAFBFC] border border-[#F3F4F6] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]"><ShieldAlert size={12} className="text-[#C85A00]" /> Also watch</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#374151]">{risk || "No extra risk flagged right now. Nice work keeping this one tidy."}</p>
        </div>
      </div>
      {priorityReasons.length>0 && <div className="px-4 pb-3"><p className="text-[11px] leading-relaxed text-[#9CA3AF]">{priorityReasons.length} system reasons · {priorityReasons.join(" · ")}</p></div>}
    </div>
  );
}

function CaseBriefTab({ caseData, caseIntel, mock, chargesheet, actSectionDetails, similarCases, rank, inspectorHealth, matchesScope, onNavigate, onAsk, onOpenIntel }) {
  const isField = rank==="ASI" || rank==="HC";
  if (isField) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-[#FFFBEB] px-4 py-3 text-xs leading-relaxed text-[#92400E]">You're seeing a focused task view — arrests, seizures and locations only. Switch to SI/Inspector for the full file.</div>
        <PeopleTab caseIntel={caseIntel} mock={mock} rank={rank} matchesScope={matchesScope} taskOnly />
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Where to go / What to seize</p>
          <p className="mt-1 text-sm text-[#1A1A2E]">{mock.property.items} <span className="ml-1 text-[10px] text-[#9CA3AF]">· mock</span></p>
          <p className="mt-1 text-xs text-[#374151]">Station: {caseData.UnitName} · District: {caseData.DistrictName}</p>
          {caseData.latitude && caseData.longitude && <a href={`https://www.google.com/maps?q=${caseData.latitude},${caseData.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1A1A2E] underline">View on map <ExternalLink size={12} /></a>}
        </div>
      </div>
    );
  }
  const ageDays = Math.floor((Date.now() - new Date(caseData.CrimeRegisteredDate).getTime())/864e5);
  return (
    <div className="space-y-5">
      {rank==="Inspector" && <div className="rounded-xl border border-amber-200 bg-[#FFFBEB] px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">Inspector — quick check</p><p className="mt-1 text-sm leading-relaxed text-[#1A1A2E]">{inspectorHealth}</p></div>}
      <WhyAttention caseData={caseData} mock={mock} chargesheet={chargesheet} />
      <CaseStatusStrip caseData={caseData} caseIntel={caseIntel} mock={mock} chargesheet={chargesheet} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Possible connections" badge={{label:"System", tone:"intel"}} action={<button onClick={onOpenIntel} className="text-[11px] font-semibold text-[#3730A3] hover:underline">Explore all →</button>}>
          <IntelligenceTeaser similarCases={similarCases} caseData={caseData} onOpenIntel={onOpenIntel} />
        </Section>
        <Section title="What law applies" badge={{label:"From FIR", tone:"fact"}} action={<button onClick={()=>onNavigate("evidence")} className="text-[11px] font-semibold text-[#1A1A2E] hover:underline">See details →</button>}>
          <LegalTeaser actSectionDetails={actSectionDetails} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Where it happened</p>
          <p className="mt-1 text-[14px] font-semibold text-[#1A1A2E]">{caseData.UnitName || "—"} · {caseData.DistrictName || ""}</p>
          {caseData.latitude && caseData.longitude ? <p className="ksp-mono text-[11px] text-[#6B7280]">{Number(caseData.latitude).toFixed(4)}, {Number(caseData.longitude).toFixed(4)} · {ageDays} days since FIR</p> : <p className="text-[11px] text-[#9CA3AF]">Coords not in FIR — search uses station name</p>}
          <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">FIR {caseData.CrimeNo} · {formatDate(caseData.CrimeRegisteredDate)} at {caseData.UnitName}</p>
        </div>
        <a
          href={
            caseData.latitude && caseData.longitude
              ? `https://www.google.com/maps?q=${caseData.latitude},${caseData.longitude}`
              : `https://www.google.com/maps/search/${encodeURIComponent(`${caseData.UnitName || ""} ${caseData.DistrictName || ""} Karnataka`.trim())}`
          }
          target="_blank"
          rel="noreferrer"
          className="lg:col-span-2 flex flex-col items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#1A1A2E] p-4 text-white hover:bg-black transition text-center"
        >
          <MapPin size={18} className="mb-1.5 opacity-90" />
          <span className="text-sm font-semibold">View on Google Maps</span>
          <span className="text-[11px] opacity-70">Opens exact location</span>
        </a>
      </div>

      {caseData.BriefFacts && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
          <div className="bg-[#FAFBFC] border-b border-[#F3F4F6] px-4 py-2.5 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A1A2E] text-white text-[11px] font-bold">F</span>
            <h3 className="text-[12.5px] font-bold tracking-tight text-[#1A1A2E]">What happened — in the FIR's own words</h3>
            <span className="ml-auto text-[10px] uppercase tracking-wide font-semibold text-[#9CA3AF]">{caseData.BriefFacts.length} chars</span>
          </div>
          <div className="p-5">
            <p className="whitespace-pre-line text-[14px] leading-7 text-[#1A1A2E]">{caseData.BriefFacts}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseStatusStrip({ caseData, caseIntel, mock, chargesheet }) {
  const abscond = mock?.mockAccused.filter(a=>a.arrestStatus==="Absconding").length||0;
  const totalAcc = caseIntel?.accused?.length??0;
  const pctArrested = totalAcc ? Math.round(((totalAcc-abscond)/totalAcc)*100) : 0;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[#6B7280]"><Users size={14} /><span className="text-[11px] font-bold uppercase tracking-wide">People</span><span className={`ml-auto h-2 w-2 rounded-full ${abscond? "bg-[#D62828] animate-pulse":"bg-[#2D6A4F]"}`} /></div>
        <p className="mt-2 ksp-mono text-[22px] font-black leading-none text-[#1A1A2E]">{totalAcc}<span className="text-[13px] font-semibold text-[#6B7280]"> accused</span></p>
        <p className="mt-1 text-xs text-[#374151]">{abscond ? `${abscond} still not found` : "All arrested — good progress"}</p>
        <div className="mt-3 h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden"><div className={`h-full rounded-full ${abscond?"bg-[#D62828]":"bg-[#2D6A4F]"}`} style={{width:`${pctArrested}%`}} /></div>
        <p className="mt-1 text-[10px] text-[#9CA3AF]">{pctArrested}% arrested</p>
      </div>
      <div className={`rounded-xl border p-4 shadow-sm ${chargesheet?.tone==="overdue"?"bg-[#FEF2F2] border-[#FECACA]": chargesheet?.tone==="critical"?"bg-[#FFFBEB] border-[#FDE68A]":"bg-white border-[#E5E7EB]"}`}>
        <div className="flex items-center gap-2 text-[#6B7280]"><FileClock size={14} className={chargesheet?.tone==="overdue"?"text-[#D62828]":""} /><span className="text-[11px] font-bold uppercase tracking-wide">Chargesheet</span></div>
        <p className={`mt-2 ksp-mono text-[20px] font-black leading-none ${chargesheet?.tone==="overdue"||chargesheet?.tone==="critical"?"text-[#D62828]":"text-[#1A1A2E]"}`}>{chargesheet? chargesheet.diff<0?`${Math.abs(chargesheet.diff)}d late`:`${chargesheet.diff}d left` : "—"}</p>
        <p className="mt-1 text-xs text-[#374151]">{chargesheet?.limitDays}d deadline {chargesheet?.isArrestBased?"· from first arrest":"· from FIR date"}</p>
        <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${chargesheet?.tone==="overdue"?"text-[#D62828]": chargesheet?.tone==="critical"?"text-[#92400E]":"text-[#6B7280]"}`}>{chargesheet?.tone==="overdue"?"Overdue — needs filing now": chargesheet?.tone==="critical"?"Due soon":"On track"}</p>
      </div>
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[#6B7280]"><Gavel size={14} /><span className="text-[11px] font-bold uppercase tracking-wide">Next hearing</span><CalendarDays size={12} className="ml-auto text-[#9CA3AF]" /></div>
        <p className="mt-2 text-[15px] font-bold leading-none text-[#1A1A2E]">{formatDate(mock?.court.nextHearingDate)}</p>
        <p className="mt-1 text-xs text-[#374151]">{mock?.court.purpose}</p>
        <p className="mt-1 text-[11px] text-[#9CA3AF]">Court: {mock?.court.courtType} · Bail: {mock?.court.bailGrantableBy}</p>
      </div>
    </div>
  );
}

function IntelligenceTeaser({ similarCases, caseData, onOpenIntel }) {
  if (similarCases.length===0) return <p className="text-xs leading-relaxed text-[#6B7280]">No links found yet — as you make arrests, CrimeLens will surface connections here. Check the Intelligence tab anytime.</p>;
  const shared = similarCases.filter(s=>s.shared_accused_count>0).length;
  const districts = new Set(similarCases.map(s=>s.DistrictName)).size;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="ksp-mono text-[28px] font-black leading-none text-[#1A1A2E]">{similarCases.length}</span>
        <span className="text-sm font-semibold text-[#1A1A2E]">related FIRs found</span>
        <span className="ml-2 text-[11px] text-[#6B7280]">{shared? `${shared} share the same people` : "similar pattern"} · {districts} districts</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">We looked for the same accused, same crime type and nearby stations. Tap to see the network.</p>
      <button onClick={onOpenIntel} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#1A1A2E] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-black">See connections <ArrowRight size={12} /></button>
    </div>
  );
}

function LegalTeaser({ actSectionDetails }) {
  if (!actSectionDetails.length) return <p className="text-xs leading-relaxed text-[#6B7280]">No sections tagged yet.</p>;
  const first = actSectionDetails[0];
  const more = actSectionDetails.length-1;
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF2FF] text-[#3730A3]"><Scale size={14} /></span>
        <div>
          <p className="text-sm font-semibold text-[#1A1A2E]">{first.actMeta?.fullName || first.actId} — Section {first.sectionId}</p>
          <p className="text-[11px] text-[#6B7280]">{first.sectionMeta?.title || "Main offence"} · {first.sectionMeta?.bailable ? "Bailable" : "Non-bailable"}</p>
        </div>
      </div>
      {first.sectionMeta?.plain_language && <p className="mt-2 text-xs leading-relaxed text-[#374151] line-clamp-2">“{first.sectionMeta.plain_language}”</p>}
      <p className="mt-2 text-[11px] text-[#6B7280]">{actSectionDetails.length} sections total{more ? ` · +${more} more` : ""} — tap for punishments & links.</p>
    </div>
  );
}

function PeopleTab({ caseIntel, mock, rank, matchesScope, taskOnly, onAsk, caseId }) {
  const showAll = !taskOnly && rank !== "ASI" && rank !== "HC";
  const rows = (caseIntel?.accused || []).map((a, idx) => ({ a, m: mock?.mockAccused[idx] || {} })).filter(({ a }) => matchesScope(a.AccusedName) || matchesScope(a.GenderID));
  const filteredRows = taskOnly ? rows.filter(({ m }) => m.arrestStatus === "Absconding" || m.warrantIssued) : rows;
  return (
    <div className="space-y-4">
      <Section title={`Accused (${filteredRows.length}${taskOnly ? " — task-relevant" : ""})`} badge={{label:"Fact", tone:"fact"}}>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[#DDE3EC]"><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Name</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Age</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Arrest</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Bail</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Prior cases</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Actions</th></tr></thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filteredRows.map(({ a, m }) => (
                <tr key={a.AccusedMasterID} className={m.arrestStatus === "Absconding" ? "bg-[#FFFBEB]" : ""}>
                  <td className="px-2 py-1.5 font-medium text-[#1A1A2E]">{a.AccusedName} {m.arrestStatus === "Absconding" && <span className="ml-1 text-[11px] font-bold text-[#92400E]">⚠ ABSCONDING</span>} {m.warrantIssued && <span className="ml-1 border border-amber-300 bg-amber-100 px-1 text-[10px] font-bold uppercase text-[#92400E]">Warrant</span>}</td>
                  <td className="px-2 py-1.5 text-[#374151]">{a.AgeYear}y · {a.GenderID}</td>
                  <td className="px-2 py-1.5 text-[#374151]">{m.arrestStatus === "Absconding" ? "—" : `${m.arrestStatus} · ${formatDate(m.arrestDate)}`}</td>
                  <td className="px-2 py-1.5 text-[#374151]">{m.bailStatus}</td>
                  <td className="px-2 py-1.5 text-[#374151]">{m.priorCases} cases{m.convictions ? ` (${m.convictions} conviction)` : ""}</td>
                  <td className="px-2 py-1.5"><button onClick={()=>onAsk && onAsk(`What other FIRs involve ${a.AccusedName}?`)} className="text-[11px] font-semibold text-[#1A1A2E] underline">Trace</button></td>
                </tr>
              ))}
              {filteredRows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-xs text-[#9CA3AF]">No accused match filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[#9CA3AF]">Arrest/bail/warrant/prior — mocked in frontend (isMock) until ArrestSurrender/conviction tables land.</p>
      </Section>
      {showAll && (
        <>
          <Section title={`Victims (${(caseIntel?.victims || []).filter((v) => matchesScope(v.VictimName)).length})`}>
            <table className="w-full text-left text-sm"><thead><tr className="border-b border-[#DDE3EC]"><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Name</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Age</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Statement recorded</th></tr></thead><tbody className="divide-y divide-[#E5E7EB]">{(caseIntel?.victims || []).filter((v) => matchesScope(v.VictimName)).map((v, idx) => (<tr key={v.VictimMasterID}><td className="px-2 py-1.5 font-medium text-[#1A1A2E]">{v.VictimName}{v.VictimPolice && <span className="ml-1 border border-[#DDE3EC] bg-white px-1 text-[10px] font-bold uppercase text-[#374151]">Police</span>}</td><td className="px-2 py-1.5 text-[#374151]">{v.AgeYear}y · {v.GenderID}</td><td className="px-2 py-1.5 text-[#374151]">{(mock?.victimStatements[idx] ?? true) ? "Yes" : "No"} <span className="text-[10px] text-[#9CA3AF]">· mock</span></td></tr>))}</tbody></table>
          </Section>
          <Section title={`Witnesses (${(mock?.witnesses || []).filter((w) => matchesScope(w.name)).length})`}>
            <table className="w-full text-left text-sm"><thead><tr className="border-b border-[#DDE3EC]"><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Name</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Summons sent</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Examined</th><th className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Statement</th></tr></thead><tbody className="divide-y divide-[#E5E7EB]">{(mock?.witnesses || []).filter((w) => matchesScope(w.name)).map((w, i) => (<tr key={i}><td className="px-2 py-1.5 font-medium text-[#1A1A2E]">{w.name}</td><td className="px-2 py-1.5 text-[#374151]">{w.summonsSent ? "Yes" : "No"}</td><td className="px-2 py-1.5 text-[#374151]">{w.examined ? "Yes" : "No"}</td><td className="px-2 py-1.5 text-[#374151]">{w.statementRecorded ? "Yes" : "No"}</td></tr>))}</tbody></table><p className="mt-2 text-[10px] text-[#9CA3AF]">Witness data is mock — wire to Witness table when available.</p>
          </Section>
        </>
      )}
    </div>
  );
}

function EvidenceTab({ actSectionDetails, mock, caseData, matchesScope }) {
  return (
    <div className="space-y-4">
      <Section title="Acts & Sections — authoritative" badge={{label:"Fact", tone:"fact"}}>
        <div className="space-y-3">
          {actSectionDetails.filter((x) => matchesScope(x.actId) || matchesScope(x.sectionId)).map((item, i) => (
            <div key={i} className="border border-[#DDE3EC] bg-white p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-[#1A1A2E]">{item.actMeta?.fullName || item.actId} / {item.sectionMeta?.title ? `Section ${item.sectionId} — ${item.sectionMeta.title}` : `Section ${item.sectionId}`}</span>{item.sectionMeta?.bailable !== undefined && <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.sectionMeta.bailable ? "border border-[#2D6A4F] text-[#2D6A4F]" : "bg-[#D62828] text-white"}`}>{item.sectionMeta.bailable ? "Bailable" : "Non-Bailable"}</span>}</div>
              {item.sectionMeta?.plain_language && <p className="mt-1 text-xs leading-relaxed text-[#374151]">{item.sectionMeta.plain_language}</p>}
              <div className="mt-1 flex gap-3 text-[10px] font-medium">{(item.sectionMeta?.indiacode_url || item.actMeta?.indiacode_url) && <a href={item.sectionMeta?.indiacode_url || item.actMeta?.indiacode_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#1A1A2E] underline"><ExternalLink size={10} />IndiaCode</a>}{(item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url) && <a href={item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#1A1A2E] underline"><ExternalLink size={10} />Indian Kanoon</a>}{item.sectionMeta?.punishment && <span className="text-[#6B7280]">{item.sectionMeta.punishment}</span>}</div>
            </div>
          ))}
          {actSectionDetails.length === 0 && <p className="text-xs text-[#6B7280]">No acts recorded.</p>}
        </div>
        {actSectionDetails.some((x) => x.actId === "IPC") && <div className="mt-4 border border-amber-200 bg-[#FFFBEB] p-3"><p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">Replaced by Bharatiya Nyaya Sanhita (BNS) from 1 July 2024</p><p className="mt-1 text-xs text-[#78350F]">Cases before 1 July 2024 continue under IPC. New FIRs use BNS sections — verify mapping before chargesheet.</p></div>}
      </Section>
      <Section title="Court, proof & FSL — single source" badge={{label:"Fact", tone:"fact"}}>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Applicable court</p><p className="font-medium text-[#1A1A2E]">{mock?.court.courtType} <span className="text-[10px] font-normal text-[#9CA3AF]">· mock</span></p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Bail</p><p className="font-medium text-[#1A1A2E]">{mock?.court.bailGrantableBy} <span className="text-[10px] font-normal text-[#9CA3AF]">· mock</span></p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Property</p><p className="text-xs text-[#1A1A2E]">{mock?.property.items} <span className="text-[10px] text-[#9CA3AF]">· mock</span></p></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">FSL</p><p className="text-xs text-[#1A1A2E]">{mock?.fsl.status} {mock?.fsl.sentDate && `· sent ${formatDate(mock.fsl.sentDate)}`} {mock?.fsl.reportReceived && `· report ${formatDate(mock.fsl.reportDate)}`} <span className="text-[10px] text-[#9CA3AF]">· mock</span></p></div>
          <div className="col-span-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Standard proof for chargesheet</p><p className="text-xs text-[#374151]">FIR + arrest memo + seizure panchanama + witness statements + FSL report + medical report + CDR/location where relevant.</p></div>
        </div>
      </Section>
    </div>
  );
}

function InvestigationProgress({ caseData, caseIntel, mock, chargesheet }) {
  const rawItems = [
    { label: "FIR registered", done: true, detail: formatDate(caseData.CrimeRegisteredDate) },
    { label: "Accused arrested", done: (mock?.mockAccused.filter((a) => a.arrestStatus === "Arrested").length || 0) > 0, detail: `${mock?.mockAccused.filter((a) => a.arrestStatus === "Arrested").length || 0}/${mock?.mockAccused.length || 0} arrested` + (mock?.mockAccused.filter((a) => a.arrestStatus === "Absconding").length || 0 ? ` · ${mock.mockAccused.filter((a) => a.arrestStatus === "Absconding").length} absconding` : "") },
    { label: "Remand obtained", done: mock?.mockAccused.some((a) => a.bailStatus === "Remand"), detail: mock?.mockAccused.some((a) => a.bailStatus === "Remand") ? "Remand recorded" : "Pending" },
    { label: "Property seized", done: mock?.property.seized, detail: mock?.property.items },
    { label: "FSL sent", done: mock?.fsl.sent, detail: mock?.fsl.sent ? `Sent ${formatDate(mock.fsl.sentDate)}` : "Pending", overdue: mock?.fsl.status === "overdue" },
    { label: "FSL report received", done: mock?.fsl.reportReceived, detail: mock?.fsl.reportReceived ? formatDate(mock.fsl.reportDate) : "Overdue", overdue: !mock?.fsl.reportReceived && mock?.fsl.status === "overdue" },
    { label: "Witnesses examined", done: (mock?.witnesses.filter((w) => w.examined).length || 0) === (mock?.witnesses.length || 0), detail: `${mock?.witnesses.filter((w) => w.examined).length || 0}/${mock?.witnesses.length || 0} examined` },
    { label: "Statements recorded", done: (mock?.victimStatements.filter(Boolean).length || 0) >= (caseIntel?.victims?.length || 0) / 2, detail: `${mock?.victimStatements.filter(Boolean).length || 0}/${caseIntel?.victims?.length || 0} victims` },
    { label: `Chargesheet filed (${chargesheet?.limitDays || 60}d limit)`, done: false, detail: chargesheet ? chargesheet.diff < 0 ? `Overdue by ${Math.abs(chargesheet.diff)}d` : `Due in ${chargesheet.diff}d` : "—", overdue: chargesheet?.tone === "overdue" || chargesheet?.tone === "critical" },
  ];
  const items = rawItems.map((it) => {
    const isDone = it.done; const isOverdue = !isDone && it.overdue; const isPending = !isDone && !isOverdue && it.detail === "Pending"; const isInProgress = !isDone && !isOverdue && !isPending;
    const hasProgress = !isDone && !isOverdue && /\d+\/\d+/.test(it.detail) && !it.detail.startsWith("0/");
    let tone = "pending"; if (isDone) tone = "done"; else if (isOverdue) tone = "overdue"; else if (hasProgress || isInProgress) tone = "progress"; return { ...it, tone };
  });
  return (
    <Section title="Investigation Progress" badge={{label:"Fact", tone:"fact"}}>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className={`flex items-center justify-between border px-3 py-2 text-sm ${it.tone === "done" ? "border-[#2D6A4F]/30 bg-[#F0FDF4]" : it.tone === "overdue" ? "border-[#D62828]/30 bg-[#FEF2F2]" : "border-[#DDE3EC] bg-white"}`}>
            <span className={`flex items-center gap-2 font-medium ${it.tone === "done" ? "text-[#2D6A4F]" : it.tone === "overdue" ? "text-[#D62828]" : "text-[#1A1A2E]"}`}><span className={`flex h-4 w-4 items-center justify-center border text-[10px] ${it.tone === "done" ? "border-[#2D6A4F] bg-[#2D6A4F] text-white" : it.tone === "overdue" ? "border-[#D62828] text-[#D62828]" : it.tone === "progress" ? "border-[#C85A00] text-[#C85A00]" : "border-[#DDE3EC] text-[#6B7280]"}`}>{it.tone === "done" ? "✓" : it.tone === "overdue" ? "!" : "○"}</span>{it.label}</span>
            <span className={`text-xs ${it.tone === "overdue" ? "font-semibold text-[#D62828]" : "text-[#6B7280]"}`}>{it.detail}</span>
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
      <InvestigationProgress caseData={caseData} caseIntel={caseIntel} mock={mock} chargesheet={chargesheet} />
      <Section title="Case progression" badge={{label:"Fact", tone:"fact"}}>
        <div className="relative border-l border-[#DDE3EC] pl-6">
          {events.map((ev, i) => (
            <div key={i} className="relative mb-6"><span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#1A1A2E]" /><p className="ksp-mono text-xs font-semibold text-[#1A1A2E]">{formatMonoDate(ev.date)}</p><p className="text-sm font-semibold text-[#1A1A2E]">{ev.title}</p><p className="text-xs text-[#6B7280]">{ev.detail}</p></div>
          ))}
          <div className="relative mb-2"><span className="absolute -left-[25px] top-1 h-2 w-2 border border-[#1A1A2E] bg-white" /><p className="ksp-mono text-xs font-semibold text-[#374151]">Registered {formatMonoDate(caseData.CrimeRegisteredDate)} · FIR</p><p className="text-xs text-[#6B7280]">Incident {formatDate(caseData.IncidentFromDate)} at {caseData.UnitName}</p></div>
          {mock?.fsl.status==="overdue" && <div className="relative mb-2"><span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#D62828] animate-pulse" /><p className="ksp-mono text-xs font-semibold text-[#D62828]">TODAY — FSL report pending</p><p className="text-xs text-[#6B7280]">Sent {formatDate(mock.fsl.sentDate)} · overdue</p></div>}
          <div className="relative"><span className="absolute -left-[25px] top-1 h-2 w-2 bg-[#D62828]" /><p className="ksp-mono text-xs font-bold text-[#D62828]">{formatMonoDate(mock?.court.nextHearingDate)} — COURT HEARING</p><p className="text-xs text-[#6B7280]">{mock?.court.purpose}</p></div>
        </div>
        <p className="mt-3 text-[10px] text-[#9CA3AF]">Timeline is mock-seeded per caseId (deterministic). Wire to ArrestSurrender / CourtHearings / FSL tables when available.</p>
      </Section>
    </div>
  );
}

function IntelTab({ similarCases, caseData, mock, matchesScope, onAsk }) {
  const filtered = similarCases.filter((s) => matchesScope(s.CrimeNo) || matchesScope(s.CrimeGroupName));
  const byStation = filtered.reduce((acc, s) => { const k = s.UnitName || "Unknown"; (acc[k] = acc[k] || []).push(s); return acc; }, {});
  return (
    <div className="space-y-4">
      <Section title="Co-accused links" badge={{label:"System-derived", tone:"intel"}}>
        <p className="text-sm text-[#1A1A2E]">{filtered.filter((s) => s.shared_accused_count > 0).length > 0 ? `${filtered.filter((s) => s.shared_accused_count > 0).length} cases share accused with this FIR` : "No co-accused links detected."}</p>
        <div className="mt-3 space-y-2">{Object.entries(byStation).slice(0, 3).map(([station, arr]) => (<p key={station} className="text-xs text-[#374151]">{arr.length} accused appear in {arr.length} other FIRs at {station} <span className="text-[#6B7280]">— {arr.slice(0, 2).map((a) => a.CrimeNo).join(", ")}</span></p>))}</div>
        {filtered.filter(s=>s.shared_accused_count>0).length>0 && <button onClick={()=>onAsk && onAsk("Are these accused connected to other burglaries?")} className="mt-3 border border-[#1A1A2E] bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white">Ask CrimeLens about links →</button>}
      </Section>
      <Section title={`Similar MO — ${filtered.length} cases`} badge={{label:"System-derived", tone:"intel"}}>
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.CaseMasterID} className="border border-[#DDE3EC] bg-white p-3">
              <div className="flex items-center justify-between"><span className="ksp-mono text-xs font-bold text-[#1A1A2E]">{s.CrimeNo} · {s.DistrictName || s.UnitName}</span><span className="border border-[#DDE3EC] bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#374151]">{s.similarity || "Similar"}</span></div>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Why similar</p>
              <p className="text-xs text-[#374151]">{s.reasons?.slice(0,3).join(" · ") || [s.CrimeGroupName, s.Gravity].filter(Boolean).join(" · ")}</p>
              {(s.shared_accused_count > 0 || s.shared_act_count > 0) && <p className="mt-1 text-[11px] font-medium text-[#1A1A2E]">{s.shared_accused_count > 0 && `${s.shared_accused_count} shared accused`} {s.shared_accused_count > 0 && s.shared_act_count > 0 && "·"} {s.shared_act_count > 0 && `${s.shared_act_count} shared acts`}</p>}
              <div className="mt-2 flex gap-1.5"><button onClick={()=>onAsk && onAsk(`Compare this case with ${s.CrimeNo}`)} className="border border-[#DDE3EC] bg-white px-2 py-1 text-[11px] font-medium text-[#1A1A2E] hover:border-[#1A1A2E]">Compare</button><button onClick={()=>onAsk && onAsk(`Tell me about ${s.CrimeNo}`)} className="border border-[#1A1A2E] bg-[#1A1A2E] px-2 py-1 text-[11px] font-medium text-white">Ask about this</button></div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-xs text-[#6B7280]">No matches for scoped query.</p>}
        </div>
      </Section>
    </div>
  );
}
