import React, { useState } from "react";
import {
  Search,
  ChevronDown,
  AlertTriangle,
  Link as LinkIcon,
  MapPin,
  CloudRain,
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
} from "lucide-react";

// --- MOCK DATA BASED ON EXPLAINABLE PRIORITY ---
const MOCK_CASES = [
  {
    id: "CR221",
    priority: "Critical",
    station: "Bagalkot Town PS 1",
    status: "Arrest Pending",
    gravity: "Heinous",
    age: "21d",
    similar: 5,
    officer: "Ravi",
    act: "IPC 392 (Robbery)",
    reasons: [
      "Heinous offence",
      "Chargesheet pending for 21 days",
      "Repeat offender detected",
      "5 similar cases in active division",
    ],
  },
  {
    id: "CR892",
    priority: "Critical",
    station: "Kalaburagi PS 2",
    status: "Investigation",
    gravity: "Heinous",
    age: "14d",
    similar: 2,
    officer: "Isaac",
    act: "IPC 302 (Murder)",
    reasons: [
      "Heinous offence",
      "Multiple victims reported",
      "High-risk location (Hotspot)",
    ],
  },
  {
    id: "CR112",
    priority: "High",
    station: "Kolar Town PS 2",
    status: "Arrest Pending",
    gravity: "Simple",
    age: "9d",
    similar: 0,
    officer: "Kumar",
    act: "IPC 379 (Theft)",
    reasons: ["Arrest pending", "Older than 7 days"],
  },
  {
    id: "CR404",
    priority: "Medium",
    station: "Bidar Town PS 1",
    status: "Investigation",
    gravity: "Simple",
    age: "5d",
    similar: 1,
    officer: "Anita",
    act: "IPC 420 (Cheating)",
    reasons: ["Occurred in known crime hotspot"],
  },
  {
    id: "CR918",
    priority: "Low",
    station: "Gadag PS 8",
    status: "Review",
    gravity: "Simple",
    age: "2d",
    similar: 0,
    officer: "Ramesh",
    act: "IPC 323 (Assault)",
    reasons: ["Standard review timeframe"],
  },
];

const METRICS = [
  { label: "Assigned", value: 18, active: true },
  { label: "Chargesheet Pending", value: 7, active: false },
  { label: "Repeat Offenders", value: 3, active: false },
  { label: "Arrests Pending", value: 6, active: false },
  { label: "Need Review Today", value: 4, active: false },
];

