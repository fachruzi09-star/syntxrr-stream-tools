import React, { useState } from 'react';
import {
  SourceType,
  StudioElement,
} from '../types';
import {
  STATUS_DEFINITIONS,
} from '../theme/designSystem';
import {
  STUDIO_ELEMENT_CATALOG,
  StudioSourceCatalogEntry,
  createStudioElementFromSource,
} from '../services/studioElementCatalog';
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
} from 'lucide-react';

export interface SourceDefinition extends StudioSourceCatalogEntry {
  icon: React.ReactNode;
}

const SOURCE_TYPE_ICONS: Record<SourceType, React.ReactNode> = {
  text: <Type className="w-5 h-5 text-blue-400" />,
  image: <ImageIcon className="w-5 h-5 text-emerald-400" />,
  video: <Video className="w-5 h-5 text-indigo-400" />,
  shape: <Square className="w-5 h-5 text-amber-400" />,
  separator: <Minus className="w-5 h-5 text-slate-400" />,
  camera: <Camera className="w-5 h-5 text-cyan-400" />,
  screen_capture: <Smartphone className="w-5 h-5 text-rose-400" />,
  browser_embed: <Globe className="w-5 h-5 text-teal-400" />,
  running_text: <Sliders className="w-5 h-5 text-sky-400" />,
  audio: <Volume2 className="w-5 h-5 text-purple-400" />,
  soundboard: <Music className="w-5 h-5 text-pink-400" />,
  dynamic_text: <Type className="w-5 h-5 text-blue-300" />,
  username: <User className="w-5 h-5 text-green-400" />,
  avatar: <User className="w-5 h-5 text-yellow-400" />,
  chat_message: <MessageSquare className="w-5 h-5 text-sky-400" />,
  event_feed: <Flame className="w-5 h-5 text-orange-400" />,
  counter: <BarChart3 className="w-5 h-5 text-emerald-400" />,
  combo_counter: <Sparkles className="w-5 h-5 text-amber-300" />,
  progress_bar: <BarChart3 className="w-5 h-5 text-cyan-400" />,
  leaderboard: <Award className="w-5 h-5 text-yellow-300" />,
  song_request: <ListMusic className="w-5 h-5 text-pink-400" />,
  lyrics: <FileText className="w-5 h-5 text-violet-400" />,
  live_viewer_counter: <Users className="w-5 h-5 text-red-400" />,
  event_alert: <Bell className="w-5 h-5 text-blue-400" />,
  sticker: <Sparkles className="w-5 h-5 text-amber-400" />,
  live_text: <Radio className="w-5 h-5 text-emerald-400" />,
};

export const SOURCE_CATALOG: SourceDefinition[] = STUDIO_ELEMENT_CATALOG.map((entry) => ({
  ...entry,
  icon: SOURCE_TYPE_ICONS[entry.type],
}));

interface SourcesLibraryViewProps {
  existingElements?: StudioElement[];
  onAddElementToStudio: (element: StudioElement) => void;
  onNavigateToStudio: () => void;
}

