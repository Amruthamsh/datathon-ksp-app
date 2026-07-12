import React, { useState, useRef, useEffect } from "react";
import {
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Pencil,
  Trash2,
  MoreHorizontal,
  Check,
  X,
} from "lucide-react";
import { menuItems } from "../data/leftNavMenu.js";

const ConversationItem = ({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conv.title || conv.last_message || "Untitled");
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const commitRename = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== (conv.title || conv.last_message || "Untitled")) {
      onRename(conv.conversation_id, trimmed);
    }
    setEditing(false);
  };

  const cancelRename = () => {
    setDraftTitle(conv.title || conv.last_message || "Untitled");
    setEditing(false);
  };

  return (
    <div className={`group relative flex items-center rounded-lg transition ${
      isActive ? "bg-blue-50" : "hover:bg-slate-100"
    }`}>
      {editing ? (
        <div className="flex w-full items-center gap-1 px-2 py-1">
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            className="flex-1 rounded border border-blue-300 bg-white px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button onClick={commitRename} className="rounded p-0.5 hover:bg-green-100 text-green-600">
            <Check size={14} />
          </button>
          <button onClick={cancelRename} className="rounded p-0.5 hover:bg-red-100 text-red-500">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => onSelect(conv.conversation_id)}
            className={`flex flex-1 items-start gap-2 px-3 py-2 text-left ${
              isActive ? "text-blue-700" : "text-slate-700"
            }`}
          >
            <MessageSquare
              size={15}
              className={`mt-0.5 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`}
            />
            <span className="truncate text-sm leading-5">
              {conv.title || conv.last_message || "Untitled"}
            </span>
          </button>

          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`mr-1 rounded p-1 transition ${
                menuOpen ? "bg-slate-200" : "opacity-0 group-hover:opacity-100 hover:bg-slate-200"
              }`}
            >
              <MoreHorizontal size={14} className="text-slate-500" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  onClick={() => { setMenuOpen(false); setEditing(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <Pencil size={13} className="text-slate-500" />
                  Rename
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(conv.conversation_id); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const LeftNav = ({
  expanded,
  setExpanded,
  conversations = [],
  activeConversationId = null,
  onNewChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  historyLoading = false,
}) => {
  return (
    <aside
      className={`bg-white border-r border-slate-200 transition-all duration-300 flex flex-col ${
        expanded ? "w-64" : "w-16"
      }`}
    >
      {/* Fixed Header */}
      <div className="shrink-0 border-b border-slate-200 p-2 space-y-2">
        <div
          className={`flex items-center ${
            expanded ? "justify-between" : "justify-center"
          }`}
        >
          {expanded && (
            <button
              onClick={onNewChat}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-100 transition cursor-pointer"
            >
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

        {!expanded && (
          <button
            onClick={onNewChat}
            className="w-full flex justify-center rounded-lg p-2 hover:bg-slate-100 transition cursor-pointer"
            title="New Chat"
          >
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
                className={`w-full flex items-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${
                  expanded ? "gap-4 px-4 py-2" : "justify-center py-3"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {expanded && (
                  <span className="text-sm font-medium">{item.title}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Conversation history — only when expanded */}
        {expanded && (
          <>
            <div className="mx-3 my-2 border-t border-slate-200" />

            <div className="px-3">
              <p className="mb-2 pl-2 text-sm font-semibold tracking-wide text-blue-700">
                Recent Chats
              </p>

              {historyLoading && (
                <p className="pl-2 text-xs text-slate-400">Loading...</p>
              )}

              {!historyLoading && conversations.length === 0 && (
                <p className="pl-2 text-xs text-slate-400">No conversations yet.</p>
              )}

              <div className="space-y-1">
                {conversations.map((conv) => (
                  <ConversationItem
                    key={conv.conversation_id}
                    conv={conv}
                    isActive={conv.conversation_id === activeConversationId}
                    onSelect={onSelectConversation}
                    onRename={onRenameConversation}
                    onDelete={onDeleteConversation}
                  />
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
