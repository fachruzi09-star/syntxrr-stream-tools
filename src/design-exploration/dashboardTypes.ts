export type DashboardAlternativeId = 'A' | 'B' | 'C' | 'D';
export type DashboardViewTab = DashboardAlternativeId | 'COMPARE';

export type ModeATransportState =
  | 'disconnected'
  | 'resolving_room'
  | 'connecting_direct'
  | 'connected_direct'
  | 'connecting_euler'
  | 'connected_euler'
  | 'waiting_for_live'
  | 'reconnecting'
  | 'error';

export type ModeARoomStatus = 'unknown' | 'not_live' | 'live' | 'not_found' | 'unreadable';

export type ModeASessionMode = 'inactive' | 'with_live_connector' | 'without_live_connection';

export type ModeBStreamStatus =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'live'
  | 'host_wait'
  | 'stopping'
  | 'stopped'
  | 'disconnected'
  | 'capture_lost'
  | 'reshare_waiting'
  | 'resharing'
  | 'error';

export type ModeBAudioSource = 'mix' | 'internal' | 'microphone';

export type HardwareCheckState = 'unchecked' | 'verified';

export interface HonestIndicatorItem {
  label: string;
  detail: string;
  tone: 'neutral' | 'ok' | 'warn' | 'error';
}

export interface DashboardScenarioState {
  // Mode A (TikTok LIVE Companion)
  targetUsername: string;
  accountLinked: boolean;
  connectionMethod: 'direct' | 'euler';
  modeASessionMode: ModeASessionMode;
  modeATransportState: ModeATransportState;
  modeARoomStatus: ModeARoomStatus;
  modeAMessage: string;
  viewerCount: number | null;
  likeCount: number | null;
  roomId: string | null;
  overlayPermissionGranted: boolean | null; // null => "Belum diperiksa"
  hudVisible: boolean;

  // Mode B (Native RTMP Encoder)
  rtmpUrlConfigured: boolean;
  rtmpStreamKeyConfigured: boolean;
  rtmpEndpointLabel: string;
  notificationPermissionGranted: boolean | null; // null => "Belum diperiksa"
  modeBStatus: ModeBStreamStatus;
  modeBMessage: string;
  modeBStreaming: boolean;
  bitrateKbps: number | null;
  audioSource: ModeBAudioSource;
  screenCaptureLayerInPreset: boolean;

  // Shared honest readiness & preset info
  hardwareCheckState: HardwareCheckState;
  cameraPermission: 'unchecked' | 'granted' | 'prompt';
  micPermission: 'unchecked' | 'granted' | 'prompt';
  screenPermission: 'unchecked' | 'granted' | 'prompt';
  activePresetName: string;
  activePresetOrientation: '9:16' | '16:9';
  visibleElementsCount: number;
  lastFeedback: string | null;
}

export interface ScenarioPresetDef {
  id: string;
  mode: 'mode_a' | 'mode_b';
  label: string;
  summary: string;
  patch: Partial<DashboardScenarioState>;
}

export const INITIAL_DASHBOARD_SCENARIO: DashboardScenarioState = {
  targetUsername: 'syntxrr.atelier',
  accountLinked: false,
  connectionMethod: 'direct',
  modeASessionMode: 'inactive',
  modeATransportState: 'disconnected',
  modeARoomStatus: 'unknown',
  modeAMessage: 'Companion standby. Jalankan TikTok LIVE di aplikasi resmi lalu mulai sesi Companion.',
  viewerCount: null,
  likeCount: null,
  roomId: null,
  overlayPermissionGranted: true,
  hudVisible: false,

  rtmpUrlConfigured: true,
  rtmpStreamKeyConfigured: true,
  rtmpEndpointLabel: 'rtmp://live-push.example.net/live',
  notificationPermissionGranted: true,
  modeBStatus: 'idle',
  modeBMessage: 'Native RTMP encoder siap digunakan.',
  modeBStreaming: false,
  bitrateKbps: null,
  audioSource: 'mix',
  screenCaptureLayerInPreset: true,

  hardwareCheckState: 'unchecked',
  cameraPermission: 'unchecked',
  micPermission: 'unchecked',
  screenPermission: 'unchecked',
  activePresetName: 'Minimal Portrait',
  activePresetOrientation: '9:16',
  visibleElementsCount: 4,
  lastFeedback: null,
};

