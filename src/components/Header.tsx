import React, { useState, useRef, useEffect } from "react";
import {
  Search, Bell, HelpCircle, Sun, Moon, History, X,
  CheckCircle2, AlertTriangle, GitBranch, Settings,
  LogOut, User, ChevronRight, ExternalLink, Zap,
  BookOpen, Webhook
} from "lucide-react";
import HeraldLogo from "./HeraldLogo";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: "success" | "warning" | "error" | "info";
  time: string;
  read: boolean;
}

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  userAvatar: string;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  onNavigate?: (tab: string) => void;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "High-risk breaking change detected",
    body: "Auth token migration (PR #144) classified as high risk — 2 breaking changes flagged.",
    type: "error",
    time: "2m ago",
    read: false
  },
  {
    id: "n2",
    title: "Graph API integration run complete",
    body: "PR #142 artifacts ready for review. Risk: Medium. Teams + SharePoint actions pending.",
    type: "info",
    time: "18m ago",
    read: false
  },
  {
    id: "n3",
    title: "Release approved and sent",
    body: "Memory leak fix (PR #143) posted to #engineering-releases and SharePoint log updated.",
    type: "success",
    time: "1h ago",
    read: true
  },
  {
    id: "n4",
    title: "Webhook signature warning",
    body: "One webhook delivery failed signature check — possible replay attempt. Delivery ignored.",
    type: "warning",
    time: "3h ago",
    read: true
  }
];

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onClose]);
}

const notifIcon: Record<NotificationItem["type"], React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-[#2E9E6B]" />,
  warning: <AlertTriangle className="w-4 h-4 text-[#E0A93B]" />,
  error: <Zap className="w-4 h-4 text-[#D5544A]" />,
  info: <GitBranch className="w-4 h-4 text-[#0078D4]" />
};

