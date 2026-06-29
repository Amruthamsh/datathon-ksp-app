import { useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  MapPinned,
  Network,
  Bell,
  FileText,
  FolderKanban,
  User,
  FileQuestion,
  BadgeQuestionMarkIcon,
  Globe,
  History,
  Search,
  SquarePen,
} from "lucide-react";
import logo from "../assets/Seal_of_Karnataka.svg";
import profile from "../assets/profile.svg";
import LanguageSelector from "../components/LanguageSelector";
import { menuItems } from "../data/leftNavMenu.js";
import { recentQueries } from "../data/recentQueries.js";

export default function Home() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <img src={logo} alt="Logo" className="h-8 w-8" />
          <h1 className="text-xl font-semibold text-red-700">
            KSP Intelligence Framework
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative w-96">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
            />
            <input
              type="text"
              placeholder="Search FIRs, accused, victims, locations..."
              className="
                w-full
                rounded-xl
                border
                border-slate-300
                bg-slate-50
                py-2
                pl-10
                pr-14
                text-sm
                placeholder:text-slate-400
                focus:border-blue-500
                focus:bg-white
                focus:outline-none
                focus:ring-2
                focus:ring-blue-100
                transition
              "
            />
          </div>
          <LanguageSelector />
          <Bell size={24} />
          <BadgeQuestionMarkIcon size={24} />
          <p>Amruthamsh</p>
          <img src={profile} alt="Profile" className="h-8 w-8 rounded-full" />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
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
                        <History
                          size={15}
                          className="text-slate-800 shrink-0"
                        />

                        <span className="truncate text-sm">{query}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </nav>
        </aside>
        {/* Main */}
        <main className="flex-1 bg-slate-100 p-6 overflow-auto">
          Main Content
        </main>

        {/* Right Panel
          <aside className="w-96 border-l bg-white p-6">Timeline</aside> 
        */}
      </div>
    </div>
  );
}