export const MODE_A_SCENARIO_PRESETS: ScenarioPresetDef[] = [
  {
    id: 'ma_standby',
    mode: 'mode_a',
    label: 'Standby (Inactive)',
    summary: 'Mode A inactive; transport disconnected; telemetry neutral.',
    patch: {
      targetUsername: 'syntxrr.atelier',
      modeASessionMode: 'inactive',
      modeATransportState: 'disconnected',
      modeARoomStatus: 'unknown',
      modeAMessage: 'Companion belum dijalankan. Siap memulai sesi bersama aplikasi TikTok resmi.',
      viewerCount: null,
      likeCount: null,
      roomId: null,
      hudVisible: false,
    },
  },
  {
    id: 'ma_companion_only',
    mode: 'mode_a',
    label: 'Companion Without LIVE',
    summary: 'Local HUD active without TikTok LIVE transport (explicit partial warning).',
    patch: {
      targetUsername: 'syntxrr.atelier',
      modeASessionMode: 'without_live_connection',
      modeATransportState: 'disconnected',
      modeARoomStatus: 'unknown',
      modeAMessage: 'Sesi Companion lokal aktif tanpa koneksi event TikTok LIVE.',
      viewerCount: null,
      likeCount: null,
      roomId: null,
      hudVisible: true,
    },
  },
  {
    id: 'ma_waiting_live',
    mode: 'mode_a',
    label: 'Waiting for TikTok LIVE',
    summary: 'Companion started; target account has not started LIVE in TikTok yet.',
    patch: {
      targetUsername: 'syntxrr.atelier',
      modeASessionMode: 'with_live_connector',
      modeATransportState: 'waiting_for_live',
      modeARoomStatus: 'not_live',
      modeAMessage: 'Akun @syntxrr.atelier belum LIVE di aplikasi TikTok. Menunggu room aktif...',
      viewerCount: null,
      likeCount: null,
      roomId: null,
      hudVisible: true,
    },
  },
  {
    id: 'ma_connected_direct',
    mode: 'mode_a',
    label: 'Connected Direct WS',
    summary: 'Live event transport active via Direct TikTok WS with live viewer/like metrics.',
    patch: {
      targetUsername: 'syntxrr.atelier',
      connectionMethod: 'direct',
      modeASessionMode: 'with_live_connector',
      modeATransportState: 'connected_direct',
      modeARoomStatus: 'live',
      modeAMessage: 'Direct TikTok WebSocket terhubung ke room LIVE.',
      viewerCount: 1284,
      likeCount: 18420,
      roomId: '741982014091',
      hudVisible: true,
    },
  },
  {
    id: 'ma_reconnecting',
    mode: 'mode_a',
    label: 'Reconnecting',
    summary: 'Transport interrupted; attempting automatic recovery while Companion HUD stays up.',
    patch: {
      targetUsername: 'syntxrr.atelier',
      modeASessionMode: 'with_live_connector',
      modeATransportState: 'reconnecting',
      modeARoomStatus: 'live',
      modeAMessage: 'Koneksi WebSocket terputus sementara. Mencoba menyambung ulang...',
      viewerCount: null,
      likeCount: null,
      roomId: '741982014091',
      hudVisible: true,
    },
  },
  {
    id: 'ma_error',
    mode: 'mode_a',
    label: 'Transport / Config Error',
    summary: 'Recoverable transport error or missing @username / overlay permission.',
    patch: {
      targetUsername: '',
      modeASessionMode: 'inactive',
      modeATransportState: 'error',
      modeARoomStatus: 'not_found',
      modeAMessage: 'Username target TikTok belum diatur atau room tidak dapat dibaca.',
      viewerCount: null,
      likeCount: null,
      roomId: null,
      overlayPermissionGranted: false,
      hudVisible: false,
    },
  },
];

