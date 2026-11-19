import React, { useId } from 'react';

interface LogoProps {
  compact?: boolean;
  lightText?: boolean;
}

export const ChangeGuardLogo: React.FC<LogoProps> = ({ compact = false, lightText = false }) => {
  const gradId = useId();
  return (
    <div className="flex items-center gap-2.5 shrink-0 select-none">
      <svg
        width="32"
        height="32"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="4" y1="3" x2="32" y2="33" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <path
          d="M18 3L5.5 8.2V17.4C5.5 25.1 10.8 31.8 18 33.8C25.2 31.8 30.5 25.1 30.5 17.4V8.2L18 3Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M18 5.6L8 9.8V17.2C8 23.6 12.3 29.2 18 31C23.7 29.2 28 23.6 28 17.2V9.8L18 5.6Z"
          fill="#0F172A"
          fillOpacity="0.22"
        />
        <path
          d="M12.5 18.2L16.3 22L24 14.2"
          stroke="#FFFFFF"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span
          className={`font-display text-lg font-bold tracking-tight whitespace-nowrap ${
            lightText ? 'text-white' : 'text-slate-900 dark:text-white'
          }`}
        >
          ChangeGuard
        </span>
      )}
    </div>
  );
};
