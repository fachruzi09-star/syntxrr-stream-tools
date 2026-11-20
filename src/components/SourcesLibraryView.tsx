import React, { useState } from 'react';
import {
  SourceType,
  StudioElement,
} from '../types';
import {
  STATUS_DEFINITIONS,
  FeatureStatus,
} from '../theme/designSystem';
import {
  Layers,
  Search,
  Plus,
  Type,
  Image as ImageIcon,
  Video,
  Square,
  Minus,
  Camera,
  Smartphone,
  Globe,
  Sliders,
  Volume2,
  Music,
  User,
  MessageSquare,
  Flame,
  BarChart3,
  Award,
  ListMusic,
  FileText,
  Users,
  Bell,
  Sparkles,
  Radio,
  Check,
  Eye,
  Info,
} from 'lucide-react';

interface SourceDefinition {
  type: SourceType;
  name: string;
  category: 'basic' | 'dynamic';
  categoryLabel: string;
  status: FeatureStatus;
  description: string;
  icon: React.ReactNode;
  defaultDimensions: { width: number; height: number };
  defaultProperties: Record<string, any>;
}

export const SOURCE_CATALOG: SourceDefinition[] = [
  // 11 BASIC SOURCES
  {
    type: 'text',
    name: 'Teks Statis',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Menampilkan judul siaran, pengumuman, atau jadwal live streaming dengan kustomisasi font dan warna.',
    icon: <Type className="w-5 h-5 text-blue-400" />,
    defaultDimensions: { width: 60, height: 8 },
    defaultProperties: {
      text: 'SYNTXRR LIVE STREAM',
      fontSize: 20,
      color: '#FFFFFF',
      fontWeight: 'bold',
      backgroundColor: 'transparent',
    },
  },
  {
    type: 'image',
    name: 'Gambar / Logo',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Logo watermark, sponsor banner, bingkai foto, atau stiker PNG transparan.',
    icon: <ImageIcon className="w-5 h-5 text-emerald-400" />,
    defaultDimensions: { width: 25, height: 15 },
    defaultProperties: {
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
      borderRadius: 8,
      fit: 'contain',
    },
  },
  {
    type: 'video',
    name: 'Pemutar Video Loop',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Video latar belakang animasi loop, intro siaran, atau video transisi MP4/WebM.',
    icon: <Video className="w-5 h-5 text-indigo-400" />,
    defaultDimensions: { width: 50, height: 30 },
    defaultProperties: {
      loop: true,
      muted: true,
      autoplay: true,
    },
  },
  {
    type: 'shape',
    name: 'Bentuk Geometri',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Bentuk latar belakang persegi atau rounded pill untuk memberi kontras pada elemen teks.',
    icon: <Square className="w-5 h-5 text-amber-400" />,
    defaultDimensions: { width: 40, height: 12 },
    defaultProperties: {
      backgroundColor: 'rgba(242, 194, 48, 0.25)',
      borderColor: '#F2C230',
      borderWidth: 2,
      borderRadius: 12,
    },
  },
  {
    type: 'separator',
    name: 'Garis Pembatas',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Garis pembatas vertikal/horizontal elegan dengan efek glow untuk pemisah informasi.',
    icon: <Minus className="w-5 h-5 text-slate-400" />,
    defaultDimensions: { width: 80, height: 2 },
    defaultProperties: {
      lineColor: '#F2C230',
      glow: true,
      thickness: 2,
    },
  },
  {
    type: 'camera',
    name: 'Kamera / Facecam',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Feed video kamera depan/belakang smartphone secara real-time dengan border modern.',
    icon: <Camera className="w-5 h-5 text-cyan-400" />,
    defaultDimensions: { width: 38, height: 24 },
    defaultProperties: {
      facingMode: 'user',
      borderColor: '#F2C230',
      borderRadius: 16,
      borderWidth: 3,
    },
  },
  {
    type: 'screen_capture',
    name: 'Tangkapan Layar HP',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Tangkapan layar game atau aplikasi Android via MediaProjection API 60FPS.',
    icon: <Smartphone className="w-5 h-5 text-rose-400" />,
    defaultDimensions: { width: 90, height: 50 },
    defaultProperties: {
      cropMode: 'fit',
      fps: 60,
    },
  },
  {
    type: 'browser_embed',
    name: 'Browser Embed Web',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Menyematkan widget HTML kustom, URL situs web, atau browser source eksternal.',
    icon: <Globe className="w-5 h-5 text-teal-400" />,
    defaultDimensions: { width: 70, height: 35 },
    defaultProperties: {
      url: 'https://syntxrr.com/widgets/preview',
      refreshRate: 0,
    },
  },
  {
    type: 'running_text',
    name: 'Teks Berjalan (Marquee)',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Running text pengumuman berjalan horizontal di bagian atas atau bawah siaran.',
    icon: <Sliders className="w-5 h-5 text-sky-400" />,
    defaultDimensions: { width: 100, height: 6 },
    defaultProperties: {
      text: 'SELAMAT DATANG DI LIVE STREAM! FOLLOW & TAP LAYAR UNTUK MENDUKUNG KREATOR!',
      speed: 2,
      textColor: '#FFFFFF',
      bgColor: '#1E232D',
    },
  },
  {
    type: 'audio',
    name: 'Audio Latar Belakang',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Jalur input audio untuk musik BGM atau mixing mikrofon dengan kontrol volume independen.',
    icon: <Volume2 className="w-5 h-5 text-purple-400" />,
    defaultDimensions: { width: 25, height: 8 },
    defaultProperties: {
      volume: 85,
      channel: 'bgm',
    },
  },
  {
    type: 'soundboard',
    name: 'Soundboard Cues',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Pemicu efek suara reaksi langsung (Air Horn, Applause, Level Up, Tada).',
    icon: <Music className="w-5 h-5 text-pink-400" />,
    defaultDimensions: { width: 30, height: 10 },
    defaultProperties: {
      presetSfx: 'horn',
      volume: 90,
    },
  },

  // 14 DYNAMIC SOURCES
  {
    type: 'dynamic_text',
    name: 'Teks Dinamis Variabel',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Teks otomatis dengan variabel token seperti {username}, {target}, {waktu}, atau {durasi}.',
    icon: <Type className="w-5 h-5 text-blue-300" />,
    defaultDimensions: { width: 65, height: 8 },
    defaultProperties: {
      template: 'Top Donatur: {top_donor_name}',
      fallback: 'Belum ada donasi hari ini',
    },
  },
  {
    type: 'username',
    name: 'Nama Penonton Aktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Menyorot nama penonton terbaru yang mengirim gift, komentar, atau melakukan share.',
    icon: <User className="w-5 h-5 text-green-400" />,
    defaultDimensions: { width: 45, height: 8 },
    defaultProperties: {
      prefix: '⭐ ',
      badge: 'VIP Supporter',
    },
  },
  {
    type: 'avatar',
    name: 'Avatar Penonton Dinamis',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Foto profil penonton yang baru saja memberikan interaksi live terbaru.',
    icon: <User className="w-5 h-5 text-yellow-400" />,
    defaultDimensions: { width: 14, height: 14 },
    defaultProperties: {
      shape: 'circle',
      borderGlow: true,
    },
  },
  {
    type: 'chat_message',
    name: 'Kotak Chat Interaktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Stream chatbox real-time dengan dukungan avatar, nama pengirim, badge, dan animasi masuk.',
    icon: <MessageSquare className="w-5 h-5 text-sky-400" />,
    defaultDimensions: { width: 85, height: 28 },
    defaultProperties: {
      maxMessages: 5,
      fontSize: 13,
      showBadges: true,
      backgroundColor: 'rgba(15, 19, 27, 0.82)',
    },
  },
  {
    type: 'event_feed',
    name: 'Event Feed Berjalan',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Daftar riwayat aktivitas penonton (follow, share, like, gift) yang terus terupdate otomatis.',
    icon: <Flame className="w-5 h-5 text-orange-400" />,
    defaultDimensions: { width: 80, height: 16 },
    defaultProperties: {
      maxItems: 4,
      slideAnimation: true,
    },
  },
  {
    type: 'counter',
    name: 'Penghitung Target (Goal)',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Penghitung angka dinamis untuk target Like, Follower baru, atau Sub target siaran.',
    icon: <BarChart3 className="w-5 h-5 text-emerald-400" />,
    defaultDimensions: { width: 50, height: 10 },
    defaultProperties: {
      current: 1240,
      target: 2000,
      label: 'Target Follower Hari Ini',
    },
  },
  {
    type: 'combo_counter',
    name: 'Combo Gift Counter',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Penghitung multiplier gift berturut-turut (Combo x10, x50, x100) dengan efek membesar.',
    icon: <Sparkles className="w-5 h-5 text-amber-300" />,
    defaultDimensions: { width: 35, height: 12 },
    defaultProperties: {
      multiplier: 25,
      giftName: 'Mawar Merah',
    },
  },
  {
    type: 'progress_bar',
    name: 'Progress Bar Donasi',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Bilah progres visual donasi dengan persentase real-time dan jumlah nominal terkumpul.',
    icon: <BarChart3 className="w-5 h-5 text-cyan-400" />,
    defaultDimensions: { width: 80, height: 9 },
    defaultProperties: {
      currentAmount: 350000,
      targetAmount: 1000000,
      currency: 'Rp',
      barColor: '#F2C230',
    },
  },
  {
    type: 'leaderboard',
    name: 'Peringkat Donatur (Leaderboard)',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Klasemen 3 donatur teratas siaran hari ini dengan lencana mahkota emas/perak/perunggu.',
    icon: <Award className="w-5 h-5 text-yellow-300" />,
    defaultDimensions: { width: 65, height: 22 },
    defaultProperties: {
      topCount: 3,
      showAmounts: true,
    },
  },
  {
    type: 'song_request',
    name: 'Now Playing & Request',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Kartu lagu yang sedang diputar beserta judul, artis, pengirim request, dan durasi.',
    icon: <ListMusic className="w-5 h-5 text-pink-400" />,
    defaultDimensions: { width: 85, height: 11 },
    defaultProperties: {
      showAlbumArt: true,
      showRequester: true,
      cardStyle: 'compact',
    },
  },
  {
    type: 'lyrics',
    name: 'Tampilan Lirik Berjalan',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'SIMULATION',
    description: 'Lirik lagu otomatis selaras dengan playback musik lokal atau streaming.',
    icon: <FileText className="w-5 h-5 text-violet-400" />,
    defaultDimensions: { width: 70, height: 14 },
    defaultProperties: {
      currentLine: 'Menatap layar malam tak berujung...',
      align: 'center',
    },
  },
  {
    type: 'live_viewer_counter',
    name: 'Jumlah Penonton Aktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Badge kecil indikator siaran langsung disertai angka jumlah penonton aktif.',
    icon: <Users className="w-5 h-5 text-red-400" />,
    defaultDimensions: { width: 30, height: 7 },
    defaultProperties: {
      viewerCount: 1420,
      liveBadge: true,
    },
  },
  {
    type: 'event_alert',
    name: 'Event Alert Pop-up',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Notifikasi animasi pop-up saat terjadi Gift, Follow, Share, atau Donasi masuk.',
    icon: <Bell className="w-5 h-5 text-blue-400" />,
    defaultDimensions: { width: 80, height: 11 },
    defaultProperties: {
      soundEnabled: true,
      accentColor: '#F2C230',
      animation: 'slide_in',
    },
  },
  {
    type: 'sticker',
    name: 'Stiker Reaksi Interaktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Animasi stiker interaktif yang muncul ketika penonton mengetuk layar berkali-kali.',
    icon: <Sparkles className="w-5 h-5 text-amber-400" />,
    defaultDimensions: { width: 22, height: 22 },
    defaultProperties: {
      stickerId: 'fire',
      floatEffect: true,
    },
  },
  {
    type: 'live_text',
    name: 'Teks Siaran Langsung',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Status siaran langsung: Bitrate, FPS, Resolusi 1080p, dan Durasi On-Air.',
    icon: <Radio className="w-5 h-5 text-emerald-400" />,
    defaultDimensions: { width: 45, height: 6 },
    defaultProperties: {
      showFps: true,
      showBitrate: true,
    },
  },
];

