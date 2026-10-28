import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Database,
  UserRound,
  Clock,
  Paperclip,
  BookOpen,
  Crosshair,
} from "lucide-react";

// Display stages while the request is in flight. The real per-node trace
// replaces this once the response arrives (see AuditTrail).
const BASE_STAGES = ["language", "intent", "tables", "sql", "guard", "query", "compose"];
const STAGE_MS = 1700;

// Enabled intelligence sources add their own stages right after language
// detection — the same order the agent graph runs them in.
function liveStages(sources = {}) {
  const extra = [];
  if (sources.evidence) extra.push("evidence");
  if (sources.codebook) extra.push("legal");
  if (sources.scene) extra.push("scene");
  return [BASE_STAGES[0], ...extra, ...BASE_STAGES.slice(1)];
}

export function AgentPipelineLoader({ sources }) {
  const { t } = useTranslation();
  const LIVE_STAGES = liveStages(sources);
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      // Never mark the final stage done on a timer — only the response does.
      setActive(Math.min(LIVE_STAGES.length - 1, Math.floor(ms / STAGE_MS)));
    }, 200);
    return () => clearInterval(id);
  }, [LIVE_STAGES.length]);

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
          {t("trace.liveTitle")}
        </span>
        <span className="text-[11px] tabular-nums text-ink-muted">
          {(elapsed / 1000).toFixed(1)}s
        </span>
      </div>
      <ol className="space-y-1">
        {LIVE_STAGES.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li
              key={s}
              className={`flex items-center gap-2 text-[12.5px] transition-opacity ${
                done ? "text-ink-secondary" : current ? "text-ink font-medium" : "text-ink-muted opacity-60"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {done ? (
                  <Check size={13} className="text-success" strokeWidth={3} />
                ) : current ? (
                  <Loader2 size={13} className="animate-spin text-navy" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                )}
              </span>
              {t(`trace.live.${s}`)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function totalMs(audit) {
  return (audit?.trace || []).reduce((a, s) => a + (s.ms || 0), 0);
}

function activeSteps(audit) {
  return (audit?.trace || []).filter((s) => !s.detail?.skipped);
}

export function TraceChip({ audit, onClick }) {
  const { t } = useTranslation();
  if (!audit?.trace?.length) return null;
  const guard = audit.sql_guard;
  const blocked = guard && guard.passed === false;
  return (
    <button
      onClick={onClick}
      title={t("trace.openAudit")}
      className={`mt-1 mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
        blocked
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      }`}
    >
      {blocked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
      {guard
        ? blocked
          ? t("trace.chipBlocked")
          : t("trace.chipVerified")
        : t("trace.chipAnswered")}
      <span className="text-current/70">·</span>
      {t("trace.steps", { count: activeSteps(audit).length })}
      <span className="text-current/70">·</span>
      <span className="tabular-nums">{(totalMs(audit) / 1000).toFixed(1)}s</span>
    </button>
  );
}

function detailText(t, step) {
  const d = step.detail || {};
  switch (step.node) {
    case "language_detection":
      return d.language === "kn" ? t("trace.lang.kn") : t("trace.lang.en");
    case "translate_query":
      return d.translated ? `“${d.translated}”` : t("trace.notNeeded");
    case "router":
      return d.intent === "sql" ? t("trace.intentSql") : t("trace.intentChat");
    case "planner":
      return (d.tables || []).join(", ");
    case "fetch_column_values":
      return t("trace.columns", { count: d.columns || 0 });
    case "generate_sql":
      return t("trace.sqlChars", { count: d.chars || 0 });
    case "execute_sql":
      return d.guard === false
        ? t("trace.guardBlocked")
        : t("trace.rows", { count: d.rows || 0 });
    case "chart":
      return d.charts?.length ? d.charts.join(", ") : t("trace.noChart");
    case "response":
      return t("trace.followUps", { count: d.follow_ups || 0 });
    case "translate_response":
      return d.skipped ? t("trace.notNeeded") : t("trace.translatedKn");
    case "legal_reference":
      return t("trace.sections", { count: d.sections || 0 });
    default:
      return "";
  }
}

const SOURCE_DEFS = [
  { id: "case", icon: Database, used: (by) => by.planner || by.execute_sql },
  { id: "evidence", icon: Paperclip, used: (by) => by.evidence && !by.evidence.detail?.skipped },
  { id: "legal", icon: BookOpen, used: (by) => by.legal_reference && !by.legal_reference.detail?.skipped },
  { id: "scene", icon: Crosshair, used: (by) => by.scene && !by.scene.detail?.skipped },
];

function SourcesConsulted({ audit }) {
  const { t } = useTranslation();
  const byNode = Object.fromEntries((audit?.trace || []).map((s) => [s.node, s]));
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
        {t("trace.sourcesConsulted")}
      </p>
      <div className="grid grid-cols-2 gap-1.5 @3xl:grid-cols-4">
        {SOURCE_DEFS.map(({ id, icon: Icon, used }) => {
          const on = Boolean(used(byNode));
          return (
            <div
              key={id}
              className={`flex items-center gap-2 rounded-card border px-2.5 py-2 ${
                on ? "border-navy bg-navy text-white" : "border-dashed border-line-strong bg-surface text-ink-muted"
              }`}
            >
              <Icon size={13} className="shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-semibold leading-4">{t(`trace.source.${id}`)}</p>
                <p className={`text-[10.5px] leading-4 ${on ? "text-white/70" : ""}`}>
                  {on ? t("trace.sourceUsed") : t("trace.sourceIdle")}
                </p>
              </div>
              {on && <Check size={12} strokeWidth={3} className="ml-auto shrink-0 text-emerald-300" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AuditTrail({ audit, rowCount = 0 }) {
  const { t } = useTranslation();
  const steps = activeSteps(audit);
  if (!steps.length) return null;
  const maxMs = Math.max(1, ...steps.map((s) => s.ms || 0));
  const guard = audit.sql_guard;

  return (
    <div className="@container space-y-4">
      <SourcesConsulted audit={audit} />

      {/* Verification header */}
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div
          className={`rounded-card border px-3 py-2.5 ${
            guard?.passed === false ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
            {guard?.passed === false ? (
              <ShieldAlert size={12} className="text-critical" />
            ) : (
              <ShieldCheck size={12} className="text-success" />
            )}
            {t("trace.guardTitle")}
          </div>
          <p className="mt-1 text-[12.5px] font-semibold text-ink">
            {guard
              ? guard.passed
                ? t("trace.guardPassed")
                : guard.reason
              : t("trace.guardNa")}
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
            <Database size={12} className="text-ink-muted" />
            {t("trace.sourcesTitle")}
          </div>
          <p className="mt-1 truncate text-[12.5px] font-semibold text-ink" title={(guard?.tables || []).join(", ")}>
            {guard?.tables?.length ? guard.tables.join(", ") : "—"}
          </p>
          <p className="text-[11px] text-ink-secondary">{t("trace.rows", { count: rowCount })}</p>
        </div>
        <div className="rounded-card border border-line bg-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
            <UserRound size={12} className="text-ink-muted" />
            {t("trace.officerTitle")}
          </div>
          <p className="mt-1 truncate text-[12.5px] font-semibold text-ink">
            {audit.officer?.kgid || "—"}
          </p>
          <p className="truncate text-[11px] text-ink-secondary">
            {[audit.officer?.rank, audit.officer?.scope && t(`trace.scope.${audit.officer.scope}`)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {guard?.checks?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {guard.checks.map((c) => (
            <span
              key={c.name}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                c.passed ? "border-emerald-200 bg-white text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {c.passed ? <Check size={11} strokeWidth={3} /> : <ShieldAlert size={11} />}
              {c.name}
            </span>
          ))}
        </div>
      )}

      {/* Node timeline */}
      <ol className="relative space-y-0">
        {steps.map((s, i) => (
          <li key={`${s.node}-${i}`} className="grid grid-cols-[18px_minmax(0,1fr)_64px] items-start gap-2.5 py-1.5">
            <span className="relative flex h-[18px] items-center justify-center">
              <span className="z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-emerald-300 bg-white">
                <Check size={10} strokeWidth={3} className="text-success" />
              </span>
              {i < steps.length - 1 && (
                <span className="absolute top-[18px] h-[calc(100%+12px)] w-px bg-line" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold leading-[18px] text-ink">
                {t(`trace.nodes.${s.node}`, { defaultValue: s.node })}
              </p>
              <p className="truncate text-[11.5px] text-ink-secondary" title={detailText(t, s)}>
                {detailText(t, s)}
              </p>
            </div>
            <div className="pt-0.5">
              <p className="text-right text-[11px] tabular-nums text-ink-secondary">
                {s.ms >= 1000 ? `${(s.ms / 1000).toFixed(1)}s` : `${s.ms}ms`}
              </p>
              <div className="mt-1 h-1 rounded-full bg-slate-100">
                <div className="h-1 rounded-full bg-navy/70" style={{ width: `${Math.max(4, (s.ms / maxMs) * 100)}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <Clock size={11} />
        {t("trace.total", { seconds: (totalMs(audit) / 1000).toFixed(1) })}
      </p>
    </div>
  );
}
