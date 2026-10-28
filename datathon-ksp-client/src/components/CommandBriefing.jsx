import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  MapPin,
  TrendingUp,
  TrendingDown,
  FileWarning,
  FolderOpen,
  Activity,
  ArrowUpRight,
  Languages,
  Flame,
  Scale,
  LineChart,
  Lock,
  MapPinned,
  Network,
  FolderKanban,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { useAuth } from "../auth/AuthContext";
import { getBriefing } from "../api/briefing";
import { getOfficerTier, TIERS, canViewCrimeMap } from "../utils/role";

const PROMPT_ICONS = {
  trend: LineChart,
  hotspot: Flame,
  compliance: Scale,
  kannada: Languages,
};

const NAVY = "#17233c";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function Delta({ pct, invert = false }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
  // For crime volume, "up" is bad — tint by meaning, never by direction alone.
  const bad = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        pct === 0 ? "text-ink-muted" : bad ? "text-critical" : "text-success"
      }`}
    >
      <Icon size={12} strokeWidth={2.4} />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = "default", onClick, actionLabel }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={actionLabel}
      className={`rounded-card border bg-surface px-3.5 py-3 text-left shadow-card ${
        tone === "critical" ? "border-red-200" : "border-line"
      } ${onClick ? "transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
        <Icon size={12} className={tone === "critical" ? "text-critical" : "text-ink-muted"} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 text-[22px] font-semibold leading-none tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-1.5 min-h-4 text-[11px] leading-4 text-ink-secondary">{sub}</div>
      {actionLabel && (
        <div className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-navy">
          {actionLabel} <ChevronRight size={12} />
        </div>
      )}
    </Tag>
  );
}

function ModuleLink({ icon: Icon, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex min-w-0 items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5 text-left shadow-card transition hover:border-navy hover:shadow-md cursor-pointer"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[11px] text-ink-secondary">{sub}</span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-navy" />
    </button>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="text-ink-secondary">{label}</div>
      <div className="font-semibold tabular-nums text-ink">{fmt(payload[0].value)} FIRs</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 p-5">
      <div className="h-16 rounded-card bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-card bg-slate-200/70" />
        ))}
      </div>
      <div className="h-44 rounded-card bg-slate-200/70" />
    </div>
  );
}