export const MODE_B_SCENARIO_PRESETS: ScenarioPresetDef[] = [
  {
    id: 'mb_idle',
    mode: 'mode_b',
    label: 'Idle / Ready',
    summary: 'RTMP encoder idle; bitrate is neutral fallback until broadcast starts.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      notificationPermissionGranted: true,
      modeBStatus: 'idle',
      modeBMessage: 'Native RTMP encoder siap memulai siaran.',
      modeBStreaming: false,
      bitrateKbps: null,
    },
  },
  {
    id: 'mb_missing_key',
    mode: 'mode_b',
    label: 'RTMP Config Incomplete',
    summary: 'Start Broadcast disabled because RTMP Stream Key & Notification permission missing.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: false,
      notificationPermissionGranted: false,
      modeBStatus: 'idle',
      modeBMessage: 'Lengkapi Stream Key RTMP dan izin notifikasi Android sebelum memulai siaran.',
      modeBStreaming: false,
      bitrateKbps: null,
    },
  },
  {
    id: 'mb_connecting',
    mode: 'mode_b',
    label: 'Starting / Connecting',
    summary: 'Initializing MediaProjection + H.264/AAC pipeline and RTMP handshake.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      notificationPermissionGranted: true,
      modeBStatus: 'connecting',
      modeBMessage: 'Menghubungkan encoder ke endpoint RTMP...',
      modeBStreaming: false,
      bitrateKbps: null,
    },
  },
  {
    id: 'mb_live',
    mode: 'mode_b',
    label: 'Live Streaming',
    summary: 'Encoder active with verified bitrate telemetry; Host Wait & Stop available.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      notificationPermissionGranted: true,
      modeBStatus: 'live',
      modeBMessage: 'Encoder RTMP aktif mengirim video H.264 & audio AAC.',
      modeBStreaming: true,
      bitrateKbps: 5840,
    },
  },
  {
    id: 'mb_host_wait',
    mode: 'mode_b',
    label: 'Host Wait Active',
    summary: 'Screensaver / standby frame transmitted while stream stays connected.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      modeBStatus: 'host_wait',
      modeBMessage: 'Mode Host Wait aktif: frame jeda dikirim tanpa memutus koneksi RTMP.',
      modeBStreaming: true,
      bitrateKbps: 1420,
    },
  },
  {
    id: 'mb_capture_lost',
    mode: 'mode_b',
    label: 'Screen Capture Lost',
    summary: 'MediaProjection token revoked by Android; Screen Reshare action required.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      modeBStatus: 'capture_lost',
      modeBMessage: 'Izin capture layar Android terputus. Tekan Minta Ulang Share Layar.',
      modeBStreaming: true,
      bitrateKbps: 980,
    },
  },
  {
    id: 'mb_reshare_waiting',
    mode: 'mode_b',
    label: 'Reshare Waiting',
    summary: 'Waiting for user to approve Android Screen Capture reshare prompt.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      modeBStatus: 'reshare_waiting',
      modeBMessage: 'Menunggu persetujuan share layar ulang dari dialog sistem Android.',
      modeBStreaming: true,
      bitrateKbps: 920,
    },
  },
  {
    id: 'mb_error',
    mode: 'mode_b',
    label: 'Encoder Error / Disconnected',
    summary: 'RTMP ingest connection failed; ready to retry once network/key verified.',
    patch: {
      rtmpUrlConfigured: true,
      rtmpStreamKeyConfigured: true,
      modeBStatus: 'error',
      modeBMessage: 'Koneksi RTMP terputus dari server ingest. Periksa endpoint lalu mulai ulang.',
      modeBStreaming: false,
      bitrateKbps: null,
    },
  },
];

