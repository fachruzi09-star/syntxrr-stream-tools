import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppSettings,
  ResolutionTarget,
  FrameRate,
  PerformanceProfile,
  AppLanguage,
  AppTheme,
  HudPosition,
} from '../types';
import {
  Settings,
  Monitor,
  Cpu,
  Battery,
  Database,
  Download,
  Upload,
  RotateCcw,
  ShieldAlert,
  Info,
  Check,
  Eye,
  EyeOff,
  Flame,
  Radio,
  FileCode,
  Music2,
  KeyRound,
  ExternalLink,
  Volume2,
  Mic,
  Languages,
  Palette,
  Vibrate,
  Sparkles,
  Gauge,
  PanelRight,
  SlidersHorizontal,
  Activity,
  HardDrive,
  Trash2,
  Copy,
  RefreshCw,
  Smartphone,
  AlertTriangle,
  Play,
  Square,
  Layers,
  Lock,
  Wifi,
} from 'lucide-react';
import {
  isNativeAndroid,
  checkOverlayPermission,
  requestOverlayPermission,
  showFloatingHud,
  hideFloatingHud,
} from '../services/nativeCompanionBridge';

/* ============================================================================
 * STATUS BADGES
 * Setiap fitur wajib menyatakan status sebenarnya. Tidak ada klaim palsu.
 * ========================================================================== */

type UiStatus =
  | 'functional'
  | 'stored'
  | 'pending'
  | 'not_connected'
  | 'coming_soon'
  | 'not_supported';

const STATUS_UI: Record<UiStatus, { label: string; className: string }> = {
  functional: { label: 'Berfungsi', className: 'text-emerald-400 bg-emerald-950/80 border-emerald-800' },
  stored: { label: 'Tersimpan', className: 'text-sky-300 bg-sky-950/80 border-sky-800' },
  pending: { label: 'Pending', className: 'text-amber-300 bg-amber-950/80 border-amber-800' },
  not_connected: { label: 'Belum Terhubung', className: 'text-orange-300 bg-orange-950/80 border-orange-800' },
  coming_soon: { label: 'Coming Soon', className: 'text-violet-300 bg-violet-950/80 border-violet-800' },
  not_supported: { label: 'Tidak Didukung', className: 'text-slate-400 bg-slate-900/80 border-slate-700' },
};

