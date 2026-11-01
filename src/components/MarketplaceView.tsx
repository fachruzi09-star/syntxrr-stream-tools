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
  ArrowRight,
  Eye,
  Sliders,
  ExternalLink,
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
  const [activeCategory, setActiveCategory] = useState<'all' | MarketplaceCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
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
    setToastMessage(`"${item.name}" berhasil dipasang ke Studio!`);
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

      {/* Top Banner */}
      <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1e293b] text-blue-400 border border-blue-500/20 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Katalog Widget & Scene Siap Pakai</span>
              </span>
              <span className="text-xs text-slate-400">
                {items.length} Aset Desain Terkurasi
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Marketplace Widget & Template Siaran
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Unduh dan gunakan paket overlay, alert widget, goal counter, dan layout scene siap pakai yang dirancang khusus untuk mobile streaming studio.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onNavigateToStudio}
              className="px-4 py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-white font-medium text-xs flex items-center space-x-2 transition"
            >
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Buka Studio Canvas</span>
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3 pt-4 border-t border-[#1e293b]">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'Semua Kategori' },
                { id: 'song_request', label: 'Now Playing' },
                { id: 'chat_message', label: 'Kotak Chat' },
                { id: 'counter', label: 'Progress Goal' },
                { id: 'alert', label: 'Alert Pop-up' },
                { id: 'overlay', label: 'Overlay Lengkap' },
              ] as const
            ).map((filt) => (
              <button
                key={filt.id}
                onClick={() => setActiveFilter(filt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  activeFilter === filt.id
                    ? 'bg-[#2563EB] text-white shadow'
                    : 'bg-[#080c16] text-slate-400 hover:text-white border border-[#1e293b]'
                }`}
              >
                {filt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari widget, scene, kreator..."
              className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      </div>

      {/* Grid of Marketplace Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.map((item) => {
          const isInstalled = installedIds.has(item.id) || item.isInstalled;

          return (
            <div
              key={item.id}
              className="bg-[#0e172a] border border-[#1e293b] rounded-2xl overflow-hidden hover:border-slate-600 transition flex flex-col justify-between group shadow-lg"
            >
              {/* Card Thumbnail Gradient */}
              <div
                className={`h-36 bg-gradient-to-br ${item.previewGradient} relative p-4 flex flex-col justify-between`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-black/40 backdrop-blur-md text-white border border-white/10">
                    {item.category.toUpperCase()}
                  </span>
                  <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-black/40 backdrop-blur-md text-amber-300 text-xs font-bold border border-white/10">
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    <span>{item.rating}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white drop-shadow-md">
                    {item.name}
                  </h3>
                  <span className="text-[11px] text-blue-200">
                    Oleh {item.author}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed mb-4">
                  {item.description}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-[#1e293b] text-xs text-slate-400">
                  <div className="flex items-center space-x-1">
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>{item.downloads.toLocaleString()} unduhan</span>
                  </div>

                  <span className="text-[11px] font-mono text-blue-400">
                    {item.elementsPayload.length} elemen
                  </span>
                </div>
              </div>

              {/* Card Action Footer */}
              <div className="p-4 bg-[#080c16]/50 border-t border-[#1e293b]">
                <button
                  onClick={() => handleInstall(item)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition active:scale-95 shadow ${
                    isInstalled
                      ? 'bg-[#1e293b] hover:bg-[#2563EB] text-slate-200 hover:text-white border border-[#334155]'
                      : 'bg-[#2563EB] hover:bg-blue-600 text-white shadow-blue-600/25'
                  }`}
                >
                  {isInstalled ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
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
          <div className="col-span-3 text-center py-16 bg-[#0e172a] border border-[#1e293b] rounded-2xl text-slate-400">
            <ShoppingBag className="w-10 h-10 text-slate-500 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">Tidak ada widget yang cocok</p>
            <p className="text-xs text-slate-500 mt-1">Coba gunakan filter pencarian lainnya.</p>
          </div>
        )}
      </div>
    </div>
  );
};
