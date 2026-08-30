import { Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Users,
  Gavel,
  Clock,
  Share2,
  MessageSquare,
  Download,
} from "lucide-react";
import Header from "../Header";

const TABS = [
  { id: "overview", label: "Case Brief", icon: FileText },
  { id: "people", label: "People", icon: Users },
  { id: "evidence", label: "Evidence", icon: Gavel },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "intel", label: "Intelligence", icon: Share2 },
];

export default function InvestigationWorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { caseId } = useParams();
  const activeTab =
    new URLSearchParams(location.search).get("tab") || "overview";

  const setTab = (tab) => {
    const sp = new URLSearchParams(location.search);
    sp.set("tab", tab);
    navigate(`/investigations/${caseId}?${sp.toString()}`, { replace: true });
    // also dispatch for in-page scroll
    window.dispatchEvent(new CustomEvent("ksp-tab-change", { detail: tab }));
  };

  const backSearch = new URLSearchParams(location.search);
  backSearch.delete("tab");
  const backQs = backSearch.toString();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F4F6F9]">
      <Header hideSearch />
      <div className="flex flex-1 overflow-hidden">
        {/* Collapsed workspace nav — 64px, no Recent Chats */}
        <aside className="flex w-16 shrink-0 flex-col items-center border-r border-[#DDE3EC] bg-white py-3">
          <button
            onClick={() =>
              navigate(`/investigations${backQs ? `?${backQs}` : ""}`)
            }
            className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white text-[#1A1A2E] hover:bg-[#F4F6F9] cursor-pointer"
            title="Back to queue"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-px w-10 bg-[#DDE3EC] mb-3" />
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                title={label}
                className={`mb-1 flex h-9 w-9 items-center justify-center rounded-lg border cursor-pointer ${active ? "border-[#1A1A2E] bg-[#1A1A2E] text-white shadow-sm" : "border-transparent text-[#6B7280] hover:bg-[#F4F6F9] hover:text-[#1A1A2E]"}`}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            title="Export report"
            onClick={() => window.dispatchEvent(new Event("ksp-export-report"))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white text-[#374151] hover:bg-[#F4F6F9] cursor-pointer"
          >
            <Download size={16} />
          </button>
        </aside>
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
