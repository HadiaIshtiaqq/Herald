import React, { useState } from "react";
import { Search, Bell, HelpCircle, Sun, Moon, History, X } from "lucide-react";
import HeraldLogo from "./HeraldLogo";

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  userAvatar: string;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
}

export default function Header({ searchQuery, setSearchQuery, userAvatar, isDarkMode, setIsDarkMode }: HeaderProps) {
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("heraldRecentSearches");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showRecent, setShowRecent] = useState(false);

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
    if (e.key === "Enter") {
      saveSearch(searchQuery);
      setShowRecent(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSelectRecent = (term: string) => {
    setSearchQuery(term);
    saveSearch(term);
    setShowRecent(false);
  };

  const handleDeleteRecent = (e: React.MouseEvent, termToDelete: string) => {
    e.stopPropagation();
    setRecentSearches(prev => {
      const updated = prev.filter(item => item !== termToDelete);
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
      {/* Brand & Left Section */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <HeraldLogo size={32} />
          <span className="text-xl font-bold text-slate-900 dark:text-blue-400 tracking-wider">HERALD</span>
        </div>
        
        {/* Desktop Search Bar */}
        <div className="hidden md:flex relative group items-center">
          <Search className="absolute left-3 w-4 h-4 text-[#605E5C] dark:text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowRecent(true)}
            onBlur={() => setTimeout(() => setShowRecent(false), 200)}
            onKeyDown={handleKeyDown}
            className="pl-9 pr-4 py-1.5 bg-[#F3F2F1] dark:bg-slate-800 border border-[#EDEBE9] dark:border-slate-700 rounded-lg text-sm text-[#201F1E] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] w-64 lg:w-80 transition-all font-sans placeholder:text-gray-400 dark:placeholder:text-slate-500"
            placeholder="Search pull requests..."
            type="text"
          />

          {showRecent && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-900 border border-[#EDEBE9] dark:border-slate-800 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1">
              <div className="px-3 py-2 border-b border-[#EDEBE9] dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/40 flex justify-between items-center select-none">
                <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Recent Searches</span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleClearAll}
                  className="text-[10px] font-bold text-[#0078D4] hover:text-[#005faa] dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
              <div className="py-1">
                {recentSearches.map((term, index) => (
                  <div
                    key={index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectRecent(term)}
                    className="flex justify-between items-center px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors text-slate-700 dark:text-slate-300 group/item"
                  >
                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                      <History className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0" />
                      <span className="text-xs truncate font-medium">{term}</span>
                    </div>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => handleDeleteRecent(e, term)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 rounded hover:bg-gray-100 dark:hover:bg-slate-800 opacity-0 group-hover/item:opacity-100 transition-opacity"
                      title="Delete search record"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right User Actions */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle Button */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full p-2 transition-colors cursor-pointer"
        >
          {isDarkMode ? (
            <Sun className="w-[18px] h-[18px] text-amber-500" />
          ) : (
            <Moon className="w-[18px] h-[18px] text-[#404752] dark:text-slate-300" />
          )}
        </button>

        {/* Simple Notification Button */}
        <button 
          title="Notifications"
          className="hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full p-2 transition-colors relative cursor-pointer"
        >
          <Bell className="w-[18px] h-[18px] text-[#404752] dark:text-slate-300" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        </button>

        {/* Support Link */}
        <button 
          title="Help & Info"
          className="hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full p-2 transition-colors cursor-pointer"
        >
          <HelpCircle className="w-[18px] h-[18px] text-[#404752] dark:text-slate-300" />
        </button>

        {/* Separator */}
        <div className="h-6 w-[1px] bg-gray-200 dark:bg-slate-800 mx-1"></div>

        {/* User Account Capsule */}
        <div className="flex items-center gap-2 pl-1 cursor-pointer group">
          <div className="h-8 w-8 rounded-full overflow-hidden border border-gray-200 dark:border-slate-700 shadow-sm transition-transform group-hover:scale-105 duration-150">
            <img
              alt="User Profile Avatar"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              src={userAvatar}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
