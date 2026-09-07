import { useState, useEffect, useRef, useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import {
  Search,
  User,
  FileText,
  MapPin,
  Sparkles,
  Users,
  Clock,
  Network,
  AlertTriangle,
  X,
  Loader2,
  GitBranch,
  Eye,
  EyeOff,
  Shield,
  ChevronRight,
  Layers,
  ArrowRight,
  Info,
  ExternalLink,
  Activity,
  TrendingUp,
  Globe,
  MessageSquare,
  Zap,
  Target,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import * as networkApi from "../api/network";

// ── Cytoscape styles — refined for hierarchy & edge clarity
const cyStylesheet = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 8,
      "font-size": "11px",
      "font-weight": "600",
      color: "#334155",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
      "text-background-shape": "roundrectangle",
      width: 44,
      height: 44,
      "border-width": 2.5,
      "border-color": "#fff",
      "shadow-blur": 12,
      "shadow-color": "rgba(15,23,42,0.14)",
      "shadow-opacity": 1,
      "overlay-opacity": 0,
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-color": "#17233C",
      "border-width": 3,
      "shadow-blur": 16,
      "shadow-color": "rgba(217,45,32,0.22)",
    },
  },
  {
    selector: "node.hover-highlight",
    style: {
      "border-color": "#D92D20",
      "border-width": 3,
      "shadow-blur": 18,
      "shadow-color": "rgba(217,45,32,0.28)",
    },
  },
  {
    selector: "node.label-hidden",
    style: {
      "text-opacity": 0,
      "text-background-opacity": 0,
    },
  },
  {
    selector: 'node[type="accused"]',
    style: {
      "background-color": "#f59e0b",
      shape: "ellipse",
      width: 52,
      height: 52,
    },
  },
  {
    selector: 'node[type="case"]',
    style: {
      "background-color": "#ef4444",
      shape: "hexagon",
      width: 38,
      height: 38,
    },
  },
  {
    selector: 'node[type="station"]',
    style: {
      "background-color": "#10b981",
      shape: "round-rectangle",
      width: 46,
      height: 36,
    },
  },
  {
    selector: 'node[type="officer"]',
    style: {
      "background-color": "#3b82f6",
      shape: "rectangle",
      width: 44,
      height: 44,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.8,
      "line-color": "#cbd5e1",
      "target-arrow-color": "#94a3b8",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.9,
      "curve-style": "bezier",
      "control-point-step-size": 28,
      label: "data(label)",
      "font-size": "9px",
      "font-weight": "500",
      "text-rotation": "autorotate",
      "text-margin-y": -10,
      color: "#64748b",
      "text-background-color": "#fff",
      "text-background-opacity": 0.85,
      "text-background-padding": "1px",
      "line-style": "solid",
      "target-distance-from-node": 4,
      "source-distance-from-node": 2,
      opacity: 0.9,
    },
  },
  {
    selector: "edge.hover-highlight",
    style: {
      width: 3.2,
      "line-color": "#17233C",
      "target-arrow-color": "#17233C",
      opacity: 1,
      "z-index": 10,
    },
  },
  {
    selector: "edge.dimmed",
    style: { opacity: 0.18 },
  },
  {
    selector: "node.dimmed",
    style: { opacity: 0.25 },
  },
  {
    selector: 'edge[relType="person"]',
    style: {
      "line-color": "#94a3b8",
      "target-arrow-color": "#94a3b8",
      width: 2.6,
    },
  },
  {
    selector: 'edge[relType="station"]',
    style: {
      "line-color": "#6ee7b7",
      "target-arrow-color": "#059669",
      width: 2,
      "line-style": "solid",
    },
  },
  {
    selector: 'edge[relType="semantic"]',
    style: {
      "line-color": "#a78bfa",
      "target-arrow-color": "#a78bfa",
      "target-arrow-shape": "triangle",
      width: 1.3,
      "line-style": "dashed",
      "line-dash-pattern": [6, 3],
    },
  },
];

function StarRating({ count, total = 5, showTooltip = false }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  return (
    <span
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => showTooltip && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-amber-500 text-[13px] tracking-wide">
        {"★".repeat(count)}
        <span className="text-slate-200">{"★".repeat(total - count)}</span>
      </span>
      <span className="text-[10px] font-bold text-slate-500 tabular-nums">
        {count}/{total}
      </span>
      {showTooltip && hover && (
        <span className="absolute left-0 top-full mt-1.5 z-20 whitespace-nowrap rounded-md bg-[#17233C] px-2.5 py-1.5 text-[11px] font-medium leading-tight text-white shadow-lg">
          {t("networks.tooltip.confidence")}{" "}
          {count === 5
            ? t("networks.tooltip.veryHigh")
            : count === 4
              ? t("networks.tooltip.high")
              : t("networks.tooltip.moderate")}
          <span className="absolute -top-1 left-3 h-2 w-2 rotate-45 bg-[#17233C]" />
        </span>
      )}
    </span>
  );
}
StarRating.propTypes = {
  count: PropTypes.number.isRequired,
  total: PropTypes.number,
  showTooltip: PropTypes.bool,
};

// ── Helpers
function getRiskBadge(firs, stations, districts, t) {
  const score =
    (firs || 0) * 1.2 + (stations || 0) * 1.5 + (districts || 0) * 1.8;
  if (score >= 14 || firs >= 6)
    return {
      label: t ? t("networks.risk.high") : "High",
      tone: "bg-red-50 text-red-700 border-red-200",
      dot: "bg-red-600",
    };
  if (score >= 8 || firs >= 4)
    return {
      label: t ? t("networks.risk.medium") : "Medium",
      tone: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    };
  return {
    label: t ? t("networks.risk.low") : "Low",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  };
}

