import React, { useEffect, useState } from 'react';
import {
  AppSettings,
  IntegrationProvider,
  IntegrationProviderId,
  ModeASessionMode,
  TikTokAccountState,
  TikTokConnectionMethod,
  TikTokConnectorStatus,
} from '../types';
import {
  STATUS_DEFINITIONS,
  FeatureStatus,
} from '../theme/designSystem';
import {
  buildModeAHonestStatus,
  isValidTikTokTargetUsername,
  normalizeTikTokTargetUsername,
  resolveTikTokTargetUsername,
} from '../services/tiktokLiveConnector';
import {
  getTikTokAuthConfiguration,
  isScopeGrantingUsername,
  maskApiKeyPreview,
} from '../services/tiktokAuthService';
import {
  Check,
  Settings,
  X,
  Lock,
  Search,
  Zap,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  LogIn,
  Unlink,
  Radio,
  UserCheck,
  Loader2,
  Trash2,
  AtSign,
} from 'lucide-react';

interface IntegrationsViewProps {
  integrations: IntegrationProvider[];
  onUpdateIntegrations: (integrations: IntegrationProvider[]) => void;
  settings?: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => Promise<boolean> | void;
  tiktokStatus?: TikTokConnectorStatus;
  tiktokAccount?: TikTokAccountState;
  companionRunning?: boolean;
  modeASessionMode?: ModeASessionMode;
  openTikTokSettingsNonce?: number;
  onSaveTikTokTargetUsername?: (username: string) => Promise<void> | void;
  onLoginTikTok?: () => Promise<void> | void;
  onUnlinkTikTok?: () => Promise<void> | void;
  onUpdateTikTokConnectionPrefs?: (prefs: {
    connectionMethod: TikTokConnectionMethod;
    fallbackEnabled: boolean;
    eulerApiKey?: string;
    clearEulerApiKey?: boolean;
    eulerJwtKey?: string;
    clearEulerJwtKey?: boolean;
  }) => Promise<void> | void;
  onConnectTikTok?: (
    username: string,
    eulerApiKey?: string,
    allowEulerFallback?: boolean,
    connectionMethod?: TikTokConnectionMethod,
    eulerJwtKey?: string
  ) => Promise<void> | void;
  onDisconnectTikTok?: () => Promise<void> | void;
}

const DEFAULT_ACCOUNT: TikTokAccountState = {
  isLinked: false,
  connectionMethod: 'direct',
  fallbackEnabled: true,
  accountLinkStatus: 'unlinked',
};

const DEFAULT_STATUS: TikTokConnectorStatus = {
  state: 'disconnected',
  transport: 'none',
  connectionMethod: 'direct',
  roomStatus: 'unknown',
  username: '',
  roomId: '',
  viewerCount: 0,
  totalLikeCount: 0,
  message: 'Belum terhubung ke TikTok LIVE.',
  updatedAt: 0,
};

