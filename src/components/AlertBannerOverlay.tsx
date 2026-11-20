import React, { useEffect } from 'react';
import { AlertEvent } from '../types';
import { UserCheck, Gift, Heart, MessageSquare, DollarSign, Share2, Star, Sparkles, X } from 'lucide-react';

interface AlertBannerOverlayProps {
  currentAlert: AlertEvent | null;
  onDismiss: () => void;
}

export const AlertBannerOverlay: React.FC<AlertBannerOverlayProps> = ({
  currentAlert,
  onDismiss,
}) => {
  useEffect(() => {
    if (!currentAlert) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [currentAlert, onDismiss]);

  if (!currentAlert) return null;

  const getAlertVisuals = () => {
    switch (currentAlert.type) {
      case 'follow':
      case 'follower':
        return {
          icon: UserCheck,
          toneClass: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
          badgeText: 'NEW FOLLOWER',
        };
      case 'gift':
        return {
          icon: Gift,
          toneClass: 'text-[var(--app-accent-text)] border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]',
          badgeText: 'STREAM GIFT',
        };
      case 'donation':
        return {
          icon: DollarSign,
          toneClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          badgeText: 'DONATION',
        };
      case 'like':
        return {
          icon: Heart,
          toneClass: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
          badgeText: 'TAP COMBO',
        };
      case 'share':
        return {
          icon: Share2,
          toneClass: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10',
          badgeText: 'STREAM SHARE',
        };
      case 'sub':
        return {
          icon: Star,
          toneClass: 'text-[var(--app-accent-text)] border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]',
          badgeText: 'NEW SUBSCRIBER',
        };
      case 'chat_event':
        return {
          icon: MessageSquare,
          toneClass: 'text-[var(--app-text-secondary)] border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)]',
          badgeText: 'CHAT EVENT',
        };
      default:
        return {
          icon: Sparkles,
          toneClass: 'text-[var(--app-accent-text)] border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]',
          badgeText: 'LIVE EVENT',
        };
    }
  };

  const visuals = getAlertVisuals();
  const Icon = visuals.icon;
  const alertMessage = currentAlert.message ?? currentAlert.detail ?? '';

  return (
    <div className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto max-w-md w-full rounded-2xl bg-[var(--app-surface)]/95 border border-[var(--app-accent-border)] p-3.5 backdrop-blur-md flex items-center justify-between gap-3"
        style={{ boxShadow: 'var(--app-shadow)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${visuals.toneClass}`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
              <span className="text-[var(--app-accent-text)]">{visuals.badgeText}</span>
              <span className="text-[var(--app-border-strong)]">·</span>
              <span className="text-[var(--app-text-muted)] font-mono-num">Live Overlay</span>
            </div>
            <div className="font-display text-sm font-bold text-[var(--app-text)] truncate mt-0.5">
              {currentAlert.username}
            </div>
            {alertMessage && (
              <div className="text-xs text-[var(--app-text-secondary)] truncate">{alertMessage}</div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] rounded-xl transition-colors shrink-0"
          aria-label="Tutup alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