export const SourcesLibraryView: React.FC<SourcesLibraryViewProps> = ({
  existingElements = [],
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
    const newElement = createStudioElementFromSource(src.type, existingElements);

    onAddElementToStudio(newElement);
    setInstalledCount((prev) => prev + 1);
    setToastMessage(`"${src.name}" berhasil dipasang ke Studio.`);
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-4 pb-6">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] text-[var(--app-text)] px-4 py-2 rounded-xl shadow-[var(--app-shadow)] flex items-center gap-2.5 text-xs font-medium max-w-[92vw] anim-pop-in"
        >
          <Check className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={onNavigateToStudio}
            className="btn-press min-h-[36px] px-2.5 rounded-lg bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-xs text-[var(--app-accent-ink)] font-bold shrink-0"
          >
            Buka Studio
          </button>
        </div>
      )}

      {/* Compact Header & Filter Strip */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight truncate">
              Pustaka Sumber Siaran
            </h1>
            <span className="text-xs text-[var(--app-text-muted)] tabular-metrics whitespace-nowrap">
              {SOURCE_CATALOG.length} Sumber
            </span>
          </div>

          <button
            type="button"
            onClick={onNavigateToStudio}
            className="btn-press min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Layers className="w-4 h-4 text-[var(--app-accent-text)]" />
            <span>Studio Canvas</span>
          </button>
        </div>

        <div className="pt-2.5 border-t border-[var(--app-border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] overflow-x-auto no-scrollbar">
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
                className={`btn-press min-h-[44px] px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama sumber..."
              aria-label="Cari sumber siaran"
              className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-9 pr-3 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredSources.map((src) => {
            const statusConfig = STATUS_DEFINITIONS[src.status];
            const isSelected = selectedSource?.type === src.type;

            return (
              <div
                key={src.type}
                className={`rounded-2xl border transition-colors flex flex-col justify-between overflow-hidden ${
                  isSelected
                    ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                    : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedSource(src)}
                  aria-pressed={isSelected}
                  className="w-full p-4 text-left space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] shrink-0">
                      {src.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-sm font-bold text-[var(--app-text)] truncate">
                        {src.name}
                      </h2>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)] mt-0.5">
                        <span>{src.category === 'basic' ? 'Dasar' : 'Dinamis'}</span>
                        <span aria-hidden="true">·</span>
                        <span style={{ color: statusConfig.color }} className="font-semibold">
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--app-text-muted)] line-clamp-2 leading-relaxed">
                    {src.description}
                  </p>
                </button>

                <div className="px-4 py-2.5 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)] flex items-center justify-between gap-2">
                  <span className="text-[11px] tabular-metrics text-[var(--app-text-muted)]">
                    {src.defaultDimensions.width}% × {src.defaultDimensions.height}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInstallToStudio(src)}
                    className="btn-press min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center gap-1.5"
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

        {/* Sticky Single-Surface Inspector */}
        <aside className="lg:col-span-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] lg:sticky lg:top-20 divide-y divide-[var(--app-border)]">
          {selectedSource ? (
            <>
              <div className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] shrink-0">
                  {selectedSource.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-bold text-[var(--app-text)] truncate">
                    {selectedSource.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)] tabular-metrics mt-0.5">
                    <span>{selectedSource.type}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className="font-semibold"
                      style={{ color: STATUS_DEFINITIONS[selectedSource.status].color }}
                    >
                      {STATUS_DEFINITIONS[selectedSource.status].label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-1.5">
                <div className="text-xs font-semibold text-[var(--app-text)]">Deskripsi</div>
                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  {selectedSource.description}
                </p>
                <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed pt-1">
                  {STATUS_DEFINITIONS[selectedSource.status].description}
                </p>
              </div>

              <div className="grid grid-cols-2 divide-x divide-[var(--app-border)] bg-[var(--app-surface-muted)]">
                <div className="p-3.5">
                  <span className="text-[11px] text-[var(--app-text-muted)] block">Lebar Default</span>
                  <span className="tabular-metrics text-sm text-[var(--app-text)] font-bold mt-0.5 block">
                    {selectedSource.defaultDimensions.width}%
                  </span>
                </div>
                <div className="p-3.5">
                  <span className="text-[11px] text-[var(--app-text-muted)] block">Tinggi Default</span>
                  <span className="tabular-metrics text-sm text-[var(--app-text)] font-bold mt-0.5 block">
                    {selectedSource.defaultDimensions.height}%
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => handleInstallToStudio(selectedSource)}
                  className="btn-press w-full min-h-[44px] rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Pasang ke Studio Canvas</span>
                </button>

                <button
                  type="button"
                  onClick={onNavigateToStudio}
                  className="btn-press w-full min-h-[44px] rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold text-xs inline-flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Lihat Studio Canvas ({installedCount} dipasang)</span>
                </button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-[var(--app-text-muted)] text-xs">
              Pilih salah satu sumber untuk melihat detail parameter.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
