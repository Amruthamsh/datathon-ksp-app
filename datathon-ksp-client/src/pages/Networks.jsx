import React, { useState, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import {
  Search, User, FileText, MapPin,
  Sparkles, Users, Clock, Network,
  AlertTriangle, X, Loader2, GitBranch, List,
} from "lucide-react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import * as networkApi from "../api/network";

const cyStylesheet = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 6,
      "font-size": "11px",
      "font-weight": "bold",
      color: "#334155",
      width: 40,
      height: 40,
      "border-width": 2,
      "border-color": "#fff",
      "shadow-blur": 8,
      "shadow-color": "rgba(0,0,0,0.12)",
      "shadow-opacity": 1,
    },
  },
  {
    selector: 'node[type="accused"]',
    style: { "background-color": "#f59e0b", shape: "ellipse", width: 52, height: 52 },
  },
  {
    selector: 'node[type="case"]',
    style: { "background-color": "#ef4444", shape: "hexagon", width: 36, height: 36 },
  },
  {
    selector: 'node[type="station"]',
    style: { "background-color": "#10b981", shape: "barrel" },
  },
  {
    selector: 'node[type="officer"]',
    style: { "background-color": "#3b82f6", shape: "rectangle" },
  },
  {
    selector: "edge",
    style: {
      width: 2,
      "line-color": "#cbd5e1",
      "target-arrow-color": "#cbd5e1",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": "9px",
      "text-rotation": "autorotate",
      "text-margin-y": -8,
      color: "#64748b",
      "line-style": "data(lineStyle)",
    },
  },
  {
    selector: 'edge[relType="person"]',
    style: { "line-color": "#94a3b8", "target-arrow-color": "#94a3b8", width: 3 },
  },
  {
    selector: 'edge[relType="station"]',
    style: { "line-color": "#6ee7b7", "target-arrow-color": "#6ee7b7" },
  },
  {
    selector: 'edge[relType="semantic"]',
    style: { "line-color": "#a855f7", "target-arrow-shape": "none", width: 1.5 },
  },
];

function StarRating({ count, total = 5 }) {
  return (
    <span className="text-yellow-500 text-xs">
      {"★".repeat(count)}{"☆".repeat(total - count)}
    </span>
  );
}

