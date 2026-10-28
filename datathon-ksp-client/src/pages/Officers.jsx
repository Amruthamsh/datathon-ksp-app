import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserX, ShieldCheck, AlarmClock, ArrowRight, AlertTriangle, MapPin } from "lucide-react";

import { useAuth } from "../auth/AuthContext";
import { getOfficerSupervision } from "../api/supervision";
import { getOfficerTier, TIERS } from "../utils/role";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

function Headline({ tone, icon: Icon, value, text }) {
  const tones = {
    critical: "border-red-200 bg-red-50 text-red-900",
    warn: "border-orange-200 bg-orange-50 text-orange-900",
    neutral: "border-line bg-surface text-ink",
  };
  return (
    <div className={`rounded-panel border p-4 shadow-card ${tones[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0" />
        <span className="text-[28px] font-semibold leading-none tabular-nums">{value}</span>
      </div>
      <p className="mt-2 text-[13px] font-medium leading-5">{text}</p>
    </div>
  );
}

export default function Officers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, officer } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getOfficerSupervision(token)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tier = getOfficerTier(officer);
  const jurisdiction =
    tier === TIERS.DISTRICT
      ? t("briefing.jurisdiction.district", { district: officer?.district_name || officer?.district || "" })
      : tier === TIERS.STATION
        ? officer?.unit_name || ""
        : t("briefing.jurisdiction.state");

  const openCases = (name, station) =>
    navigate(`/investigations?${new URLSearchParams({ officer: name, ...(station ? { station } : {}) })}`);

  if (error) return <div className="p-8 text-sm text-ink-secondary">{t("officers.unavailable")}</div>;
  if (!data) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-20 rounded-panel bg-slate-200/70" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-panel bg-slate-200/70" />
          ))}
        </div>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="h-full overflow-y-auto bg-surface-subtle">
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-5 md:px-6">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-brand">{t("officers.eyebrow")}</p>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">{t("officers.title")}</h1>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-6 text-ink-secondary">{t("officers.intro")}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <MapPin size={12} /> {jurisdiction} · {t("officers.asOf", { date: data.as_of })}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Headline
            tone="critical"
            icon={UserX}
            value={`${s.below_rank_share}%`}
            text={t("officers.headline.belowRank", { cases: fmt(s.below_rank_cases), total: fmt(s.open_cases) })}
          />
          <Headline
            tone="neutral"
            icon={ShieldCheck}
            value={fmt(s.si_plus_cases)}
            text={t("officers.headline.siPlus", { total: fmt(s.open_cases) })}
          />
          <Headline
            tone="warn"
            icon={AlarmClock}
            value={fmt(s.bail_exposed_officers)}
            text={t("officers.headline.bailExposed", { officers: fmt(s.officers) })}
          />
        </div>

        {data.suggestions.length > 0 && (
          <section className="rounded-panel border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">{t("officers.suggestTitle")}</h2>
              <p className="text-[12px] text-ink-secondary">{t("officers.suggestSub")}</p>
            </div>
            <ul className="divide-y divide-line">
              {data.suggestions.map((x, i) => (
                <li key={i} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {x.from.name} <span className="font-normal text-ink-secondary">· {x.from.rank}</span>
                    </p>
                    <p className="truncate text-[11.5px] text-ink-secondary">{x.from.station}</p>
                    <p className="mt-0.5 text-[11.5px] font-medium text-[#b42318]">
                      {t("officers.pending", { count: x.cases })}
                      {x.bail_exposure ? ` · ${t("officers.bailExposure", { count: x.bail_exposure })}` : ""}
                    </p>
                  </div>
                  <ArrowRight size={16} className="hidden text-ink-muted md:block" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {x.to.name} <span className="font-normal text-ink-secondary">· {x.to.rank}</span>
                    </p>
                    <p className="truncate text-[11.5px] text-ink-secondary">
                      {x.to.station} · {t("officers.load", { count: x.to.load })}
                    </p>
                    <span
                      className={`mt-0.5 inline-block rounded px-1.5 py-px text-[10.5px] font-semibold ${
                        x.same_station ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {x.same_station ? t("officers.sameStation") : t("officers.otherStation")}
                    </span>
                  </div>
                  <button
                    onClick={() => openCases(x.from.name, x.from.station)}
                    className="inline-flex w-fit items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink hover:border-navy cursor-pointer"
                  >
                    {t("officers.viewCases")}
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">{t("officers.suggestNote")}</p>
          </section>
        )}

        <section className="rounded-panel border border-line bg-surface shadow-card">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold text-ink">{t("officers.tableTitle")}</h2>
            <p className="text-[12px] text-ink-secondary">{t("officers.tableSub")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead className="text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t("officers.col.officer")}</th>
                  <th className="px-2 py-2 font-semibold">{t("officers.col.station")}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t("officers.col.open")}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t("officers.col.noCs")}</th>
                  <th className="px-2 py-2 text-right font-semibold">{t("officers.col.bail")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.officers.map((o) => (
                  <tr
                    key={`${o.name}-${o.station}`}
                    onClick={() => openCases(o.name, o.station)}
                    className="cursor-pointer hover:bg-navy-soft"
                  >
                    <td className="px-4 py-2">
                      <span className="font-semibold text-ink">{o.name}</span>
                      <span className={`ml-1.5 text-[11.5px] ${o.below_rank ? "font-semibold text-[#b42318]" : "text-ink-secondary"}`}>
                        {o.below_rank && <AlertTriangle size={11} className="mr-0.5 inline -translate-y-px" />}
                        {o.rank}
                      </span>
                    </td>
                    <td className="truncate px-2 py-2 text-ink-secondary">{o.station}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{o.open_cases}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{o.no_chargesheet}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {o.bail_breached || o.bail_critical ? (
                        <span className="font-semibold text-[#c2410c]">
                          {t("officers.bailCell", { breached: o.bail_breached, critical: o.bail_critical })}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
