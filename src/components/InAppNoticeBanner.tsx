import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import {
  dismissInAppNotice,
  subscribeInAppNotices,
  type InAppNotice,
  type InAppNoticeTone,
} from '../services/uiNotice';

const TONE_META: Record<
  InAppNoticeTone,
  {
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    softBg: string;
  }
> = {
  info: {
    icon: Info,
    accentColor: 'var(--app-accent-text)',
    softBg: 'var(--app-accent-soft)',
  },
  success: {
    icon: CheckCircle2,
    accentColor: 'var(--app-ok)',
    softBg: 'var(--app-ok-soft)',
  },
  warn: {
    icon: TriangleAlert,
    accentColor: 'var(--app-warn)',
    softBg: 'var(--app-warn-soft)',
  },
  error: {
    icon: AlertCircle,
    accentColor: 'var(--app-error)',
    softBg: 'var(--app-error-soft)',
  },
};

export const InAppNoticeBanner: React.FC = () => {
  const [notices, setNotices] = useState<InAppNotice[]>([]);

  useEffect(() => subscribeInAppNotices(setNotices), []);

  if (notices.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-14 sm:top-16 right-3 left-3 sm:left-auto sm:w-[380px] z-[70] flex flex-col gap-2 pointer-events-none"
    >
      {notices.map((notice) => {
        const meta = TONE_META[notice.tone] || TONE_META.info;
        const Icon = meta.icon;
        return (
          <div
            key={notice.id}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border bg-[var(--app-surface-elevated)] border-[var(--app-border-strong)] text-[var(--app-text)] shadow-[var(--app-shadow)] transition-transform duration-200"
          >
            <div
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
              style={{ backgroundColor: meta.softBg, color: meta.accentColor }}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              {notice.title && (
                <div className="text-xs font-bold text-[var(--app-text)] leading-snug mb-0.5">
                  {notice.title}
                </div>
              )}
              <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed break-words">
                {notice.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismissInAppNotice(notice.id)}
              aria-label="Tutup pemberitahuan"
              className="min-w-[44px] min-h-[44px] -mr-1 -mt-1 rounded-lg flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