export interface DashboardAlternativeMeta {
  id: DashboardAlternativeId;
  code: string;
  name: string;
  subtitle: string;
  hierarchyThesis: string;
  density: 'Low–Balanced' | 'High Precision' | 'Ultra-Minimal' | 'Adaptive Balanced';
  desktopLayout: string;
  mobileStrategy: string;
  recoveryPlacement: string;
  strengths: string[];
  tradeoffs: string[];
}

export const DASHBOARD_ALTERNATIVES: DashboardAlternativeMeta[] = [
  {
    id: 'A',
    code: 'DASH-A',
    name: 'Executive Command',
    subtitle: 'Focal Hierarchy · Authoritative Control Deck',
    hierarchyThesis:
      'Isolates one unmistakable primary operational status and command surface, supported by a restrained 3-column hairline telemetry strip and quiet HUD/Audio footer.',
    density: 'Low–Balanced',
    desktopLayout: 'Centered editorial command hero + 3-column hairline telemetry strip + quiet bottom strip',
    mobileStrategy: 'Single-column thumb command deck at top, tabular 3-row hairline stats, compact HUD/Audio bar',
    recoveryPlacement: 'Inline top-edge alert rail anchored immediately above the primary CTA',
    strengths: [
      'Fastest 1-second scan: unmistakable session state and primary CTA on both 1280px and 360px',
      'Generous breathing room drastically lowers pre-stream anxiety and cognitive clutter',
      'Cleanest visual restraint honoring D+ obsidian/porcelain luxury surface discipline',
    ],
    tradeoffs: [
      'Hardware readiness details require reading a compact inline summary or expanding a check drawer',
      'Power users monitoring multiple indicators simultaneously may prefer Broadcast Overview (B)',
    ],
  },
  {
    id: 'B',
    code: 'DASH-B',
    name: 'Broadcast Overview',
    subtitle: 'Control-Console Grid · Technical Clarity',
    hierarchyThesis:
      'Organizes mode, transport/encoder state, honest source readiness, telemetry, and warnings into crisp recessed bays with tabular-nums alignment.',
    density: 'High Precision',
    desktopLayout: 'Master status command header + 12-column asymmetrical console grid (7 col pipeline / 5 col readiness & bus)',
    mobileStrategy: 'Compact sticky status header + stacked tabular instrument bays keeping labels and values aligned',
    recoveryPlacement: 'Dedicated top status bus banner plus pinned warning bay inside the active pipeline column',
    strengths: [
      'Highest instant situational awareness across all 4 Mode A honest indicators and Mode B ingest state',
      'Makes unchecked hardware/permissions ("Belum diperiksa") explicit without needing extra taps',
      'Immediately familiar to experienced OBS / mobile switcher operators',
    ],
    tradeoffs: [
      'Higher vertical scroll length on 360×800 Android screens because every bay stays visible',
      'Denser technical typography feels less serene for casual creators',
    ],
  },
  {
    id: 'C',
    code: 'DASH-C',
    name: 'Minimal Focus',
    subtitle: 'Active-Mode Only · Progressive Disclosure',
    hierarchyThesis:
      'Renders strictly what belongs to the active mode and hides secondary diagnostics behind calm bordered accordions, keeping primary actions effortless.',
    density: 'Ultra-Minimal',
    desktopLayout: 'Focused single-column center stage (max-w-3xl) with pure typographic readout + collapsible diagnostics',
    mobileStrategy: 'Fits mode toggle, honest status, primary action, HUD/Host Wait, and core readout above 360×800 fold',
    recoveryPlacement: 'Subtle single action callout appears only when a blocking or degraded condition occurs',
    strengths: [
      'Zero distraction while live — displays only the essential numbers and 1–2 immediate thumb actions',
      'Best above-the-fold fit on narrow 360×800 Android phones without losing any required control',
      'Dramatically reduces visual noise when idle or smoothly streaming',
    ],
    tradeoffs: [
      'Checking hardware permissions or full 4-state Mode A matrix takes 1 tap to expand the disclosure drawer',
      'Leaves more empty lateral margin on wide 1280px desktop displays',
    ],
  },
  {
    id: 'D',
    code: 'DASH-D',
    name: 'Adaptive Operations',
    subtitle: 'Context-Aware Hybrid · Balanced Rhythm',
    hierarchyThesis:
      'Adapts panel prominence to runtime state: serene two-column asymmetry when standby or healthy, while dynamically elevating recovery/permission docks when degraded.',
    density: 'Adaptive Balanced',
    desktopLayout: 'Balanced 8/4 operational split (Left: Hero + 4-state matrix + HUD/Audio; Right: Scene & Readiness dock)',
    mobileStrategy: 'State-driven vertical rhythm: warning/recovery promotes to top when active; otherwise calm Hero -> Matrix -> Drawer',
    recoveryPlacement: 'Adaptive priority slot — hidden when healthy, elevated right above hero when action is needed',
    strengths: [
      'Balances calm luxury aesthetic with full operational honesty across both Mode A and Mode B',
      'Surfaces recovery actions (Screen Reshare, Overlay Permission, Missing Stream Key) exactly when needed without cluttering normal runs',
      'Cohesive structural rhythm matching D+ Studio and Live Center modules',
    ],
    tradeoffs: [
      'Slightly more structural variation between healthy and warning states than static layouts',
      'Desktop 8/4 grid relies on the right rail scrolling cleanly on ultra-short browser panes',
    ],
  },
];

