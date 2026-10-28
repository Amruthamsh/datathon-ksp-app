import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import {
  AlarmClock,
  ArrowRight,
  Camera,
  ChevronRight,
  ClipboardList,
  FileSearch,
  FileWarning,
  Footprints,
  Languages,
  MapPin,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getFieldOverview } from "../api/field";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

const TASK_ICONS = {
  bnss: AlarmClock,
  chargesheet: FileWarning,
  arrest: UserCheck,
  victim: Users,
  review: FileSearch,
};

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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="h-96 rounded-panel bg-slate-200/70" />
        <div className="h-96 rounded-panel bg-slate-200/70" />
      </div>
    </div>
  );
}

function taskTone(task) {
  if (task.band === "breached") return "bg-red-50 text-[#b42318] border-red-200";
  if (task.band === "critical") return "bg-orange-50 text-[#c2410c] border-orange-200";
  if (task.band === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
  if (task.kind === "arrest") return "bg-orange-50 text-[#c2410c] border-orange-200";
  return "bg-slate-50 text-ink-secondary border-line";
}

function bnssTone(clock) {
  if (clock?.band === "breached") return "bg-red-50 text-[#b42318] border-red-200";
  if (clock?.band === "critical") return "bg-orange-50 text-[#c2410c] border-orange-200";
  if (clock?.band === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-ink-secondary border-line";
}

export default function FieldWorkbench() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, officer } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getFieldOverview(token)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <div className="p-8 text-sm text-ink-secondary">{t("field.unavailable")}</div>;
  if (!data) return <Skeleton />;

  const me = data.officer || {};
  const station = data.station || {};
  const s = data.summary || {};
  const cases = data.cases || [];
  const tasks = data.tasks || [];
  const beat = data.beat || {};
  const topCrimes = beat.top_crimes || [];
  const maxCrime = Math.max(1, ...topCrimes.map((c) => c.firs));
  const prompts = t("briefing.prompts.field", {
    returnObjects: true,
    kgid: me.kgid || "",
    station: station.name || "",
    district: station.district || "",
  });

  const openCase = (id) => navigate(`/investigations/${id}`);
  const openQueue = () => navigate("/investigations");
  const ask = (text) => navigate("/", { state: { initialMessage: text } });

  const taskLabel = (task) => {
    if (task.kind === "bnss") {
      return t(`field.tasks.band.${task.band}`, { count: Math.abs(task.days_left || 0) });
    }
    return t(`field.tasks.kind.${task.kind}`);
  };

  const clockLabel = (clock) => {
    if (!clock) return t("field.cases.noBnss");
    return t(`field.tasks.band.${clock.band}`, { count: Math.abs(clock.days_left || 0) });
  };

  return (
    <div className="h-full overflow-y-auto bg-surface-subtle">
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand">
              {t("field.eyebrow")}
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-[22px] font-semibold text-ink">
              <ClipboardList size={20} className="text-ink-muted" />
              {t("field.title")}
            </h1>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {me.name || officer?.full_name || t("header.unknownUser")}
              {me.rank ? ` · ${me.rank}` : ""}
              {station.name ? ` · ${station.name}` : ""}
              {station.district ? ` · ${station.district}` : ""}
            </p>
            <p className="mt-1.5 inline-flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-navy px-2.5 py-1 text-[11px] font-semibold text-white">
                <ShieldCheck size={12} /> {t("field.tier")}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {t("field.scope", { station: station.name || "" })}
              </span>
              <span>· {t("field.asOf", { date: fmtDate(data.as_of), days: data.window_days })}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate("/compliance")}
              className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-card hover:border-navy cursor-pointer"
            >
              <Scale size={13} /> {t("field.openCompliance")}
            </button>
            <button
              onClick={openQueue}
              className="inline-flex items-center gap-1.5 rounded-control bg-navy px-3 py-2 text-[12px] font-semibold text-white shadow-card hover:bg-navy-hover cursor-pointer"
            >
              <FileSearch size={13} /> {t("field.openQueue")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            icon={ClipboardList}
            label={t("field.kpi.assigned")}
            value={fmt(s.assigned)}
            sub={t("field.kpi.openSub", { open: fmt(s.under_investigation) })}
            onClick={openQueue}
            actionLabel={t("field.openQueue")}
          />
          <Kpi
            icon={UserCheck}
            label={t("field.kpi.arrests")}
            value={fmt(s.arrests_pending)}
            sub={t("field.kpi.arrestSub")}
            onClick={() => navigate("/investigations?stat=arrests_pending")}
            actionLabel={t("field.cases.open")}
          />
          <Kpi
            icon={FileWarning}
            tone={s.chargesheet_overdue ? "critical" : "default"}
            label={t("field.kpi.chargesheet")}
            value={fmt(s.chargesheet_pending)}
            sub={t("field.kpi.overdueSub", { count: fmt(s.chargesheet_overdue) })}
            onClick={openQueue}
            actionLabel={t("field.openQueue")}
          />
          <Kpi
            icon={AlarmClock}
            label={t("field.kpi.review")}
            value={fmt(s.review_today)}
            sub={t("field.kpi.reviewSub")}
            onClick={openQueue}
            actionLabel={t("field.tasks.all")}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Section
              icon={ClipboardList}
              title={t("field.tasks.title")}
              sub={t("field.tasks.sub")}
              action={t("field.tasks.all")}
              onAction={openQueue}
              footer={t("field.tasks.footer")}
            >
              {tasks.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12.5px] text-ink-secondary">
                  {t("field.tasks.empty")}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {tasks.map((task) => {
                    const Icon = TASK_ICONS[task.kind] || ClipboardList;
                    return (
                      <li
                        key={`${task.kind}-${task.case_id}`}
                        className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-soft text-navy">
                            <Icon size={14} />
                          </span>
                          <div className="min-w-0">
                            <p className="ksp-mono truncate text-[11.5px] font-semibold text-ink">
                              {task.crime_no}
                            </p>
                            <p className="truncate text-[12.5px] text-ink-secondary">
                              {task.crime} · {task.status}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                              {t("field.tasks.counts", {
                                accused: task.accused_count ?? 0,
                                victims: task.victim_count ?? 0,
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${taskTone(task)}`}
                          >
                            {taskLabel(task)}
                          </span>
                        </div>
                        <button
                          onClick={() => openCase(task.case_id)}
                          className="inline-flex w-fit items-center gap-1 rounded-md bg-navy px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-navy-hover cursor-pointer"
                        >
                          {t("field.tasks.open")} <ArrowRight size={12} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section
              icon={FileSearch}
              title={t("field.cases.title")}
              sub={t("field.cases.sub")}
              action={t("field.cases.all")}
              onAction={openQueue}
            >
              {cases.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12.5px] text-ink-secondary">
                  {t("field.cases.empty")}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {cases.map((row) => (
                    <li
                      key={row.CaseMasterID}
                      className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="ksp-mono truncate text-[11.5px] font-semibold text-ink">{row.CrimeNo}</p>
                        <p className="truncate text-[12.5px] text-ink-secondary">
                          {row.CrimeHeadName}
                          {row.Gravity ? ` · ${row.Gravity}` : ""}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                          {row.CaseStatusName} · {t("field.cases.age", { days: Math.round(row.AgeDays || 0) })}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${bnssTone(row.Bnss)}`}
                        >
                          {row.Bnss?.band === "breached" && <AlarmClock size={11} />}
                          {clockLabel(row.Bnss)}
                        </span>
                        <p className="mt-1 truncate text-[11px] text-ink-muted">
                          {t("field.cases.counts", {
                            accused: row.AccusedCount ?? 0,
                            victims: row.VictimCount ?? 0,
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => openCase(row.CaseMasterID)}
                        className="inline-flex w-fit items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                      >
                        {t("field.cases.open")} <ArrowRight size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="space-y-5">
            <Section
              icon={Footprints}
              title={t("field.beat.title")}
              sub={t("field.beat.sub", { station: station.name || "" })}
            >
              <div className="grid grid-cols-3 gap-2 px-4 py-3">
                <div className="rounded-md bg-slate-50 px-2.5 py-2">
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-ink">{fmt(beat.firs_30d)}</p>
                  <p className="mt-1 text-[10.5px] font-medium text-ink-secondary">{t("field.beat.firs")}</p>
                  <p className="mt-1">
                    <Delta pct={beat.change_pct} />
                  </p>
                </div>
                <div className="rounded-md bg-orange-50 px-2.5 py-2">
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-[#c2410c]">
                    {fmt(beat.open_cases)}
                  </p>
                  <p className="mt-1 text-[10.5px] font-medium text-[#c2410c]">{t("field.beat.open")}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2.5 py-2">
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-ink">{fmt(beat.total_firs)}</p>
                  <p className="mt-1 text-[10.5px] font-medium text-ink-secondary">{t("field.beat.total")}</p>
                </div>
              </div>
              <div className="border-t border-line px-4 py-3">
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {t("field.beat.top")}
                </p>
                {topCrimes.length === 0 ? (
                  <p className="py-2 text-[12px] text-ink-secondary">{t("field.beat.empty")}</p>
                ) : (
                  <ol className="space-y-2">
                    {topCrimes.map((c, i) => (
                      <li key={c.name} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2">
                        <span className="text-[10.5px] font-semibold tabular-nums text-ink-muted">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[12px] font-medium text-ink">{c.name}</span>
                            <span className="text-[11px] tabular-nums text-ink-secondary">{fmt(c.firs)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-navy"
                              style={{ width: `${(c.firs / maxCrime) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-12 text-right">
                          <Delta pct={c.change_pct} />
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Section>

            <Section icon={Camera} title={t("field.evidence.title")} sub={t("field.evidence.sub")}>
              <div className="space-y-3 px-4 py-3">
                <p className="text-[12px] leading-5 text-ink-secondary">{t("field.evidence.body")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {["FIR", "Panchnama", "CDR", "Post-mortem", "Witness statement"].map((x) => (
                    <span
                      key={x}
                      className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10.5px] text-ink-secondary"
                    >
                      {x}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => ask(t("field.evidence.ask"))}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                >
                  <Camera size={12} /> {t("field.evidence.cta")}
                </button>
              </div>
            </Section>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
              {t("field.ask.title")}
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
                    <Languages size={14} />
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