export default function Header({
  searchQuery, setSearchQuery, userAvatar, isDarkMode, setIsDarkMode, onNavigate
}: HeaderProps) {
  // ── Search state ──────────────────────────────────────────────────────────
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("heraldRecentSearches");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showRecent, setShowRecent] = useState(false);

  // ── Panel state ───────────────────────────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const stored = localStorage.getItem("heraldNotifications");
      return stored ? JSON.parse(stored) : INITIAL_NOTIFICATIONS;
    } catch { return INITIAL_NOTIFICATIONS; }
  });

  const notifRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useClickOutside(notifRef, () => setShowNotifications(false));
  useClickOutside(helpRef, () => setShowHelp(false));
  useClickOutside(userRef, () => setShowUserMenu(false));

  const unreadCount = notifications.filter(n => !n.read).length;

  const saveNotifs = (updated: NotificationItem[]) => {
    setNotifications(updated);
    localStorage.setItem("heraldNotifications", JSON.stringify(updated));
  };

  const markAllRead = () => saveNotifs(notifications.map(n => ({ ...n, read: true })));
  const dismissNotif = (id: string) => saveNotifs(notifications.filter(n => n.id !== id));

  const openNotifications = () => {
    setShowNotifications(v => !v);
    setShowHelp(false);
    setShowUserMenu(false);
    if (!showNotifications) saveNotifs(notifications.map(n => ({ ...n, read: true })));
  };

  // ── Search handlers ───────────────────────────────────────────────────────
  const saveSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(item => item !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 6);
      localStorage.setItem("heraldRecentSearches", JSON.stringify(updated));
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { saveSearch(searchQuery); setShowRecent(false); (e.target as HTMLInputElement).blur(); }
    if (e.key === "Escape") { setSearchQuery(""); setShowRecent(false); (e.target as HTMLInputElement).blur(); }
  };

  const handleSelectRecent = (term: string) => { setSearchQuery(term); saveSearch(term); setShowRecent(false); };

  const handleDeleteRecent = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    setRecentSearches(prev => {
      const updated = prev.filter(item => item !== term);
      localStorage.setItem("heraldRecentSearches", JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    localStorage.removeItem("heraldRecentSearches");
  };

  return (
    <header className="flex justify-between items-center h-16 px-6 md:px-8 w-full sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-[#EDEBE9] dark:border-slate-800 transition-colors duration-150">

      {/* Brand + Search */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <HeraldLogo size={32} />
          <span className="text-xl font-bold text-slate-900 dark:text-blue-400 tracking-wider">HERALD</span>
        </div>

        <div className="hidden md:flex relative group items-center">
          <Search className="absolute left-3 w-4 h-4 text-[#605E5C] dark:text-slate-400 pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowRecent(true)}
            onBlur={() => setTimeout(() => setShowRecent(false), 200)}
            onKeyDown={handleKeyDown}
            className="pl-9 pr-8 py-1.5 bg-[#F3F2F1] dark:bg-slate-800 border border-[#EDEBE9] dark:border-slate-700 rounded-lg text-sm text-[#201F1E] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] w-64 lg:w-80 transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500"
            placeholder="Search pull requests..."
            type="text"
            aria-label="Search pull requests"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {showRecent && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1">
              <div className="px-3 py-2 border-b border-[#EDEBE9] dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Recent Searches</span>
                <button onMouseDown={(e) => e.preventDefault()} onClick={handleClearAll}
                  className="text-[10px] font-bold text-[#0078D4] hover:text-[#005faa] cursor-pointer">
                  Clear All
                </button>
              </div>
              <div className="py-1">
                {recentSearches.map((term, i) => (
                  <div key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectRecent(term)}
                    className="flex justify-between items-center px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 cursor-pointer group/item">
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      <History className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-xs truncate font-medium text-slate-700 dark:text-slate-300">{term}</span>
                    </div>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={(e) => handleDeleteRecent(e, term)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5">

        {/* Dark mode toggle */}
        <button onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full p-2 transition-colors cursor-pointer"
          aria-label="Toggle dark mode">
          {isDarkMode
            ? <Sun className="w-[18px] h-[18px] text-amber-500" />
            : <Moon className="w-[18px] h-[18px] text-[#404752] dark:text-slate-300" />}
        </button>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button onClick={openNotifications}
            title="Notifications"
            className={`hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full p-2 transition-colors relative cursor-pointer ${showNotifications ? "bg-gray-100 dark:bg-slate-800" : ""}`}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}>
            <Bell className="w-[18px] h-[18px] text-[#404752] dark:text-slate-300" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
              <div className="px-4 py-3 border-b border-[#EDEBE9] dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-[#201F1E] dark:text-slate-100">Notifications</span>
                <button onClick={markAllRead}
                  className="text-[11px] font-semibold text-[#0078D4] hover:text-[#005faa] cursor-pointer">
                  Mark all read
                </button>
              </div>
              <div className="divide-y divide-[#EDEBE9] dark:divide-slate-800 max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#605E5C] dark:text-slate-400">
                    No notifications
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id}
                    className={`flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors ${!n.read ? "bg-[#0078D4]/3 dark:bg-blue-950/10" : ""}`}>
                    <span className="mt-0.5 shrink-0">{notifIcon[n.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${n.read ? "text-[#605E5C] dark:text-slate-400" : "text-[#201F1E] dark:text-slate-100"}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-[#7C8499] dark:text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-600 mt-1 font-mono">{n.time}</p>
                    </div>
                    <button onClick={() => dismissNotif(n.id)}
                      className="shrink-0 p-0.5 text-gray-300 hover:text-gray-500 dark:text-slate-600 dark:hover:text-slate-400 rounded cursor-pointer mt-0.5"
                      title="Dismiss">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-[#EDEBE9] dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40">
                <button
                  onClick={() => { setShowNotifications(false); onNavigate?.("runs"); }}
                  className="w-full text-center text-[11px] font-bold text-[#0078D4] hover:text-[#005faa] flex items-center justify-center gap-1 cursor-pointer">
                  View pipeline runs <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help */}
        <div ref={helpRef} className="relative">
          <button onClick={() => { setShowHelp(v => !v); setShowNotifications(false); setShowUserMenu(false); }}
            title="Help & Documentation"
            className={`hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full p-2 transition-colors cursor-pointer ${showHelp ? "bg-gray-100 dark:bg-slate-800" : ""}`}
            aria-label="Help and documentation">
            <HelpCircle className="w-[18px] h-[18px] text-[#404752] dark:text-slate-300" />
          </button>

          {showHelp && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
              <div className="px-4 py-3 border-b border-[#EDEBE9] dark:border-slate-800 bg-gradient-to-r from-[#0078D4]/5 to-transparent">
                <p className="text-sm font-bold text-[#201F1E] dark:text-slate-100">Herald Release Concierge</p>
                <p className="text-[11px] text-[#7C8499] dark:text-slate-400 mt-0.5">v2.4.1 · Hackathon Build 2026</p>
              </div>
              <div className="p-3 space-y-1">
                {[
                  { icon: <Webhook className="w-3.5 h-3.5" />, label: "Webhook endpoint", value: "POST /webhook/github" },
                  { icon: <GitBranch className="w-3.5 h-3.5" />, label: "Demo trigger", value: "POST /runs/demo/trigger" },
                  { icon: <BookOpen className="w-3.5 h-3.5" />, label: "Run state machine", value: "reasoning → review → done" }
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <span className="text-[#0078D4] mt-0.5 shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-[11px] font-bold text-[#201F1E] dark:text-slate-200">{item.label}</p>
                      <p className="text-[10px] text-[#605E5C] dark:text-slate-400 font-mono">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 pb-3 space-y-1.5">
                <p className="text-[10px] font-bold text-[#7C8499] dark:text-slate-500 uppercase tracking-widest px-2 mb-1">Quick nav</p>
                {[
                  { label: "Webhook Runs", tab: "runs" },
                  { label: "Release Workspace", tab: "workspace" },
                  { label: "Settings", tab: "settings" }
                ].map(item => (
                  <button key={item.tab}
                    onClick={() => { setShowHelp(false); onNavigate?.(item.tab); }}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-semibold text-[#201F1E] dark:text-slate-300 hover:bg-[#0078D4]/5 hover:text-[#0078D4] transition-colors cursor-pointer">
                    {item.label}
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                  </button>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-[#EDEBE9] dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40">
                <a href="https://github.com/anthropics/claude-code/issues" target="_blank" rel="noreferrer"
                  className="text-[11px] font-bold text-[#0078D4] hover:text-[#005faa] flex items-center gap-1">
                  Report an issue <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-6 w-[1px] bg-gray-200 dark:bg-slate-800 mx-1" />

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => { setShowUserMenu(v => !v); setShowNotifications(false); setShowHelp(false); }}
            className="flex items-center gap-2 pl-1 cursor-pointer group"
            aria-label="User menu"
            title="Account">
            <div className="h-8 w-8 rounded-full overflow-hidden border-2 border-transparent group-hover:border-[#0078D4]/40 shadow-sm transition-all duration-150">
              <img alt="User Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={userAvatar} />
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
              <div className="px-4 py-3 border-b border-[#EDEBE9] dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <img alt="Avatar" src={userAvatar} className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-slate-700" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#201F1E] dark:text-slate-100 truncate">Hadia Ishtiaqq</p>
                    <p className="text-[11px] text-[#7C8499] dark:text-slate-400 truncate">hadiaishtiaq90@gmail.com</p>
                  </div>
                </div>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setShowUserMenu(false); onNavigate?.("settings"); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#201F1E] dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer">
                  <Settings className="w-4 h-4 text-[#605E5C] dark:text-slate-400" />
                  Settings
                </button>
                <button
                  onClick={() => { setShowUserMenu(false); onNavigate?.("runs"); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#201F1E] dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer">
                  <GitBranch className="w-4 h-4 text-[#605E5C] dark:text-slate-400" />
                  Webhook Runs
                </button>
              </div>
              <div className="border-t border-[#EDEBE9] dark:border-slate-800 py-1">
                <button
                  onClick={() => { setShowUserMenu(false); alert("Sign-out is not available in the hackathon build."); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#D5544A] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