export default function InvestigationsQueue() {
  const [selectedCases, setSelectedCases] = useState([]);
  const [activeDrawerCase, setActiveDrawerCase] = useState(null);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedCases((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const renderPriorityBadge = (priority) => {
    switch (priority) {
      case "Critical":
        return (
          <span className="flex items-center px-2.5 py-1 bg-red-100 text-red-700 font-bold text-xs rounded border border-red-200">
            <ShieldAlert size={12} className="mr-1" /> CRITICAL
          </span>
        );
      case "High":
        return (
          <span className="flex items-center px-2.5 py-1 bg-orange-100 text-orange-700 font-bold text-xs rounded border border-orange-200">
            <AlertCircle size={12} className="mr-1" /> HIGH
          </span>
        );
      case "Medium":
        return (
          <span className="flex items-center px-2.5 py-1 bg-yellow-100 text-yellow-700 font-bold text-xs rounded border border-yellow-200">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="flex items-center px-2.5 py-1 bg-slate-100 text-slate-600 font-bold text-xs rounded border border-slate-200">
            LOW
          </span>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* MAIN WORKSPACE */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${activeDrawerCase ? "mr-96" : ""}`}
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
                  placeholder="Search CR No, accused, locations..."
                  className="pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm w-72 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex space-x-4 overflow-x-auto pb-2">
            {METRICS.map((metric) => (
              <button
                key={metric.label}
                className={`flex flex-col items-start p-4 min-w-[140px] rounded-lg border transition-all ${
                  metric.active
                    ? "border-blue-500 bg-blue-50/50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`text-2xl font-bold ${metric.active ? "text-blue-700" : "text-slate-800"}`}
                >
                  {metric.value}
                </span>
                <span
                  className={`text-xs font-medium mt-1 ${metric.active ? "text-blue-600" : "text-slate-500"}`}
                >
                  {metric.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between min-h-[56px]">
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
              <div className="flex space-x-2">
                {[
                  "Status",
                  "Gravity",
                  "Station",
                  "Officer",
                  "District",
                  "Crime Head",
                ].map((filter) => (
                  <button
                    key={filter}
                    className="flex items-center px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-50"
                  >
                    {filter}{" "}
                    <ChevronDown size={12} className="ml-1 opacity-50" />
                  </button>
                ))}
              </div>
              <div className="flex items-center text-sm">
                <span className="text-slate-500 mr-2 text-xs uppercase tracking-wider font-semibold">
                  Sort:
                </span>
                <button className="flex items-center font-medium text-slate-800">
                  <ShieldAlert size={14} className="mr-1 text-red-500" />{" "}
                  Priority <ChevronDown size={14} className="ml-1" />
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
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Similar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_CASES.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setActiveDrawerCase(row)}
                  className={`cursor-pointer transition-colors ${
                    activeDrawerCase?.id === row.id
                      ? "bg-blue-50/50"
                      : "hover:bg-slate-50"
                  } ${selectedCases.includes(row.id) ? "bg-blue-50/30" : ""}`}
                >
                  <td
                    className="py-3 px-4 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCases.includes(row.id)}
                      onChange={(e) => toggleSelect(row.id, e)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-4">
                    {renderPriorityBadge(row.priority)}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {row.id}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {row.station}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-slate-700">
                    {row.gravity}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {row.age}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {row.similar} cases
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIDE DRAWER */}
      {activeDrawerCase && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl flex flex-col z-20 animate-in slide-in-from-right">
          <div className="p-5 border-b border-slate-200 flex justify-between items-start bg-slate-50">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <h2 className="text-xl font-bold text-slate-900">
                  {activeDrawerCase.id}
                </h2>
                {renderPriorityBadge(activeDrawerCase.priority)}
              </div>
              <p className="text-sm font-medium text-slate-700">
                {activeDrawerCase.act}
              </p>
              <div className="flex text-xs text-slate-500 mt-2 space-x-3">
                <span className="flex items-center">
                  <MapPin size={12} className="mr-1" />{" "}
                  {activeDrawerCase.station}
                </span>
                <span className="flex items-center">
                  <Clock size={12} className="mr-1" /> Reg 12 Jul
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveDrawerCase(null)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* EXPLAINABLE PRIORITY WIDGET */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 relative">
              <div className="flex items-center text-slate-800 font-bold text-xs uppercase tracking-wider mb-3">
                <Info size={14} className="mr-1.5 text-slate-500" /> Why{" "}
                {activeDrawerCase.priority}?
              </div>
              <ul className="space-y-2">
                {activeDrawerCase.reasons.map((reason, idx) => (
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

            {/* AI Summary Widget */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 relative">
              <div className="flex items-center text-blue-800 font-semibold text-xs uppercase tracking-wider mb-2">
                <Bot size={14} className="mr-1.5" /> AI Summary
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                Property crime pattern detected. Entry method matches 3 other
                unsolved cases in the division. Primary accused identified via
                cross-referencing past convictions. Requires immediate witness
                statement verification.
              </p>
            </div>

            {/* Structured Sections */}
            {[
              {
                title: "People",
                icon: <Users size={16} />,
                content: "2 Victims, 1 Accused (Known Offender)",
              },
              {
                title: "Acts & Sections",
                icon: <FileText size={16} />,
                content: activeDrawerCase.act,
              },
              {
                title: "Cross Investigation Intel",
                icon: <Share2 size={16} />,
                content: "Accused previously flagged in CR892.",
              },
              {
                title: "Nearby Context",
                icon: <Map size={16} />,
                content:
                  "High volume of property crimes in 2km radius this week.",
              },
            ].map((section, idx) => (
              <div key={idx} className="border-b border-slate-100 pb-4">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center mb-2">
                  <span className="text-slate-400 mr-2">{section.icon}</span>
                  {section.title}
                </h3>
                <p className="text-sm text-slate-600 pl-6">{section.content}</p>
              </div>
            ))}
          </div>

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
