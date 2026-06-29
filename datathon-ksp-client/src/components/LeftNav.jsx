import React from "react";
import {
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  History,
} from "lucide-react";
import { menuItems } from "../data/leftNavMenu.js";
import { recentQueries } from "../data/recentQueries.js";

const LeftNav = ({ expanded, setExpanded }) => {
  return (
    <aside
      className={`bg-white border-r border-slate-200 transition-all duration-300 flex flex-col ${
        expanded ? "w-64" : "w-16"
      }`}
    >
      {/* Fixed Header */}
      <div className="shrink-0 border-b border-slate-200 p-2 space-y-2">
        {/* Top Row */}
        <div
          className={`flex items-center ${
            expanded ? "justify-between" : "justify-center"
          }`}
        >
          {expanded && (
            <button className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-100 transition cursor-pointer">
              <SquarePen size={18} />
              New Chat
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-2 hover:bg-slate-100 transition cursor-pointer"
          >
            {expanded ? (
              <PanelLeftClose size={18} className="text-slate-700" />
            ) : (
              <PanelLeftOpen size={18} className="text-slate-700" />
            )}
          </button>
        </div>

        {/* Collapsed New Chat */}
        {!expanded && (
          <button className="w-full flex justify-center rounded-lg p-2 hover:bg-slate-100 transition cursor-pointer">
            <SquarePen size={18} />
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <nav className="flex-1 overflow-y-auto">
        {/* Main Navigation */}
        <div className="px-2 py-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.title}
                className={`
              w-full
              flex items-center
              rounded-lg
              hover:bg-slate-100
              transition-colors
              cursor-pointer
              ${expanded ? "gap-4 px-4 py-2" : "justify-center py-3"}
            `}
              >
                <Icon size={18} className="shrink-0" />

                {expanded && (
                  <span className="text-sm font-medium">{item.title}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        {expanded && (
          <>
            <div className="mx-3 my-2 border-t border-slate-200" />

            <div className="px-3">
              <p className="mb-2 pl-2 text-sm font-semibold  tracking-wide text-blue-700">
                Recent Queries
              </p>

              <div className="space-y-1">
                {recentQueries.map((query) => (
                  <button
                    key={query}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <History size={15} className="text-slate-800 shrink-0" />

                    <span className="truncate text-sm">{query}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </nav>
    </aside>
  );
};

export default LeftNav;
