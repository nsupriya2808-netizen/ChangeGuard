import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  MinusCircle,
  PlusCircle,
  ShieldAlert,
  SkipForward,
  XCircle,
} from 'lucide-react';

interface StatusLabelProps {
  variant:
    | 'added'
    | 'changed'
    | 'removed'
    | 'unchanged'
    | 'high'
    | 'medium'
    | 'low'
    | 'none'
    | 'direct'
    | 'indirect'
    | 'unaffected'
    | 'passed'
    | 'failed'
    | 'skipped'
    | 'connected'
    | 'not_connected';
  text?: string;
}

const CONFIG: Record<
  StatusLabelProps['variant'],
  { label: string; classes: string; Icon: React.FC<{ className?: string }> }
> = {
  added: {
    label: 'Added',
    classes: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-800',
    Icon: PlusCircle,
  },
  changed: {
    label: 'Changed',
    classes: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/50 dark:border-amber-800',
    Icon: AlertTriangle,
  },
  removed: {
    label: 'Removed',
    classes: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/50 dark:border-red-800',
    Icon: MinusCircle,
  },
  unchanged: {
    label: 'Unchanged',
    classes: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700',
    Icon: CircleDot,
  },
  high: {
    label: 'High',
    classes: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/50 dark:border-red-800',
    Icon: ShieldAlert,
  },
  medium: {
    label: 'Medium',
    classes: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/50 dark:border-amber-800',
    Icon: AlertTriangle,
  },
  low: {
    label: 'Low',
    classes: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/50 dark:border-blue-800',
    Icon: CircleDot,
  },
  none: {
    label: 'None',
    classes: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700',
    Icon: CircleDot,
  },
  direct: {
    label: 'Direct Impact',
    classes: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/50 dark:border-red-800',
    Icon: ShieldAlert,
  },
  indirect: {
    label: 'Indirect Impact',
    classes: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/50 dark:border-amber-800',
    Icon: AlertTriangle,
  },
  unaffected: {
    label: 'Unaffected',
    classes: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700',
    Icon: CircleDot,
  },
  passed: {
    label: 'Passed',
    classes: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-800',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    classes: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/50 dark:border-red-800',
    Icon: XCircle,
  },
  skipped: {
    label: 'Skipped',
    classes: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700',
    Icon: SkipForward,
  },
  connected: {
    label: 'Connected',
    classes: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-800',
    Icon: CheckCircle2,
  },
  not_connected: {
    label: 'Not Connected',
    classes: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700',
    Icon: XCircle,
  },
};

export const StatusLabel: React.FC<StatusLabelProps> = ({ variant, text }) => {
  const { label, classes, Icon } = CONFIG[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{text ?? label}</span>
    </span>
  );
};
