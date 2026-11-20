/**
 * FloatingHudPanel.tsx
 *
 * Launcher + panel untuk bubble Floating HUD native (D+ Flagship Tokenized).
 * - Bubble adalah master toggle. Membuka launcher enam ikon kompak di sisi layar bubble.
 * - Tidak ada backdrop penuh layar, tidak ada dimming, tidak ada modal takeover.
 * - Membungkus state/handler yang sudah ada di App.tsx tanpa duplikasi logika.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageCircle,
  Music2,
  SlidersHorizontal,
  Radio,
  Settings as SettingsIcon,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Gift,
  Heart,
  UserPlus,
  ListMusic,
} from 'lucide-react';
import {
  isModeAOperatingMode,
  type AlertEvent,
  type OperatingMode,
  type SongRequest,
  type SoundboardItem,
} from '../types';

export type HudPanelId = 'chat' | 'soundboard' | 'music' | 'mixer' | 'live' | 'settings';

/** Field pengaturan audio yang boleh diubah dari panel mixer. */
export type HudMixerKey = 'audioVolume' | 'soundboardVolume' | 'micGain';

export interface FloatingHudPanelProps {
  open: boolean;
  onClose: () => void;
  /** Sisi layar tempat bubble native berlabuh; launcher mengikuti sisi ini. */
  bubbleSide?: 'left' | 'right';
  /** Panel yang diizinkan oleh pengaturan (hudPanelChat, hudPanelSoundboard, ...). */
  enabledPanels: HudPanelId[];
  alerts: AlertEvent[];
  sounds: SoundboardItem[];
  onPlaySound: (soundId: string) => void;
  nowPlaying: SongRequest | null;
  isPlayingMusic: boolean;
  onTogglePlayMusic: () => void;
  queueCount: number;
  masterVolume: number;
  soundboardVolume: number;
  micGain: number;
  onMixerChange: (key: HudMixerKey, value: number) => void;
  operatingMode: OperatingMode;
  isNativeAndroid: boolean;
  companionRunning: boolean;
  onToggleCompanion: () => void;
  onOpenSettingsPage: () => void;
}

const PANEL_META: Record<
  HudPanelId,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  chat: { label: 'Chat', icon: MessageCircle },
  soundboard: { label: 'SFX', icon: Volume2 },
  music: { label: 'Music', icon: Music2 },
  mixer: { label: 'Mixer', icon: SlidersHorizontal },
  live: { label: 'Live', icon: Radio },
  settings: { label: 'Setelan', icon: SettingsIcon },
};

function alertIcon(type: string) {
  if (type === 'gift') return <Gift className="w-4 h-4 text-[var(--app-accent-text)]" />;
  if (type === 'follow' || type === 'follower') return <UserPlus className="w-4 h-4 text-sky-400" />;
  if (type === 'like') return <Heart className="w-4 h-4 text-rose-400" />;
  return <MessageCircle className="w-4 h-4 text-[var(--app-text-muted)]" />;
}

