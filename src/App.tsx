import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { TopBar } from './components/TopBar';
import { apiFetch, clearStoredToken, getStoredToken } from './lib/api';
import { DashboardPage } from './pages/DashboardPage';
import { DependencyMapPage } from './pages/DependencyMapPage';
import { ImpactAnalysisPage } from './pages/ImpactAnalysisPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ReportsPage } from './pages/ReportsPage';
import { RequirementChangesPage } from './pages/RequirementChangesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TestHistoryPage } from './pages/TestHistoryPage';
import { TestPrioritizationPage } from './pages/TestPrioritizationPage';
import type { NotificationItem, PageKey, Project, User } from './types';

const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  changes: 'Requirement Changes',
  impact: 'Impact Analysis',
  prioritization: 'Test Prioritization',
  'dependency-map': 'Dependency Map',
  'test-history': 'Test History',
  reports: 'Reports & Analytics',
  integrations: 'Integrations',
  settings: 'Settings',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    if (user?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [user?.theme]);

  const loadWorkspace = useCallback(async () => {
    const [projRes, notifRes] = await Promise.all([
      apiFetch<{ projects: Project[] }>('/api/projects'),
      apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
    ]);
    setProjects(projRes.projects);
    setNotifications(notifRes.notifications);
    setSelectedProjectId((curr) => {
      if (curr && projRes.projects.some((p) => p.id === curr)) return curr;
      return projRes.projects[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    apiFetch<{ user: User }>('/api/auth/me')
      .then(async (res) => {
        setUser(res.user);
        await loadWorkspace();
      })
      .catch(() => {
        clearStoredToken();
        setUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, [loadWorkspace]);

  const handleLoginSuccess = async (loggedUser: User) => {
    setUser(loggedUser);
    try {
      await loadWorkspace();
    } catch {
      pushToast('error', 'Signed in, but failed to load project workspace.');
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
    setProjects([]);
    setSelectedProjectId(null);
    document.documentElement.classList.remove('dark');
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {
      pushToast('error', 'Failed to mark notifications as read.');
    }
  };

  const handleNavigate = (page: PageKey) => {
    setActivePage(page);
    setSearchQuery('');
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          pageTitle={PAGE_TITLES[activePage]}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => setSelectedProjectId(id)}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          user={user}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {activePage === 'dashboard' && (
            <DashboardPage
              selectedProject={selectedProject}
              onSelectProject={(id) => setSelectedProjectId(id)}
              onNavigate={handleNavigate}
              searchQuery={searchQuery}
            />
          )}

          {activePage === 'projects' && (
            <ProjectsPage
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={(id) => setSelectedProjectId(id)}
              onRefreshProjects={loadWorkspace}
              onNavigate={handleNavigate}
              onToast={pushToast}
              searchQuery={searchQuery}
            />
          )}

          {activePage === 'changes' && (
            <RequirementChangesPage
              project={selectedProject}
              onNavigate={handleNavigate}
              onToast={pushToast}
              searchQuery={searchQuery}
            />
          )}

          {activePage === 'impact' && (
            <ImpactAnalysisPage
              project={selectedProject}
              onNavigate={handleNavigate}
              onToast={pushToast}
              searchQuery={searchQuery}
            />
          )}

          {activePage === 'prioritization' && (
            <TestPrioritizationPage
              project={selectedProject}
              onNavigate={handleNavigate}
              onToast={pushToast}
              searchQuery={searchQuery}
            />
          )}

          {activePage === 'dependency-map' && (
            <DependencyMapPage project={selectedProject} onToast={pushToast} />
          )}

          {activePage === 'test-history' && (
            <TestHistoryPage
              projects={projects}
              selectedProjectId={selectedProjectId}
              onToast={pushToast}
              searchQuery={searchQuery}
            />
          )}

          {activePage === 'reports' && (
            <ReportsPage project={selectedProject} onToast={pushToast} />
          )}

          {activePage === 'integrations' && (
            <IntegrationsPage project={selectedProject} onToast={pushToast} />
          )}

          {activePage === 'settings' && (
            <SettingsPage user={user} onUpdateUser={setUser} onToast={pushToast} />
          )}
        </main>
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
