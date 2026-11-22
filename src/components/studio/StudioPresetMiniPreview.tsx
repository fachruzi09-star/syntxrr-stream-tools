import React from 'react';
import { CanvasOrientation, SourceType, StudioElement } from '../../types';
import {
  Camera,
  Monitor,
  MessageSquare,
  Bell,
  Music,
  Type,
  Image as ImageIcon,
  Layers,
  Flame,
  TrendingUp,
} from 'lucide-react';

interface StudioPresetMiniPreviewProps {
  elements: StudioElement[];
  orientation: CanvasOrientation;
  isActive?: boolean;
  hasBackground?: boolean;
  compact?: boolean;
  size?: 'xs' | 'compact' | 'md';
}

function getPreviewElementVisual(type: SourceType): {
  boxClass: string;
  label: string;
  icon: React.ReactNode;
} {
  switch (type) {
    case 'camera':
      return {
        boxClass: 'bg-sky-500/20 border-sky-400/60 text-sky-200',
        label: 'Cam',
        icon: <Camera className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'screen_capture':
      return {
        boxClass: 'bg-rose-500/15 border-rose-400/50 text-rose-200',
        label: 'Layar',
        icon: <Monitor className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'chat_message':
    case 'event_feed':
      return {
        boxClass: 'bg-zinc-900/80 border-zinc-500/50 text-zinc-200',
        label: 'Chat',
        icon: <MessageSquare className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'event_alert':
      return {
        boxClass: 'bg-amber-500/25 border-amber-400/70 text-amber-200',
        label: 'Alert',
        icon: <Bell className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'combo_counter':
      return {
        boxClass: 'bg-orange-500/25 border-orange-400/70 text-orange-200',
        label: 'Combo',
        icon: <Flame className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'counter':
    case 'progress_bar':
    case 'leaderboard':
      return {
        boxClass: 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200',
        label: 'Goal',
        icon: <TrendingUp className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'song_request':
    case 'lyrics':
    case 'audio':
    case 'soundboard':
      return {
        boxClass: 'bg-violet-500/20 border-violet-400/60 text-violet-200',
        label: 'Audio',
        icon: <Music className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'image':
    case 'video':
    case 'sticker':
    case 'avatar':
      return {
        boxClass: 'bg-teal-500/20 border-teal-400/60 text-teal-200',
        label: 'Media',
        icon: <ImageIcon className="w-2.5 h-2.5 shrink-0" />,
      };
    case 'text':
    case 'running_text':
    case 'dynamic_text':
    case 'username':
    case 'live_text':
    case 'live_viewer_counter':
      return {
        boxClass: 'bg-[var(--app-accent)]/20 border-[var(--app-accent)]/60 text-[var(--app-accent-text)]',
        label: 'Teks',
        icon: <Type className="w-2.5 h-2.5 shrink-0" />,
      };
    default:
      return {
        boxClass: 'bg-zinc-700/30 border-zinc-500/50 text-zinc-200',
        label: 'Layer',
        icon: <Layers className="w-2.5 h-2.5 shrink-0" />,
      };
  }
}

export const StudioPresetMiniPreview: React.FC<StudioPresetMiniPreviewProps> = ({
  elements,
  orientation,
  isActive = false,
  hasBackground = false,
  compact = false,
  size,
}) => {
  const resolvedSize: 'xs' | 'compact' | 'md' = size ?? (compact ? 'compact' : 'md');

  const frameClass =
    orientation === '9:16'
      ? resolvedSize === 'xs'
        ? 'aspect-[9/16] h-[62px] sm:h-[76px] w-auto'
        : resolvedSize === 'compact'
          ? 'aspect-[9/16] h-[74px] sm:h-[88px] w-auto'
          : 'aspect-[9/16] h-[112px] sm:h-[132px] w-auto'
      : orientation === '16:9'
        ? resolvedSize === 'xs'
          ? 'aspect-video w-[78px] sm:w-[98px] h-auto'
          : resolvedSize === 'compact'
            ? 'aspect-video w-[108px] sm:w-[124px] h-auto'
            : 'aspect-video w-[176px] sm:w-[210px] h-auto'
        : resolvedSize === 'xs'
          ? 'aspect-square h-[56px] w-[56px] sm:h-[68px] sm:w-[68px]'
          : resolvedSize === 'compact'
            ? 'aspect-square h-[72px] w-[72px] sm:h-[84px] sm:w-[84px]'
            : 'aspect-square h-[108px] sm:h-[124px] w-auto';

  const visibleElements = elements
    .filter((elem) => elem.visible !== false)
    .slice()
    .sort((a, b) => (a.layer || 0) - (b.layer || 0))
    .slice(0, 14);

  return (
    <div
      aria-hidden="true"
      className={`${frameClass} relative rounded-lg overflow-hidden bg-[#07080A] border shadow-inner shrink-0 ${
        isActive ? 'border-[var(--app-accent)]' : 'border-[var(--app-border-strong)]'
      }`}
    >
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />

      {hasBackground && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--app-accent)]/10 via-transparent to-emerald-500/10 pointer-events-none" />
      )}

      {visibleElements.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center">
          <div className="w-4 h-4 rounded border border-dashed border-zinc-700 flex items-center justify-center">
            <Layers className="w-2.5 h-2.5 text-zinc-600" />
          </div>
          {resolvedSize !== 'xs' && (
            <span className="text-[8px] font-medium text-zinc-500 leading-tight mt-0.5">
              Kosong
            </span>
          )}
        </div>
      ) : (
        visibleElements.map((elem) => {
          const visual = getPreviewElementVisual(elem.type);
          const safeW = Math.max(8, Math.min(100, Number(elem.width) || 12));
          const safeH = Math.max(6, Math.min(100, Number(elem.height) || 8));
          const safeX = Math.max(-10, Math.min(92, Number(elem.x) || 0));
          const safeY = Math.max(-10, Math.min(92, Number(elem.y) || 0));

          return (
            <div
              key={elem.id}
              className={`absolute rounded-[3px] border flex items-center justify-center overflow-hidden px-0.5 ${visual.boxClass}`}
              style={{
                left: `${safeX}%`,
                top: `${safeY}%`,
                width: `${safeW}%`,
                height: `${safeH}%`,
                zIndex: elem.layer || 1,
                opacity: Math.max(0.35, Math.min(1, (elem.opacity ?? 100) / 100)),
                transform: elem.rotation ? `rotate(${elem.rotation}deg)` : undefined,
              }}
            >
              {resolvedSize === 'md' && safeW >= 20 && safeH >= 12 ? (
                <span className="inline-flex items-center gap-0.5 text-[7px] font-bold tracking-tight truncate max-w-full">
                  {visual.icon}
                  <span className="truncate">{visual.label}</span>
                </span>
              ) : resolvedSize !== 'xs' ? (
                visual.icon
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
};
