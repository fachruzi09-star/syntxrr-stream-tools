import React, { useEffect, useState } from 'react';
import {
  AppSettings,
  IntegrationProvider,
  IntegrationProviderId,
  ModeASessionMode,
  TikTokAccountState,
  TikTokConnectionDiagnostics,
  TikTokConnectionMethod,
  TikTokConnectorStatus,
  TikTokDiagnosticStage,
} from '../types';
import { STATUS_DEFINITIONS, FeatureStatus } from '../theme/designSystem';
import {
  buildModeAHonestStatus,
  isValidTikTokTargetUsername,
  normalizeTikTokTargetUsername,
  resolveTikTokTargetUsername,
  sanitizeDiagnosticErrorMessage,
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
  ChevronDown,
  ChevronUp,
  Activity,
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

function toneColor(tone: 'ok' | 'warn' | 'error' | 'off'): string {
  switch (tone) {
    case 'ok':
      return 'var(--app-ok)';
    case 'warn':
      return 'var(--app-warn)';
    case 'error':
      return 'var(--app-error)';
    default:
      return 'var(--app-text-secondary)';
  }
}

function formatDiagnosticStageLabel(stage: TikTokDiagnosticStage): string {
  switch (stage) {
    case 'idle':
      return 'Siaga (idle)';
    case 'resolving_room':
      return 'Lookup Room (resolving_room)';
    case 'room_resolved':
      return 'Room Ditemukan (room_resolved)';
    case 'websocket_connecting':
      return 'Menghubungkan WebSocket (websocket_connecting)';
    case 'websocket_open':
      return 'WebSocket Terbuka (websocket_open)';
    case 'room_entry_sent':
      return 'Frame Masuk Dikirim (room_entry_sent)';
    case 'waiting_room_ack':
      return 'Menunggu ACK Room (waiting_room_ack)';
    case 'connected':
      return 'Terhubung (connected)';
    case 'receiving_events':
      return 'Menerima Event (receiving_events)';
    case 'reconnecting':
      return 'Menyambung Ulang (reconnecting)';
    case 'waiting_for_live':
      return 'Menunggu LIVE (waiting_for_live)';
    case 'error':
      return 'Gagal (error)';
    case 'disconnected':
      return 'Terputus (disconnected)';
  }
}

interface TikTokDiagnosticsPanelProps {
  diagnostics?: TikTokConnectionDiagnostics;
  isOpen: boolean;
  onToggle: () => void;
}

const TikTokDiagnosticsCollapsible: React.FC<TikTokDiagnosticsPanelProps> = ({
  diagnostics,
  isOpen,
  onToggle,
}) => {
  const stageText = diagnostics?.diagnosticStage
    ? formatDiagnosticStageLabel(diagnostics.diagnosticStage)
    : 'Belum tersedia';
  const roomLookupHttpText =
    typeof diagnostics?.roomLookupHttpStatus === 'number'
      ? diagnostics.roomLookupHttpStatus === 0
        ? '0 (Gagal jaringan)'
        : `HTTP ${diagnostics.roomLookupHttpStatus}`
      : 'Belum tersedia';
  const ttwidStatusText = diagnostics
    ? diagnostics.hasTtwidCookie
      ? 'Tersedia'
      : 'Tidak tersedia'
    : 'Belum tersedia';
  const websocketHttpText =
    typeof diagnostics?.websocketHttpStatus === 'number'
      ? diagnostics.websocketHttpStatus === 0
        ? '0 (Handshake gagal)'
        : `HTTP ${diagnostics.websocketHttpStatus}`
      : 'Belum tersedia';
  const roomEntrySentText = diagnostics
    ? diagnostics.roomEntryFrameSent
      ? 'Sudah dikirim'
      : 'Belum dikirim'
    : 'Belum tersedia';
  const roomEntryConfirmedText = diagnostics
    ? diagnostics.roomEntryConfirmed
      ? 'Terkonfirmasi'
      : diagnostics.eventReceivedBeforeRoomAck
      ? 'Belum ACK (event Webcast masuk)'
      : 'Belum dikonfirmasi'
    : 'Belum tersedia';
  const lastPayloadTypeText = diagnostics?.lastPayloadType || 'Belum tersedia';
  const decodedEventCountText =
    typeof diagnostics?.decodedEventCount === 'number'
      ? String(diagnostics.decodedEventCount)
      : 'Belum tersedia';
  const lastDecodedEventMethodText = diagnostics?.lastDecodedEventMethod || 'Belum tersedia';
  const lastTransportErrorText =
    sanitizeDiagnosticErrorMessage(diagnostics?.lastTransportError) || 'Belum tersedia';
  const handshakeAttemptHostText = diagnostics?.websocketAttemptHost || 'Belum tersedia';
  const handshakeContentTypeText = diagnostics?.websocketContentType || 'Belum tersedia';
  const handshakeRedirectText = diagnostics?.websocketRedirectLocation || null;
  const handshakeResponseClassText = diagnostics?.websocketResponseClass
    ? diagnostics.websocketBodyKind
      ? typeof diagnostics.websocketBodyBytes === 'number'
        ? `${diagnostics.websocketResponseClass} (${diagnostics.websocketBodyKind} · ${diagnostics.websocketBodyBytes} B)`
        : `${diagnostics.websocketResponseClass} (${diagnostics.websocketBodyKind})`
      : diagnostics.websocketResponseClass
    : 'Belum tersedia';
  const handshakeRejectionReasonText =
    sanitizeDiagnosticErrorMessage(diagnostics?.websocketRejectionReason) || 'Belum tersedia';
  const homepageHttpText =
    typeof diagnostics?.cookieWarmUpHomepageHttpStatus === 'number'
      ? diagnostics.cookieWarmUpHomepageHttpStatus === 0
        ? '0 (Gagal jaringan)'
        : `HTTP ${diagnostics.cookieWarmUpHomepageHttpStatus}`
      : 'Belum tersedia';
  const homepageSetCookieText =
    typeof diagnostics?.cookieWarmUpHomepageHasSetCookie === 'boolean'
      ? diagnostics.cookieWarmUpHomepageHasSetCookie
        ? 'Ya'
        : 'Tidak'
      : 'Belum tersedia';
  const homepageCookieCountText =
    typeof diagnostics?.cookieWarmUpHomepageCookieCount === 'number'
      ? String(diagnostics.cookieWarmUpHomepageCookieCount)
      : 'Belum tersedia';
  const homepageTtwidText =
    typeof diagnostics?.cookieWarmUpHomepageHasTtwid === 'boolean'
      ? diagnostics.cookieWarmUpHomepageHasTtwid
        ? 'Ditemukan'
        : 'Tidak ditemukan'
      : 'Belum tersedia';
  const livePageAttempted = diagnostics?.cookieWarmUpLivePageAttempted;
  const livePageHttpText =
    livePageAttempted === false
      ? 'Not attempted'
      : livePageAttempted === true
      ? typeof diagnostics?.cookieWarmUpLivePageHttpStatus === 'number'
        ? diagnostics.cookieWarmUpLivePageHttpStatus === 0
          ? '0 (Gagal jaringan)'
          : `HTTP ${diagnostics.cookieWarmUpLivePageHttpStatus}`
        : 'Belum tersedia'
      : 'Belum tersedia';
  const livePageSetCookieText =
    livePageAttempted === false
      ? 'Not attempted'
      : livePageAttempted === true && typeof diagnostics?.cookieWarmUpLivePageHasSetCookie === 'boolean'
      ? diagnostics.cookieWarmUpLivePageHasSetCookie
        ? 'Ya'
        : 'Tidak'
      : 'Belum tersedia';
  const livePageCookieCountText =
    livePageAttempted === false
      ? 'Not attempted'
      : livePageAttempted === true && typeof diagnostics?.cookieWarmUpLivePageCookieCount === 'number'
      ? String(diagnostics.cookieWarmUpLivePageCookieCount)
      : 'Belum tersedia';
  const livePageTtwidText =
    livePageAttempted === false
      ? 'Not attempted'
      : livePageAttempted === true && typeof diagnostics?.cookieWarmUpLivePageHasTtwid === 'boolean'
      ? diagnostics.cookieWarmUpLivePageHasTtwid
        ? 'Ditemukan'
        : 'Tidak ditemukan'
      : 'Belum tersedia';
  const cookieWarmUpResultText = diagnostics?.cookieWarmUpResult || 'Belum tersedia';

  return (
    <div className="border-t border-[var(--app-border)] bg-[var(--app-surface)]">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--app-surface-hover)] transition-colors"
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--app-text)] min-w-0">
          <Activity className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
          <span className="truncate">Detail Diagnostik Koneksi</span>
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] text-[var(--app-text-muted)] shrink-0">
          <span className="hidden sm:inline tabular-metrics">
            {diagnostics?.diagnosticStage ?? 'Belum tersedia'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[var(--app-text-secondary)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--app-text-secondary)]" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-3.5 pt-2 border-t border-[var(--app-border)] bg-[var(--app-surface-muted)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Tahap koneksi saat ini</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5 break-words tabular-metrics">
                {stageText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">HTTP status Room Lookup</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                {roomLookupHttpText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Cookie anonim &quot;ttwid&quot;</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5">
                {ttwidStatusText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">HTTP status WebSocket</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                {websocketHttpText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Frame masuk room</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5">
                {roomEntrySentText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Konfirmasi room</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5">
                {roomEntryConfirmedText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Payload type terakhir</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5 truncate tabular-metrics">
                {lastPayloadTypeText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Jumlah decoded event</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                {decodedEventCountText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
              <div className="text-[10px] text-[var(--app-text-muted)]">Method event terakhir</div>
              <div className="font-semibold text-[var(--app-text)] mt-0.5 truncate tabular-metrics">
                {lastDecodedEventMethodText}
              </div>
            </div>

            <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0 sm:col-span-2">
              <div className="text-[10px] text-[var(--app-text-muted)]">Pesan kegagalan terakhir</div>
              <div className="font-medium text-[var(--app-text-secondary)] mt-0.5 break-words">
                {lastTransportErrorText}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--app-border)]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)] mb-2">
              Diagnostik Handshake WebSocket
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Host percobaan</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 truncate tabular-metrics">
                  {handshakeAttemptHostText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">HTTP status handshake</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                  {websocketHttpText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Content-Type</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 truncate tabular-metrics">
                  {handshakeContentTypeText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Jenis respons</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 truncate tabular-metrics">
                  {handshakeResponseClassText}
                </div>
              </div>

              {handshakeRedirectText && (
                <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0 sm:col-span-2">
                  <div className="text-[10px] text-[var(--app-text-muted)]">Redirect host/path</div>
                  <div className="font-semibold text-[var(--app-text)] mt-0.5 break-all tabular-metrics">
                    {handshakeRedirectText}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0 sm:col-span-2">
                <div className="text-[10px] text-[var(--app-text-muted)]">Alasan handshake ditolak</div>
                <div className="font-medium text-[var(--app-text-secondary)] mt-0.5 break-words">
                  {handshakeRejectionReasonText}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[var(--app-border)]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)] mb-2">
              Diagnostik Cookie Warm-up
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Homepage HTTP</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                  {homepageHttpText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Homepage Set-Cookie</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5">
                  {homepageSetCookieText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Homepage Cookie Count</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                  {homepageCookieCountText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">Homepage ttwid</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5">
                  {homepageTtwidText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">LIVE Page HTTP</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                  {livePageHttpText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">LIVE Page Set-Cookie</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5">
                  {livePageSetCookieText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">LIVE Page Cookie Count</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 tabular-metrics">
                  {livePageCookieCountText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0">
                <div className="text-[10px] text-[var(--app-text-muted)]">LIVE Page ttwid</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5">
                  {livePageTtwidText}
                </div>
              </div>

              <div className="rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] px-3 py-2 min-w-0 sm:col-span-2">
                <div className="text-[10px] text-[var(--app-text-muted)]">Cookie Warm-up Result</div>
                <div className="font-semibold text-[var(--app-text)] mt-0.5 break-words tabular-metrics">
                  {cookieWarmUpResultText}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

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

  const isTransportConnectedOrWaiting =
    isTransportActiveOrBusy || tiktokStatus.state === 'waiting_for_live';

  const handleConnectAction = async () => {
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
  };

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

  const tiktokProvider = filteredIntegrations.find((item) => item.id === 'tiktok');
  const otherProviders = filteredIntegrations.filter((item) => item.id !== 'tiktok');

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
      <div className="space-y-4 pb-6 anim-view-enter">
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] text-[var(--app-text)] px-4 py-2.5 rounded-xl shadow-[var(--app-shadow)] flex items-center gap-2 text-xs font-medium max-w-[92vw] anim-pop-in"
          >
            <Check className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top Command & Target Strip — Primary CTA Immediately Reachable */}
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--app-border)] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setIsTikTokSettingsOpen(false)}
                className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5 shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                <span>Koneksi</span>
              </button>
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-lg font-bold text-[var(--app-text)] truncate">
                  TikTok LIVE Inspector
                </h1>
                <div className="text-[11px] text-[var(--app-text-muted)] truncate flex items-center gap-1.5">
                  <span className="tabular-metrics text-[var(--app-text-secondary)]">
                    {savedTargetUsername ? `@${savedTargetUsername}` : 'Target belum diatur'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span style={{ color: toneColor(honestStatus.eventTransport.tone) }}>
                    {honestStatus.eventTransport.label}
                  </span>
                </div>
              </div>
            </div>

            {isTransportConnectedOrWaiting ? (
              <button
                type="button"
                onClick={() => {
                  void onDisconnectTikTok?.();
                  showToast('Transport LIVE diputuskan (target & akun tetap tersimpan).');
                }}
                className="btn-press min-h-[44px] px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/60 text-rose-200 text-xs font-bold whitespace-nowrap shrink-0"
              >
                Putuskan Transport LIVE
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleConnectAction()}
                className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Radio className="w-4 h-4 shrink-0" />
                <span>
                  {savedTargetUsername || isValidTikTokTargetUsername(targetUsernameDraft)
                    ? 'Sambungkan Transport LIVE'
                    : 'Isi Target Dahulu'}
                </span>
              </button>
            )}
          </div>

          {/* Inline Target @username Bar */}
          <form onSubmit={(e) => void handleSaveTargetUsername(e)} className="p-4 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-h-[44px] flex items-center bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus-within:border-[var(--app-accent)] rounded-xl px-3.5">
                <AtSign className="w-4 h-4 text-[var(--app-accent-text)] mr-1.5 shrink-0" />
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
                  className="flex-1 bg-transparent text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none tabular-metrics"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="submit"
                  className="btn-press flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-accent-border)] text-[var(--app-accent-text)] text-xs font-bold whitespace-nowrap"
                >
                  Simpan Target
                </button>
                {savedTargetUsername && (
                  <button
                    type="button"
                    onClick={() => void handleClearTargetUsername()}
                    aria-label="Hapus target username"
                    className="btn-press min-h-[44px] px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-700/50 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            </div>

            {targetValidationError && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-700/60 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{targetValidationError}</span>
              </div>
            )}

            <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed">
              Target LIVE publik yang dipantau Mode A (bukan akun terautentikasi). Pembacaan room publik tidak mewajibkan login OAuth.
            </p>
          </form>

          {/* Unified 4-Layer Honest Telemetry Strip (Single Surface Hairline Grid) */}
          <div className="border-t border-[var(--app-border)] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 sm:divide-x divide-[var(--app-border)] bg-[var(--app-surface-muted)]">
            <div className="p-3 min-w-0">
              <div className="text-[10px] font-medium text-[var(--app-text-muted)]">1. Account Linked</div>
              <div
                className="text-xs font-bold mt-0.5 truncate"
                style={{ color: toneColor(honestStatus.accountLinked.tone) }}
              >
                {honestStatus.accountLinked.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                {honestStatus.accountLinked.detail}
              </div>
            </div>

            <div className="p-3 min-w-0">
              <div className="text-[10px] font-medium text-[var(--app-text-muted)]">2. Mode A Session</div>
              <div
                className="text-xs font-bold mt-0.5 truncate"
                style={{ color: toneColor(honestStatus.modeASession.tone) }}
              >
                {honestStatus.modeASession.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                {honestStatus.modeASession.detail}
              </div>
            </div>

            <div className="p-3 min-w-0">
              <div className="text-[10px] font-medium text-[var(--app-text-muted)]">3. Room Status</div>
              <div
                className="text-xs font-bold mt-0.5 truncate"
                style={{ color: toneColor(honestStatus.roomStatus.tone) }}
              >
                {honestStatus.roomStatus.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5 tabular-metrics">
                {tiktokAccount.connectionMethod === 'euler' ? 'Metode: EulerStream' : 'Metode: Direct TikTok'}
              </div>
            </div>

            <div className="p-3 min-w-0">
              <div className="text-[10px] font-medium text-[var(--app-text-muted)]">4. Event Transport</div>
              <div
                className="text-xs font-bold mt-0.5 truncate"
                style={{ color: toneColor(honestStatus.eventTransport.tone) }}
              >
                {honestStatus.eventTransport.label}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                {honestStatus.eventTransport.detail}
              </div>
            </div>
          </div>

          {tiktokStatus.state === 'error' && (
            <div className="px-4 py-2.5 border-t border-rose-700/50 bg-rose-950/40 text-xs text-rose-200">
              <span className="font-bold">Kesalahan Transport LIVE: </span>
              <span>{tiktokStatus.message}</span>
            </div>
          )}

          <TikTokDiagnosticsCollapsible
            diagnostics={tiktokStatus.diagnostics}
            isOpen={isDiagnosticsOpen}
            onToggle={() => setIsDiagnosticsOpen((prev) => !prev)}
          />
        </section>

        {/* 2-Column Desktop Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: Transport Method & Exclusive EulerStream Credentials */}
          <section className="lg:col-span-7 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] divide-y divide-[var(--app-border)]">
            <div className="p-4">
              <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                Metode Koneksi LIVE
              </h2>
              <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
                Pilih jalur transport event LIVE yang digunakan setelah target diatur.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                <div
                  className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                    tiktokAccount.connectionMethod === 'direct'
                      ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                      : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={tiktokAccount.connectionMethod === 'direct'}
                    onClick={() => void handleSaveConnectionPrefs({ connectionMethod: 'direct' })}
                    className="btn-press w-full min-h-[44px] text-left space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] rounded-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--app-text)]">
                        Direct TikTok (Utama)
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
                      Langsung ke TikTok dari perangkat. Kredensial EulerStream bersifat opsional.
                    </p>
                  </button>

                  <label className="pt-2 border-t border-[var(--app-border)] min-h-[44px] flex items-center justify-between gap-2.5 text-[11px] text-[var(--app-text-secondary)] cursor-pointer">
                    <span>Fallback ke EulerStream jika ditolak</span>
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

                <button
                  type="button"
                  aria-pressed={tiktokAccount.connectionMethod === 'euler'}
                  onClick={() => void handleSaveConnectionPrefs({ connectionMethod: 'euler' })}
                  className={`btn-press rounded-xl border p-3.5 text-left flex flex-col justify-start space-y-1.5 transition-colors min-h-[112px] ${
                    tiktokAccount.connectionMethod === 'euler'
                      ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                      : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <div className="w-full flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--app-text)]">EulerStream Relay</span>
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
                    Menggunakan EulerStream Transport langsung setelah resolusi room dengan satu kredensial (API Key atau JWT Key).
                  </p>
                </button>
              </div>
            </div>

            {/* Exclusive EulerStream Credential Section */}
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
                    <span>
                      Kredensial EulerStream{' '}
                      {tiktokAccount.connectionMethod === 'direct' ? '(Opsional Fallback)' : '(Aktif)'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                    Simpan lokal, dimask, dan dikecualikan dari ekspor JSON.
                  </div>
                </div>
                <span className="text-[11px] tabular-metrics text-[var(--app-text-secondary)]">
                  {savedEulerKeyMask
                    ? `API Key: ${savedEulerKeyMask}`
                    : savedEulerJwtMask
                    ? `JWT Key: ${savedEulerJwtMask}`
                    : 'Belum diisi'}
                </span>
              </div>

              <div className="inline-flex rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEulerAuthMode('api_key');
                    setEulerJwtKeyDraft('');
                  }}
                  className={`btn-press min-h-[44px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
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
                  className={`btn-press min-h-[44px] px-3.5 rounded-lg text-xs font-bold transition-colors ${
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
                        : 'Masukkan EulerStream API Key...'
                    }
                    className="flex-1 min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!eulerApiKeyDraft.trim()}
                    onClick={() => void handleSaveConnectionPrefs({ saveCredentialMode: 'api_key' })}
                    className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-50 text-[var(--app-accent-ink)] text-xs font-bold whitespace-nowrap"
                  >
                    Simpan Key
                  </button>
                  {hasAnyEulerCredential && (
                    <button
                      type="button"
                      onClick={() => void handleSaveConnectionPrefs({ clearCredentialMode: 'all' })}
                      className="btn-press min-h-[44px] px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
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
                        : 'Masukkan EulerStream JWT Key...'
                    }
                    className="flex-1 min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!eulerJwtKeyDraft.trim()}
                    onClick={() => void handleSaveConnectionPrefs({ saveCredentialMode: 'jwt' })}
                    className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-50 text-[var(--app-accent-ink)] text-xs font-bold whitespace-nowrap"
                  >
                    Simpan JWT
                  </button>
                  {hasAnyEulerCredential && (
                    <button
                      type="button"
                      onClick={() => void handleSaveConnectionPrefs({ clearCredentialMode: 'all' })}
                      className="btn-press min-h-[44px] px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Right: Optional TikTok OAuth PKCE Verification */}
          <section className="lg:col-span-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 space-y-3.5">
            <div>
              <h2 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                <span>OAuth TikTok (Opsional)</span>
              </h2>
              <p className="text-xs text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
                Verifikasi identitas melalui Login Kit TikTok. Pembacaan room publik tidak mewajibkan OAuth.
              </p>
            </div>

            {tiktokAccount.accountLinkStatus === 'failed' && tiktokAccount.linkErrorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/60 text-xs text-rose-200 space-y-1">
                <div className="flex items-start gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Penghubungan Akun Gagal</span>
                </div>
                <p className="leading-relaxed text-rose-100">{tiktokAccount.linkErrorMessage}</p>
              </div>
            )}

            {tiktokAccount.isLinked && tiktokAccount.accountLinkStatus === 'linked' ? (
              <div className="space-y-3 pt-2 border-t border-[var(--app-border)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {tiktokAccount.avatarUrl ? (
                      <img
                        src={tiktokAccount.avatarUrl}
                        alt={tiktokAccount.displayName || tiktokAccount.username || 'Avatar TikTok'}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-emerald-500/40 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-950/70 border border-emerald-600/50 flex items-center justify-center text-emerald-300 shrink-0">
                        <UserCheck className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--app-text)] truncate">
                        {tiktokAccount.displayName ||
                          (tiktokAccount.username ? `@${tiktokAccount.username}` : 'Akun TikTok Terhubung')}
                      </div>
                      <div className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics truncate">
                        {hasProfileUsername
                          ? `@${tiktokAccount.username}`
                          : 'Username belum tersedia'}
                      </div>
                      {tiktokAccount.openId && (
                        <div className="text-[10px] text-[var(--app-text-muted)] tabular-metrics truncate">
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
                    className="btn-press min-h-[44px] px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/70 text-rose-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Putuskan</span>
                  </button>
                </div>

                <div className="pt-2.5 border-t border-[var(--app-border)] space-y-1 text-[11px] text-[var(--app-text-muted)]">
                  <div>
                    Otorisasi:{' '}
                    <span className="text-[var(--app-text-secondary)] tabular-metrics">
                      {tiktokAccount.lastSuccessfulAuthorization
                        ? new Date(tiktokAccount.lastSuccessfulAuthorization).toLocaleString('id-ID')
                        : '—'}
                    </span>
                  </div>
                  <div className="truncate">
                    Scope:{' '}
                    <span className="text-[var(--app-text-secondary)] tabular-metrics">
                      {tiktokAccount.grantedScopes && tiktokAccount.grantedScopes.length > 0
                        ? tiktokAccount.grantedScopes.join(', ')
                        : 'Terverifikasi'}
                    </span>
                  </div>
                </div>

                {!hasProfileUsername && (
                  <div className="p-2.5 rounded-lg bg-amber-950/35 border border-amber-700/50 text-[11px] text-amber-200 leading-relaxed">
                    Pastikan scope <code>user.info.profile</code> disetujui di aplikasi developer TikTok agar username terbaca.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-[var(--app-border)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--app-text-secondary)]">
                    Akun TikTok belum ditautkan.
                  </div>
                  <button
                    type="button"
                    disabled={tiktokAccount.accountLinkStatus === 'linking'}
                    onClick={() => void onLoginTikTok?.()}
                    className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] disabled:opacity-60 text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
                  >
                    {tiktokAccount.accountLinkStatus === 'linking' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                    <span>
                      {tiktokAccount.accountLinkStatus === 'linking'
                        ? 'Menghubungkan...'
                        : 'Login TikTok'}
                    </span>
                  </button>
                </div>

                {!authConfig.isWebOAuthReady && (
                  <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-700/45 text-[11px] text-amber-200 space-y-1">
                    <div className="font-bold text-amber-300">
                      Konfigurasi Developer Diperlukan:
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[var(--app-text-secondary)]">
                      {authConfig.missingRequirements.map((req, idx) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[var(--app-surface-elevated)] border border-[var(--app-accent-border)] text-[var(--app-text)] px-4 py-2.5 rounded-xl shadow-[var(--app-shadow)] flex items-center gap-2 text-xs font-medium max-w-[92vw] anim-pop-in"
        >
          <Check className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Compact Registry Bar */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight">
              Integrasi Platform
            </h1>
            <span className="text-xs text-[var(--app-text-muted)] tabular-metrics whitespace-nowrap">
              {integrations.length} Konektor
            </span>
          </div>

          <div className="text-[11px] font-medium inline-flex items-center gap-1.5" style={{ color: 'var(--app-ok)' }}>
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Gateway Siap</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2.5 border-t border-[var(--app-border)]">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] overflow-x-auto no-scrollbar">
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

          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari platform..."
              aria-label="Cari platform integrasi"
              className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] focus:border-[var(--app-accent)] rounded-xl pl-9 pr-3 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* Spotlight TikTok LIVE Mode A Command Banner */}
      {tiktokProvider && (
        <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-accent-border)] overflow-hidden">
          <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-2xl w-11 h-11 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                {tiktokProvider.logo}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-bold text-[var(--app-text)]">
                    {tiktokProvider.name}
                  </h2>
                  <span className="text-xs text-[var(--app-text-muted)]">·</span>
                  <span className="text-xs font-semibold" style={{ color: toneColor(honestStatus.accountLinked.tone) }}>
                    {honestStatus.accountLinked.label}
                  </span>
                </div>
                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed mt-0.5 max-w-2xl">
                  {tiktokProvider.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenConfig(tiktokProvider)}
              className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Buka Inspector TikTok</span>
            </button>
          </div>

          <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="min-w-0">
              <span className="text-[10px] text-[var(--app-text-muted)] block">Target LIVE</span>
              <span className="tabular-metrics font-semibold text-[var(--app-text)] truncate block">
                {savedTargetUsername ? `@${savedTargetUsername}` : 'Belum diatur'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-[var(--app-text-muted)] block">OAuth</span>
              <span className="tabular-metrics text-[var(--app-text-secondary)] truncate block">
                {tiktokAccount.isLinked ? honestStatus.accountLinked.detail : 'Opsional'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-[var(--app-text-muted)] block">Metode</span>
              <span className="tabular-metrics text-[var(--app-text-secondary)] truncate block">
                {tiktokAccount.connectionMethod === 'euler' ? 'EulerStream' : 'Direct TikTok'}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-[var(--app-text-muted)] block">Transport</span>
              <span
                className="tabular-metrics font-semibold truncate block"
                style={{ color: toneColor(honestStatus.eventTransport.tone) }}
              >
                {honestStatus.eventTransport.label}
              </span>
            </div>
          </div>

          <TikTokDiagnosticsCollapsible
            diagnostics={tiktokStatus.diagnostics}
            isOpen={isDiagnosticsOpen}
            onToggle={() => setIsDiagnosticsOpen((prev) => !prev)}
          />
        </section>
      )}

      {/* Other Providers Grid */}
      {otherProviders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {otherProviders.map((provider) => {
            const effectiveStatus: FeatureStatus = provider.status;
            const statusConfig = STATUS_DEFINITIONS[effectiveStatus];
            const isConnected = effectiveStatus === 'ACTIVE';

            return (
              <div
                key={provider.id}
                className={`rounded-2xl bg-[var(--app-surface)] border flex flex-col justify-between transition-colors ${
                  isConnected
                    ? 'border-emerald-600/45'
                    : 'border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                }`}
              >
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl w-10 h-10 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                      {provider.logo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-sm font-bold text-[var(--app-text)] leading-snug truncate">
                        {provider.name}
                      </h2>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)] mt-0.5">
                        <span className="capitalize">{provider.category}</span>
                        <span aria-hidden="true">·</span>
                        <span style={{ color: statusConfig.color }} className="font-semibold">
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed line-clamp-2">
                    {provider.description}
                  </p>

                  {provider.connectedUser && (
                    <div className="text-xs pt-1 flex items-center justify-between gap-2 text-[var(--app-text-muted)]">
                      <span>Akun</span>
                      <span
                        className={`font-semibold tabular-metrics truncate ${
                          isConnected ? 'text-[var(--app-ok)]' : 'text-[var(--app-text-secondary)]'
                        }`}
                      >
                        @{provider.connectedUser}
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)] flex items-center justify-between gap-2 rounded-b-2xl">
                  <button
                    type="button"
                    onClick={() => handleOpenConfig(provider)}
                    className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Settings className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
                    <span>Konfigurasi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleConnection(provider.id)}
                    className={`btn-press min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap ${
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
      )}

      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl text-[var(--app-text-muted)]">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold text-[var(--app-text-secondary)]">
            Tidak ada platform yang cocok
          </p>
          <p className="text-xs mt-1">Coba kata kunci atau kategori lain.</p>
        </div>
      )}

      {/* Modal: Konfigurasi Provider Non-TikTok */}
      {editingProvider && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-[var(--app-shadow)] space-y-4 anim-pop-in">
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
                className="btn-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)]"
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

              <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed pt-1">
                Masukkan kredensial layanan untuk sinkronisasi lokal, atau uji alur event langsung melalui Live Center.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-press min-h-[44px] px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold"
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
