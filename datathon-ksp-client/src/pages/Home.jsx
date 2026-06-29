import { useState } from "react";
import { menuItems } from "../data/leftNavMenu.js";
import { recentQueries } from "../data/recentQueries.js";
import Header from "../components/Header.jsx";
import LeftNav from "../components/LeftNav.jsx";

export default function Home() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav expanded={expanded} setExpanded={setExpanded} />
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
