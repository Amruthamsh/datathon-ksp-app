import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlarmClock,
  Gavel,
  FileCheck2,
  Network,
  MapPinned,
  FileSearch,
  ChevronRight,
  CircleDashed,
  ShieldAlert,
} from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getCompliance } from "../api/compliance";
import { canViewCrimeMap } from "../utils/role";

// Status colours are reserved for statutory state and always carry a label.
const BANDS = [
  { id: "breached", bar: "bg-[#d92d20]", dot: "bg-[#d92d20]" },
  { id: "critical", bar: "bg-[#f97316]", dot: "bg-[#f97316]" },
  { id: "warning", bar: "bg-[#fcd34d]", dot: "bg-[#fcd34d]" },
  { id: "on_track", bar: "bg-[#94a3b8]", dot: "bg-[#94a3b8]" },
];

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Headline({ tone, icon: Icon, value, text, action, onClick }) {
  const tones = {
    critical: "border-red-200 bg-red-50 text-red-900",
    warn: "border-orange-200 bg-orange-50 text-orange-900",
    neutral: "border-line bg-surface text-ink",
  };
  return (
    <div className={`flex flex-col rounded-panel border p-4 shadow-card ${tones[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0" />
        <span className="text-[30px] font-semibold leading-none tabular-nums">{value}</span>
      </div>
      <p className="mt-2 flex-1 text-[13px] font-medium leading-5">{text}</p>
      {onClick && (
        <button
          onClick={onClick}
          className="mt-3 inline-flex w-fit items-center gap-1 rounded-md border border-current/25 bg-white/70 px-2.5 py-1 text-[12px] font-semibold transition hover:bg-white cursor-pointer"
        >
          {action} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

function BandBar({ counts, onPick }) {
  const { t } = useTranslation();
  const total = BANDS.reduce((a, b) => a + (counts?.[b.id] || 0), 0);
  if (!total) return <span className="text-[12px] text-ink-muted">{t("compliance.noOpenClocks")}</span>;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-slate-100">
        {BANDS.map((b) =>
          counts[b.id] ? (
            <button
              key={b.id}
              title={`${t(`compliance.band.${b.id}`)}: ${fmt(counts[b.id])}`}
              onClick={() => onPick(b.id)}
              className={`${b.bar} h-full cursor-pointer transition hover:opacity-80`}
              style={{ width: `${Math.max(2, (counts[b.id] / total) * 100)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {BANDS.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b.id)}
            disabled={!counts[b.id]}
            className="inline-flex items-center gap-1 text-[11px] text-ink-secondary hover:text-ink disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            <span className={`h-2 w-2 rounded-full ${b.dot}`} />
            {t(`compliance.band.${b.id}`)}
            <span className="font-semibold tabular-nums text-ink">{fmt(counts[b.id])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Compliance() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, officer } = useAuth();
  const mapAllowed = canViewCrimeMap(officer);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getCompliance(token)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const queue = (rule, band, extra = {}) =>
    navigate(
      `/investigations?${new URLSearchParams(
        Object.fromEntries(Object.entries({ bnss: rule, band, ...extra }).filter(([, v]) => v)),
      )}`,
    );

  if (error) {
    return <div className="p-8 text-sm text-ink-secondary">{t("compliance.unavailable")}</div>;
  }
  if (!data) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-24 rounded-panel bg-slate-200/70" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-panel bg-slate-200/70" />
          ))}
        </div>
      </div>
    );
  }

  const h = data.headline;

  return (
    <div className="h-full overflow-y-auto bg-surface-subtle">
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-5 md:px-6">
        {/* Title + the rule in one sentence */}
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand">
            {t("compliance.eyebrow")}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">{t("compliance.title")}</h1>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-6 text-ink-secondary">
            {t("compliance.ruleSentence")}
          </p>
          <p className="mt-1 text-[11.5px] text-ink-muted">
            {t("compliance.asOf", { date: fmtDate(data.as_of) })}
          </p>
        </div>

        {/* Consequences, in plain words */}
        <div className="grid gap-3 md:grid-cols-3">
          <Headline
            tone="critical"
            icon={AlarmClock}
            value={fmt(h.bail_critical)}
            text={t("compliance.headline.critical", { days: data.critical_days })}
            action={t("compliance.viewCases")}
            onClick={() => queue("default_bail", "critical")}
          />
          <Headline
            tone="warn"
            icon={Gavel}
            value={fmt(h.bail_breached)}
            text={t("compliance.headline.breached")}
            action={t("compliance.viewCases")}
            onClick={() => queue("default_bail", "breached")}
          />
          <Headline
            tone="neutral"
            icon={FileCheck2}
            value={h.on_time_rate != null ? `${h.on_time_rate}%` : "—"}
            text={t("compliance.headline.onTime", { filed: fmt(h.filed) })}
          />
        </div>

        {/* Expiring next — where BNSS meets Networks and the Map */}
        {data.expiring?.length > 0 && (
          <section className="rounded-panel border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">{t("compliance.expiringTitle")}</h2>
              <p className="text-[12px] text-ink-secondary">{t("compliance.expiringSub")}</p>
            </div>
            <ul className="divide-y divide-line">
              {data.expiring.map((e) => {
                // Default bail: the person in custody. Other clocks: lead accused.
                const lead = e.custody || e.accused?.[0];
                const bridge = lead && lead.districts > 1;
                return (
                  <li
                    key={`${e.CaseMasterID}-${e.rule}`}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[96px_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center"
                  >
                    <div className="flex items-baseline gap-1 md:block">
                      <span className="text-[26px] font-semibold leading-none tabular-nums text-[#c2410c]">
                        {e.days_left === 0 ? t("compliance.today") : e.days_left}
                      </span>
                      <span className="text-[11px] font-medium text-ink-secondary md:block">
                        {e.days_left === 0 ? t("compliance.dueToday") : t("compliance.daysLeft", { count: e.days_left })}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="ksp-mono truncate text-[12px] font-semibold text-ink">{e.CrimeNo}</p>
                      <p className="truncate text-[12px] text-ink-secondary">
                        {e.crime} · {e.station}, {e.district}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {t(`compliance.rules.${e.rule}.provision`)} · {t("compliance.deadline", { date: fmtDate(e.deadline) })}
                      </p>
                    </div>
                    <div className="min-w-0">
                      {lead ? (
                        <>
                          <p className="truncate text-[12.5px] font-semibold text-ink">
                            {e.custody
                              ? t("compliance.inCustody", { name: e.custody.name, age: e.custody.age, date: fmtDate(e.custody.arrested) })
                              : e.accused.map((a) => a.name).join(", ")}
                          </p>
                          <p className={`text-[11.5px] ${bridge ? "font-semibold text-[#b42318]" : "text-ink-secondary"}`}>
                            {bridge && <ShieldAlert size={11} className="mr-1 inline -translate-y-px" />}
                            {t("compliance.reach", { name: lead.name, firs: lead.firs, districts: lead.districts })}
                          </p>
                        </>
                      ) : (
                        <p className="text-[12px] text-ink-muted">{t("compliance.noAccused")}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 md:justify-end">
                      <button
                        onClick={() => navigate(`/investigations/${e.CaseMasterID}`)}
                        className="inline-flex items-center gap-1 rounded-md bg-navy px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-navy-hover cursor-pointer"
                      >
                        <FileSearch size={12} /> {t("compliance.openCase")}
                      </button>
                      {lead && (
                        <button
                          onClick={() => navigate(`/networks?person=${encodeURIComponent(lead.name)}`)}
                          className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                        >
                          <Network size={12} /> {t("compliance.network")}
                        </button>
                      )}
                      {mapAllowed && (
                        <button
                          onClick={() => navigate(`/crime-intelligence-map?district=${encodeURIComponent(e.district)}`)}
                          className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                        >
                          <MapPinned size={12} /> {t("compliance.map")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* The statutory rulebook, live */}
          <section className="rounded-panel border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">{t("compliance.rulebookTitle")}</h2>
              <p className="text-[12px] text-ink-secondary">{t("compliance.rulebookSub")}</p>
            </div>
            <ul className="divide-y divide-line">
              {data.rules.map((r) => (
                <li key={r.id} className={`px-4 py-3 ${r.live ? "" : "bg-slate-50/70"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className={`text-[13px] font-semibold ${r.live ? "text-ink" : "text-ink-secondary"}`}>
                      {t(`compliance.rules.${r.id}.stage`, { defaultValue: r.stage })}
                    </p>
                    <span className="ksp-mono text-[11px] font-semibold text-navy">
                      {t(`compliance.rules.${r.id}.provision`, { defaultValue: r.provision })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-secondary">
                    <span className="font-semibold text-ink">{t(`compliance.rules.${r.id}.limit`, { defaultValue: r.limit })}</span>
                    {" · "}
                    {t(`compliance.rules.${r.id}.clock`, { defaultValue: r.clock })}
                  </p>
                  <div className="mt-2">
                    {r.live ? (
                      <BandBar counts={r.counts} onPick={(band) => queue(r.id, band)} />
                    ) : (
                      <p className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 py-1 text-[11.5px] text-ink-secondary">
                        <CircleDashed size={12} />
                        {t("compliance.needsFeed", { field: t(`compliance.rules.${r.id}.missing`, { defaultValue: r.missing }) })}
                      </p>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-[17px] text-ink-muted">
                    {t(`compliance.rules.${r.id}.response`, { defaultValue: r.response })}
                  </p>
                  {r.note && (
                    <p className="mt-1 text-[11px] italic text-ink-muted">
                      {t(`compliance.rules.${r.id}.note`, { defaultValue: r.note })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Who is falling behind */}
          <section className="h-fit rounded-panel border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">
                {t(`compliance.unitsTitle.${data.unit_level}`)}
              </h2>
              <p className="text-[12px] text-ink-secondary">{t("compliance.unitsSub")}</p>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead className="text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t(`compliance.unitCol.${data.unit_level}`)}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t("compliance.band.critical")}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t("compliance.band.breached")}</th>
                  <th className="px-4 py-2 font-semibold">{t("compliance.onTimeCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.units.slice(0, 12).map((u) => (
                  <tr
                    key={u.name}
                    onClick={() =>
                      queue("default_bail", null, data.unit_level === "district" ? { district: u.name } : { station: u.name })
                    }
                    className="cursor-pointer hover:bg-navy-soft"
                  >
                    <td className="truncate px-4 py-2 font-medium text-ink">{u.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-[#c2410c]">{fmt(u.critical)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{fmt(u.breached)}</td>
                    <td className="px-4 py-2">
                      {u.on_time_rate != null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-navy" style={{ width: `${u.on_time_rate}%` }} />
                          </div>
                          <span className="tabular-nums text-ink-secondary">{u.on_time_rate}%</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
