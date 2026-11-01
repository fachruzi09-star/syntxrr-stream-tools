import React, { useState } from 'react';
import {
  BasicSourceType,
  DynamicSourceType,
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
      backgroundColor: 'rgba(37, 99, 235, 0.4)',
      borderColor: '#38BDF8',
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
    description: 'Garis pembatas vertikal/horizontal elegan dengan efek glow neon untuk pemisah informasi.',
    icon: <Minus className="w-5 h-5 text-slate-400" />,
    defaultDimensions: { width: 80, height: 2 },
    defaultProperties: {
      lineColor: '#38BDF8',
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
      borderColor: '#2563EB',
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
      bgColor: '#1E3A8A',
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
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
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
      barColor: '#2563EB',
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
      accentColor: '#38BDF8',
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
    setToastMessage(`"${src.name}" berhasil dipasang ke Studio!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[#1E3A8A] border border-[#38BDF8] text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-sm font-medium animate-bounce">
          <Check className="w-4 h-4 text-[#38BDF8]" />
          <span>{toastMessage}</span>
          <button
            onClick={onNavigateToStudio}
            className="ml-2 bg-[#2563EB] hover:bg-blue-600 px-2 py-0.5 rounded text-xs text-white underline font-semibold"
          >
            Buka Studio →
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1e293b] text-blue-400 border border-blue-500/20">
                Pustaka Komponen Resmi
              </span>
              <span className="text-xs text-slate-400">
                25 Sumber Tersedia (11 Dasar + 14 Dinamis)
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Pustaka Sumber Siaran (Sources)
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Pilih elemen visual dasar dan dinamis untuk disusun ke dalam Studio Canvas. Setiap sumber memiliki parameter mandiri dan pemicu responsif.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onNavigateToStudio}
              className="px-4 py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#2563eb]/20 border border-[#334155] text-white font-medium text-sm flex items-center space-x-2 transition"
            >
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Buka Studio Canvas</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-[#1e293b]">
          <div className="flex bg-[#080c16] p-1 rounded-xl border border-[#1e293b] w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'all'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua ({SOURCE_CATALOG.length})
            </button>
            <button
              onClick={() => setActiveTab('basic')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'basic'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sumber Dasar (11)
            </button>
            <button
              onClick={() => setActiveTab('dynamic')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === 'dynamic'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sumber Dinamis (14)
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama sumber atau fungsi..."
              className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      </div>

      {/* Main Grid & Preview Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Source Cards List */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredSources.map((src) => {
            const statusConfig = STATUS_DEFINITIONS[src.status];
            const isSelected = selectedSource?.type === src.type;

            return (
              <div
                key={src.type}
                onClick={() => setSelectedSource(src)}
                className={`group relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#131f38] border-[#38BDF8] shadow-lg shadow-blue-950/40'
                    : 'bg-[#0e172a] border-[#1e293b] hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-[#080c16] border border-[#1e293b] group-hover:scale-105 transition">
                      {src.icon}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold border"
                        style={{
                          backgroundColor: `${statusConfig.color}15`,
                          borderColor: `${statusConfig.color}40`,
                          color: statusConfig.color,
                        }}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white mb-1 group-hover:text-blue-400 transition">
                    {src.name}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {src.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1e293b] flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {src.category === 'basic' ? 'Basic Source' : 'Dynamic Widget'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstallToStudio(src);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-600 active:scale-95 text-white font-medium text-xs flex items-center space-x-1 transition shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Pasang</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredSources.length === 0 && (
            <div className="col-span-2 text-center py-12 bg-[#0e172a] border border-[#1e293b] rounded-xl text-slate-400">
              <Search className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">Tidak ada sumber yang cocok</p>
              <p className="text-xs text-slate-500 mt-1">Coba kata kunci pencarian yang lain.</p>
            </div>
          )}
        </div>

        {/* Source Inspector Preview Detail */}
        <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 h-fit sticky top-20 shadow-lg">
          {selectedSource ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-3 rounded-xl bg-[#080c16] border border-[#1e293b]">
                    {selectedSource.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {selectedSource.name}
                    </h3>
                    <span className="text-xs text-slate-400">
                      Tipe ID: {selectedSource.type}
                    </span>
                  </div>
                </div>

                <span
                  className="px-2.5 py-1 rounded text-xs font-bold border"
                  style={{
                    backgroundColor: `${STATUS_DEFINITIONS[selectedSource.status].color}20`,
                    borderColor: `${STATUS_DEFINITIONS[selectedSource.status].color}50`,
                    color: STATUS_DEFINITIONS[selectedSource.status].color,
                  }}
                >
                  {STATUS_DEFINITIONS[selectedSource.status].label}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080c16] border border-[#1e293b]">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>Deskripsi Fungsional</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedSource.description}
                </p>
              </div>

              {/* Status explanation */}
              <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-900/40 text-xs text-blue-200">
                <span className="font-semibold block mb-0.5">
                  {STATUS_DEFINITIONS[selectedSource.status].label}:
                </span>
                <span className="text-slate-300 text-[11px]">
                  {STATUS_DEFINITIONS[selectedSource.status].description}
                </span>
              </div>

              {/* Default Dimensions */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-[#080c16] border border-[#1e293b]">
                  <span className="text-slate-400 block text-[10px]">Lebar Kanvas Default</span>
                  <span className="font-mono text-white font-semibold">
                    {selectedSource.defaultDimensions.width}%
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#080c16] border border-[#1e293b]">
                  <span className="text-slate-400 block text-[10px]">Tinggi Kanvas Default</span>
                  <span className="font-mono text-white font-semibold">
                    {selectedSource.defaultDimensions.height}%
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => handleInstallToStudio(selectedSource)}
                  className="w-full py-3 rounded-xl bg-[#2563EB] hover:bg-blue-600 active:scale-98 text-white font-bold text-sm flex items-center justify-center space-x-2 transition shadow-lg shadow-blue-600/30"
                >
                  <Plus className="w-4 h-4" />
                  <span>Pasang ke Studio Canvas</span>
                </button>

                <button
                  onClick={onNavigateToStudio}
                  className="w-full py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-200 font-medium text-xs flex items-center justify-center space-x-1.5 transition"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span>Lihat Studio Canvas ({installedCount} ditambahkan)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">Pilih salah satu sumber untuk melihat detail parameter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
