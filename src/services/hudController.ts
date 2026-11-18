/**
 * hudController.ts
 *
 * Penerjemah state aplikasi (single source of truth) menjadi model panel Floating HUD
 * yang digambar oleh overlay native. Modul ini murni: tidak menyimpan state, tidak
 * memutar audio, tidak memalsukan data. Semua nilai berasal dari App.tsx.
 */

import type {
  HudButtonModel,
  HudChatTab,
  HudGridModel,
  HudRowModel,
  HudSliderModel,
  HudStateModel,
  HudStatusTone,
} from './nativeCompanionBridge';
import type { ModeASessionMode, TikTokConnectionState } from '../types';

/** Batas buffer event di memori agar HUD ringan. */
export const HUD_EVENT_BUFFER_LIMIT = 60;

/** Event yang lebih tua dari ini tidak dianggap sebagai sumber yang aktif. */
const SOURCE_FRESH_MS = 120_000;

export interface HudChatEntry {
  id: string;
  type: string;
  username: string;
  detail: string;
  timestamp: number;
  isSimulation?: boolean;
}

export interface HudSoundEntry {
  id: string;
  name: string;
  icon?: string;
  isFavorite?: boolean;
  isQuickSlot?: boolean;
}

export interface HudQueueEntry {
  id: string;
  title: string;
  artist?: string;
}