function clampPercent(value: number, min = 0, max = 100) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const FloatingHudPanel: React.FC<FloatingHudPanelProps> = ({
  open,
  onClose,
  bubbleSide = 'right',
  enabledPanels,
  alerts,
  sounds,
  onPlaySound,
  nowPlaying,
  isPlayingMusic,
  onTogglePlayMusic,
  queueCount,
  masterVolume,
  soundboardVolume,
  micGain,
  onMixerChange,
  operatingMode,
  isNativeAndroid,
  companionRunning,
  onToggleCompanion,
  onOpenSettingsPage,
}) => {
  const availablePanels = useMemo(
    () => (enabledPanels.length > 0 ? enabledPanels : (['chat'] as HudPanelId[])),
    [enabledPanels]
  );
  const [activePanel, setActivePanel] = useState<HudPanelId | null>(null);
  const [mutedVolume, setMutedVolume] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setActivePanel(null);
  }, [open]);

  useEffect(() => {
    if (activePanel !== null && !availablePanels.includes(activePanel)) {
      setActivePanel(null);
    }
  }, [availablePanels, activePanel]);

  if (!open) return null;

  const quickSounds = sounds
    .filter((s) => s.isFavorite)
    .concat(sounds.filter((s) => !s.isFavorite))
    .slice(0, 6);
  const recentAlerts = alerts.slice(0, 12);

  const handleMuteToggle = () => {
    const currentPercent = clampPercent(masterVolume, 0, 100);
    if (currentPercent > 0) {
      setMutedVolume(currentPercent);
      onMixerChange('audioVolume', 0);
    } else {
      const restorePercent =
        mutedVolume !== null && mutedVolume > 0 ? clampPercent(mutedVolume, 1, 100) : 85;
      onMixerChange('audioVolume', restorePercent);
      setMutedVolume(null);
    }
  };

  const renderPanel = () => {
    switch (activePanel) {
      case 'chat':
        return (
          <div className="space-y-2">
            {recentAlerts.length === 0 ? (
              <p className="text-xs text-[var(--app-text-muted)] leading-relaxed">
                Belum ada event masuk. Chat, gift, dan follow akan muncul di sini setelah Mode A menerima event.
              </p>
            ) : (
              recentAlerts.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 text-xs py-1.5 border-b border-[var(--app-border)] last:border-b-0"
                >
                  <span className="mt-0.5 shrink-0">{alertIcon(event.type)}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--app-text)]">{event.username}</span>
                    {event.message || event.detail ? (
                      <span className="text-[var(--app-text-secondary)]">
                        {' '}
                        — {event.message || event.detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        );

      case 'soundboard':
        return (
          <div className="space-y-2.5">
            {quickSounds.length === 0 ? (
              <p className="text-xs text-[var(--app-text-muted)]">
                Belum ada sound. Tambahkan lewat Studio → Soundboard.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {quickSounds.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    onClick={() => onPlaySound(sound.id)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left transition-colors"
                  >
                    <span className="block text-xs font-semibold text-[var(--app-text)] truncate">
                      {sound.name}
                    </span>
                    <span className="block text-[10px] font-mono-num text-[var(--app-text-muted)]">
                      {sound.durationSec}s
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[var(--app-text-muted)] pt-0.5 leading-relaxed">
              Slot dan isi sound dikelola terpusat di Studio.
            </p>
          </div>
        );

      case 'music':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onTogglePlayMusic}
                disabled={!nowPlaying}
                className="w-11 h-11 shrink-0 rounded-full bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:bg-[var(--app-surface-elevated)] disabled:text-[var(--app-text-muted)] text-[var(--app-accent-ink)] flex items-center justify-center transition-colors"
                aria-label={isPlayingMusic ? 'Jeda musik' : 'Putar musik'}
              >
                {isPlayingMusic ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--app-text)] truncate">
                  {nowPlaying ? nowPlaying.title : 'Tidak ada lagu aktif'}
                </p>
                <p className="text-xs text-[var(--app-text-muted)] truncate">
                  {nowPlaying ? nowPlaying.artist : 'Pilih lagu di Studio Music'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono-num text-[var(--app-text-muted)]">
              <ListMusic className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
              <span>{queueCount} item di antrean</span>
            </div>
          </div>
        );

      case 'mixer':
        return (
          <div className="space-y-3.5">
            {(
              [
                { key: 'audioVolume', label: 'Master', value: masterVolume },
                { key: 'soundboardVolume', label: 'Soundboard', value: soundboardVolume },
                { key: 'micGain', label: 'Mic Gain', value: micGain, max: 200 },
              ] satisfies { key: HudMixerKey; label: string; value: number; max?: number }[]
            ).map((row) => (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--app-text-secondary)] font-medium">{row.label}</span>
                  <span className="font-mono-num font-bold text-[var(--app-accent-text)]">
                    {clampPercent(row.value, 0, row.max ?? 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={row.max ?? 100}
                  value={clampPercent(row.value, 0, row.max ?? 100)}
                  onChange={(e) => onMixerChange(row.key, Number(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer accent-[var(--app-accent)]"
                  aria-label={`Volume ${row.label}`}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={handleMuteToggle}
              className={`w-full min-h-[44px] py-2 rounded-xl border text-xs font-bold transition-colors ${
                masterVolume === 0
                  ? 'bg-rose-950/60 border-rose-700 text-rose-200 hover:bg-rose-900/60'
                  : 'bg-[var(--app-surface-elevated)] border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {masterVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {masterVolume === 0 ? 'Unmute Master' : 'Mute Master'}
              </span>
            </button>
            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
              Mute menurunkan volume master ke 0 pada pemutar audio aktif.
            </p>
          </div>
        );

      case 'live':
        return (
          <div className="space-y-3">
            {isModeAOperatingMode(operatingMode) ? (
              <>
                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  Mode A adalah pendamping TikTok LIVE. Siaran dikendalikan oleh aplikasi TikTok resmi — tidak ada start, pause, atau stop LIVE dari sini.
                </p>
                <button
                  type="button"
                  onClick={onToggleCompanion}
                  disabled={!isNativeAndroid}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:bg-[var(--app-surface-elevated)] disabled:text-[var(--app-text-muted)] text-[var(--app-accent-ink)] text-xs font-bold transition-colors"
                >
                  {companionRunning ? 'Hentikan Companion' : 'Jalankan Companion'}
                </button>
                {!isNativeAndroid && (
                  <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                    Mode A Companion memerlukan APK Android native untuk overlay service.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
                Mode B menggunakan native RTMP encoder pada APK Android. Preview browser tidak menjalankan encoder native.
              </p>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-3">
            <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
              Ukuran bubble, opacity, posisi, dan pilihan panel diatur di halaman Setelan.
            </p>
            <button
              type="button"
              onClick={() => {
                onOpenSettingsPage();
                onClose();
              }}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-semibold transition-colors"
            >
              Buka Setelan
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const anchorClass = bubbleSide === 'left' ? 'left-3' : 'right-3';

  return (
    <div
      className={`fixed bottom-24 z-[60] ${anchorClass} max-w-[calc(100vw-1.5rem)] pointer-events-none`}
      role="group"
      aria-label="Floating HUD"
    >
      {activePanel === null ? (
        <div
          className="pointer-events-auto grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-[var(--app-surface)]/95 backdrop-blur-md border border-[var(--app-border-strong)]"
          style={{ boxShadow: 'var(--app-shadow)' }}
        >
          {availablePanels.map((panel) => {
            const meta = PANEL_META[panel];
            const Icon = meta.icon;
            return (
              <button
                key={panel}
                type="button"
                onClick={() => setActivePanel(panel)}
                aria-label={meta.label}
                className="min-w-[52px] min-h-[46px] flex flex-col items-center justify-center gap-1 rounded-xl text-[var(--app-text-secondary)] hover:text-[var(--app-accent-text)] hover:bg-[var(--app-surface-elevated)] active:bg-[var(--app-surface-hover)] transition-colors"
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium leading-none">{meta.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="pointer-events-auto w-[18.5rem] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[var(--app-surface)]/95 backdrop-blur-md border border-[var(--app-border-strong)] overflow-hidden"
          style={{ boxShadow: 'var(--app-shadow)' }}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--app-border)] bg-[var(--app-surface-muted)]">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-accent-text)]">
              Floating HUD
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] -my-2 -mr-1.5 flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] transition-colors"
              aria-label="Tutup panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 px-2.5 py-2 border-b border-[var(--app-border)] overflow-x-auto no-scrollbar">
            {availablePanels.map((panel) => {
              const meta = PANEL_META[panel];
              const Icon = meta.icon;
              const isActive = panel === activePanel;
              return (
                <button
                  key={panel}
                  type="button"
                  onClick={() => setActivePanel(panel)}
                  aria-label={meta.label}
                  aria-pressed={isActive}
                  className={`shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-colors ${
                    isActive
                      ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                      : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>

          <div className="px-3.5 py-3 max-h-[42vh] overflow-y-auto">{renderPanel()}</div>
        </div>
      )}
    </div>
  );
};

export default FloatingHudPanel;