interface SourcesLibraryViewProps {
  onAddElementToStudio: (element: StudioElement) => void;
  onNavigateToStudio: () => void;
}

export const SourcesLibraryView: React.FC<SourcesLibraryViewProps> = ({
  onAddElementToStudio,
  onNavigateToStudio,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'basic' | 'dynamic'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<SourceDefinition | null>(SOURCE_CATALOG[0]);
  const [installedCount, setInstalledCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredSources = SOURCE_CATALOG.filter((src) => {
    if (activeTab === 'basic' && src.category !== 'basic') return false;
    if (activeTab === 'dynamic' && src.category !== 'dynamic') return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        src.name.toLowerCase().includes(q) ||
        src.description.toLowerCase().includes(q) ||
        src.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleInstallToStudio = (src: SourceDefinition) => {
    const newElement: StudioElement = {
      id: `elem_${src.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: src.name,
      type: src.type,
      x: 10 + Math.floor(Math.random() * 10),
      y: 15 + Math.floor(Math.random() * 20),
      width: src.defaultDimensions.width,
      height: src.defaultDimensions.height,
      layer: 5,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: { ...src.defaultProperties },
    };

    onAddElementToStudio(newElement);
    setInstalledCount((prev) => prev + 1);
    setToastMessage(`"${src.name}" berhasil dipasang ke Studio.`);
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-5 pb-6">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] text-[var(--app-text)] px-4 py-2 rounded-xl shadow-[var(--app-shadow)] flex items-center gap-2.5 text-xs sm:text-sm font-medium max-w-[92vw]"
        >
          <Check className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={onNavigateToStudio}
            className="min-h-[36px] px-2.5 rounded-lg bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-xs text-[var(--app-accent-ink)] font-bold shrink-0"
          >
            Buka Studio
          </button>
        </div>
      )}

      {/* Header */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--app-text-muted)]">
              <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)]">
                Pustaka Komponen Resmi
              </span>
              <span aria-hidden="true" className="text-[var(--app-border-strong)]">
                /
              </span>
              <span className="font-mono-num">
                {SOURCE_CATALOG.length} Sumber (11 Dasar + 15 Dinamis)
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight mt-0.5">
              Pustaka Sumber Siaran (Sources)
            </h1>
            <p className="text-xs sm:text-sm text-[var(--app-text-muted)] mt-1 max-w-2xl leading-relaxed">
              Pilih elemen visual dasar maupun widget dinamis untuk disusun langsung ke kanvas Studio.
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateToStudio}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] font-semibold text-xs inline-flex items-center gap-2 transition-colors self-start md:self-auto shrink-0"
          >
            <Layers className="w-4 h-4 text-[var(--app-accent-text)]" />
            <span>Buka Studio Canvas</span>
          </button>
        </div>

        <div className="pt-3 border-t border-[var(--app-border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                { id: 'all', label: `Semua (${SOURCE_CATALOG.length})` },
                { id: 'basic', label: 'Dasar (11)' },
                { id: 'dynamic', label: `Dinamis (${SOURCE_CATALOG.length - 11})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama sumber atau fungsi..."
              aria-label="Cari sumber siaran"
              className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-10 pr-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {filteredSources.map((src) => {
            const statusConfig = STATUS_DEFINITIONS[src.status];
            const isSelected = selectedSource?.type === src.type;

            return (
              <div
                key={src.type}
                className={`rounded-2xl border transition-colors flex flex-col justify-between p-4 ${
                  isSelected
                    ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                    : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedSource(src)}
                  aria-pressed={isSelected}
                  className="w-full text-left space-y-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] rounded-xl"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] shrink-0">
                      {src.icon}
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0"
                      style={{
                        backgroundColor: `${statusConfig.color}18`,
                        borderColor: `${statusConfig.color}42`,
                        color: statusConfig.color,
                      }}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                      {src.name}
                    </h2>
                    <p className="text-xs text-[var(--app-text-muted)] line-clamp-2 leading-relaxed mt-1">
                      {src.description}
                    </p>
                  </div>
                </button>

                <div className="mt-4 pt-3 border-t border-[var(--app-border)] flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono-num text-[var(--app-text-muted)]">
                    {src.category === 'basic' ? 'Basic Source' : 'Dynamic Widget'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInstallToStudio(src)}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Pasang</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredSources.length === 0 && (
            <div className="sm:col-span-2 text-center py-12 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl text-[var(--app-text-muted)]">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold text-[var(--app-text-secondary)]">
                Tidak ada sumber yang cocok
              </p>
              <p className="text-xs mt-1">Coba kata kunci pencarian yang lain.</p>
            </div>
          )}
        </div>

        {/* Sticky Inspector Preview */}
        <aside className="lg:col-span-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 lg:sticky lg:top-20">
          {selectedSource ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] shrink-0">
                    {selectedSource.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-[var(--app-text)] truncate">
                      {selectedSource.name}
                    </h3>
                    <span className="text-[11px] font-mono-num text-[var(--app-text-muted)]">
                      ID: {selectedSource.type}
                    </span>
                  </div>
                </div>

                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0"
                  style={{
                    backgroundColor: `${STATUS_DEFINITIONS[selectedSource.status].color}18`,
                    borderColor: `${STATUS_DEFINITIONS[selectedSource.status].color}42`,
                    color: STATUS_DEFINITIONS[selectedSource.status].color,
                  }}
                >
                  {STATUS_DEFINITIONS[selectedSource.status].label}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] space-y-1">
                <div className="text-[10px] font-bold text-[var(--app-accent-text)] uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>Deskripsi Fungsional</span>
                </div>
                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  {selectedSource.description}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs space-y-0.5">
                <span className="font-semibold text-[var(--app-text)] block">
                  {STATUS_DEFINITIONS[selectedSource.status].label}
                </span>
                <span className="text-[var(--app-text-muted)] text-[11px] leading-relaxed block">
                  {STATUS_DEFINITIONS[selectedSource.status].description}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] block">
                    Lebar Default
                  </span>
                  <span className="font-mono-num text-[var(--app-text)] font-bold mt-0.5 block">
                    {selectedSource.defaultDimensions.width}%
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] block">
                    Tinggi Default
                  </span>
                  <span className="font-mono-num text-[var(--app-text)] font-bold mt-0.5 block">
                    {selectedSource.defaultDimensions.height}%
                  </span>
                </div>
              </div>

              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => handleInstallToStudio(selectedSource)}
                  className="w-full min-h-[44px] rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Pasang ke Studio Canvas</span>
                </button>

                <button
                  type="button"
                  onClick={onNavigateToStudio}
                  className="w-full min-h-[44px] rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Eye className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Lihat Studio Canvas ({installedCount} ditambahkan)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--app-text-muted)] text-xs">
              Pilih salah satu sumber untuk melihat detail parameter.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
