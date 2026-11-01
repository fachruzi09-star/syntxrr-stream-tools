import React, { useState } from 'react';
import {
  IntegrationProvider,
  IntegrationProviderId,
} from '../types';
import {
  STATUS_DEFINITIONS,
  FeatureStatus,
} from '../theme/designSystem';
import {
  Share2,
  Check,
  AlertCircle,
  ExternalLink,
  Settings,
  X,
  Radio,
  Lock,
  Search,
  Zap,
  Globe,
  DollarSign,
  Tv,
} from 'lucide-react';

interface IntegrationsViewProps {
  integrations: IntegrationProvider[];
  onUpdateIntegrations: (integrations: IntegrationProvider[]) => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onUpdateIntegrations,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'companion' | 'streaming' | 'donation'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProvider, setEditingProvider] = useState<IntegrationProvider | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredIntegrations = integrations.filter((item) => {
    if (activeTab !== 'all' && item.category !== activeTab) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenConfig = (provider: IntegrationProvider) => {
    setEditingProvider(provider);
    setInputValues({
      username: provider.connectedUser || '',
      key: '',
    });
  };

  const handleToggleConnection = (providerId: IntegrationProviderId) => {
    const updated = integrations.map((item) => {
      if (item.id === providerId) {
        const isCurrentlyConnected = item.status === 'ACTIVE';
        const nextStatus: FeatureStatus = isCurrentlyConnected ? 'NOT_CONNECTED' : 'ACTIVE';
        return {
          ...item,
          status: nextStatus,
          connectedUser: isCurrentlyConnected ? undefined : 'LiveStreamer_ID',
        };
      }
      return item;
    });

    onUpdateIntegrations(updated);
    const item = integrations.find((i) => i.id === providerId);
    setToastMessage(`Status integrasi ${item?.name} diperbarui!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;

    const username = inputValues.username?.trim();
    const updated = integrations.map((item) => {
      if (item.id === editingProvider.id) {
        return {
          ...item,
          status: username ? ('ACTIVE' as FeatureStatus) : ('NOT_CONNECTED' as FeatureStatus),
          connectedUser: username || undefined,
        };
      }
      return item;
    });

    onUpdateIntegrations(updated);
    setEditingProvider(null);
    setToastMessage(`Konfigurasi ${editingProvider.name} tersimpan!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[#1E3A8A] border border-[#38BDF8] text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-sm font-medium animate-bounce">
          <Check className="w-4 h-4 text-[#38BDF8]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1e293b] text-blue-400 border border-blue-500/20">
                Pusat Koneksi Eksternal
              </span>
              <span className="text-xs text-slate-400">
                12 Platform Streaming & Donasi
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Integrasi Platform & Layanan Siaran
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Hubungkan akun streaming dan portal donasi Indonesia (Saweria, Sociabuzz, Trakteer, TikTok LIVE, YouTube, Twitch) untuk sinkronisasi alert dan interaksi penonton.
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
              <span>Sistem Gateway Siap</span>
            </span>
          </div>
        </div>

        {/* Tab & Filter bar */}
        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-[#1e293b]">
          <div className="flex bg-[#080c16] p-1 rounded-xl border border-[#1e293b]">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'all'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua (12)
            </button>
            <button
              onClick={() => setActiveTab('companion')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'companion'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Companion
            </button>
            <button
              onClick={() => setActiveTab('streaming')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'streaming'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Streaming
            </button>
            <button
              onClick={() => setActiveTab('donation')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'donation'
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Donasi
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari platform..."
              className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredIntegrations.map((provider) => {
          const statusConfig = STATUS_DEFINITIONS[provider.status];
          const isConnected = provider.status === 'ACTIVE';

          return (
            <div
              key={provider.id}
              className={`bg-[#0e172a] border rounded-2xl p-5 flex flex-col justify-between transition shadow-lg ${
                isConnected
                  ? 'border-emerald-500/40 shadow-emerald-950/20'
                  : 'border-[#1e293b] hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl p-2 rounded-xl bg-[#080c16] border border-[#1e293b]">
                      {provider.logo}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-white leading-snug">
                        {provider.name}
                      </h3>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-mono">
                        {provider.category}
                      </span>
                    </div>
                  </div>

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

                <p className="text-xs text-slate-300 leading-relaxed mt-2 mb-4">
                  {provider.description}
                </p>

                {provider.connectedUser && (
                  <div className="p-2.5 rounded-xl bg-[#080c16] border border-[#1e293b] text-xs flex items-center justify-between mb-3">
                    <span className="text-slate-400">Akun Terhubung:</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      @{provider.connectedUser}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#1e293b] flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenConfig(provider)}
                  className="px-3 py-2 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <Settings className="w-3.5 h-3.5 text-blue-400" />
                  <span>Konfigurasi</span>
                </button>

                <button
                  onClick={() => handleToggleConnection(provider.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 shadow ${
                    isConnected
                      ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-[#2563EB] hover:bg-blue-600 text-white shadow-blue-600/25'
                  }`}
                >
                  {isConnected ? 'Putuskan' : 'Hubungkan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Konfigurasi Provider */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
              <div className="flex items-center space-x-2">
                <span className="text-xl">{editingProvider.logo}</span>
                <h3 className="text-base font-bold text-white">
                  Konfigurasi {editingProvider.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingProvider(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Pengguna / Channel ID
                </label>
                <input
                  type="text"
                  value={inputValues.username || ''}
                  onChange={(e) => setInputValues({ ...inputValues, username: e.target.value })}
                  placeholder="Misal: username_live atau ID Channel"
                  className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Stream Key / Webhook Secret Token (Opsional)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={inputValues.key || ''}
                    onChange={(e) => setInputValues({ ...inputValues, key: e.target.value })}
                    placeholder="Disimpan lokal di IndexedDB aman..."
                    className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl pl-3 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-900/40 text-xs text-blue-200">
                <span className="font-semibold block mb-0.5">Tata Cara Koneksi:</span>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Untuk menerima notifikasi real-time, masukkan kredensial atau gunakan simulator event pada modul Live Center untuk pengujian langsung tanpa akun publik.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="px-4 py-2 rounded-xl bg-[#1e293b] text-slate-300 text-xs font-semibold hover:bg-[#334155]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold shadow-lg shadow-blue-600/30"
                >
                  Simpan Kredensial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
