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

      {/* Compact Registry Header & Filter Bar */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight truncate">
              Marketplace Widget
            </h1>
            <span className="text-xs text-[var(--app-text-muted)] tabular-metrics whitespace-nowrap">
              {items.length} Paket
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

        <div className="pt-2.5 border-t border-[var(--app-border)] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] overflow-x-auto no-scrollbar">
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
                className={`btn-press min-h-[44px] px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                  activeFilter === filt.id
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                {filt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari widget, scene..."
              aria-label="Cari paket marketplace"
              className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-9 pr-3 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredItems.map((item) => {
          const isInstalled = installedIds.has(item.id) || item.isInstalled;

          return (
            <div
              key={item.id}
              className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] overflow-hidden transition-colors flex flex-col justify-between"
            >
              <div className={`h-32 bg-gradient-to-br ${item.previewGradient} relative overflow-hidden`}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-white/90">
                    <span className="uppercase tracking-wider">{item.category}</span>
                    <span className="inline-flex items-center gap-1 tabular-metrics text-[var(--app-accent)]">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>{item.rating}</span>
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display text-base font-bold text-white leading-snug">
                      {item.name}
                    </h2>
                    <span className="text-[11px] text-white/80">Oleh {item.author}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <p className="text-xs text-[var(--app-text-secondary)] line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                <div className="flex items-center justify-between pt-2.5 border-t border-[var(--app-border)] text-xs text-[var(--app-text-muted)] tabular-metrics">
                  <div className="flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    <span>{item.downloads.toLocaleString()} unduhan</span>
                  </div>

                  <span className="font-semibold text-[var(--app-accent-text)]">
                    {item.elementsPayload.length} elemen
                  </span>
                </div>
              </div>

              <div className="px-4 py-3 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)]">
                <button
                  type="button"
                  onClick={() => handleInstall(item)}
                  className={`btn-press w-full min-h-[44px] rounded-xl font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors ${
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
