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
          accent: 'border-sky-500/80 bg-sky-950/90 text-sky-300',
          badgeText: 'NEW FOLLOWER',
          badgeBg: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
        };
      case 'gift':
        return {
          icon: Gift,
          accent: 'border-amber-500/80 bg-amber-950/90 text-amber-300',
          badgeText: 'STREAM GIFT',
          badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        };
      case 'donation':
        return {
          icon: DollarSign,
          accent: 'border-emerald-500/80 bg-emerald-950/90 text-emerald-300',
          badgeText: 'DONATION',
          badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        };
      case 'like':
        return {
          icon: Heart,
          accent: 'border-rose-500/80 bg-rose-950/90 text-rose-300',
          badgeText: 'TAP COMBO',
          badgeBg: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        };
      case 'share':
        return {
          icon: Share2,
          accent: 'border-cyan-500/80 bg-cyan-950/90 text-cyan-300',
          badgeText: 'STREAM SHARE',
          badgeBg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        };
      case 'sub':
        return {
          icon: Star,
          accent: 'border-indigo-500/80 bg-indigo-950/90 text-indigo-300',
          badgeText: 'NEW SUBSCRIBER',
          badgeBg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
        };
      case 'chat_event':
        return {
          icon: MessageSquare,
          accent: 'border-purple-500/80 bg-purple-950/90 text-purple-300',
          badgeText: 'CHAT EVENT',
          badgeBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        };
      default:
        return {
          icon: Sparkles,
          accent: 'border-slate-500/80 bg-slate-900/95 text-slate-300',
          badgeText: 'LIVE EVENT',
          badgeBg: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        };
    }
  };

  const visuals = getAlertVisuals();
  const Icon = visuals.icon;
  const alertMessage = currentAlert.message ?? currentAlert.detail ?? '';

  return (
    <div className="fixed top-16 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none transition-all duration-300 ease-out">
      <div
        className={`pointer-events-auto max-w-md w-full rounded-xl border shadow-2xl p-3.5 backdrop-blur-md flex items-center justify-between gap-3 ${visuals.accent}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 animate-bounce" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${visuals.badgeBg}`}
              >
                {visuals.badgeText}
              </span>
              <span className="text-xs text-slate-400 font-mono">Live Overlay</span>
            </div>
            <div className="text-sm font-bold text-white truncate mt-0.5">
              {currentAlert.username}
            </div>
            {alertMessage && (
              <div className="text-xs text-slate-200 truncate">
                {alertMessage}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white rounded-md transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