const StatusBadge: React.FC<{ status: UiStatus }> = ({ status }) => {
  const meta = STATUS_UI[status];
  return (
    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${meta.className}`}>
      {meta.label}
    </span>
  );
};

/* ============================================================================
 * PRIMITIVES
 * ========================================================================== */

const Section: React.FC<{
  index: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ index, icon: Icon, title, subtitle, children }) => (
  <section className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
    <div>
      <div className="text-[10px] font-semibold tracking-wider text-blue-400 uppercase">Bagian {index}</div>
      <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mt-0.5">
        <Icon className="w-4 h-4 text-blue-400" />
        {title}
      </h2>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
    {children}
  </section>
);

const FieldRow: React.FC<{
  title: string;
  description?: string;
  status?: UiStatus;
  children?: React.ReactNode;
}> = ({ title, description, status, children }) => (
  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-white">{title}</div>
        {description && <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{description}</p>}
      </div>
      {status && <StatusBadge status={status} />}
    </div>
    {children}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative w-10 h-5 rounded-full transition shrink-0 ${
      checked ? 'bg-blue-600' : 'bg-slate-700'
    }`}
  >
    <span
      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
        checked ? 'left-[22px]' : 'left-0.5'
      }`}
    />
  </button>
);

interface SegmentedOption<T> {
  value: T;
  label: string;
  hint?: string;
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  columns = 'grid-cols-3',
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  columns?: string;
}) {
  return (
    <div className={`grid gap-2 ${columns}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 border ${
              active
                ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30'
                : 'bg-[#080c16] text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <span>{option.label}</span>
            {option.hint && <span className="text-[9px] font-normal opacity-80">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
  <div>
    <label className="block text-slate-300 font-medium mb-1">
      {label} ({value}
      {suffix ? ` ${suffix}` : ''})
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-blue-500"
    />
  </div>
);

/* ============================================================================
 * HELPERS
 * ========================================================================== */

interface DeviceTestResult {
  cores: number | null;
  memoryGB: number | null;
  platform: string;
  webglRenderer: string | null;
  maxTextureSize: number | null;
  recommendedResolution: ResolutionTarget;
  recommendedFrameRate: FrameRate;
  recommendedBitrateKbps: number;
  testedAt: number;
}

function recommendProfile(
  cores: number | null,
  memoryGB: number | null
): { resolution: ResolutionTarget; frameRate: FrameRate; bitrateKbps: number } {
  const c = cores ?? 4;
  const m = memoryGB ?? 4;
  if (c >= 8 && m >= 6) return { resolution: '1080p', frameRate: 60, bitrateKbps: 6000 };
  if (c >= 6 && m >= 4) return { resolution: '1080p', frameRate: 30, bitrateKbps: 4500 };
  return { resolution: '720p', frameRate: 30, bitrateKbps: 2500 };
}

function computeWarnings(settings: AppSettings): string[] {
  const warnings: string[] = [];
  if (settings.targetResolution === '1440p' && settings.frameRate === 60) {
    warnings.push('1440p @ 60 FPS sangat berat untuk sebagian besar ponsel: risiko frame drop dan panas berlebih.');
  }
  if (settings.videoBitrateKbps > 8000) {
    warnings.push('Bitrate video di atas 8000 Kbps sering tidak stabil pada jaringan seluler.');
  }
  if (settings.targetResolution === '720p' && settings.videoBitrateKbps > 6000) {
    warnings.push('Bitrate 6000+ Kbps berlebihan untuk 720p: boros bandwidth tanpa tambahan kualitas berarti.');
  }
  if (settings.targetResolution === '1440p' && settings.videoBitrateKbps < 6000) {
    warnings.push('1440p dengan bitrate di bawah 6000 Kbps akan terlihat pecah.');
  }
  if (settings.frameRate === 60 && settings.performanceProfile === 'battery_saver') {
    warnings.push('60 FPS dengan profil Hemat Baterai saling bertentangan.');
  }
  return warnings;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

const APP_VERSION = '3.0.0';

const OSS_COMPONENTS = [
  { name: 'React / React DOM', license: 'MIT' },
  { name: 'Vite', license: 'MIT' },
  { name: 'Capacitor', license: 'MIT' },
  { name: 'Tailwind CSS', license: 'MIT' },
  { name: 'lucide-react', license: 'ISC' },
  { name: 'motion', license: 'MIT' },
  { name: 'Express', license: 'MIT' },
  { name: '@google/genai', license: 'Apache-2.0' },
];

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

type SaveStatusKind = 'pending' | 'success' | 'error';

interface SaveStatus {
  message: string;
  kind: SaveStatusKind;
}

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => Promise<boolean>;
  onExportData: () => Promise<void>;
  onImportData: (json: string) => Promise<boolean>;
  onResetDefaults: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onExportData,
  onImportData,
  onResetDefaults,
}) => {
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [showYouTubeKey, setShowYouTubeKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 2: status hanya ditampilkan setelah persistensi benar-benar selesai.
  const latestSettingsRef = useRef(settings);
  const statusTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // Device performance test
  const [deviceTest, setDeviceTest] = useState<DeviceTestResult | null>(null);
  const [deviceTestRunning, setDeviceTestRunning] = useState(false);

  // Microphone
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micTestActive, setMicTestActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);

  // System
  const [permissionState, setPermissionState] = useState<Record<string, string>>({});
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null);
  const [overlayGranted, setOverlayGranted] = useState<boolean | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);

  // Floating HUD
  const [hudMessage, setHudMessage] = useState<string | null>(null);

  const nativeAndroid = useMemo(() => isNativeAndroid(), []);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    };
  }, []);

  const showSaveStatus = (message: string, kind: SaveStatusKind) => {
    if (!isMountedRef.current) return;
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = null;
    setSaveStatus({ message, kind });
    if (kind === 'pending') return;
    statusTimerRef.current = window.setTimeout(
      () => {
        statusTimerRef.current = null;
        if (isMountedRef.current) setSaveStatus(null);
      },
      kind === 'error' ? 6000 : 2000
    );
  };

  const persistSettings = async (next: AppSettings) => {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    showSaveStatus('Menyimpan…', 'pending');
    const success = await onUpdateSettings(next);
    // Hasil dari permintaan yang sudah usang tidak boleh menimpa status terbaru.
    if (!isMountedRef.current || requestId !== saveRequestIdRef.current) return;
    if (success) {
      showSaveStatus('Tersimpan', 'success');
    } else {
      showSaveStatus('Gagal menyimpan — perubahan belum tersimpan di perangkat', 'error');
    }
  };

  const handleUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...latestSettingsRef.current, [key]: value };
    latestSettingsRef.current = updated;
    void persistSettings(updated);
  };

  // Satu penulisan untuk beberapa field (dipakai Auto Apply dan preset).
  const handleUpdateMany = (patch: Partial<AppSettings>) => {
    const updated = { ...latestSettingsRef.current, ...patch };
    latestSettingsRef.current = updated;
    void persistSettings(updated);
  };

  /* ------------------------------------------------------------------ MIC */

  const stopMicTest = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current) {
      void micCtxRef.current.close().catch(() => undefined);
      micCtxRef.current = null;
    }
    setMicLevel(0);
    setMicTestActive(false);
  }, []);

  useEffect(() => () => stopMicTest(), [stopMicTest]);

  const refreshMicDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devices.filter((device) => device.kind === 'audioinput'));
    } catch {
      setMicDevices([]);
    }
  }, []);

  useEffect(() => {
    void refreshMicDevices();
  }, [refreshMicDevices]);

  const startMicTest = async () => {
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Perangkat ini tidak menyediakan akses mikrofon melalui WebView.');
      return;
    }
    try {
      const current = latestSettingsRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: current.microphoneDeviceId ? { exact: current.microphoneDeviceId } : undefined,
          noiseSuppression: !!current.noiseSuppression,
          echoCancellation: !!current.micEchoCancellation,
          autoGainControl: !!current.micAutoGainControl,
        },
      });
      micStreamRef.current = stream;

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        setMicError('Web Audio API tidak tersedia pada WebView ini.');
        stream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        return;
      }

      const ctx = new Ctor();
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      setMicTestActive(true);
      const loop = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const sample = (buffer[i] - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const gain = (latestSettingsRef.current.micGain ?? 100) / 100;
        setMicLevel(Math.min(100, Math.round(rms * 260 * gain)));
        micRafRef.current = requestAnimationFrame(loop);
      };
      loop();
      void refreshMicDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'tidak diketahui';
      setMicError(`Gagal mengakses mikrofon: ${message}`);
      stopMicTest();
    }
  };

  /* ----------------------------------------------------------- PERMISSIONS */

  const refreshPermissions = useCallback(async () => {
    const next: Record<string, string> = {};
    const names: Array<'camera' | 'microphone'> = ['camera', 'microphone'];
    for (const name of names) {
      try {
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: name as PermissionName });
          next[name] = status.state;
        } else {
          next[name] = 'tidak dapat diperiksa';
        }
      } catch {
        next[name] = 'tidak dapat diperiksa';
      }
    }
    next.notifications = typeof Notification !== 'undefined' ? Notification.permission : 'tidak tersedia';
    setPermissionState(next);
  }, []);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const requestMediaPermission = async (kind: 'camera' | 'microphone') => {
    setPermissionBusy(kind);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionState((prev) => ({ ...prev, [kind]: 'tidak tersedia' }));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'camera' ? { video: true } : { audio: true }
      );
      stream.getTracks().forEach((track) => track.stop());
      await refreshPermissions();
      void refreshMicDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ditolak';
      setPermissionState((prev) => ({ ...prev, [kind]: `ditolak — ${message}` }));
    } finally {
      setPermissionBusy(null);
    }
  };

  const requestNotification = async () => {
    if (typeof Notification === 'undefined') {
      setPermissionState((prev) => ({ ...prev, notifications: 'tidak tersedia' }));
      return;
    }
    try {
      await Notification.requestPermission();
    } catch {
      /* diabaikan: status akan dibaca ulang di bawah */
    }
    await refreshPermissions();
  };

  const refreshOverlayPermission = useCallback(async () => {
    if (!isNativeAndroid()) {
      setOverlayGranted(null);
      return;
    }
    const result = await checkOverlayPermission();
    setOverlayGranted(!!result?.granted);
  }, []);

  useEffect(() => {
    void refreshOverlayPermission();
  }, [refreshOverlayPermission]);

  const askOverlayPermission = async () => {
    const result = await requestOverlayPermission();
    setOverlayGranted(!!result?.granted);
  };

  /* --------------------------------------------------------------- STORAGE */

  const refreshStorage = useCallback(async () => {
    try {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorageInfo({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
      }
    } catch {
      setStorageInfo(null);
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  const clearAppCache = async () => {
    try {
      if (typeof caches === 'undefined') {
        setCacheMessage('Cache Storage tidak tersedia pada lingkungan ini.');
        return;
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      setCacheMessage(
        `${keys.length} entri cache aplikasi dihapus. Data IndexedDB, preset, dan pengaturan tidak diubah.`
      );
      void refreshStorage();
    } catch {
      setCacheMessage('Gagal membersihkan cache aplikasi.');
    }
  };

  /* ---------------------------------------------------------- DEVICE TEST */

  const runDeviceTest = () => {
    setDeviceTestRunning(true);
    try {
      let webglRenderer: string | null = null;
      let maxTextureSize: number | null = null;
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const raw = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            if (typeof raw === 'string') webglRenderer = raw;
          }
          const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
          if (typeof maxTex === 'number') maxTextureSize = maxTex;
        }
      } catch {
        /* WebGL tidak tersedia — dibiarkan null, bukan ditebak */
      }

      const cores =
        typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
      const memoryCandidate = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      const memoryGB = typeof memoryCandidate === 'number' ? memoryCandidate : null;
      const recommendation = recommendProfile(cores, memoryGB);

      const result: DeviceTestResult = {
        cores,
        memoryGB,
        platform: navigator.platform || 'tidak diketahui',
        webglRenderer,
        maxTextureSize,
        recommendedResolution: recommendation.resolution,
        recommendedFrameRate: recommendation.frameRate,
        recommendedBitrateKbps: recommendation.bitrateKbps,
        testedAt: Date.now(),
      };
      setDeviceTest(result);

      if (latestSettingsRef.current.autoApplyRecommendations) {
        handleUpdateMany({
          targetResolution: recommendation.resolution,
          frameRate: recommendation.frameRate,
          videoBitrateKbps: recommendation.bitrateKbps,
        });
      }
    } finally {
      setDeviceTestRunning(false);
    }
  };

  const applyRecommendations = () => {
    if (!deviceTest) return;
    handleUpdateMany({
      targetResolution: deviceTest.recommendedResolution,
      frameRate: deviceTest.recommendedFrameRate,
      videoBitrateKbps: deviceTest.recommendedBitrateKbps,
    });
  };

  /* ------------------------------------------------------------- BACKUP */

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) {
        showSaveStatus('File cadangan kosong atau tidak dapat dibaca', 'error');
        return;
      }
      const success = await onImportData(content);
      if (!isMountedRef.current) return;
      if (success) {
        showSaveStatus('Cadangan dipulihkan — kredensial perangkat ini dipertahankan', 'success');
      } else {
        showSaveStatus('Gagal memulihkan cadangan: format JSON tidak valid', 'error');
      }
    };
    reader.onerror = () => {
      showSaveStatus('Gagal membaca file cadangan', 'error');
    };
    reader.readAsText(file);
  };

  /* --------------------------------------------------------- DIAGNOSTICS */

  const diagnosticsLines = [
    `Aplikasi: SYNTXRR STREAM ${APP_VERSION}`,
    `Package: com.syntxrr.streamtools`,
    `Runtime native Android: ${nativeAndroid ? 'ya' : 'tidak'}`,
    `Platform: ${navigator.platform || 'tidak diketahui'}`,
    `Logical cores: ${deviceTest?.cores ?? navigator.hardwareConcurrency ?? 'tidak terbaca'}`,
    `Device memory: ${deviceTest?.memoryGB ?? 'tidak terbaca'} GB`,
    `WebGL renderer: ${deviceTest?.webglRenderer ?? 'tidak terbaca'}`,
    `Max texture: ${deviceTest?.maxTextureSize ?? 'tidak terbaca'}`,
    `Penyimpanan: ${storageInfo ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}` : 'tidak terbaca'}`,
    `Izin kamera: ${permissionState.camera ?? 'belum diperiksa'}`,
    `Izin mikrofon: ${permissionState.microphone ?? 'belum diperiksa'}`,
    `Izin notifikasi: ${permissionState.notifications ?? 'belum diperiksa'}`,
    `Overlay native: ${overlayGranted === null ? 'tidak berlaku / belum diperiksa' : overlayGranted ? 'diizinkan' : 'belum diizinkan'}`,
    `Mode aktif: ${settings.operatingMode}`,
    `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'tidak tersedia'}`,
  ];

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsLines.join('\n'));
      setDiagnosticsMessage('Diagnostik disalin ke clipboard.');
    } catch {
      setDiagnosticsMessage('Clipboard tidak tersedia; salin manual dari daftar di bawah.');
    }
  };

  /* --------------------------------------------------------------- RENDER */

  const warnings = computeWarnings(settings);
  const hudPanelMenus: Array<{ id: string; name: string; detail: string; status: UiStatus }> = [
    { id: 'chat', name: '1. Chat', detail: 'Chat, gift, penonton, dan aktivitas LIVE.', status: 'not_connected' },
    { id: 'soundboard', name: '2. Soundboard', detail: '4–6 suara favorit yang bersumber dari Studio.', status: 'pending' },
    { id: 'music', name: '3. Music', detail: 'Lagu aktif, antrean, riwayat, Song Request, dan volume.', status: 'pending' },
    { id: 'mixer', name: '4. Audio Mixer', detail: 'Master, Music, Soundboard, Mic, dan Mute.', status: 'pending' },
    { id: 'live', name: '5. Live Control', detail: 'Pause, Resume, Stop — hanya jika mode yang dipilih benar-benar mendukung.', status: 'not_connected' },
    { id: 'settings', name: '6. Settings', detail: 'Membuka konfigurasi Floating HUD pada halaman Settings ini.', status: 'pending' },
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            Pengaturan Studio (Settings)
          </h1>
          <p className="text-xs text-slate-400">
            Satu halaman pengaturan — Umum, Audio, Floating HUD, Grafis, Sistem, dan Tentang
          </p>
        </div>

        {saveStatus && (
          <span
            role="status"
            aria-live="polite"
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto border ${
              saveStatus.kind === 'success'
                ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800'
                : saveStatus.kind === 'error'
                  ? 'text-red-300 bg-red-950/80 border-red-800'
                  : 'text-slate-300 bg-slate-900/80 border-slate-700'
            }`}
          >
            {saveStatus.kind === 'success' ? (
              <Check className="w-4 h-4" />
            ) : saveStatus.kind === 'error' ? (
              <ShieldAlert className="w-4 h-4" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            {saveStatus.message}
          </span>
        )}
      </div>

      {/* ================================ A. GENERAL ================================ */}
      <Section
        index="A"
        icon={SlidersHorizontal}
        title="Umum (General)"
        subtitle="Bahasa, tema tampilan, umpan balik getar, dan konfirmasi sebelum mengakhiri siaran"
      >
        <FieldRow
          title="Bahasa Antarmuka"
          description="Preferensi bahasa disimpan di perangkat. Pelokalan penuh seluruh string UI belum aktif, sehingga antarmuka masih tampil dalam Bahasa Indonesia."
          status="pending"
        >
          <Segmented<AppLanguage>
            options={[
              { value: 'id-ID', label: 'Indonesia', hint: 'id-ID' },
              { value: 'en-US', label: 'English', hint: 'en-US' },
            ]}
            columns="grid-cols-2"
            value={(settings.language ?? 'id-ID') as AppLanguage}
            onChange={(value) => handleUpdate('language', value)}
          />
        </FieldRow>

        <FieldRow
          title="Tema Tampilan"
          description="Preferensi tema tersimpan, tetapi penerapan visual global (token warna) belum terhubung ke seluruh komponen."
          status="not_connected"
        >
          <Segmented<AppTheme>
            options={[
              { value: 'navy_dark', label: 'Navy Dark', hint: 'Bawaan' },
              { value: 'obsidian_dark', label: 'Obsidian', hint: 'Gelap pekat' },
              { value: 'cyber_slate', label: 'Cyber Slate', hint: 'Kontras tinggi' },
            ]}
            value={(settings.theme ?? 'navy_dark') as AppTheme}
            onChange={(value) => handleUpdate('theme', value)}
          />
        </FieldRow>

        <FieldRow
          title="Umpan Balik Getar (Haptic Feedback)"
          description="Getaran singkat saat kontrol penting ditekan. Bergantung pada dukungan WebView/perangkat dan izin VIBRATE."
          status={
            typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
              ? 'functional'
              : 'not_supported'
          }
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.hapticFeedback ? 'Aktif' : 'Nonaktif'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator.vibrate === 'function') {
                    const ok = navigator.vibrate(50);
                    showSaveStatus(
                      ok ? 'Getar uji dikirim ke perangkat' : 'Perangkat menolak permintaan getar',
                      ok ? 'success' : 'error'
                    );
                  } else {
                    showSaveStatus('Perangkat ini tidak mendukung getar melalui WebView', 'error');
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
              >
                Uji Getar
              </button>
              <Toggle
                label="Umpan balik getar"
                checked={!!settings.hapticFeedback}
                onChange={(value) => handleUpdate('hapticFeedback', value)}
              />
            </div>
          </div>
        </FieldRow>

        <FieldRow
          title="Konfirmasi Sebelum Mengakhiri LIVE"
          description="Preferensi tersimpan, namun aksi Stop LIVE di Live Control belum membaca nilai ini — konfirmasi belum diterapkan."
          status="pending"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.confirmBeforeEndLive ? 'Minta konfirmasi' : 'Akhiri langsung'}
            </span>
            <Toggle
              label="Konfirmasi sebelum mengakhiri LIVE"
              checked={!!settings.confirmBeforeEndLive}
              onChange={(value) => handleUpdate('confirmBeforeEndLive', value)}
            />
          </div>
        </FieldRow>
      </Section>

      {/* ========================= B. AUDIO & MICROPHONE ========================= */}
      <Section
        index="B"
        icon={Mic}
        title="Audio & Mikrofon"
        subtitle="Pemilihan perangkat input, tes level mikrofon, sensitivitas, dan pemrosesan suara"
      >
        <FieldRow
          title="Pemilihan Mikrofon"
          description="Daftar perangkat berasal dari enumerasi perangkat nyata. Label perangkat hanya terbaca setelah izin mikrofon diberikan."
          status="functional"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={settings.microphoneDeviceId ?? ''}
              onChange={(e) => handleUpdate('microphoneDeviceId', e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">Mikrofon bawaan sistem (default)</option>
              {micDevices.map((device, index) => (
                <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                  {device.label || `Mikrofon ${index + 1} (label perlu izin)`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refreshMicDevices()}
              className="px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Pemilihan ini dipakai oleh Tes Mikrofon di bawah. Pipeline encoder Mode B belum membaca
            nilai ini.
          </p>
        </FieldRow>

        <FieldRow
          title="Tes Mikrofon"
          description="Meter level nyata dari getUserMedia + AnalyserNode. Tidak ada hasil yang dibuat-buat: bila izin ditolak, error ditampilkan apa adanya."
          status="functional"
        >
          <div className="space-y-2">
            <div className="h-2.5 w-full rounded-full bg-[#0e1626] border border-slate-800 overflow-hidden">
              <div
                className={`h-full transition-[width] duration-75 ${
                  micLevel > 85 ? 'bg-red-500' : micLevel > 55 ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                style={{ width: `${micTestActive ? micLevel : 0}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              {micTestActive ? (
                <button
                  type="button"
                  onClick={stopMicTest}
                  className="px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-800 text-[11px] text-red-300 flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5" /> Hentikan Tes
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startMicTest()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-[11px] text-emerald-300 flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Mulai Tes Mikrofon
                </button>
              )}
              <span className="text-[11px] text-slate-500">
                {micTestActive ? `Level input: ${micLevel}%` : 'Tes tidak berjalan'}
              </span>
            </div>
            {micError && (
              <p className="text-[11px] text-red-300 flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {micError}
              </p>
            )}
          </div>
        </FieldRow>

        <FieldRow
          title="Sensitivitas / Gain Input"
          description="Penguatan diterapkan pada meter tes. Nilai belum memengaruhi encoder siaran."
          status="pending"
        >
          <SliderRow
            label="Gain mikrofon"
            value={settings.micGain ?? 100}
            min={0}
            max={200}
            step={5}
            suffix="%"
            onChange={(value) => handleUpdate('micGain', value)}
          />
        </FieldRow>

        <FieldRow
          title="Noise Suppression"
          description="Diterapkan sebagai constraint getUserMedia. Hanya aktif bila perangkat/WebView mendukungnya."
          status={
            typeof navigator !== 'undefined' &&
            navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression
              ? 'functional'
              : 'not_supported'
          }
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.noiseSuppression ? 'Aktif' : 'Nonaktif'}
            </span>
            <Toggle
              label="Noise suppression"
              checked={!!settings.noiseSuppression}
              onChange={(value) => handleUpdate('noiseSuppression', value)}
            />
          </div>
        </FieldRow>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Pengaturan Mikrofon Lanjutan</span>
            <StatusBadge status="functional" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">Echo Cancellation</div>
                <div className="text-[10px] text-slate-500">Mengurangi gema dari speaker perangkat.</div>
              </div>
              <Toggle
                label="Echo cancellation"
                checked={!!settings.micEchoCancellation}
                onChange={(value) => handleUpdate('micEchoCancellation', value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">Auto Gain Control</div>
                <div className="text-[10px] text-slate-500">
                  Menormalkan volume suara secara otomatis.
                </div>
              </div>
              <Toggle
                label="Auto gain control"
                checked={!!settings.micAutoGainControl}
                onChange={(value) => handleUpdate('micAutoGainControl', value)}
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            Kedua opsi diteruskan sebagai constraint getUserMedia saat Tes Mikrofon berjalan.
          </p>
        </div>
      </Section>

      {/* ============================ C. FLOATING HUD ============================ */}
      <Section
        index="C"
        icon={PanelRight}
        title="Floating HUD"
        subtitle="Tombol mengambang kecil dan panel satu tangan yang dipakai bersama Mode A dan Mode B"
      >
        <FieldRow
          title="Aktifkan Floating HUD"
          description="Preferensi tersimpan. Tombol di bawah memanggil bridge native Android yang sudah ada dan melaporkan hasil sebenarnya."
          status={nativeAndroid ? 'pending' : 'not_supported'}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.hudEnabled ? 'Aktif' : 'Nonaktif'}
            </span>
            <Toggle
              label="Aktifkan Floating HUD"
              checked={!!settings.hudEnabled}
              onChange={(value) => handleUpdate('hudEnabled', value)}
            />
          </div>
          {nativeAndroid ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const result = await showFloatingHud();
                  setHudMessage(result.message ?? 'Permintaan tampilkan HUD dikirim.');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
              >
                Tampilkan HUD Native
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await hideFloatingHud();
                  setHudMessage(result.message ?? 'Permintaan sembunyikan HUD dikirim.');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
              >
                Sembunyikan HUD Native
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Floating HUD native hanya tersedia pada APK Android. Di browser, preferensi tetap
              tersimpan.
            </p>
          )}
          {hudMessage && <p className="text-[11px] text-sky-300">{hudMessage}</p>}
        </FieldRow>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <SliderRow
              label="Ukuran Tombol"
              value={settings.hudButtonSize ?? 48}
              min={40}
              max={64}
              step={2}
              suffix="dp"
              onChange={(value) => handleUpdate('hudButtonSize', value)}
            />
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <SliderRow
              label="Transparansi"
              value={settings.hudOpacity ?? 92}
              min={30}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) => handleUpdate('hudOpacity', value)}
            />
          </div>
        </div>

        <FieldRow title="Posisi Tombol" description="Sisi layar tempat tombol mengambang berlabuh." status="stored">
          <Segmented<HudPosition>
            options={[
              { value: 'left', label: 'Kiri' },
              { value: 'right', label: 'Kanan' },
            ]}
            columns="grid-cols-2"
            value={(settings.hudPosition ?? 'right') as HudPosition}
            onChange={(value) => handleUpdate('hudPosition', value)}
          />
        </FieldRow>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Preferensi Tampilan Panel</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                { key: 'hudPanelChat', label: 'Chat' },
                { key: 'hudPanelSoundboard', label: 'Soundboard' },
                { key: 'hudPanelMusic', label: 'Music' },
                { key: 'hudPanelMixer', label: 'Audio Mixer' },
                { key: 'hudPanelLiveControl', label: 'Live Control' },
                { key: 'hudPanelSettings', label: 'Settings' },
              ] as const
            ).map((panel) => (
              <div
                key={panel.key}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800"
              >
                <span className="text-[11px] text-slate-300">{panel.label}</span>
                <Toggle
                  label={`Tampilkan menu ${panel.label}`}
                  checked={!!settings[panel.key]}
                  onChange={(value) => handleUpdate(panel.key, value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-white">Enam Menu Panel Floating HUD</div>
          <ul className="space-y-1.5">
            {hudPanelMenus.map((menu) => (
              <li key={menu.id} className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-200">{menu.name}</div>
                  <div className="text-[10px] text-slate-500 leading-snug">{menu.detail}</div>
                </div>
                <StatusBadge status={menu.status} />
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-slate-500">
            Spesifikasi enam menu ini dipertahankan. Panel native belum diverifikasi pada APK, sehingga
            statusnya ditandai jujur, bukan diklaim aktif.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-amber-900/60 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">Batas Kemampuan Mode</span>
          </div>
          <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-4">
            <li>
              <span className="text-slate-200 font-semibold">Mode A:</span> aplikasi TikTok resmi tetap
              yang menyiarkan LIVE. SYNTXRR STREAM hanya pendamping dan tidak boleh menampilkan
              Pause/Resume/Stop TikTok yang palsu.
            </li>
            <li>
              <span className="text-slate-200 font-semibold">Mode B:</span> kontrol encoder SYNTXRR hanya
              aktif setelah pipeline RTMP benar-benar tersedia. Saat ini belum ada.
            </li>
          </ul>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Aturan Stream Deck</span>
            <StatusBadge status="not_connected" />
          </div>
          <p className="text-[11px] text-slate-400">
            Aturan yang harus berlaku: <span className="text-slate-200">Stream Deck aktif → Floating HUD
            nonaktif</span>, dan <span className="text-slate-200">Stream Deck nonaktif → Floating HUD
            aktif</span>.
          </p>
          <p className="text-[11px] text-slate-500">
            Deteksi sesi Stream Deck belum tersedia, jadi status ini tidak disimulasikan dan HUD tidak
            diubah otomatis. Stream Deck tetap memiliki fiturnya sendiri di luar Settings.
          </p>
        </div>
      </Section>

      {/* ================= D. GRAPHICS & DEVICE PERFORMANCE ================= */}
      <Section
        index="D"
        icon={Monitor}
        title="Grafis & Performa Perangkat"
        subtitle="Uji perangkat, rekomendasi, kontrol manual resolusi/FPS/bitrate, dan peringatan risiko"
      >
        <FieldRow
          title="Uji Perangkat Otomatis"
          description="Membaca sinyal yang benar-benar tersedia: jumlah core logis, perkiraan memori, dan renderer WebGL. Uji termal serta encoder hardware native belum terhubung."
          status="pending"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runDeviceTest}
              disabled={deviceTestRunning}
              className="px-3 py-1.5 rounded-lg bg-blue-950/60 border border-blue-800 text-[11px] text-blue-200 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {deviceTestRunning ? 'Menguji…' : 'Jalankan Uji Perangkat'}
            </button>
            {deviceTest && (
              <span className="text-[11px] text-slate-500">
                Hasil uji: {new Date(deviceTest.testedAt).toLocaleTimeString('id-ID')}
              </span>
            )}
          </div>

          {deviceTest ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {[
                { label: 'Logical cores', value: deviceTest.cores ?? 'tidak terbaca' },
                { label: 'Device memory', value: deviceTest.memoryGB ? `${deviceTest.memoryGB} GB` : 'tidak terbaca' },
                { label: 'Max texture', value: deviceTest.maxTextureSize ?? 'tidak terbaca' },
                { label: 'Platform', value: deviceTest.platform },
                { label: 'WebGL renderer', value: deviceTest.webglRenderer ?? 'tidak terbaca' },
                { label: 'Rekomendasi', value: `${deviceTest.recommendedResolution} / ${deviceTest.recommendedFrameRate} FPS` },
              ].map((item) => (
                <div key={item.label} className="p-2 rounded-lg bg-[#0e1626] border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</div>
                  <div className="text-[11px] text-slate-200 font-mono break-words">{String(item.value)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Belum ada hasil uji. Tidak ada nilai yang ditampilkan sebelum pengujian dijalankan.
            </p>
          )}
          <p className="text-[10px] text-slate-500">
            Uji termal, profil encoder MediaCodec, dan benchmark hardware Android memerlukan modul
            native — statusnya Coming Soon.
          </p>
        </FieldRow>

        <FieldRow
          title="Rekomendasi Resolusi / FPS / Bitrate"
          description="Diturunkan dari core dan memori yang terbaca. Ini heuristik, bukan pengukuran performa sebenarnya."
          status={deviceTest ? 'stored' : 'pending'}
        >
          {deviceTest ? (
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-200">
                Resolusi: {deviceTest.recommendedResolution}
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-200">
                FPS: {deviceTest.recommendedFrameRate}
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-200">
                Bitrate: {deviceTest.recommendedBitrateKbps} Kbps
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              Jalankan Uji Perangkat untuk melihat rekomendasi.
            </p>
          )}
        </FieldRow>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Resolusi Manual</label>
            <Segmented<ResolutionTarget>
              options={[
                { value: '720p', label: '720p', hint: 'Hemat' },
                { value: '1080p', label: '1080p', hint: 'Disarankan' },
                { value: '1440p', label: '1440p', hint: 'Berat' },
              ]}
              value={settings.targetResolution}
              onChange={(value) => handleUpdate('targetResolution', value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">FPS Manual</label>
            <Segmented<FrameRate>
              options={[
                { value: 30, label: '30 FPS', hint: 'Hemat baterai' },
                { value: 60, label: '60 FPS', hint: 'Mulus' },
              ]}
              columns="grid-cols-2"
              value={settings.frameRate}
              onChange={(value) => handleUpdate('frameRate', value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <SliderRow
              label="Bitrate Video"
              value={settings.videoBitrateKbps}
              min={2500}
              max={9000}
              step={500}
              suffix="Kbps"
              onChange={(value) => handleUpdate('videoBitrateKbps', value)}
            />
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <SliderRow
              label="Bitrate Audio"
              value={settings.audioBitrateKbps}
              min={96}
              max={320}
              step={32}
              suffix="Kbps"
              onChange={(value) => handleUpdate('audioBitrateKbps', value)}
            />
          </div>
        </div>

        <FieldRow
          title="Auto Apply Rekomendasi"
          description="Saat aktif, hasil uji perangkat langsung ditulis ke resolusi, FPS, dan bitrate. Kontrol manual tetap aktif dan tidak pernah dikunci."
          status="functional"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.autoApplyRecommendations
                ? 'Aktif — rekomendasi diterapkan setelah uji selesai'
                : 'Nonaktif — rekomendasi hanya ditampilkan'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyRecommendations}
                disabled={!deviceTest}
                className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 disabled:opacity-50"
              >
                Terapkan Sekarang
              </button>
              <Toggle
                label="Auto apply rekomendasi"
                checked={!!settings.autoApplyRecommendations}
                onChange={(value) => handleUpdate('autoApplyRecommendations', value)}
              />
            </div>
          </div>
        </FieldRow>

        {warnings.length > 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/60 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4" /> Peringatan Konfigurasi
            </div>
            <ul className="text-[11px] text-amber-200/90 space-y-1 list-disc pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p className="text-[10px] text-amber-200/60">
              Ini peringatan jujur, bukan pembatasan. Nilai tetap dapat diubah.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> Tidak ada konfigurasi berisiko terdeteksi.
          </p>
        )}

        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Profil Performa &amp; Hardware</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                { id: 'battery_saver', name: 'Hemat Baterai', desc: 'Alokasi RAM minimal, suhu stabil', icon: Battery },
                { id: 'balanced', name: 'Seimbang', desc: 'Optimal untuk 1080p durasi panjang', icon: Cpu },
                { id: 'performance', name: 'Performa Maksimal', desc: 'Prioritas bitrate tinggi, latensi rendah', icon: Flame },
              ] as const
            ).map((profile) => {
              const Icon = profile.icon;
              const isSelected = settings.performanceProfile === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleUpdate('performanceProfile', profile.id as PerformanceProfile)}
                  className={`p-3.5 rounded-xl text-left border transition ${
                    isSelected
                      ? 'bg-blue-950/60 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                      : 'bg-[#080c16] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span className="text-xs font-bold text-white">{profile.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{profile.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-xs font-semibold text-white">Akselerasi Hardware GPU</div>
              <div className="text-[11px] text-slate-400">
                Gunakan MediaCodec H.264 / HEVC hardware jika tersedia di Android
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.hardwareAcceleration}
              onChange={(e) => handleUpdate('hardwareAcceleration', e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-[#080c16] border-slate-700 cursor-pointer"
            />
          </div>
        </div>

        {/* Output Mode B — dipertahankan */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Output Siaran Mode B (RTMP / RTMPS)</span>
            <StatusBadge status="not_connected" />
          </div>
          <div>
            <label className="block text-slate-300 font-medium mb-1 text-[11px]">URL Server RTMP</label>
            <input
              type="text"
              value={settings.rtmpServer}
              onChange={(e) => handleUpdate('rtmpServer', e.target.value)}
              placeholder="rtmp://live.twitch.tv/app"
              className="w-full px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium text-[11px]">Stream Key / Kunci Siaran</label>
              <button
                type="button"
                onClick={() => setShowStreamKey(!showStreamKey)}
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                {showStreamKey ? (
                  <>
                    <EyeOff className="w-3 h-3" /> Sembunyikan
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> Tampilkan
                  </>
                )}
              </button>
            </div>
            <input
              type={showStreamKey ? 'text' : 'password'}
              value={settings.streamKey}
              onChange={(e) => handleUpdate('streamKey', e.target.value)}
              placeholder="live_..."
              className="w-full px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <p className="text-[10px] text-slate-500">
            Kredensial disimpan per perangkat dan tidak pernah disertakan dalam file cadangan. Pipeline
            encoder RTMP belum tersedia, sehingga tombol siaran tidak disediakan di sini.
          </p>
        </div>
      </Section>

      {/* =============================== E. SYSTEM =============================== */}
      <Section
        index="E"
        icon={Lock}
        title="Sistem (System)"
        subtitle="Manajer izin, penyimpanan & cache, diagnostik, serta pencadangan data"
      >
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Permissions Manager</span>
            <StatusBadge status="functional" />
          </div>
          <p className="text-[10px] text-slate-500">
            Status dibaca dari Permissions API dan Notification API. Nilai tidak dapat dipalsukan.
          </p>

          <div className="space-y-2">
            {(
              [
                { key: 'camera', label: 'Kamera', kind: 'camera' as const },
                { key: 'microphone', label: 'Mikrofon', kind: 'microphone' as const },
              ]
            ).map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800"
              >
                <div>
                  <div className="text-[11px] font-semibold text-slate-200">{item.label}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {permissionState[item.key] ?? 'memeriksa…'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void requestMediaPermission(item.kind)}
                  disabled={permissionBusy === item.kind}
                  className="px-2.5 py-1 rounded-lg bg-[#080c16] border border-slate-700 text-[10px] text-slate-200 hover:border-blue-500 disabled:opacity-50"
                >
                  {permissionBusy === item.kind ? 'Meminta…' : 'Minta Izin'}
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">Notifikasi</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {permissionState.notifications ?? 'memeriksa…'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void requestNotification()}
                className="px-2.5 py-1 rounded-lg bg-[#080c16] border border-slate-700 text-[10px] text-slate-200 hover:border-blue-500"
              >
                Minta Izin
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">Overlay (Floating HUD)</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {overlayGranted === null
                    ? nativeAndroid
                      ? 'memeriksa…'
                      : 'hanya tersedia di APK Android'
                    : overlayGranted
                      ? 'diizinkan'
                      : 'belum diizinkan'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void askOverlayPermission()}
                disabled={!nativeAndroid}
                className="px-2.5 py-1 rounded-lg bg-[#080c16] border border-slate-700 text-[10px] text-slate-200 hover:border-blue-500 disabled:opacity-50"
              >
                {overlayGranted ? 'Periksa Ulang' : 'Minta Izin'}
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Penyimpanan &amp; Cache</span>
            <StatusBadge status={storageInfo ? 'functional' : 'pending'} />
          </div>
          {storageInfo ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Terpakai</span>
                <span className="font-mono">
                  {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#0e1626] border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{
                    width: `${Math.min(
                      100,
                      storageInfo.quota > 0 ? (storageInfo.usage / storageInfo.quota) * 100 : 0
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Perkiraan penyimpanan belum dapat dibaca.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void clearAppCache()}
              className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-red-500 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Bersihkan Cache Aplikasi
            </button>
            <button
              type="button"
              onClick={() => void refreshStorage()}
              className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Segarkan
            </button>
          </div>
          {cacheMessage && <p className="text-[11px] text-sky-300">{cacheMessage}</p>}
          <p className="text-[10px] text-slate-500">
            Hanya Cache Storage yang dihapus. IndexedDB (preset, antrean, pengaturan) tidak disentuh.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Diagnostik</span>
            <StatusBadge status="functional" />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg bg-[#0e1626] border border-slate-800 p-2">
            <ul className="space-y-0.5">
              {diagnosticsLines.map((line) => (
                <li key={line} className="text-[10px] text-slate-400 font-mono break-words">
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> Salin Diagnostik
          </button>
          {diagnosticsMessage && <p className="text-[11px] text-sky-300">{diagnosticsMessage}</p>}
        </div>

        {/* Pencadangan & Pemulihan — dipertahankan dari Phase 1/2 */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Pencadangan &amp; Pemulihan JSON</span>
            <StatusBadge status="functional" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onExportData}
              className="p-3 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-blue-500 text-white text-[11px] font-semibold flex items-center justify-center gap-2 transition"
            >
              <Download className="w-4 h-4 text-blue-400" /> Ekspor Cadangan
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center gap-2 transition"
            >
              <Upload className="w-4 h-4 text-emerald-400" /> Pulihkan Cadangan
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />
            <button
              type="button"
              onClick={onResetDefaults}
              className="p-3 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-red-500 text-red-400 text-[11px] font-semibold flex items-center justify-center gap-2 transition"
            >
              <RotateCcw className="w-4 h-4 text-red-400" /> Atur Ulang Pengaturan
            </button>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              File cadangan tidak memuat Stream Key, YouTube API key, maupun token Spotify. Kredensial
              hanya tersimpan di perangkat ini dan tidak pernah ditimpa oleh file cadangan pengguna lain.
            </span>
          </p>
        </div>

        {/* Kredensial integrasi — dipertahankan */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Kredensial Integrasi</span>
            <StatusBadge status="stored" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium text-[11px] flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-red-400" /> Kunci API YouTube Data v3
              </label>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
              >
                Dapatkan <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type={showYouTubeKey ? 'text' : 'password'}
                value={settings.youtubeApiKey || ''}
                onChange={(e) => handleUpdate('youtubeApiKey', e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-red-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowYouTubeKey(!showYouTubeKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title={showYouTubeKey ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showYouTubeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Digunakan murni untuk pencarian judul dan thumbnail video YouTube resmi.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium text-[11px] flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-emerald-400" /> Client ID Spotify Developer
              </label>
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                Portal <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="text"
              value={settings.spotifyClientId || ''}
              onChange={(e) => handleUpdate('spotifyClientId', e.target.value)}
              placeholder="Spotify Client ID 32-karakter..."
              className="w-full px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Memerlukan redirect URI yang diarahkan ke aplikasi ini untuk autentikasi PKCE.
            </p>
          </div>
        </div>
      </Section>

      {/* ================================ F. ABOUT ================================ */}
      <Section
        index="F"
        icon={Info}
        title="Tentang SYNTXRR"
        subtitle="Versi aplikasi, informasi pembaruan, dan lisensi komponen"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Versi Aplikasi</div>
            <div className="text-sm font-bold text-white">{APP_VERSION}</div>
            <div className="text-[10px] text-slate-500">Master Release</div>
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Application ID</div>
            <div className="text-[11px] font-mono text-blue-400 break-words">com.syntxrr.streamtools</div>
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Runtime</div>
            <div className="text-[11px] text-slate-200 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              {nativeAndroid ? 'Android (APK)' : 'Browser / Desktop'}
            </div>
          </div>
        </div>

        <FieldRow
          title="Informasi Pembaruan"
          description="Pemeriksaan versi terbaru dan unduhan pembaruan belum tersedia. Tidak ada klaim bahwa aplikasi sudah memeriksa pembaruan."
          status="coming_soon"
        >
          <p className="text-[11px] text-slate-500">
            Pembaruan saat ini didistribusikan manual melalui build APK/CI, bukan melalui pemeriksaan
            otomatis dari dalam aplikasi.
          </p>
        </FieldRow>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">Lisensi Komponen</span>
            <StatusBadge status="functional" />
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {OSS_COMPONENTS.map((component) => (
              <li
                key={component.name}
                className="flex items-center justify-between gap-2 text-[11px] text-slate-300 px-2 py-1 rounded-lg bg-[#0e1626] border border-slate-800"
              >
                <span className="truncate">{component.name}</span>
                <span className="font-mono text-[10px] text-slate-500 shrink-0">{component.license}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-slate-500">
            Daftar komponen open-source utama yang dipakai aplikasi ini. Teks lisensi lengkap tersedia di
            masing-masing paket.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#080c16] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
          <div>
            <span className="font-bold text-slate-200">SYNTXRR STREAM</span>
            <span className="text-slate-500 mx-2">·</span>
            <span>Versi {APP_VERSION}</span>
            <span className="text-slate-500 mx-2">·</span>
            <span className="font-mono text-blue-400">com.syntxrr.streamtools</span>
          </div>
          <div className="text-slate-500">Mobile Streaming Studio &amp; TikTok LIVE Companion</div>
        </div>
      </Section>
    </div>
  );
};
