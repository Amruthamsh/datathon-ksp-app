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
} from "lucide-react";
import logo from "../assets/Seal_of_Karnataka.svg";
import profile from "../assets/profile.svg";
import LanguageSelector from "../components/LanguageSelector";

const menuItems = [
  {
    title: "Investigations",
    icon: FolderKanban,
  },
  {
    title: "Crime Hotspots",
    icon: MapPinned,
  },
  {
    title: "Criminal Networks",
    icon: Network,
  },
  {
    title: "Reports",
    icon: FileText,
  },
];

export default function Home() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <img src={logo} alt="Logo" className="h-8 w-8" />
          <h1 className="text-xl font-semibold text-red-700">
            KSP Intelligence Framework
          </h1>
          <LanguageSelector />
        </div>
        <div className="flex items-center gap-6">
          <Bell size={24} />
          <BadgeQuestionMarkIcon size={24} />
          <p>Amruthamsh</p>
          <img src={profile} alt="Profile" className="h-8 w-8 rounded-full" />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`bg-white border-r border-slate-200 transition-all duration-300 ${
            expanded ? "w-64" : "w-16"
          }`}
        >
          {/* Collapse Button */}
          <div
            className={`h-12 flex ${
              expanded ? "justify-end pr-3" : "justify-center"
            } items-center border-b border-slate-200`}
          >
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg p-2 hover:bg-slate-100 transition"
            >
              {expanded ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="py-3">
            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.title}
                  className={`
                    mx-2 mb-1
                    flex items-center
                    rounded-xl
                    hover:bg-slate-100
                    transition
                    ${expanded ? "px-4 py-3 gap-4" : "justify-center p-3"}
                  `}
                >
                  <Icon size={22} className="shrink-0" />

                  {expanded && (
                    <span className="font-medium">{item.title}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 bg-slate-100 p-6 overflow-auto">
          Main Content
        </main>

        {/* Right Panel
        <aside className="w-96 border-l bg-white p-6">Timeline</aside> */}
      </div>
    </div>
  );
}
