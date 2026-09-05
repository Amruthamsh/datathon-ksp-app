import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  MapPin,
  Copy,
  Check,
  Volume2,
  RefreshCw,
  Crosshair,
  Layers,
  BarChart3,
  Clock,
  X,
  Mic,
  MicOff,
  Paperclip,
  File,
  Eye,
  Target,
  Building2,
  Zap,
} from "lucide-react";
import PropTypes from "prop-types";
import { useAuth } from "../../auth/AuthContext";
import { generateResponse, sendFeedback } from "../../api/chat"; // eslint-disable-line no-unused-vars -- retained for feedback
import useSpeechRecognition from "../../hooks/useSpeechRecognition";
import useSpeechSynthesis from "../../hooks/useSpeechSynthesis";
import ChartRenderer from "../ChartRenderer";
import { formatValue } from "../../utils/chatUtils";

// ── Known Karnataka districts for quick action extraction ───────────────
const DISTRICTS = [
  "Bagalkot",
  "Ballari",
  "Belagavi",
  "Bengaluru Rural",
  "Bengaluru Urban",
  "Bidar",
  "Chamarajanagar",
  "Chikballapur",
  "Chikkamagaluru",
  "Chitradurga",
  "Dakshina Kannada",
  "Davanagere",
  "Dharwad",
  "Gadag",
  "Hassan",
  "Haveri",
  "Kalaburagi",
  "Kodagu",
  "Kolar",
  "Koppal",
  "Mandya",
  "Mysuru",
  "Raichur",
  "Ramanagara",
  "Shivamogga",
  "Tumakuru",
  "Udupi",
  "Uttara Kannada",
  "Vijayapura",
  "Yadgir",
  "Vijayanagara",
];

// Alias map for district search (handles Bengaluru/Bangalore etc)
const DISTRICT_ALIAS = {
  bangalore: "Bengaluru Urban",
  bengaluru: "Bengaluru Urban",
  mysore: "Mysuru",
  mangalore: "Dakshina Kannada",
  hubli: "Dharwad",
  belgaum: "Belagavi",
  gulbarga: "Kalaburagi",
  bellary: "Ballari",
};

function normalizeDistrict(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  if (DISTRICT_ALIAS[lower]) return DISTRICT_ALIAS[lower];
  const found = DISTRICTS.find((d) => d.toLowerCase() === lower);
  return found || null;
}

function extractDistrictsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = new Set();
  DISTRICTS.forEach((d) => {
    if (lower.includes(d.toLowerCase())) hits.add(d);
  });
  Object.entries(DISTRICT_ALIAS).forEach(([alias, canonical]) => {
    if (lower.includes(alias)) hits.add(canonical);
  });
  return Array.from(hits);
}

