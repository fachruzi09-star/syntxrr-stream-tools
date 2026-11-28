import React, { useState, useEffect } from 'react';
import {
  StreamEvent,
  StreamEventType,
  TTSConfig,
  SoundboardItem,
} from '../types';
import { streamEventBus } from '../services/eventBus';
import { ttsService } from '../services/ttsService';
import { soundboardEngine } from '../services/soundboardEngine';
import {
  executeLiveCenterSoundboardPlay,
  executeSoundboardAudioImport,
  hasMissingCustomSoundboardAudio,
} from '../services/soundboardDispatcher';
import { StorageService } from '../services/storage';
import { showInAppNotice } from '../services/uiNotice';
import {
  Volume2,
  Play,
  Sparkles,
  MessageSquare,
  Gift,
  Heart,
  UserPlus,
  Share2,
  DollarSign,
  Users,
  Mic,
  Bell,
  Trash2,
  Star,
  Zap,
  Upload,
  X,
} from 'lucide-react';

interface LiveCenterViewProps {
  ttsConfig: TTSConfig;
  onUpdateTTSConfig: (config: TTSConfig) => void;
  soundboardItems: SoundboardItem[];
  onSoundboardItemsChange: (items: SoundboardItem[]) => Promise<void>;
  soundboardVolume?: number;
}

export type SoundboardDeleteExecutionResult =
  | { status: 'ignored' }
  | { status: 'deleted' }
  | { status: 'deleted_with_cleanup_warning'; title: string; message: string; error: unknown }
  | { status: 'list_save_failed'; title: string; message: string; error: unknown };

export async function executeLiveCenterSoundboardDelete(params: {
  item: SoundboardItem;
  existingItems: readonly SoundboardItem[];
  onSoundboardItemsChange: (items: SoundboardItem[]) => Promise<void>;
  removeCustomFile: (id: string) => void;
  deleteSoundboardAudio: (id: string) => Promise<void>;
}): Promise<SoundboardDeleteExecutionResult> {
  const { item, existingItems } = params;
  if (!item.id.startsWith('sb_custom_')) {
    return { status: 'ignored' };
  }

  const nextItems = existingItems.filter((candidate) => candidate.id !== item.id);
  try {
    await params.onSoundboardItemsChange(nextItems);
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Gagal menghapus item audio kustom.';
    return {
      status: 'list_save_failed',
      title: 'Gagal Menghapus Audio',
      message: detail,
      error,
    };
  }

  // Daftar berhasil tersimpan: hentikan playback item dan bersihkan Blob audio terkait.
  // Cleanup object URL tetap ditangani oleh lifecycle App.tsx tanpa double revoke.
  try {
    params.removeCustomFile(item.id);
  } catch {}

  try {
    await params.deleteSoundboardAudio(item.id);
    return { status: 'deleted' };
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim() ? ` (${error.message.trim()})` : '';
    return {
      status: 'deleted_with_cleanup_warning',
      title: 'Item Dihapus dengan Peringatan Pembersihan',
      message: `Item "${item.name}" sudah dihapus dari daftar, namun pembersihan file audio gagal${detail}.`,
      error,
    };
  }
}

