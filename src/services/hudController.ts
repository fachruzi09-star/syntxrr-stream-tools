/**
 * hudController.ts
 *
 * Penerjemah state aplikasi (single source of truth) menjadi model panel Floating HUD
 * yang digambar oleh overlay native. Modul ini murni: tidak menyimpan state, tidak
 * memutar audio, tidak memalsukan data. Semua nilai berasal dari App.tsx.
 */

import type { HudChatTab, HudRowModel, HudSliderModel, HudStateModel, HudStatusTone } from './nativeCompanionBridge';

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
  events: HudChatEntry[]
): { text: string; tone: HudStatusTone } {
  if (events.length === 0) return status('Belum terhubung', 'off');

  const newest = events.reduce((acc, item) => (item.timestamp > acc.timestamp ? item : acc), events[0]);
  if (newest.isSimulation) return status('Sumber simulasi', 'warn');
  if (Date.now() - newest.timestamp > SOURCE_FRESH_MS) return status('Sumber tidak aktif', 'warn');
  return status('Terhubung', 'ok');
}

export function buildChatModel(
  events: HudChatEntry[],
  tab: HudChatTab,
  paused: boolean,
  unreadCount: number
): HudStateModel {
  const filtered = filterHudEvents(events, tab);
  const sourceStatus = hudEventSourceStatus(events);

  const rows: HudRowModel[] = filtered.map((event) => ({
    label: event.username,
    sub: event.detail,
    trailing: formatClock(event.timestamp),
  }));

  return {
    panel: 'chat',
    title: 'Live Chat',
    status: paused
      ? status(unreadCount > 0 ? `Dijeda · ${unreadCount} baru` : 'Dijeda', 'warn')
      : sourceStatus,
    tabs: TAB_DEFS,
    activeTab: tab,
    rows,
    listHeightDp: 236,
    emptyText:
      tab === 'chat'
        ? 'Belum ada chat. Panel tetap mengumpulkan event selama sumber aktif.'
        : `Belum ada event ${tab}.`,
  };
}

export function buildSoundboardModel(
  sounds: HudSoundEntry[],
  playingId: string | null,
  soundboardVolume: number,
  ttsVolume: number
): HudStateModel {
  const favorites = sounds.filter((sound) => sound.isFavorite || sound.isQuickSlot).slice(0, 8);
  const source = favorites.length > 0 ? favorites : sounds.slice(0, 8);

  const rows: HudRowModel[] = source.map((sound) => ({
    label: `${sound.icon ? `${sound.icon} ` : ''}${sound.name}`,
    trailing: playingId === sound.id ? 'Memutar' : 'Tap',
    action: 'soundboard.play',
    id: sound.id,
  }));

  const sliders: HudSliderModel[] = [
    {
      id: 'soundboardVolume',
      label: 'Volume efek',
      value: Math.round(soundboardVolume * 100),
      max: 100,
      action: 'soundboard.volume',
    },
    {
      id: 'ttsVolume',
      label: 'Volume TTS',
      value: Math.round(ttsVolume * 100),
      max: 100,
      action: 'tts.volume',
    },
  ];

  return {
    panel: 'soundboard',
    title: 'Soundboard',
    status: playingId ? status('Memutar', 'ok') : status('Siap', 'ok'),
    sliders,
    rows,
    listHeightDp: 176,
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
}): HudStateModel {
  const { nowPlaying, isPlaying, muted, volume, queue, requestSourceConnected } = options;

  const rows: HudRowModel[] = [];

  rows.push({
    label: nowPlaying ? nowPlaying.title : 'Tidak ada lagu aktif',
    sub: nowPlaying
      ? [nowPlaying.artist, muted ? 'Mute' : undefined].filter(Boolean).join(' · ')
      : 'Pilih lagu dari Music',
    trailing: nowPlaying ? (isPlaying ? 'Memutar' : 'Dijeda') : '',
  });

  rows.push({
    label: isPlaying ? 'Pause' : 'Play',
    sub: 'Kontrol streamer',
    trailing: '▶︎/❙❙',
    action: 'music.toggle',
  });

  rows.push({
    label: 'Next lagu',
    sub: 'Hanya streamer, bukan perintah viewer',
    trailing: '⏭',
    action: 'music.next',
  });

  rows.push({
    label: muted ? 'Unmute musik' : 'Mute musik',
    sub: 'Terpisah dari Pause',
    trailing: muted ? '🔇' : '🔊',
    action: 'music.mute',
  });

  queue.slice(0, 4).forEach((item, index) => {
    rows.push({
      label: `${index + 1}. ${item.title}`,
      sub: item.artist || 'Queue',
    });
  });

  const sliders: HudSliderModel[] = [
    {
      id: 'audioVolume',
      label: 'Volume musik',
      value: Math.round(volume),
      max: 100,
      action: 'music.volume',
    },
  ];

  const statusInfo = nowPlaying
    ? isPlaying
      ? status('Memutar', 'ok')
      : status('Dijeda', 'warn')
    : status('Tidak ada lagu', 'off');

  return {
    panel: 'music',
    title: 'Music & Request',
    status: statusInfo,
    sliders,
    rows,
    listHeightDp: 214,
    emptyText: requestSourceConnected
      ? 'Antrean kosong.'
      : 'Antrean kosong. Perintah !play menunggu sumber event TikTok aktif.',
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

  const rows: HudRowModel[] = [
    {
      label: muted ? 'Unmute mic' : 'Mute mic',
      sub: 'Hanya jalur mic SYNTXRR · mic TikTok dikendalikan aplikasi TikTok',
      trailing: muted ? '🔇' : '🎙',
      action: 'mic.mute',
    },
  ];

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
    rows,
    listHeightDp: 92,
    emptyText: 'Mikrofon tidak terdeteksi.',
  };
}