function formatMonthLabel(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function buildMapContextBlock(mapContext) {
  if (!mapContext) return "";
  const parts = [];
  parts.push(`[Map Context — Crime Intelligence Map]`);
  if (mapContext.viewMode) parts.push(`View mode: ${mapContext.viewMode}`);
  if (mapContext.viewState) {
    parts.push(
      `Viewport: lat ${Number(mapContext.viewState.latitude).toFixed(3)}, lng ${Number(mapContext.viewState.longitude).toFixed(3)}, zoom ${Number(mapContext.viewState.zoom).toFixed(1)}`,
    );
  }
  if (mapContext.dateFrom || mapContext.dateTo) {
    const from = mapContext.dateFrom ? mapContext.dateFrom.slice(0, 10) : "—";
    const to = mapContext.dateTo ? mapContext.dateTo.slice(0, 10) : "—";
    parts.push(`Visible date range: ${from} to ${to}`);
  }
  if (mapContext.activeSubTypes && mapContext.activeSubTypes.length) {
    parts.push(`Filtered crime sub-types: ${mapContext.activeSubTypes.join(", ")}`);
  } else if (mapContext.activeSubTypes && mapContext.activeSubTypes.length === 0) {
    parts.push(`Filtered crime sub-types: (none selected — showing all)`);
  } else {
    parts.push(`Crime filter: All types`);
  }
  const poiActive = mapContext.poiFilters
    ? Object.entries(mapContext.poiFilters)
        .filter(([, v]) => v)
        .map(([k]) => k.replace("_", " "))
    : [];
  if (poiActive.length) parts.push(`POI overlays active: ${poiActive.join(", ")}`);
  if (mapContext.showSocioOverlay) parts.push(`Socio-economic tint: ON`);
  if (mapContext.showNetworks) parts.push(`Criminal network overlay: ON`);
  if (mapContext.crimesCount != null) parts.push(`Crimes visible on map: ${mapContext.crimesCount}`);
  if (mapContext.filteredCount != null && mapContext.filteredCount !== mapContext.crimesCount)
    parts.push(`Filtered count: ${mapContext.filteredCount}`);

  if (mapContext.selectedSpot) {
    const s = mapContext.selectedSpot;
    if (s.type === "District") {
      parts.push(
        `Selected district: ${s.name} — risk ${Math.round(s.risk_score ?? 0)} (${s.risk_level || "?"}) rank #${s.rank ?? "?"}, crimes ${s.crime_count ?? "?"}, top crime ${s.top_crime || "?"}, trend ${s.change_pct != null ? `${s.change_pct}%` : "?"}`,
      );
      if (s.socio) {
        parts.push(
          `Socio: unemployment ${s.socio.unemployment_rate}%, literacy ${s.socio.literacy_rate}%, density ${s.socio.population_density}/km²`,
        );
      }
      if (s.multipliers) {
        parts.push(
          `Multipliers: unemp bonus ${s.multipliers.unemployment_bonus ?? 0}, poi bonus ${s.multipliers.poi_bonus ?? 0}, weather bonus ${s.multipliers.weather_bonus ?? 0}`,
        );
      }
    } else if (s.type === "Crime") {
      parts.push(
        `Selected crime: ${s.sub_type || s.crime_type || s.name || "?"} id ${s.id || s.CrimeNo || "?"}, district ${s.district || "?"}, gravity ${s.gravity || "?"}, date ${s.date || s.CrimeRegisteredDate || "?"}, lat ${s.lat}, lng ${s.lng}`,
      );
      if (s.BriefFacts) parts.push(`Brief facts: ${s.BriefFacts.slice(0, 380)}`);
    } else if (s.type === "Cluster" || s.type === "Hotspot") {
      parts.push(
        `Selected hotspot: ${s.dominant_crime || s.name || "?"} cluster at ${s.lat?.toFixed?.(4) ?? "?"},${s.lng?.toFixed?.(4) ?? "?"}, total ${s.totalCrimes ?? s.crime_count ?? "?"}`,
      );
      if (mapContext.hotspotDetail) {
        const d = mapContext.hotspotDetail;
        parts.push(
          `Hotspot detail: total ${d.crime_count}, peak ${d.peak_time}, repeat ${d.repeat_offenders}, linked cases ${d.linked_investigations}, networks ${d.active_networks}, top crimes ${(d.top_crimes || []).map((c) => `${c.CrimeGroupName}:${c.cnt}`).join(", ")}`,
        );
      }
    } else if (s.type === "Criminal Network") {
      parts.push(
        `Selected network: ${s.network_name || s.name} — ${s.member_count} members, ${s.total_firs} FIRs, risk ${s.risk}, districts ${(s.districts || []).join(", ")}`,
      );
    } else if (s.type === "POI") {
      parts.push(
        `Selected POI: ${s.name || "?"} type ${s.poi_type} risk weight ${s.risk_weight ?? "?"}, district ${s.district || "?"}, lat ${s.lat}, lng ${s.lng}`,
      );
    } else {
      parts.push(`Selected: ${s.name || s.id || "?"} type ${s.type}`);
    }
  } else {
    parts.push(`No map selection — showing statewide summary`);
    if (mapContext.summary) {
      const hp = mapContext.summary.highest_priority_district;
      if (hp) parts.push(`State priority district: ${hp.name} — ${hp.reason}`);
      parts.push(
        `Summary: risk ${mapContext.summary.today_risk || "?"}, emerging hotspots ${mapContext.summary.emerging_hotspots ?? "?"}, repeat areas ${mapContext.summary.repeat_offender_areas ?? "?"}, crimes 30d ${mapContext.summary.active_hotspots ?? "?"}`,
      );
    }
  }

  // Top enhanced risk districts context (helps LLM ground without querying)
  if (mapContext.enhancedRisk && mapContext.enhancedRisk.length) {
    const top3 = [...mapContext.enhancedRisk]
      .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
      .slice(0, 5)
      .map((d) => `${d.district}(${Math.round(d.risk_score)} ${d.risk_level})`)
      .join(", ");
    parts.push(`Top risk districts (enhanced): ${top3}`);
  }

  parts.push(
    `Instruction: Combine Crime Database SQL analysis with this live map context. When relevant, suggest a map action (e.g., "Focus on Mysuru", "Filter to Theft", "Switch to District Risk") and explain why. Keep analysis concise and investigative.`,
  );

  return parts.join("\n");
}

function getContextSummary(mapContext, mapLabel = "Map") {
  if (!mapContext) return null;
  const bits = [];
  bits.push(mapContext.viewMode || mapLabel);
  if (mapContext.dateFrom && mapContext.dateTo) {
    const f = mapContext.dateFrom.slice(0, 7);
    const t = mapContext.dateTo.slice(0, 7);
    if (f === t) bits.push(f);
    else bits.push(`${formatMonthLabel(f)} – ${formatMonthLabel(t)}`);
  }
  if (mapContext.selectedSpot) {
    const s = mapContext.selectedSpot;
    if (s.type === "District") bits.push(s.name);
    else if (s.type === "POI") bits.push(s.poi_type?.replace("_", " ") || "POI");
    else if (s.type === "Crime") bits.push(s.sub_type || "FIR");
    else if (s.type === "Cluster") bits.push("Cluster");
    else if (s.type === "Criminal Network") bits.push("Network");
  }
  if (mapContext.activeSubTypes && mapContext.activeSubTypes.length && mapContext.activeSubTypes.length < 6) {
    bits.push(mapContext.activeSubTypes.slice(0, 2).join(", "));
  }
  return bits.join(" · ");
}

function buildStarterPrompts(mapContext) {
  const prompts = [];
  const sel = mapContext?.selectedSpot;

  if (sel?.type === "District") {
    prompts.push(`Why is ${sel.name} at elevated risk? Correlate unemployment, POI density and crime trend.`);
    prompts.push(`Compare ${sel.name} with state average — unemployment, literacy and repeat offenders.`);
    prompts.push(`What crime type is driving ${sel.name} risk? Recommend patrol placement.`);
  } else if (sel?.type === "Crime") {
    prompts.push(`Is this FIR part of a larger pattern? Link to repeat offenders and nearby hotspots.`);
    prompts.push(`What district and time pattern does this crime type show in the current date range?`);
  } else if (sel?.type === "Cluster" || sel?.type === "Hotspot") {
    prompts.push(`Explain this hotspot's peak window and risk factors — where to deploy?`);
    prompts.push(`Which stations cover this cluster and what stations are nearby?`);
  } else if (sel?.type === "POI") {
    prompts.push(`How does ${sel.poi_type?.replace("_", " ")} density correlate with crime near ${sel.district}?`);
    prompts.push(`Are property crimes elevated near this POI cluster vs state baseline?`);
  } else if (sel?.type === "Criminal Network") {
    prompts.push(`How active is this network across districts? Who are bridge members?`);
  } else {
    // overview
    if (mapContext?.viewMode === "Administrative") {
      prompts.push(`Which 3 districts have the highest enhanced risk and why?`);
      prompts.push(`How does unemployment map to risk? List districts where both are high.`);
    } else if (mapContext?.viewMode === "Clusters") {
      prompts.push(`Where are the largest clusters in this date range and what's their dominant crime?`);
      prompts.push(`Which hotspot has the most repeat offenders?`);
    } else {
      prompts.push(`Which crime type is spiking in this date range vs previous period?`);
      prompts.push(`Show the top 5 stations by crime count in the visible range.`);
    }
  }

  // Always add a temporal + source prompt
  if (prompts.length < 4) {
    prompts.push(`Break down crimes by time of day — where should night patrols focus?`);
  }
  if (prompts.length > 4) prompts.length = 4;
  return prompts;
}

function AssistantAnalysisInline({ analysis, onMapAction }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!analysis || (!analysis.sql_query && !analysis.sql_result?.length && !analysis.charts?.length)) return null;

  const rows = Array.isArray(analysis.sql_result) ? analysis.sql_result : [];
  const charts = Array.isArray(analysis.charts) ? analysis.charts : [];
  const hasData = rows.length > 0 || charts.length > 0;
  if (!hasData) return null;

  const mapChips = [];
  if (rows.length) {
    const cols = Object.keys(rows[0] || {});
    const districtCol = cols.find((c) => /district/i.test(c));
    const crimeCol = cols.find((c) => /crime|sub.?type|offence/i.test(c));
    if (districtCol) {
      const uniq = [...new Set(rows.map((r) => String(r[districtCol] || "").trim()).filter(Boolean))].slice(0, 3);
      uniq.forEach((d) => {
        if (DISTRICTS.includes(d) || normalizeDistrict(d))
          mapChips.push({ label: t("mapPanel.focus", { name: d }), type: "flyToDistrict", district: d });
      });
    }
    if (crimeCol && mapChips.length < 4) {
      const uniq = [...new Set(rows.map((r) => String(r[crimeCol] || "").trim()).filter(Boolean))].slice(0, 2);
      uniq.forEach((c) => mapChips.push({ label: t("mapPanel.filter", { name: c }), type: "filterCrime", crime: c }));
    }
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100 transition cursor-pointer"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <BarChart3 className="h-3.5 w-3.5 text-slate-500" />
          {t("mapPanel.viewData")}
          <span className="text-[11px] font-normal text-slate-500">
            · {t("mapPanel.rows", { count: rows.length })}
            {charts.length ? ` · ${t("mapPanel.charts", { count: charts.length })}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
          {expanded ? t("mapPanel.hide") : t("mapPanel.show")} <Eye className="h-3 w-3" />
        </span>
      </button>

      {mapChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-slate-100 bg-white">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Target className="h-3 w-3" /> {t("mapPanel.onMap")}
          </span>
          {mapChips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => onMapAction?.(chip)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer"
            >
              <Crosshair className="h-3 w-3 text-slate-500" /> {chip.label}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-200">
          {charts.length > 0 && (
            <div className="p-3 space-y-3 bg-slate-50">
              {charts.map((c, idx) => (
                <div key={idx} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-800">{c.title || c.intent || t("mapPanel.visual", { index: idx + 1 })}</p>
                    {c.reason && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{c.reason}</p>}
                  </div>
                  <div className="h-[240px] p-2">
                    <ChartRenderer rawConfig={c} rawRows={rows} compact />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-[220px] overflow-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  {rows[0] &&
                    Object.keys(rows[0]).map((col) => (
                      <th key={col} className="whitespace-nowrap border-b border-slate-200 px-2.5 py-2 font-semibold text-slate-700">
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-slate-50">
                    {Object.keys(rows[0]).map((col) => (
                      <td key={col} className="whitespace-nowrap border-b border-slate-100 px-2.5 py-1.5 text-slate-700">
                        {formatValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <p className="px-3 py-1.5 text-[11px] text-slate-500">{t("mapPanel.showing", { count: rows.length })}</p>}
          </div>

          {analysis.sql_query && (
            <div className="border-t border-slate-200 bg-slate-950 px-3 py-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">SQL</p>
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-100">{analysis.sql_query}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

AssistantAnalysisInline.propTypes = {
  analysis: PropTypes.object,
  onMapAction: PropTypes.func,
  mapContext: PropTypes.object,
};

export default function MapChatPanel({ token, mapContext, onMapAction, initialQuery, initialQueryKey }) {
  const { t, i18n } = useTranslation();
  useAuth(); // keep auth context alive for token scoping

  const GREETING = useMemo(
    () => ({
      role: "assistant",
      content: t("crimeMap.chat.greeting", {
        defaultValue:
          "I'm CrimeLens—your investigative analyst. Ask about what's on the map and I'll blend live view context with the KSP crime database. Try a suggested prompt below or type your own.",
      }),
    }),
    [t],
  );

  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [showContext, setShowContext] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [speakingIndex, setSpeakingIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamIntervalRef = useRef(null);

  const { speak, stop } = useSpeechSynthesis();
  const handleTranscript = useCallback((text) => setInput(text), []);
  const { supported, isListening, startListening, stopListening } = useSpeechRecognition(handleTranscript);

  const contextSummary = useMemo(
    () => getContextSummary(mapContext, t("mapPanel.mapLabel")),
    [mapContext, t],
  );
  const starterPrompts = useMemo(() => buildStarterPrompts(mapContext), [mapContext]);
  const contextBlock = useMemo(() => buildMapContextBlock(mapContext), [mapContext]);

  // keep greeting in sync with language
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === "assistant" && !prev[0].analysis) {
        return [GREETING];
      }
      return prev;
    });
  }, [GREETING]);

  // Reset streaming on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Gentle scroll on user message
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "user") return;
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [messages]);

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
        alert(t("mapPanel.unsupported", { name: file.name }));
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(t("mapPanel.tooBig", { name: file.name }));
        continue;
      }
      valid.push(file);
    }
    if (valid.length) setAttachedFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const startFakeStreaming = useCallback((fullText, analysis, meta, pendingConversationId) => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    const text = fullText || "";
    if (!text) {
      setMessages((prev) => [...prev, { role: "assistant", content: "", analysis, ...meta, feedback: null }]);
      setFollowUps(analysis?.follow_up_questions || []);
      if (pendingConversationId) setConversationId(pendingConversationId);
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: "", analysis, ...meta, feedback: null }]);
    setIsStreaming(true);
    const CHUNK_SIZE = 24;
    const INTERVAL_MS = 26;
    let cursor = 0;
    streamIntervalRef.current = setInterval(() => {
      cursor = Math.min(cursor + CHUNK_SIZE, text.length);
      const chunk = text.slice(0, cursor);
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].role === "assistant") next[lastIdx] = { ...next[lastIdx], content: chunk };
        return next;
      });
      if (cursor >= text.length) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        setIsStreaming(false);
        setFollowUps(analysis?.follow_up_questions || []);
        if (pendingConversationId) setConversationId(pendingConversationId);
      }
    }, INTERVAL_MS);
  }, []);

  const sendMessage = async (message = input) => {
    if ((!message.trim() && !attachedFiles.length) || loading || isStreaming) return;
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
      setIsStreaming(false);
    }
    stop();

    // Capture map context snapshot for display
    const ctxSnapshot = {
      summary: contextSummary,
      viewMode: mapContext?.viewMode,
      dateFrom: mapContext?.dateFrom,
      dateTo: mapContext?.dateTo,
      selectedLabel: mapContext?.selectedSpot
        ? mapContext.selectedSpot.name || mapContext.selectedSpot.sub_type || mapContext.selectedSpot.type
        : null,
    };

    setMessages((prev) => [...prev, { role: "user", content: message, mapContext: ctxSnapshot }]);
    const filesToSend = attachedFiles;
    setInput("");
    setAttachedFiles([]);
    setLoading(true);
    setFollowUps([]);

    try {
      const enriched = contextBlock ? `${message}\n\n${contextBlock}` : message;
      const data = await generateResponse(token, enriched, conversationId || null, i18n.language, filesToSend, {});

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
        sources: { crimeDatabase: true, map: true },
      };
      setLoading(false);
      const pendingConversationId = !conversationId && data.conversation_id ? data.conversation_id : null;
      if (pendingConversationId) setConversationId(pendingConversationId);
      else if (data.conversation_id) setConversationId(data.conversation_id);
      startFakeStreaming(data.response || "", analysis, meta, null);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  // Auto-send when parent pushes a query (e.g., “Analyze this district”)
  const lastInitialKeyRef = useRef(null);
  useEffect(() => {
    if (initialQuery && initialQueryKey != null && lastInitialKeyRef.current !== initialQueryKey) {
      lastInitialKeyRef.current = initialQueryKey;
      const timer = setTimeout(() => {
        if (!loading && !isStreaming) sendMessage(initialQuery);
      }, 90);
      return () => clearTimeout(timer);
    }
  }, [initialQuery, initialQueryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error(err);
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
      sendFeedback(token, conversationId, msg.created_at, newFeedback).catch((err) =>
        console.error("Feedback failed", err),
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

  const handleMapQuickAction = useCallback(
    (chip) => {
      if (!onMapAction) return;
      // Also send a contextual message so the conversation reflects the navigation
      if (chip.type === "flyToDistrict") {
        onMapAction({ type: "flyToDistrict", district: chip.district });
      } else if (chip.type === "filterCrime") {
        onMapAction({ type: "filterCrime", crime: chip.crime });
      } else {
        onMapAction(chip);
      }
    },
    [onMapAction],
  );

  // Quick map actions derived from last assistant response - also derived from text
  const responseMapActions = useCallback(
    (msg) => {
      if (!msg?.content) return [];
      const districtsInText = extractDistrictsFromText(msg.content);
      // Prefer analysis-derived, fallback to text-derived
      const chips = [];
      districtsInText.slice(0, 3).forEach((d) => {
        chips.push({ label: t("mapPanel.focus", { name: d }), type: "flyToDistrict", district: d });
      });
      return chips;
    },
    [t],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Context bar */}
      <div className="shrink-0 border-b border-slate-200 bg-[#F8FAFC] px-3 py-2">
        <button
          onClick={() => setShowContext((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:bg-slate-50 transition cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900 text-white">
              <MapPin size={12} />
            </span>
            <span className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t("mapPanel.contextIncluded")}
              </p>
              <p className="truncate text-xs font-semibold text-slate-800">{contextSummary || t("mapPanel.statewide")}</p>
            </span>
          </span>
          <span className="shrink-0 text-slate-400">
            {showContext ? <X size={14} /> : <ChevronRight size={14} className="rotate-90" />}
          </span>
        </button>
        {showContext && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 space-y-2 animate-in fade-in">
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                <Layers size={11} />{" "}
                {mapContext?.viewMode === "Clusters"
                  ? t("mapPanel.viewModes.clusters")
                  : mapContext?.viewMode === "Administrative"
                    ? t("mapPanel.viewModes.risk")
                    : t("mapPanel.viewModes.heatmap")}
              </span>
              {mapContext?.dateFrom && mapContext?.dateTo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700">
                  <Clock size={11} /> {mapContext.dateFrom.slice(0, 10)} → {mapContext.dateTo.slice(0, 10)}
                </span>
              )}
              {mapContext?.selectedSpot && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-800">
                  <Target size={11} /> {mapContext.selectedSpot.name || mapContext.selectedSpot.sub_type || mapContext.selectedSpot.type}
                </span>
              )}
            </div>
            {mapContext?.selectedSpot ? (
              <p className="text-xs leading-relaxed text-slate-600">
                {mapContext.selectedSpot.type === "District" && (
                  <>
                    <span className="font-semibold text-slate-800">{mapContext.selectedSpot.name}</span> — risk {Math.round(mapContext.selectedSpot.risk_score)} ({mapContext.selectedSpot.risk_level}) · {mapContext.selectedSpot.crime_count} crimes · {mapContext.selectedSpot.top_crime || "mixed crime"}
                  </>
                )}
                {mapContext.selectedSpot.type === "Crime" && (
                  <>
                    {mapContext.selectedSpot.sub_type} · {mapContext.selectedSpot.district} · {mapContext.selectedSpot.station}
                  </>
                )}
                {mapContext.selectedSpot.type === "POI" && (
                  <>
                    {mapContext.selectedSpot.poi_type?.replace("_", " ")} · weight {mapContext.selectedSpot.risk_weight} · {mapContext.selectedSpot.district}
                  </>
                )}
                {mapContext.selectedSpot.type === "Cluster" && <>Cluster {mapContext.selectedSpot.dominant_crime} · {mapContext.selectedSpot.totalCrimes} incidents</>}
                {mapContext.selectedSpot.type === "Criminal Network" && <>{mapContext.selectedSpot.network_name} · {mapContext.selectedSpot.member_count} members</>}
              </p>
            ) : (
              <p className="text-xs text-slate-600">{t("mapPanel.noSelection")}</p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
              <button
                onClick={() => onMapAction?.({ type: "setViewMode", mode: "Heatmap" })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${mapContext?.viewMode === "Heatmap" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {t("mapPanel.viewModes.heatmap")}
              </button>
              <button
                onClick={() => onMapAction?.({ type: "setViewMode", mode: "Clusters" })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${mapContext?.viewMode === "Clusters" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {t("mapPanel.viewModes.clusters")}
              </button>
              <button
                onClick={() => onMapAction?.({ type: "setViewMode", mode: "Administrative" })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition cursor-pointer ${mapContext?.viewMode === "Administrative" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {t("mapPanel.viewModes.risk")}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">{t("mapPanel.contextSent")}</p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 overscroll-contain">
        {messages.map((m, i) => {
          const hasAnalysis =
            m.analysis && (m.analysis.sql_query || (Array.isArray(m.analysis.sql_result) && m.analysis.sql_result.length > 0) || m.analysis.charts?.length);
          const isAssistantLastStreaming = isStreaming && i === messages.length - 1 && m.role === "assistant";
          const textActions = m.role === "assistant" && !isAssistantLastStreaming ? responseMapActions(m) : [];
          return (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`rounded-2xl px-3.5 py-2.5 shadow-sm text-[13px] leading-5 max-w-[92%] ${
                  m.role === "user" ? "bg-red-50 border border-red-100" : "bg-slate-50 border border-slate-200"
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-[15px] font-bold mt-2 mb-1 text-slate-900">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-[13px] font-semibold mt-2 mb-1 border-b border-slate-200 pb-1 text-slate-900">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-[13px] font-semibold mt-1.5 mb-1 text-slate-900">{children}</h3>,
                    p: ({ children }) => <p className="mb-1.5 leading-5 text-slate-800">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-1.5 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-1.5 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="leading-5">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-slate-300 pl-3 italic text-slate-600 my-1.5">{children}</blockquote>
                    ),
                    code: ({ children }) => <code className="rounded bg-slate-200 px-1 py-0.5 text-xs font-mono">{children}</code>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
                {isAssistantLastStreaming && <span className="inline-block w-2 h-4 bg-slate-500 animate-pulse ml-0.5 translate-y-0.5 align-middle" />}

                {m.role === "user" && m.mapContext && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                      <MapPin size={10} /> {m.mapContext.summary || t("mapPanel.mapContext")}
                    </span>
                  </div>
                )}

                {m.role === "assistant" && m.sources?.map && !isAssistantLastStreaming && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-200/60 pt-2">
                    <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-400">{t("chat.sources")}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-bold uppercase">
                      <Building2 size={10} /> {t("mapPanel.kspDb")}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                      <MapPin size={10} /> {t("mapPanel.mapView")}
                    </span>
                  </div>
                )}

                {/* Response-derived quick map actions */}
                {m.role === "assistant" && textActions.length > 0 && !isAssistantLastStreaming && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {textActions.map((a) => (
                      <button
                        key={a.label}
                        onClick={() => handleMapQuickAction(a)}
                        className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
                      >
                        <Crosshair className="h-3 w-3 text-blue-900" /> {a.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline analysis */}
                {m.role === "assistant" && hasAnalysis && !isAssistantLastStreaming && (
                  <AssistantAnalysisInline analysis={m.analysis} onMapAction={handleMapQuickAction} mapContext={mapContext} />
                )}

                {/* Action bar */}
                {m.role === "assistant" && m !== GREETING && !isAssistantLastStreaming && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(m.content, i)}
                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition cursor-pointer"
                      title={t("chat.copy", { defaultValue: "Copy" })}
                    >
                      {copiedIndex === i ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
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
                      className={`flex h-6 w-6 items-center justify-center rounded transition cursor-pointer ${speakingIndex === i ? "bg-red-100 text-red-600" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"}`}
                      title={speakingIndex === i ? t("chat.stop") : t("chat.readAloud")}
                    >
                      <Volume2 size={12} />
                    </button>
                    <button
                      onClick={() => handleFeedback(i, "up")}
                      className={`hidden h-6 w-6 items-center justify-center rounded transition cursor-pointer ${m.feedback === "up" ? "text-blue-600 bg-blue-100" : "text-slate-400 hover:bg-slate-200"}`}
                      title={t("chat.helpful")}
                    >
                      <span className="text-[11px]">👍</span>
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
            <div className="rounded-2xl bg-slate-100 border border-slate-200 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: ".15s" }} />
                <span className="h-2 w-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: ".3s" }} />
              </div>
            </div>
          </div>
        )}

        {/* Starter prompts */}
        {!loading && !isStreaming && messages.length <= 1 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 flex items-center gap-1">
                <Sparkles size={11} className="text-amber-500" /> {t("mapPanel.tryAsking")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            </div>
            <div className="grid gap-2">
              {starterPrompts.map((q, idx) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{ animationDelay: `${idx * 60}ms` }}
                  className="group flex w-full items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-red-200 hover:bg-red-50/30 hover:shadow-md transition-all text-[12.5px] font-medium leading-4.5 text-slate-800 cursor-pointer"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900 text-white group-hover:bg-red-600 transition-colors">
                    <ArrowUpRight size={12} strokeWidth={2.4} />
                  </span>
                  <span className="flex-1">{q}</span>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-slate-300 group-hover:text-red-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Follow-ups — distinctive chip style matching Home.jsx */}
        {!loading && !isStreaming && followUps.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500">
                {t("chat.suggestedFollowUps") || "Suggested follow-ups"}
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            </div>
            <div className="flex flex-col gap-2">
              {followUps.map((q, idx) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{ animationDelay: `${idx * 70}ms` }}
                  className="group flex w-full items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-red-200 hover:bg-red-50/40 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900/90 text-white group-hover:bg-red-600 transition-colors">
                    <ArrowUpRight size={12} strokeWidth={2.2} />
                  </span>
                  <span className="flex-1 text-[12.5px] font-medium leading-4.5 text-slate-800 group-hover:text-slate-900">{q}</span>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-slate-300 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
        <div className="h-6 shrink-0" aria-hidden />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-2.5 py-2.5">
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((file, idx) => (
              <span
                key={`${file.name}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <File size={12} className="shrink-0 text-slate-500" />
                <span className="max-w-[100px] truncate">{file.name}</span>
                <span className="text-[11px] text-slate-400">{formatFileSize(file.size)}</span>
                <button
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i2) => i2 !== idx))}
                  className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-[24px] border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-slate-400 transition">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
            title={t("mapPanel.attachFile")}
          >
            <Paperclip size={14} />
          </button>
          {supported && (
            <button
              onClick={() => (isListening ? stopListening() : startListening())}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition cursor-pointer ${isListening ? "bg-red-100 text-red-600 animate-pulse" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            placeholder={t("mapPanel.inputPlaceholder")}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] leading-5 outline-none placeholder:text-slate-400 py-1.5 min-h-[32px] max-h-[96px]"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            disabled={loading || isStreaming || (!input.trim() && !attachedFiles.length)}
            onClick={() => sendMessage()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-900 text-white hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ArrowUp size={16} strokeWidth={2.2} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.gif" onChange={handleFileSelect} />
        {isListening && <p className="mt-1.5 text-xs text-red-500 font-medium px-1">🎤 {t("mapPanel.listening")}</p>}
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-slate-400">
          <Zap size={10} /> {t("mapPanel.footer")}
        </p>
      </div>
    </div>
  );
}

MapChatPanel.propTypes = {
  token: PropTypes.string,
  mapContext: PropTypes.object,
  onMapAction: PropTypes.func,
  initialQuery: PropTypes.string,
  initialQueryKey: PropTypes.number,
};
