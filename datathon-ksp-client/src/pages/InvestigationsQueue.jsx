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
import { getMockExtensions } from "../data/mockCaseExtensions";

export default function InvestigationsQueue() {
  const { token, officer: authOfficer } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [summary, setSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [filtersData, setFiltersData] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]); // capped at 4

  // Filters live in URL — survives refresh/bookmark/back
  const searchQuery = searchParams.get("search") || "";
  const sortAscending = searchParams.get("sortDir") === "asc";
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
    setSearchParams(next);
  };

  // chargesheet countdown per row (same legal base as workspace: arrest → fallback FIR)
  const getChargesheetDiff = (row) => {
    const mock = getMockExtensions(row.CaseMasterID, {
      accused: Array(Math.max(1, Number(row.AccusedCount) || 1)).fill({}),
      victims: Array(Number(row.VictimCount) || 0).fill({}),
    });
    const arrests = mock.mockAccused
      .filter((a) => a.arrestDate)
      .map((a) => a.arrestDate);
    const earliest = arrests.length ? arrests.sort()[0] : null;
    const base = earliest || row.CrimeRegisteredDate;
    if (!base) return null;
    const isSerious = String(row.Gravity).toLowerCase().includes("heinous");
    const limit = isSerious ? 90 : 60;
    const due = new Date(new Date(base).getTime() + limit * 864e5);
    return Math.ceil((due - Date.now()) / 864e5);
  };

  const getWhyNow = (row) => {
    const mock = getMockExtensions(row.CaseMasterID, {
      accused: Array(Math.max(1, Number(row.AccusedCount) || 1)).fill({}),
      victims: Array(Number(row.VictimCount) || 0).fill({}),
    });
    const abscond = mock.mockAccused.filter(
      (a) => a.arrestStatus === "Absconding",
    ).length;
    const diff = getChargesheetDiff(row);
    if (diff !== null && diff < 0)
      return `Chargesheet ${Math.abs(diff)}d overdue`;
    if (mock.fsl.status === "overdue") {
      const days = Math.max(
        5,
        Math.floor(
          (Date.now() - new Date(mock.fsl.sentDate).getTime()) / 864e5,
        ),
      );
      return `FSL overdue ${days}d`;
    }
    if (abscond > 0) return `${abscond} accused absconding`;
    if (mock.fsl.status === "pending") return "FSL pending";
    const cs = String(row.CaseStatusName || "").toLowerCase();
    if (cs.includes("under investigation")) return "Investigation pending";
    return String(row.Gravity || "")
      .toLowerCase()
      .includes("heinous")
      ? "Heinous — requires attention"
      : "Review needed";
  };

  const getNextAction = (row) => {
    const mock = getMockExtensions(row.CaseMasterID, {
      accused: Array(Math.max(1, Number(row.AccusedCount) || 1)).fill({}),
      victims: Array(Number(row.VictimCount) || 0).fill({}),
    });
    const abscond = mock.mockAccused.filter(
      (a) => a.arrestStatus === "Absconding",
    ).length;
    const diff = getChargesheetDiff(row);
    if (diff !== null && diff < 0) return "File chargesheet";
    if (abscond > 0) return "Locate accused";
    if (mock.fsl.status === "overdue" || mock.fsl.status === "pending")
      return "Follow up FSL";
    if (mock.witnesses.filter((w) => !w.examined).length)
      return "Examine witnesses";
    return "Review case";
  };

  const getPriorityWeight = (priorityStr) => {
    const val = String(priorityStr || "")
      .trim()
      .toLowerCase();
    if (val.includes("critical")) return 4;
    if (val.includes("high")) return 3;
    if (val.includes("medium")) return 2;
    if (val.includes("low")) return 1;
    return 0;
  };

  const priorityBox = (p) => {
    const v = String(p || "").toLowerCase();
    if (v.includes("critical"))
      return {
        bg: "bg-[#D62828]",
        fg: "text-white",
        border: "border-[#D62828]",
        label: "CRITICAL",
      };
    if (v.includes("high"))
      return {
        bg: "bg-[#C85A00]",
        fg: "text-white",
        border: "border-[#C85A00]",
        label: "HIGH",
      };
    if (v.includes("medium"))
      return {
        bg: "bg-white",
        fg: "text-[#374151]",
        border: "border-[#DDE3EC]",
        label: "MEDIUM",
      };
    return {
      bg: "bg-white",
      fg: "text-[#6B7280]",
      border: "border-[#DDE3EC]",
      label: "LOW",
    };
  };

  // one-line intelligence per row — why it's critical, not just that it is
  // sourced from checklist + similarity data we already have (mock deterministically per caseId)
  // Never mid-word truncate: drop signals to fit ~38ch (≈260px at 11px) instead of truncating.
  const getRowIntel = (row) => {
    const mock = getMockExtensions(row.CaseMasterID, {
      accused: Array(Math.max(1, Number(row.AccusedCount) || 1)).fill({}),
      victims: Array(Number(row.VictimCount) || 0).fill({}),
    });
    const parts = [];
    const abscond = mock.mockAccused.filter(
      (a) => a.arrestStatus === "Absconding",
    ).length;
    if (abscond > 0) parts.push(`${abscond} accused absconding`);
    if (mock.fsl.status === "overdue") {
      const days = Math.max(
        5,
        Math.floor(
          (Date.now() - new Date(mock.fsl.sentDate).getTime()) / 864e5,
        ),
      );
      parts.push(`FSL overdue ${days}d`);
    } else if (mock.fsl.status === "pending") {
      parts.push("FSL pending");
    }
    // deterministic similar FIRs (0-3) — stands in for similarity engine until queue API returns it
    let x = (Number(row.CaseMasterID) * 999) % 2 ** 32;
    x = (x * 1664525 + 1013904223) % 2 ** 32;
    const similar = Math.floor((x / 2 ** 32) * 4);
    if (similar > 0) parts.push(`${similar} similar FIRs`);
    if (parts.length === 0) {
      if (String(row.Gravity).toLowerCase().includes("heinous"))
        parts.push(`Heinous · ${row.CrimeGroupName || ""}`.trim());
      else
        parts.push(
          `${row.AccusedCount ?? 0} accused · ${row.CaseStatusName || "Open"}`,
        );
    }
    // budget fit: prefer complete signals over truncated ones
    const BUDGET = 38;
    const join = (n) => parts.slice(0, n).join(" · ");
    if (join(3).length <= BUDGET) return join(3);
    if (join(2).length <= BUDGET) return join(2);
    return join(1);
  };

  useEffect(() => {
    loadPage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPage() {
    try {
      setLoading(true);
      const [summaryRes, investigationsRes, filtersRes] = await Promise.all([
        getSummary(token),
        getInvestigations(token),
        getFilters(token),
      ]);
      setSummary(summaryRes?.data ?? null);
      setCases(
        Array.isArray(investigationsRes?.data) ? investigationsRes.data : [],
      );
      setFiltersData(filtersRes?.data ?? null);
    } catch (e) {
      console.error(e);
      setCases([]);
    } finally {
      setLoading(false);
    }
  }

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

  // chargesheet pending = no chargesheet filed yet — proxy via status until queue API returns ChargesheetDetails flag
  const isChargesheetPending = (row) => {
    const s = String(row.CaseStatusName || row.status || "").toLowerCase();
    // only "Charge Sheeted" means filed; everything else (including Convicted for demo visibility) is pending
    // keeps display (3) aligned with filter so click visibly reduces rows
    return !(s.includes("charge sheeted") || s.includes("chargesheet filed"));
  };

  // stat bar counts — derived client-side from same mock so click → exact rows
  const statCounts = useMemo(() => {
    if (!cases.length)
      return {
        deadlines: 0,
        overdue: 0,
        abscondingCases: 0,
        abscondingTotal: 0,
        chargesheetPending: 0,
        repeat: 0,
        arrestsPending: 0,
      };
    let deadlines = 0,
      overdue = 0,
      abscondingCases = 0,
      abscondingTotal = 0,
      chargesheetPending = 0,
      repeat = 0,
      arrestsPending = 0;
    for (const row of cases) {
      const mock = getMockExtensions(row.CaseMasterID, {
        accused: Array(Math.max(1, Number(row.AccusedCount) || 1)).fill({}),
        victims: Array(Number(row.VictimCount) || 0).fill({}),
      });
      const diff = getChargesheetDiff(row);
      if (diff !== null && diff >= 0 && diff <= 7) deadlines++;
      if (diff !== null && diff < 0) overdue++;
      const abscond = mock.mockAccused.filter(
        (a) => a.arrestStatus === "Absconding",
      ).length;
      if (abscond > 0) abscondingCases++;
      abscondingTotal += abscond;
      const hasPrior = mock.mockAccused.some((a) => a.priorCases > 0);
      if (hasPrior) repeat++;
      if (abscond > 0) arrestsPending++;
      if (isChargesheetPending(row)) chargesheetPending++;
    }
    return {
      deadlines,
      overdue,
      abscondingCases,
      abscondingTotal,
      chargesheetPending,
      repeat,
      arrestsPending,
    };
  }, [cases]);

  const activeStat = searchParams.get("stat") || "";

  const filteredCases = useMemo(() => {
    return cases
      .filter((row) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const ok =
            row.CrimeNo?.toLowerCase().includes(q) ||
            (row.Station || row.UnitName)?.toLowerCase().includes(q) ||
            row.DistrictName?.toLowerCase().includes(q) ||
            row.FirstName?.toLowerCase().includes(q) ||
            row.AssignedOfficer?.toLowerCase().includes(q) ||
            row.CrimeHeadName?.toLowerCase().includes(q) ||
            row.CrimeGroupName?.toLowerCase().includes(q) ||
            getRowIntel(row).toLowerCase().includes(q);
          if (!ok) return false;
        }
        if (
          activeFilters.CaseStatusName &&
          row.CaseStatusName !== activeFilters.CaseStatusName
        )
          return false;
        if (activeFilters.Gravity && row.Gravity !== activeFilters.Gravity)
          return false;
        if (
          activeFilters.UnitName &&
          row.UnitName !== activeFilters.UnitName &&
          row.Station !== activeFilters.UnitName
        )
          return false;
        if (
          activeFilters.FirstName &&
          row.FirstName !== activeFilters.FirstName
        )
          return false;
        if (
          activeFilters.DistrictName &&
          row.DistrictName !== activeFilters.DistrictName
        )
          return false;
        if (
          activeFilters.CrimeHeadName &&
          row.CrimeHeadName !== activeFilters.CrimeHeadName
        )
          return false;
        // clickable stat bar filter — only earns its space if it actually filters
        if (activeStat) {
          const mock = getMockExtensions(row.CaseMasterID, {
            accused: Array(Math.max(1, Number(row.AccusedCount) || 1)).fill({}),
            victims: Array(Number(row.VictimCount) || 0).fill({}),
          });
          const diff = getChargesheetDiff(row);
          if (
            activeStat === "deadlines" &&
            !(diff !== null && diff >= 0 && diff <= 7)
          )
            return false;
          if (activeStat === "overdue" && !(diff !== null && diff < 0))
            return false;
          if (
            activeStat === "absconding" &&
            !mock.mockAccused.some((a) => a.arrestStatus === "Absconding")
          )
            return false;
          if (
            activeStat === "chargesheet_pending" &&
            !isChargesheetPending(row)
          )
            return false;
          if (
            activeStat === "repeat" &&
            !mock.mockAccused.some((a) => a.priorCases > 0)
          )
            return false;
          if (
            activeStat === "arrests_pending" &&
            !mock.mockAccused.some((a) => a.arrestStatus === "Absconding")
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        const wa = getPriorityWeight(a.Priority),
          wb = getPriorityWeight(b.Priority);
        return sortAscending ? wa - wb : wb - wa;
      });
  }, [cases, searchQuery, activeFilters, sortAscending, activeStat]);

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
        toast.error("Select up to 4 cases for cross-case analysis");
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCrossCase = () => {
    const rows = cases.filter((r) => selected.includes(r.CaseMasterID));
    if (rows.length < 2) return;
    const lines = rows.map((r, i) =>
      `${i + 1}. ${r.CrimeNo} — ${r.Station || r.UnitName || ""} ${r.DistrictName ? `(${r.DistrictName})` : ""} · ${r.CrimeHeadName || r.CrimeGroupName || ""} · ${r.Gravity || ""} · ${getRowIntel(r)}`.trim(),
    );
    const msg = `Analyse these ${rows.length} FIRs and identify connections between accused, location, and modus operandi:\n\n${lines.join("\n")}\n\nQuestion: Are these cases connected? Compare accused overlap, locations, time windows, and MO. Highlight shared accused, same station/district, and similar crime heads.`;
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
    authOfficer?.FirstName ||
    "Officer";
  const criticalCount = useMemo(
    () =>
      cases.filter((r) => String(r.Priority).toLowerCase().includes("critical"))
        .length,
    [cases],
  );
  const immediateCases = useMemo(() => {
    return cases.filter((r) => {
      const d = getChargesheetDiff(r);
      const mock = getMockExtensions(r.CaseMasterID, {
        accused: Array(Math.max(1, Number(r.AccusedCount) || 1)).fill({}),
        victims: [],
      });
      const abscond = mock.mockAccused.filter(
        (a) => a.arrestStatus === "Absconding",
      ).length;
      return (d !== null && d < 0) || abscond > 0;
    }).length;
  }, [cases]);

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
              Morning Briefing
            </p>
            <h1 className="mt-0.5 text-[18px] font-bold tracking-tight text-[#1A1A2E]">
              Good morning, {greetingName}
            </h1>
            <p className="mt-1 text-[13px] leading-tight text-[#374151]">
              {filteredCases.length} investigations need attention
              {criticalCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D62828] inline-block" />
                  {criticalCount} critical
                </span>
              )}
              {searchQuery || hasActiveFilters ? (
                <span className="ml-2 text-[#6B7280]">
                  · {filteredCases.length} of {cases.length} shown
                </span>
              ) : null}
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
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            {
              id: "overdue",
              label: "OVERDUE CHARGESHEETS",
              value: statCounts.overdue,
              bg: "bg-[#FEF2F2]",
              valueColor: "text-[#D62828]",
              dot: "bg-[#D62828]",
              sub: "past due date",
            },
            {
              id: "absconding",
              label: "ACCUSED ABSCONDING",
              value: statCounts.abscondingTotal,
              bg: "bg-[#FFFBEB]",
              valueColor: "text-[#92400E]",
              dot: "bg-[#C85A00]",
              sub: "at large",
            },
            {
              id: "chargesheet_pending",
              label: "CHARGESHEET PENDING",
              value: statCounts.chargesheetPending,
              bg: "bg-[#F4F6F9]",
              valueColor: "text-[#1A1A2E]",
              dot: "bg-[#1A1A2E]",
              sub: "not filed",
            },
          ].map((m) => {
            const active = activeStat === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setParam("stat", active ? "" : m.id)}
                className={`relative flex flex-col items-start gap-1 px-4 py-3 text-left transition ${active ? "bg-[#1A1A2E] text-white" : `${m.bg} hover:brightness-[0.98]`}`}
                title={
                  active
                    ? "Click to clear filter"
                    : `Filter to ${m.label.toLowerCase()}`
                }
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.1em] ${active ? "text-white/70" : "text-[#6B7280]"}`}
                >
                  {m.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className={`ksp-mono text-[26px] font-black leading-none tabular-nums ${active ? "text-white" : m.valueColor}`}
                  >
                    {m.value ?? 0}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : m.dot} ${m.value > 0 ? "animate-pulse" : "opacity-30"}`}
                  />
                  <span
                    className={`text-[11px] font-medium ${active ? "text-white/60" : "text-[#6B7280]"}`}
                  >
                    {m.sub}
                  </span>
                </span>
                {m.value > 0 && !active && (
                  <span
                    className={`absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wide ${m.valueColor} border bg-white px-1.5 py-0.5`}
                  >
                    Action needed
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
          Priority {sortAscending ? "▲" : "▼"}
        </button>
      </div>

      {/* Action-oriented table — Priority | Case | Why now | Next action | Age */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-[#DDE3EC] bg-white">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                Priority
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                Case
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                Why now
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                Next action
              </th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#374151]">
                Age
              </th>
              <th className="hidden lg:table-cell px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9CA3AF]">
                Station · Head
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
                const diff = getChargesheetDiff(row);
                const isBlocking =
                  (diff !== null && diff < 0) ||
                  why.toLowerCase().includes("absconding") ||
                  why.toLowerCase().includes("overdue");
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
                        className={`inline-flex h-5 items-center justify-center whitespace-nowrap border px-2 text-[10px] font-bold uppercase tracking-[0.08em] ${box.bg} ${box.fg} ${box.border}`}
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
                        {row.CaseStatusName || "Open"} · {row.Gravity || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className="inline-flex border border-[#1A1A2E] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1A1A2E] group-hover:bg-[#1A1A2E] group-hover:text-white transition-colors">
                        {next}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-[13px] text-[#374151] whitespace-nowrap">
                      {row.AgeDays != null
                        ? (() => {
                            const d = Math.floor(Number(row.AgeDays));
                            if (d > 30) {
                              const m = Math.floor(d / 30);
                              return `${m}mo ${d % 30}d`;
                            }
                            return `${d}d`;
                          })()
                        : "—"}
                    </td>
                    <td
                      className="hidden lg:table-cell px-3 py-2.5 align-top text-[11px] text-[#9CA3AF] max-w-[160px] truncate"
                      title={`${row.AssignedOfficer || row.FirstName || "Unassigned"} — ${row.DistrictName || ""}`}
                    >
                      {row.AssignedOfficer || row.FirstName || "Unassigned"}
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
      {/* Floating cross-case bar — minimal, only when 2+ selected */}
      {selected.length >= 2 && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-4 border border-[#1A1A2E] bg-[#1A1A2E] px-4 py-2.5 shadow-lg">
            <span className="text-xs font-medium text-white/90">
              {selected.length} cases selected
            </span>
            <span className="text-white/30">·</span>
            <button
              onClick={handleCrossCase}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-white hover:text-white/80"
            >
              Start Cross-Case Analysis <ArrowRight size={12} />
            </button>
            <button
              onClick={() => setSelected([])}
              className="ml-2 text-white/50 hover:text-white"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
