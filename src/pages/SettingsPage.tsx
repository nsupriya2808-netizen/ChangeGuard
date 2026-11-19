import React, { useEffect, useState } from 'react';
import { Database, Loader2, Moon, Save, ShieldCheck, Sun } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { User } from '../types';

interface SettingsPageProps {
  user: User;
  onUpdateUser: (u: User) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}

interface SystemStatus {
  database: {
    engine: string;
    status: string;
    path: string;
    sizeBytes: number;
    tables: Record<string, number>;
  };
  runtime: {
    backend: string;
    nodeVersion: string;
    graphEngine: string;
    nlpEngine: string;
    prioritizationEngine: string;
  };
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, onUpdateUser, onToast }) => {
  const parsedPrefs = (() => {
    try {
      return JSON.parse(user.preferences_json || '{}') as {
        defaultPrioritizationThreshold?: number;
        autoRunImpactOnDiff?: boolean;
      };
    } catch {
      return {};
    }
  })();

  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [theme, setTheme] = useState<'light' | 'dark'>(user.theme === 'dark' ? 'dark' : 'light');
  const [threshold, setThreshold] = useState(parsedPrefs.defaultPrioritizationThreshold ?? 60);
  const [autoChain, setAutoChain] = useState(parsedPrefs.autoRunImpactOnDiff ?? true);
  const [saving, setSaving] = useState(false);

  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [loadingSys, setLoadingSys] = useState(true);

  useEffect(() => {
    apiFetch<SystemStatus>('/api/system/status')
      .then(setSysStatus)
      .catch(() => {})
      .finally(() => setLoadingSys(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          theme,
          preferences: {
            defaultPrioritizationThreshold: Number(threshold),
            autoRunImpactOnDiff: autoChain,
          },
        }),
      });
      onUpdateUser(res.user);
      onToast('success', 'Settings and profile preferences saved.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          Settings &amp; System Configuration
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your engineering profile, appearance theme, analysis defaults, and database diagnostics.
        </p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Profile */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">User Profile</h3>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-sm text-slate-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Engineering Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Theme & Project Preferences */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Theme &amp; Analysis Preferences</h3>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Interface Theme</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 h-10 rounded-lg border text-xs font-medium transition-colors ${
                  theme === 'light'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light Mode
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 h-10 rounded-lg border text-xs font-medium transition-colors ${
                  theme === 'dark'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark Mode
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              High-Priority Threshold Score (0–100)
            </label>
            <input
              type="number"
              min="30"
              max="95"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-32 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoChain}
              onChange={(e) => setAutoChain(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span>Automatically chain Impact Analysis &amp; Test Prioritization after Change Detection</span>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Preferences</span>
            </button>
          </div>
        </div>
      </form>

      {/* Database Status & About ChangeGuard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Database &amp; Backend Status</h3>
          </div>
          {loadingSys || !sysStatus ? (
            <p className="text-xs text-slate-500">Checking database diagnostics...</p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                <div>Engine: <span className="font-medium text-slate-900 dark:text-white">{sysStatus.database.engine}</span></div>
                <div>Status: <span className="font-medium text-emerald-700 dark:text-emerald-400">{sysStatus.database.status}</span></div>
                <div>Storage Size: <span className="font-mono tabular-nums">{(sysStatus.database.sizeBytes / 1024).toFixed(1)} KB</span></div>
                <div>Runtime: <span className="font-mono">{sysStatus.runtime.nodeVersion}</span></div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">Persisted Table Counts</p>
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                  {Object.entries(sysStatus.database.tables).map(([tbl, count]) => (
                    <div key={tbl} className="flex justify-between px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/50">
                      <span className="truncate">{tbl}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">About ChangeGuard</h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            ChangeGuard addresses the software maintenance challenge of identifying downstream effects when software requirements evolve and prioritizing regression test cases to catch defects earlier at reduced execution cost.
          </p>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside">
            <li><strong>Module 1:</strong> Requirement Change Detection across TXT, PDF, DOCX, and manual specs.</li>
            <li><strong>Module 2:</strong> Directed Traceability Graph Traversal (Requirement → Design → Code → Test).</li>
            <li><strong>Module 3:</strong> Explainable Regression Test Prioritization, Simulation &amp; APFD Evaluation.</li>
          </ul>
          <p className="text-[11px] text-slate-500 pt-1">
            Architecture: React + TypeScript + Recharts + Tailwind CSS frontend served by Node.js Express with persistent SQLite storage.
          </p>
        </div>
      </div>
    </div>
  );
};