export default function CommandBriefing({ onAsk, disabled = false }) {
  const { t } = useTranslation();
  const { token, officer } = useAuth();
  const navigate = useNavigate();
  const mapAllowed = canViewCrimeMap(officer);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getBriefing(token)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tier = getOfficerTier(officer);
  const tierKey = {
    [TIERS.STATE]: "state",
    [TIERS.DISTRICT]: "district",
    [TIERS.STATION]: "station",
    [TIERS.FIELD]: "field",
  }[tier] || "field";

  const district = officer?.district_name || officer?.district || "";
  const station = officer?.unit_name || "";
  const jurisdiction = t(`briefing.jurisdiction.${tierKey}`, { district, station });

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-ink-secondary">
        {t("briefing.unavailable")}
      </div>
    );
  }
  if (!data) return <Skeleton />;

  const k = data.kpis || {};
  const topRising = data.rising?.[0];
  const hotspots = data.hotspots || [];
  const maxHot = Math.max(1, ...hotspots.map((h) => h.firs));
  const hotspotLink = (h) => {
    if (data.hotspot_level === "district")
      return mapAllowed ? `/crime-intelligence-map?district=${encodeURIComponent(h.name)}` : null;
    if (data.hotspot_level === "station") return `/investigations?station=${encodeURIComponent(h.name)}`;
    return `/investigations?search=${encodeURIComponent(h.name)}`;
  };
  const monthly = (data.monthly || []).map((m) => ({
    ...m,
    label: new Date(`${m.month}-01`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
  }));

  const prompts = t(`briefing.prompts.${tierKey}`, {
    returnObjects: true,
    crime: topRising?.name || "Robbery",
    district,
    station,
    kgid: officer?.kgid || "",
  });

  const asOf = data.as_of
    ? new Date(data.as_of).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-y-auto border-l-2 border-slate-200 bg-slate-100">
      {/* Identity + access scope */}
      <div className="border-b border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand">
              {t("briefing.eyebrow")}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-ink">
              {officer?.full_name || t("header.unknownUser")}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-secondary">
              {officer?.rank_name || officer?.rank}
              {officer?.kgid ? ` · ${officer.kgid}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-navy px-2.5 py-1 text-[11px] font-semibold text-white">
              <ShieldCheck size={12} />
              {t(`briefing.tier.${tierKey}`)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-secondary">
              <MapPin size={12} className="text-ink-muted" />
              {jurisdiction}
            </span>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Lock size={11} />
          {t("briefing.scopeNote", { asOf, days: data.window_days })}
        </p>
      </div>

      <div className="space-y-4 p-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
          <Kpi
            icon={Activity}
            label={t("briefing.kpi.firs", { days: data.window_days })}
            value={fmt(k.firs_window)}
            sub={
              <span className="inline-flex items-center gap-1">
                <Delta pct={k.change_pct} /> {t("briefing.kpi.vsPrev")}
              </span>
            }
          />
          <Kpi
            icon={FolderOpen}
            label={t("briefing.kpi.open")}
            value={fmt(k.open_cases)}
            sub={t("briefing.kpi.ofTotal", { total: fmt(k.total_firs) })}
          />
          <Kpi
            icon={FileWarning}
            tone="critical"
            label={t("briefing.kpi.bailRisk")}
            value={fmt(k.bail_critical)}
            sub={t("briefing.kpi.bailBreached", { count: fmt(k.bail_breached) })}
            actionLabel={t("briefing.openCompliance")}
            onClick={() => navigate("/compliance")}
          />
          <Kpi
            icon={TrendingUp}
            label={t("briefing.kpi.rising")}
            value={
              <span className="block truncate text-[16px] leading-[22px]">
                {topRising?.name || "—"}
              </span>
            }
            sub={
              topRising ? (
                <span className="inline-flex items-center gap-1">
                  <Delta pct={topRising.change_pct} /> {t("briefing.kpi.vsPrev")}
                </span>
              ) : null
            }
          />
        </div>

        {/* Trend + hotspots */}
        <div className="grid gap-3 @2xl:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-4 shadow-card">
            <p className="text-[12.5px] font-semibold text-ink">{t("briefing.trendTitle")}</p>
            <p className="text-[11px] text-ink-secondary">{jurisdiction}</p>
            <div className="mt-2 h-[132px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="briefTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={NAVY} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#cbd5e1" }} />
                  <Area
                    type="monotone"
                    dataKey="firs"
                    stroke={NAVY}
                    strokeWidth={2}
                    fill="url(#briefTrend)"
                    activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-4 shadow-card">
            <p className="text-[12.5px] font-semibold text-ink">
              {t(`briefing.hotspotTitle.${data.hotspot_level}`, { days: data.window_days })}
            </p>
            <p className="text-[11px] text-ink-secondary">{t("briefing.hotspotSub")}</p>
            <ol className="mt-2.5 space-y-1.5">
              {hotspots.slice(0, 5).map((h, i) => (
                <li
                  key={h.name}
                  title={`${h.name}: ${fmt(h.firs)} FIRs`}
                  role={hotspotLink(h) ? "link" : undefined}
                  onClick={hotspotLink(h) ? () => navigate(hotspotLink(h)) : undefined}
                  className={`grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 -mx-1 ${
                    hotspotLink(h) ? "cursor-pointer hover:bg-navy-soft" : ""
                  }`}
                >
                  <span className="text-[10.5px] font-semibold tabular-nums text-ink-muted">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-medium text-ink">{h.name}</span>
                      <span className="text-[11px] tabular-nums text-ink-secondary">{fmt(h.firs)}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-navy"
                        style={{ width: `${(h.firs / maxHot) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-14 text-right">
                    <Delta pct={h.change_pct} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* One briefing, every module — each says what it unlocks for this officer */}
        <div className="grid gap-2.5 @4xl:grid-cols-2">
          <ModuleLink
            icon={Scale}
            title={t("briefing.modules.compliance")}
            sub={t("briefing.modules.complianceSub", { count: fmt(k.bail_critical) })}
            onClick={() => navigate("/compliance")}
          />
          {mapAllowed && (
            <ModuleLink
              icon={MapPinned}
              title={t("briefing.modules.map")}
              sub={t("briefing.modules.mapSub", { crime: topRising?.name || "" })}
              onClick={() =>
                navigate(`/crime-intelligence-map${topRising ? `?crime=${encodeURIComponent(topRising.name)}` : ""}`)
              }
            />
          )}
          <ModuleLink
            icon={Network}
            title={t("briefing.modules.networks")}
            sub={t("briefing.modules.networksSub")}
            onClick={() => navigate("/networks")}
          />
          <ModuleLink
            icon={FolderKanban}
            title={t("briefing.modules.queue")}
            sub={t("briefing.modules.queueSub", { count: fmt(k.chargesheet_overdue) })}
            onClick={() => navigate("/investigations?stat=overdue")}
          />
        </div>

        {/* Ask CrimeLens */}
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
              {t("briefing.askTitle")}
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-2.5 @xl:grid-cols-2">
            {Array.isArray(prompts) &&
              prompts.map((p) => {
                const Icon = PROMPT_ICONS[p.kind] || ArrowUpRight;
                return (
                  <button
                    key={p.text}
                    disabled={disabled}
                    onClick={() => onAsk?.(p.text)}
                    className="group flex items-start gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-soft text-navy transition group-hover:bg-brand group-hover:text-white">
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                        {p.tag}
                      </span>
                      <span className="mt-0.5 block text-[13px] font-medium leading-[18px] text-ink">
                        {p.text}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-muted">
            <ShieldCheck size={12} />
            {t("briefing.explainNote")}
          </p>
        </div>
      </div>
    </div>
  );
}