const TAB_DEFS: { id: HudChatTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'gift', label: 'Gift' },
  { id: 'like', label: 'Like' },
  { id: 'follow', label: 'Follow' },
];

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = `${date.getHours()}`.padStart(2, '0');
  const mm = `${date.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}

function status(text: string, tone: HudStatusTone): { text: string; tone: HudStatusTone } {
  return { text, tone };
}

/** Event yang relevan untuk tab aktif, terbaru lebih dulu, identitas unik. */
export function filterHudEvents(events: HudChatEntry[], tab: HudChatTab): HudChatEntry[] {
  const seen = new Set<string>();
  const result: HudChatEntry[] = [];

  for (const event of events) {
    if (event.type !== tab) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
    if (result.length >= HUD_EVENT_BUFFER_LIMIT) break;
  }

  return result.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Status sumber event dilaporkan apa adanya:
 * - belum ada event sama sekali -> belum terhubung
 * - event terakhir adalah simulasi lokal -> sumber simulasi
 * - event asli masih segar -> terhubung
 */
export function hudEventSourceStatus(
  events: HudChatEntry[],
  connectionState?: TikTokConnectionState,
  modeASessionMode?: ModeASessionMode
): { text: string; tone: HudStatusTone } {
  if (modeASessionMode === 'without_live_connection') {
    return status('Tanpa koneksi LIVE', 'off');
  }
  if (connectionState === 'connected_direct') {
    return status('Terhubung (Direct)', 'ok');
  }
  if (connectionState === 'connected_euler') {
    return status('Terhubung (Euler)', 'ok');
  }
  if (
    connectionState === 'resolving_room' ||
    connectionState === 'connecting_direct' ||
    connectionState === 'connecting_euler' ||
    connectionState === 'reconnecting'
  ) {
    return status('Menghubungkan', 'warn');
  }
  if (connectionState === 'waiting_for_live') {
    return status('Menunggu LIVE', 'warn');
  }
  if (connectionState === 'error') {
    return status('Gagal terhubung', 'off');
  }

  if (events.length === 0) return status('Belum terhubung', 'off');

  const newest = events.reduce((acc, item) => (item.timestamp > acc.timestamp ? item : acc), events[0]);
  if (newest.isSimulation) return status('Sumber simulasi', 'warn');
  if (Date.now() - newest.timestamp > SOURCE_FRESH_MS) return status('Sumber tidak aktif', 'warn');
  return status('Terhubung', 'ok');
}

function mapEventsToRows(events: HudChatEntry[], tab: HudChatTab): HudRowModel[] {
  return filterHudEvents(events, tab).map((event) => ({
    label: event.username,
    sub: event.detail,
    trailing: formatClock(event.timestamp),
  }));
}

function chatEmptyTextForTab(tab: HudChatTab, modeASessionMode?: ModeASessionMode): string {
  if (modeASessionMode === 'without_live_connection') {
    return 'Mode A aktif tanpa koneksi LIVE. Event LIVE belum tersedia.';
  }
  return tab === 'chat'
    ? 'Belum ada chat. Panel tetap mengumpulkan event selama sumber aktif.'
    : `Belum ada event ${tab}.`;
}

export function buildChatModel(
  events: HudChatEntry[],
  tab: HudChatTab,
  paused: boolean,
  unreadCount: number,
  connectionState?: TikTokConnectionState,
  modeASessionMode?: ModeASessionMode
): HudStateModel {
  const sourceStatus = hudEventSourceStatus(events, connectionState, modeASessionMode);

  const rowsByTab: Record<HudChatTab, HudRowModel[]> = {
    chat: mapEventsToRows(events, 'chat'),
    gift: mapEventsToRows(events, 'gift'),
    like: mapEventsToRows(events, 'like'),
    follow: mapEventsToRows(events, 'follow'),
  };

  const emptyTextByTab: Record<HudChatTab, string> = {
    chat: chatEmptyTextForTab('chat', modeASessionMode),
    gift: chatEmptyTextForTab('gift', modeASessionMode),
    like: chatEmptyTextForTab('like', modeASessionMode),
    follow: chatEmptyTextForTab('follow', modeASessionMode),
  };

  const rows = rowsByTab[tab] ?? [];

  return {
    panel: 'chat',
    title: 'Live Chat',
    status: paused
      ? status(unreadCount > 0 ? `Dijeda · ${unreadCount} baru` : 'Dijeda', 'warn')
      : sourceStatus,
    tabs: TAB_DEFS,
    activeTab: tab,
    rows,
    rowsByTab,
    emptyTextByTab,
    listHeightDp: 164,
    emptyText: emptyTextByTab[tab] ?? chatEmptyTextForTab(tab, modeASessionMode),
  };
}

export function buildSoundboardModel(
  sounds: HudSoundEntry[],
  playingId: string | null,
  soundboardVolume: number,
  ttsVolume: number
): HudStateModel {
  const favorites = sounds.filter((sound) => sound.isFavorite || sound.isQuickSlot).slice(0, 16);
  const source = favorites.length > 0 ? favorites : sounds.slice(0, 16);

  // Grid persegi 4 kolom (maks 4x4). Label teks pendek, tanpa emoji.
  const grid: HudGridModel = {
    columns: 4,
    items: source.map((sound) => ({
      label: sound.name,
      id: sound.id,
      action: 'soundboard.play',
      active: playingId === sound.id,
    })),
  };

  const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));
  const sliders: HudSliderModel[] = [
    {
      id: 'soundboardVolume',
      label: 'Volume efek',
      value: clampPct(soundboardVolume * 100),
      max: 100,
      action: 'soundboard.volume',
    },
    {
      id: 'ttsVolume',
      label: 'Volume TTS',
      value: clampPct(ttsVolume * 100),
      max: 100,
      action: 'tts.volume',
    },
  ];

  return {
    panel: 'soundboard',
    title: 'Soundboard',
    status: playingId ? status('Memutar', 'ok') : status('Siap', 'ok'),
    sliders,
    grid,
    emptyText: 'Belum ada sound favorit. Kelola di Studio → Soundboard.',
  };
}

export function buildMusicModel(options: {
  nowPlaying: { title: string; artist?: string } | null;
  isPlaying: boolean;
  muted: boolean;
  volume: number;
  queue: HudQueueEntry[];
  requestSourceConnected: boolean;
  playbackStatus?: 'idle' | 'preparing' | 'playing' | 'paused' | 'completed' | 'stopped' | 'error';
  errorMessage?: string | null;
}): HudStateModel {
  const {
    nowPlaying,
    isPlaying,
    muted,
    volume,
    queue,
    requestSourceConnected,
    playbackStatus,
    errorMessage,
  } = options;

  // Hanya Play/Pause, Next, dan Mute.
  const buttons: HudButtonModel[] = [
    { label: isPlaying ? 'Pause' : 'Play', action: 'music.toggle', active: isPlaying },
    { label: 'Next', action: 'music.next' },
    { label: muted ? 'Unmute' : 'Mute', action: 'music.mute', active: muted },
  ];

  const rows: HudRowModel[] = [];

  const trailingLabel = nowPlaying
    ? isPlaying
      ? 'Memutar'
      : playbackStatus === 'preparing'
      ? 'Memuat'
      : playbackStatus === 'error'
      ? 'Gagal'
      : 'Dijeda'
    : '';

  rows.push({
    label: nowPlaying ? nowPlaying.title : 'Tidak ada lagu aktif',
    sub: nowPlaying
      ? [nowPlaying.artist, muted ? 'Mute' : undefined].filter(Boolean).join(' · ')
      : errorMessage
      ? errorMessage
      : 'Ketik !play <judul> di chat atau pilih dari Music',
    trailing: trailingLabel,
  });

  if (errorMessage && nowPlaying) {
    rows.push({
      label: 'Info pemutaran',
      sub: errorMessage,
    });
  }

  queue.slice(0, 3).forEach((item, index) => {
    rows.push({
      label: `${index + 1}. ${item.title}`,
      sub: item.artist || 'Queue',
    });
  });

  const sliders: HudSliderModel[] = [
    {
      id: 'audioVolume',
      label: 'Volume musik',
      value: Math.max(0, Math.min(100, Math.round(Number.isFinite(volume) ? volume : 85))),
      max: 100,
      action: 'music.volume',
    },
  ];

  const statusInfo =
    playbackStatus === 'error'
      ? status('Gagal putar', 'warn')
      : playbackStatus === 'preparing'
      ? status('Memuat lagu', 'warn')
      : nowPlaying
      ? isPlaying
        ? status('Memutar', 'ok')
        : status('Dijeda', 'warn')
      : status('Tidak ada lagu', 'off');

  return {
    panel: 'music',
    title: 'Music & Request',
    status: statusInfo,
    buttons,
    sliders,
    rows,
    listHeightDp: 128,
    emptyText: requestSourceConnected
      ? 'Antrean kosong.'
      : 'Antrean kosong. Perintah !play & !next menunggu sumber event TikTok aktif.',
  };
}

export function buildMixerModel(options: {
  available: boolean;
  metering: boolean;
  muted: boolean;
  level: number;
  reason?: string;
}): HudStateModel {
  const { available, metering, muted, level, reason } = options;

  const buttons: HudButtonModel[] = [
    { label: muted ? 'Unmute monitor' : 'Mute monitor', action: 'mic.mute', active: muted },
  ];

  const rows: HudRowModel[] = [];
  if (reason) {
    rows.push({ label: 'Status', sub: reason });
  }

  let statusInfo: { text: string; tone: HudStatusTone };
  if (!available) {
    statusInfo = status('Tidak tersedia', 'off');
  } else if (muted) {
    statusInfo = status('Mute', 'warn');
  } else if (!metering) {
    statusInfo = status('Meter tidak aktif', 'warn');
  } else {
    statusInfo = status('Aktif', 'ok');
  }

  return {
    panel: 'mixer',
    title: 'Audio Mixer',
    status: statusInfo,
    meter: {
      label: 'Level mic',
      value: muted ? 0 : level,
      muted,
      available: available && metering,
    },
    buttons,
    rows,
    emptyText: 'Mikrofon tidak terdeteksi.',
  };
}

/**
 * Snapshot semua panel sekaligus.
 *
 * Dikirim ke overlay native agar panel mana pun dapat digambar tanpa WebView aktif.
 * Ini hanya cache tampilan: tidak ada event LIVE yang dibuat atau diproses di native.
 */
export interface HudSnapshot {
  panels: Partial<Record<'chat' | 'soundboard' | 'music' | 'mixer', HudStateModel>>;
  generatedAt: number;
}

export function buildHudSnapshot(
  panels: Partial<Record<'chat' | 'soundboard' | 'music' | 'mixer', HudStateModel>>
): HudSnapshot {
  return { panels, generatedAt: Date.now() };
}
