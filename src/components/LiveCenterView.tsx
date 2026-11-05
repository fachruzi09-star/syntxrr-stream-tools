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
  STATUS_DEFINITIONS,
} from '../theme/designSystem';
import {
  Radio,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Gift,
  Heart,
  UserPlus,
  Share2,
  DollarSign,
  Users,
  Mic,
  Sliders,
  Bell,
  Trash2,
  Star,
  Check,
  Zap,
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
  const [testVoiceText, setTestVoiceText] = useState('Terima kasih atas gift mawar merah dan dukungannya!');
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);

  // Subscribe to central event bus
  useEffect(() => {
    // Initial history from event bus
    setEvents(streamEventBus.getHistory());

    const unsubscribe = streamEventBus.subscribe((newEvent) => {
      setEvents((prev) => [newEvent, ...prev.slice(0, 49)]);
    });

    return () => unsubscribe();
  }, []);

  const triggerEvent = (type: StreamEventType, detail: string, amount?: number, currency?: string) => {
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
    setLastTriggered(`${type.toUpperCase()}: ${detail}`);
    setTimeout(() => setLastTriggered(null), 3000);
  };

  const handleTestTTS = () => {
    ttsService.updateConfig(ttsConfig);
    ttsService.prime();
    ttsService.speak(testVoiceText, true);
  };

  const handlePlaySoundboard = (itemOrType: SoundboardItem | 'cheer' | 'horn' | 'level_up' | 'game_over' | 'tada' | 'bell') => {
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
      candidate.id === item.id ? { ...candidate, ...updates } : candidate,
    );
    await onSoundboardItemsChange(nextItems);
  };

  const handleClearHistory = () => {
    streamEventBus.clearHistory();
    setEvents([]);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header Banner */}
      <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1e293b] text-blue-400 border border-blue-500/20 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Pusat Interaksi Siaran</span>
              </span>
              <span className="text-xs text-slate-400">
                Mode A TikTok Companion & Simulator Event
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Live Center & Simulator Interaksi
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Uji coba respons overlay siaran secara interaktif: simulasi gift TikTok, chat live, donasi Saweria, Text-to-Speech (TTS), dan efek pemicu audio soundboard.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5"
              style={{
                backgroundColor: `${STATUS_DEFINITIONS.ACTIVE.color}20`,
                borderColor: `${STATUS_DEFINITIONS.ACTIVE.color}50`,
                color: STATUS_DEFINITIONS.ACTIVE.color,
              }}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Event Engine Aktif</span>
            </span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="mt-6 flex gap-2 pt-4 border-t border-[#1e293b]">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'simulator'
                ? 'bg-[#2563EB] text-white shadow'
                : 'bg-[#080c16] text-slate-400 hover:text-white border border-[#1e293b]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Simulator Event ({events.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'tts'
                ? 'bg-[#2563EB] text-white shadow'
                : 'bg-[#080c16] text-slate-400 hover:text-white border border-[#1e293b]'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Text-to-Speech (TTS)</span>
          </button>
          <button
            onClick={() => setActiveTab('soundboard')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'soundboard'
                ? 'bg-[#2563EB] text-white shadow'
                : 'bg-[#080c16] text-slate-400 hover:text-white border border-[#1e293b]'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Soundboard Cues</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Action Panels */}
        <div className="lg:col-span-2 space-y-6">
          {/* TAB 1: SIMULATOR TRIGGER PAD */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              {/* Trigger Name Input */}
              <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3">
                <div className="w-full sm:w-1/3">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Nama User Penonton
                  </label>
                  <input
                    type="text"
                    value={customUsername}
                    onChange={(e) => setCustomUsername(e.target.value)}
                    className="w-full bg-[#080c16] border border-[#1e293b] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div className="w-full sm:w-2/3">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Pesan Chat / Catatan Donasi
                  </label>
                  <input
                    type="text"
                    value={customDetail}
                    onChange={(e) => setCustomDetail(e.target.value)}
                    className="w-full bg-[#080c16] border border-[#1e293b] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Fast Simulation Trigger Buttons */}
              <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span>Tombol Uji Coba Cepat (1-Tap Simulation)</span>
                  </h3>
                  {lastTriggered && (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 animate-pulse">
                      Terkirim: {lastTriggered}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Chat */}
                  <button
                    onClick={() => triggerEvent('chat', customDetail || 'Halo semuanya, salam kenal!')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-blue-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <MessageSquare className="w-5 h-5 text-blue-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Chat Komentar</span>
                    <span className="text-[10px] text-slate-400">Teks & TTS</span>
                  </button>

                  {/* Gift Mawar */}
                  <button
                    onClick={() => triggerEvent('gift', 'mengirim 5x Mawar Merah 🌹', 5, 'Mawar')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-rose-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <Gift className="w-5 h-5 text-rose-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Gift Mawar (x5)</span>
                    <span className="text-[10px] text-slate-400">TikTok Gift</span>
                  </button>

                  {/* Gift Paus */}
                  <button
                    onClick={() => triggerEvent('gift', 'mengirim Paus Biru Sultan 🐋🔥', 1000, 'Koin')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-cyan-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <Gift className="w-5 h-5 text-cyan-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Gift Paus Sultan</span>
                    <span className="text-[10px] text-slate-400">Mega Alert</span>
                  </button>

                  {/* Tap Layar / Like */}
                  <button
                    onClick={() => triggerEvent('like', 'mengetuk layar 100x ❤️')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-pink-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <Heart className="w-5 h-5 text-pink-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Tap Layar (Like)</span>
                    <span className="text-[10px] text-slate-400">100 Likes</span>
                  </button>

                  {/* Follow */}
                  <button
                    onClick={() => triggerEvent('follow', 'mulai mengikuti siaran kamu!')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-emerald-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <UserPlus className="w-5 h-5 text-emerald-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Follow Baru</span>
                    <span className="text-[10px] text-slate-400">Bell Sfx</span>
                  </button>

                  {/* Share */}
                  <button
                    onClick={() => triggerEvent('share', 'membagikan siaran ke 10 teman!')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-amber-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <Share2 className="w-5 h-5 text-amber-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Share Live</span>
                    <span className="text-[10px] text-slate-400">Viral Boost</span>
                  </button>

                  {/* Saweria / Trakteer Rp 50.000 */}
                  <button
                    onClick={() => triggerEvent('donation', 'Donasi Rp 50.000: "Semangat push rank sampai Mythic bang!"', 50000, 'Rp')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-emerald-400 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <DollarSign className="w-5 h-5 text-emerald-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Donasi Saweria</span>
                    <span className="text-[10px] text-slate-400">Rp 50.000 + TTS</span>
                  </button>

                  {/* Viewer Peak */}
                  <button
                    onClick={() => triggerEvent('viewer', 'Siaran mencapai 1.500 penonton aktif!')}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-purple-500 hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <Users className="w-5 h-5 text-purple-400 mb-1.5 group-hover:scale-110 transition" />
                    <span className="text-xs font-bold text-white">Peak Penonton</span>
                    <span className="text-[10px] text-slate-400">1.500 Viewers</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TTS CONFIGURATION */}
          {activeTab === 'tts' && (
            <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
                <div className="flex items-center space-x-2">
                  <Mic className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">
                    Pengaturan Text-to-Speech (TTS Bahasa Indonesia)
                  </h3>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ttsConfig.enabled}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, enabled: e.target.checked };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2563EB]"></div>
                </label>
              </div>

              {/* Toggles for TTS categories */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="p-3 rounded-xl bg-[#080c16] border border-[#1e293b] flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">Baca Donasi</span>
                  <input
                    type="checkbox"
                    checked={ttsConfig.readDonations}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, readDonations: e.target.checked };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="rounded text-[#2563EB] focus:ring-0"
                  />
                </label>

                <label className="p-3 rounded-xl bg-[#080c16] border border-[#1e293b] flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">Baca Gift TikTok</span>
                  <input
                    type="checkbox"
                    checked={ttsConfig.readGifts}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, readGifts: e.target.checked };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="rounded text-[#2563EB] focus:ring-0"
                  />
                </label>

                <label className="p-3 rounded-xl bg-[#080c16] border border-[#1e293b] flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">Baca Chat Penonton</span>
                  <input
                    type="checkbox"
                    checked={ttsConfig.readComments}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, readComments: e.target.checked };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="rounded text-[#2563EB] focus:ring-0"
                  />
                </label>
              </div>

              {/* Sliders for Volume, Speed, Pitch */}
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Volume Suara TTS</span>
                    <span className="font-mono text-blue-400">{Math.round(ttsConfig.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={ttsConfig.volume}
                    onChange={(e) => {
                      const updated = { ...ttsConfig, volume: parseFloat(e.target.value) };
                      onUpdateTTSConfig(updated);
                      ttsService.updateConfig(updated);
                    }}
                    className="w-full accent-[#2563EB]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Kecepatan Bicara (Speed)</span>
                    <span className="font-mono text-blue-400">{ttsConfig.rate}x</span>
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
                    className="w-full accent-[#2563EB]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Nada Suara (Pitch)</span>
                    <span className="font-mono text-blue-400">{ttsConfig.pitch}x</span>
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
                    className="w-full accent-[#2563EB]"
                  />
                </div>
              </div>

              {/* Test TTS Box */}
              <div className="pt-3 border-t border-[#1e293b] flex items-center gap-2">
                <input
                  type="text"
                  value={testVoiceText}
                  onChange={(e) => setTestVoiceText(e.target.value)}
                  placeholder="Ketik kalimat uji coba suara..."
                  className="flex-1 bg-[#080c16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  onClick={handleTestTTS}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-600 active:scale-95 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Uji Suara</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SOUNDBOARD CUES */}
          {activeTab === 'soundboard' && (
            <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Volume2 className="w-4 h-4 text-blue-400" />
                    <span>Soundboard Efek Suara Prosedural</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Efek prosedural tetap tersedia, dan file audio pendek dapat diimpor lalu disimpan di perangkat ini.
                  </p>
                </div>
                <label className="shrink-0 px-3 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold cursor-pointer transition">
                  Impor Audio
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

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                {(
                  [
                    { id: 'horn', name: 'Air Horn Blast', type: 'horn', desc: 'Suara terompet hype' },
                    { id: 'level_up', name: 'Level Up Fanfare', type: 'level_up', desc: 'Melodi nada naik ceria' },
                    { id: 'tada', name: 'Tada! Victory', type: 'tada', desc: 'Akord perayaan donasi' },
                    { id: 'bell', name: 'Bell Notifikasi', type: 'bell', desc: 'Lonceng ting jernih' },
                    { id: 'cheer', name: 'Cheer Sorak', type: 'cheer', desc: 'Gemuruh penonton' },
                    { id: 'game_over', name: 'Game Over Wah', type: 'game_over', desc: 'Efek komedi kalah' },
                  ] as const
                ).map((sfx) => (
                  <button
                    key={sfx.id}
                    onClick={() => handlePlaySoundboard(sfx.type)}
                    className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b] hover:border-[#38BDF8] hover:bg-[#131f38] transition flex flex-col items-center text-center group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#1e293b] flex items-center justify-center mb-2 group-hover:bg-[#2563EB] transition">
                      <Play className="w-4 h-4 text-white ml-0.5" />
                    </div>
                    <span className="text-xs font-bold text-white">{sfx.name}</span>
                    <span className="text-[10px] text-slate-400">{sfx.desc}</span>
                  </button>
                ))}
              </div>

              {soundboardItems.some((item) => item.id.startsWith('sb_custom_')) && (
                <div className="pt-3 border-t border-[#1e293b] space-y-2">
                  <h4 className="text-xs font-bold text-slate-300">Audio Diimpor</h4>
                  <div className="space-y-2">
                    {soundboardItems.filter((item) => item.id.startsWith('sb_custom_')).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl bg-[#080c16] border border-[#1e293b] p-2.5">
                        <button
                          onClick={() => handlePlaySoundboard(item)}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left hover:text-blue-300 transition"
                          aria-label={`Putar ${item.name}`}
                        >
                          <Play className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                          <span className="text-xs font-semibold text-white truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{item.durationSec}s</span>
                        </button>
                        <button
                          onClick={() => void updateImportedSound(item, { isFavorite: !item.isFavorite })}
                          className={`p-1.5 transition ${item.isFavorite ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                          aria-label={`${item.isFavorite ? 'Hapus dari' : 'Tambahkan ke'} favorit ${item.name}`}
                          aria-pressed={item.isFavorite}
                        >
                          <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-current' : ''}`} />
                        </button>
                        <select
                          value={item.isQuickSlot ? String(item.quickSlotKey ?? '') : ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            void updateImportedSound(item, value ? { isQuickSlot: true, quickSlotKey: Number(value) } : { isQuickSlot: false, quickSlotKey: undefined });
                          }}
                          className="bg-[#111b2e] border border-[#1e293b] rounded-md px-1.5 py-1 text-[10px] text-slate-300"
                          aria-label={`Quick Slot untuk ${item.name}`}
                        >
                          <option value="">Slot</option>
                          {[1, 2, 3, 4].map((slot) => (
                            <option key={slot} value={slot}>Q{slot}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => void handleDeleteSound(item)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition"
                          aria-label={`Hapus ${item.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Live Event Timeline Feed */}
        <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 flex flex-col h-[520px] shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Live Event Feed</h3>
            </div>
            <button
              onClick={handleClearHistory}
              className="text-[11px] text-slate-400 hover:text-red-400 flex items-center space-x-1"
              title="Bersihkan riwayat event"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1">
            {events.map((evt) => {
              let badgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
              let Icon = MessageSquare;

              if (evt.type === 'gift') {
                badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                Icon = Gift;
              } else if (evt.type === 'donation') {
                badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                Icon = DollarSign;
              } else if (evt.type === 'like') {
                badgeColor = 'bg-pink-500/10 text-pink-400 border-pink-500/20';
                Icon = Heart;
              } else if (evt.type === 'follow') {
                badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                Icon = UserPlus;
              } else if (evt.type === 'share') {
                badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                Icon = Share2;
              }

              return (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-xl bg-[#080c16] border border-[#1e293b] flex items-start space-x-2.5 hover:border-slate-600 transition"
                >
                  <div className="p-1.5 rounded-lg bg-[#0e172a] border border-[#1e293b] text-slate-300">
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate">
                        {evt.username}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 mt-0.5 leading-snug break-words">
                      {evt.detail}
                    </p>

                    <div className="mt-1 flex items-center space-x-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badgeColor}`}>
                        {evt.type.toUpperCase()}
                      </span>
                      {evt.isSimulation && (
                        <span className="text-[9px] text-slate-500">Simulasi</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {events.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold text-slate-400">Belum ada event tercatat</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Gunakan tombol di tab Simulator untuk memicu event.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