export function computeModeAHonestIndicators(s: DashboardScenarioState): {
  accountLinked: HonestIndicatorItem;
  modeASession: HonestIndicatorItem;
  roomStatus: HonestIndicatorItem;
  eventTransport: HonestIndicatorItem;
  hasValidTarget: boolean;
} {
  const cleanUser = s.targetUsername.trim().replace(/^@+/, '');
  const hasValidTarget = cleanUser.length > 0;

  const accountLinked: HonestIndicatorItem = s.accountLinked
    ? { label: 'Terhubung', detail: 'OAuth TikTok aktif', tone: 'ok' }
    : { label: 'Opsional (Tidak terhubung)', detail: 'Tidak wajib untuk Direct WS', tone: 'neutral' };

  const modeASession: HonestIndicatorItem =
    s.modeASessionMode === 'with_live_connector'
      ? { label: 'Aktif + Koneksi LIVE', detail: 'Foreground companion & listener berjalan', tone: 'ok' }
      : s.modeASessionMode === 'without_live_connection'
      ? { label: 'Aktif Tanpa Koneksi LIVE', detail: 'Overlay lokal berjalan tanpa event LIVE', tone: 'warn' }
      : { label: 'Tidak Aktif', detail: 'Companion standby', tone: 'neutral' };

  const roomStatusMap: Record<ModeARoomStatus, HonestIndicatorItem> = {
    unknown: { label: 'Belum diperiksa', detail: 'Menunggu resolusi room LIVE', tone: 'neutral' },
    not_live: { label: 'Akun belum LIVE', detail: `@${cleanUser || 'target'} belum menyalakan LIVE`, tone: 'warn' },
    live: { label: 'LIVE Aktif', detail: s.roomId ? `Room ${s.roomId}` : 'Room terdeteksi LIVE', tone: 'ok' },
    not_found: { label: 'Akun tidak ditemukan', detail: 'Periksa @username target', tone: 'error' },
    unreadable: { label: 'Room tidak terbaca', detail: 'Data room gagal dibaca saat ini', tone: 'warn' },
  };

  const transportMap: Record<ModeATransportState, HonestIndicatorItem> = {
    disconnected: { label: 'Terputus', detail: 'Belum ada koneksi event WebSocket', tone: 'neutral' },
    resolving_room: { label: 'Mencari Room...', detail: 'Mengambil metadata room LIVE TikTok', tone: 'warn' },
    connecting_direct: { label: 'Menghubungkan Direct...', detail: 'Membuka Direct TikTok WebSocket', tone: 'warn' },
    connected_direct: { label: 'Direct WS Terhubung', detail: 'Menerima chat, gift & follow real-time', tone: 'ok' },
    connecting_euler: { label: 'Menghubungkan Euler...', detail: 'Membuka EulerStream WebSocket', tone: 'warn' },
    connected_euler: { label: 'Euler WS Terhubung', detail: 'Menerima event melalui EulerStream', tone: 'ok' },
    waiting_for_live: { label: 'Menunggu LIVE', detail: 'Polling otomatis hingga host mulai LIVE', tone: 'warn' },
    reconnecting: { label: 'Menyambung Ulang...', detail: 'Pemulihan otomatis WebSocket aktif', tone: 'warn' },
    error: { label: 'Gagal Terhubung', detail: s.modeAMessage || 'Periksa username atau jaringan', tone: 'error' },
  };

  return {
    accountLinked,
    modeASession,
    roomStatus: roomStatusMap[s.modeARoomStatus],
    eventTransport: transportMap[s.modeATransportState],
    hasValidTarget,
  };
}

