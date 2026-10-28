import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import {
  Activity,
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronRight,
  FileSearch,
  FileWarning,
  Flame,
  Gavel,
  HeartHandshake,
  Languages,
  LineChart,
  MapPin,
  Network,
  ScanSearch,
  Scale,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getStationOverview } from "../api/station";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

Delta.propTypes = {
  pct: PropTypes.number,
  invert: PropTypes.bool,
};

function Delta({ pct, invert = false }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0;
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

Kpi.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.node,
  value: PropTypes.node,
  sub: PropTypes.node,
  tone: PropTypes.string,
  onClick: PropTypes.func,
  actionLabel: PropTypes.node,
};

function Kpi({ icon: Icon, label, value, sub, tone = "default", onClick, actionLabel }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={actionLabel}
      className={`rounded-panel border bg-surface px-4 py-3 text-left shadow-card ${
        tone === "critical" ? "border-red-200" : "border-line"
      } ${onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
        <Icon size={12} className={tone === "critical" ? "text-critical" : "text-ink-muted"} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-ink">{value}</div>
      <div className="mt-1.5 min-h-4 text-[11px] leading-4 text-ink-secondary">{sub}</div>
      {actionLabel && (
        <div className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-navy">
          {actionLabel} <ChevronRight size={12} />
        </div>
      )}
    </Tag>
  );
}

Section.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.node,
  sub: PropTypes.node,
  action: PropTypes.node,
  onAction: PropTypes.func,
  children: PropTypes.node,
  footer: PropTypes.node,
};

function Section({ icon: Icon, title, sub, action, onAction, children, footer }) {
  return (
    <section className="rounded-panel border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            {Icon && <Icon size={14} className="text-ink-muted" />}
            {title}
          </h2>
          {sub && <p className="mt-0.5 text-[12px] leading-5 text-ink-secondary">{sub}</p>}
        </div>
        {action && (
          <button
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] font-semibold text-navy hover:underline cursor-pointer"
          >
            {action} <ChevronRight size={12} />
          </button>
        )}
      </div>
      {children}
      {footer && <div className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">{footer}</div>}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-24 rounded-panel bg-slate-200/70" />
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-panel bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="h-96 rounded-panel bg-slate-200/70" />
        <div className="h-96 rounded-panel bg-slate-200/70" />
      </div>
    </div>
  );
}

export default function StationCommand() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, officer } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getStationOverview(token)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <div className="p-8 text-sm text-ink-secondary">{t("station.unavailable")}</div>;
  if (!data) return <Skeleton />;

  const station = data.station || {};
  const k = data.kpis || {};
  const h = data.compliance?.headline || {};
  const io = data.io || {};
  const women = data.women || {};
  const playbook = data.playbook;
  const hotspots = data.hotspots || [];
  const maxHot = Math.max(1, ...hotspots.map((x) => x.firs));
  const clusters = data.clusters || [];
  const repeat = data.repeat_offenders || [];
  const actionQueue = data.action_queue || [];
  const expiring = data.compliance?.expiring || [];
  const officers = io.officers || [];
  const prompts = t("briefing.prompts.station", {
    returnObjects: true,
    station: station.name || "",
  });

  const clockLabel = (row) => {
    if (row.bnss_band === "breached")
      return t("station.queue.breached", { count: Math.abs(row.bnss_days_left || 0) });
    if (row.bnss_band === "critical")
      return t("station.queue.critical", { count: row.bnss_days_left || 0 });
    if (row.bnss_band === "warning")
      return t("station.queue.warning", { count: row.bnss_days_left || 0 });
    if (!row.has_chargesheet) return t("station.queue.noChargesheet");
    if (!row.has_arrest) return t("station.queue.noArrest");
    return t("station.queue.routine");
  };

  const clockTone = (row) => {
    if (row.bnss_band === "breached") return "bg-red-50 text-[#b42318] border-red-200";
    if (row.bnss_band === "critical") return "bg-orange-50 text-[#c2410c] border-orange-200";
    if (row.bnss_band === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
    return "bg-slate-50 text-ink-secondary border-line";
  };

  const openCase = (id) => navigate(`/investigations/${id}`);
  const openQueue = (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    navigate(`/investigations${qs ? `?${qs}` : ""}`);
  };
  const ask = (text) => navigate("/", { state: { initialMessage: text } });

  return (
    <div className="h-full overflow-y-auto bg-surface-subtle">
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 md:px-6">
        {/* Identity + scope */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand">
              {t("station.eyebrow")}
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-[22px] font-semibold text-ink">
              <Building2 size={20} className="text-ink-muted" />
              {station.name || t("station.title")}
            </h1>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {officer?.full_name || t("header.unknownUser")}
              {officer?.rank_name || officer?.rank ? ` · ${officer.rank_name || officer.rank}` : ""}
              {station.district ? ` · ${station.district}` : ""}
            </p>
            <p className="mt-1.5 inline-flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-navy px-2.5 py-1 text-[11px] font-semibold text-white">
                <ShieldCheck size={12} /> {t("station.tier")}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {t("station.scope", { station: station.name || "" })}
              </span>
              <span>· {t("station.asOf", { date: fmtDate(data.as_of), days: data.window_days })}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate("/compliance")}
              className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-card hover:border-navy cursor-pointer"
            >
              <Scale size={13} /> {t("station.openCompliance")}
            </button>
            <button
              onClick={() => openQueue()}
              className="inline-flex items-center gap-1.5 rounded-control bg-navy px-3 py-2 text-[12px] font-semibold text-white shadow-card hover:bg-navy-hover cursor-pointer"
            >
              <FileSearch size={13} /> {t("station.openQueue")}
            </button>
          </div>
        </div>

        {/* Morning numbers */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            icon={Activity}
            label={t("station.kpi.firs", { days: data.window_days })}
            value={fmt(k.firs_window)}
            sub={
              <span className="inline-flex items-center gap-1">
                <Delta pct={k.change_pct} /> {t("station.kpi.vsPrev")}
              </span>
            }
          />
          <Kpi
            icon={FolderIcon}
            label={t("station.kpi.open")}
            value={fmt(k.open_cases)}
            sub={t("station.kpi.ofTotal", { total: fmt(k.total_firs) })}
            onClick={() => openQueue()}
            actionLabel={t("station.kpi.review")}
          />
          <Kpi
            icon={AlarmClock}
            tone="critical"
            label={t("station.kpi.pastLimit")}
            value={fmt(k.chargesheet_overdue)}
            sub={t("station.kpi.bailBreached", { count: fmt(k.bail_breached) })}
            onClick={() => navigate("/compliance")}
            actionLabel={t("station.openCompliance")}
          />
          <Kpi
            icon={Network}
            label={t("station.kpi.clusters")}
            value={fmt(clusters.length)}
            sub={t("station.kpi.clustersSub", { count: fmt(repeat.length) })}
            onClick={() => navigate("/networks")}
            actionLabel={t("station.kpi.openNetworks")}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* Left: what to act on, local picture, local network */}
          <div className="space-y-5">
            <Section
              icon={Target}
              title={t("station.queue.title")}
              sub={t("station.queue.sub")}
              action={t("station.queue.all")}
              onAction={() => openQueue({ stat: "overdue" })}
              footer={t("station.queue.footer")}
            >
              {actionQueue.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12.5px] text-ink-secondary">
                  {t("station.queue.empty")}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {actionQueue.map((row) => (
                    <li
                      key={row.CaseMasterID}
                      className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="ksp-mono truncate text-[11.5px] font-semibold text-ink">{row.CrimeNo}</p>
                        <p className="truncate text-[12.5px] text-ink-secondary">
                          {row.crime}
                          {row.gravity ? ` · ${row.gravity}` : ""}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                          {t("station.queue.meta", {
                            officer: row.officer || t("station.queue.unassigned"),
                            count: row.accused_count ?? 0,
                            age: row.age_days ?? 0,
                          })}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${clockTone(row)}`}
                        >
                          {row.bnss_band === "breached" && <AlertTriangle size={11} />}
                          {clockLabel(row)}
                        </span>
                        <p className="mt-1 truncate text-[11px] text-ink-muted">
                          {row.status}
                          {row.has_chargesheet ? "" : ` · ${t("station.queue.noCsShort")}`}
                        </p>
                      </div>
                      <button
                        onClick={() => openCase(row.CaseMasterID)}
                        className="inline-flex w-fit items-center gap-1 rounded-md bg-navy px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-navy-hover cursor-pointer"
                      >
                        {t("station.queue.open")} <ArrowRight size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              icon={Flame}
              title={t("station.crime.title", { days: data.window_days })}
              sub={t("station.crime.sub")}
              action={t("station.crime.all")}
              onAction={() => openQueue()}
            >
              <ol className="space-y-2.5 px-4 py-3">
                {hotspots.slice(0, 6).map((row, i) => (
                  <li
                    key={row.name}
                    role="link"
                    onClick={() => openQueue({ crimeHead: row.name })}
                    className="-mx-1 grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 hover:bg-navy-soft"
                  >
                    <span className="text-[10.5px] font-semibold tabular-nums text-ink-muted">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium text-ink">{row.name}</span>
                        <span className="text-[11px] tabular-nums text-ink-secondary">{fmt(row.firs)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-navy" style={{ width: `${(row.firs / maxHot) * 100}%` }} />
                      </div>
                    </div>
                    <span className="w-14 text-right">
                      <Delta pct={row.change_pct} />
                    </span>
                  </li>
                ))}
              </ol>
            </Section>

            <Section
              icon={Users}
              title={t("station.clusters.title")}
              sub={t("station.clusters.sub")}
              action={t("station.clusters.all")}
              onAction={() => navigate("/networks")}
              footer={t("station.clusters.footer")}
            >
              {clusters.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12.5px] text-ink-secondary">
                  {t("station.clusters.empty")}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {clusters.map((c, i) => (
                    <li key={`${c.members?.[0]}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-ink">
                          {c.members?.slice(0, 2).join(" · ")}
                          {c.member_count > 2 ? ` +${c.member_count - 2}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {t("station.clusters.meta", { members: c.member_count, firs: c.total_firs })}
                        </p>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                          c.risk === "Very High"
                            ? "bg-red-50 text-red-800"
                            : c.risk === "High"
                              ? "bg-orange-50 text-orange-800"
                              : "bg-slate-100 text-ink-secondary"
                        }`}
                      >
                        {c.risk}
                      </span>
                      <button
                        onClick={() => navigate(`/networks?person=${encodeURIComponent(c.members?.[0] || "")}`)}
                        className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                      >
                        <Network size={12} /> {t("station.clusters.view")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* Right: statutory clocks, women safety, IO load, playbook, evidence */}
          <div className="space-y-5">
            <Section
              icon={Gavel}
              title={t("station.bnss.title")}
              sub={t("station.bnss.sub", { days: data.compliance?.critical_days || 15 })}
              action={t("station.openCompliance")}
              onAction={() => navigate("/compliance")}
            >
              <div className="grid grid-cols-3 gap-2 px-4 py-3">
                <div className="rounded-md bg-red-50 px-2.5 py-2">
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-[#b42318]">{fmt(h.bail_breached)}</p>
                  <p className="mt-1 text-[10.5px] font-medium text-[#b42318]">{t("station.bnss.breached")}</p>
                </div>
                <div className="rounded-md bg-orange-50 px-2.5 py-2">
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-[#c2410c]">{fmt(h.bail_critical)}</p>
                  <p className="mt-1 text-[10.5px] font-medium text-[#c2410c]">{t("station.bnss.critical")}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2.5 py-2">
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-ink">
                    {h.on_time_rate != null ? `${h.on_time_rate}%` : "—"}
                  </p>
                  <p className="mt-1 text-[10.5px] font-medium text-ink-secondary">{t("station.bnss.onTime")}</p>
                </div>
              </div>
              {expiring.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {expiring.slice(0, 3).map((e) => (
                    <li key={`${e.CaseMasterID}-${e.rule}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-10 shrink-0 text-right">
                        <span className="block text-[17px] font-semibold leading-none tabular-nums text-[#c2410c]">
                          {e.days_left}
                        </span>
                        <span className="text-[9.5px] font-medium text-ink-muted">{t("station.bnss.days")}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="ksp-mono truncate text-[11px] font-semibold text-ink">{e.CrimeNo}</p>
                        <p className="truncate text-[11px] text-ink-secondary">
                          {e.crime} · {e.station}
                        </p>
                      </div>
                      <button
                        onClick={() => openCase(e.CaseMasterID)}
                        className="shrink-0 text-navy hover:underline cursor-pointer"
                        title={t("station.bnss.open")}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              icon={HeartHandshake}
              title={t("station.women.title")}
              sub={t("station.women.sub", {
                firs: fmt(women.firs_window),
                open: fmt(women.open_cases),
              })}
              action={t("station.openCompliance")}
              onAction={() => navigate("/compliance")}
            >
              <div className="grid grid-cols-2 gap-2 px-4 py-3">
                {(women.by_type || []).slice(0, 4).map((w) => (
                  <div key={w.name} className="rounded-md bg-slate-50 px-2.5 py-2">
                    <p className="truncate text-[11px] text-ink-secondary">{w.name}</p>
                    <p className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-[17px] font-semibold tabular-nums text-ink">{fmt(w.firs)}</span>
                      <Delta pct={w.change_pct} />
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11.5px] text-ink-secondary">
                <span>
                  <span className="font-semibold text-[#b42318]">{fmt(women.sexual_breached)}</span>{" "}
                  {t("station.women.sexual")}
                </span>
                <span>
                  <span className="font-semibold text-[#c2410c]">{fmt(women.victim_updates_due)}</span>{" "}
                  {t("station.women.victim")}
                </span>
              </div>
            </Section>

            <Section
              icon={UserCog}
              title={t("station.io.title")}
              sub={t("station.io.sub", {
                officers: fmt(io.summary?.officers),
                share: io.summary?.below_rank_share ?? 0,
              })}
              action={t("station.io.all")}
              onAction={() => navigate("/officers")}
              footer={
                io.summary?.bail_exposed_officers
                  ? t("station.io.footer", { count: fmt(io.summary.bail_exposed_officers) })
                  : null
              }
            >
              <ul className="divide-y divide-line">
                {officers.map((o) => (
                  <li
                    key={`${o.name}-${o.station}`}
                    className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-center gap-2 px-4 py-2 text-[11.5px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{o.name}</p>
                      <p className="truncate text-[10.5px] text-ink-muted">
                        {o.rank}
                        {o.below_rank && (
                          <span className="ml-1 font-semibold text-[#b42318]">· {t("station.io.flagged")}</span>
                        )}
                      </p>
                    </div>
                    <span className="text-right tabular-nums text-ink" title={t("station.io.open")}>
                      {fmt(o.open_cases)}
                    </span>
                    <span className="text-right tabular-nums text-ink-secondary" title={t("station.io.noCs")}>
                      {fmt(o.no_chargesheet)}
                    </span>
                    <span
                      className={`text-right tabular-nums ${
                        o.bail_breached || o.bail_critical ? "font-semibold text-[#c2410c]" : "text-ink-muted"
                      }`}
                      title={t("station.io.bail")}
                    >
                      {o.bail_breached || o.bail_critical ? o.bail_breached + o.bail_critical : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {playbook && (
              <Section
                icon={Target}
                title={t("station.playbook.title")}
                sub={t("station.playbook.sub", {
                  crime: playbook.crime_label,
                  window: playbook.stats?.peak_time || "",
                })}
              >
                <div className="space-y-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-navy px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white">
                      {t(`station.playbook.deploy.${playbook.deployment_type}`, {
                        defaultValue: playbook.deployment_type,
                      })}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {t("station.playbook.teams", {
                        teams: playbook.resource_allocation?.teams ?? 0,
                        officers: playbook.resource_allocation?.officers ?? 0,
                      })}
                    </span>
                  </div>
                  <p className="text-[12px] leading-5 text-ink-secondary">{playbook.threat_summary}</p>
                  <ul className="space-y-1.5">
                    {(playbook.immediate_actions || []).slice(0, 3).map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span
                          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                            a.priority === "High" ? "bg-[#d92d20]" : "bg-[#f97316]"
                          }`}
                        />
                        <p className="text-[11.5px] leading-[17px] text-ink">
                          <span className="font-semibold">{a.title}</span>
                          {a.detail ? ` — ${a.detail}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {playbook.physical_patrol_note && (
                    <p className="rounded-md border border-dashed border-line-strong px-2.5 py-1.5 text-[11px] text-ink-secondary">
                      {playbook.physical_patrol_note}
                    </p>
                  )}
                  <button
                    onClick={() => ask(t("station.playbook.ask", { crime: playbook.crime_label }))}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy hover:underline cursor-pointer"
                  >
                    <Languages size={12} /> {t("station.playbook.askCta")}
                  </button>
                </div>
              </Section>
            )}

            <Section icon={ScanSearch} title={t("station.evidence.title")} sub={t("station.evidence.sub")}>
              <div className="space-y-3 px-4 py-3">
                <p className="text-[12px] leading-5 text-ink-secondary">{t("station.evidence.body")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {["FIR", "Panchnama", "Post-mortem", "CDR", "Witness statement"].map((x) => (
                    <span key={x} className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10.5px] text-ink-secondary">
                      {x}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => navigate("/")}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                >
                  <FileWarning size={12} /> {t("station.evidence.cta")}
                </button>
              </div>
            </Section>
          </div>
        </div>

        {/* Ask CrimeLens — station prompts */}
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
              {t("station.ask.title")}
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {Array.isArray(prompts) &&
              prompts.map((p) => (
                <button
                  key={p.text}
                  onClick={() => ask(p.text)}
                  className="group flex items-start gap-2.5 rounded-panel border border-line bg-surface px-3 py-2.5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md cursor-pointer"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-soft text-navy transition group-hover:bg-brand group-hover:text-white">
                    <LineChart size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      {p.tag}
                    </span>
                    <span className="mt-0.5 block text-[12px] font-medium leading-[17px] text-ink">{p.text}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderIcon(props) {
  return <FileSearch {...props} />;
}