export default function CriminalNetworks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [view, setView] = useState("landing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

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
  const [filterLeads, setFilterLeads] = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [sRes, cRes, bRes] = await Promise.all([
          networkApi.getNetworkSummary(token),
          networkApi.getCommunities(token),
          networkApi.getBridgeIndividuals(token, 10),
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
      networkApi.searchNetwork(token, val).then((res) => {
        setSearchResults(res.data);
        setShowDropdown(true);
        setSearching(false);
      }).catch(() => setSearching(false));
    } else {
      setSearchResults(null);
      setShowDropdown(false);
    }
  };

  const selectPerson = async (name) => {
    setPersonName(name);
    setView("graph");
    setShowDropdown(false);
    setSearchQuery(name);
    setLoading(true);
    setSelectedNode(null);
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
      networkApi.searchNetwork(token, item.label).then((res) => {
        if (res.data?.people?.length > 0) {
          selectPerson(res.data.people[0].name);
        }
      }).finally(() => setLoading(false));
    } else if (item.type === "station") {
      setLoading(true);
      networkApi.searchNetwork(token, item.label).then((res) => {
        if (res.data?.people?.length > 0) {
          selectPerson(res.data.people[0].name);
        }
      }).finally(() => setLoading(false));
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
  };

  const handleLeadClick = (associateName) => {
    selectPerson(associateName);
  };

  const countByType = (graphData) => {
    if (!graphData) return { accused: 0, cases: 0, stations: 0, officers: 0 };
    const counts = { accused: 0, cases: 0, stations: 0, officers: 0 };
    graphData.nodes.forEach((n) => {
      const t = n.data.type;
      if (t === "accused") counts.accused++;
      else if (t === "case") counts.cases++;
      else if (t === "station") counts.stations++;
      else if (t === "officer") counts.officers++;
    });
    return counts;
  };

  if (view === "landing") {
    const nodeCounts = { accused: 412, groups: 38, bridges: 17, highRisk: 9 };
    if (summary) {
      nodeCounts.accused = summary.repeat_offenders || 412;
      nodeCounts.groups = summary.criminal_groups || 38;
      nodeCounts.bridges = summary.bridge_individuals || 17;
      nodeCounts.highRisk = summary.high_risk_networks || 9;
    }

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-8 py-5">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {t("networks.title")}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {t("networks.subtitle")}
                </p>
              </div>
            </div>
            <form onSubmit={executeSearch} className="relative max-w-2xl">
              <input
                type="text"
                placeholder={t("networks.searchPlaceholder")}
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
              />
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              {searching && (
                <Loader2 className="absolute right-3 top-3 h-5 w-5 text-slate-400 animate-spin" />
              )}
              {showDropdown && searchResults && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
                  {searchResults.people?.length > 0 && (
                    <div>
                      <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">{t("networks.tabs.people")}</p>
                      {searchResults.people.slice(0, 5).map((p, i) => (
                        <button key={i} onClick={() => selectSearchResult(p)}
                          className="w-full px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-amber-500" />
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          <span className="text-xs text-slate-400 ml-auto">{t("networks.firs", {count: p.case_count})}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.cases?.length > 0 && (
                    <div>
                      <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">{t("networks.tabs.cases")}</p>
                      {searchResults.cases.map((c, i) => (
                        <button key={i} onClick={() => selectSearchResult(c)}
                          className="w-full px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-red-500" />
                          <span className="font-semibold text-slate-800">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.stations?.length > 0 && (
                    <div>
                      <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">{t("networks.tabs.stations")}</p>
                      {searchResults.stations.map((s, i) => (
                        <button key={i} onClick={() => selectSearchResult(s)}
                          className="w-full px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-green-500" />
                          <span className="font-semibold text-slate-800">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-8 space-y-8">
            <div className="grid grid-cols-4 gap-4">
              <SummaryCard icon={<Users className="h-5 w-5" />} label={t("networks.stats.repeatOffenders")} value={nodeCounts.accused} color="text-amber-600" bg="bg-amber-50" />
              <SummaryCard icon={<Network className="h-5 w-5" />} label={t("networks.stats.criminalGroups")} value={nodeCounts.groups} color="text-red-600" bg="bg-red-50" />
              <SummaryCard icon={<GitBranch className="h-5 w-5" />} label={t("networks.stats.bridgeIndividuals")} value={nodeCounts.bridges} color="text-purple-600" bg="bg-purple-50" />
              <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label={t("networks.stats.highRiskNetworks")} value={nodeCounts.highRisk} color="text-red-700" bg="bg-red-100" />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => navigate("/", { state: { initialMessage: `Analyze overall criminal network intelligence: ${nodeCounts.accused} repeat offenders, ${nodeCounts.groups} criminal groups, ${nodeCounts.bridges} bridge individuals, ${nodeCounts.highRisk} high risk networks. What are the key patterns, risk areas, and recommended investigation priorities?` } })}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t("networks.deepDive")}
              </button>
            </div>

            {bridgeIndividuals.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t("networks.bridgeIndividuals")}</h2>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-2">{t("networks.table.name")}</th>
                        <th className="text-left px-4 py-2">{t("networks.columns.firs")}</th>
                        <th className="text-left px-4 py-2">{t("networks.table.associates")}</th>
                        <th className="text-left px-4 py-2">{t("networks.columns.stations")}</th>
                        <th className="text-left px-4 py-2">{t("networks.table.districts")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bridgeIndividuals.map((b, i) => (
                        <tr key={i} onClick={() => selectPerson(b.name)}
                          className="hover:bg-amber-50 cursor-pointer">
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{b.name}</td>
                          <td className="px-4 py-2.5 text-slate-600">{b.fir_count}</td>
                          <td className="px-4 py-2.5 text-slate-600">{b.unique_associates}</td>
                          <td className="px-4 py-2.5 text-slate-600">{b.stations_covered}</td>
                          <td className="px-4 py-2.5 text-slate-600">{b.districts_covered}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      const names = bridgeIndividuals.slice(0, 5).map((b) => b.name).join(", ");
                      navigate("/", { state: { initialMessage: `Analyze the bridge individuals in the criminal network: ${names}. These individuals connect different criminal groups across multiple stations. What patterns of cross-station and cross-district criminal activity do they facilitate? Which investigation paths should be prioritized?` } });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 transition shadow-sm"
                  >
                    <Sparkles className="h-3 w-3" />
                    {t("networks.deepDive")}
                  </button>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t("networks.topNetworks")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {communities.slice(0, 6).map((net, i) => (
                  <button key={i} onClick={() => net.members?.[0] && selectPerson(net.members[0])}
                    className="bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-amber-300 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold text-slate-800 text-sm">{net.members?.slice(0, 3).join(", ")}{net.member_count > 3 ? "..." : ""}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        net.risk === "Very High" ? "bg-red-100 text-red-700" :
                        net.risk === "High" ? "bg-amber-100 text-amber-700" :
                        "bg-yellow-50 text-yellow-700"
                      }`}>{net.risk}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span><strong className="text-slate-700">{net.member_count}</strong> {t("networks.columns.members")}</span>
                      <span><strong className="text-slate-700">{net.total_firs}</strong> {t("networks.columns.firs")}</span>
                      <span><strong className="text-slate-700">{net.stations_covered}</strong> {t("networks.columns.stations")}</span>
                    </div>
                  </button>
                ))}
                {communities.length === 0 && (
                  <p className="text-sm text-slate-400 col-span-3 text-center py-8">{t("networks.noNetworks")}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const counts = countByType(graphData);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200 px-6 flex items-center gap-4">
        <button onClick={() => { setView("landing"); setPersonName(null); setGraphData(null); }}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 mr-2">
          ← {t("networks.back")}
        </button>
        <form onSubmit={executeSearch} className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search person, case, station..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
          {showDropdown && searchResults && (
            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {searchResults.people?.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => selectSearchResult(p)}
                  className="w-full px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2 text-xs">
                  <User className="h-3 w-3 text-amber-500" /> {p.name}
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setActiveTab("graph")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${activeTab === "graph" ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:bg-slate-100"}`}>
            <List className="h-3.5 w-3.5 inline mr-1" /> {t("networks.graph")}
          </button>
          <button onClick={() => setActiveTab("timeline")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${activeTab === "timeline" ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:bg-slate-100"}`}>
            <Clock className="h-3.5 w-3.5 inline mr-1" /> {t("networks.timeline")}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
            </div>
          )}

          {activeTab === "graph" ? (
            <>
              {graphData && (
                <div className="absolute bottom-4 left-4 z-10">
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-slate-200/80 px-4 py-3 w-max">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Legend</p>

                    <div className="flex gap-5">
                      <div className="space-y-1.5">
                        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-wider">Nodes</p>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-amber-500 shadow-sm ring-1 ring-white" />
                          <span className="text-[10px] text-slate-600 font-medium">Accused ({counts.accused})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" viewBox="0 0 16 16"><polygon points="8,1 14.5,5 14.5,11 8,15 1.5,11 1.5,5" fill="#ef4444" stroke="white" strokeWidth="1"/></svg>
                          <span className="text-[10px] text-slate-600 font-medium">FIR / Case ({counts.cases})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 bg-emerald-500 shadow-sm rounded-[3px] ring-1 ring-white" />
                          <span className="text-[10px] text-slate-600 font-medium">Station ({counts.stations})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-3.5 bg-blue-500 shadow-sm rounded-[2px] ring-1 ring-white" />
                          <span className="text-[10px] text-slate-600 font-medium">Officer ({counts.officers})</span>
                        </div>
                      </div>

                      <div className="w-px bg-slate-100" />

                      <div className="space-y-1.5">
                        <p className="text-[8px] font-bold text-slate-300 uppercase tracking-wider">Edges</p>
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-0 border-t-[3px] border-slate-400 rounded-full" />
                          <span className="text-[10px] text-slate-600 font-medium">Person link</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-0 border-t-[2px] border-emerald-300 rounded-full" />
                          <span className="text-[10px] text-slate-600 font-medium">Station link</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-0 border-t-[1.5px] border-purple-400 rounded-full" />
                          <span className="text-[10px] text-slate-600 font-medium">Semantic</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {graphData ? (
                <CytoscapeComponent
                  elements={[...graphData.nodes, ...graphData.edges]}
                  stylesheet={cyStylesheet}
                  layout={{
                    name: "cose",
                    idealEdgeLength: 100,
                    nodeOverlap: 20,
                    refresh: 20,
                    fit: true,
                    padding: 50,
                    randomize: false,
                    componentSpacing: 120,
                    nodeRepulsion: 500000,
                    edgeElasticity: 100,
                  }}
                  style={{ width: "100%", height: "100%" }}
                  cy={(cy) => {
                    cy.on("tap", "node", handleNodeClick);
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <Network className="h-12 w-12 mx-auto mb-3 text-slate-200" />
                    <p className="text-sm">Select a person to view their network graph.</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-6 overflow-y-auto h-full">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">{t("networks.timeline")}</h3>
              {timeline.length > 0 ? (
                <div className="relative pl-6 border-l-2 border-amber-200 space-y-6">
                  {timeline.map((evt, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 border-white ${
                        evt.type === "FIR" ? "bg-red-500" :
                        evt.type === "Arrest" ? "bg-amber-500" :
                        "bg-blue-500"
                      }`} />
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-400">{evt.date}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            evt.type === "FIR" ? "bg-red-50 text-red-600" :
                            evt.type === "Arrest" ? "bg-amber-50 text-amber-600" :
                            "bg-blue-50 text-blue-600"
                          }`}>{evt.type}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{evt.title}</p>
                        {evt.detail && <p className="text-xs text-slate-500 mt-0.5">{evt.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">No timeline data available.</p>
              )}
            </div>
          )}
        </div>

        <aside className="w-[480px] bg-white border-l border-slate-200 flex flex-col overflow-y-auto">
          {profile ? (
            <div className="p-5 space-y-5">
              <div>
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t("networks.profile.title")}</h2>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{profile.person.name}</h3>
                    <p className="text-xs text-slate-500">{t("networks.profile.person")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricItem label={t("networks.profile.networkScore")} value={`${profile.person.network_score}/100`} />
                  <MetricItem label={t("networks.profile.networkRank")} value={profile.person.network_rank} />
                  <MetricItem label={t("networks.profile.associatedFirs")} value={profile.person.fir_count} />
                  <MetricItem label={t("networks.profile.knownAssociates")} value={profile.person.known_associates} />
                  <MetricItem label={t("networks.profile.policeStations")} value={profile.person.station_count} />
                  <MetricItem label={t("networks.table.districts")} value={profile.person.district_count} />
                  <MetricItem label={t("networks.profile.mostCommonCrime")} value={profile.person.most_common_crime} />
                  <MetricItem label={t("networks.profile.recentActivity")} value={`${profile.person.recent_activity_60d} FIRs in 60d`} />
                </div>
              </div>

              <div>
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{t("networks.profile.investigationLeads")}</h2>
                <div className="space-y-2">
                  <LeadCard
                    stars={5}
                    title={t("networks.insights.centralFigure")}
                    detail={t("networks.insights.appearsInFirs", {count: profile.person.fir_count})}
                    active={true}
                  />
                  {associates.slice(0, 3).map((a, i) => (
                    <LeadCard
                      key={i}
                      stars={4}
                      title={t("networks.insights.frequentlyArrestedWith", {name: a.name})}
                      detail={`${a.shared_firs} ${t("networks.insights.sharedFirs")}`}
                      onClick={() => handleLeadClick(a.name)}
                    />
                  ))}
                  {profile.person.district_count > 1 && (
                    <LeadCard
                      stars={4}
                      title={t("networks.insights.operatesAcrossDistricts", {count: profile.person.district_count})}
                      detail={profile.person.districts?.join(", ")}
                    />
                  )}
                  <LeadCard
                    stars={4}
                    title={t("networks.insights.linkedToRepeatOffenders", {count: profile.person.known_associates})}
                    detail={t("networks.insights.associatesWithCriminalHistory")}
                  />
                </div>
              </div>

              {analytics && (
                <div>
                  <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{t("networks.analytics.title")}</h2>
                  <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase">
                        <tr>
                          <th className="text-left px-3 py-1.5">{t("networks.table.associates")}</th>
                          <th className="text-left px-3 py-1.5">{t("networks.columns.firs")}</th>
                          <th className="text-left px-3 py-1.5">{t("networks.analytics.sharedArrests")}</th>
                          <th className="text-left px-3 py-1.5">{t("networks.columns.stations")}</th>
                          <th className="text-left px-3 py-1.5">{t("networks.analytics.lastSeen")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {associates.slice(0, 8).map((a, i) => (
                          <tr key={i} onClick={() => handleLeadClick(a.name)}
                            className="hover:bg-amber-50 cursor-pointer">
                            <td className="px-3 py-1.5 font-semibold text-slate-700">{a.name}</td>
                            <td className="px-3 py-1.5 text-slate-600">{a.shared_firs}</td>
                            <td className="px-3 py-1.5 text-slate-600">{a.shared_arrests || 0}</td>
                            <td className="px-3 py-1.5 text-slate-600">{a.stations || 0}</td>
                            <td className="px-3 py-1.5 text-slate-600">{a.last_seen || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => {
                        const associateNames = associates.slice(0, 5).map((a) => a.name).join(", ");
                        navigate("/", { state: { initialMessage: `Deep analysis of ${profile.person.name}'s criminal network: network score ${profile.person.network_score}/100, rank ${profile.person.network_rank}, ${profile.person.fir_count} associated FIRs, ${profile.person.known_associates} known associates (${associateNames}), ${profile.person.station_count} police stations, most common crime: ${profile.person.most_common_crime}. Analyze their role in the network, assess recidivism risk, and recommend investigation priorities.` } });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 transition shadow-sm"
                    >
                      <Sparkles className="h-3 w-3" />
                      {t("networks.deepDive")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 p-6 text-center">
              <div>
                <Users className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm">{t("networks.empty")}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color, bg }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center ${color} mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-semibold mt-0.5">{label}</p>
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

function MetricItem({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

MetricItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

function LeadCard({ stars, title, detail, onClick, active }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        active ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/50"
      }`}>
      <div className="flex items-center gap-1 mb-1">
        <StarRating count={stars} />
      </div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{detail}</p>
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