function toneBadgeClasses(tone: 'ok' | 'warn' | 'error' | 'off'): string {
  switch (tone) {
    case 'ok':
      return 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60';
    case 'warn':
      return 'bg-amber-950/70 text-amber-300 border-amber-700/60';
    case 'error':
      return 'bg-rose-950/70 text-rose-300 border-rose-700/60';
    default:
      return 'bg-slate-900/90 text-slate-300 border-slate-700';
  }
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onUpdateIntegrations,
  settings,
  onUpdateSettings,
  tiktokStatus = DEFAULT_STATUS,
  tiktokAccount = DEFAULT_ACCOUNT,
  companionRunning = false,
  modeASessionMode = 'inactive',
  openTikTokSettingsNonce = 0,
  onSaveTikTokTargetUsername,
  onLoginTikTok,
  onUnlinkTikTok,
  onUpdateTikTokConnectionPrefs,
  onConnectTikTok,
  onDisconnectTikTok,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'companion' | 'streaming' | 'donation'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTikTokSettingsOpen, setIsTikTokSettingsOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<IntegrationProvider | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [eulerApiKeyDraft, setEulerApiKeyDraft] = useState('');
  const [eulerJwtKeyDraft, setEulerJwtKeyDraft] = useState('');
  const [eulerAuthMode, setEulerAuthMode] = useState<'api_key' | 'jwt'>(() =>
    settings?.eulerStreamJwtKey?.trim() ? 'jwt' : 'api_key'
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const savedTargetUsername = resolveTikTokTargetUsername(settings, tiktokAccount);
  const [targetUsernameDraft, setTargetUsernameDraft] = useState(savedTargetUsername);
  const [targetValidationError, setTargetValidationError] = useState<string | null>(null);

  useEffect(() => {
    setTargetUsernameDraft(savedTargetUsername);
    setTargetValidationError(null);
  }, [savedTargetUsername]);

  useEffect(() => {
    if (openTikTokSettingsNonce > 0) {
      setTargetUsernameDraft(savedTargetUsername);
      setTargetValidationError(null);
      setIsTikTokSettingsOpen(true);
    }
  }, [openTikTokSettingsNonce, savedTargetUsername]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const persistTargetUsername = async (normalized: string) => {
    if (onSaveTikTokTargetUsername) {
      await onSaveTikTokTargetUsername(normalized);
    } else if (settings && onUpdateSettings) {
      await onUpdateSettings({ ...settings, tiktokUsername: normalized });
    }
  };

  const handleSaveTargetUsername = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const normalized = normalizeTikTokTargetUsername(targetUsernameDraft);
    if (!isValidTikTokTargetUsername(normalized)) {
      setTargetValidationError(
        'Masukkan username TikTok yang valid (1–64 karakter: huruf, angka, titik, atau garis bawah).'
      );
      return;
    }
    setTargetValidationError(null);
    setTargetUsernameDraft(normalized);
    await persistTargetUsername(normalized);
    showToast(`Target LIVE @${normalized} disimpan.`);
  };

  const handleClearTargetUsername = async () => {
    setTargetValidationError(null);
    setTargetUsernameDraft('');
    await persistTargetUsername('');
    showToast('Target username LIVE TikTok dihapus.');
  };

  const honestStatus = buildModeAHonestStatus({
    account: tiktokAccount,
    connector: tiktokStatus,
    companionRunning,
    sessionMode: modeASessionMode,
  });

  const authConfig = getTikTokAuthConfiguration();
  const savedEulerKeyMask = maskApiKeyPreview(settings?.eulerStreamApiKey);
  const savedEulerJwtMask = maskApiKeyPreview(settings?.eulerStreamJwtKey);
  const hasAnyEulerCredential = Boolean(savedEulerKeyMask || savedEulerJwtMask);

  useEffect(() => {
    if (settings?.eulerStreamJwtKey?.trim() && !settings?.eulerStreamApiKey?.trim()) {
      setEulerAuthMode('jwt');
    } else if (settings?.eulerStreamApiKey?.trim()) {
      setEulerAuthMode('api_key');
    }
  }, [settings?.eulerStreamApiKey, settings?.eulerStreamJwtKey]);

  const isTransportActiveOrBusy =
    tiktokStatus.state === 'connected_direct' ||
    tiktokStatus.state === 'connected_euler' ||
    tiktokStatus.state === 'resolving_room' ||
    tiktokStatus.state === 'connecting_direct' ||
    tiktokStatus.state === 'connecting_euler' ||
    tiktokStatus.state === 'reconnecting';

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
    if (provider.id === 'tiktok') {
      setEulerApiKeyDraft('');
      setEulerJwtKeyDraft('');
      setEulerAuthMode(settings?.eulerStreamJwtKey?.trim() ? 'jwt' : 'api_key');
      setTargetUsernameDraft(savedTargetUsername);
      setTargetValidationError(null);
      setIsTikTokSettingsOpen(true);
      return;
    }
    setEditingProvider(provider);
    setInputValues({
      username: provider.connectedUser || '',
      key: '',
    });
  };

  const handleToggleConnection = (providerId: IntegrationProviderId) => {
    if (providerId === 'tiktok') {
      setEulerApiKeyDraft('');
      setEulerJwtKeyDraft('');
      setEulerAuthMode(settings?.eulerStreamJwtKey?.trim() ? 'jwt' : 'api_key');
      setIsTikTokSettingsOpen(true);
      return;
    }

    const updated = integrations.map((item) => {
      if (item.id === providerId) {
        const isCurrentlyConnected = item.status === 'ACTIVE';
        const nextStatus: FeatureStatus = isCurrentlyConnected ? 'NOT_CONNECTED' : 'ACTIVE';
        return {
          ...item,
          status: nextStatus,
          connectedUser: isCurrentlyConnected ? undefined : item.connectedUser,
        };
      }
      return item;
    });

    onUpdateIntegrations(updated);
    const item = integrations.find((i) => i.id === providerId);
    showToast(`Status integrasi ${item?.name} diperbarui!`);
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
    showToast(`Konfigurasi ${editingProvider.name} tersimpan!`);
  };

  const handleSaveConnectionPrefs = async (next: {
    connectionMethod?: TikTokConnectionMethod;
    fallbackEnabled?: boolean;
    saveCredentialMode?: 'api_key' | 'jwt';
    clearCredentialMode?: 'api_key' | 'jwt' | 'all';
  }) => {
    const method = next.connectionMethod ?? tiktokAccount.connectionMethod;
    const fallback = next.fallbackEnabled ?? tiktokAccount.fallbackEnabled;

    const saveApiKey = next.saveCredentialMode === 'api_key';
    const saveJwtKey = next.saveCredentialMode === 'jwt';
    const clearApiKey = next.clearCredentialMode === 'api_key' || next.clearCredentialMode === 'all' || saveJwtKey;
    const clearJwtKey = next.clearCredentialMode === 'jwt' || next.clearCredentialMode === 'all' || saveApiKey;

    await onUpdateTikTokConnectionPrefs?.({
      connectionMethod: method,
      fallbackEnabled: fallback,
      eulerApiKey: saveApiKey ? eulerApiKeyDraft.trim() : undefined,
      clearEulerApiKey: clearApiKey,
      eulerJwtKey: saveJwtKey ? eulerJwtKeyDraft.trim() : undefined,
      clearEulerJwtKey: clearJwtKey,
    });

    if (saveApiKey) {
      setEulerApiKeyDraft('');
      setEulerJwtKeyDraft('');
      showToast('EulerStream API Key disimpan lokal (JWT sebelumnya otomatis dihapus).');
    } else if (saveJwtKey) {
      setEulerApiKeyDraft('');
      setEulerJwtKeyDraft('');
      showToast('EulerStream JWT Key disimpan lokal (API Key sebelumnya otomatis dihapus).');
    } else if (next.clearCredentialMode) {
      setEulerApiKeyDraft('');
      setEulerJwtKeyDraft('');
      showToast('Kredensial EulerStream dihapus.');
    } else {
      showToast('Preferensi metode koneksi TikTok disimpan.');
    }
  };

  if (isTikTokSettingsOpen) {
    const hasProfileUsername =
      tiktokAccount.isLinked &&
      Boolean(tiktokAccount.username) &&
      (!tiktokAccount.grantedScopes || isScopeGrantingUsername(tiktokAccount.grantedScopes));

    return (
      <div className="space-y-5 pb-20">
        {toastMessage && (
          <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[#1E3A8A] border border-[#38BDF8] text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-sm font-medium">
            <Check className="w-4 h-4 text-[#38BDF8]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Breadcrumb: Koneksi -> TikTok -> Atur */}
        <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsTikTokSettingsOpen(false)}
              className="px-3 py-2 rounded-xl bg-[#080c16] border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span>Kembali ke Koneksi</span>
            </button>
            <div className="text-[11px] font-mono text-slate-400">
              Koneksi <span className="text-slate-600">→</span> TikTok{' '}
              <span className="text-slate-600">→</span>{' '}
              <span className="text-blue-400 font-bold">Atur</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>🎵</span>
                <span>Pengaturan Koneksi TikTok</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Atur target @username LIVE publik yang ingin dipantau dan metode transport Mode A. OAuth opsional.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  savedTargetUsername
                    ? 'bg-blue-950/70 text-blue-300 border-blue-700/60'
                    : 'bg-slate-900/90 text-slate-300 border-slate-700'
                }`}
              >
                {savedTargetUsername ? `Target: @${savedTargetUsername}` : 'Target: Belum diatur'}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${toneBadgeClasses(
                  honestStatus.accountLinked.tone
                )}`}
              >
                OAuth: {honestStatus.accountLinked.label}
              </span>
            </div>
          </div>
        </div>

        {/* Bagian 0: Target Username LIVE TikTok Publik */}
        <section className="bg-[#0e172a] border border-blue-500/35 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <AtSign className="w-4 h-4 text-blue-400" />
                <span>Target Username LIVE TikTok</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Identitas target LIVE publik yang dipantau oleh Mode A (bukan akun terautentikasi). Tidak memerlukan OAuth, password, cookie, atau API key untuk memulai pembacaan room LIVE publik.
              </p>
            </div>
            {savedTargetUsername && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 text-xs font-mono shrink-0 self-start sm:self-auto">
                Dipantau: @{savedTargetUsername}
              </span>
            )}
          </div>

          <form onSubmit={(e) => void handleSaveTargetUsername(e)} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center bg-[#080c16] border border-[#1e293b] focus-within:border-[#2563EB] rounded-xl px-3 py-2">
                <span className="text-xs font-mono text-slate-400 mr-1 select-none">@</span>
                <input
                  type="text"
                  value={targetUsernameDraft}
                  onChange={(e) => {
                    setTargetUsernameDraft(e.target.value);
                    if (targetValidationError) setTargetValidationError(null);
                  }}
                  placeholder="username_live"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Target username LIVE TikTok"
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white text-xs font-bold shrink-0"
              >
                Simpan Target
              </button>

              {savedTargetUsername && (
                <button
                  type="button"
                  onClick={() => void handleClearTargetUsername()}
                  className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>

            {targetValidationError && (
              <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-700/60 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{targetValidationError}</span>
              </div>
            )}

            <div className="text-[11px] text-slate-400">
              {savedTargetUsername ? (
                <span>
                  Target aktif saat ini: <strong className="text-slate-200 font-mono">@{savedTargetUsername}</strong>{' '}
                  (disimpan lokal &amp; dipakai bersama oleh Dashboard dan Integrations).
                </span>
              ) : (
                <span>Belum ada target username LIVE yang disimpan.</span>
              )}
            </div>
          </form>
        </section>

        {/* Bagian 1: Autentikasi & Profil Akun TikTok (Opsional) */}
        <section className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Autentikasi Akun TikTok (OAuth PKCE · Opsional)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Opsional untuk verifikasi identitas profil via Login Kit TikTok. Pembacaan event LIVE publik tidak mewajibkan login OAuth ini.
              </p>
            </div>
          </div>

          {/* Error login terpisah dari error transport */}
          {tiktokAccount.accountLinkStatus === 'failed' && tiktokAccount.linkErrorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-700/60 text-xs text-rose-200 space-y-2">
              <div className="flex items-start gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Autentikasi / Penghubungan Akun Gagal</span>
              </div>
              <p className="leading-relaxed text-rose-100">{tiktokAccount.linkErrorMessage}</p>
            </div>
          )}

          {tiktokAccount.isLinked && tiktokAccount.accountLinkStatus === 'linked' ? (
            <div className="p-4 rounded-xl bg-[#080c16] border border-emerald-700/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {tiktokAccount.avatarUrl ? (
                    <img
                      src={tiktokAccount.avatarUrl}
                      alt={tiktokAccount.displayName || tiktokAccount.username || 'Avatar TikTok'}
                      className="w-11 h-11 rounded-full object-cover border border-emerald-500/40"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-emerald-950/80 border border-emerald-600/50 flex items-center justify-center text-emerald-300">
                      <UserCheck className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-white">
                      {tiktokAccount.displayName ||
                        (tiktokAccount.username ? `@${tiktokAccount.username}` : 'Akun TikTok Terhubung')}
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      {hasProfileUsername
                        ? `@${tiktokAccount.username}`
                        : 'Username belum tersedia (memerlukan scope user.info.profile)'}
                    </div>
                    {tiktokAccount.openId && (
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        OpenID: {tiktokAccount.openId}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void onUnlinkTikTok?.();
                    showToast('Akun TikTok dan kredensial sesi telah diputuskan.');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-700/70 text-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 self-start sm:self-auto"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Putuskan akun</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>
                  Otorisasi terakhir:{' '}
                  <span className="text-slate-200 font-mono">
                    {tiktokAccount.lastSuccessfulAuthorization
                      ? new Date(tiktokAccount.lastSuccessfulAuthorization).toLocaleString('id-ID')
                      : '-'}
                  </span>
                </div>
                <div>
                  Scope disetujui:{' '}
                  <span className="text-slate-200 font-mono">
                    {tiktokAccount.grantedScopes && tiktokAccount.grantedScopes.length > 0
                      ? tiktokAccount.grantedScopes.join(', ')
                      : 'Terverifikasi'}
                  </span>
                </div>
              </div>

              {!hasProfileUsername && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-[11px] text-amber-200">
                  Scope <code>user.info.basic</code> tidak otomatis memberikan <code>username</code>. Pastikan scope{' '}
                  <code>user.info.profile</code> disetujui di aplikasi developer TikTok agar username dapat dipakai untuk resolusi room LIVE.
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white">Akun TikTok belum dihubungkan</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Masuk melalui otorisasi resmi TikTok agar SYNTXRR menerima identitas akun yang terverifikasi. Pengisian username manual tidak digunakan untuk menggantikan login.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={tiktokAccount.accountLinkStatus === 'linking'}
                  onClick={() => void onLoginTikTok?.()}
                  className="px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-blue-600/25"
                >
                  {tiktokAccount.accountLinkStatus === 'linking' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>
                    {tiktokAccount.accountLinkStatus === 'linking'
                      ? 'Menghubungkan...'
                      : 'Login dengan TikTok'}
                  </span>
                </button>
              </div>

              {!authConfig.isWebOAuthReady && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-200 space-y-1.5">
                  <div className="font-bold text-amber-300">Konfigurasi Developer yang Masih Diperlukan:</div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    {authConfig.missingRequirements.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Bagian 2: Pilihan Metode Koneksi LIVE */}
        <section className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">Metode Koneksi LIVE</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pilih jalur transport event LIVE yang digunakan setelah akun terhubung.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Metode A: Langsung ke TikTok */}
            <div
              onClick={() => void handleSaveConnectionPrefs({ connectionMethod: 'direct' })}
              className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                tiktokAccount.connectionMethod === 'direct'
                  ? 'bg-blue-950/35 border-blue-500 ring-1 ring-blue-500'
                  : 'bg-[#080c16] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">A. Langsung ke TikTok (Utama)</span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    tiktokAccount.connectionMethod === 'direct'
                      ? 'border-blue-400 bg-blue-500'
                      : 'border-slate-600'
                  }`}
                >
                  {tiktokAccount.connectionMethod === 'direct' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Menggunakan <code>TikTokRoomResolver</code> dan <code>TikTokWebSocketTransport</code> langsung dari perangkat Android. API Key maupun JWT EulerStream bersifat opsional.
              </p>
              <label
                onClick={(e) => e.stopPropagation()}
                className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-300 cursor-pointer"
              >
                <span>Fallback ke EulerStream jika koneksi langsung ditolak</span>
                <input
                  type="checkbox"
                  checked={tiktokAccount.fallbackEnabled}
                  onChange={(e) =>
                    void handleSaveConnectionPrefs({ fallbackEnabled: e.target.checked })
                  }
                  className="rounded text-[#2563EB] focus:ring-0"
                />
              </label>
            </div>

            {/* Metode B: EulerStream */}
            <div
              onClick={() => void handleSaveConnectionPrefs({ connectionMethod: 'euler' })}
              className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                tiktokAccount.connectionMethod === 'euler'
                  ? 'bg-blue-950/35 border-blue-500 ring-1 ring-blue-500'
                  : 'bg-[#080c16] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">B. EulerStream</span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    tiktokAccount.connectionMethod === 'euler'
                      ? 'border-blue-400 bg-blue-500'
                      : 'border-slate-600'
                  }`}
                >
                  {tiktokAccount.connectionMethod === 'euler' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Menggunakan <code>EulerStreamTransport</code> secara langsung setelah resolusi room. Memakai tepat satu kredensial EulerStream (API Key atau JWT Key).
              </p>
            </div>
          </div>

          {/* Kredensial EulerStream Eksklusif: API Key atau JWT (Masked & Aman) */}
          <div className="p-4 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    Kredensial EulerStream{' '}
                    {tiktokAccount.connectionMethod === 'direct' ? '(Opsional untuk Fallback)' : '(Untuk Metode EulerStream)'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Pilih salah satu metode autentikasi: API Key atau JWT Key (tidak keduanya). Disimpan lokal, dimask, dan tidak masuk ekspor/cadangan.
                </div>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 self-start sm:self-auto">
                {savedEulerKeyMask
                  ? `API Key tersimpan (${savedEulerKeyMask})`
                  : savedEulerJwtMask
                  ? `JWT Key tersimpan (${savedEulerJwtMask})`
                  : 'Belum diisi'}
              </span>
            </div>

            {/* Selector Eksklusif API Key vs JWT */}
            <div className="inline-flex rounded-xl bg-[#0e172a] border border-slate-800 p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setEulerAuthMode('api_key');
                  setEulerJwtKeyDraft('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  eulerAuthMode === 'api_key'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                API Key
              </button>
              <button
                type="button"
                onClick={() => {
                  setEulerAuthMode('jwt');
                  setEulerApiKeyDraft('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  eulerAuthMode === 'jwt'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                JWT Key
              </button>
            </div>

            {eulerAuthMode === 'api_key' ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={eulerApiKeyDraft}
                  onChange={(e) => setEulerApiKeyDraft(e.target.value)}
                  autoComplete="off"
                  placeholder={
                    savedEulerKeyMask
                      ? 'Masukkan API Key baru untuk mengganti...'
                      : 'Masukkan EulerStream API Key Anda...'
                  }
                  className="flex-1 bg-[#0e172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  type="button"
                  disabled={!eulerApiKeyDraft.trim()}
                  onClick={() => void handleSaveConnectionPrefs({ saveCredentialMode: 'api_key' })}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold"
                >
                  Simpan API Key
                </button>
                {hasAnyEulerCredential && (
                  <button
                    type="button"
                    onClick={() => void handleSaveConnectionPrefs({ clearCredentialMode: 'all' })}
                    className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={eulerJwtKeyDraft}
                  onChange={(e) => setEulerJwtKeyDraft(e.target.value)}
                  autoComplete="off"
                  placeholder={
                    savedEulerJwtMask
                      ? 'Masukkan JWT Key baru untuk mengganti...'
                      : 'Masukkan EulerStream JWT Key Anda...'
                  }
                  className="flex-1 bg-[#0e172a] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  type="button"
                  disabled={!eulerJwtKeyDraft.trim()}
                  onClick={() => void handleSaveConnectionPrefs({ saveCredentialMode: 'jwt' })}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold"
                >
                  Simpan JWT
                </button>
                {hasAnyEulerCredential && (
                  <button
                    type="button"
                    onClick={() => void handleSaveConnectionPrefs({ clearCredentialMode: 'all' })}
                    className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Bagian 3: Status 4-Lapis yang Jujur & Kontrol Transport LIVE */}
        <section className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400" />
                <span>Status Sesi & Transport LIVE (Terpisah dari Account Linked)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Memutus transport LIVE hanya menghentikan koneksi siaran dan tidak memutus tautan akun TikTok Anda.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">1. Account Linked</div>
              <div className="font-bold text-white mt-1">{honestStatus.accountLinked.label}</div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">{honestStatus.accountLinked.detail}</div>
            </div>
            <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">2. Mode A Session</div>
              <div className="font-bold text-white mt-1">{honestStatus.modeASession.label}</div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">{honestStatus.modeASession.detail}</div>
            </div>
            <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">3. Room Status</div>
              <div className="font-bold text-white mt-1">{honestStatus.roomStatus.label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Metode: {tiktokAccount.connectionMethod === 'euler' ? 'EulerStream' : 'Direct TikTok'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">4. Event Transport</div>
              <div className="font-bold text-white mt-1">{honestStatus.eventTransport.label}</div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">{honestStatus.eventTransport.detail}</div>
            </div>
          </div>

          {tiktokStatus.state === 'error' && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-xs text-rose-200">
              <span className="font-bold">Kesalahan Transport LIVE: </span>
              <span>{tiktokStatus.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <div className="text-[11px] text-slate-400">
              Target koneksi:{' '}
              <span className="font-mono text-slate-200">
                {savedTargetUsername ? `@${savedTargetUsername}` : 'Belum diatur'}
              </span>
            </div>

            {isTransportActiveOrBusy || tiktokStatus.state === 'waiting_for_live' ? (
              <button
                type="button"
                onClick={() => {
                  void onDisconnectTikTok?.();
                  showToast('Transport LIVE diputuskan (target & akun tetap tersimpan).');
                }}
                className="px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/60 text-rose-200 text-xs font-bold"
              >
                Putuskan Transport LIVE
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const candidate = normalizeTikTokTargetUsername(targetUsernameDraft) || savedTargetUsername;
                  if (!isValidTikTokTargetUsername(candidate)) {
                    setTargetValidationError(
                      'Masukkan target @username TikTok yang valid terlebih dahulu sebelum menyambungkan.'
                    );
                    return;
                  }
                  setTargetValidationError(null);
                  if (candidate !== savedTargetUsername) {
                    setTargetUsernameDraft(candidate);
                    await persistTargetUsername(candidate);
                  }
                  await onConnectTikTok?.(
                    candidate,
                    settings?.eulerStreamApiKey,
                    tiktokAccount.fallbackEnabled,
                    tiktokAccount.connectionMethod,
                    settings?.eulerStreamJwtKey
                  );
                  showToast(`Memulai koneksi transport LIVE @${candidate}...`);
                }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white text-xs font-bold"
              >
                {savedTargetUsername || isValidTikTokTargetUsername(targetUsernameDraft)
                  ? 'Sambungkan Transport LIVE'
                  : 'Isi Target @username Dahulu'}
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

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
                {integrations.length} Platform Streaming & Donasi
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Integrasi Platform & Layanan Siaran
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Hubungkan akun TikTok secara sah untuk Mode A dan layanan portal donasi atau platform lain untuk sinkronisasi alert dan interaksi penonton.
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
              Semua ({integrations.length})
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
          const isTikTok = provider.id === 'tiktok';

          if (isTikTok) {
            return (
              <div
                key={provider.id}
                className={`bg-[#0e172a] border rounded-2xl p-5 flex flex-col justify-between transition shadow-lg ${
                  tiktokAccount.isLinked
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
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${toneBadgeClasses(
                        honestStatus.accountLinked.tone
                      )}`}
                    >
                      Akun: {honestStatus.accountLinked.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mt-2 mb-4">
                    {provider.description}
                  </p>

                  <div className="p-2.5 rounded-xl bg-[#080c16] border border-[#1e293b] text-[11px] space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Target LIVE:</span>
                      <span className="font-mono text-slate-200 truncate max-w-[150px]">
                        {savedTargetUsername ? `@${savedTargetUsername}` : 'Belum diatur'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>OAuth (Opsional):</span>
                      <span className="font-mono text-slate-200 truncate max-w-[150px]">
                        {tiktokAccount.isLinked ? honestStatus.accountLinked.detail : 'Belum ditautkan'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Metode Koneksi:</span>
                      <span className="font-mono text-slate-200">
                        {tiktokAccount.connectionMethod === 'euler' ? 'EulerStream' : 'Langsung ke TikTok'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Room Status:</span>
                      <span className="font-mono text-slate-200">{honestStatus.roomStatus.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Event Transport:</span>
                      <span className="font-mono text-slate-200">{honestStatus.eventTransport.label}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1e293b] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenConfig(provider)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow shadow-blue-600/25"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Atur</span>
                  </button>
                </div>
              </div>
            );
          }

          const effectiveStatus: FeatureStatus = provider.status;
          const statusConfig = STATUS_DEFINITIONS[effectiveStatus];
          const isConnected = effectiveStatus === 'ACTIVE';

          return (
            <div
              key={provider.id}
              className={`bg-[#0e172a] border rounded-2xl p-5 flex flex-col justify-between transition shadow-lg ${
                effectiveStatus === 'ACTIVE'
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
                    <span
                      className={`font-semibold font-mono ${
                        effectiveStatus === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-200'
                      }`}
                    >
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

      {/* Modal: Konfigurasi Provider Non-TikTok */}
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
