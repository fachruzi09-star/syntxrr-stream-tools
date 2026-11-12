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
import { isHapticSupported, vibrateNow } from '../services/haptics';
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
  updateFloatingHud,
  hideFloatingHud,
} from '../services/nativeCompanionBridge';
import { applyTheme } from '../theme/themeEngine';
import { useTranslation } from '../i18n/I18nContext';

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
  const { t } = useTranslation();
  const meta = STATUS_UI[status];
  const label = t(`status.${status}`, meta.label);
  return (
    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${meta.className}`}>
      {label}
    </span>
  );
};

/* ============================================================================
 * PRIMITIVES
 * ========================================================================== */

const Section: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, children }) => {
  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
      <div>
        <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mt-0.5">
          <Icon className="w-4 h-4 text-blue-400" />
          {title}
        </h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
};

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

function computeWarnings(settings: AppSettings, isEnglish = false): string[] {
  const warnings: string[] = [];
  if (settings.targetResolution === '1440p' && settings.frameRate === 60) {
    warnings.push(
      isEnglish
        ? '1440p @ 60 FPS is very heavy for most mobile phones: risk of frame drops and overheating.'
        : '1440p @ 60 FPS sangat berat untuk sebagian besar ponsel: risiko frame drop dan panas berlebih.'
    );
  }
  if (settings.videoBitrateKbps > 8000) {
    warnings.push(
      isEnglish
        ? 'Video bitrate above 8000 Kbps is frequently unstable on cellular networks.'
        : 'Bitrate video di atas 8000 Kbps sering tidak stabil pada jaringan seluler.'
    );
  }
  if (settings.targetResolution === '720p' && settings.videoBitrateKbps > 6000) {
    warnings.push(
      isEnglish
        ? 'Bitrate 6000+ Kbps is excessive for 720p: bandwidth waste without significant quality gain.'
        : 'Bitrate 6000+ Kbps berlebihan untuk 720p: boros bandwidth tanpa tambahan kualitas berarti.'
    );
  }
  if (settings.targetResolution === '1440p' && settings.videoBitrateKbps < 6000) {
    warnings.push(
      isEnglish
        ? '1440p with bitrate under 6000 Kbps will appear pixelated.'
        : '1440p dengan bitrate di bawah 6000 Kbps akan terlihat pecah.'
    );
  }
  if (settings.frameRate === 60 && settings.performanceProfile === 'battery_saver') {
    warnings.push(
      isEnglish
        ? '60 FPS contradicts the Battery Saver profile.'
        : '60 FPS dengan profil Hemat Baterai saling bertentangan.'
    );
  }
  return warnings;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

const APP_VERSION = '1.0.0';
/** Versi dokumen spesifikasi Settings — bukan versi aplikasi. */
const SETTINGS_SPEC_VERSION = '4.0.0';

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
  const { t, isEnglish } = useTranslation();
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

  /**
   * Terapkan perubahan ukuran/opacity/sisi ke bubble native yang SEDANG tampil.
   * Tidak ada hide/show: native memakai updateViewLayout pada view yang sama, jadi
   * posisi geser pengguna dan status tampil tetap terjaga.
   */
  const hudAppearanceSignatureRef = useRef<string>('');
  useEffect(() => {
    const sizeDp = settings.hudButtonSize ?? 48;
    const opacity = settings.hudOpacity ?? 92;
    const position = (settings.hudPosition ?? 'right') as 'left' | 'right';
    const signature = `${sizeDp}|${opacity}|${position}`;
    if (hudAppearanceSignatureRef.current === signature) return;
    const isBaseline = hudAppearanceSignatureRef.current === '';
    hudAppearanceSignatureRef.current = signature;
    if (isBaseline) return; // nilai awal hanya dijadikan baseline, tidak dikirim
    void updateFloatingHud({ sizeDp, opacity, position }).catch(() => {});
  }, [settings.hudButtonSize, settings.hudOpacity, settings.hudPosition]);

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
    showSaveStatus(t('settings.saving', 'Menyimpan…'), 'pending');
    const success = await onUpdateSettings(next);
    // Hasil dari permintaan yang sudah usang tidak boleh menimpa status terbaru.
    if (!isMountedRef.current || requestId !== saveRequestIdRef.current) return;
    if (success) {
      showSaveStatus(t('settings.saved', 'Tersimpan'), 'success');
    } else {
      showSaveStatus(t('settings.saveFailed', 'Gagal menyimpan — perubahan belum tersimpan di perangkat'), 'error');
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
      setMicError(
        isEnglish
          ? 'This device does not provide microphone access through the WebView.'
          : 'Perangkat ini tidak menyediakan akses mikrofon melalui WebView.'
      );
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
      const message = error instanceof Error ? error.message : (isEnglish ? 'unknown' : 'tidak diketahui');
      setMicError(isEnglish ? `Failed to access microphone: ${message}` : `Gagal mengakses mikrofon: ${message}`);
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
          next[name] = isEnglish ? 'unable to check' : 'tidak dapat diperiksa';
        }
      } catch {
        next[name] = isEnglish ? 'unable to check' : 'tidak dapat diperiksa';
      }
    }
    next.notifications = typeof Notification !== 'undefined'
      ? Notification.permission
      : (isEnglish ? 'unavailable' : 'tidak tersedia');
    setPermissionState(next);
  }, [isEnglish]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const requestMediaPermission = async (kind: 'camera' | 'microphone') => {
    setPermissionBusy(kind);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionState((prev) => ({ ...prev, [kind]: isEnglish ? 'unavailable' : 'tidak tersedia' }));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'camera' ? { video: true } : { audio: true }
      );
      stream.getTracks().forEach((track) => track.stop());
      await refreshPermissions();
      void refreshMicDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : (isEnglish ? 'denied' : 'ditolak');
      setPermissionState((prev) => ({ ...prev, [kind]: isEnglish ? `denied — ${message}` : `ditolak — ${message}` }));
    } finally {
      setPermissionBusy(null);
    }
  };

  const requestNotification = async () => {
    if (typeof Notification === 'undefined') {
      setPermissionState((prev) => ({ ...prev, notifications: isEnglish ? 'unavailable' : 'tidak tersedia' }));
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
        setCacheMessage(isEnglish ? 'Cache Storage unavailable in this environment.' : 'Cache Storage tidak tersedia pada lingkungan ini.');
        return;
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      setCacheMessage(
        isEnglish
          ? `${keys.length} application cache entries cleared. IndexedDB data, presets, and settings unchanged.`
          : `${keys.length} entri cache aplikasi dihapus. Data IndexedDB, preset, dan pengaturan tidak diubah.`
      );
      void refreshStorage();
    } catch {
      setCacheMessage(isEnglish ? 'Failed to clear application cache.' : 'Gagal membersihkan cache aplikasi.');
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
        showSaveStatus(isEnglish ? 'Backup file is empty or unreadable' : 'File cadangan kosong atau tidak dapat dibaca', 'error');
        return;
      }
      const success = await onImportData(content);
      if (!isMountedRef.current) return;
      if (success) {
        showSaveStatus(isEnglish ? 'Backup restored — device credentials preserved' : 'Cadangan dipulihkan — kredensial perangkat ini dipertahankan', 'success');
      } else {
        showSaveStatus(isEnglish ? 'Failed to restore backup: invalid JSON format' : 'Gagal memulihkan cadangan: format JSON tidak valid', 'error');
      }
    };
    reader.onerror = () => {
      showSaveStatus(isEnglish ? 'Failed to read backup file' : 'Gagal membaca file cadangan', 'error');
    };
    reader.readAsText(file);
  };

  /* --------------------------------------------------------- DIAGNOSTICS */

  const diagnosticsLines = [
    `${isEnglish ? 'Application' : 'Aplikasi'}: SYNTXRR STREAM ${APP_VERSION}`,
    `Package: com.syntxrr.streamtools`,
    `${isEnglish ? 'Native Android runtime' : 'Runtime native Android'}: ${nativeAndroid ? (isEnglish ? 'yes' : 'ya') : (isEnglish ? 'no' : 'tidak')}`,
    `Platform: ${navigator.platform || (isEnglish ? 'unknown' : 'tidak diketahui')}`,
    `Logical cores: ${deviceTest?.cores ?? navigator.hardwareConcurrency ?? (isEnglish ? 'unreadable' : 'tidak terbaca')}`,
    `Device memory: ${deviceTest?.memoryGB ? `${deviceTest.memoryGB} GB` : (isEnglish ? 'unreadable' : 'tidak terbaca')}`,
    `WebGL renderer: ${deviceTest?.webglRenderer ?? (isEnglish ? 'unreadable' : 'tidak terbaca')}`,
    `Max texture: ${deviceTest?.maxTextureSize ?? (isEnglish ? 'unreadable' : 'tidak terbaca')}`,
    `${isEnglish ? 'Storage' : 'Penyimpanan'}: ${storageInfo ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}` : (isEnglish ? 'unreadable' : 'tidak terbaca')}`,
    `${isEnglish ? 'Camera permission' : 'Izin kamera'}: ${permissionState.camera ?? (isEnglish ? 'not checked' : 'belum diperiksa')}`,
    `${isEnglish ? 'Microphone permission' : 'Izin mikrofon'}: ${permissionState.microphone ?? (isEnglish ? 'not checked' : 'belum diperiksa')}`,
    `${isEnglish ? 'Notification permission' : 'Izin notifikasi'}: ${permissionState.notifications ?? (isEnglish ? 'not checked' : 'belum diperiksa')}`,
    `${isEnglish ? 'Overlay permission' : 'Izin overlay'}: ${overlayGranted === null ? (isEnglish ? 'not applicable / not checked' : 'tidak berlaku / belum diperiksa') : overlayGranted ? (isEnglish ? 'granted' : 'diizinkan') : (isEnglish ? 'not granted' : 'belum diizinkan')}`,
    `${isEnglish ? 'Active mode' : 'Mode aktif'}: ${settings.operatingMode}`,
    `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : (isEnglish ? 'unavailable' : 'tidak tersedia')}`,
  ];

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsLines.join('\n'));
      setDiagnosticsMessage(isEnglish ? 'Diagnostics copied to clipboard.' : 'Diagnostik disalin ke clipboard.');
    } catch {
      setDiagnosticsMessage(isEnglish ? 'Clipboard unavailable; copy manually from the list below.' : 'Clipboard tidak tersedia; salin manual dari daftar di bawah.');
    }
  };

  /* --------------------------------------------------------------- RENDER */

  const warnings = computeWarnings(settings, isEnglish);

  // Phase 5: navigasi kategori (grid dua kolom). null = halaman grid.
  const [activeCategory, setActiveCategory] = useState<
    'general' | 'audio' | 'hud' | 'performance' | 'system' | null
  >(null);
  const hudPanelMenus: Array<{ id: string; name: string; detail: string; status: UiStatus }> = [
    { id: 'chat', name: '1. Chat', detail: isEnglish ? 'Chat, gifts, viewers, and LIVE activity.' : 'Chat, gift, penonton, dan aktivitas LIVE.', status: 'not_connected' },
    { id: 'soundboard', name: '2. Soundboard', detail: isEnglish ? '4–6 favorite sounds sourced from Studio.' : '4–6 suara favorit yang bersumber dari Studio.', status: 'pending' },
    { id: 'music', name: '3. Music', detail: isEnglish ? 'Now playing track, queue, history, Song Request, and volume.' : 'Lagu aktif, antrean, riwayat, Song Request, dan volume.', status: 'pending' },
    { id: 'mixer', name: '4. Audio Mixer', detail: isEnglish ? 'Master, Music, Soundboard, Mic, and Mute.' : 'Master, Music, Soundboard, Mic, dan Mute.', status: 'pending' },
    { id: 'live', name: '5. Live Control', detail: isEnglish ? 'Pause, Resume, Stop — only if active mode natively supports it.' : 'Pause, Resume, Stop — hanya jika mode yang dipilih benar-benar mendukung.', status: 'not_connected' },
    { id: 'settings', name: '6. Settings', detail: isEnglish ? 'Opens Floating HUD configuration within this Settings page.' : 'Membuka konfigurasi Floating HUD pada halaman Settings ini.', status: 'pending' },
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            {t('settings.title', 'Pengaturan Studio (Settings)')}
          </h1>
          <p className="text-xs text-slate-400">
            {t('settings.subtitle', 'Pilih kategori pengaturan. Support dan Tentang tersedia langsung di halaman ini.')}
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

      {/* ================= KATEGORI GRID (2 kolom) ================= */}
      {activeCategory !== null && (
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className="self-start px-3 py-1.5 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
        >
          ← {isEnglish ? 'Back to categories' : 'Kembali ke kategori'}
        </button>
      )}

      {/* Dua kolom selalu aktif, termasuk di layar HP sempit (tanpa prefiks sm:) */}
      {activeCategory === null && (
        <div className="grid grid-cols-2 gap-2.5 w-full">
          {([
            { id: 'general' as const, title: t('settings.secA.title', 'Umum (General)'), detail: isEnglish ? 'Language, theme, haptics, and end-LIVE confirmation.' : 'Bahasa, tema, getar, dan konfirmasi akhiri siaran.' },
            { id: 'audio' as const, title: t('settings.secB.title', 'Audio & Mikrofon'), detail: isEnglish ? 'Microphone, test meter, gain, and processing.' : 'Mikrofon, meter tes, gain, dan pemrosesan.' },
            { id: 'hud' as const, title: t('settings.secC.title', 'Floating HUD'), detail: isEnglish ? 'Bubble size, opacity, side, and six panel menus.' : 'Ukuran bubble, opacity, sisi, dan enam menu panel.' },
            { id: 'performance' as const, title: t('settings.secD.title', 'Grafis & Performa Perangkat'), detail: isEnglish ? 'Device test, recommendations, manual resolution/FPS/bitrate.' : 'Uji perangkat, rekomendasi, resolusi/FPS/bitrate manual.' },
            { id: 'system' as const, title: t('settings.secE.title', 'Sistem'), detail: isEnglish ? 'Permissions, storage & cache, diagnostics.' : 'Izin, penyimpanan & cache, diagnostik.' },
          ]).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className="text-left p-3 rounded-2xl bg-[#080c16] border border-slate-800 hover:border-blue-500 transition-colors min-w-0"
            >
              <div className="flex items-center justify-end gap-2">
                <span className="text-[10px] text-slate-500">{isEnglish ? 'Open' : 'Buka'} →</span>
              </div>
              <div className="mt-1 text-[13px] font-semibold text-white leading-snug break-words">{category.title}</div>
              <p className="mt-0.5 text-[10px] text-slate-400 leading-snug">{category.detail}</p>
            </button>
          ))}
          {/* Slot kosong sesuai layout yang disetujui; selalu tampil agar grid tetap 2 kolom */}
          <div className="rounded-2xl border border-dashed border-slate-800 min-h-[76px]" aria-hidden="true" />
        </div>
      )}

      {/* ================= SUPPORT SYNTXRR (langsung di halaman grid) ================= */}
      {activeCategory === null && (
        <div className="p-4 rounded-2xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">{isEnglish ? 'Support SYNTXRR' : 'Dukung SYNTXRR'}</span>
            <StatusBadge status="not_connected" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              {
                label: 'Donasi',
                detail: isEnglish
                  ? 'Official donation link has not been supplied yet, so this action is intentionally not wired.'
                  : 'Tautan donasi resmi belum tersedia, jadi tombol ini sengaja belum dihubungkan.',
              },
              {
                label: 'Discord Server',
                detail: isEnglish
                  ? 'Official Discord invite has not been supplied yet, so this action is intentionally not wired.'
                  : 'Undangan Discord resmi belum tersedia, jadi tombol ini sengaja belum dihubungkan.',
              },
            ]).map((item) => (
              <button
                key={item.label}
                type="button"
                disabled
                className="text-left p-3 rounded-xl bg-[#0e1626] border border-slate-800 disabled:opacity-70"
              >
                <div className="text-[11px] font-semibold text-white">{item.label}</div>
                <p className="mt-0.5 text-[10px] text-slate-500 leading-snug">{item.detail}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ================================ A. GENERAL ================================ */}
      {activeCategory === 'general' && (
      <Section
        icon={SlidersHorizontal}
        title={t('settings.secA.title', 'Umum (General)')}
        subtitle={t('settings.secA.subtitle', 'Bahasa, tema tampilan, umpan balik getar, dan konfirmasi sebelum mengakhiri siaran')}
      >
        <FieldRow
          title={t('settings.language.title', 'Bahasa Antarmuka')}
          description={t('settings.language.desc', 'Pilih bahasa tampilan. Bahasa Indonesia dan English didukung penuh di seluruh antarmuka.')}
          status="functional"
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
          title={t('settings.theme.title', 'Tema Tampilan')}
          description={t('settings.theme.desc', 'Tema visual instan. Mengubah warna latar, panel, kartu, border, dan aksen di seluruh aplikasi.')}
          status="functional"
        >
          <Segmented<AppTheme>
            options={[
              { value: 'navy_dark', label: 'Navy Dark', hint: isEnglish ? 'Default' : 'Bawaan' },
              { value: 'obsidian_dark', label: 'Obsidian', hint: isEnglish ? 'Pure Black' : 'Gelap pekat' },
              { value: 'cyber_slate', label: 'Cyber Slate', hint: isEnglish ? 'High Contrast' : 'Kontras tinggi' },
            ]}
            value={(settings.theme ?? 'navy_dark') as AppTheme}
            onChange={(value) => {
              applyTheme(value);
              handleUpdate('theme', value);
            }}
          />
        </FieldRow>

        <FieldRow
          title={t('settings.haptic.title', 'Umpan Balik Getar (Haptic Feedback)')}
          description={t('settings.haptic.desc', 'Getaran singkat saat navigasi utama dan kontrol penting ditekan. Bergantung pada dukungan WebView/perangkat dan izin VIBRATE.')}
          status={isHapticSupported() ? 'functional' : 'not_supported'}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.hapticFeedback ? t('status.active', 'Aktif') : t('status.inactive', 'Nonaktif')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isHapticSupported()) {
                    showSaveStatus(t('settings.haptic.unsupported', 'Perangkat ini tidak mendukung getar melalui WebView'), 'error');
                    return;
                  }
                  const ok = vibrateNow('medium');
                  showSaveStatus(
                    ok ? t('settings.haptic.success', 'Getar uji dikirim ke perangkat') : t('settings.haptic.fail', 'Perangkat menolak permintaan getar'),
                    ok ? 'success' : 'error'
                  );
                }}
                className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
              >
                {t('settings.haptic.test', 'Uji Getar')}
              </button>
              <Toggle
                label={t('settings.haptic.title', 'Umpan balik getar')}
                checked={!!settings.hapticFeedback}
                onChange={(value) => handleUpdate('hapticFeedback', value)}
              />
            </div>
          </div>
        </FieldRow>

        <FieldRow
          title={t('settings.confirmEnd.title', 'Konfirmasi Sebelum Mengakhiri LIVE')}
          description={t('settings.confirmEnd.desc', 'Preferensi tersimpan, tetapi belum ada aksi yang bisa dikonfirmasi: Mode A tidak dapat mengakhiri LIVE TikTok (aplikasi TikTok resmi yang mengontrol siaran) dan Mode B belum memiliki sesi encoder.')}
          status="pending"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.confirmBeforeEndLive ? t('settings.confirmEnd.active', 'Minta konfirmasi') : t('settings.confirmEnd.inactive', 'Akhiri langsung')}
            </span>
            <Toggle
              label={t('settings.confirmEnd.title', 'Konfirmasi sebelum mengakhiri LIVE')}
              checked={!!settings.confirmBeforeEndLive}
              onChange={(value) => handleUpdate('confirmBeforeEndLive', value)}
            />
          </div>
        </FieldRow>
      </Section>
      )}

      {/* ========================= B. AUDIO & MICROPHONE ========================= */}
      {activeCategory === 'audio' && (
      <Section
        icon={Mic}
        title={t('settings.secB.title', 'Audio & Mikrofon')}
        subtitle={t('settings.secB.subtitle', 'Pemilihan perangkat input, tes level mikrofon, sensitivitas, dan pemrosesan suara')}
      >
        <FieldRow
          title={t('settings.micSelect.title', 'Pemilihan Mikrofon')}
          description={t('settings.micSelect.desc', 'Daftar perangkat berasal dari enumerasi perangkat nyata. Label perangkat hanya terbaca setelah izin mikrofon diberikan.')}
          status="functional"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={settings.microphoneDeviceId ?? ''}
              onChange={(e) => handleUpdate('microphoneDeviceId', e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">{t('settings.micSelect.default', 'Mikrofon bawaan sistem (default)')}</option>
              {micDevices.map((device, index) => (
                <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                  {device.label || (isEnglish ? `Microphone ${index + 1} (label requires permission)` : `Mikrofon ${index + 1} (label perlu izin)`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refreshMicDevices()}
              className="px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t('settings.micSelect.reload', 'Muat Ulang')}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {t('settings.micSelect.note', 'Pemilihan ini dipakai oleh Tes Mikrofon di bawah.')}
          </p>
        </FieldRow>

        <FieldRow
          title={t('settings.micTest.title', 'Tes Mikrofon')}
          description={t('settings.micTest.desc', 'Meter level nyata dari getUserMedia + AnalyserNode. Tidak ada hasil yang dibuat-buat: bila izin ditolak, error ditampilkan apa adanya.')}
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
                  <Square className="w-3.5 h-3.5" /> {t('settings.micTest.stop', 'Hentikan Tes')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startMicTest()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-[11px] text-emerald-300 flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> {t('settings.micTest.start', 'Mulai Tes Mikrofon')}
                </button>
              )}
              <span className="text-[11px] text-slate-500">
                {micTestActive ? `${t('settings.micTest.level', 'Level input: ')}${micLevel}%` : t('settings.micTest.idle', 'Tes tidak berjalan')}
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
          title={t('settings.micGain.title', 'Sensitivitas / Gain Input')}
          description={t('settings.micGain.desc', 'Penguatan diterapkan pada meter tes mikrofon di halaman ini. Belum ada encoder siaran yang memakainya, jadi nilai ini tidak mengubah suara LIVE.')}
          status="stored"
        >
          <SliderRow
            label={t('settings.micGain.title', 'Gain mikrofon')}
            value={settings.micGain ?? 100}
            min={0}
            max={200}
            step={5}
            suffix="%"
            onChange={(value) => handleUpdate('micGain', value)}
          />
        </FieldRow>

        <FieldRow
          title={t('settings.noiseSuppression.title', 'Noise Suppression')}
          description={t('settings.noiseSuppression.desc', 'Diterapkan sebagai constraint getUserMedia. Hanya aktif bila perangkat/WebView mendukungnya.')}
          status={
            typeof navigator !== 'undefined' &&
            navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression
              ? 'functional'
              : 'not_supported'
          }
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.noiseSuppression ? t('status.active', 'Aktif') : t('status.inactive', 'Nonaktif')}
            </span>
            <Toggle
              label={t('settings.noiseSuppression.title', 'Noise suppression')}
              checked={!!settings.noiseSuppression}
              onChange={(value) => handleUpdate('noiseSuppression', value)}
            />
          </div>
        </FieldRow>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.advancedMic.title', 'Pengaturan Mikrofon Lanjutan')}</span>
            <StatusBadge status="functional" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">{t('settings.echoCancellation.title', 'Echo Cancellation')}</div>
                <div className="text-[10px] text-slate-500">{t('settings.echoCancellation.desc', 'Mengurangi gema dari speaker perangkat.')}</div>
              </div>
              <Toggle
                label={t('settings.echoCancellation.title', 'Echo cancellation')}
                checked={!!settings.micEchoCancellation}
                onChange={(value) => handleUpdate('micEchoCancellation', value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">{t('settings.autoGain.title', 'Auto Gain Control')}</div>
                <div className="text-[10px] text-slate-500">
                  {t('settings.autoGain.desc', 'Menormalkan volume suara secara otomatis.')}
                </div>
              </div>
              <Toggle
                label={t('settings.autoGain.title', 'Auto gain control')}
                checked={!!settings.micAutoGainControl}
                onChange={(value) => handleUpdate('micAutoGainControl', value)}
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            {isEnglish ? 'Both options are forwarded as getUserMedia constraints when Mic Test is running.' : 'Kedua opsi diteruskan sebagai constraint getUserMedia saat Tes Mikrofon berjalan.'}
          </p>
        </div>
      </Section>
      )}

      {/* ============================ C. FLOATING HUD ============================ */}
      {activeCategory === 'hud' && (
      <Section
        icon={PanelRight}
        title={t('settings.secC.title', 'Floating HUD')}
        subtitle={t('settings.secC.subtitle', 'Tombol mengambang kecil dan panel satu tangan yang dipakai bersama Mode A dan Mode B')}
      >
        <FieldRow
          title={t('settings.hudEnable.title', 'Aktifkan Floating HUD')}
          description={t('settings.hudEnable.desc', 'Preferensi tersimpan. Tombol di bawah memanggil bridge native Android yang sudah ada dan melaporkan hasil sebenarnya.')}
          status={nativeAndroid ? 'pending' : 'not_supported'}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.hudEnabled ? t('status.active', 'Aktif') : t('status.inactive', 'Nonaktif')}
            </span>
            <Toggle
              label={t('settings.hudEnable.title', 'Aktifkan Floating HUD')}
              checked={!!settings.hudEnabled}
              onChange={(value) => handleUpdate('hudEnabled', value)}
            />
          </div>
          {nativeAndroid ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const result = await showFloatingHud({
                    sizeDp: settings.hudButtonSize ?? 48,
                    opacity: settings.hudOpacity ?? 92,
                    position: (settings.hudPosition ?? 'right') as 'left' | 'right',
                  });
                  setHudMessage(result.message ?? (isEnglish ? 'Show HUD request sent.' : 'Permintaan tampilkan HUD dikirim.'));
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
              >
                {t('settings.hudEnable.show', 'Tampilkan HUD Native')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await hideFloatingHud();
                  setHudMessage(result.message ?? (isEnglish ? 'Hide HUD request sent.' : 'Permintaan sembunyikan HUD dikirim.'));
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500"
              >
                {t('settings.hudEnable.hide', 'Sembunyikan HUD Native')}
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {t('settings.hudEnable.browserNote', 'Floating HUD native hanya tersedia pada APK Android. Di browser, preferensi tetap tersimpan.')}
            </p>
          )}
          {hudMessage && <p className="text-[11px] text-sky-300">{hudMessage}</p>}
        </FieldRow>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white">
                {t('settings.hudSize.title', 'Ukuran Tombol')}
              </span>
              <StatusBadge status="functional" />
            </div>
            <SliderRow
              label={t('settings.hudSize.slider', 'Ukuran')}
              value={settings.hudButtonSize ?? 48}
              min={40}
              max={64}
              step={2}
              suffix="dp"
              onChange={(value) => handleUpdate('hudButtonSize', value)}
            />
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white">
                {t('settings.hudOpacity.title', 'Transparansi')}
              </span>
              <StatusBadge status="functional" />
            </div>
            <SliderRow
              label={t('settings.hudOpacity.slider', 'Opasitas')}
              value={settings.hudOpacity ?? 92}
              min={30}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) => handleUpdate('hudOpacity', value)}
            />
          </div>
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed">
          Ukuran, transparansi, dan sisi layar langsung diterapkan ke bubble native yang sedang
          tampil — tanpa perlu menyembunyikan HUD lalu menampilkannya lagi. Posisi geser pengguna
          tetap dipertahankan, dan nilai tersimpan dipakai lagi setelah aplikasi dibuka ulang.
        </p>

        <FieldRow
          title={t('settings.hudPosition.title', 'Posisi Tombol')}
          description={t(
            'settings.hudPosition.desc',
            'Sisi layar tempat tombol mengambang berlabuh. Mengubahnya langsung memindahkan bubble yang sedang tampil, dan pengguna tetap bebas menggesernya.'
          )}
          status={nativeAndroid ? 'functional' : 'not_supported'}
        >
          <Segmented<HudPosition>
            options={[
              { value: 'left', label: t('settings.hudPosition.left', 'Kiri') },
              { value: 'right', label: t('settings.hudPosition.right', 'Kanan') },
            ]}
            columns="grid-cols-2"
            value={(settings.hudPosition ?? 'right') as HudPosition}
            onChange={(value) => handleUpdate('hudPosition', value)}
          />
        </FieldRow>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.hudPanels.title', 'Preferensi Tampilan Panel')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                { key: 'hudPanelChat', label: 'Chat' },
                { key: 'hudPanelSoundboard', label: 'Soundboard' },
                { key: 'hudPanelMusic', label: 'Music' },
                { key: 'hudPanelMixer', label: 'Audio Mixer' },
              ] as const
            ).map((panel) => (
              <div
                key={panel.key}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800"
              >
                <span className="text-[11px] text-slate-300">{panel.label}</span>
                <Toggle
                  label={isEnglish ? `Show ${panel.label} menu` : `Tampilkan menu ${panel.label}`}
                  checked={!!settings[panel.key]}
                  onChange={(value) => handleUpdate(panel.key, value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-white">{t('settings.hudPanels.sixMenus', 'Enam Menu Panel Floating HUD')}</div>
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
            {t('settings.hudPanels.note', 'Panel melayang dioptimalkan untuk pengoperasian satu tangan saat siaran berlangsung.')}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-amber-900/60 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">{t('settings.hudRules.title', 'Batas Kemampuan Mode')}</span>
          </div>
          <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-4">
            <li>
              <span className="text-slate-200 font-semibold">Mode A:</span>{' '}
              {isEnglish
                ? 'Official TikTok app broadcasts the LIVE stream. SYNTXRR STREAM is companion only and never exposes fake Pause/Resume/Stop controls.'
                : 'aplikasi TikTok resmi tetap yang menyiarkan LIVE. SYNTXRR STREAM hanya pendamping dan tidak boleh menampilkan Pause/Resume/Stop TikTok yang palsu.'}
            </li>
            <li>
              <span className="text-slate-200 font-semibold">Mode B:</span>{' '}
              {isEnglish
                ? 'SYNTXRR encoder controls become active once native RTMP pipeline is ready. Currently not connected.'
                : 'kontrol encoder SYNTXRR hanya aktif setelah pipeline RTMP benar-benar tersedia. Saat ini belum ada.'}
            </li>
          </ul>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.hudDeckRule.title', 'Aturan Stream Deck')}</span>
            <StatusBadge status="not_connected" />
          </div>
          <p className="text-[11px] text-slate-400">
            {t('settings.hudDeckRule.desc', 'Stream Deck aktif → Floating HUD nonaktif, dan sebaliknya untuk mencegah tumpang tindih kontrol.')}
          </p>
          <p className="text-[11px] text-slate-500">
            {isEnglish
              ? 'Stream Deck session detection is not yet simulated; HUD state is not switched automatically. Stream Deck has its own interface outside Settings.'
              : 'Deteksi sesi Stream Deck belum tersedia, jadi status ini tidak disimulasikan dan HUD tidak diubah otomatis. Stream Deck tetap memiliki fiturnya sendiri di luar Settings.'}
          </p>
        </div>
      </Section>
      )}

      {/* ================= D. GRAPHICS & DEVICE PERFORMANCE ================= */}
      {activeCategory === 'performance' && (
      <Section
        icon={Monitor}
        title={t('settings.secD.title', 'Grafis & Performa Perangkat')}
        subtitle={t('settings.secD.subtitle', 'Uji perangkat, rekomendasi, kontrol manual resolusi/FPS/bitrate, dan peringatan risiko')}
      >
        <FieldRow
          title={t('settings.deviceTest.title', 'Uji Perangkat Otomatis')}
          description={t('settings.deviceTest.desc', 'Membaca jumlah core logis CPU, perkiraan memori, dan renderer GPU WebGL nyata. Uji ini berjalan di WebView/browser; benchmark native Android belum tersedia.')}
          status="functional"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runDeviceTest}
              disabled={deviceTestRunning}
              className="px-3 py-1.5 rounded-lg bg-blue-950/60 border border-blue-800 text-[11px] text-blue-200 flex items-center gap-1.5 disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {deviceTestRunning ? t('settings.deviceTest.running', 'Menguji…') : t('settings.deviceTest.run', 'Jalankan Uji Perangkat')}
            </button>
            {deviceTest && (
              <span className="text-[11px] text-slate-500">
                {isEnglish ? `Test result: ${new Date(deviceTest.testedAt).toLocaleTimeString('en-US')}` : `Hasil uji: ${new Date(deviceTest.testedAt).toLocaleTimeString('id-ID')}`}
              </span>
            )}
          </div>

          {deviceTest ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {[
                { label: 'Logical cores', value: deviceTest.cores ?? (isEnglish ? 'unreadable' : 'tidak terbaca') },
                { label: 'Device memory', value: deviceTest.memoryGB ? `${deviceTest.memoryGB} GB` : (isEnglish ? 'unreadable' : 'tidak terbaca') },
                { label: 'Max texture', value: deviceTest.maxTextureSize ?? (isEnglish ? 'unreadable' : 'tidak terbaca') },
                { label: 'Platform', value: deviceTest.platform },
                { label: 'WebGL renderer', value: deviceTest.webglRenderer ?? (isEnglish ? 'unreadable' : 'tidak terbaca') },
                { label: isEnglish ? 'Recommendation' : 'Rekomendasi', value: `${deviceTest.recommendedResolution} / ${deviceTest.recommendedFrameRate} FPS` },
              ].map((item) => (
                <div key={item.label} className="p-2 rounded-lg bg-[#0e1626] border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</div>
                  <div className="text-[11px] text-slate-200 font-mono break-words">{String(item.value)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {t('settings.deviceTest.notTested', 'Belum ada hasil uji. Tidak ada nilai yang ditampilkan sebelum pengujian dijalankan.')}
            </p>
          )}
          <div className="space-y-1.5">
            {[
              {
                label: isEnglish ? 'Thermal test (native Android)' : 'Uji termal (native Android)',
                detail: isEnglish
                  ? 'Needs a native thermal module. No native implementation exists yet.'
                  : 'Memerlukan modul termal native. Implementasinya belum ada.',
              },
              {
                label: isEnglish ? 'MediaCodec encoder benchmark' : 'Benchmark encoder MediaCodec',
                detail: isEnglish
                  ? 'Needs the native RTMP/MediaCodec pipeline. Not available yet.'
                  : 'Memerlukan pipeline RTMP/MediaCodec native. Belum tersedia.',
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[#0e1626] border border-slate-800"
              >
                <div>
                  <div className="text-[11px] text-slate-200">{row.label}</div>
                  <div className="text-[10px] text-slate-500">{row.detail}</div>
                </div>
                <StatusBadge status="coming_soon" />
              </div>
            ))}
          </div>
        </FieldRow>

        <FieldRow
          title={t('settings.recommendations.title', 'Rekomendasi Resolusi / FPS / Bitrate')}
          description={t('settings.recommendations.desc', 'Diturunkan dari core dan memori yang terbaca secara heuristik.')}
          status={deviceTest ? 'stored' : 'pending'}
        >
          {deviceTest ? (
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-200">
                {isEnglish ? 'Resolution: ' : 'Resolusi: '}{deviceTest.recommendedResolution}
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
              {t('settings.recommendations.empty', 'Jalankan Uji Perangkat untuk melihat rekomendasi.')}
            </p>
          )}
        </FieldRow>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">{t('settings.manualRes.title', 'Resolusi Manual')}</label>
            <Segmented<ResolutionTarget>
              options={[
                { value: '720p', label: '720p', hint: isEnglish ? 'Eco' : 'Hemat' },
                { value: '1080p', label: '1080p', hint: isEnglish ? 'Recommended' : 'Disarankan' },
                { value: '1440p', label: '1440p', hint: isEnglish ? 'Heavy' : 'Berat' },
              ]}
              value={settings.targetResolution}
              onChange={(value) => handleUpdate('targetResolution', value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">{t('settings.manualFps.title', 'FPS Manual')}</label>
            <Segmented<FrameRate>
              options={[
                { value: 30, label: '30 FPS', hint: isEnglish ? 'Battery saver' : 'Hemat baterai' },
                { value: 60, label: '60 FPS', hint: isEnglish ? 'Smooth' : 'Mulus' },
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
              label={t('settings.videoBitrate.title', 'Bitrate Video')}
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
              label={t('settings.audioBitrate.title', 'Bitrate Audio')}
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
          title={t('settings.autoApply.title', 'Auto Apply Rekomendasi')}
          description={t('settings.autoApply.desc', 'Saat aktif, hasil uji perangkat langsung ditulis ke pengaturan. Kontrol manual tidak pernah dikunci.')}
          status="functional"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {settings.autoApplyRecommendations
                ? (isEnglish ? 'Active — recommendations applied after test completes' : 'Aktif — rekomendasi diterapkan setelah uji selesai')
                : (isEnglish ? 'Inactive — recommendations only displayed' : 'Nonaktif — rekomendasi hanya ditampilkan')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyRecommendations}
                disabled={!deviceTest}
                className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 disabled:opacity-50"
              >
                {t('settings.autoApply.applyNow', 'Terapkan Sekarang')}
              </button>
              <Toggle
                label={t('settings.autoApply.title', 'Auto apply rekomendasi')}
                checked={!!settings.autoApplyRecommendations}
                onChange={(value) => handleUpdate('autoApplyRecommendations', value)}
              />
            </div>
          </div>
        </FieldRow>

        {warnings.length > 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/60 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4" /> {t('settings.warnings.title', 'Peringatan Konfigurasi')}
            </div>
            <ul className="text-[11px] text-amber-200/90 space-y-1 list-disc pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p className="text-[10px] text-amber-200/60">
              {isEnglish ? 'Advisory notice, not a hard restriction. Values can still be modified.' : 'Ini peringatan jujur, bukan pembatasan. Nilai tetap dapat diubah.'}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> {t('settings.warnings.none', 'Tidak ada konfigurasi berisiko terdeteksi.')}
          </p>
        )}

        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.profile.title', 'Profil Performa & Hardware')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                { id: 'battery_saver', name: t('settings.profile.battery', 'Hemat Baterai'), desc: t('settings.profile.batteryDesc', 'Alokasi RAM minimal, suhu stabil'), icon: Battery },
                { id: 'balanced', name: t('settings.profile.balanced', 'Seimbang'), desc: t('settings.profile.balancedDesc', 'Optimal untuk 1080p durasi panjang'), icon: Cpu },
                { id: 'performance', name: t('settings.profile.performance', 'Performa Maksimal'), desc: t('settings.profile.performanceDesc', 'Prioritas bitrate tinggi, latensi rendah'), icon: Flame },
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
              <div className="text-xs font-semibold text-white">{t('settings.gpuAccel.title', 'Akselerasi Hardware GPU')}</div>
              <div className="text-[11px] text-slate-400">
                {t('settings.gpuAccel.desc', 'Gunakan MediaCodec H.264 / HEVC hardware jika tersedia di Android')}
              </div>
            </div>
            <Toggle
              label={t('settings.gpuAccel.title', 'Akselerasi Hardware GPU')}
              checked={!!settings.hardwareAcceleration}
              onChange={(value) => handleUpdate('hardwareAcceleration', value)}
            />
          </div>
        </div>

        {/* Output Mode B — dipertahankan */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.rtmp.title', 'Output Siaran Mode B (RTMP / RTMPS)')}</span>
            <StatusBadge status="not_connected" />
          </div>
          <div>
            <label className="block text-slate-300 font-medium mb-1 text-[11px]">{t('settings.rtmp.url', 'URL Server RTMP')}</label>
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
              <label className="text-slate-300 font-medium text-[11px]">{t('settings.rtmp.key', 'Stream Key / Kunci Siaran')}</label>
              <button
                type="button"
                onClick={() => setShowStreamKey(!showStreamKey)}
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                {showStreamKey ? (
                  <>
                    <EyeOff className="w-3 h-3" /> {t('settings.rtmp.hide', 'Sembunyikan')}
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> {t('settings.rtmp.show', 'Tampilkan')}
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
            {isEnglish
              ? 'Credentials are saved locally per device and never included in backup files. Native RTMP encoder pipeline is coming soon.'
              : 'Kredensial disimpan per perangkat dan tidak pernah disertakan dalam file cadangan. Pipeline encoder RTMP belum tersedia, sehingga tombol siaran tidak disediakan di sini.'}
          </p>
        </div>
      </Section>
      )}

      {/* =============================== E. SYSTEM =============================== */}
      {activeCategory === 'system' && (
      <Section
        icon={Lock}
        title={t('settings.secE.title', 'Sistem (System)')}
        subtitle={t('settings.secE.subtitle', 'Manajer izin, penyimpanan & cache, diagnostik, serta pencadangan data')}
      >
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.permissions.title', 'Permissions Manager')}</span>
            <StatusBadge status="functional" />
          </div>
          <p className="text-[10px] text-slate-500">
            {t('settings.permissions.desc', 'Status dibaca dari Permissions API dan Notification API secara nyata.')}
          </p>

          <div className="space-y-2">
            {(
              [
                { key: 'camera', label: t('settings.permissions.camera', 'Kamera'), kind: 'camera' as const },
                { key: 'microphone', label: t('settings.permissions.mic', 'Mikrofon'), kind: 'microphone' as const },
              ]
            ).map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800"
              >
                <div>
                  <div className="text-[11px] font-semibold text-slate-200">{item.label}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {permissionState[item.key] ?? (isEnglish ? 'checking…' : 'memeriksa…')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void requestMediaPermission(item.kind)}
                  disabled={permissionBusy === item.kind}
                  className="px-2.5 py-1 rounded-lg bg-[#080c16] border border-slate-700 text-[10px] text-slate-200 hover:border-blue-500 disabled:opacity-50"
                >
                  {permissionBusy === item.kind ? (isEnglish ? 'Requesting…' : 'Meminta…') : t('settings.permissions.request', 'Minta Izin')}
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">{t('settings.permissions.notif', 'Notifikasi')}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {permissionState.notifications ?? (isEnglish ? 'checking…' : 'memeriksa…')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void requestNotification()}
                className="px-2.5 py-1 rounded-lg bg-[#080c16] border border-slate-700 text-[10px] text-slate-200 hover:border-blue-500"
              >
                {t('settings.permissions.request', 'Minta Izin')}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0e1626] border border-slate-800">
              <div>
                <div className="text-[11px] font-semibold text-slate-200">{t('settings.permissions.overlay', 'Overlay (Floating HUD)')}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {overlayGranted === null
                    ? nativeAndroid
                      ? (isEnglish ? 'checking…' : 'memeriksa…')
                      : (isEnglish ? 'only available in Android APK' : 'hanya tersedia di APK Android')
                    : overlayGranted
                      ? (isEnglish ? 'granted' : 'diizinkan')
                      : (isEnglish ? 'not granted' : 'belum diizinkan')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void askOverlayPermission()}
                disabled={!nativeAndroid}
                className="px-2.5 py-1 rounded-lg bg-[#080c16] border border-slate-700 text-[10px] text-slate-200 hover:border-blue-500 disabled:opacity-50"
              >
                {overlayGranted ? t('settings.permissions.recheck', 'Periksa Ulang') : t('settings.permissions.request', 'Minta Izin')}
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.storage.title', 'Penyimpanan & Cache')}</span>
            <StatusBadge status={storageInfo ? 'functional' : 'pending'} />
          </div>
          {storageInfo ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>{t('settings.storage.used', 'Terpakai')}</span>
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
            <p className="text-[11px] text-slate-500">
              {isEnglish ? 'Storage quota could not be read.' : 'Perkiraan penyimpanan belum dapat dibaca.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void clearAppCache()}
              className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-red-500 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('settings.storage.clearCache', 'Bersihkan Cache Aplikasi')}
            </button>
            <button
              type="button"
              onClick={() => void refreshStorage()}
              className="px-2.5 py-1 rounded-lg bg-[#0e1626] border border-slate-700 text-[11px] text-slate-200 hover:border-blue-500 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t('settings.storage.refresh', 'Segarkan')}
            </button>
          </div>
          {cacheMessage && <p className="text-[11px] text-sky-300">{cacheMessage}</p>}
          <p className="text-[10px] text-slate-500">
            {t('settings.storage.note', 'Hanya Cache Storage yang dihapus. IndexedDB (preset, pengaturan) tidak disentuh.')}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.diag.title', 'Diagnostik')}</span>
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
            <Copy className="w-3.5 h-3.5" /> {t('settings.diag.copy', 'Salin Diagnostik')}
          </button>
          {diagnosticsMessage && <p className="text-[11px] text-sky-300">{diagnosticsMessage}</p>}
        </div>

        {/* Pencadangan & Pemulihan — dipertahankan dari Phase 1/2 */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.backup.title', 'Pencadangan & Pemulihan JSON')}</span>
            <StatusBadge status="functional" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onExportData}
              className="p-3 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-blue-500 text-white text-[11px] font-semibold flex items-center justify-center gap-2 transition"
            >
              <Download className="w-4 h-4 text-blue-400" /> {t('settings.backup.export', 'Ekspor Cadangan')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center gap-2 transition"
            >
              <Upload className="w-4 h-4 text-emerald-400" /> {t('settings.backup.import', 'Pulihkan Cadangan')}
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
              <RotateCcw className="w-4 h-4 text-red-400" /> {t('settings.backup.reset', 'Atur Ulang Pengaturan')}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              {t('settings.backup.securityNote', 'File cadangan tidak memuat Stream Key atau kunci API. Kredensial lokal terlindungi aman.')}
            </span>
          </p>
        </div>

        {/* Kredensial integrasi — dipertahankan */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.credentials.title', 'Kredensial Integrasi')}</span>
            <StatusBadge status="stored" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium text-[11px] flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-red-400" /> {t('settings.credentials.youtube', 'Kunci API YouTube Data v3')}
              </label>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
              >
                {t('settings.credentials.get', 'Dapatkan')} <ExternalLink className="w-3 h-3" />
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
                title={showYouTubeKey ? (isEnglish ? 'Hide' : 'Sembunyikan') : (isEnglish ? 'Show' : 'Tampilkan')}
              >
                {showYouTubeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {isEnglish
                ? 'Used purely for official YouTube video title and thumbnail search.'
                : 'Digunakan murni untuk pencarian judul dan thumbnail video YouTube resmi.'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium text-[11px] flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-emerald-400" /> {t('settings.credentials.spotify', 'Client ID Spotify Developer')}
              </label>
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                {t('settings.credentials.portal', 'Portal')} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="text"
              value={settings.spotifyClientId || ''}
              onChange={(e) => handleUpdate('spotifyClientId', e.target.value)}
              placeholder={isEnglish ? 'Spotify Client ID (32 characters)...' : 'Spotify Client ID 32-karakter...'}
              className="w-full px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              {isEnglish
                ? 'Requires redirect URI pointed to this application for PKCE authentication.'
                : 'Memerlukan redirect URI yang diarahkan ke aplikasi ini untuk autentikasi PKCE.'}
            </p>
          </div>
        </div>
      </Section>
      )}

      {/* ================================ F. ABOUT ================================ */}
      {/* About tampil langsung di halaman grid, tidak butuh halaman sendiri. */}
      {activeCategory === null && (
      <Section
        icon={Info}
        title={t('settings.secF.title', 'Tentang SYNTXRR')}
        subtitle={t('settings.secF.subtitle', 'Versi aplikasi, informasi pembaruan, dan lisensi komponen')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('settings.about.version', 'Versi Aplikasi')}</div>
            <div className="text-sm font-bold text-white">{APP_VERSION}</div>
            <div className="text-[10px] text-slate-500">
              {isEnglish
                ? `package.json & Gradle versionName · spec v${SETTINGS_SPEC_VERSION}`
                : `package.json & versionName Gradle · spesifikasi v${SETTINGS_SPEC_VERSION}`}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('settings.about.appId', 'Application ID')}</div>
            <div className="text-[11px] font-mono text-blue-400 break-words">com.syntxrr.streamtools</div>
          </div>
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('settings.about.runtime', 'Runtime')}</div>
            <div className="text-[11px] text-slate-200 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              {nativeAndroid ? t('settings.about.runtimeApk', 'Android (APK)') : t('settings.about.runtimeWeb', 'Browser / Desktop')}
            </div>
          </div>
        </div>

        <FieldRow
          title={t('settings.about.buildMeta', 'Metadata Build')}
          description={t(
            'settings.about.buildMetaDesc',
            'Sumber metadata build sebenarnya, diverifikasi langsung dari file proyek.'
          )}
          status="pending"
        >
          <ul className="space-y-1 text-[11px] text-slate-400 font-mono break-words">
            <li>package.json → name: &quot;syntxrr-stream&quot; · version: &quot;1.0.0&quot;</li>
            <li>android/app/build.gradle → versionName: &quot;1.0.0&quot; · versionCode: 1</li>
            <li>capacitor.config.ts → appId: &quot;com.syntxrr.streamtools&quot;</li>
          </ul>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {isEnglish
              ? `Application ID, package name and version are now aligned. The app version ${APP_VERSION} matches package.json and Gradle versionName; ${SETTINGS_SPEC_VERSION} is only the Settings specification revision.`
              : `Application ID, nama package, dan versi sudah selaras. Versi aplikasi ${APP_VERSION} sama dengan package.json dan versionName Gradle; ${SETTINGS_SPEC_VERSION} hanyalah revisi spesifikasi Settings.`}
          </p>
        </FieldRow>

        <FieldRow
          title={t('settings.about.updates', 'Informasi Pembaruan')}
          description={t('settings.about.updatesDesc', 'Pembaruan didistribusikan melalui build APK rilis GitHub Actions.')}
          status="coming_soon"
        >
          <p className="text-[11px] text-slate-500">
            {isEnglish
              ? 'Updates are currently distributed manually via APK/CI builds, not via automatic in-app checks.'
              : 'Pembaruan saat ini didistribusikan manual melalui build APK/CI, bukan melalui pemeriksaan otomatis dari dalam aplikasi.'}
          </p>
        </FieldRow>

        <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-white">{t('settings.about.oss', 'Lisensi Komponen')}</span>
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
            {isEnglish
              ? 'List of core open-source components used by this app. Full license texts available in respective packages.'
              : 'Daftar komponen open-source utama yang dipakai aplikasi ini. Teks lisensi lengkap tersedia di masing-masing paket.'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#080c16] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
          <div>
            <span className="font-bold text-slate-200">SYNTXRR STREAM</span>
            <span className="text-slate-500 mx-2">·</span>
            <span>{isEnglish ? `Version ${APP_VERSION}` : `Versi ${APP_VERSION}`}</span>
            <span className="text-slate-500 mx-2">·</span>
            <span className="font-mono text-blue-400">com.syntxrr.streamtools</span>
          </div>
          <div className="text-slate-500">{t('settings.about.footer', 'Mobile Streaming Studio & TikTok LIVE Companion')}</div>
        </div>
      </Section>
      )}
    </div>
  );
};