export function computeModeBStateMeta(s: DashboardScenarioState): {
  statusLabel: string;
  tone: 'neutral' | 'ok' | 'warn' | 'error';
  rtmpValid: boolean;
  canStart: boolean;
  canStop: boolean;
  canToggleHostWait: boolean;
  needsScreenReshare: boolean;
  bitrateDisplay: string;
} {
  const rtmpValid = s.rtmpUrlConfigured && s.rtmpStreamKeyConfigured;
  const isBusy = s.modeBStatus === 'starting' || s.modeBStatus === 'connecting' || s.modeBStatus === 'stopping' || s.modeBStatus === 'resharing';
  const isActive =
    s.modeBStatus === 'live' ||
    s.modeBStatus === 'host_wait' ||
    s.modeBStatus === 'capture_lost' ||
    s.modeBStatus === 'reshare_waiting' ||
    s.modeBStatus === 'resharing';

  const labelMap: Record<ModeBStreamStatus, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'error' }> = {
    idle: { label: 'Siap (Idle)', tone: 'neutral' },
    starting: { label: 'Memulai Encoder...', tone: 'warn' },
    connecting: { label: 'Menghubungkan RTMP...', tone: 'warn' },
    live: { label: 'RTMP LIVE', tone: 'ok' },
    host_wait: { label: 'Host Wait Aktif', tone: 'warn' },
    stopping: { label: 'Menghentikan...', tone: 'warn' },
    stopped: { label: 'Dihentikan', tone: 'neutral' },
    disconnected: { label: 'RTMP Terputus', tone: 'error' },
    capture_lost: { label: 'Capture Layar Terputus', tone: 'error' },
    reshare_waiting: { label: 'Menunggu Share Layar Ulang', tone: 'warn' },
    resharing: { label: 'Memulihkan Share Layar...', tone: 'warn' },
    error: { label: 'Error Encoder', tone: 'error' },
  };

  const info = labelMap[s.modeBStatus];
  const canStart = rtmpValid && !isBusy && !isActive && s.notificationPermissionGranted !== false;
  const canStop =
    s.modeBStatus === 'live' ||
    s.modeBStatus === 'host_wait' ||
    s.modeBStatus === 'connecting' ||
    s.modeBStatus === 'starting' ||
    s.modeBStatus === 'capture_lost' ||
    s.modeBStatus === 'reshare_waiting';
  const canToggleHostWait = s.modeBStatus === 'live' || s.modeBStatus === 'host_wait';
  const needsScreenReshare = s.modeBStatus === 'capture_lost' || s.modeBStatus === 'reshare_waiting';
  const bitrateDisplay =
    s.modeBStreaming && typeof s.bitrateKbps === 'number' && s.bitrateKbps > 0
      ? `${s.bitrateKbps.toLocaleString('en-US')} kbps`
      : '—';

  return {
    statusLabel: info.label,
    tone: info.tone,
    rtmpValid,
    canStart,
    canStop,
    canToggleHostWait,
    needsScreenReshare,
    bitrateDisplay,
  };
}
