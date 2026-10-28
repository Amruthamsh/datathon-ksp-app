import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  ChevronDown,
  X,
  FilterX,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  getSummary,
  getInvestigations,
  getFilters,
} from "../api/investigations";
import { useAuth } from "../auth/AuthContext";
import ScopeBanner from "../components/ScopeBanner";

const PAGE_SIZE = 100;

// Compact windowed page numbers: 1 … 48 49 [50] 51 52 … 500
function pageNumbers(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function InvestigationsQueue() {
  const { token, officer: authOfficer } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [summary, setSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filtersData, setFiltersData] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState([]); // capped at 4

  // Filters + page live in URL — survives refresh/bookmark/back
  const searchQuery = searchParams.get("search") || "";
  const sortAscending = searchParams.get("sortDir") === "asc";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const activeStat = searchParams.get("stat") || "";
  // BNSS clock filter from the compliance board: ?bnss=default_bail&band=critical
  const bnssRule = searchParams.get("bnss") || "";
  const bnssBand = searchParams.get("band") || "";
  const activeFilters = useMemo(
    () => ({
      CaseStatusName: searchParams.get("status") || "",
      Gravity: searchParams.get("gravity") || "",
      UnitName: searchParams.get("station") || "",
      FirstName: searchParams.get("officer") || "",
      DistrictName: searchParams.get("district") || "",
      CrimeHeadName: searchParams.get("crimeHead") || "",
    }),
    [searchParams],
  );

  const setParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (!val) next.delete(key);
    else next.set(key, val);
    // any filter/search/sort change restarts at page 1
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  // BNSS clock from the server (services/bnss_service.py): the nearest hard
  // statutory limit — default bail (s.187(3), from first arrest) or the
  // s.193(2) sexual-offence window. Null when no clock is running.
  const isOverdue = (row) => row.Bnss?.band === "breached";

  const bnssWhy = (row) => {
    const b = row.Bnss;
    if (!b) return null;
    const key = b.rule === "sexual_offence" ? "sexual" : "bail";
    if (b.band === "breached")
      return t(`investigations.queue.why.bnss.${key}Breached`, { count: Math.abs(b.days_left) });
    if (b.band === "critical")
      return t(`investigations.queue.why.bnss.${key}Due`, { count: b.days_left });
    return null;
  };

  const hasNoArrest = (row) =>
    !row.HasArrest && Number(row.AccusedCount || 0) > 0;

  const getWhyNow = (row) => {
    const bnss = bnssWhy(row);
    if (bnss) return bnss;
    if (hasNoArrest(row)) return t("investigations.queue.why.noArrest");
    if (!row.HasChargesheet)
      return t("investigations.queue.why.chargesheetNotFiled");
    const cs = String(row.CaseStatusName || "").toLowerCase();
    if (cs.includes("under investigation"))
      return t("investigations.queue.why.investigationPending");
    return String(row.Gravity || "")
      .toLowerCase()
      .includes("heinous")
      ? t("investigations.queue.why.heinousAttention")
      : t("investigations.queue.why.accusedStatus", {
          count: row.AccusedCount ?? 0,
          status: row.CaseStatusName || t("investigations.queue.statusOpen"),
        });
  };

  const getNextAction = (row) => {
    if (isOverdue(row) || !row.HasChargesheet)
      return t("investigations.queue.next.fileChargesheet");
    if (hasNoArrest(row)) return t("investigations.queue.next.locateAccused");
    return t("investigations.queue.next.reviewCase");
  };

  const priorityBox = (p) => {
    const v = String(p || "").toLowerCase();
    if (v.includes("critical"))
      return {
        bg: "bg-[#D62828]",
        fg: "text-white",
        border: "border-[#D62828]",
        label: t("investigations.priority.critical"),
      };
    if (v.includes("high"))
      return {
        bg: "bg-[#F97316]",
        fg: "text-white",
        border: "border-[#F97316]",
        label: t("investigations.priority.high"),
      };
    if (v.includes("medium"))
      return {
        bg: "bg-white",
        fg: "text-[#374151]",
        border: "border-[#DDE3EC]",
        label: t("investigations.priority.medium"),
      };
    return {
      bg: "bg-white",
      fg: "text-[#6B7280]",
      border: "border-[#DDE3EC]",
      label: t("investigations.priority.low"),
    };
  };

  // one-line intelligence per row — real row signals only (no mocks).
  // Never mid-word truncate: drop signals to fit ~38ch (≈260px at 11px) instead of truncating.
  // Plain function (not memoized): depends on the rule helpers above.
  const getRowIntel = (row) => {
      const parts = [];
      const bnss = bnssWhy(row);
      if (bnss) parts.push(bnss);
      if (hasNoArrest(row)) parts.push(t("investigations.queue.why.noArrest"));
      if (!row.HasChargesheet && !isOverdue(row))
        parts.push(t("investigations.queue.why.chargesheetNotFiled"));
      if (parts.length === 0) {
        if (String(row.Gravity).toLowerCase().includes("heinous"))
          parts.push(
            row.CrimeGroupName
              ? t("investigations.queue.why.heinousGroup", {
                  group: row.CrimeGroupName,
                })
              : t("investigations.queue.why.heinousAttention"),
          );
        else
          parts.push(
            t("investigations.queue.why.accusedStatus", {
              count: row.AccusedCount ?? 0,
              status: row.CaseStatusName || t("investigations.queue.statusOpen"),
            }),
          );
      }
      if (Number(row.VictimCount || 0) > 0)
        parts.push(
          t("investigations.queue.why.victimCount", {
            count: row.VictimCount,
          }),
        );
      // budget fit: prefer complete signals over truncated ones
      const BUDGET = 38;
      const join = (n) => parts.slice(0, n).join(" · ");
      if (join(3).length <= BUDGET) return join(3);
      if (join(2).length <= BUDGET) return join(2);
      return join(1);
  };

  // Scope-wide totals + global filter options: stable per session, not per page.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [summaryRes, filtersRes] = await Promise.all([
          getSummary(token),
          getFilters(token),
        ]);
        setSummary(summaryRes?.data ?? null);
        setFiltersData(filtersRes?.data ?? null);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [token]);

  // Case list: fully server-driven (RBAC scope + filters + search + sort + page).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      try {
        const res = await getInvestigations(token, {
          page,
          pageSize: PAGE_SIZE,
          statusFilter: activeFilters.CaseStatusName,
          gravity: activeFilters.Gravity,
          station: activeFilters.UnitName,
          officer: activeFilters.FirstName,
          district: activeFilters.DistrictName,
          crimeHead: activeFilters.CrimeHeadName,
          search: searchQuery.trim(),
          sort: "priority",
          sortDir: sortAscending ? "asc" : "desc",
          onlyOverdue: activeStat === "overdue",
          onlyArrestPending: activeStat === "arrests_pending",
          onlyUnderInvestigation: activeStat === "under_investigation",
          onlyPendingTrial: activeStat === "pending_trial",
          bnssRule: bnssRule || undefined,
          bnssBand: bnssBand || undefined,
        });
        if (cancelled) return;
        setCases(Array.isArray(res?.data) ? res.data : []);
        setPagination(res?.pagination ?? null);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setCases([]);
          setPagination(null);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token,
    page,
    searchQuery,
    sortAscending,
    activeStat,
    bnssRule,
    bnssBand,
    activeFilters.CaseStatusName,
    activeFilters.Gravity,
    activeFilters.UnitName,
    activeFilters.FirstName,
    activeFilters.DistrictName,
    activeFilters.CrimeHeadName,
  ]);

  const dynamicFilterOptions = useMemo(() => {
    const extractUnique = (key, fallbackKey) => {
      if (filtersData && Array.isArray(filtersData[key]))
        return filtersData[key];
      const values = cases
        .map((c) => c[key] || (fallbackKey ? c[fallbackKey] : null))
        .filter(Boolean);
      return Array.from(new Set(values));
    };
    return {
      CaseStatusName: extractUnique("CaseStatusName", "status"),
      Gravity: extractUnique("Gravity", "gravity"),
      UnitName: extractUnique("UnitName", "Station"),
      FirstName: extractUnique("FirstName", "InvestigatingOfficer"),
      DistrictName: extractUnique("DistrictName", "district"),
      CrimeHeadName: extractUnique("CrimeHeadName", "crime_head"),
    };
  }, [cases, filtersData]);

  // Stat bar counts come from the scope-aware backend summary (real DB counts
  // across the officer's whole scope) — never from the loaded page or mocks.
  const statCounts = {
    overdue: summary?.chargesheet_overdue ?? 0,
    arrestsPending: summary?.arrests_pending ?? 0,
    pendingTrial: summary?.pending_trial ?? 0,
  };

  // Rows arrive already filtered + sorted from the server (scope-aware).
  const filteredCases = cases;

  const handleFilterSelect = (filterKey, value) => {
    const paramMap = {
      CaseStatusName: "status",
      Gravity: "gravity",
      UnitName: "station",
      FirstName: "officer",
      DistrictName: "district",
      CrimeHeadName: "crimeHead",
    };
    const param = paramMap[filterKey];
    const current = searchParams.get(param) || "";
    setParam(param, current === value ? "" : value);
    setOpenDropdown(null);
  };
  const toggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.error(t("investigations.queue.selectUpTo4"));
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCrossCase = () => {
    const rows = cases.filter((r) => selected.includes(r.CaseMasterID));
    if (rows.length < 1) return;
    const lines = rows.map((r, i) =>
      `${i + 1}. ${r.CrimeNo} — ${r.Station || r.UnitName || ""} ${r.DistrictName ? `(${r.DistrictName})` : ""} · ${r.CrimeHeadName || r.CrimeGroupName || ""} · ${r.Gravity || ""} · ${getRowIntel(r)}`.trim(),
    );
    const msg =
      rows.length === 1
        ? `Analyse this FIR and suggest next steps, connections and risks:\n\n${lines.join("\n")}\n\nQuestion: Summarize this case, identify accused and MO, flag overdue items, and suggest 3 related FIRs to investigate next.`
        : `Analyse these ${rows.length} FIRs and identify connections between accused, location, and modus operandi:\n\n${lines.join("\n")}\n\nQuestion: Are these cases connected? Compare accused overlap, locations, time windows, and MO. Highlight shared accused, same station/district, and similar crime heads.`;
    navigate("/", { state: { initialMessage: msg } });
  };

  const clearFilters = () => setSearchParams(new URLSearchParams());
  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    Object.values(activeFilters).some((v) => v !== "") ||
    Boolean(activeStat);

  const filterConfig = [
    { label: t("investigations.filters.status"), key: "CaseStatusName" },
    { label: t("investigations.filters.gravity"), key: "Gravity" },
    { label: t("investigations.filters.station"), key: "UnitName" },
    { label: t("investigations.filters.officer"), key: "FirstName" },
    { label: t("investigations.filters.district"), key: "DistrictName" },
    { label: t("investigations.filters.crimeHead"), key: "CrimeHeadName" },
  ];

  const greetingName =
    authOfficer?.full_name?.split(" ")[0] ||
    authOfficer?.FirstName || t("investigations.queue.defaultOfficer");
  // Scope-wide heinous count from the backend summary — not the page.
  const heinousCount = summary?.critical ?? 0;
  const totalCount = pagination?.total ?? filteredCases.length;

  if (loading) {
    return (
      <div className="ksp-queue flex h-full w-full items-center justify-center bg-[#F4F6F9]">
        <div className="flex items-center gap-2 text-[#374151]">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-medium">
            {t("investigations.loading")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="ksp-queue flex h-full flex-col overflow-hidden bg-[#F4F6F9]">
      {/* Morning Briefing header */}
      <div className="border-b border-[#DDE3EC] bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">
              {t("investigations.queue.morningBriefing")}
            </p>
            <h1 className="mt-0.5 text-[18px] font-bold tracking-tight text-[#1A1A2E]">
              {t("investigations.queue.goodMorning", { name: greetingName })}
            </h1>
            <p className="mt-1 text-[13px] leading-tight text-[#374151]">
              {t("investigations.queue.needAttention", {
                count: totalCount,
              })}
              {heinousCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D62828] inline-block" />
                  {t("investigations.queue.heinousSuffix", {
                    count: heinousCount,
                  })}
                </span>
              )}
              {searchQuery || hasActiveFilters ? (
                <span className="ml-2 text-[#6B7280]">
                  {t("investigations.queue.shownOf", {
                    shown: filteredCases.length,
                    total: totalCount,
                  })}
                </span>
              ) : null}
              {listLoading && (
                <span className="ml-2 inline-flex items-center gap-1 text-[#6B7280]">
                  <Loader2 className="animate-spin" size={12} />
                </span>
              )}
            </p>
            <p className="hidden text-[12px] text-[#6B7280] sm:block">
              {t("investigations.subtitle")}
            </p>
          </div>
          <div className="relative shrink-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              size={14}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setParam("search", e.target.value)}
              placeholder={t("investigations.searchPlaceholder")}
              className="w-64 border border-[#DDE3EC] bg-white py-1.5 pl-8 pr-8 text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] focus:border-[#1A1A2E] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setParam("search", "")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#374151]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {/* Stat bar — urgent, high-contrast; each filters */}
        <div className="mt-3">
          <ScopeBanner officer={authOfficer} count={summary?.assigned} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            {
              id: "overdue",
              labelKey: "investigations.queue.statOverdue",
              value: statCounts.overdue,
              bg: "bg-red-400",
              valueColor: "text-white",
              dot: "bg-white",
              labelColor: "text-white/85",
              subColor: "text-white/80",
              badgeColor: "text-[#DC2626]",
              subKey: "investigations.queue.subPastDue",
            },
            {
              id: "arrests_pending",
              labelKey: "investigations.queue.statArrests",
              value: statCounts.arrestsPending,
              bg: "bg-orange-300",
              valueColor: "text-slate-900",
              dot: "bg-slate-800",
              labelColor: "text-slate-800",
              subColor: "text-slate-700",
              badgeColor: "text-slate-800",
              subKey: "investigations.queue.subAwaitingArrest",
            },
            {
              id: "pending_trial",
              labelKey: "investigations.queue.statPendingTrial",
              value: statCounts.pendingTrial,
              bg: "bg-blue-900/90",
              valueColor: "text-white",
              dot: "bg-white",
              labelColor: "text-white/85",
              subColor: "text-white/80",
              badgeColor: "text-[#2563EB]",
              subKey: "investigations.queue.subAwaitingTrial",
            },
          ].map((m) => {
            const active = activeStat === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setParam("stat", active ? "" : m.id)}
                className={`relative flex flex-col items-start gap-1 rounded-sm px-4 py-3 text-left transition ${active ? "bg-[#1A1A2E] text-white" : `${m.bg} hover:brightness-[0.98]`}`}
                title={
                  active
                    ? t("investigations.queue.clearFilterTitle")
                    : t("investigations.queue.filterTo", {
                        label: t(m.labelKey).toLowerCase(),
                      })
                }
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.1em] ${active ? "text-white/70" : m.labelColor || "text-white/85"}`}
                >
                  {t(m.labelKey)}
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className={`ksp-mono text-[26px] font-black leading-none tabular-nums ${active ? "text-white" : m.valueColor}`}
                  >
                    {m.value ?? 0}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : m.dot} ${m.value > 0 ? "animate-pulse" : "opacity-90"}`}
                  />
                  <span
                    className={`text-[11px] font-medium ${active ? "text-white/60" : m.subColor || "text-white/80"}`}
                  >
                    {t(m.subKey)}
                  </span>
                </span>
                {m.value > 0 && !active && (
                  <span
                    className={`absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wide ${m.badgeColor || m.valueColor} border border-white bg-white px-1.5 py-0.5`}
                  >
                    {t("investigations.queue.actionNeeded")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex min-h-[44px] items-center justify-between border-b border-[#DDE3EC] bg-[#F4F6F9] px-6 py-2">
        <div className="flex items-center gap-2">
          {filterConfig.map(({ label, key }) => {
            const options = dynamicFilterOptions[key] || [];
            const activeVal = activeFilters[key];
            const isOpen = openDropdown === key;
            return (
              <div key={key} className="relative">
                <button
                  onClick={() => setOpenDropdown(isOpen ? null : key)}
                  className={`flex items-center border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${activeVal ? "border-[#1A1A2E] bg-[#1A1A2E] text-white" : "border-[#DDE3EC] bg-white text-[#374151] hover:bg-white"}`}
                >
                  {activeVal ? `${label}: ${activeVal}` : label}
                  <ChevronDown size={11} className="ml-1 opacity-60" />
                </button>
                {isOpen && (
                  <div className="absolute left-0 z-30 mt-1 max-h-56 w-48 overflow-y-auto border border-[#DDE3EC] bg-white py-1">
                    <button
                      onClick={() => handleFilterSelect(key, "")}
                      className="w-full px-3 py-1.5 text-left text-xs text-[#9CA3AF] hover:bg-[#F4F6F9]"
                    >
                      {t("investigations.allLabel", { label })}
                    </button>
                    {options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleFilterSelect(key, opt)}
                        className={`w-full px-3 py-1.5 text-left text-xs ${activeVal === opt ? "bg-[#F4F6F9] font-bold text-[#1A1A2E]" : "text-[#374151] hover:bg-[#F4F6F9]"}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-1 flex items-center gap-1 px-2 py-1 text-xs font-semibold text-[#D62828] hover:underline"
            >
              <FilterX size={12} />
              {t("investigations.reset")}
            </button>
          )}
        </div>
        <button
          onClick={() => setParam("sortDir", sortAscending ? "" : "asc")}
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#374151] hover:text-[#1A1A2E]"
        >
          {t(
            sortAscending
              ? "investigations.queue.sortPriorityAsc"
              : "investigations.queue.sortPriorityDesc",
          )}
        </button>
      </div>

      {bnssRule && (
        <div className="mx-0 mb-2 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <span className="font-semibold">
            {t("investigations.queue.bnssFilter", {
              rule: t(`compliance.rules.${bnssRule}.stage`, { defaultValue: bnssRule }),
              band: t(`compliance.band.${bnssBand || "all"}`),
            })}
          </span>
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("bnss");
              next.delete("band");
              next.delete("page");
              setSearchParams(next);
            }}
            className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-red-100 cursor-pointer"
          >
            {t("investigations.queue.clearBnss")}
          </button>
        </div>
      )}

      {/* Action-oriented table — Priority | Case | Why now | Next action | Age */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-[#DDE3EC] bg-white">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                {t("investigations.queue.colPriority")}
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                {t("investigations.queue.colCase")}
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                {t("investigations.queue.colWhy")}
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                {t("investigations.queue.colNext")}
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                {t("investigations.queue.colAge")}
              </th>
              <th className="hidden lg:table-cell px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9CA3AF]">
                {t("investigations.queue.colStationHead")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {filteredCases.length > 0 ? (
              filteredCases.map((row) => {
                const box = priorityBox(row.Priority);
                const isSel = selected.includes(row.CaseMasterID);
                const why = getWhyNow(row);
                const next = getNextAction(row);
                // red flag only on real blockers: overdue chargesheet / missing arrest
                const isBlocking = isOverdue(row) || hasNoArrest(row);
                return (
                  <tr
                    key={row.CaseMasterID}
                    onClick={() =>
                      navigate(
                        `/investigations/${row.CaseMasterID}?${searchParams.toString()}`,
                      )
                    }
                    className={`group cursor-pointer ${isSel ? "bg-[#EEF2FF]" : "hover:bg-[#F4F6F9]"}`}
                  >
                    <td className="w-8 px-2 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={(e) => toggleSelect(row.CaseMasterID, e)}
                        onClick={(e) => e.stopPropagation()}
                        className={`h-3.5 w-3.5 rounded-sm border-[#9CA3AF] text-[#1A1A2E] focus:ring-0 ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                      />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex h-5 w-[78px] items-center justify-center whitespace-nowrap rounded-sm border px-2 text-[10px] font-bold uppercase tracking-[0.08em] ${box.bg} ${box.fg} ${box.border}`}
                      >
                        {box.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top min-w-[220px]">
                      <div className="ksp-mono text-[11px] font-semibold leading-tight text-[#1A1A2E] truncate max-w-[220px]">
                        {row.CrimeNo}
                      </div>
                      <div className="text-[11px] leading-tight text-[#6B7280] truncate max-w-[220px]">
                        {row.Station || row.UnitName} ·{" "}
                        {row.CrimeHeadName || row.CrimeGroupName || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-medium leading-tight ${isBlocking ? "text-[#D62828]" : "text-[#1A1A2E]"}`}
                      >
                        {isBlocking && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#D62828] shrink-0" />
                        )}
                        {why}
                      </span>
                      <div className="text-[11px] text-[#6B7280]">
                        {row.CaseStatusName || t("investigations.queue.statusOpen")} · {row.Gravity || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className="inline-flex w-[148px] justify-center whitespace-nowrap rounded-[2px] border border-slate-600 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1A1A2E] group-hover:border-[#1A1A2E] group-hover:bg-[#1A1A2E] group-hover:text-white transition-colors">
                        {next}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-[13px] text-[#374151] whitespace-nowrap">
                      {row.AgeDays != null
                        ? (() => {
                            const d = Math.floor(Number(row.AgeDays));
                            if (d > 30) {
                              const m = Math.floor(d / 30);
                              return t("investigations.queue.ageMonths", {
                                months: m,
                                days: d % 30,
                              });
                            }
                            return t("investigations.queue.ageDays", {
                              count: d,
                            });
                          })()
                        : "—"}
                    </td>
                    <td
                      className="hidden lg:table-cell px-3 py-2.5 align-top text-[11px] text-[#9CA3AF] max-w-[160px] truncate"
                      title={`${row.AssignedOfficer || row.FirstName || t("investigations.queue.unassigned")} — ${row.DistrictName || ""}`}
                    >
                      {row.AssignedOfficer || row.FirstName || t("investigations.queue.unassigned")}
                      {row.DistrictName ? ` · ${row.DistrictName}` : ""}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="py-10 text-center text-sm text-[#9CA3AF]"
                >
                  {t("investigations.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination — server-side, scope-aware totals */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-[#DDE3EC] bg-white px-6 py-2.5">
          <p className="text-[12px] text-[#6B7280]">
            {t("investigations.queue.pageOf", {
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, pagination.total),
              total: pagination.total,
            })}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setParam("page", String(page - 1))}
              disabled={page <= 1}
              className="rounded border border-[#DDE3EC] px-2.5 py-1 text-[12px] font-semibold text-[#374151] hover:bg-[#F4F6F9] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("investigations.queue.prevPage")}
            </button>
            {pageNumbers(page, pagination.total_pages).map((p, i) =>
              p === "…" ? (
                <span key={`gap-${i}`} className="px-1 text-[12px] text-[#9CA3AF]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setParam("page", String(p))}
                  className={`rounded px-2.5 py-1 text-[12px] font-semibold ${
                    p === page
                      ? "bg-[#1A1A2E] text-white"
                      : "text-[#374151] hover:bg-[#F4F6F9]"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              onClick={() => setParam("page", String(page + 1))}
              disabled={page >= pagination.total_pages}
              className="rounded border border-[#DDE3EC] px-2.5 py-1 text-[12px] font-semibold text-[#374151] hover:bg-[#F4F6F9] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("investigations.queue.nextPage")}
            </button>
          </div>
        </div>
      )}
      {/* Floating cross-case bar — compact FAB anchored bottom-right */}
      {selected.length >= 1 && (
        <div className="pointer-events-none fixed inset-x-4 bottom-2 z-40 flex justify-center sm:inset-x-auto sm:bottom-3 sm:right-3 sm:justify-end">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-[#1A1A2E] bg-[#1A1A2E] py-1.5 pl-3.5 pr-1.5 shadow-[0_8px_24px_rgba(26,26,46,0.28),0_2px_8px_rgba(0,0,0,0.12)]">
            <span className="whitespace-nowrap text-xs font-medium text-white/90">
              {t(
                selected.length === 1
                  ? "investigations.queue.caseSelectedOne"
                  : "investigations.queue.caseSelectedOther",
                { count: selected.length },
              )}
            </span>
            <span className="h-4 w-px bg-white/15" />
            <button
              onClick={handleCrossCase}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-[#1A1A2E] shadow-sm transition hover:bg-[#F4F6F9]"
            >
              {selected.length === 1
                ? t("investigations.queue.chatAbout")
                : t("investigations.queue.crossCase")}
              <ArrowRight size={12} />
            </button>
            <button
              onClick={() => setSelected([])}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              title={t("investigations.queue.clearSelection")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
