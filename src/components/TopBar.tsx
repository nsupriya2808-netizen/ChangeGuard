import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  User as UserIcon,
} from 'lucide-react';
import type { NotificationItem, PageKey, Project, User } from '../types';

interface TopBarProps {
  pageTitle: string;
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  user: User;
  onNavigate: (page: PageKey) => void;
  onLogout: () => void;
  onOpenMobileNav: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  pageTitle,
  projects,
  selectedProjectId,
  onSelectProject,
  notifications,
  onMarkAllRead,
  user,
  onNavigate,
  onLogout,
  onOpenMobileNav,
  searchQuery,
  onSearchChange,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-4 h-4" />
        </button>
        <h1 className="font-display text-lg lg:text-xl font-semibold text-slate-900 dark:text-white truncate">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Project Selector */}
        <div className="hidden sm:flex items-center">
          <label htmlFor="global-project-select" className="sr-only">
            Active Project
          </label>
          <select
            id="global-project-select"
            value={selectedProjectId ?? ''}
            onChange={(e) => onSelectProject(Number(e.target.value))}
            className="h-9 max-w-[230px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.is_demo ? '(Demo)' : `(${p.current_version})`}
              </option>
            ))}
          </select>
        </div>

        {/* Live Search */}
        <div className="relative hidden md:block w-52 lg:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter current view..."
            aria-label="Filter current view"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="View notifications"
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">No notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 text-sm ${
                        n.is_read === 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <p className="font-medium text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                      <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                        {new Date(n.created_at + 'Z').toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {user.avatar_url && !imgError ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-6 h-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <span className="hidden sm:inline text-sm font-medium text-slate-800 dark:text-slate-100 max-w-[120px] truncate">
              {user.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg z-50 py-1">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onNavigate('settings');
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <UserIcon className="w-4 h-4 text-slate-400" />
                Profile &amp; Preferences
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onNavigate('settings');
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                System Settings
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
