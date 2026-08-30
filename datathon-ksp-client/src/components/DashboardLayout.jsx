import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import Header from "./Header";
import LeftNav from "./LeftNav";
import { useAuth } from "../auth/AuthContext";
import {
  listConversations,
  deleteConversation,
  renameConversation,
} from "../api/chat";

export default function DashboardLayout() {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();

  // Fetch list of chats
  const refreshConversations = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const data = await listConversations(token);

      // FIX: Access data.conversations instead of just data
      if (data && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      } else {
        console.error(
          "API did not return an array in data.conversations:",
          data,
        );
        setConversations([]);
      }
    } catch (err) {
      console.error("Failed to fetch conversations", err);
      setConversations([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Handle Rename
  const handleRename = async (id, newTitle) => {
    await renameConversation(token, id, newTitle);
    setConversations((prev) =>
      prev.map((c) =>
        c.conversation_id === id ? { ...c, title: newTitle } : c,
      ),
    );
  };

  // Handle Delete
  const handleDelete = async (id) => {
    // 1. Delete from API
    await deleteConversation(token, id);

    // 2. Remove from local state
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));

    // 3. Robust Navigation:
    // Check if the current URL contains the ID of the chat we just deleted
    console.log(location.pathname, id);
    if (location.pathname.includes(id)) {
      console.log(`Deleted conversation ${id}. Redirecting to home.`);
      navigate("/", { replace: true });
    }
  };

  return (
    // 'flex flex-col' keeps the header at the top
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <Header />

      {/* 'flex-1 overflow-hidden' ensures the nav and main content fill the rest */}
      <div className="flex flex-1 overflow-hidden gap-3 bg-[#F4F6F9]">
        <LeftNav
          expanded={expanded}
          setExpanded={setExpanded}
          conversations={conversations}
          historyLoading={historyLoading}
          onRenameConversation={handleRename}
          onDeleteConversation={handleDelete}
        />
        <main className="flex-1 h-full overflow-hidden">
          <Outlet context={{ refreshConversations }} />
        </main>
      </div>
    </div>
  );
}
