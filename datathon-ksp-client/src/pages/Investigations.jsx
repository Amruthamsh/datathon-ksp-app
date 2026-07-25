import { useState, useEffect, useMemo } from "react";
import {
  Search,
  ChevronDown,
  MapPin,
  Clock,
  Users,
  X,
  Bot,
  FileText,
  Share2,
  Target,
  Map,
  Activity,
  ShieldAlert,
  AlertCircle,
  Info,
  Loader2,
  ExternalLink,
  Gavel,
  Building,
  UserCheck,
  FilterX,
} from "lucide-react";
import {
  getSummary,
  getInvestigations,
  getFilters,
  getCaseDetails,
  getCaseIntel,
  getSimilarCases,
} from "../api/investigations";
import { useAuth } from "../auth/AuthContext";
import actSectionMeta from "../data/actSectionMetadata.json";

export default function InvestigationsQueue() {
  const { token } = useAuth();

  // --- STATE ---
  const [summary, setSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [filtersData, setFiltersData] = useState(null);

  // Active Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    CaseStatusName: "",
    Gravity: "",
    UnitName: "",
    FirstName: "",
    DistrictName: "",
    CrimeHeadName: "",
  });
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sortAscending, setSortAscending] = useState(false); // Priority sort toggle

  const [selectedCases, setSelectedCases] = useState([]);

  // Drawer-specific state
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseIntel, setCaseIntel] = useState(null);
  const [similarCases, setSimilarCases] = useState([]);

  // Loading flags
  const [loading, setLoading] = useState(true);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Priority weight mapping for sorting & comparison
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

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    loadPage();
  }, []);

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
    } catch (error) {
      console.error("Failed to fetch initial investigation queue:", error);
      setCases([]);
    } finally {
      setLoading(false);
    }
  }

  // --- OPEN DRAWER ---
  async function openCase(caseId, rowPriority) {
    try {
      setDrawerLoading(true);

      setSelectedCase({
        CaseMasterID: caseId,
        Priority: rowPriority,
        isLoading: true,
      });

      const [detailsRes, intelRes, similarRes] = await Promise.all([
        getCaseDetails(token, caseId),
        getCaseIntel(token, caseId),
        getSimilarCases(token, caseId),
      ]);

      const detailsData = detailsRes?.data ?? {};

      setSelectedCase({
        ...detailsData,
        Priority: detailsData.Priority || rowPriority,
      });

      setCaseIntel(intelRes?.data ?? null);

      // Support varied array key responses for similar cases
      const similarData =
        similarRes?.data?.data ??
        similarRes?.data?.cases ??
        (Array.isArray(similarRes?.data) ? similarRes.data : []);
      setSimilarCases(similarData);
    } catch (error) {
      console.error(`Failed to load case details for ID: ${caseId}`, error);
    } finally {
      setDrawerLoading(false);
    }
  }

  const closeDrawer = () => {
    setSelectedCase(null);
    setCaseIntel(null);
    setSimilarCases([]);
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedCases((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  // --- FILTER & SORT LOGIC ---
  const dynamicFilterOptions = useMemo(() => {
    const extractUnique = (key, fallbackKey) => {
      if (filtersData && Array.isArray(filtersData[key])) {
        return filtersData[key];
      }
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

  const filteredCases = useMemo(() => {
    return cases
      .filter((row) => {
        // Text Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesCrimeNo = row.CrimeNo?.toLowerCase().includes(q);
          const matchesStation = (row.Station || row.UnitName)
            ?.toLowerCase()
            .includes(q);
          const matchesDistrict = row.DistrictName?.toLowerCase().includes(q);
          const matchesOfficer = row.FirstName?.toLowerCase().includes(q);
          if (
            !matchesCrimeNo &&
            !matchesStation &&
            !matchesDistrict &&
            !matchesOfficer
          ) {
            return false;
          }
        }

        // Active Dropdown Filters
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

        return true;
      })
      .sort((a, b) => {
        const weightA = getPriorityWeight(a.Priority);
        const weightB = getPriorityWeight(b.Priority);
        return sortAscending ? weightA - weightB : weightB - weightA;
      });
  }, [cases, searchQuery, activeFilters, sortAscending]);

  const handleFilterSelect = (filterKey, value) => {
    setActiveFilters((prev) => ({
      ...prev,
      [filterKey]: prev[filterKey] === value ? "" : value,
    }));
    setOpenDropdown(null);
  };

  const clearFilters = () => {
    setActiveFilters({
      CaseStatusName: "",
      Gravity: "",
      UnitName: "",
      FirstName: "",
      DistrictName: "",
      CrimeHeadName: "",
    });
    setSearchQuery("");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    Object.values(activeFilters).some((val) => val !== "");

  // Helpers
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime())
        ? dateStr
        : date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
    } catch {
      return dateStr;
    }
  };

  const formattedActs = useMemo(() => {
    if (!caseIntel?.acts || !Array.isArray(caseIntel.acts)) return [];
    return caseIntel.acts.map((a) =>
      typeof a === "object" ? `${a.ActID} ${a.SectionID}`.trim() : String(a),
    );
  }, [caseIntel]);

  const actSectionDetails = useMemo(() => {
    if (!caseIntel?.acts || !Array.isArray(caseIntel.acts)) return [];
    return caseIntel.acts.map((a) => {
      const actId = a.ActID;
      const sectionId = a.SectionID;
      const actMeta = actSectionMeta.acts?.[actId];
      const sectionMeta = actMeta?.sections?.[sectionId];
      return {
        actId,
        sectionId,
        actMeta,
        sectionMeta,
      };
    });
  }, [caseIntel]);

  const metrics = summary
    ? [
        { label: "Assigned", value: summary.assigned },
        { label: "Chargesheet Pending", value: summary.chargesheet_pending },
        { label: "Repeat Offenders", value: summary.repeat_offenders },
        { label: "Arrests Pending", value: summary.arrests_pending },
        { label: "Need Review Today", value: summary.review_today },
      ]
    : [];

  // Priority badge with normalized string handling
  const renderPriorityBadge = (priorityRaw) => {
    const priority = String(priorityRaw || "")
      .trim()
      .toUpperCase();

    if (priority.includes("CRITICAL")) {
      return (
        <span className="flex items-center px-2.5 py-1 bg-red-100 text-red-700 font-bold text-xs rounded border border-red-200">
          <ShieldAlert size={12} className="mr-1" /> CRITICAL
        </span>
      );
    }
    if (priority.includes("HIGH")) {
      return (
        <span className="flex items-center px-2.5 py-1 bg-orange-100 text-orange-700 font-bold text-xs rounded border border-orange-200">
          <AlertCircle size={12} className="mr-1" /> HIGH
        </span>
      );
    }
    if (priority.includes("MEDIUM")) {
      return (
        <span className="flex items-center px-2.5 py-1 bg-yellow-100 text-yellow-700 font-bold text-xs rounded border border-yellow-200">
          MEDIUM
        </span>
      );
    }
    return (
      <span className="flex items-center px-2.5 py-1 bg-slate-100 text-slate-600 font-bold text-xs rounded border border-slate-200">
        LOW
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex items-center space-x-2 text-slate-600">
          <Loader2 className="animate-spin" size={24} />
          <span className="font-medium">Loading Investigations Queue...</span>
        </div>
      </div>
    );
  }

  const filterConfig = [
    { label: "Status", key: "CaseStatusName" },
    { label: "Gravity", key: "Gravity" },
    { label: "Station", key: "UnitName" },
    { label: "Officer", key: "FirstName" },
    { label: "District", key: "DistrictName" },
    { label: "Crime Head", key: "CrimeHeadName" },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* MAIN WORKSPACE */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          selectedCase ? "mr-[500px]" : ""
        }`}
      >
        {/* HEADER & METRICS */}
        <div className="p-6 bg-white border-b border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Investigations Queue
              </h1>
              <p className="text-sm text-slate-500">
                Prioritize, review, and execute based on active signals.
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search CR No, station, district..."
                  className="pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm w-72 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex space-x-4 overflow-x-auto pb-2">
            {metrics.map((metric) => (
              <button
                key={metric.label}
                className="flex flex-col items-start p-4 min-w-[140px] rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <span className="text-2xl font-bold text-slate-800">
                  {metric.value ?? 0}
                </span>
                <span className="text-xs font-medium mt-1 text-slate-500">
                  {metric.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between min-h-[56px] relative z-20">
          {selectedCases.length > 0 ? (
            <div className="flex items-center w-full animate-in fade-in slide-in-from-top-2">
              <span className="text-sm font-semibold text-blue-700 mr-6 bg-blue-100 px-2 py-1 rounded">
                {selectedCases.length} Selected
              </span>
              <div className="flex space-x-2">
                <button className="flex items-center px-3 py-1.5 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition">
                  <Activity size={14} className="mr-2 text-slate-500" /> Compare
                </button>
                <button className="flex items-center px-3 py-1.5 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition">
                  <Target size={14} className="mr-2 text-slate-500" /> Common
                  Suspects
                </button>
                <button className="flex items-center px-3 py-1.5 text-sm bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 text-white shadow-sm transition ml-auto">
                  <Bot size={14} className="mr-2" /> Ask AI
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                {filterConfig.map(({ label, key }) => {
                  const options = dynamicFilterOptions[key] || [];
                  const activeVal = activeFilters[key];
                  const isOpen = openDropdown === key;

                  return (
                    <div key={key} className="relative">
                      <button
                        onClick={() => setOpenDropdown(isOpen ? null : key)}
                        className={`flex items-center px-3 py-1.5 text-xs font-medium border rounded transition ${
                          activeVal
                            ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {activeVal ? `${label}: ${activeVal}` : label}
                        <ChevronDown size={12} className="ml-1 opacity-50" />
                      </button>

                      {isOpen && (
                        <div className="absolute left-0 mt-1 w-48 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-30 max-h-56 overflow-y-auto">
                          <button
                            onClick={() => handleFilterSelect(key, "")}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50"
                          >
                            All {label}s
                          </button>
                          {options.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => handleFilterSelect(key, opt)}
                              className={`w-full text-left px-3 py-1.5 text-xs ${
                                activeVal === opt
                                  ? "bg-blue-50 text-blue-600 font-bold"
                                  : "text-slate-700 hover:bg-slate-50"
                              }`}
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
                    className="flex items-center px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition"
                  >
                    <FilterX size={14} className="mr-1" /> Reset
                  </button>
                )}
              </div>

              <div className="flex items-center text-sm">
                <span className="text-slate-500 mr-2 text-xs uppercase tracking-wider font-semibold">
                  Sort:
                </span>
                <button
                  onClick={() => setSortAscending((prev) => !prev)}
                  className="flex items-center font-medium text-slate-800 hover:bg-slate-100 px-2 py-1 rounded"
                >
                  <ShieldAlert size={14} className="mr-1 text-red-500" />{" "}
                  Priority {sortAscending ? "▲" : "▼"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DATA TABLE */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
              <tr>
                <th className="py-3 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Crime No
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Station
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Gravity
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Age
                </th>

              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCases.length > 0 ? (
                filteredCases.map((row) => (
                  <tr
                    key={row.CaseMasterID}
                    onClick={() => openCase(row.CaseMasterID, row.Priority)}
                    className={`cursor-pointer transition-colors ${
                      selectedCase?.CaseMasterID === row.CaseMasterID
                        ? "bg-blue-50/50"
                        : "hover:bg-slate-50"
                    } ${selectedCases.includes(row.CaseMasterID) ? "bg-blue-50/30" : ""}`}
                  >
                    <td
                      className="py-3 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCases.includes(row.CaseMasterID)}
                        onChange={(e) => toggleSelect(row.CaseMasterID, e)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      {renderPriorityBadge(row.Priority)}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {row.CrimeNo}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {row.Station || row.UnitName}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                        {row.CaseStatusName || row.status || "Open"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-700">
                      {row.Gravity || "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {row.AgeDays != null
                        ? (() => {
                            const totalDays = Math.floor(Number(row.AgeDays));
                            if (totalDays > 30) {
                              const months = Math.floor(totalDays / 30);
                              const days = totalDays % 30;
                              return `${months} month${months > 1 ? "s" : "s"}, ${days} day${days !== 1 ? "s" : ""}`;
                            }
                            return `${totalDays}d`;
                          })()
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-slate-400 text-sm"
                  >
                    No investigations match the selected filters or search
                    terms.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIDE DRAWER */}
      {selectedCase && (
        <div className="fixed inset-y-0 right-0 w-[500px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-20 animate-in slide-in-from-right">
          {/* DRAWER HEADER */}
          <div className="p-5 border-b border-slate-200 flex justify-between items-start bg-slate-50">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <h2 className="text-xl font-bold text-slate-900">
                  {selectedCase.CrimeNo || `Case #${selectedCase.CaseMasterID}`}
                </h2>
                {renderPriorityBadge(selectedCase.Priority)}
              </div>
              <p className="text-sm font-medium text-slate-700">
                {formattedActs.length > 0
                  ? formattedActs.join(", ")
                  : selectedCase.CrimeHeadName || "N/A"}
              </p>
              <div className="flex text-xs text-slate-500 mt-2 space-x-3">
                <span className="flex items-center">
                  <MapPin size={12} className="mr-1" />{" "}
                  {selectedCase.UnitName ||
                    selectedCase.DistrictName ||
                    "Unknown Unit"}
                </span>
                <span className="flex items-center">
                  <Clock size={12} className="mr-1" />{" "}
                  {formatDate(selectedCase.CrimeRegisteredDate)}
                </span>
              </div>
            </div>
            <button
              onClick={closeDrawer}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"
            >
              <X size={18} />
            </button>
          </div>

          {drawerLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" size={20} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* CASE SUMMARY (BRIEF FACTS) */}
              {selectedCase.BriefFacts && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center">
                    <FileText size={14} className="mr-1.5 text-blue-600" />
                    Case Summary
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {selectedCase.BriefFacts}
                  </p>
                </div>
              )}

              {/* PRIORITY EXPLANATION */}
              {selectedCase.priority_reasons && selectedCase.priority_reasons.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 relative">
                  <div className="flex items-center text-slate-800 font-bold text-xs uppercase tracking-wider mb-3">
                    <Info size={14} className="mr-1.5 text-slate-500" /> Why{" "}
                    {selectedCase.Priority || "Priority"}?
                  </div>
                  <ul className="space-y-2">
                    {selectedCase.priority_reasons.map((reason, idx) => (
                      <li
                        key={idx}
                        className="flex items-start text-sm text-slate-700"
                      >
                        <span className="text-slate-400 mr-2 mt-0.5">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* CASE DETAILS */}
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center mb-3">
                  <Building size={16} className="text-slate-400 mr-2" />
                  Case Details
                </h3>
                <div className="grid grid-cols-2 gap-y-2 text-xs pl-6">
                  <div>
                    <span className="text-slate-400 block">Crime Group</span>
                    <span className="font-medium text-slate-700">
                      {selectedCase.CrimeGroupName || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Crime Head</span>
                    <span className="font-medium text-slate-700">
                      {selectedCase.CrimeHeadName || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Gravity</span>
                    <span className="font-medium text-slate-700">
                      {selectedCase.Gravity || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">District</span>
                    <span className="font-medium text-slate-700">
                      {selectedCase.DistrictName || "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Incident Date</span>
                    <span className="font-medium text-slate-700">
                      {formatDate(selectedCase.IncidentFromDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">
                      Registration Date
                    </span>
                    <span className="font-medium text-slate-700">
                      {formatDate(selectedCase.CrimeRegisteredDate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* PEOPLE */}
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center mb-3">
                  <Users size={16} className="text-slate-400 mr-2" />
                  People
                </h3>
                <div className="space-y-3 text-sm pl-6 text-slate-700">
                  {/* ACCUSED */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Accused ({caseIntel?.accused_count ?? caseIntel?.accused ?? 0})
                      </span>
                    </div>
                    {caseIntel?.accused && caseIntel.accused.length > 0 ? (
                      <div className="space-y-1">
                        {caseIntel.accused.map((p) => (
                          <div
                            key={p.AccusedMasterID}
                            className="flex items-center justify-between bg-red-50/40 rounded px-2.5 py-1.5"
                          >
                            <span className="font-medium text-slate-800">
                              {p.AccusedName}
                            </span>
                            <span className="text-xs text-slate-500">
                              {p.AgeYear}y · {p.GenderID === "M" ? "Male" : p.GenderID === "F" ? "Female" : p.GenderID}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">None recorded</p>
                    )}
                  </div>

                  {/* VICTIMS */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Victims ({caseIntel?.victim_count ?? caseIntel?.victims ?? 0})
                      </span>
                    </div>
                    {caseIntel?.victims && Array.isArray(caseIntel.victims) && caseIntel.victims.length > 0 ? (
                      <div className="space-y-1">
                        {caseIntel.victims.map((p) => (
                          <div
                            key={p.VictimMasterID}
                            className="flex items-center justify-between bg-blue-50/40 rounded px-2.5 py-1.5"
                          >
                            <span className="font-medium text-slate-800">
                              {p.VictimName}
                              {p.VictimPolice ? (
                                <span className="ml-1.5 px-1 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-semibold">POLICE</span>
                              ) : null}
                            </span>
                            <span className="text-xs text-slate-500">
                              {p.AgeYear}y · {p.GenderID === "M" ? "Male" : p.GenderID === "F" ? "Female" : p.GenderID}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">None recorded</p>
                    )}
                  </div>

                  {selectedCase.FirstName && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-500 flex items-center">
                        <UserCheck size={12} className="mr-1 text-slate-400" />{" "}
                        IO
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedCase.FirstName}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ACTS & SECTIONS */}
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center mb-3">
                  <Gavel size={16} className="text-slate-400 mr-2" />
                  Acts & Sections
                </h3>
                <div className="pl-6 space-y-3">
                  {actSectionDetails.length > 0 ? (
                    actSectionDetails.map((item, i) => (
                      <div
                        key={i}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-800">
                            {item.actMeta?.fullName || item.actId}{" "}
                            <span className="text-slate-400">/</span>{" "}
                            {item.sectionMeta?.title
                              ? `Section ${item.sectionId} — ${item.sectionMeta.title}`
                              : `Section ${item.sectionId}`}
                          </span>
                        </div>

                        {item.sectionMeta?.plain_language && (
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {item.sectionMeta.plain_language}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {item.sectionMeta?.bailable !== undefined && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                item.sectionMeta.bailable
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {item.sectionMeta.bailable
                                ? "Bailable"
                                : "Non-Bailable"}
                            </span>
                          )}
                          {item.sectionMeta?.punishment && (
                            <span className="text-[10px] text-slate-500">
                              {item.sectionMeta.punishment}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 pt-0.5">
                          {(item.sectionMeta?.indiacode_url || item.actMeta?.indiacode_url) && (
                            <a
                              href={item.sectionMeta?.indiacode_url || item.actMeta?.indiacode_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline font-medium flex items-center"
                            >
                              <ExternalLink size={10} className="mr-1" />
                              IndiaCode
                            </a>
                          )}
                          {(item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url) && (
                            <a
                              href={item.sectionMeta?.kanoon_url || item.actMeta?.kanoon_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline font-medium flex items-center"
                            >
                              <ExternalLink size={10} className="mr-1" />
                              Indian Kanoon
                            </a>
                          )}
                        </div>

                        {item.actMeta?.note && (
                          <p className="text-[10px] text-amber-600 italic">
                            {item.actMeta.note}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">
                      No specific acts recorded
                    </p>
                  )}
                </div>
              </div>

              {/* CROSS INVESTIGATION INTEL */}
              {caseIntel?.summary && (
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center mb-2">
                    <Share2 size={16} className="text-slate-400 mr-2" />
                    Cross Investigation Intel
                  </h3>
                  <p className="text-sm text-slate-600 pl-6">
                    {caseIntel.summary}
                  </p>
                </div>
              )}

              {/* SIMILAR CASES BREAKDOWN */}
              <div className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between text-slate-800 font-semibold text-xs uppercase tracking-wider mb-2">
                  <span>Similar Cases ({similarCases.length})</span>
                </div>
                {similarCases.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {similarCases.map((sim) => (
                      <div
                        key={sim.CaseMasterID || sim.CrimeNo}
                        className="text-xs p-3 bg-slate-50 rounded border border-slate-100 space-y-1.5"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">
                            {sim.CrimeNo}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                            {sim.similarity ?? sim.similarity_score ?? "-"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-slate-500">
                          {sim.CrimeHeadName && <span>{sim.CrimeHeadName}</span>}
                          {sim.Gravity && <span>{sim.Gravity}</span>}
                          {sim.DistrictName && <span>{sim.DistrictName}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {sim.shared_accused_count > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">
                              {sim.shared_accused_count} shared accused
                            </span>
                          )}
                          {sim.shared_act_count > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded font-medium">
                              {sim.shared_act_count} shared acts
                            </span>
                          )}
                        </div>
                        {sim.reasons && sim.reasons.length > 0 && (
                          <div className="text-slate-400 text-[10px] leading-tight">
                            {sim.reasons.slice(0, 2).join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No similar cases detected.
                  </p>
                )}
              </div>

              {/* LOCATION & CONTEXT */}
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center mb-2">
                  <Map size={16} className="text-slate-400 mr-2" />
                  Location
                </h3>
                <div className="text-xs text-slate-600 pl-6 space-y-1">
                  <p>
                    <span className="text-slate-400">Station ID:</span>{" "}
                    {selectedCase.PoliceStationID ||
                      selectedCase.UnitName ||
                      "N/A"}
                  </p>
                  <p>
                    <span className="text-slate-400">District:</span>{" "}
                    {selectedCase.DistrictName || "N/A"}
                  </p>
                  {selectedCase.latitude && selectedCase.longitude && (
                    <div className="pt-2">
                      <a
                        href={`https://maps.google.com/?q=${selectedCase.latitude},${selectedCase.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 font-medium hover:underline text-xs"
                      >
                        <ExternalLink size={12} className="mr-1" /> View on Map
                        ({selectedCase.latitude.toFixed(4)},{" "}
                        {selectedCase.longitude.toFixed(4)})
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DRAWER FOOTER */}
          <div className="p-4 border-t border-slate-200 bg-white space-y-3">
            <button className="w-full py-2 bg-slate-100 text-slate-700 font-medium text-sm rounded-md hover:bg-slate-200 transition">
              Deep Dive
            </button>
            <button className="w-full py-2 bg-blue-600 text-white font-medium text-sm rounded-md hover:bg-blue-700 flex justify-center items-center transition shadow-sm">
              <Bot size={16} className="mr-2" /> Ask AI Contextually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