// ── Main
export default function CriminalNetworks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const outlet = useOutletContext() || {};
  const setNavExpanded = outlet.setNavExpanded;

  const [view, setView] = useState("landing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);
  const graphSearchRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [bridgeIndividuals, setBridgeIndividuals] = useState([]);

  const [personName, setPersonName] = useState(null);
  const [profile, setProfile] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [associates, setAssociates] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeTab, setActiveTab] = useState("graph");
  const [loading, setLoading] = useState(false);

  // Landing UX
  const [activeKpi, setActiveKpi] = useState("bridges");
  const [preview, setPreview] = useState(null); // { type:'person'|'network', data }
  const [timelinePreview, setTimelinePreview] = useState(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const cyRef = useRef(null);
  const [cyZoom, setCyZoom] = useState(1);

  // Auto-collapse left nav on graph view
  useEffect(() => {
    const shouldCollapse = view !== "landing";
    if (setNavExpanded) {
      // small delay to avoid flicker on initial landing
      if (shouldCollapse) setNavExpanded(false);
      else setNavExpanded(true);
    } else {
      // fallback via custom event for DashboardLayout without Outlet context
      window.dispatchEvent(
        new CustomEvent("ksp-nav-expanded", {
          detail: { expanded: !shouldCollapse },
        }),
      );
    }
  }, [view, setNavExpanded]);

  // Also collapse on landing -> expand; but restore on unmount
  useEffect(() => {
    return () => {
      if (setNavExpanded) setNavExpanded(true);
      else
        window.dispatchEvent(
          new CustomEvent("ksp-nav-expanded", { detail: { expanded: true } }),
        );
    };
  }, [setNavExpanded]);

  // Semantic zoom: hide labels when zoomed out
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (cyZoom < 0.55) cy.nodes().addClass("label-hidden");
    else cy.nodes().removeClass("label-hidden");
  }, [cyZoom]);

  // Close dropdown on outside click / esc
  useEffect(() => {
    const onDown = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false);
      if (
        graphSearchRef.current &&
        !graphSearchRef.current.contains(e.target)
      ) {
        // keep separate dropdown; handled via state
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowDropdown(false);
        setPreview(null);
        setTimelinePreview(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [sRes, cRes, bRes] = await Promise.all([
          networkApi.getNetworkSummary(token),
          networkApi.getCommunities(token),
          networkApi.getBridgeIndividuals(token, 12),
        ]);
        setSummary(sRes.data);
        setCommunities(cRes.data || []);
        setBridgeIndividuals(bRes.data || []);
      } catch (e) {
        console.error("Failed to load network data", e);
      }
    })();
  }, [token]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.length >= 2) {
      setSearching(true);
      networkApi
        .searchNetwork(token, val)
        .then((res) => {
          setSearchResults(res.data);
          setShowDropdown(true);
          setSearching(false);
        })
        .catch(() => setSearching(false));
    } else {
      setSearchResults(null);
      setShowDropdown(false);
    }
  };

  const selectPerson = async (name, opts = {}) => {
    setPersonName(name);
    setView("graph");
    setShowDropdown(false);
    setSearchQuery(name);
    setLoading(true);
    setSelectedNode(null);
    setPreview(null);
    if (opts.timeline) setActiveTab("timeline");
    else setActiveTab("graph");
    try {
      const [pRes, gRes, aRes, tRes, anRes] = await Promise.all([
        networkApi.getPersonProfile(token, name),
        networkApi.getPersonGraph(token, name),
        networkApi.getPersonAssociates(token, name),
        networkApi.getPersonTimeline(token, name),
        networkApi.getPersonAnalytics(token, name),
      ]);
      setProfile(pRes.data);
      setGraphData(gRes.data);
      setAssociates(aRes.data || []);
      setTimeline(tRes.data || []);
      setAnalytics(anRes.data);
    } catch (e) {
      console.error("Failed to load person data", e);
    } finally {
      setLoading(false);
    }
  };

  const selectSearchResult = (item) => {
    setSearchQuery(item.label || item.name);
    setShowDropdown(false);
    if (item.type === "person") {
      selectPerson(item.name);
    } else if (item.type === "case") {
      setLoading(true);
      networkApi
        .searchNetwork(token, item.label)
        .then((res) => {
          if (res.data?.people?.length > 0) {
            // open preview drawer instead of immediate jump for stations/cases
            if (res.data.people.length === 1)
              selectPerson(res.data.people[0].name);
            else {
              // show first as preview
              setPreview({
                type: "person",
                data: {
                  name: res.data.people[0].name,
                  fir_count: res.data.people[0].case_count,
                },
              });
            }
          }
        })
        .finally(() => setLoading(false));
    } else if (item.type === "station") {
      setLoading(true);
      networkApi
        .searchNetwork(token, item.label)
        .then((res) => {
          if (res.data?.people?.length > 0) {
            selectPerson(res.data.people[0].name);
          }
        })
        .finally(() => setLoading(false));
    }
  };

  const executeSearch = (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchResults?.people?.length > 0) {
      selectPerson(searchResults.people[0].name);
    }
  };

  const handleNodeClick = (event) => {
    const node = event.target;
    const nType = node.data("type");
    const nLabel = node.data("label");
    const nDetails = node.data("details");
    setSelectedNode({ type: nType, label: nLabel, details: nDetails });

    // highlight path
    const cy = cyRef.current;
    if (cy) {
      cy.elements().removeClass("dimmed hover-highlight");
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).not(node).addClass("dimmed");
      neighborhood.addClass("hover-highlight");
    }
  };

  const clearHighlight = () => {
    const cy = cyRef.current;
    if (cy) cy.elements().removeClass("dimmed hover-highlight");
    setSelectedNode(null);
  };

  const handleLeadClick = (associateName) => {
    selectPerson(associateName);
  };

  const countByType = (graph) => {
    if (!graph) return { accused: 0, cases: 0, stations: 0, officers: 0 };
    const counts = { accused: 0, cases: 0, stations: 0, officers: 0 };
    graph.nodes.forEach((n) => {
      const t2 = n.data.type;
      if (t2 === "accused") counts.accused++;
      else if (t2 === "case") counts.cases++;
      else if (t2 === "station") counts.stations++;
      else if (t2 === "officer") counts.officers++;
    });
    return counts;
  };

  const openPreviewForPerson = (row) => {
    // row from bridgeIndividuals
    setPreview({
      type: "person",
      data: row,
    });
  };
  const openPreviewForNetwork = (net) => {
    setPreview({
      type: "network",
      data: net,
    });
  };

  // KPI derived counts
  const nodeCounts = useMemo(() => {
    const base = { accused: 412, groups: 38, bridges: 17, highRisk: 9 };
    if (summary) {
      base.accused = summary.repeat_offenders || base.accused;
      base.groups = summary.criminal_groups || base.groups;
      base.bridges = summary.bridge_individuals || base.bridges;
      base.highRisk = summary.high_risk_networks || base.highRisk;
    }
    return base;
  }, [summary]);

  // Original palette: bg-red-400 / bg-orange-300 / bg-blue-900/90 + distinct 4th — active = bg-[#1A1A2E]
  const kpiMeta = useMemo(
    () => [
      {
        id: "repeat",
        label: t("networks.stats.repeatOffenders"),
        value: nodeCounts.accused,
        icon: Users,
        desc: t("networks.kpi.descRepeat"),
        sub: t("networks.kpi.subPriority"),
        bg: "bg-red-400",
        valueColor: "text-white",
        dot: "bg-white",
        labelColor: "text-white/85",
        subColor: "text-white/80",
        iconWrap: "bg-white/20 text-white border-white/20",
      },
      {
        id: "groups",
        label: t("networks.stats.criminalGroups"),
        value: nodeCounts.groups,
        icon: Network,
        desc: t("networks.kpi.descGroups"),
        sub: t("networks.kpi.subClusters"),
        bg: "bg-orange-300",
        valueColor: "text-slate-900",
        dot: "bg-slate-800",
        labelColor: "text-slate-800",
        subColor: "text-slate-700",
        iconWrap: "bg-slate-800/10 text-slate-800 border-slate-800/10",
      },
      {
        id: "bridges",
        label: t("networks.stats.bridgeIndividuals"),
        value: nodeCounts.bridges,
        icon: GitBranch,
        desc: t("networks.kpi.descBridges"),
        sub: t("networks.kpi.subConnectors"),
        bg: "bg-blue-900/90",
        valueColor: "text-white",
        dot: "bg-white",
        labelColor: "text-white/85",
        subColor: "text-white/80",
        iconWrap: "bg-white/15 text-white border-white/15",
      },
      {
        id: "highRisk",
        label: t("networks.stats.highRiskNetworks"),
        value: nodeCounts.highRisk,
        icon: AlertTriangle,
        desc: t("networks.kpi.descHighRisk"),
        sub: t("networks.kpi.subCritical"),
        bg: "bg-emerald-600",
        valueColor: "text-white",
        dot: "bg-white",
        labelColor: "text-white/85",
        subColor: "text-white/80",
        iconWrap: "bg-white/20 text-white border-white/20",
      },
    ],
    [nodeCounts, t],
  );

  const activeKpiLabel = useMemo(
    () => kpiMeta.find((k) => k.id === activeKpi)?.label || "",
    [kpiMeta, activeKpi],
  );

  // Filtered views for landing
  const filteredCommunities = useMemo(() => {
    if (activeKpi === "highRisk")
      return communities.filter((c) =>
        String(c.risk).toLowerCase().includes("high"),
      );
    return communities;
  }, [communities, activeKpi]);

  const filteredBridges = useMemo(() => {
    if (activeKpi === "repeat")
      return [...bridgeIndividuals]
        .sort((a, b) => b.fir_count - a.fir_count)
        .slice(0, 8);
    if (activeKpi === "bridges") return bridgeIndividuals;
    if (activeKpi === "highRisk")
      return bridgeIndividuals.filter(
        (b) => b.fir_count >= 4 || b.districts_covered >= 2,
      );
    return bridgeIndividuals.slice(0, 8);
  }, [bridgeIndividuals, activeKpi]);

  if (view === "landing") {
    return (
      <div className="flex flex-col h-full bg-[#F5F7FA] relative overflow-hidden">
        {/* Header — search moved to top right, AI buttons reduced to single FAB */}
        <header className="shrink-0 bg-white border-b border-[#E2E8F0] px-6 lg:px-8 py-5">
          <div className="max-w-[1280px] mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-black tracking-tight text-[#17233C] uppercase">
                    {t("networks.title")}
                  </h1>
                </div>
                <p className="text-[13px] text-[#64748B] mt-1.5 max-w-[560px] leading-relaxed">
                  {t("networks.subtitle")}
                  {t("networks.landing.subtitleSuffix")}
                </p>
              </div>

              {/* Global Search — top right (Image 2) */}
              <form
                onSubmit={executeSearch}
                className="relative w-full lg:w-[440px] shrink-0"
                ref={searchRef}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1">
                    <Search size={10} /> {t("networks.search.globalSearch")}
                  </span>
                  <span className="hidden sm:inline text-[10px] text-[#94A3B8]">
                    {t("networks.search.searchHint")}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t("networks.searchPlaceholder")}
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onFocus={() => searchResults && setShowDropdown(true)}
                    className="w-full pl-10 pr-12 py-3 border border-[#E2E8F0] rounded-xl bg-[#F8FAFC] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#17233C]/10 focus:border-[#17233C] text-[14px] placeholder:text-[#94A3B8] shadow-sm transition"
                  />
                  <Search className="absolute left-3.5 top-[14px] h-[18px] w-[18px] text-[#94A3B8]" />
                  <div className="absolute right-1.5 top-1.5 bottom-1.5 flex items-center">
                    {searching ? (
                      <span className="mr-2">
                        <Loader2 className="h-4 w-4 text-[#94A3B8] animate-spin" />
                      </span>
                    ) : null}
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center h-full rounded-lg bg-[#17233C] hover:bg-[#0f1a2e] text-white px-3 transition"
                      aria-label={t("networks.search.searchAria")}
                    >
                      <Search size={14} />
                    </button>
                  </div>
                </div>

                {showDropdown && searchResults && (
                  <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-40 overflow-hidden">
                    <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F1F5F9]">
                      {searchResults.people?.length > 0 && (
                        <div className="py-2">
                          <p className="px-4 py-1.5 text-[10px] font-bold text-[#64748B] uppercase tracking-[0.12em] flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <User size={11} className="text-amber-500" />{" "}
                              {t("networks.tabs.people")}
                            </span>
                            <span className="text-[10px] font-medium normal-case tracking-normal bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-1.5 py-0">
                              {searchResults.people.length}
                            </span>
                          </p>
                          {searchResults.people.slice(0, 5).map((p, i) => (
                            <button
                              key={i}
                              onClick={() => selectSearchResult(p)}
                              className="w-full px-4 py-2.5 hover:bg-[#F8FAFC] flex items-center gap-3 text-left transition group"
                            >
                              <span className="h-8 w-8 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                                <User size={14} />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-[#17233C] truncate group-hover:text-amber-700">
                                  {p.name}
                                </span>
                                <span className="block text-xs text-[#64748B]">
                                  {t("networks.firs", { count: p.case_count })}{" "}
                                  ·{" "}
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${p.case_count >= 4 ? "bg-red-500" : p.case_count >= 2 ? "bg-amber-500" : "bg-slate-300"}`}
                                    />
                                    {p.case_count >= 4
                                      ? t("networks.risk.high")
                                      : p.case_count >= 2
                                        ? t("networks.risk.medium")
                                        : t("networks.risk.low")}{" "}
                                    {t("networks.preview.risk")}
                                  </span>
                                </span>
                              </span>
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-[#17233C] border border-[#E2E8F0] rounded-full px-2 py-1 group-hover:bg-[#17233C] group-hover:text-white group-hover:border-[#17233C] transition">
                                {t("networks.search.exploreGraph")} <ChevronRight size={12} />
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.cases?.length > 0 && (
                        <div className="py-2">
                          <p className="px-4 py-1.5 text-[10px] font-bold text-[#64748B] uppercase tracking-[0.12em] flex items-center gap-1.5">
                            <FileText size={11} className="text-red-500" />{" "}
                            {t("networks.tabs.cases")}
                          </p>
                          {searchResults.cases.slice(0, 4).map((c, i) => (
                            <button
                              key={i}
                              onClick={() => selectSearchResult(c)}
                              className="w-full px-4 py-2.5 hover:bg-[#F8FAFC] flex items-center gap-3 text-left transition"
                            >
                              <span className="h-8 w-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                                <FileText size={14} />
                              </span>
                              <span className="text-sm font-semibold text-[#17233C] truncate">
                                {c.label}
                              </span>
                              <span className="ml-auto text-[11px] text-[#64748B]">
                                {t("networks.search.firTag")}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.stations?.length > 0 && (
                        <div className="py-2">
                          <p className="px-4 py-1.5 text-[10px] font-bold text-[#64748B] uppercase tracking-[0.12em] flex items-center gap-1.5">
                            <MapPin size={11} className="text-emerald-500" />{" "}
                            {t("networks.tabs.stations")}
                          </p>
                          {searchResults.stations.slice(0, 4).map((s, i) => (
                            <button
                              key={i}
                              onClick={() => selectSearchResult(s)}
                              className="w-full px-4 py-2.5 hover:bg-[#F8FAFC] flex items-center gap-3 text-left transition"
                            >
                              <span className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                <MapPin size={14} />
                              </span>
                              <span className="text-sm font-semibold text-[#17233C] truncate">
                                {s.label}
                              </span>
                              <span className="ml-auto text-[11px] text-[#64748B]">
                                {t("networks.search.stationTag")}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!searchResults.people?.length &&
                        !searchResults.cases?.length &&
                        !searchResults.stations?.length && (
                          <div className="px-4 py-8 text-center">
                            <p className="text-sm font-medium text-[#475569]">
                              {t("networks.search.noMatches")}
                            </p>
                            <p className="text-xs text-[#94A3B8] mt-1">
                              {t("networks.search.tryDifferent")}
                            </p>
                          </div>
                        )}
                    </div>
                    <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-3 py-2 flex items-center justify-between">
                      <span className="text-[10px] text-[#64748B] flex items-center gap-1">
                        <Info size={11} /> {t("networks.search.tipExplore")}
                      </span>
                      <button
                        onClick={() => setShowDropdown(false)}
                        className="text-[11px] font-semibold text-[#64748B] hover:text-[#17233C] px-2 py-1 rounded-md hover:bg-white border border-transparent hover:border-[#E2E8F0] transition"
                      >
                        {t("networks.search.dismiss")}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto px-6 lg:px-8 py-6 space-y-6">
            {/* KPI Cards → Interactive Tabs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1.5">
                  <Activity size={12} className="text-[#17233C]" /> {t("networks.kpi.overview")}
                </p>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2 py-1">
                    <Filter size={10} /> {t("networks.kpi.active")}{" "}
                    <span className="font-bold text-[#17233C]">
                      {activeKpiLabel}
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      navigate("/", {
                        state: {
                          initialMessage: `Analyze overall criminal network intelligence: ${nodeCounts.accused} repeat offenders, ${nodeCounts.groups} criminal groups, ${nodeCounts.bridges} bridge individuals, ${nodeCounts.highRisk} high risk networks. What are the key patterns, risk areas, and recommended investigation priorities?`,
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#17233C] hover:bg-[#0f1a2e] text-white text-[11px] font-bold px-3 py-1.5 shadow-sm transition"
                    title={t("networks.fab.title")}
                  >
                    <Sparkles size={12} />
                    {t("networks.fab.label")}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {kpiMeta.map((k) => {
                  const Icon = k.icon;
                  const active = activeKpi === k.id;
                  return (
                    <button
                      key={k.id}
                      onClick={() => setActiveKpi(k.id)}
                      className={`relative text-left rounded-sm px-4 py-3 flex flex-col gap-1 border transition ${active ? "bg-[#1A1A2E] text-white border-[#1A1A2E]" : `${k.bg} hover:brightness-[0.98] border-transparent`} `}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-[0.1em] ${active ? "text-white/70" : k.labelColor}`}
                      >
                        {k.label}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span
                          className={`ksp-mono text-[26px] font-black leading-none tabular-nums ${active ? "text-white" : k.valueColor}`}
                        >
                          {k.value}
                        </span>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : k.dot} ${k.value > 0 ? "animate-pulse" : "opacity-90"}`}
                        />
                        <span
                          className={`text-[11px] font-medium ${active ? "text-white/60" : k.subColor}`}
                        >
                          {k.sub}
                        </span>
                      </span>
                      <span
                        className={`mt-1 flex items-center gap-1.5 text-[11px] ${active ? "text-white/60" : k.subColor === "text-white/80" ? "text-white/75" : "text-slate-600"}`}
                      >
                        <span
                          className={`h-7 w-7 rounded-lg flex items-center justify-center border shrink-0 ${active ? "bg-white/10 text-white border-white/20" : k.iconWrap}`}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="truncate">{k.desc}</span>
                      </span>
                      {k.value > 0 && !active && (
                        <span className="absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wide bg-white border border-white px-1.5 py-0.5 text-[#DC2626]">
                          {t("networks.kpi.actionNeeded")}
                        </span>
                      )}
                      {active && (
                        <span className="absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wide bg-white text-[#1A1A2E] px-1.5 py-0.5">
                          {t("networks.kpi.selected")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bridge Individuals — now context-aware table with badges & row actions */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-[#E2E8F0] bg-[#FAFBFC]">
                <div>
                  <h2 className="text-[13px] font-bold tracking-tight text-[#17233C] flex items-center gap-2">
                    <GitBranch size={14} className="text-purple-600" />
                    {activeKpi === "repeat"
                      ? t("networks.landing.repeatTop")
                      : activeKpi === "highRisk"
                        ? t("networks.landing.highRiskInd")
                        : t("networks.bridgeIndividuals")}
                    <span className="inline-flex items-center rounded-full bg-white border border-[#E2E8F0] px-2 py-0.5 text-[11px] font-bold text-[#475569] tabular-nums">
                      {filteredBridges.length}
                    </span>
                  </h2>
                  <p className="text-xs text-[#64748B] mt-1">
                    {activeKpi === "bridges"
                      ? t("networks.landing.descBridges")
                      : activeKpi === "repeat"
                        ? t("networks.landing.descRepeat")
                        : activeKpi === "highRisk"
                          ? t("networks.landing.descHighRisk")
                          : t("networks.landing.descViewing", {
                              label: activeKpiLabel.toLowerCase(),
                            })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1">
                    <Shield size={10} /> {t("networks.landing.riskBadges")}
                  </span>
                </div>
              </div>

              {filteredBridges.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] font-bold tracking-[0.08em] uppercase text-[#64748B]">
                        <th className="text-left px-5 py-3 font-bold">
                          {t("networks.table.name")}
                        </th>
                        <th className="text-right px-4 py-3 font-bold">
                          {t("networks.landing.riskCol")}
                        </th>
                        <th className="text-right px-4 py-3 font-bold">
                          {t("networks.columns.firs")}
                        </th>
                        <th className="text-right px-4 py-3 font-bold">
                          {t("networks.table.associates")}
                        </th>
                        <th className="text-right px-4 py-3 font-bold">
                          {t("networks.columns.stations")}
                        </th>
                        <th className="text-right px-4 py-3 font-bold">
                          {t("networks.table.districts")}
                        </th>
                        <th className="text-right px-5 py-3 font-bold w-[190px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {filteredBridges.map((b, i) => {
                        const badge = getRiskBadge(
                          b.fir_count,
                          b.stations_covered,
                          b.districts_covered,
                          t,
                        );
                        return (
                          <tr
                            key={i}
                            onClick={() => openPreviewForPerson(b)}
                            className="group hover:bg-[#FFFBEB]/70 cursor-pointer transition-colors"
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <span className="h-8 w-8 rounded-full bg-blue-900/90 text-white flex items-center justify-center text-xs font-bold shrink-0">
                                  {b.name.charAt(0)}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-blue-950 leading-none truncate">
                                    {b.name}
                                  </p>
                                  <p className="text-[11px] text-[#64748B] mt-0.5 hidden sm:block">
                                    {t("networks.landing.clickForPreview")}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${badge.tone}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${badge.dot}`}
                                />{" "}
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-blue-950">
                              {b.fir_count}
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums text-blue-900/70">
                              {b.unique_associates}
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums text-blue-900/70">
                              {b.stations_covered}
                            </td>
                            <td className="px-4 py-3.5 text-right tabular-nums text-blue-900/70">
                              {b.districts_covered}
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-blue-900/90 border border-blue-900/90 text-white text-xs font-semibold min-w-[152px] px-6 py-2.5 transition shadow-sm group-hover:bg-blue-900 group-hover:border-blue-900">
                                {t("networks.search.exploreGraph")}{" "}
                                <ChevronRight
                                  size={12}
                                  className="group-hover:translate-x-0.5 transition-transform shrink-0"
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto h-10 w-10 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center text-[#94A3B8]">
                    <Users size={18} />
                  </div>
                  <p className="text-sm font-semibold text-[#334155] mt-3">
                    {t("networks.landing.noIndividuals")}
                  </p>
                  <p className="text-xs text-[#64748B] mt-1">
                    {t("networks.landing.switchKpi")}
                  </p>
                </div>
              )}

              <div className="px-5 py-3 bg-[#FAFBFC] border-t border-[#E2E8F0] flex items-center justify-between">
                <span className="text-[11px] text-[#64748B] flex items-center gap-1.5">
                  <Info size={12} /> {t("networks.landing.rowHint")}
                </span>
                <span className="text-[11px] font-medium text-[#94A3B8] hidden sm:block">
                  {t("networks.landing.hoverHint")}
                </span>
              </div>
            </div>

            {/* Top Networks — grid with explicit actions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1.5">
                  <Network size={12} className="text-[#17233C]" />{" "}
                  {t("networks.topNetworks")} —{" "}
                  {activeKpi === "highRisk"
                    ? t("networks.landing.highRiskOnly")
                    : t("networks.landing.filteredView")}
                </h2>
                <span className="text-[11px] text-[#94A3B8]">
                  {t("networks.landing.networksCount", {
                    count: filteredCommunities.length,
                  })}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCommunities.slice(0, 6).map((net, i) => {
                  const riskTone =
                    net.risk === "Very High"
                      ? "bg-red-100 text-red-700 border-red-200"
                      : net.risk === "High"
                        ? "bg-amber-100 text-amber-700 border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200";
                  return (
                    <div
                      key={i}
                      onClick={() => openPreviewForNetwork(net)}
                      className="group bg-white border border-[#E2E8F0] rounded-xl p-4 text-left hover:border-[#17233C]/20 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="font-bold text-[#17233C] text-[13.5px] leading-snug line-clamp-2">
                          {net.members?.slice(0, 3).join(", ")}
                          {net.member_count > 3 ? "…" : ""}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskTone}`}
                        >
                          {net.risk}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1 text-[11px] font-semibold text-[#475569]">
                          <Users size={11} /> {t("networks.landing.membersUnit", { count: net.member_count })}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1 text-[11px] font-semibold text-[#475569]">
                          <FileText size={11} /> {t("networks.landing.firsUnit", { count: net.total_firs })}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1 text-[11px] font-semibold text-[#475569]">
                          <MapPin size={11} /> {t("networks.landing.stationsUnit", { count: net.stations_covered })}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[#94A3B8] group-hover:text-[#475569] transition">
                          {t("networks.landing.clickPreview")}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#17233C] text-white text-[11px] font-semibold px-3 py-1.5 opacity-90 group-hover:opacity-100 transition">
                          {t("networks.landing.previewBtn")} <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filteredCommunities.length === 0 && (
                  <div className="col-span-full bg-white border border-dashed border-[#E2E8F0] rounded-xl p-8 text-center">
                    <p className="text-sm font-medium text-[#475569]">
                      {t("networks.landing.noNetworksFilter")}
                    </p>
                    <button
                      onClick={() => setActiveKpi("bridges")}
                      className="mt-2 text-xs font-semibold text-[#17233C] underline underline-offset-4"
                    >
                      {t("networks.landing.showBridges")}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer helper */}
            <div className="pb-6" />
          </div>
        </div>

        {/* Slide-over Preview Drawer */}
        {preview && (
          <div className="absolute inset-0 z-30 flex justify-end">
            <div
              className="absolute inset-0 bg-[#0F172A]/30 backdrop-blur-[2px]"
              onClick={() => setPreview(null)}
            />
            <div className="relative w-full max-w-[420px] bg-white border-l border-[#E2E8F0] shadow-2xl flex flex-col h-full animate-[slideIn_0.22s_ease]">
              <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1.5">
                    {preview.type === "person" ? (
                      <User size={11} />
                    ) : (
                      <Network size={11} />
                    )}
                    {preview.type === "person"
                      ? t("networks.preview.person")
                      : t("networks.preview.network")}
                    <span className="h-1 w-1 rounded-full bg-[#CBD5E1]" />
                    {activeKpiLabel}
                  </p>
                  <h3 className="text-[16px] font-black tracking-tight text-[#17233C] mt-1 leading-tight truncate">
                    {preview.type === "person"
                      ? preview.data.name
                      : preview.data.members?.slice(0, 3).join(", ")}
                  </h3>
                  <p className="text-xs text-[#64748B] mt-1">
                    {preview.type === "person"
                      ? t("networks.preview.personSummary", {
                          firs: preview.data.fir_count,
                          associates: preview.data.unique_associates ?? "—",
                          stations: preview.data.stations_covered ?? "—",
                        })
                      : t("networks.preview.networkSummary", {
                          members: preview.data.member_count,
                          firs: preview.data.total_firs,
                          risk: preview.data.risk,
                        })}
                  </p>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  className="h-8 w-8 rounded-full border border-[#E2E8F0] bg-white flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#17233C] transition shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {preview.type === "person" ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                        <p className="text-[10px] font-bold tracking-wide uppercase text-[#64748B]">
                          {t("networks.preview.firs")}
                        </p>
                        <p className="text-[20px] font-black text-[#17233C] tabular-nums">
                          {preview.data.fir_count}
                        </p>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                        <p className="text-[10px] font-bold tracking-wide uppercase text-[#64748B]">
                          {t("networks.preview.associates")}
                        </p>
                        <p className="text-[20px] font-black text-[#17233C] tabular-nums">
                          {preview.data.unique_associates ?? "—"}
                        </p>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                        <p className="text-[10px] font-bold tracking-wide uppercase text-[#64748B]">
                          {t("networks.preview.districts")}
                        </p>
                        <p className="text-[20px] font-black text-[#17233C] tabular-nums">
                          {preview.data.districts_covered ?? "—"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                      <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#64748B] flex items-center gap-1.5">
                        <TrendingUp size={12} /> {t("networks.preview.riskSignals")}
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#475569]">
                            {t("networks.preview.stationsCovered")}
                          </span>
                          <span className="text-xs font-bold tabular-nums">
                            {preview.data.stations_covered}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#17233C] rounded-full"
                            style={{
                              width: `${Math.min(100, (preview.data.stations_covered / 6) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs font-medium text-[#475569]">
                            {t("networks.preview.crossDistrict")}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${preview.data.districts_covered > 1 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}
                          >
                            {preview.data.districts_covered > 1
                              ? t("networks.preview.bridgeIndividual")
                              : t("networks.preview.localized")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                      <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                        <Zap size={12} /> {t("networks.preview.investigationLead")}
                      </p>
                      <p className="text-xs text-[#92400E] leading-relaxed mt-1">
                        {t("networks.preview.leadDetail", {
                          kind:
                            preview.data.districts_covered > 1
                              ? t("networks.preview.actorBridge")
                              : t("networks.preview.actorRepeat"),
                          count: preview.data.unique_associates ?? 0,
                        })}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                        <p className="text-[10px] font-bold uppercase text-[#64748B]">
                          {t("networks.preview.members")}
                        </p>
                        <p className="text-xl font-black text-[#17233C]">
                          {preview.data.member_count}
                        </p>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                        <p className="text-[10px] font-bold uppercase text-[#64748B]">
                          {t("networks.preview.firs")}
                        </p>
                        <p className="text-xl font-black text-[#17233C]">
                          {preview.data.total_firs}
                        </p>
                      </div>
                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                        <p className="text-[10px] font-bold uppercase text-[#64748B]">
                          {t("networks.preview.risk")}
                        </p>
                        <p className="text-xs font-black mt-1">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[10px] ${preview.data.risk === "Very High" ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
                          >
                            {preview.data.risk}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-wide uppercase text-[#64748B] mb-2">
                        {t("networks.preview.members")}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.data.members?.slice(0, 8).map((m, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1 text-xs font-medium text-[#334155]"
                          >
                            <User size={11} className="text-[#94A3B8]" /> {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 border-t border-[#E2E8F0] bg-[#FAFBFC] space-y-2">
                <button
                  onClick={() => {
                    if (preview.type === "person")
                      selectPerson(preview.data.name);
                    else if (preview.data.members?.[0])
                      selectPerson(preview.data.members[0]);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#17233C] hover:bg-[#0f1a2e] text-white text-sm font-semibold py-3 shadow-sm transition"
                >
                  <Network size={14} /> {t("networks.preview.openGraph")}{" "}
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => {
                    if (preview.type === "person")
                      selectPerson(preview.data.name, { timeline: true });
                    else if (preview.data.members?.[0])
                      selectPerson(preview.data.members[0], { timeline: true });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#334155] text-sm font-semibold py-3 transition"
                >
                  <Clock size={14} /> {t("networks.preview.viewTimeline")}{" "}
                  <ChevronRight size={14} className="text-[#94A3B8]" />
                </button>
                <p className="text-[10px] text-center text-[#94A3B8]">
                  {t("networks.preview.previewHint")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const counts = countByType(graphData);

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA]">
      {/* Top bar — breadcrumb + search + locked view toggle */}
      <header className="shrink-0 h-[64px] bg-white border-b border-[#E2E8F0] px-4 lg:px-6 flex items-center gap-3">
        {/* Breadcrumb */}
        <nav className="hidden lg:flex items-center gap-1.5 text-xs shrink-0">
          <button
            onClick={() => {
              setView("landing");
              setPersonName(null);
              setGraphData(null);
            }}
            className="font-semibold text-[#64748B] hover:text-[#17233C] transition"
          >
            {t("networks.canvas.breadcrumb")}
          </button>
          <ChevronRight size={12} className="text-[#CBD5E1]" />
          <button
            onClick={() => {
              setView("landing");
              setPersonName(null);
              setGraphData(null);
            }}
            className="font-semibold text-[#64748B] hover:text-[#17233C] transition"
          >
            {activeKpiLabel}
          </button>
          {personName && (
            <>
              <ChevronRight size={12} className="text-[#CBD5E1]" />
              <span className="font-bold text-[#17233C] flex items-center gap-1.5">
                <span className="h-6 w-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">
                  {personName.charAt(0)}
                </span>
                {personName}
              </span>
            </>
          )}
        </nav>

        {/* Mobile back */}
        <button
          onClick={() => {
            setView("landing");
            setPersonName(null);
            setGraphData(null);
          }}
          className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-[#475569] hover:text-[#17233C] shrink-0"
        >
          ← {t("networks.back")}
        </button>

        <div className="h-6 w-px bg-[#E2E8F0] hidden lg:block" />

        {/* Global Search — clearly distinguished from Chat */}
        <form
          onSubmit={executeSearch}
          className="relative flex-1 max-w-[520px]"
          ref={graphSearchRef}
        >
          <label className="block text-[9px] font-bold tracking-[0.12em] uppercase text-[#94A3B8] leading-none mb-1">
            {t("networks.search.jumpToProfile")}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={t("networks.search.graphPlaceholder")}
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchResults && setShowDropdown(true)}
              className="w-full pl-8 pr-8 py-2 border border-[#E2E8F0] rounded-full bg-[#F8FAFC] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#17233C]/10 focus:border-[#17233C] text-[13px] placeholder:text-[#94A3B8] transition"
            />
            <Search className="absolute left-2.5 top-[9px] h-3.5 w-3.5 text-[#94A3B8]" />
            {searching && (
              <Loader2 className="absolute right-2.5 top-[9px] h-3.5 w-3.5 text-[#94A3B8] animate-spin" />
            )}
          </div>
          {showDropdown && searchResults && (
            <div className="absolute top-full left-0 w-full mt-2 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="max-h-[300px] overflow-y-auto divide-y divide-[#F1F5F9]">
                {searchResults.people?.slice(0, 3).map((p, i) => (
                  <button
                    key={i}
                    onClick={() => selectSearchResult(p)}
                    className="w-full px-3 py-2.5 hover:bg-[#F8FAFC] flex items-center gap-2 text-left"
                  >
                    <User size={14} className="text-amber-500 shrink-0" />
                    <span className="text-[13px] font-semibold text-[#17233C] truncate">
                      {p.name}
                    </span>
                    <span className="ml-auto text-[11px] font-medium text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-1.5 py-0.5">
                      {t("networks.firs", { count: p.case_count })}
                    </span>
                  </button>
                ))}
                {searchResults.cases?.slice(0, 2).map((c, i) => (
                  <button
                    key={i}
                    onClick={() => selectSearchResult(c)}
                    className="w-full px-3 py-2.5 hover:bg-[#F8FAFC] flex items-center gap-2 text-left"
                  >
                    <FileText size={14} className="text-red-500" />{" "}
                    <span className="text-xs font-medium truncate">
                      {c.label}
                    </span>
                  </button>
                ))}
                {searchResults.stations?.slice(0, 2).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectSearchResult(s)}
                    className="w-full px-3 py-2.5 hover:bg-[#F8FAFC] flex items-center gap-2 text-left"
                  >
                    <MapPin size={14} className="text-emerald-500" />{" "}
                    <span className="text-xs font-medium truncate">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-between">
                <span className="text-[10px] text-[#64748B]">
                  {t("networks.search.enterEsc")}
                </span>
                <button
                  onClick={() => setShowDropdown(false)}
                  className="text-[11px] font-semibold text-[#64748B] hover:text-[#17233C]"
                >
                  {t("networks.search.close")}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Locked Top View Toggle — pill switcher */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-full border border-[#E2E8F0]">
            <button
              onClick={() => setActiveTab("graph")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition ${activeTab === "graph" ? "bg-[#17233C] text-white shadow-sm" : "text-[#64748B] hover:text-[#334155]"}`}
            >
              <Network size={12} /> {t("networks.graph")}
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold tracking-wide transition ${activeTab === "timeline" ? "bg-[#17233C] text-white shadow-sm" : "text-[#64748B] hover:text-[#334155]"}`}
            >
              <Clock size={12} /> {t("networks.timeline")}
            </button>
          </div>
          {/* Mobile select */}
          <div className="sm:hidden flex items-center gap-1">
            <button
              onClick={() => setActiveTab("graph")}
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${activeTab === "graph" ? "bg-[#17233C] text-white" : "bg-white border border-[#E2E8F0] text-[#475569]"}`}
            >
              {t("networks.graph")}
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${activeTab === "timeline" ? "bg-[#17233C] text-white" : "bg-white border border-[#E2E8F0] text-[#475569]"}`}
            >
              {t("networks.timeline")}
            </button>
          </div>

          <button
            onClick={clearHighlight}
            title={t("networks.canvas.clearHighlightTitle")}
            className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#17233C] transition"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 relative bg-[#EEF2F7] overflow-hidden flex flex-col">
          {loading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] z-30 flex items-center justify-center">
              <div className="bg-white border border-[#E2E8F0] rounded-xl px-5 py-4 shadow-sm flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-[#17233C] animate-spin" />
                <span className="text-sm font-semibold text-[#334155]">
                  {t("networks.canvas.loading")}
                </span>
              </div>
            </div>
          )}

          {activeTab === "graph" ? (
            <>
              {/* Legend — docked bottom-left, semi-transparent, collapsible */}
              {graphData && !legendCollapsed && (
                <div className="absolute bottom-4 left-4 z-20">
                  <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-[0_4px_16px_rgba(15,23,42,0.08)] border border-[#E2E8F0]/80 overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#F1F5F9]">
                      <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1.5">
                        <Layers size={11} /> {t("networks.canvas.legendTitle")}
                      </p>
                      <button
                        onClick={() => setLegendCollapsed(true)}
                        className="h-6 w-6 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center text-[#94A3B8] hover:text-[#475569] transition"
                        title={t("networks.canvas.collapseLegend")}
                      >
                        <EyeOff size={12} />
                      </button>
                    </div>
                    <div className="px-3.5 py-3 flex gap-5">
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#94A3B8]">
                          {t("networks.canvas.nodes")}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-sm ring-1 ring-white shrink-0" />
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.accused")}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-1.5 py-0">
                            {counts.accused}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-[3px] bg-red-500 shadow-sm ring-1 ring-white shrink-0 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 bg-white rotate-45" />
                          </span>
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.firCase")}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-1.5 py-0">
                            {counts.cases}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3 bg-emerald-500 rounded-[3px] ring-1 ring-white shrink-0" />
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.station")}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-1.5 py-0">
                            {counts.stations}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3 bg-blue-500 rounded-[2px] ring-1 ring-white shrink-0" />
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.officer")}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-1.5 py-0">
                            {counts.officers}
                          </span>
                        </div>
                      </div>
                      <div className="w-px bg-[#F1F5F9]" />
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-bold tracking-[0.1em] uppercase text-[#94A3B8]">
                          {t("networks.canvas.edgesHint")}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-0 border-t-[2.5px] border-[#94A3B8] rounded-full relative">
                            <span className="absolute -right-1 -top-[4px] w-0 h-0 border-l-[5px] border-l-[#94A3B8] border-y-[4px] border-y-transparent" />
                          </span>
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.personLink")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-0 border-t-2 border-emerald-300 rounded-full relative">
                            <span className="absolute -right-1 -top-[4px] w-0 h-0 border-l-[5px] border-l-emerald-400 border-y-[4px] border-y-transparent" />
                          </span>
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.stationLink")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-0 border-t-[1.5px] border-dashed border-purple-400 rounded-full" />
                          <span className="text-[11px] font-medium text-[#334155]">
                            {t("networks.canvas.semantic")}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#94A3B8] leading-tight pt-1">
                          {t("networks.canvas.zoomLabelsHide")}
                          <br />
                          {t("networks.canvas.clickNode")}
                        </p>
                      </div>
                    </div>
                    <div className="px-3 pb-2 flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const cy = cyRef.current;
                          if (cy) cy.fit(undefined, 40);
                        }}
                        className="text-[10px] font-semibold text-[#475569] hover:text-[#17233C] bg-[#F8FAFC] hover:bg-white border border-[#E2E8F0] rounded-full px-2.5 py-1 transition"
                      >
                        {t("networks.canvas.fitView")}
                      </button>
                      <span className="text-[10px] text-[#94A3B8]">
                        {t("networks.canvas.scrollZoom")}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {graphData && legendCollapsed && (
                <button
                  onClick={() => setLegendCollapsed(false)}
                  className="absolute bottom-4 left-4 z-20 bg-white/90 backdrop-blur border border-[#E2E8F0] rounded-full px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-white flex items-center gap-1.5 shadow-sm transition"
                  style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }}
                >
                  <Eye size={12} /> {t("networks.canvas.legend")}
                </button>
              )}

              {/* Zoom indicator */}
              {graphData && (
                <div className="absolute top-3 left-3 z-10 hidden lg:flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-full border border-[#E2E8F0] px-2.5 py-1 shadow-sm">
                  <Globe size={10} className="text-[#64748B]" />
                  <span className="text-[10px] font-bold tracking-wide text-[#475569] tabular-nums">
                    {t("networks.canvas.zoom", { count: Math.round(cyZoom * 100) })}
                  </span>
                  <span className="h-3 w-px bg-[#E2E8F0]" />
                  <span className="text-[10px] text-[#94A3B8]">
                    {cyZoom < 0.55
                      ? t("networks.canvas.labelsHidden")
                      : t("networks.canvas.labelsVisible")}
                  </span>
                </div>
              )}

              {graphData ? (
                <CytoscapeComponent
                  elements={[...graphData.nodes, ...graphData.edges]}
                  stylesheet={cyStylesheet}
                  layout={{
                    name: "cose",
                    idealEdgeLength: 110,
                    nodeOverlap: 22,
                    refresh: 20,
                    fit: true,
                    padding: 48,
                    randomize: false,
                    componentSpacing: 120,
                    nodeRepulsion: 520000,
                    edgeElasticity: 100,
                    nestingFactor: 1.2,
                    gravity: 0.22,
                  }}
                  style={{ width: "100%", height: "100%" }}
                  cy={(cy) => {
                    cyRef.current = cy;
                    // bind events once
                    cy.removeListener("tap");
                    cy.removeListener("mouseover");
                    cy.removeListener("mouseout");
                    cy.removeListener("zoom");

                    cy.on("tap", "node", handleNodeClick);
                    cy.on("tap", (e) => {
                      if (e.target === cy) clearHighlight();
                    });
                    cy.on("mouseover", "node", (e) => {
                      e.target.addClass("hover-highlight");
                      // dim others subtly
                      const neighborhood = e.target.closedNeighborhood();
                      cy.elements()
                        .not(neighborhood)
                        .not(e.target)
                        .addClass("dimmed");
                    });
                    cy.on("mouseout", "node", (e) => {
                      e.target.removeClass("hover-highlight");
                      if (!selectedNode) cy.elements().removeClass("dimmed");
                    });
                    cy.on("mouseover", "edge", (e) => {
                      e.target.addClass("hover-highlight");
                      setHoveredEdge(e.target.data("label") || e.target.id());
                    });
                    cy.on("mouseout", "edge", (e) => {
                      e.target.removeClass("hover-highlight");
                      setHoveredEdge(null);
                    });
                    cy.on("zoom", () => setCyZoom(cy.zoom()));
                    // initial fit
                    setTimeout(() => setCyZoom(cy.zoom()), 300);
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-8">
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center max-w-[420px] shadow-sm">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center text-[#64748B]">
                      <Network size={20} />
                    </div>
                    <p className="text-sm font-bold text-[#17233C] mt-3">
                      {t("networks.canvas.emptyTitle")}
                    </p>
                    <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                      {t("networks.canvas.emptyDesc")}
                    </p>
                    <button
                      onClick={() => {
                        setView("landing");
                      }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#17233C] text-white text-xs font-semibold px-4 py-2 hover:bg-[#0f1a2e] transition"
                    >
                      {t("networks.canvas.backLanding")}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
              <div className="max-w-[760px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1.5">
                    <Clock size={12} /> {t("networks.timeline")}{" "}
                    {t("networks.canvas.timelineSuffix")}
                  </h3>
                  {timeline.length > 0 && (
                    <span className="text-[11px] font-medium text-[#94A3B8] bg-white border border-[#E2E8F0] rounded-full px-2 py-0.5">
                      {t("networks.canvas.eventsCount", { count: timeline.length })}
                    </span>
                  )}
                </div>
                {timeline.length > 0 ? (
                  <div className="relative pl-6 border-l-2 border-[#E2E8F0] space-y-3">
                    {timeline.map((evt, i) => (
                      <button
                        key={i}
                        onClick={() => setTimelinePreview(evt)}
                        className="relative w-full text-left bg-white border border-[#E2E8F0] rounded-xl p-4 hover:border-[#17233C]/20 hover:shadow-md transition-all group"
                      >
                        <span
                          className={`absolute -left-[25px] top-5 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                            evt.type === "FIR"
                              ? "bg-red-500"
                              : evt.type === "Arrest"
                                ? "bg-amber-500"
                                : "bg-blue-500"
                          }`}
                        />
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold tracking-wide text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2 py-0.5">
                            {evt.date}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              evt.type === "FIR"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : evt.type === "Arrest"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            {evt.type}
                          </span>
                          <span className="ml-auto text-[11px] font-semibold text-[#94A3B8] group-hover:text-[#17233C] flex items-center gap-1">
                            {t("networks.canvas.previewLink")} <ExternalLink size={10} />
                          </span>
                        </div>
                        <p className="text-[13.5px] font-bold text-[#17233C] leading-snug">
                          {evt.title}
                        </p>
                        {evt.detail && (
                          <p className="text-xs text-[#475569] mt-1 leading-relaxed line-clamp-2">
                            {evt.detail}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-8 text-center">
                    <Clock size={20} className="mx-auto text-[#CBD5E1]" />
                    <p className="text-sm font-semibold text-[#475569] mt-2">
                      {t("crimeMap.timeline.empty")}
                    </p>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      {t("networks.canvas.noTimelineDesc")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Edge hover path hint */}
          {hoveredEdge && (
            <div className="absolute top-12 right-4 z-10 bg-[#17233C] text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg flex items-center gap-1.5 pointer-events-none">
              <Zap size={12} className="text-amber-400" /> {hoveredEdge}
            </div>
          )}
        </div>

        {/* Right Sidebar — refined hierarchy */}
        <aside className="w-[420px] xl:w-[460px] bg-white border-l border-[#E2E8F0] flex flex-col overflow-hidden shrink-0">
          {profile ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Profile header — pinned (single AI action kept at bottom) */}
              <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#FAFBFC]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B] flex items-center gap-1.5">
                    <Shield size={11} /> {t("networks.profile.title")}
                  </p>
                  <span className="text-[10px] font-medium text-[#94A3B8] bg-white border border-[#E2E8F0] rounded-full px-2 py-0.5">
                    {t("networks.canvas.mapAware")}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shadow-sm">
                    {profile.person.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-black tracking-tight text-[#17233C] leading-none truncate">
                      {profile.person.name}
                    </h3>
                    <p className="text-xs font-medium text-[#64748B] mt-0.5 flex items-center gap-1.5">
                      {t("networks.profile.person")} ·{" "}
                      <span className="inline-flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-full px-1.5 py-0 text-[10px] font-bold text-[#475569]">
                        <Target size={10} /> {t("networks.canvas.rankSuffix", { rank: profile.person.network_rank })}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 overscroll-contain">
                {/* Key Metrics — larger/bolder than labels */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#64748B] mb-2.5">
                    {t("networks.canvas.keyMetrics")}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <MetricItem
                      label={t("networks.profile.networkScore")}
                      value={`${profile.person.network_score}/100`}
                      highlight={profile.person.network_score >= 70}
                    />
                    <MetricItem
                      label={t("networks.profile.networkRank")}
                      value={`#${profile.person.network_rank}`}
                    />
                    <MetricItem
                      label={t("networks.profile.associatedFirs")}
                      value={`${profile.person.fir_count}`}
                      highlight
                    />
                    <MetricItem
                      label={t("networks.profile.knownAssociates")}
                      value={`${profile.person.known_associates}`}
                    />
                    <MetricItem
                      label={t("networks.profile.policeStations")}
                      value={`${profile.person.station_count}`}
                    />
                    <MetricItem
                      label={t("networks.table.districts")}
                      value={`${profile.person.district_count}`}
                    />
                    <div className="col-span-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
                      <p className="text-[10px] font-bold tracking-wide uppercase text-[#64748B]">
                        {t("networks.profile.mostCommonCrime")}
                      </p>
                      <p className="text-[13px] font-bold text-[#17233C] mt-1 leading-snug">
                        {profile.person.most_common_crime || "—"}
                      </p>
                      <p className="text-[11px] text-[#64748B] mt-1 flex items-center gap-1">
                        <Activity size={11} />{" "}
                        {t("networks.canvas.firsLast60d", {
                          count: profile.person.recent_activity_60d,
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Investigation Leads — clarified star ratings */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#64748B]">
                      {t("networks.profile.investigationLeads")}
                    </h2>
                    <span className="group relative inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800 cursor-help">
                      <Info size={10} /> {t("networks.canvas.starsConfidence")}
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:block whitespace-nowrap rounded-md bg-[#17233C] px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg z-20">
                        {t("networks.canvas.starsTooltip")}
                      </span>
                    </span>
                  </div>
                  <div className="space-y-2">
                    <LeadCard
                      stars={5}
                      title={t("networks.insights.centralFigure")}
                      detail={t("networks.insights.appearsInFirs", {
                        count: profile.person.fir_count,
                      })}
                      active
                    />
                    {associates.slice(0, 3).map((a, i) => (
                      <LeadCard
                        key={i}
                        stars={4}
                        title={t("networks.insights.frequentlyArrestedWith", {
                          name: a.name,
                        })}
                        detail={`${a.shared_firs} ${t("networks.insights.sharedFirs")}`}
                        onClick={() => handleLeadClick(a.name)}
                      />
                    ))}
                    {profile.person.district_count > 1 && (
                      <LeadCard
                        stars={4}
                        title={t("networks.insights.operatesAcrossDistricts", {
                          count: profile.person.district_count,
                        })}
                        detail={
                          profile.person.districts?.join(", ") ||
                          t("networks.canvas.multiDistrict")
                        }
                      />
                    )}
                    <LeadCard
                      stars={4}
                      title={t("networks.insights.linkedToRepeatOffenders", {
                        count: profile.person.known_associates,
                      })}
                      detail={t(
                        "networks.insights.associatesWithCriminalHistory",
                      )}
                    />
                  </div>
                </div>

                {/* Network Analytics — table formatting */}
                {analytics && associates.length > 0 && (
                  <div>
                    <h2 className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#64748B] mb-2 flex items-center justify-between">
                      <span>{t("networks.analytics.title")}</span>
                      <span className="text-[10px] font-medium normal-case tracking-normal bg-white border border-[#E2E8F0] rounded-full px-2 py-0.5 text-[#475569] tabular-nums">
                        {t("networks.canvas.associatesCount", { count: associates.length })}
                      </span>
                    </h2>
                    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[10px] font-bold tracking-[0.06em] uppercase text-[#475569]">
                              <th className="text-left px-3 py-2.5 font-bold">
                                {t("networks.table.associates")}
                              </th>
                              <th className="text-right px-2.5 py-2.5 font-bold tabular-nums">
                                {t("networks.columns.firs")}
                              </th>
                              <th className="text-right px-2.5 py-2.5 font-bold tabular-nums">
                                {t("networks.analytics.sharedArrests")}
                              </th>
                              <th className="text-right px-2.5 py-2.5 font-bold tabular-nums">
                                {t("networks.columns.stations")}
                              </th>
                              <th className="text-right px-3 py-2.5 font-bold">
                                {t("networks.analytics.lastSeen")}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {associates.slice(0, 8).map((a, i) => (
                              <tr
                                key={i}
                                onClick={() => handleLeadClick(a.name)}
                                className="hover:bg-[#FFFBEB]/60 cursor-pointer transition"
                              >
                                <td className="px-3 py-2.5 font-semibold text-[#17233C] truncate max-w-[130px]">
                                  {a.name}
                                </td>
                                <td className="px-2.5 py-2.5 text-right tabular-nums font-bold text-[#0F172A]">
                                  {a.shared_firs}
                                </td>
                                <td className="px-2.5 py-2.5 text-right tabular-nums text-[#475569]">
                                  {a.shared_arrests || 0}
                                </td>
                                <td className="px-2.5 py-2.5 text-right tabular-nums text-[#475569]">
                                  {a.stations || 0}
                                </td>
                                <td className="px-3 py-2.5 text-right text-[#64748B] whitespace-nowrap text-[11px]">
                                  {a.last_seen || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-2 bg-[#FAFBFC] border-t border-[#E2E8F0] flex items-center justify-between">
                        <span className="text-[10px] text-[#94A3B8]">
                          {t("networks.canvas.rightNumerics")}
                        </span>
                        <span className="text-[10px] font-medium text-[#64748B] bg-white border border-[#E2E8F0] rounded-full px-2 py-0.5">
                          {t("networks.canvas.rowsCount", { count: associates.length })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Selected node inspector */}
                {selectedNode && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                    <p className="text-[10px] font-bold tracking-wide uppercase text-[#64748B] flex items-center gap-1.5">
                      <Eye size={11} /> {t("networks.canvas.selectedPrefix")} · {selectedNode.type}
                    </p>
                    <p className="text-sm font-bold text-[#17233C] mt-1">
                      {selectedNode.label}
                    </p>
                    {selectedNode.details && (
                      <p className="text-xs text-[#475569] mt-1 leading-relaxed">
                        {String(selectedNode.details).slice(0, 180)}
                      </p>
                    )}
                    <button
                      onClick={clearHighlight}
                      className="mt-2 text-xs font-semibold text-[#64748B] hover:text-[#17233C] underline underline-offset-4"
                    >
                      {t("networks.canvas.clearHighlight")}
                    </button>
                  </div>
                )}
              </div>

              {/* Pinned CTA — securely at bottom of sidebar */}
              <div className="shrink-0 p-4 border-t border-[#E2E8F0] bg-white space-y-2">
                <button
                  onClick={() => {
                    const associateNames = associates
                      .slice(0, 3)
                      .map((a) => a.name)
                      .join(", ");
                    const msg = `Deep analysis of ${profile.person.name}'s criminal network: score ${profile.person.network_score}/100, ${profile.person.fir_count} FIRs, associates: ${associateNames}. Provide investigation strategy tailored to ${profile.person.most_common_crime}.`;
                    navigate("/", { state: { initialMessage: msg } });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#17233C] hover:bg-[#0f1a2e] text-white text-sm font-semibold py-3 shadow-sm transition"
                >
                  <MessageSquare size={14} className="opacity-90" /> {t("networks.canvas.askMapAware")}
                  <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#17233C]">
                    <ArrowRight size={10} />
                  </span>
                </button>
                <button
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#334155] text-xs font-semibold py-2.5 transition"
                >
                  {t("networks.canvas.backToTop")} <span className="text-[#94A3B8]">↑</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div className="max-w-[300px]">
                <div className="mx-auto h-12 w-12 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center text-[#94A3B8]">
                  <Users size={20} />
                </div>
                <p className="text-sm font-semibold text-[#334155] mt-3">
                  {t("networks.empty")}
                </p>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  {t("networks.canvas.emptyHint")}
                </p>
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3 text-left">
                  <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1">
                    <Info size={12} /> {t("networks.canvas.searchVsChat")}
                  </p>
                  <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                    {t("networks.canvas.searchVsChatDesc")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Timeline quick-preview modal — prevents losing place */}
      {timelinePreview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-[2px]"
            onClick={() => setTimelinePreview(null)}
          />
          <div className="relative bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-w-[520px] w-full overflow-hidden animate-[scaleIn_0.18s_ease]">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B]">
                  {timelinePreview.type} · {timelinePreview.date}
                </p>
                <h3 className="text-[15px] font-bold text-[#17233C] mt-1 leading-snug">
                  {timelinePreview.title}
                </h3>
                {timelinePreview.detail && (
                  <p className="text-xs text-[#475569] mt-1">
                    {timelinePreview.detail}
                  </p>
                )}
              </div>
              <button
                onClick={() => setTimelinePreview(null)}
                className="h-8 w-8 rounded-full border border-[#E2E8F0] bg-white flex items-center justify-center text-[#64748B] hover:bg-[#F8FAFC] transition shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3">
                <p className="text-[11px] font-bold tracking-wide uppercase text-[#64748B]">
                  {t("networks.canvas.contextTitle")}
                </p>
                <p className="text-xs text-[#334155] mt-1 leading-relaxed">
                  {timelinePreview.type === "FIR"
                    ? t("networks.canvas.contextFir")
                    : timelinePreview.type === "Arrest"
                      ? t("networks.canvas.contextArrest")
                      : t("networks.canvas.contextOther")}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setTimelinePreview(null)}
                  className="flex-1 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#334155] text-sm font-semibold py-2.5 transition"
                >
                  {t("networks.search.close")}
                </button>
                <button
                  onClick={() => {
                    const msg = `Analyze timeline event for ${personName}: [${timelinePreview.date}] ${timelinePreview.type} — ${timelinePreview.title}. Detail: ${timelinePreview.detail || "—"}. Explain implications and next investigative steps.`;
                    navigate("/", { state: { initialMessage: msg } });
                  }}
                  className="flex-1 rounded-xl bg-[#17233C] hover:bg-[#0f1a2e] text-white text-sm font-semibold py-2.5 inline-flex items-center justify-center gap-1.5 transition"
                >
                  <Sparkles size={14} /> {t("networks.canvas.deepDiveBtn")}
                </button>
              </div>
              <p className="text-[10px] text-center text-[#94A3B8] mt-2">
                {t("networks.canvas.quickPreviewHint")}
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes slideIn{from{transform:translateX(12px);opacity:0}to{transform:translateX(0);opacity:1}} @keyframes scaleIn{from{transform:scale(0.98);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function SummaryCard({ icon, label, value, color, bg }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
      <div
        className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center ${color} mb-3 border border-transparent`}
      >
        {icon}
      </div>
      <p className="text-[26px] font-black tracking-tight text-[#0F172A] tabular-nums">
        {value}
      </p>
      <p className="text-xs font-semibold text-[#475569] mt-0.5 leading-tight">
        {label}
      </p>
    </div>
  );
}
SummaryCard.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  color: PropTypes.string.isRequired,
  bg: PropTypes.string.isRequired,
};

function MetricItem({ label, value, highlight }) {
  return (
    <div
      className={`rounded-xl p-3 border ${highlight ? "bg-amber-50/60 border-amber-200" : "bg-[#F8FAFC] border-[#E2E8F0]"}`}
    >
      <p className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#64748B]">
        {label}
      </p>
      <p
        className={`mt-1 leading-none tabular-nums ${highlight ? "text-[22px] font-black text-[#92400E]" : "text-[18px] font-bold text-[#0F172A]"}`}
      >
        {value}
      </p>
    </div>
  );
}
MetricItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  highlight: PropTypes.bool,
};

function LeadCard({ stars, title, detail, onClick, active }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${active ? "bg-amber-50 border-amber-200 shadow-sm" : "bg-white border-[#E2E8F0] hover:border-[#17233C]/15 hover:bg-[#F8FAFC]"} ${onClick ? "cursor-pointer hover:shadow-sm" : "cursor-default"}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <StarRating count={stars} showTooltip />
        {onClick && (
          <span className="ml-auto text-[10px] font-bold text-[#17233C] bg-white border border-[#E2E8F0] rounded-full px-1.5 py-0.5 inline-flex items-center gap-1">
            {t("networks.canvas.openBtn")} <ChevronRight size={10} />
          </span>
        )}
      </div>
      <p className="text-[13px] font-semibold leading-snug text-[#17233C]">
        {title}
      </p>
      <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{detail}</p>
    </button>
  );
}
LeadCard.propTypes = {
  stars: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  detail: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  active: PropTypes.bool,
};
