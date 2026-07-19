import React, { useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import {
  Search,
  Link as LinkIcon,
  User,
  FileText,
  MapPin,
  Shield,
  BrainCircuit,
  Scale,
  ChevronRight,
  Sparkles,
} from "lucide-react";

// Enhanced mock data with Sections and distinct relationship types
const mockGraphData = [
  // Nodes
  {
    data: {
      id: "case_119",
      label: "CR-2025-119",
      type: "case",
      details: "Theft of vehicle",
    },
  },
  {
    data: {
      id: "person_1192",
      label: "PersonID 1192",
      type: "accused",
      details: "Ramesh K.",
    },
  },
  {
    data: {
      id: "case_201",
      label: "CR-2025-201",
      type: "case",
      details: "Burglary at night",
    },
  },
  {
    data: {
      id: "ps_central",
      label: "Central PS",
      type: "station",
      details: "Hubballi",
    },
  },
  {
    data: {
      id: "officer_44",
      label: "Insp. Sharma",
      type: "officer",
      details: "Investigating Officer",
    },
  },
  {
    data: {
      id: "sec_379",
      label: "IPC 379",
      type: "section",
      details: "Punishment for theft",
    },
  },

  // Edges (Relationships) with explicit edge styles
  {
    data: {
      source: "case_119",
      target: "person_1192",
      label: "Accused In",
      relType: "person",
      lineStyle: "solid",
    },
  },
  {
    data: {
      source: "case_201",
      target: "person_1192",
      label: "Accused In",
      relType: "person",
      lineStyle: "solid",
    },
  },
  {
    data: {
      source: "case_119",
      target: "ps_central",
      label: "Jurisdiction",
      relType: "station",
      lineStyle: "dashed",
    },
  },
  {
    data: {
      source: "case_201",
      target: "ps_central",
      label: "Jurisdiction",
      relType: "station",
      lineStyle: "dashed",
    },
  },
  {
    data: {
      source: "case_119",
      target: "officer_44",
      label: "Assigned To",
      relType: "officer",
      lineStyle: "solid",
    },
  },
  {
    data: {
      source: "case_119",
      target: "sec_379",
      label: "Charged Under",
      relType: "section",
      lineStyle: "solid",
    },
  },
  {
    data: {
      source: "case_201",
      target: "sec_379",
      label: "Charged Under",
      relType: "section",
      lineStyle: "solid",
    },
  },

  // Semantic / AI inferred link
  {
    data: {
      source: "case_119",
      target: "case_201",
      label: "Similar Facts",
      relType: "semantic",
      lineStyle: "dotted",
    },
  },
];

export default function ConnectedInvestigations() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [elements, setElements] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setIsSearching(e.target.value.length > 0);
  };

  const executeSearch = (e) => {
    e?.preventDefault();
    setIsSearching(false);
    if (searchQuery.trim()) {
      setElements(mockGraphData);
      setSelectedEntity({
        nodeType: "case",
        id: "CR-2025-119",
        label: "CR-2025-119",
        description:
          "Investigation initiated under IPC 379. Currently expanding linked entities.",
      });
    }
  };

  const handleNodeClick = (event) => {
    const node = event.target;
    setSelectedEntity({
      isNode: true,
      nodeType: node.data("type"),
      id: node.data("id"),
      label: node.data("label"),
      description: node.data("details"),
    });
  };

  const handleEdgeClick = (event) => {
    const edge = event.target;
    setSelectedEntity({
      isNode: false,
      nodeType: "relationship",
      id: `${edge.source().data("label")} ↔ ${edge.target().data("label")}`,
      label: edge.data("label"),
      description: "4 Evidence Signals",
    });
  };

  // Cytoscape Stylesheet ensuring clear visual distinction of network links
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
        width: 36,
        height: 36,
        "border-width": 2,
        "border-color": "#fff",
        "shadow-blur": 6,
        "shadow-color": "rgba(0,0,0,0.1)",
        "shadow-opacity": 1,
      },
    },
    // Node Types
    {
      selector: 'node[type="case"]',
      style: { "background-color": "#ef4444", shape: "hexagon" },
    },
    {
      selector: 'node[type="accused"]',
      style: { "background-color": "#f59e0b", shape: "ellipse" },
    },
    {
      selector: 'node[type="officer"]',
      style: { "background-color": "#3b82f6", shape: "rectangle" },
    },
    {
      selector: 'node[type="station"]',
      style: { "background-color": "#10b981", shape: "barrel" },
    },
    {
      selector: 'node[type="section"]',
      style: { "background-color": "#06b6d4", shape: "diamond" },
    }, // New Section Node

    // Edge Styles based on Relationship Type
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#cbd5e1",
        "target-arrow-color": "#cbd5e1",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": "10px",
        "text-rotation": "autorotate",
        "text-margin-y": -8,
        color: "#64748b",
        "line-style": "data(lineStyle)", // Pulls solid/dashed/dotted from data
      },
    },
    {
      selector: 'edge[relType="person"]',
      style: {
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
        width: 3,
      },
    },
    {
      selector: 'edge[relType="station"]',
      style: { "line-color": "#6ee7b7", "target-arrow-color": "#6ee7b7" },
    },
    {
      selector: 'edge[relType="semantic"]',
      style: { "line-color": "#a855f7", "target-arrow-shape": "none" },
    },
    {
      selector: 'edge[relType="section"]',
      style: { "line-color": "#67e8f9", "target-arrow-color": "#67e8f9" },
    },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans">
      {/* Redesigned Header */}
      <header className="flex-shrink-0 h-16 bg-white border-b px-6 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold text-slate-800 tracking-wider">
            CONNECTED INVESTIGATIONS
          </h1>
          <span className="text-xs text-slate-500 uppercase font-semibold">
            Relationship Explorer
          </span>
        </div>

        {/* Search with Autocomplete Stub */}
        <div className="relative w-96">
          <form onSubmit={executeSearch}>
            <input
              type="text"
              placeholder="Search Case, PersonID, Officer, Station..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          </form>

          {/* Autocomplete Dropdown */}
          {isSearching && (
            <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50">
              <ul className="py-2">
                <li
                  className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                  onClick={executeSearch}
                >
                  <User className="h-4 w-4 text-orange-500" />{" "}
                  <span className="font-semibold">PersonID 1192</span> (Matches
                  2 cases)
                </li>
                <li
                  className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                  onClick={executeSearch}
                >
                  <FileText className="h-4 w-4 text-red-500" />{" "}
                  <span className="font-semibold">Case CR-2025-119</span>
                </li>
                <li
                  className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                  onClick={executeSearch}
                >
                  <Scale className="h-4 w-4 text-cyan-500" />{" "}
                  <span className="font-semibold">IPC 379</span> (Theft)
                </li>
              </ul>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph Canvas */}
        <div className="flex-1 relative bg-slate-50/50">
          {/* Quick Stats Overlay */}
          {elements.length > 0 && (
            <div className="absolute top-4 left-4 z-10 flex gap-3">
              {[
                { label: "Cases", val: 2, color: "text-red-600" },
                { label: "Accused", val: 1, color: "text-orange-600" },
                { label: "Stations", val: 1, color: "text-green-600" },
                { label: "Sections", val: 1, color: "text-cyan-600" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white px-3 py-1.5 rounded-md shadow-sm border border-slate-200 flex flex-col items-center min-w-[70px]"
                >
                  <span className={`text-lg font-bold ${stat.color}`}>
                    {stat.val}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {elements.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              Search to generate the relationship graph.
            </div>
          ) : (
            <CytoscapeComponent
              elements={elements}
              stylesheet={cyStylesheet}
              layout={{
                name: "cose",
                idealEdgeLength: 80,
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                padding: 40,
                randomize: false,
                componentSpacing: 100,
                nodeRepulsion: 400000,
                edgeElasticity: 100,
                nestingFactor: 5,
              }}
              style={{ width: "100%", height: "100%" }}
              cy={(cy) => {
                cy.on("tap", "node", handleNodeClick);
                cy.on("tap", "edge", handleEdgeClick);
              }}
            />
          )}
        </div>

        {/* Intelligence Sidebar */}
        <aside className="w-[420px] bg-white border-l border-slate-200 flex flex-col shadow-xl z-10 overflow-y-auto">
          {selectedEntity ? (
            <div className="p-6 flex flex-col h-full space-y-6">
              {/* Selected Entity Header */}
              <div>
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {selectedEntity.isNode
                    ? `Selected Node: ${selectedEntity.nodeType}`
                    : "Selected Relationship"}
                </h2>
                <div className="flex items-center gap-3 mb-2">
                  {selectedEntity.nodeType === "case" && (
                    <FileText className="h-6 w-6 text-red-500" />
                  )}
                  {selectedEntity.nodeType === "accused" && (
                    <User className="h-6 w-6 text-orange-500" />
                  )}
                  {selectedEntity.nodeType === "station" && (
                    <MapPin className="h-6 w-6 text-green-500" />
                  )}
                  {selectedEntity.nodeType === "officer" && (
                    <Shield className="h-6 w-6 text-blue-500" />
                  )}
                  {selectedEntity.nodeType === "section" && (
                    <Scale className="h-6 w-6 text-cyan-500" />
                  )}
                  {selectedEntity.nodeType === "relationship" && (
                    <LinkIcon className="h-6 w-6 text-slate-500" />
                  )}
                  <h3 className="text-xl font-bold text-slate-800">
                    {selectedEntity.label}
                  </h3>
                </div>
                <p className="text-sm text-slate-600">
                  {selectedEntity.description}
                </p>

                {/* Contextual Expand Button for Nodes */}
                {selectedEntity.isNode && (
                  <button className="mt-3 flex items-center text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md font-medium transition-colors">
                    Expand Related Entities{" "}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                )}
              </div>

              {/* Relationship Basis */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Relationship Basis
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start text-sm text-slate-700">
                    <User className="h-4 w-4 text-slate-400 mr-2 mt-0.5" />
                    <span>
                      <strong>Shared Person:</strong> PersonID 1192 appears in
                      both cases
                    </span>
                  </li>
                  <li className="flex items-start text-sm text-slate-700">
                    <Scale className="h-4 w-4 text-slate-400 mr-2 mt-0.5" />
                    <span>
                      <strong>Shared IPC:</strong> Both registered under Sec 379
                    </span>
                  </li>
                  <li className="flex items-start text-sm text-slate-700">
                    <MapPin className="h-4 w-4 text-slate-400 mr-2 mt-0.5" />
                    <span>
                      <strong>Same Station:</strong> Jurisdiction of Central PS
                    </span>
                  </li>
                  <li className="flex items-start text-sm text-slate-700">
                    <Sparkles className="h-4 w-4 text-purple-400 mr-2 mt-0.5" />
                    <span>
                      <strong>Similar Facts:</strong> 92% semantic overlap in
                      BriefFacts
                    </span>
                  </li>
                </ul>
              </div>

              {/* AI Summary Block */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <BrainCircuit className="h-4 w-4" /> AI Summary
                  </h4>
                  <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                    Explain Detail
                  </button>
                </div>
                <ul className="list-disc list-inside text-sm text-slate-700 space-y-1 ml-1 mb-4">
                  <li>Shared primary accused</li>
                  <li>Common jurisdiction & legal section</li>
                  <li>Highly similar BriefFacts</li>
                  <li>Likely part of recurring theft pattern</li>
                </ul>

                {/* Contextual AI Suggestions / Actions */}
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6">
                  Suggested Actions
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-slate-300 hover:bg-slate-50">
                    Find similar investigations
                  </button>
                  <button className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-slate-300 hover:bg-slate-50">
                    Show arrest timeline
                  </button>
                  <button className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-slate-300 hover:bg-slate-50">
                    Compare case facts
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 mt-20">
              <LinkIcon className="h-12 w-12 mx-auto mb-4 text-slate-200" />
              <p className="text-sm">
                Select a node or edge on the graph to view intelligence details
                and relationship basis.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
