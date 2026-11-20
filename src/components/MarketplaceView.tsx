import React, { useState } from 'react';
import {
  MarketplaceItem,
  MarketplaceFilter,
  MarketplaceCategory,
  StudioElement,
} from '../types';
import {
  ShoppingBag,
  Search,
  Star,
  Download,
  Check,
  Plus,
  Layers,
  Sparkles,
} from 'lucide-react';

interface MarketplaceViewProps {
  items: MarketplaceItem[];
  onInstallElements: (elements: StudioElement[]) => void;
  onNavigateToStudio: () => void;
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  items,
  onInstallElements,
  onNavigateToStudio,
}) => {
  const [activeFilter, setActiveFilter] = useState<MarketplaceFilter>('all');
  const [activeCategory] = useState<'all' | MarketplaceCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredItems = items.filter((item) => {
    if (activeCategory !== 'all' && item.category !== activeCategory) return false;
    if (activeFilter !== 'all' && item.filter !== activeFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleInstall = (item: MarketplaceItem) => {
    onInstallElements(item.elementsPayload);
    setInstalledIds((prev) => new Set([...prev, item.id]));
    setToastMessage(`"${item.name}" berhasil dipasang ke Studio.`);
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

      {/* Header Banner */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--app-text-muted)]">
              <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)] inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Katalog Widget &amp; Scene</span>
              </span>
              <span aria-hidden="true" className="text-[var(--app-border-strong)]">
                /
              </span>
              <span className="font-mono-num">{items.length} Paket Desain Terkurasi</span>
            </div>
            <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight mt-0.5">
              Marketplace Widget &amp; Template
            </h1>
            <p className="text-xs sm:text-sm text-[var(--app-text-muted)] mt-1 max-w-2xl leading-relaxed">
              Pasang paket overlay, alert widget, goal counter, dan layout scene siap pakai langsung ke Studio Canvas.
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

        <div className="pt-3 border-t border-[var(--app-border)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                { id: 'all', label: 'Semua' },
                { id: 'song_request', label: 'Now Playing' },
                { id: 'chat_message', label: 'Kotak Chat' },
                { id: 'counter', label: 'Progress Goal' },
                { id: 'alert', label: 'Alert Pop-up' },
                { id: 'overlay', label: 'Overlay Lengkap' },
              ] as const
            ).map((filt) => (
              <button
                key={filt.id}
                type="button"
                onClick={() => setActiveFilter(filt.id)}
                className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-colors ${
                  activeFilter === filt.id
                    ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                {filt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari widget, scene, kreator..."
              aria-label="Cari paket marketplace"
              className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-10 pr-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const isInstalled = installedIds.has(item.id) || item.isInstalled;

          return (
            <div
              key={item.id}
              className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] overflow-hidden transition-colors flex flex-col justify-between"
            >
              <div
                className={`h-36 bg-gradient-to-br ${item.previewGradient} relative p-4 flex flex-col justify-between`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/50 backdrop-blur-sm text-white border border-white/15">
                    {item.category.toUpperCase()}
                  </span>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[var(--app-accent)] text-xs font-bold font-mono-num border border-white/15">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{item.rating}</span>
                  </div>
                </div>

                <div>
                  <h2 className="font-display text-base font-bold text-white drop-shadow-sm">
                    {item.name}
                  </h2>
                  <span className="text-[11px] text-white/80">Oleh {item.author}</span>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                <p className="text-xs text-[var(--app-text-secondary)] line-clamp-3 leading-relaxed">
                  {item.description}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--app-border)] text-xs text-[var(--app-text-muted)] font-mono-num">
                  <div className="flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    <span>{item.downloads.toLocaleString()} unduhan</span>
                  </div>

                  <span className="text-[11px] text-[var(--app-accent-text)] font-bold">
                    {item.elementsPayload.length} elemen
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)]">
                <button
                  type="button"
                  onClick={() => handleInstall(item)}
                  className={`w-full min-h-[44px] rounded-xl font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors ${
                    isInstalled
                      ? 'bg-[var(--app-surface)] hover:bg-[var(--app-accent)] text-[var(--app-text)] hover:text-[var(--app-accent-ink)] border border-[var(--app-border-strong)] hover:border-[var(--app-accent)]'
                      : 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
                  }`}
                >
                  {isInstalled ? (
                    <>
                      <Check className="w-4 h-4 text-[var(--app-ok)]" />
                      <span>Pasang Ulang ke Studio</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Pasang ke Studio Canvas</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 text-center py-14 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl text-[var(--app-text-muted)]">
            <ShoppingBag className="w-9 h-9 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold text-[var(--app-text-secondary)]">
              Tidak ada widget yang cocok
            </p>
            <p className="text-xs mt-1">Coba kata kunci atau kategori lain.</p>
          </div>
        )}
      </div>
    </div>
  );
};
