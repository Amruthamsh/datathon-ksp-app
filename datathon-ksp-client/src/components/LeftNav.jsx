import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

const ConversationItem = ({ conv, isActive, onSelect, onRename, onDelete }) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(
    conv.title || conv.last_message || t("nav.untitled"),
  );
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

  const commitRename = (e) => {
    e.stopPropagation();
    const trimmed = draftTitle.trim();
    if (
      trimmed &&
      trimmed !== (conv.title || conv.last_message || t("nav.untitled"))
    ) {
      onRename(conv.conversation_id, trimmed);
    }
    setEditing(false);
  };

  const cancelRename = (e) => {
    e.stopPropagation();
    setDraftTitle(conv.title || conv.last_message || t("nav.untitled"));
    setEditing(false);
  };

  return (
    <div
      className={`group relative flex items-center rounded-lg transition ${
        isActive ? "bg-blue-900/90 text-white" : "hover:bg-slate-100"
      }`}
    >
      {editing ? (
        <div className="flex w-full items-center gap-1 px-2 py-1">
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename(e);
              if (e.key === "Escape") cancelRename(e);
            }}
            className="flex-1 rounded border border-blue-300 bg-white px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={commitRename}
            className="rounded p-0.5 hover:bg-green-100 text-green-600"
          >
            <Check size={14} />
          </button>
          <button
            onClick={cancelRename}
            className="rounded p-0.5 hover:bg-red-100 text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => onSelect(conv.conversation_id)}
            className={`flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left cursor-pointer ${
              isActive ? "text-white" : "text-slate-700"
            }`}
          >
            <MessageSquare
              size={15}
              className={`mt-0.5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}
            />
            <span className="min-w-0 flex-1 truncate text-sm leading-5">
              {conv.title || conv.last_message || t("nav.untitled")}
            </span>
          </button>

          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              className={`mr-1 rounded p-1 transition ${
                isActive
                  ? menuOpen
                    ? "bg-white/20 text-white"
                    : "opacity-0 group-hover:opacity-100 hover:bg-white/20 text-white"
                  : menuOpen
                    ? "bg-slate-200"
                    : "opacity-0 group-hover:opacity-100 hover:bg-slate-200"
              }`}
            >
              <MoreHorizontal size={14} className={isActive ? "text-white" : "text-slate-500"} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <Pencil size={13} className="text-slate-500" /> {t("nav.rename")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(conv.conversation_id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} /> {t("nav.delete")}
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
  onRenameConversation,
  onDeleteConversation,
  historyLoading = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const menuKeys = ["investigations", "crimeIntelligenceMap", "criminalNetworks", "reports"];
  const routeMap = {
    [t("nav.investigations")]: "/investigations",
    [t("nav.crimeIntelligenceMap")]: "/crime-intelligence-map",
    [t("nav.criminalNetworks")]: "/networks",
    [t("nav.reports")]: "/reports",
  };

  const translatedMenuItems = menuItems.map((item, i) => ({
    ...item,
    title: t(`nav.${menuKeys[i]}`),
  }));

  return (
    <aside
      className={`bg-white border-r border-slate-200 transition-all duration-300 flex flex-col ${
        expanded ? "w-64" : "w-16"
      }`}
    >
      <div className="shrink-0 border-b border-slate-200 p-2 space-y-2">
        <div
          className={`flex items-center ${expanded ? "justify-between" : "justify-center"}`}
        >
          {expanded && (
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-100 transition cursor-pointer"
            >
              <SquarePen size={18} />
              {t("nav.newChat")}
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-2 hover:bg-slate-100 transition cursor-pointer"
          >
            {expanded ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <div className="px-2 py-3 space-y-1">
          {(translatedMenuItems || []).map((item) => {
            const Icon = item.icon;
            const targetPath = routeMap[item.title];
            const isActive = location.pathname === targetPath;

            return (
              <button
                key={item.title}
                onClick={() => navigate(targetPath)}
                className={`w-full flex items-center rounded-lg transition-colors cursor-pointer ${
                  expanded ? "gap-4 px-4 py-2" : "justify-center py-3"
                } ${isActive ? "bg-blue-900/90 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                <Icon
                  size={18}
                  className={isActive ? "text-white" : "text-slate-500"}
                />
                {expanded && (
                  <span className="text-sm font-medium">{item.title}</span>
                )}
              </button>
            );
          })}
        </div>

        {expanded && (
          <>
            <div className="mx-3 my-2 border-t border-slate-200" />
            <div className="px-3">
              <p className="mb-2 pl-2 text-sm font-semibold tracking-wide text-blue-700">
                {t("nav.recentChats")}
              </p>

              <div className="space-y-1">
                {Array.isArray(conversations) &&
                  [...conversations]
                    .sort(
                      (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
                    )
                    .map((conv) => (
                      <ConversationItem
                        key={conv.conversation_id}
                        conv={conv}
                        isActive={
                          location.pathname === `/chat/${conv.conversation_id}`
                        }
                        onSelect={(id) => navigate(`/chat/${id}`)}
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
