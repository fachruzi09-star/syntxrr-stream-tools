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
import { STATUS_DEFINITIONS, FeatureStatus } from '../theme/designSystem';
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

function toneBadgeStyle(tone: 'ok' | 'warn' | 'error' | 'off'): React.CSSProperties {
  switch (tone) {
    case 'ok':
      return {
        color: 'var(--app-ok)',
        backgroundColor: 'var(--app-ok-soft)',
        borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
      };
    case 'warn':
      return {
        color: 'var(--app-warn)',
        backgroundColor: 'var(--app-warn-soft)',
        borderColor: 'color-mix(in srgb, var(--app-warn) 42%, transparent)',
      };
    case 'error':
      return {
        color: 'var(--app-error)',
        backgroundColor: 'var(--app-error-soft)',
        borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
      };
    default:
      return {
        color: 'var(--app-text-secondary)',
        backgroundColor: 'var(--app-surface-muted)',
        borderColor: 'var(--app-border)',
      };
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
    window.setTimeout(() => setToastMessage(null), 3200);
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
    showToast(`Status integrasi ${item?.name} diperbarui.`);
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
    showToast(`Konfigurasi ${editingProvider.name} tersimpan.`);
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
    const clearApiKey =
      next.clearCredentialMode === 'api_key' || next.clearCredentialMode === 'all' || saveJwtKey;
    const clearJwtKey =
      next.clearCredentialMode === 'jwt' || next.clearCredentialMode === 'all' || saveApiKey;

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
      <div className="space-y-5 pb-6">
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] text-[var(--app-text)] px-4 py-2.5 rounded-xl shadow-[var(--app-shadow)] flex items-center gap-2 text-xs sm:text-sm font-medium max-w-[92vw]"
          >
            <Check className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Inspector Header */}
        <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => setIsTikTokSettingsOpen(false)}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
              <span>Kembali ke Koneksi</span>
            </button>
            <div className="text-[11px] font-mono-num text-[var(--app-text-muted)]">
              Koneksi <span className="text-[var(--app-border-strong)]">/</span> TikTok{' '}
              <span className="text-[var(--app-border-strong)]">/</span>{' '}
              <span className="text-[var(--app-accent-text)] font-bold">Inspector</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] flex items-center gap-2">
                <span>🎵</span>
                <span>Pengaturan Koneksi TikTok</span>
              </h1>
              <p className="text-xs text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
                Atur target @username LIVE publik yang dipantau dan metode transport Mode A. OAuth opsional.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold border font-mono-num ${
                  savedTargetUsername
                    ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] border-[var(--app-accent-border)]'
                    : 'bg-[var(--app-surface-muted)] text-[var(--app-text-muted)] border-[var(--app-border)]'
                }`}
              >
                {savedTargetUsername ? `Target: @${savedTargetUsername}` : 'Target: Belum diatur'}
              </span>
              <span
                className="px-3 py-1 rounded-lg text-xs font-bold border"
                style={toneBadgeStyle(honestStatus.accountLinked.tone)}
              >
                OAuth: {honestStatus.accountLinked.label}
              </span>
            </div>
          </div>
        </header>

        {/* Block 0: Target Username LIVE TikTok Publik */}
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-accent-border)] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)] flex items-center gap-2">
                <AtSign className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                <span>Target Username LIVE TikTok</span>
              </h2>
              <p className="text-xs text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
                Identitas target LIVE publik yang dipantau Mode A (bukan akun terautentikasi). Tidak mewajibkan OAuth atau API key untuk pembacaan room publik.
              </p>
            </div>
            {savedTargetUsername && (
              <span
                className="px-2.5 py-1 rounded-lg border text-xs font-mono-num shrink-0 self-start sm:self-auto"
                style={toneBadgeStyle('ok')}
              >
                Dipantau: @{savedTargetUsername}
              </span>
            )}
          </div>

          <form onSubmit={(e) => void handleSaveTargetUsername(e)} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-h-[44px] flex items-center bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus-within:border-[var(--app-accent)] rounded-xl px-3.5">
                <span className="text-xs font-mono-num text-[var(--app-accent-text)] mr-1.5 select-none">
                  @
                </span>
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
                  className="flex-1 bg-transparent text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none font-mono-num"
                />
              </div>

              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold shrink-0 transition-colors"
              >
                Simpan Target
              </button>

              {savedTargetUsername && (
                <button
                  type="button"
                  onClick={() => void handleClearTargetUsername()}
                  className="min-h-[44px] px-3.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>

            {targetValidationError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/60 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{targetValidationError}</span>
              </div>
            )}

            <div className="text-[11px] text-[var(--app-text-muted)]">
              {savedTargetUsername ? (
                <span>
                  Target aktif:{' '}
                  <strong className="text-[var(--app-text)] font-mono-num">
                    @{savedTargetUsername}
                  </strong>{' '}
                  (tersimpan lokal &amp; tersinkron dengan Dashboard).
                </span>
              ) : (
                <span>Belum ada target username LIVE yang disimpan.</span>
              )}
            </div>
          </form>
        </section>

        {/* Block 1: Autentikasi Akun TikTok (OAuth PKCE · Opsional) */}
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
              <span>Autentikasi Akun TikTok (OAuth PKCE · Opsional)</span>
            </h2>
            <p className="text-xs text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
              Opsional untuk verifikasi profil melalui Login Kit TikTok. Pembacaan room LIVE publik tidak mewajibkan login OAuth ini.
            </p>
          </div>

          {tiktokAccount.accountLinkStatus === 'failed' && tiktokAccount.linkErrorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-700/60 text-xs text-rose-200 space-y-1.5">
              <div className="flex items-start gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Autentikasi / Penghubungan Akun Gagal</span>
              </div>
              <p className="leading-relaxed text-rose-100">{tiktokAccount.linkErrorMessage}</p>
            </div>
          )}

          {tiktokAccount.isLinked && tiktokAccount.accountLinkStatus === 'linked' ? (
            <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-emerald-700/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {tiktokAccount.avatarUrl ? (
                    <img
                      src={tiktokAccount.avatarUrl}
                      alt={tiktokAccount.displayName || tiktokAccount.username || 'Avatar TikTok'}
                      className="w-11 h-11 rounded-full object-cover border border-emerald-500/40 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-emerald-950/70 border border-emerald-600/50 flex items-center justify-center text-emerald-300 shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--app-text)] truncate">
                      {tiktokAccount.displayName ||
                        (tiktokAccount.username ? `@${tiktokAccount.username}` : 'Akun TikTok Terhubung')}
                    </div>
                    <div className="text-xs text-[var(--app-text-secondary)] font-mono-num truncate">
                      {hasProfileUsername
                        ? `@${tiktokAccount.username}`
                        : 'Username belum tersedia (memerlukan scope user.info.profile)'}
                    </div>
                    {tiktokAccount.openId && (
                      <div className="text-[10px] text-[var(--app-text-muted)] font-mono-num mt-0.5 truncate">
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
                  className="min-h-[44px] px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/70 text-rose-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Putuskan Akun</span>
                </button>
              </div>

              <div className="pt-2.5 border-t border-[var(--app-border)] grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--app-text-muted)]">
                <div>
                  Otorisasi terakhir:{' '}
                  <span className="text-[var(--app-text-secondary)] font-mono-num">
                    {tiktokAccount.lastSuccessfulAuthorization
                      ? new Date(tiktokAccount.lastSuccessfulAuthorization).toLocaleString('id-ID')
                      : '—'}
                  </span>
                </div>
                <div>
                  Scope disetujui:{' '}
                  <span className="text-[var(--app-text-secondary)] font-mono-num">
                    {tiktokAccount.grantedScopes && tiktokAccount.grantedScopes.length > 0
                      ? tiktokAccount.grantedScopes.join(', ')
                      : 'Terverifikasi'}
                  </span>
                </div>
              </div>

              {!hasProfileUsername && (
                <div className="p-2.5 rounded-lg bg-amber-950/35 border border-amber-700/50 text-[11px] text-amber-200 leading-relaxed">
                  Scope <code>user.info.basic</code> tidak otomatis memberikan <code>username</code>. Pastikan scope <code>user.info.profile</code> disetujui di aplikasi developer TikTok.
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[var(--app-text)]">
                    Akun TikTok belum dihubungkan
                  </div>
                  <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed">
                    Masuk melalui otorisasi resmi TikTok bila Anda memerlukan verifikasi identitas akun resmi.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={tiktokAccount.accountLinkStatus === 'linking'}
                  onClick={() => void onLoginTikTok?.()}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-60 text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
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
                <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-700/45 text-[11px] text-amber-200 space-y-1.5">
                  <div className="font-bold text-amber-300">
                    Konfigurasi Developer yang Masih Diperlukan:
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-[var(--app-text-secondary)]">
                    {authConfig.missingRequirements.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Block 2: Pilihan Metode Koneksi LIVE */}
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)]">
              Metode Koneksi LIVE
            </h2>
            <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
              Pilih jalur transport event LIVE yang digunakan setelah target diatur.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Metode A */}
            <div
              className={`rounded-xl border p-4 space-y-3 transition-colors ${
                tiktokAccount.connectionMethod === 'direct'
                  ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                  : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
              }`}
            >
              <button
                type="button"
                aria-pressed={tiktokAccount.connectionMethod === 'direct'}
                onClick={() => void handleSaveConnectionPrefs({ connectionMethod: 'direct' })}
                className="w-full min-h-[44px] text-left space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] rounded-lg"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--app-text)]">
                    A. Langsung ke TikTok (Utama)
                  </span>
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      tiktokAccount.connectionMethod === 'direct'
                        ? 'border-[var(--app-accent)] bg-[var(--app-accent)]'
                        : 'border-[var(--app-border-strong)]'
                    }`}
                  >
                    {tiktokAccount.connectionMethod === 'direct' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent-ink)]" />
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--app-text-secondary)] leading-relaxed">
                  Menggunakan <code>TikTokRoomResolver</code> dan{' '}
                  <code>TikTokWebSocketTransport</code> langsung dari perangkat. Kredensial EulerStream bersifat opsional.
                </p>
              </button>

              <label className="pt-2.5 border-t border-[var(--app-border)] min-h-[44px] flex items-center justify-between gap-3 text-[11px] text-[var(--app-text-secondary)] cursor-pointer">
                <span>Fallback ke EulerStream jika koneksi langsung ditolak</span>
                <input
                  type="checkbox"
                  checked={tiktokAccount.fallbackEnabled}
                  onChange={(e) =>
                    void handleSaveConnectionPrefs({ fallbackEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-[var(--app-accent)] shrink-0"
                />
              </label>
            </div>

            {/* Metode B */}
            <button
              type="button"
              aria-pressed={tiktokAccount.connectionMethod === 'euler'}
              onClick={() => void handleSaveConnectionPrefs({ connectionMethod: 'euler' })}
              className={`rounded-xl border p-4 text-left flex flex-col justify-start space-y-2 transition-colors min-h-[120px] ${
                tiktokAccount.connectionMethod === 'euler'
                  ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                  : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
              }`}
            >
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--app-text)]">B. EulerStream</span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    tiktokAccount.connectionMethod === 'euler'
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent)]'
                      : 'border-[var(--app-border-strong)]'
                  }`}
                >
                  {tiktokAccount.connectionMethod === 'euler' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent-ink)]" />
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[var(--app-text-secondary)] leading-relaxed">
                Menggunakan <code>EulerStreamTransport</code> secara langsung setelah resolusi room. Memakai tepat satu kredensial EulerStream (API Key atau JWT Key).
              </p>
            </button>
          </div>

          {/* Kredensial EulerStream Eksklusif */}
          <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
                  <span>
                    Kredensial EulerStream{' '}
                    {tiktokAccount.connectionMethod === 'direct'
                      ? '(Opsional untuk Fallback)'
                      : '(Untuk Metode EulerStream)'}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                  Pilih salah satu metode autentikasi: API Key atau JWT Key. Disimpan lokal, dimask, dan tidak masuk ekspor.
                </div>
              </div>
              <span className="text-[11px] font-mono-num px-2.5 py-1 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] self-start sm:self-auto shrink-0">
                {savedEulerKeyMask
                  ? `API Key tersimpan (${savedEulerKeyMask})`
                  : savedEulerJwtMask
                  ? `JWT Key tersimpan (${savedEulerJwtMask})`
                  : 'Belum diisi'}
              </span>
            </div>

            <div className="inline-flex rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setEulerAuthMode('api_key');
                  setEulerJwtKeyDraft('');
                }}
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
                  eulerAuthMode === 'api_key'
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
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
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
                  eulerAuthMode === 'jwt'
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
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
                  className="flex-1 min-h-[44px] bg-[var(--app-surface)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!eulerApiKeyDraft.trim()}
                  onClick={() => void handleSaveConnectionPrefs({ saveCredentialMode: 'api_key' })}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-50 text-[var(--app-accent-ink)] text-xs font-bold transition-colors"
                >
                  Simpan API Key
                </button>
                {hasAnyEulerCredential && (
                  <button
                    type="button"
                    onClick={() => void handleSaveConnectionPrefs({ clearCredentialMode: 'all' })}
                    className="min-h-[44px] px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
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
                  className="flex-1 min-h-[44px] bg-[var(--app-surface)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!eulerJwtKeyDraft.trim()}
                  onClick={() => void handleSaveConnectionPrefs({ saveCredentialMode: 'jwt' })}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-50 text-[var(--app-accent-ink)] text-xs font-bold transition-colors"
                >
                  Simpan JWT
                </button>
                {hasAnyEulerCredential && (
                  <button
                    type="button"
                    onClick={() => void handleSaveConnectionPrefs({ clearCredentialMode: 'all' })}
                    className="min-h-[44px] px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Block 3: Status 4-Lapis yang Jujur & Kontrol Transport LIVE */}
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)] flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
              <span>Status Sesi &amp; Transport LIVE (4-Layer Telemetry)</span>
            </h2>
            <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
              Memutus transport LIVE hanya menghentikan koneksi siaran dan tidak memutus tautan akun TikTok Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                1. Account Linked
              </div>
              <div className="font-bold text-[var(--app-text)] mt-1">
                {honestStatus.accountLinked.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                {honestStatus.accountLinked.detail}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                2. Mode A Session
              </div>
              <div className="font-bold text-[var(--app-text)] mt-1">
                {honestStatus.modeASession.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                {honestStatus.modeASession.detail}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                3. Room Status
              </div>
              <div className="font-bold text-[var(--app-text)] mt-1">
                {honestStatus.roomStatus.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                Metode: {tiktokAccount.connectionMethod === 'euler' ? 'EulerStream' : 'Direct TikTok'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                4. Event Transport
              </div>
              <div className="font-bold text-[var(--app-text)] mt-1">
                {honestStatus.eventTransport.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                {honestStatus.eventTransport.detail}
              </div>
            </div>
          </div>

          {tiktokStatus.state === 'error' && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/50 text-xs text-rose-200">
              <span className="font-bold">Kesalahan Transport LIVE: </span>
              <span>{tiktokStatus.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--app-border)]">
            <div className="text-xs text-[var(--app-text-muted)]">
              Target koneksi:{' '}
              <span className="font-mono-num text-[var(--app-text)] font-semibold">
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
                className="min-h-[44px] px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/60 text-rose-200 text-xs font-bold transition-colors"
              >
                Putuskan Transport LIVE
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const candidate =
                    normalizeTikTokTargetUsername(targetUsernameDraft) || savedTargetUsername;
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
                className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold transition-colors"
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
    <div className="space-y-5 pb-6">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] text-[var(--app-text)] px-4 py-2.5 rounded-xl shadow-[var(--app-shadow)] flex items-center gap-2 text-xs sm:text-sm font-medium max-w-[92vw]"
        >
          <Check className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Registry Header & Filter Controls */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--app-text-muted)]">
              <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)]">
                D+ Gateway Registry
              </span>
              <span aria-hidden="true" className="text-[var(--app-border-strong)]">
                /
              </span>
              <span className="font-mono-num">{integrations.length} Konektor Eksternal</span>
            </div>
            <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight mt-0.5">
              Integrasi Platform &amp; Layanan Siaran
            </h1>
            <p className="text-xs sm:text-sm text-[var(--app-text-muted)] mt-1 max-w-2xl leading-relaxed">
              Kelola konektor resmi TikTok Mode A dan layanan portal donasi atau streaming untuk sinkronisasi alert real-time.
            </p>
          </div>

          <span
            className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 self-start md:self-auto shrink-0"
            style={{
              backgroundColor: 'var(--app-ok-soft)',
              borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
              color: 'var(--app-ok)',
            }}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Gateway Registry Siap</span>
          </span>
        </div>

        {/* Category Filter Tabs + Search Input */}
        <div className="pt-3 border-t border-[var(--app-border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                { id: 'all', label: `Semua (${integrations.length})` },
                { id: 'companion', label: 'Companion' },
                { id: 'streaming', label: 'Streaming' },
                { id: 'donation', label: 'Donasi' },
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
              placeholder="Cari platform..."
              aria-label="Cari platform integrasi"
              className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-10 pr-3 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* Integrations Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map((provider) => {
          const isTikTok = provider.id === 'tiktok';

          if (isTikTok) {
            return (
              <div
                key={provider.id}
                className={`md:col-span-2 lg:col-span-1 rounded-2xl bg-[var(--app-surface)] border p-5 flex flex-col justify-between transition-colors ${
                  tiktokAccount.isLinked
                    ? 'border-emerald-600/45'
                    : 'border-[var(--app-accent-border)]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl w-11 h-11 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                        {provider.logo}
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display text-base font-bold text-[var(--app-text)] leading-snug truncate">
                          {provider.name}
                        </h2>
                        <span className="text-[10px] text-[var(--app-accent-text)] uppercase tracking-[0.1em] font-semibold">
                          {provider.category}
                        </span>
                      </div>
                    </div>

                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0"
                      style={toneBadgeStyle(honestStatus.accountLinked.tone)}
                    >
                      {honestStatus.accountLinked.label}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed mb-4">
                    {provider.description}
                  </p>

                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-1.5 mb-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--app-text-muted)]">Target LIVE</span>
                      <span className="font-mono-num text-[var(--app-text)] truncate max-w-[160px]">
                        {savedTargetUsername ? `@${savedTargetUsername}` : 'Belum diatur'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--app-text-muted)]">OAuth</span>
                      <span className="font-mono-num text-[var(--app-text-secondary)] truncate max-w-[160px]">
                        {tiktokAccount.isLinked ? honestStatus.accountLinked.detail : 'Opsional'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--app-text-muted)]">Metode</span>
                      <span className="font-mono-num text-[var(--app-text-secondary)]">
                        {tiktokAccount.connectionMethod === 'euler'
                          ? 'EulerStream'
                          : 'Direct TikTok'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--app-text-muted)]">Transport</span>
                      <span className="font-mono-num text-[var(--app-text-secondary)]">
                        {honestStatus.eventTransport.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--app-border)]">
                  <button
                    type="button"
                    onClick={() => handleOpenConfig(provider)}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span>Buka Inspector TikTok</span>
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
              className={`rounded-2xl bg-[var(--app-surface)] border p-5 flex flex-col justify-between transition-colors ${
                effectiveStatus === 'ACTIVE'
                  ? 'border-emerald-600/45'
                  : 'border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl w-11 h-11 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                      {provider.logo}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-bold text-[var(--app-text)] leading-snug truncate">
                        {provider.name}
                      </h2>
                      <span className="text-[10px] text-[var(--app-text-muted)] uppercase tracking-[0.1em] font-semibold">
                        {provider.category}
                      </span>
                    </div>
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

                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed mb-4">
                  {provider.description}
                </p>

                {provider.connectedUser && (
                  <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs flex items-center justify-between gap-2 mb-4">
                    <span className="text-[var(--app-text-muted)]">Akun:</span>
                    <span
                      className={`font-semibold font-mono-num truncate ${
                        effectiveStatus === 'ACTIVE'
                          ? 'text-[var(--app-ok)]'
                          : 'text-[var(--app-text-secondary)]'
                      }`}
                    >
                      @{provider.connectedUser}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--app-border)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenConfig(provider)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
                  <span>Konfigurasi</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleConnection(provider.id)}
                  className={`min-h-[44px] px-4 rounded-xl text-xs font-bold transition-colors ${
                    isConnected
                      ? 'bg-rose-950/50 hover:bg-rose-900/70 text-rose-200 border border-rose-700/60'
                      : 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
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
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-[var(--app-shadow)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{editingProvider.logo}</span>
                <h3 className="font-display text-base font-bold text-[var(--app-text)]">
                  Konfigurasi {editingProvider.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingProvider(null)}
                aria-label="Tutup konfigurasi"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Nama Pengguna / Channel ID
                </label>
                <input
                  type="text"
                  value={inputValues.username || ''}
                  onChange={(e) => setInputValues({ ...inputValues, username: e.target.value })}
                  placeholder="Misal: username_live atau ID Channel"
                  className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">
                  Stream Key / Webhook Secret Token (Opsional)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={inputValues.key || ''}
                    onChange={(e) => setInputValues({ ...inputValues, key: e.target.value })}
                    placeholder="Disimpan lokal di IndexedDB..."
                    className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-3.5 pr-10 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                  />
                  <Lock className="w-4 h-4 text-[var(--app-text-muted)] absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)]">
                <span className="font-semibold text-[var(--app-accent-text)] block mb-0.5">
                  Tata Cara Koneksi:
                </span>
                <p className="text-[11px] leading-relaxed">
                  Masukkan kredensial layanan untuk sinkronisasi lokal, atau uji alur event langsung melalui Live Center.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold transition-colors"
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
