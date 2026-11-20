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
import { StorageService } from '../services/storage';
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
} from 'lucide-react';

interface LiveCenterViewProps {
  ttsConfig: TTSConfig;
  onUpdateTTSConfig: (config: TTSConfig) => void;
  soundboardItems: SoundboardItem[];
  onSoundboardItemsChange: (items: SoundboardItem[]) => Promise<void>;
}

export const LiveCenterView: React.FC<LiveCenterViewProps> = ({
  ttsConfig,
  onUpdateTTSConfig,
  soundboardItems,
  onSoundboardItemsChange,
}) => {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [customUsername, setCustomUsername] = useState('Sultan_Streaming');
  const [customDetail, setCustomDetail] = useState('Halo bang, semangat live streamingnya!');
  const [activeTab, setActiveTab] = useState<'simulator' | 'tts' | 'soundboard'>('simulator');
  const [testVoiceText, setTestVoiceText] = useState(
    'Terima kasih atas gift mawar merah dan dukungannya!'
  );
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);

  useEffect(() => {
    setEvents(streamEventBus.getHistory());
    const unsubscribe = streamEventBus.subscribe((newEvent) => {
      setEvents((prev) => [newEvent, ...prev.slice(0, 49)]);
    });
    return () => unsubscribe();
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
    window.setTimeout(() => setLastTriggered(null), 3000);
  };

  const handleTestTTS = () => {
    ttsService.updateConfig(ttsConfig);
    ttsService.prime();
    ttsService.speak(testVoiceText, true);
  };

  const handlePlaySoundboard = (
    itemOrType: SoundboardItem | 'cheer' | 'horn' | 'level_up' | 'game_over' | 'tada' | 'bell'
  ) => {
    if (typeof itemOrType === 'string') {
      soundboardEngine.playSynthesizedSFX(itemOrType);
      return;
    }
    if (itemOrType.audioUrl) {
      soundboardEngine.playCustomFile(itemOrType.id, itemOrType.audioUrl);
    } else if (itemOrType.synthType) {
      soundboardEngine.playSynthesizedSFX(itemOrType.synthType);
    }
  };

  const handleImportSound = async (file: File) => {
    if (!file.type.startsWith('audio/')) return;

    const id = `sb_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metadataUrl = URL.createObjectURL(file);
    const audio = new Audio(metadataUrl);
    let metadataUrlCleaned = false;
    const cleanupMetadataAudio = () => {
      if (metadataUrlCleaned) return;
      metadataUrlCleaned = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(metadataUrl);
    };
    const durationSec = await new Promise<number>((resolve) => {
      let settled = false;
      let timeoutId = 0;
      const settle = (duration: number) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanupMetadataAudio();
        resolve(duration);
      };

      audio.onloadedmetadata = () => {
        settle(Math.max(1, Math.round(audio.duration || 1)));
      };
      audio.onerror = () => {
        settle(1);
      };
      timeoutId = window.setTimeout(() => {
        settle(1);
      }, 10_000);
    });

    const item: SoundboardItem = {
      id,
      name: file.name.replace(/\.[^/.]+$/, '') || 'Imported sound',
      category: 'SFX',
      icon: 'Volume2',
      durationSec,
      isQuickSlot: false,
    };
    const nextItems = [...soundboardItems, item];
    const audioUrl = URL.createObjectURL(file);
    try {
      await StorageService.saveSoundboardAudio(id, file);
      await onSoundboardItemsChange([...nextItems.slice(0, -1), { ...item, audioUrl }]);
    } catch (error) {
      URL.revokeObjectURL(audioUrl);
      await StorageService.deleteSoundboardAudio(id);
      throw error;
    }
  };

  const handleDeleteSound = async (item: SoundboardItem) => {
    if (!item.id.startsWith('sb_custom_')) return;
    soundboardEngine.removeCustomFile(item.id);
    await StorageService.deleteSoundboardAudio(item.id);
    await onSoundboardItemsChange(soundboardItems.filter((candidate) => candidate.id !== item.id));
  };

  const updateImportedSound = async (item: SoundboardItem, updates: Partial<SoundboardItem>) => {
    const nextItems = soundboardItems.map((candidate) =>
      candidate.id === item.id ? { ...candidate, ...updates } : candidate
    );
    await onSoundboardItemsChange(nextItems);
  };

  const handleClearHistory = () => {
    streamEventBus.clearHistory();
    setEvents([]);
  };

  const customSounds = soundboardItems.filter((item) => item.id.startsWith('sb_custom_'));

  return (
    <div className="space-y-5 pb-6">
      {/* D+ Broadcast Console Header */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--app-text-muted)]">
              <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)]">
                D+ Live Interaction Console
              </span>
              <span aria-hidden="true" className="text-[var(--app-border-strong)]">
                /
              </span>
              <span>Event Bus &amp; Audio Cue Station</span>
            </div>
            <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight mt-0.5">
              Live Center &amp; Simulator Interaksi
            </h1>
            <p className="text-xs sm:text-sm text-[var(--app-text-muted)] mt-1 max-w-2xl leading-relaxed">
              Uji coba respons overlay, antrean Text-to-Speech (TTS), dan efek soundboard secara real-time tanpa mengganggu sesi siaran aktif.
            </p>
          </div>

          <div
            className="min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 self-start md:self-auto shrink-0"
            style={{
              backgroundColor: 'var(--app-ok-soft)',
              borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
              color: 'var(--app-ok)',
            }}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Event Engine Siap</span>
            <span className="text-[var(--app-border-strong)]">·</span>
            <span className="font-mono-num">{events.length}</span>
          </div>
        </div>

        {/* Segmented Console Mode Tabs */}
        <div
          role="tablist"
          aria-label="Konsol Live Center"
          className="flex flex-wrap gap-2 pt-3 border-t border-[var(--app-border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'simulator'}
            onClick={() => setActiveTab('simulator')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition-colors inline-flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)]'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Simulator Event ({events.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tts'}
            onClick={() => setActiveTab('tts')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition-colors inline-flex items-center gap-2 ${
              activeTab === 'tts'
                ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)]'
            }`}
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>Text-to-Speech</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'soundboard'}
            onClick={() => setActiveTab('soundboard')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition-colors inline-flex items-center gap-2 ${
              activeTab === 'soundboard'
                ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)]'
            }`}
          >
            <Volume2 className="w-4 h-4 shrink-0" />
            <span>Soundboard Cues ({customSounds.length + 6})</span>
          </button>
        </div>
      </header>

      {/* Main Split Architecture: Trigger / Audio Deck (8 cols) + Live Feed Timeline (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-4 min-w-0">
          {/* TAB 1: TACTILE SIMULATOR TRIGGER PAD */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              {/* Actor & Payload Input Strip */}
              <div className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4 space-y-1.5">
                  <label
                    htmlFor="sim-actor-name"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--app-text-muted)]"
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
                <div className="sm:col-span-8 space-y-1.5">
                  <label
                    htmlFor="sim-actor-detail"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--app-text-muted)]"
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

              {/* 8 Tactile Broadcast Trigger Keypads */}
              <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--app-border)]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                      Matriks Uji Pemicu Interaksi (1-Tap)
                    </h2>
                  </div>
                  {lastTriggered && (
                    <span
                      role="status"
                      className="text-[11px] font-mono-num px-2.5 py-1 rounded-lg border truncate max-w-full"
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => triggerEvent('chat', customDetail || 'Halo semuanya, salam kenal!')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-300">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Chat Komentar</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Teks &amp; Antrean TTS</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('gift', 'mengirim 5x Mawar Merah 🌹', 5, 'Mawar')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-300">
                      <Gift className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Gift Mawar (5x)</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">TikTok Gift</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('gift', 'mengirim Paus Biru Sultan 🐋🔥', 1000, 'Koin')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)]">
                      <Gift className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Gift Paus Sultan</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Mega Alert 1000 Koin</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('like', 'mengetuk layar 100x ❤️')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/25 flex items-center justify-center text-pink-300">
                      <Heart className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Tap Layar (Like)</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Combo 100 Likes</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('follow', 'mulai mengikuti siaran kamu!')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-300">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Follow Baru</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Bell SFX + Alert</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('share', 'membagikan siaran ke 10 teman!')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)]">
                      <Share2 className="w-4 h-4" />
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
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-300">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Donasi Saweria</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">Rp 50.000 + TTS</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerEvent('viewer', 'Siaran mencapai 1.500 penonton aktif!')}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left active:scale-[0.98]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-300">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">Peak Penonton</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">1.500 Viewers</div>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: TEXT-TO-SPEECH VOICE ENGINE */}
          {activeTab === 'tts' && (
            <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-5">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--app-border)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)] shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                      Text-to-Speech (TTS Bahasa Indonesia)
                    </h2>
                    <p className="text-[11px] text-[var(--app-text-muted)]">
                      Pembacaan otomatis donasi, gift, dan komentar masuk
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
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl shrink-0"
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

              {/* Filter Kategori Bacaan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    { key: 'readDonations', label: 'Baca Donasi', val: ttsConfig.readDonations },
                    { key: 'readGifts', label: 'Baca Gift TikTok', val: ttsConfig.readGifts },
                    { key: 'readComments', label: 'Baca Chat Penonton', val: ttsConfig.readComments },
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
                    className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold transition-colors ${
                      item.val
                        ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent-border)] text-[var(--app-text)]'
                        : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        item.val ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Sliders: Volume, Speed, Pitch */}
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--app-text-secondary)]">
                      Volume Suara TTS
                    </span>
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

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--app-text-secondary)]">
                      Kecepatan Bicara (Speed)
                    </span>
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

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[var(--app-text-secondary)]">
                      Nada Suara (Pitch)
                    </span>
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

              {/* Voice Test Strip */}
              <div className="pt-3 border-t border-[var(--app-border)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                >
                  <Play className="w-4 h-4 shrink-0" />
                  <span>Uji Suara</span>
                </button>
              </div>
            </section>
          )}

          {/* TAB 3: SOUNDBOARD CUES */}
          {activeTab === 'soundboard' && (
            <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--app-border)]">
                <div>
                  <h2 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-[var(--app-accent-text)]" />
                    <span>Soundboard Efek Suara &amp; Custom SFX</span>
                  </h2>
                  <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                    Efek prosedural bawaan dan file audio pendek yang disimpan persisten di perangkat.
                  </p>
                </div>
                <label className="min-h-[44px] shrink-0 px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-2 transition-colors self-start sm:self-auto">
                  <Upload className="w-4 h-4 shrink-0" />
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

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                    onClick={() => handlePlaySoundboard(sfx.type)}
                    className="min-h-[96px] p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] transition-colors flex flex-col items-start justify-between text-left group active:scale-[0.98]"
                  >
                    <div className="w-9 h-9 rounded-full bg-[var(--app-surface-elevated)] border border-[var(--app-border)] group-hover:bg-[var(--app-accent)] group-hover:border-[var(--app-accent)] group-hover:text-[var(--app-accent-ink)] text-[var(--app-text)] flex items-center justify-center transition-colors">
                      <Play className="w-4 h-4 ml-0.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--app-text)]">{sfx.name}</div>
                      <div className="text-[10px] text-[var(--app-text-muted)]">{sfx.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {customSounds.length > 0 && (
                <div className="pt-4 border-t border-[var(--app-border)] space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                    Audio Kustom Tersimpan ({customSounds.length})
                  </h3>
                  <div className="space-y-2">
                    {customSounds.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] p-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => handlePlaySoundboard(item)}
                          className="flex-1 min-w-0 min-h-[44px] px-2 flex items-center gap-2.5 text-left text-[var(--app-text)] hover:text-[var(--app-accent-text)] transition-colors rounded-lg"
                          aria-label={`Putar ${item.name}`}
                        >
                          <Play className="w-4 h-4 shrink-0 text-[var(--app-accent-text)]" />
                          <span className="text-xs font-semibold truncate">{item.name}</span>
                          <span className="text-[10px] font-mono-num text-[var(--app-text-muted)] shrink-0">
                            {item.durationSec}s
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void updateImportedSound(item, { isFavorite: !item.isFavorite })
                            }
                            className={`min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center transition-colors ${
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
                            className="min-h-[44px] bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl px-2.5 text-xs font-mono-num text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
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
                            className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition-colors"
                            aria-label={`Hapus ${item.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Sticky Column: Live Event Timeline Feed */}
        <aside className="lg:col-span-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 flex flex-col h-[520px] lg:sticky lg:top-20">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--app-border)] gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--app-accent-text)]" />
              <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                Live Event Feed
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[var(--app-text-muted)] hover:text-rose-400 hover:bg-[var(--app-surface-muted)] inline-flex items-center gap-1.5 transition-colors"
              title="Bersihkan riwayat event"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1">
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
                  className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-start gap-2.5"
                >
                  <div
                    className={`w-8 h-8 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] flex items-center justify-center shrink-0 ${accentTone}`}
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

                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono-num text-[var(--app-text-muted)]">
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
              <div className="h-full flex flex-col items-center justify-center text-center text-[var(--app-text-muted)] py-12 px-4">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs font-semibold text-[var(--app-text-secondary)]">
                  Belum ada event tercatat
                </p>
                <p className="text-[11px] mt-1 leading-relaxed">
                  Tekan salah satu pad di Simulator Event untuk melihat respons real-time di lini masa ini.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
