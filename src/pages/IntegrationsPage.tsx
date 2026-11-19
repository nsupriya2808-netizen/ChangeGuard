import React, { useEffect, useState } from 'react';
import { GitBranch, Github, Loader2, PlayCircle, Server, Unplug, X } from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel';
import { apiFetch } from '../lib/api';
import type { IntegrationItem, Project } from '../types';

interface IntegrationsPageProps {
  project: Project | null;
  onToast: (type: 'success' | 'error', text: string) => void;
}

const PROVIDER_META: Record<
  IntegrationItem['provider'],
  { title: string; subtitle: string; Icon: React.FC<{ className?: string }>; fields: Array<{ key: string; label: string; placeholder: string; type?: string }> }
> = {
  github: {
    title: 'GitHub',
    subtitle: 'Sync requirement markdown files and pull request diffs directly from a repository.',
    Icon: Github,
    fields: [
      { key: 'repository', label: 'Repository (owner/repo)', placeholder: 'org/online-banking' },
      { key: 'branch', label: 'Base Branch', placeholder: 'main' },
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
    ],
  },
  git: {
    title: 'Git Remote',
    subtitle: 'Connect any HTTPS Git server to track specification commits and code module changes.',
    Icon: GitBranch,
    fields: [
      { key: 'remoteUrl', label: 'HTTPS Remote URL', placeholder: 'https://git.example.com/repo.git' },
      { key: 'branch', label: 'Default Branch', placeholder: 'main' },
      { key: 'accessToken', label: 'Access Token (if private)', placeholder: 'Optional token', type: 'password' },
    ],
  },
  jenkins: {
    title: 'Jenkins CI',
    subtitle: 'Trigger prioritized regression jobs and ingest real JUnit test execution reports.',
    Icon: Server,
    fields: [
      { key: 'serverUrl', label: 'Jenkins Server URL', placeholder: 'https://jenkins.example.com' },
      { key: 'jobName', label: 'Pipeline Job Name', placeholder: 'banking-regression-suite' },
      { key: 'username', label: 'Username', placeholder: 'ci-bot' },
      { key: 'apiToken', label: 'API Token', placeholder: 'Jenkins API token', type: 'password' },
    ],
  },
  github_actions: {
    title: 'GitHub Actions',
    subtitle: 'Dispatch prioritized test workflows and collect automated pass/fail artifacts.',
    Icon: PlayCircle,
    fields: [
      { key: 'repository', label: 'Repository (owner/repo)', placeholder: 'org/online-banking' },
      { key: 'workflowFile', label: 'Workflow Filename', placeholder: 'regression.yml' },
      { key: 'token', label: 'GitHub Token (workflow scope)', placeholder: 'ghp_...', type: 'password' },
    ],
  },
};

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({ project, onToast }) => {
  const [items, setItems] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState<IntegrationItem['provider'] | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);

  const loadIntegrations = async (projectId: number) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ integrations: IntegrationItem[] }>(`/api/projects/${projectId}/integrations`);
      setItems(res.integrations);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (project) {
      loadIntegrations(project.id);
    }
  }, [project?.id]);

  const openConfig = (item: IntegrationItem) => {
    setActiveProvider(item.provider);
    setFormValues({ ...item.config });
  };

  const handleTestAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !activeProvider) return;
    setTesting(true);
    try {
      const res = await apiFetch<{ message: string }>(`/api/projects/${project.id}/integrations/${activeProvider}/test`, {
        method: 'POST',
        body: JSON.stringify(formValues),
      });
      onToast('success', res.message);
      setActiveProvider(null);
      await loadIntegrations(project.id);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Connection verification failed.');
      await loadIntegrations(project.id);
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async (provider: IntegrationItem['provider']) => {
    if (!project) return;
    try {
      await apiFetch(`/api/projects/${project.id}/integrations/${provider}/disconnect`, { method: 'POST' });
      await loadIntegrations(project.id);
      onToast('success', 'Integration disconnected.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to disconnect.');
    }
  };

  if (!project) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
        Select a project to manage external integrations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Integrations</span>
          <span aria-hidden="true">·</span>
          <span>{project.name}</span>
        </div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
          Source Control &amp; CI/CD Integrations
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Integrations remain marked Not Connected until valid credentials pass live connectivity verification.
        </p>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((item) => {
            const meta = PROVIDER_META[item.provider];
            const Icon = meta.Icon;
            const isConnected = item.status === 'connected';
            return (
              <div
                key={item.provider}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                          {meta.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.last_checked_at
                            ? `Checked ${new Date(item.last_checked_at + 'Z').toLocaleString()}`
                            : 'No connection check performed'}
                        </p>
                      </div>
                    </div>
                    <StatusLabel variant={isConnected ? 'connected' : 'not_connected'} />
                  </div>

                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{meta.subtitle}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono">{item.last_message}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openConfig(item)}
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    {isConnected ? 'Reconfigure' : 'Configure & Connect'}
                  </button>
                  {isConnected && (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(item.provider)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Unplug className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Configuration Modal */}
      {activeProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Configure {PROVIDER_META[activeProvider].title}
              </h3>
              <button type="button" onClick={() => setActiveProvider(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleTestAndConnect} className="p-5 space-y-4">
              {PROVIDER_META[activeProvider].fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {f.label}
                  </label>
                  <input
                    type={f.type || 'text'}
                    value={formValues[f.key] || ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveProvider(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testing}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Test &amp; Verify Connection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