export const LiveCenterView: React.FC<LiveCenterViewProps> = ({
  ttsConfig,
  onUpdateTTSConfig,
  soundboardItems,
  onSoundboardItemsChange,
  soundboardVolume,
}) => {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [customUsername, setCustomUsername] = useState('Sultan_Streaming');
  const [customDetail, setCustomDetail] = useState('Halo bang, semangat live streamingnya!');
  const [activeTab, setActiveTab] = useState<'simulator' | 'tts' | 'soundboard'>('simulator');
  const [testVoiceText, setTestVoiceText] = useState(
    'Terima kasih atas gift mawar merah dan dukungannya!'
  );
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);
  const [mobileFeedOpen, setMobileFeedOpen] = useState(false);
  const [soundboardError, setSoundboardError] = useState<{
    title: string;
    message: string;
    tone?: 'error' | 'warn';
  } | null>(null);

  useEffect(() => {
    setEvents(streamEventBus.getHistory());
    const unsubscribe = streamEventBus.subscribe((newEvent) => {
      setEvents((prev) => [newEvent, ...prev.slice(0, 49)]);
    });
    const unsubscribeUpdates = streamEventBus.subscribeUpdates((update) => {
      setEvents((prev) =>
        prev.map((item) =>
          item.id === update.id
            ? {
                ...item,
                ...(update.repeatEnd !== undefined ? { repeatEnd: update.repeatEnd } : {}),
                ...(update.repeatCount !== undefined ? { repeatCount: update.repeatCount } : {}),
              }
            : item
        )
      );
    });
    return () => {
      unsubscribe();
      unsubscribeUpdates();
    };
  }, []);

  const triggerEvent = (
    type: StreamEventType,
    detail: string,
    amount?: number,
    currency?: string
  ) => {
    const newEvent: StreamEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      username: customUsername || 'Penonton_Live',
      detail,
      amount,
      currency,
      timestamp: Date.now(),
      isSimulation: true,
    };

    streamEventBus.emit(newEvent);
    setLastTriggered(`${type.toUpperCase()} · ${detail}`);
    window.setTimeout(() => setLastTriggered(null), 2600);
  };

  const handleTestTTS = () => {
    ttsService.updateConfig(ttsConfig);
    ttsService.prime();
    ttsService.speak(testVoiceText, true);
  };

  const reportSoundboardFeedback = (notice: {
    title: string;
    message: string;
    tone?: 'error' | 'warn';
  }) => {
    const tone = notice.tone ?? 'error';
    setSoundboardError({ title: notice.title, message: notice.message, tone });
    showInAppNotice({
      tone,
      title: notice.title,
      message: notice.message,
    });
  };

  const reportSoundboardError = (notice: { title: string; message: string }) => {
    reportSoundboardFeedback({ ...notice, tone: 'error' });
  };

  const handlePlaySoundboard = async (
    itemOrType: SoundboardItem | 'cheer' | 'horn' | 'level_up' | 'game_over' | 'tada' | 'bell'
  ) => {
    const result = await executeLiveCenterSoundboardPlay({
      target: itemOrType,
      volume: soundboardVolume,
      engine: soundboardEngine,
      onPlaybackError: reportSoundboardError,
    });
    if (result.ok) {
      setSoundboardError(null);
    }
  };

  const handleImportSound = async (file: File) => {
    const result = await executeSoundboardAudioImport({
      file,
      existingItems: soundboardItems,
      probeDurationSec: (audioFile) =>
        new Promise<number>((resolve) => {
          let metadataUrl = '';
          let metadataUrlCleaned = false;
          let audio: HTMLAudioElement | null = null;
          let settled = false;
          let timeoutId = 0;

          const cleanupMetadataAudio = () => {
            if (metadataUrlCleaned) return;
            metadataUrlCleaned = true;
            if (audio) {
              audio.pause();
              audio.removeAttribute('src');
              audio.load();
            }
            if (metadataUrl) {
              URL.revokeObjectURL(metadataUrl);
            }
          };

          const settle = (duration: number) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            cleanupMetadataAudio();
            resolve(duration);
          };

          try {
            metadataUrl = URL.createObjectURL(audioFile);
            audio = new Audio(metadataUrl);
            audio.onloadedmetadata = () => {
              settle(Math.max(1, Math.round(audio?.duration || 1)));
            };
            audio.onerror = () => {
              settle(1);
            };
            timeoutId = window.setTimeout(() => {
              settle(1);
            }, 10_000);
          } catch {
            settle(1);
          }
        }),
      createObjectUrl: (blob) => URL.createObjectURL(blob),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      saveSoundboardAudio: (id, blob) => StorageService.saveSoundboardAudio(id, blob),
      deleteSoundboardAudio: (id) => StorageService.deleteSoundboardAudio(id),
      onSoundboardItemsChange,
    });

    if (!result.ok) {
      reportSoundboardError({ title: result.title, message: result.message });
      return;
    }
    setSoundboardError(null);
  };

  const handleDeleteSound = async (item: SoundboardItem) => {
    const result = await executeLiveCenterSoundboardDelete({
      item,
      existingItems: soundboardItems,
      onSoundboardItemsChange,
      removeCustomFile: (id) => soundboardEngine.removeCustomFile(id),
      deleteSoundboardAudio: (id) => StorageService.deleteSoundboardAudio(id),
    });

    if (result.status === 'list_save_failed') {
      reportSoundboardFeedback({
        tone: 'error',
        title: result.title,
        message: result.message,
      });
      return;
    }

    if (result.status === 'deleted_with_cleanup_warning') {
      reportSoundboardFeedback({
        tone: 'warn',
        title: result.title,
        message: result.message,
      });
      return;
    }

    if (result.status === 'deleted') {
      setSoundboardError(null);
    }
  };

  const updateImportedSound = async (item: SoundboardItem, updates: Partial<SoundboardItem>) => {
    const nextItems = soundboardItems.map((candidate) =>
      candidate.id === item.id ? { ...candidate, ...updates } : candidate
    );
    try {
      await onSoundboardItemsChange(nextItems);
      setSoundboardError(null);
    } catch (error) {
      reportSoundboardError({
        title: 'Gagal Memperbarui Soundboard',
        message:
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'Gagal menyimpan perubahan pengaturan Soundboard.',
      });
    }
  };

  const handleClearHistory = () => {
    streamEventBus.clearHistory();
    setEvents([]);
  };

  const customSounds = soundboardItems.filter((item) => item.id.startsWith('sb_custom_'));
  const latestEvent = events[0] || null;

  const renderEventFeedList = () => (
    <div className="space-y-2">
      {events.map((evt) => {
        let accentTone = 'text-sky-300';
        let Icon = MessageSquare;

        if (evt.type === 'gift') {
          accentTone = 'text-[var(--app-accent-text)]';
          Icon = Gift;
        } else if (evt.type === 'donation') {
          accentTone = 'text-emerald-300';
          Icon = DollarSign;
        } else if (evt.type === 'like') {
          accentTone = 'text-rose-300';
          Icon = Heart;
        } else if (evt.type === 'follow') {
          accentTone = 'text-cyan-300';
          Icon = UserPlus;
        } else if (evt.type === 'share') {
          accentTone = 'text-[var(--app-accent-text)]';
          Icon = Share2;
        }

        return (
          <div
            key={evt.id}
            className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-start gap-2.5"
          >
            <div
              className={`w-7 h-7 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] flex items-center justify-center shrink-0 ${accentTone}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--app-text)] truncate">
                  {evt.username}
                </span>
                <span className="text-[10px] text-[var(--app-text-muted)] font-mono-num shrink-0">
                  {new Date(evt.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>

              <p className="text-[11px] text-[var(--app-text-secondary)] mt-0.5 leading-snug break-words">
                {evt.detail}
              </p>

              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono-num text-[var(--app-text-muted)]">
                <span className={`font-bold uppercase ${accentTone}`}>{evt.type}</span>
                {evt.isSimulation && (
                  <>
                    <span>·</span>
                    <span>Simulasi</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {events.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center text-[var(--app-text-muted)] py-10 px-4">
          <Bell className="w-7 h-7 mb-2 opacity-30" />
          <p className="text-xs font-semibold text-[var(--app-text-secondary)]">
            Belum ada event tercatat
          </p>
          <p className="text-[11px] mt-1 leading-relaxed">
            Tekan salah satu pad di Simulator Event untuk melihat respons real-time.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4 pb-2">
      {/* Compact Broadcast Console Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
          <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight truncate">
            Live Ops &amp; Simulator
          </h1>
          <span className="font-mono-num text-[11px] px-2 py-0.5 rounded-md bg-[var(--app-ok-soft)] text-[var(--app-ok)] font-bold shrink-0">
            {events.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMobileFeedOpen(true)}
          className="btn-press lg:hidden min-h-[44px] px-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5 shrink-0"
        >
          <Bell className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
          <span>Feed ({events.length})</span>
        </button>
      </div>

      {/* Segmented Console Mode Tabs */}
      <div
        role="tablist"
        aria-label="Konsol Live Center"
        className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'simulator'}
          onClick={() => setActiveTab('simulator')}
          className={`btn-press min-h-[44px] px-2 rounded-[9px] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'simulator'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Simulator</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tts'}
          onClick={() => setActiveTab('tts')}
          className={`btn-press min-h-[44px] px-2 rounded-[9px] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'tts'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <Mic className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Voice TTS</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'soundboard'}
          onClick={() => setActiveTab('soundboard')}
          className={`btn-press min-h-[44px] px-2 rounded-[9px] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
            activeTab === 'soundboard'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Soundboard ({customSounds.length + 6})</span>
        </button>
      </div>

      {/* Mobile 1-Line Live Event Ticker (so users see emitted events immediately above the fold) */}
      {latestEvent && (
        <button
          type="button"
          onClick={() => setMobileFeedOpen(true)}
          className="btn-press lg:hidden w-full px-3 py-2 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex items-center justify-between gap-2 text-left text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono-num uppercase font-bold text-[var(--app-accent-text)] shrink-0">
              {latestEvent.type}
            </span>
            <span className="font-semibold text-[var(--app-text)] shrink-0 truncate max-w-[90px]">
              {latestEvent.username}
            </span>
            <span className="text-[var(--app-text-muted)] truncate">{latestEvent.detail}</span>
          </div>
          <span className="text-[10px] font-mono-num text-[var(--app-text-muted)] shrink-0">
            Lihat
          </span>
        </button>
      )}

      {/* Main Split: Control Deck (8 cols) + Sticky Live Event Feed (4 cols Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div key={activeTab} className="anim-tab-panel lg:col-span-8 space-y-3.5 min-w-0">
          {/* TAB 1: TACTILE SIMULATOR TRIGGER PAD */}
          {activeTab === 'simulator' && (
            <div className="space-y-3.5">
              {/* Compact Actor & Payload Bar */}
              <div className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-4 space-y-1">
                  <label
                    htmlFor="sim-actor-name"
                    className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--app-text-muted)]"
                  >
                    User Penonton
                  </label>
                  <input
                    id="sim-actor-name"
                    type="text"
                    value={customUsername}
                    onChange={(e) => setCustomUsername(e.target.value)}
                    className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3 text-xs text-[var(--app-text)] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-8 space-y-1">
                  <label
                    htmlFor="sim-actor-detail"
                    className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--app-text-muted)]"
                  >
                    Pesan Chat / Catatan Donasi
                  </label>
                  <input
                    id="sim-actor-detail"
                    type="text"
                    value={customDetail}
                    onChange={(e) => setCustomDetail(e.target.value)}
                    className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3 text-xs text-[var(--app-text)] focus:outline-none"
                  />
                </div>
              </div>

              {/* 8 Tactile Trigger Pads */}
              <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--app-border)]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                      Pemicu Interaksi 1-Tap
                    </h2>
                  </div>
                  {lastTriggered && (
                    <span
                      role="status"
                      className="anim-pop-in text-[11px] font-mono-num px-2 py-0.5 rounded-lg border truncate max-w-full"
                      style={{
                        backgroundColor: 'var(--app-ok-soft)',
                        borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                        color: 'var(--app-ok)',
                      }}
                    >
                      Terkirim: {lastTriggered}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => triggerEvent('chat', customDetail || 'Halo semuanya, salam kenal!')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-300">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Chat Komentar</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Teks &amp; TTS</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('gift', 'mengirim 5x Mawar Merah 🌹', 5, 'Mawar')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-300">
                      <Gift className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Gift Mawar 5x</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">TikTok Gift</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('gift', 'mengirim Paus Biru Sultan 🐋🔥', 1000, 'Koin')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)]">
                      <Gift className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Paus Sultan</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">1000 Koin Alert</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('like', 'mengetuk layar 100x ❤️')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-pink-500/10 border border-pink-500/25 flex items-center justify-center text-pink-300">
                      <Heart className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Tap Like</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Combo 100 Likes</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('follow', 'mulai mengikuti siaran kamu!')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-300">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Follow Baru</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Bell SFX + Alert</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('share', 'membagikan siaran ke 10 teman!')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)]">
                      <Share2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Share Live</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Social Boost</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      triggerEvent(
                        'donation',
                        'Donasi Rp 50.000: "Semangat push rank sampai Mythic bang!"',
                        50000,
                        'Rp'
                      )
                    }
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-300">
                      <DollarSign className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Donasi Saweria</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Rp 50.000 + TTS</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('viewer', 'Siaran mencapai 1.500 penonton aktif!')}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-300">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Peak Viewers</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">1.500 Viewers</div>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: TEXT-TO-SPEECH VOICE ENGINE */}
          {activeTab === 'tts' && (
            <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--app-border)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)] shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-bold text-[var(--app-text)] truncate">
                      Text-to-Speech (TTS Indonesia)
                    </h2>
                    <p className="text-[11px] text-[var(--app-text-muted)] truncate">
                      Pembacaan otomatis donasi, gift &amp; chat
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={ttsConfig.enabled}
                  aria-label="Aktifkan Text-to-Speech"
                  onClick={() => {
                    const updated = { ...ttsConfig, enabled: !ttsConfig.enabled };
                    onUpdateTTSConfig(updated);
                    ttsService.updateConfig(updated);
                  }}
                  className="btn-press min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl shrink-0"
                >
                  <span
                    className={`relative w-11 h-6 rounded-full border transition-colors ${
                      ttsConfig.enabled
                        ? 'bg-[var(--app-accent)] border-[var(--app-accent)]'
                        : 'bg-[var(--app-surface-elevated)] border-[var(--app-border-strong)]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all shadow-sm ${
                        ttsConfig.enabled
                          ? 'left-[22px] bg-[var(--app-accent-ink)]'
                          : 'left-0.5 bg-[var(--app-text-secondary)]'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'readDonations', label: 'Donasi', val: ttsConfig.readDonations },
                    { key: 'readGifts', label: 'Gift', val: ttsConfig.readGifts },
                    { key: 'readComments', label: 'Chat', val: ttsConfig.readComments },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="switch"
                    aria-checked={item.val}
                    onClick={() => {
                      const updated = { ...ttsConfig, [item.key]: !item.val };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className={`btn-press min-h-[44px] px-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold ${
                      item.val
                        ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent-border)] text-[var(--app-text)]'
                        : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        item.val ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--app-text-secondary)]">Volume</span>
                    <span className="font-mono-num font-bold text-[var(--app-accent-text)]">
                      {Math.round(
                        Math.max(0, Math.min(1, Number.isFinite(ttsConfig.volume) ? ttsConfig.volume : 0.9)) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={Math.max(
                      0,
                      Math.min(1, Number.isFinite(ttsConfig.volume) ? ttsConfig.volume : 0.9)
                    )}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value);
                      const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.9;
                      const updated = { ...ttsConfig, volume: clamped };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="w-full h-2 rounded-lg cursor-pointer accent-[var(--app-accent)]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--app-text-secondary)]">Speed</span>
                    <span className="font-mono-num font-bold text-[var(--app-accent-text)]">
                      {ttsConfig.rate}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.75"
                    step="0.1"
                    value={ttsConfig.rate}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, rate: parseFloat(e.target.value) };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="w-full h-2 rounded-lg cursor-pointer accent-[var(--app-accent)]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--app-text-secondary)]">Pitch</span>
                    <span className="font-mono-num font-bold text-[var(--app-accent-text)]">
                      {ttsConfig.pitch}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={ttsConfig.pitch}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, pitch: parseFloat(e.target.value) };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="w-full h-2 rounded-lg cursor-pointer accent-[var(--app-accent)]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--app-border)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={testVoiceText}
                  onChange={(e) => setTestVoiceText(e.target.value)}
                  placeholder="Ketik kalimat uji coba suara..."
                  aria-label="Kalimat uji coba suara TTS"
                  className="flex-1 min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleTestTTS}
                  className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center justify-center gap-2 shrink-0"
                >
                  <Play className="w-4 h-4 shrink-0" />
                  <span>Uji Suara</span>
                </button>
              </div>
            </section>
          )}

          {/* TAB 3: SOUNDBOARD CUES */}
          {activeTab === 'soundboard' && (
            <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--app-border)]">
                <div className="flex items-center gap-2 min-w-0">
                  <Volume2 className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                  <h2 className="font-display text-sm font-bold text-[var(--app-text)] truncate">
                    Soundboard &amp; Custom SFX
                  </h2>
                </div>
                <label className="btn-press min-h-[44px] shrink-0 px-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>Impor Audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleImportSound(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              {soundboardError && (
                <div
                  role="alert"
                  className={`p-3 rounded-xl border flex items-start justify-between gap-2 text-xs ${
                    soundboardError.tone === 'warn'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}
                >
                  <div className="min-w-0">
                    <div
                      className={`font-bold ${
                        soundboardError.tone === 'warn' ? 'text-amber-300' : 'text-rose-300'
                      }`}
                    >
                      {soundboardError.title}
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        soundboardError.tone === 'warn' ? 'text-amber-200/90' : 'text-rose-200/90'
                      }`}
                    >
                      {soundboardError.message}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSoundboardError(null)}
                    className={`btn-press min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center shrink-0 ${
                      soundboardError.tone === 'warn'
                        ? 'text-amber-300 hover:bg-amber-500/20'
                        : 'text-rose-300 hover:bg-rose-500/20'
                    }`}
                    aria-label="Tutup pesan error soundboard"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'horn', name: 'Air Horn Blast', type: 'horn', desc: 'Terompet hype' },
                    { id: 'level_up', name: 'Level Up Fanfare', type: 'level_up', desc: 'Melodi nada naik' },
                    { id: 'tada', name: 'Tada! Victory', type: 'tada', desc: 'Akord perayaan' },
                    { id: 'bell', name: 'Bell Notifikasi', type: 'bell', desc: 'Lonceng jernih' },
                    { id: 'cheer', name: 'Cheer Sorak', type: 'cheer', desc: 'Sorak penonton' },
                    { id: 'game_over', name: 'Game Over Wah', type: 'game_over', desc: 'Efek komedi' },
                  ] as const
                ).map((sfx) => (
                  <button
                    key={sfx.id}
                    type="button"
                    onClick={() => {
                      void handlePlaySoundboard(sfx.type);
                    }}
                    className="btn-press min-h-[78px] p-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] flex flex-col items-start justify-between text-left group"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--app-surface-elevated)] border border-[var(--app-border)] group-hover:bg-[var(--app-accent)] group-hover:border-[var(--app-accent)] group-hover:text-[var(--app-accent-ink)] text-[var(--app-text)] flex items-center justify-center transition-colors">
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">{sfx.name}</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">{sfx.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {customSounds.length > 0 && (
                <div className="pt-3 border-t border-[var(--app-border)] space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                    Audio Kustom Tersimpan ({customSounds.length})
                  </h3>
                  <div className="divide-y divide-[var(--app-border)] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
                    {customSounds.map((item) => {
                      const isMissingAudio = hasMissingCustomSoundboardAudio(item);
                      return (
                      <div
                        key={item.id}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void handlePlaySoundboard(item);
                          }}
                          className="btn-press flex-1 min-w-0 min-h-[44px] px-2 flex items-center gap-2 text-left text-[var(--app-text)] hover:text-[var(--app-accent-text)] rounded-lg"
                          aria-label={`Putar ${item.name}`}
                        >
                          <Play
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isMissingAudio ? 'text-amber-400' : 'text-[var(--app-accent-text)]'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-semibold truncate block">{item.name}</span>
                            {isMissingAudio && (
                              <span className="text-[10px] font-semibold text-amber-400 block truncate">
                                File audio hilang — perlu diimpor ulang
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono-num text-[var(--app-text-muted)] shrink-0">
                            {item.durationSec}s
                          </span>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void updateImportedSound(item, { isFavorite: !item.isFavorite })
                            }
                            className={`btn-press min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center ${
                              item.isFavorite
                                ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-text)]'
                                : 'bg-[var(--app-surface)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                            }`}
                            aria-label={`${
                              item.isFavorite ? 'Hapus dari' : 'Tambahkan ke'
                            } favorit ${item.name}`}
                            aria-pressed={item.isFavorite}
                          >
                            <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
                          </button>

                          <select
                            value={item.isQuickSlot ? String(item.quickSlotKey ?? '') : ''}
                            onChange={(event) => {
                              const value = event.target.value;
                              void updateImportedSound(
                                item,
                                value
                                  ? { isQuickSlot: true, quickSlotKey: Number(value) }
                                  : { isQuickSlot: false, quickSlotKey: undefined }
                              );
                            }}
                            className="min-h-[44px] bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-2 text-xs font-mono-num text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            aria-label={`Quick Slot untuk ${item.name}`}
                          >
                            <option value="">Slot</option>
                            {[1, 2, 3, 4].map((slot) => (
                              <option key={slot} value={slot}>
                                Q{slot}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => void handleDeleteSound(item)}
                            className="btn-press min-w-[44px] min-h-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center"
                            aria-label={`Hapus ${item.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Desktop Sticky Column: Live Event Timeline Feed */}
        <aside className="hidden lg:flex lg:col-span-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 flex-col h-[500px] sticky top-16">
          <div className="flex items-center justify-between pb-2.5 border-b border-[var(--app-border)] gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--app-accent-text)]" />
              <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                Live Event Feed
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="btn-press min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-[var(--app-text-muted)] hover:text-rose-400 hover:bg-[var(--app-surface-muted)] inline-flex items-center gap-1"
              title="Bersihkan riwayat event"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pt-3 pr-1">{renderEventFeedList()}</div>
        </aside>
      </div>

      {/* Mobile Live Event Feed Sheet */}
      {mobileFeedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end justify-center p-2.5"
          onClick={() => setMobileFeedOpen(false)}
        >
          <div
            className="anim-sheet-up w-full max-w-md rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border-strong)] p-4 space-y-3 max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--app-border)] shrink-0">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--app-text)] font-display">
                <Bell className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span>Live Event Feed ({events.length})</span>
              </div>
              <div className="flex items-center gap-1">
                {events.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="btn-press min-h-[44px] px-2.5 rounded-xl text-xs font-semibold text-rose-400"
                  >
                    Bersihkan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileFeedOpen(false)}
                  className="btn-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                  aria-label="Tutup feed"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5">{renderEventFeedList()}</div>
          </div>
        </div>
      )}
    </div>
  );
};
