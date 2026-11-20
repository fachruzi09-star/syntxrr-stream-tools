/**
 * FloatingHudPanel.tsx
 *
 * Launcher + panel untuk bubble Floating HUD native.
 *
 * Perilaku (revisi akhir):
 * - Bubble adalah master toggle. Saat bubble ditekan, komponen ini muncul sebagai
 *   launcher enam ikon kecil (Chat, Soundboard, Music, Audio Mixer, Live Control,
 *   Settings) di sisi layar yang sama dengan bubble.
 * - Menekan salah satu ikon membuka HANYA panel fitur itu, berukuran kompak,
 *   dengan scroll internal bila isinya panjang.
 * - Tidak ada backdrop penuh layar, tidak ada dimming, tidak ada modal takeover,
 *   sehingga area menonton TikTok LIVE tetap terpakai.
 * - Panel tidak pernah bertumpuk: memilih ikon lain menggantikan panel sebelumnya.
 *
 * Prinsip lain:
 * - Hanya membungkus state/handler yang SUDAH ada di App.tsx. Tidak ada logika
 *   soundboard, musik, atau mixer yang diduplikasi di sini.
 * - Tidak mengarang kemampuan native. Mode A tidak pernah menampilkan kontrol
 *   start/pause/stop TikTok LIVE karena siaran tetap dipegang aplikasi TikTok.
 * - Mode B menggunakan native RTMP encoder pada APK Android; panel fallback web
 *   tidak dapat menjalankan kontrol encoder native tersebut.
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
import { isModeAOperatingMode, type AlertEvent, type OperatingMode, type SongRequest, type SoundboardItem } from '../types';

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

const PANEL_META: Record<HudPanelId, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  chat: { label: 'Chat', icon: MessageCircle },
  soundboard: { label: 'Soundboard', icon: Volume2 },
  music: { label: 'Music', icon: Music2 },
  mixer: { label: 'Mixer', icon: SlidersHorizontal },
  live: { label: 'Live', icon: Radio },
  settings: { label: 'Setelan', icon: SettingsIcon },
};

function alertIcon(type: string) {
  if (type === 'gift') return <Gift className="w-4 h-4 text-amber-400" />;
  if (type === 'follow') return <UserPlus className="w-4 h-4 text-sky-400" />;
  if (type === 'like') return <Heart className="w-4 h-4 text-pink-400" />;
  return <MessageCircle className="w-4 h-4 text-slate-400" />;
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
  // null = launcher saja (belum ada panel fitur yang dipilih).
  const [activePanel, setActivePanel] = useState<HudPanelId | null>(null);
  const [mutedVolume, setMutedVolume] = useState<number | null>(null);

  // Master toggle dari bubble: setiap kali HUD ditutup, kembali ke kondisi launcher.
  useEffect(() => {
    if (!open) setActivePanel(null);
  }, [open]);

  // Jika pengguna mematikan panel yang sedang terbuka di Settings, tutup panel itu.
  useEffect(() => {
    if (activePanel !== null && !availablePanels.includes(activePanel)) {
      setActivePanel(null);
    }
  }, [availablePanels, activePanel]);

  if (!open) return null;

  const quickSounds = sounds.filter((s) => s.isFavorite).concat(sounds.filter((s) => !s.isFavorite)).slice(0, 6);
  const recentAlerts = alerts.slice(0, 12);

  const handleMuteToggle = () => {
    const currentPercent = clampPercent(masterVolume, 0, 100);
    if (currentPercent > 0) {
      setMutedVolume(currentPercent);
      onMixerChange('audioVolume', 0);
    } else {
      const restorePercent = mutedVolume !== null && mutedVolume > 0 ? clampPercent(mutedVolume, 1, 100) : 85;
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
              <p className="text-xs text-slate-500 leading-relaxed">
                Belum ada event masuk. Chat, gift, dan follow akan muncul di sini setelah Mode A
                menerima event dari sumbernya.
              </p>
            ) : (
              recentAlerts.map((event) => (
                <div key={event.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 shrink-0">{alertIcon(event.type)}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-200">{event.username}</span>
                    {event.message || event.detail ? (
                      <span className="text-slate-400"> — {event.message || event.detail}</span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        );

      case 'soundboard':
        return (
          <div className="space-y-2">
            {quickSounds.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada sound. Tambahkan lewat Studio → Soundboard.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {quickSounds.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    onClick={() => onPlaySound(sound.id)}
                    className="px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-left transition-colors"
                  >
                    <span className="block text-xs font-medium text-slate-100 truncate">{sound.name}</span>
                    <span className="block text-[10px] text-slate-500">{sound.durationSec}s</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-500 pt-1">
              Slot dan isi sound dikelola di Studio agar tidak ada dua tempat pengaturan.
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
                className="w-11 h-11 shrink-0 rounded-full bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white flex items-center justify-center transition-colors"
                aria-label={isPlayingMusic ? 'Jeda musik' : 'Putar musik'}
              >
                {isPlayingMusic ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate">
                  {nowPlaying ? nowPlaying.title : 'Tidak ada lagu aktif'}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {nowPlaying ? nowPlaying.artist : 'Pilih lagu di Music'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <ListMusic className="w-3.5 h-3.5" />
              <span>{queueCount} item di queue</span>
            </div>
          </div>
        );

      case 'mixer':
        return (
          <div className="space-y-4">
            {(
              [
                { key: 'audioVolume' as HudMixerKey, label: 'Master', value: masterVolume },
                { key: 'soundboardVolume' as HudMixerKey, label: 'Soundboard', value: soundboardVolume },
                { key: 'micGain' as HudMixerKey, label: 'Mic', value: micGain, max: 200 },
              ]
            ).map((row) => (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">{row.label}</span>
                  <span className="font-mono text-slate-500">{clampPercent(row.value, 0, row.max ?? 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={row.max ?? 100}
                  value={clampPercent(row.value, 0, row.max ?? 100)}
                  onChange={(e) => onMixerChange(row.key, Number(e.target.value))}
                  className="w-full accent-violet-500"
                  aria-label={`Volume ${row.label}`}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={handleMuteToggle}
              className={`w-full py-2 rounded-xl border text-xs font-medium transition-colors ${
                masterVolume === 0
                  ? 'bg-red-950/60 border-red-800 text-red-300 hover:bg-red-900/60'
                  : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {masterVolume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {masterVolume === 0 ? 'Unmute' : 'Mute'}
              </span>
            </button>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Mute menurunkan volume master ke 0. Efeknya mengikuti pemutar audio yang sedang aktif.
            </p>
          </div>
        );

      case 'live':
        return (
          <div className="space-y-3">
            {isModeAOperatingMode(operatingMode) ? (
              <>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Mode A adalah pendamping TikTok LIVE. Siaran tetap dijalankan dan dikendalikan oleh
                  aplikasi TikTok resmi — tidak ada start, pause, atau stop LIVE dari sini.
                </p>
                <button
                  type="button"
                  onClick={onToggleCompanion}
                  disabled={!isNativeAndroid}
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold transition-colors"
                >
                  {companionRunning ? 'Hentikan Companion' : 'Jalankan Companion'}
                </button>
                {!isNativeAndroid && (
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Mode A Companion memerlukan APK Android native. Tampilan web/preview tidak dapat menjalankan layanan overlay native.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-300 leading-relaxed">
                Mode B menggunakan native RTMP encoder pada APK Android. Tampilan web/preview tidak dapat menjalankan kontrol encoder native.
              </p>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Ukuran bubble, opacity, posisi, dan pilihan panel diatur di halaman Setelan.
            </p>
            <button
              type="button"
              onClick={() => {
                onOpenSettingsPage();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold transition-colors"
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
        /* ===== Launcher: enam ikon kecil, bukan enam panel besar ===== */
        <div className="pointer-events-auto grid grid-cols-3 gap-1 p-1.5 rounded-2xl bg-[#0e1626]/95 border border-slate-700 shadow-xl">
          {availablePanels.map((panel) => {
            const meta = PANEL_META[panel];
            const Icon = meta.icon;
            return (
              <button
                key={panel}
                type="button"
                onClick={() => setActivePanel(panel)}
                aria-label={meta.label}
                className="w-12 h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors"
              >
                <Icon className="w-4 h-4" />
                <span className="text-[8px] leading-none">{meta.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        /* ===== Satu panel fitur aktif, kompak, scroll internal ===== */
        <div className="pointer-events-auto w-[17rem] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[#0e1626]/95 border border-slate-700 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Floating HUD</span>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              aria-label="Tutup panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Strip launcher tetap ringkas dan bisa dipakai berpindah panel */}
          <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto no-scrollbar">
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
                  className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800/70 text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>

          <div className="px-3 pb-3 pt-1 max-h-[42vh] overflow-y-auto">{renderPanel()}</div>
        </div>
      )}
    </div>
  );
};

export default FloatingHudPanel;
