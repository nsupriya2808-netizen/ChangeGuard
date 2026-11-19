import React from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  FolderKanban,
  GitCompare,
  History,
  LayoutDashboard,
  ListOrdered,
  Network,
  Plug,
  Settings,
  X,
} from 'lucide-react';
import type { PageKey } from '../types';
import { ChangeGuardLogo } from './Logo';

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ key: PageKey; label: string; Icon: React.FC<{ className?: string }> }> = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', Icon: FolderKanban },
  { key: 'changes', label: 'Requirement Changes', Icon: GitCompare },
  { key: 'impact', label: 'Impact Analysis', Icon: Activity },
  { key: 'prioritization', label: 'Test Prioritization', Icon: ListOrdered },
  { key: 'dependency-map', label: 'Dependency Map', Icon: Network },
  { key: 'test-history', label: 'Test History', Icon: History },
  { key: 'reports', label: 'Reports', Icon: FileBarChart2 },
  { key: 'integrations', label: 'Integrations', Icon: Plug },
  { key: 'settings', label: 'Settings', Icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const handleSelect = (key: PageKey) => {
    onNavigate(key);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#0B1528] text-slate-200 border-r border-slate-800">
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 shrink-0">
        <ChangeGuardLogo compact={collapsed} lightText />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1" aria-label="Primary Navigation">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const isActive = activePage === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-500 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-800/80 text-xs text-slate-400">
          <p className="font-medium text-slate-300">ChangeGuard</p>
          <p className="mt-0.5 text-slate-400">Impact &amp; Test Prioritization</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[252px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{navContent}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={onCloseMobile} aria-hidden="true" />
          <aside className="relative w-64 max-w-[80vw] h-full z-10">{navContent}</aside>
        </div>
      )}
    </>
  );
};
