import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppSettings,
  ResolutionTarget,
  FrameRate,
  PerformanceProfile,
  AppLanguage,
  HudPosition,
  ModeBAudioSource,
} from '../types';
import { isHapticSupported, vibrateNow } from '../services/haptics';
import { validateModeBRtmpConfig } from '../services/modeBController';
import {
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
  Music2,
  ExternalLink,
  Mic,
  Sparkles,
  PanelRight,
  SlidersHorizontal,
  Trash2,
  Copy,
  RefreshCw,
  Smartphone,
  AlertTriangle,
  Play,
  Square,
  Lock,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import {
  isNativeAndroid,
  checkMicPermission,
  requestMicPermission,
  checkNotificationPermission,
  requestNotificationPermission,
  checkOverlayPermission,
  requestOverlayPermission,
  showFloatingHud,
  updateFloatingHud,
  hideFloatingHud,
} from '../services/nativeCompanionBridge';
import { useTranslation } from '../i18n/I18nContext';

/* ============================================================================
 * STATUS BADGES
 * ========================================================================== */

type UiStatus =
  | 'functional'
  | 'stored'
  | 'pending'
  | 'not_connected'
  | 'coming_soon'
  | 'not_supported';

type SettingsCategoryId = 'general' | 'audio' | 'hud' | 'performance' | 'system';

const STATUS_META: Record<
  UiStatus,
  {
    fallbackLabel: string;
    color: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  functional: {
    fallbackLabel: 'Berfungsi',
    color: 'var(--app-ok)',
    backgroundColor: 'var(--app-ok-soft)',
    borderColor: 'color-mix(in srgb, var(--app-ok) 38%, transparent)',
  },
  stored: {
    fallbackLabel: 'Tersimpan',
    color: 'var(--app-accent-text)',
    backgroundColor: 'var(--app-accent-soft)',
    borderColor: 'var(--app-accent-border)',
  },
  pending: {
    fallbackLabel: 'Pending',
    color: 'var(--app-warn)',
    backgroundColor: 'var(--app-warn-soft)',
    borderColor: 'color-mix(in srgb, var(--app-warn) 42%, transparent)',
  },
  not_connected: {
    fallbackLabel: 'Belum Terhubung',
    color: 'var(--app-warn)',
    backgroundColor: 'var(--app-surface-muted)',
    borderColor: 'color-mix(in srgb, var(--app-warn) 35%, var(--app-border))',
  },
  coming_soon: {
    fallbackLabel: 'Coming Soon',
    color: 'var(--app-text-secondary)',
    backgroundColor: 'var(--app-surface-elevated)',
    borderColor: 'var(--app-border-strong)',
  },
  not_supported: {
    fallbackLabel: 'Tidak Didukung',
    color: 'var(--app-text-muted)',
    backgroundColor: 'var(--app-surface-muted)',
    borderColor: 'var(--app-border)',
  },
};

const StatusBadge: React.FC<{ status: UiStatus }> = ({ status }) => {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  const label = t(`status.${status}`, meta.fallbackLabel);
  return (
    <span
      className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-semibold tracking-wide whitespace-nowrap"
      style={{
        color: meta.color,
        backgroundColor: meta.backgroundColor,
        borderColor: meta.borderColor,
      }}
    >
      {label}
    </span>
  );
};

/* ============================================================================
 * D+ COMPACT CONSOLE PRIMITIVES
 * ========================================================================== */

const ConsolePanel: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, action, children }) => (
  <section className="rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] overflow-hidden">
    <div className="px-3 sm:px-4 py-2 bg-[var(--app-surface-muted)] border-b border-[var(--app-border)] flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
        <div className="min-w-0 flex items-baseline gap-2">
          <h2 className="font-display text-sm font-bold text-[var(--app-text)] tracking-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="hidden md:block text-[11px] text-[var(--app-text-muted)] truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className="p-3 sm:p-4 divide-y divide-[var(--app-border)]">{children}</div>
  </section>
);

const DenseRow: React.FC<{
  title: string;
  description?: string;
  status?: UiStatus;
  action?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, description, status, action, children }) => (
  <div className="py-2.5 first:pt-0 last:pb-0 space-y-2">
    <div className="flex items-center justify-between gap-2.5">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[var(--app-text)] leading-snug truncate">
          {title}
        </div>
        {description && (
          <p className="text-[11px] text-[var(--app-text-muted)] leading-snug mt-0.5">
            {description}
          </p>
        )}
      </div>
      {(status || action) && (
        <div className="flex items-center gap-2 shrink-0">
          {status && <StatusBadge status={status} />}
          {action}
        </div>
      )}
    </div>
    {children}
  </div>
);

const FieldRow: React.FC<{
  title: string;
  hint?: string;
  status?: UiStatus;
  control: React.ReactNode;
}> = ({ title, hint, status, control }) => (
  <div className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 min-h-[44px]">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-[var(--app-text)] truncate">{title}</span>
        {status && <StatusBadge status={status} />}
      </div>
      {hint && (
        <p className="text-[11px] text-[var(--app-text-muted)] leading-snug truncate mt-0.5">
          {hint}
        </p>
      )}
    </div>
    <div className="flex items-center gap-1.5 shrink-0">{control}</div>
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
    className="btn-press min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
  >
    <span
      className={`relative w-10 h-[22px] rounded-full border transition-colors ${
        checked
          ? 'bg-[var(--app-accent)] border-[var(--app-accent)]'
          : 'bg-[var(--app-surface-elevated)] border-[var(--app-border-strong)]'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full transition-all shadow-sm ${
          checked
            ? 'left-[20px] bg-[var(--app-accent-ink)]'
            : 'left-0.5 bg-[var(--app-text-secondary)]'
        }`}
      />
    </span>
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
    <div className={`grid gap-1.5 ${columns}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`btn-press min-h-[44px] py-1 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center border min-w-0 ${
              active
                ? 'bg-[var(--app-surface-elevated)] text-[var(--app-text)] border-[var(--app-accent-border)] shadow-sm'
                : 'bg-[var(--app-surface-muted)] text-[var(--app-text-muted)] border-[var(--app-border)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)]'
            }`}
          >
            <span
              className={`truncate max-w-full leading-tight ${
                active ? 'text-[var(--app-accent-text)] font-bold' : ''
              }`}
            >
              {option.label}
            </span>
            {option.hint && (
              <span className="text-[10px] font-mono-num font-normal opacity-80 truncate max-w-full leading-tight">
                {option.hint}
              </span>
            )}
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
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-2 text-xs">
      <label className="text-[var(--app-text-secondary)] font-medium truncate">{label}</label>
      <span className="font-mono-num font-bold text-[var(--app-accent-text)] shrink-0">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </div>
    <div className="min-h-[32px] flex items-center">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg cursor-pointer accent-[var(--app-accent)]"
      />
    </div>
    <div className="flex justify-between text-[10px] font-mono-num text-[var(--app-text-muted)] leading-none">
      <span>
        {min}
        {suffix ? ` ${suffix}` : ''}
      </span>
      <span>
        {max}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </div>
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

function measureDeviceCapabilities(): DeviceTestResult {
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
    /* WebGL unavailable */
  }

  const cores =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
  const memoryCandidate = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const memoryGB = typeof memoryCandidate === 'number' ? memoryCandidate : null;
  const recommendation = recommendProfile(cores, memoryGB);

  return {
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

  const latestSettingsRef = useRef(settings);
  const statusTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId | null>(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const handleSelectCategory = (id: SettingsCategoryId) => {
    setActiveCategory(id);
    if (typeof window !== 'undefined' && window.scrollY > 16) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const [deviceTest, setDeviceTest] = useState<DeviceTestResult | null>(null);
  const [deviceTestRunning, setDeviceTestRunning] = useState(false);
  const [applyRecRunning, setApplyRecRunning] = useState(false);
  const [recommendationFeedback, setRecommendationFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micTestActive, setMicTestActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);

  const [permissionState, setPermissionState] = useState<Record<string, string>>({});
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null);
  const [overlayGranted, setOverlayGranted] = useState<boolean | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);
  const [hudMessage, setHudMessage] = useState<string | null>(null);

  const hudAppearanceSignatureRef = useRef<string>('');
  useEffect(() => {
    const sizeDp = settings.hudButtonSize ?? 48;
    const opacity = settings.hudOpacity ?? 92;
    const position = (settings.hudPosition ?? 'right') as 'left' | 'right';
    const signature = `${sizeDp}|${opacity}|${position}`;
    if (hudAppearanceSignatureRef.current === signature) return;
    const isBaseline = hudAppearanceSignatureRef.current === '';
    hudAppearanceSignatureRef.current = signature;
    if (isBaseline) return;
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

  const persistSettings = async (next: AppSettings): Promise<boolean> => {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    showSaveStatus(t('settings.saving', 'Menyimpan…'), 'pending');
    const success = await onUpdateSettings(next);
    if (!isMountedRef.current || requestId !== saveRequestIdRef.current) return success;
    if (success) {
      showSaveStatus(t('settings.saved', 'Tersimpan'), 'success');
    } else {
      showSaveStatus(
        t('settings.saveFailed', 'Gagal menyimpan — perubahan belum tersimpan di perangkat'),
        'error'
      );
    }
    return success;
  };

  const handleUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...latestSettingsRef.current, [key]: value };
    latestSettingsRef.current = updated;
    void persistSettings(updated);
  };

  const handleUpdateMany = (patch: Partial<AppSettings>): Promise<boolean> => {
    const updated = { ...latestSettingsRef.current, ...patch };
    latestSettingsRef.current = updated;
    return persistSettings(updated);
  };

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
        setMicError(
          isEnglish
            ? 'Web Audio API is unavailable in this WebView.'
            : 'Web Audio API tidak tersedia pada WebView ini.'
        );
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
      const message =
        error instanceof Error ? error.message : isEnglish ? 'unknown' : 'tidak diketahui';
      setMicError(
        isEnglish
          ? `Failed to access microphone: ${message}`
          : `Gagal mengakses mikrofon: ${message}`
      );
      stopMicTest();
    }
  };

  const refreshPermissions = useCallback(async () => {
    const next: Record<string, string> = {};
    const names: Array<'camera' | 'microphone'> = ['camera', 'microphone'];
    for (const name of names) {
      if (name === 'microphone' && isNativeAndroid()) {
        const micPerm = await checkMicPermission();
        next.microphone = micPerm.granted ? 'granted' : 'prompt';
        continue;
      }
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
    if (isNativeAndroid()) {
      const notifPerm = await checkNotificationPermission();
      next.notifications = notifPerm.granted
        ? 'granted'
        : notifPerm.message
        ? isEnglish
          ? `unable to check — ${notifPerm.message}`
          : `tidak dapat diperiksa — ${notifPerm.message}`
        : 'prompt';
    } else {
      next.notifications =
        typeof Notification !== 'undefined'
          ? Notification.permission
          : isEnglish
          ? 'unavailable'
          : 'tidak tersedia';
    }
    setPermissionState(next);
  }, [isEnglish]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const requestMediaPermission = async (kind: 'camera' | 'microphone') => {
    setPermissionBusy(kind);
    try {
      if (kind === 'microphone' && isNativeAndroid()) {
        const result = await requestMicPermission();
        setPermissionState((prev) => ({
          ...prev,
          microphone: result.granted
            ? 'granted'
            : isEnglish
            ? result.message
              ? `denied — ${result.message}`
              : 'denied'
            : result.message
            ? `ditolak — ${result.message}`
            : 'ditolak',
        }));
        if (result.granted) {
          void refreshMicDevices();
        }
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionState((prev) => ({
          ...prev,
          [kind]: isEnglish ? 'unavailable' : 'tidak tersedia',
        }));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'camera' ? { video: true } : { audio: true }
      );
      stream.getTracks().forEach((track) => track.stop());
      await refreshPermissions();
      void refreshMicDevices();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : isEnglish ? 'denied' : 'ditolak';
      setPermissionState((prev) => ({
        ...prev,
        [kind]: isEnglish ? `denied — ${message}` : `ditolak — ${message}`,
      }));
    } finally {
      setPermissionBusy(null);
    }
  };

  const requestNotification = async () => {
    setPermissionBusy('notifications');
    try {
      if (isNativeAndroid()) {
        const result = await requestNotificationPermission();
        setPermissionState((prev) => ({
          ...prev,
          notifications: result.granted
            ? 'granted'
            : isEnglish
            ? result.message
              ? `denied — ${result.message}`
              : 'denied'
            : result.message
            ? `ditolak — ${result.message}`
            : 'ditolak',
        }));
        return;
      }
      if (typeof Notification === 'undefined') {
        setPermissionState((prev) => ({
          ...prev,
          notifications: isEnglish ? 'unavailable' : 'tidak tersedia',
        }));
        return;
      }
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
      await refreshPermissions();
    } finally {
      setPermissionBusy(null);
    }
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
        setCacheMessage(
          isEnglish
            ? 'Cache Storage unavailable in this environment.'
            : 'Cache Storage tidak tersedia pada lingkungan ini.'
        );
        return;
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      setCacheMessage(
        isEnglish
          ? `${keys.length} cache entries cleared. Presets and settings unchanged.`
          : `${keys.length} entri cache dihapus. Preset & pengaturan tetap aman.`
      );
      void refreshStorage();
    } catch {
      setCacheMessage(
        isEnglish ? 'Failed to clear application cache.' : 'Gagal membersihkan cache aplikasi.'
      );
    }
  };

  // Diagnostic-only device test (never auto-applies settings)
  const runDeviceTest = () => {
    setDeviceTestRunning(true);
    setRecommendationFeedback(null);
    try {
      const result = measureDeviceCapabilities();
      setDeviceTest(result);
    } finally {
      setDeviceTestRunning(false);
    }
  };

  // Single direct action: runs hardware check and immediately applies recommended resolution, FPS, and bitrate
  const handleApplyRecommendationsDirect = async () => {
    setApplyRecRunning(true);
    setRecommendationFeedback(null);
    try {
      const result = measureDeviceCapabilities();
      setDeviceTest(result);
      const saved = await handleUpdateMany({
        targetResolution: result.recommendedResolution,
        frameRate: result.recommendedFrameRate,
        videoBitrateKbps: result.recommendedBitrateKbps,
      });
      if (!isMountedRef.current) return;
      if (saved) {
        setRecommendationFeedback({
          kind: 'success',
          message: isEnglish
            ? `Applied ${result.recommendedResolution} · ${result.recommendedFrameRate} FPS · ${result.recommendedBitrateKbps} Kbps based on hardware inspection.`
            : `Berhasil menerapkan ${result.recommendedResolution} · ${result.recommendedFrameRate} FPS · ${result.recommendedBitrateKbps} Kbps sesuai hasil perangkat.`,
        });
      } else {
        setRecommendationFeedback({
          kind: 'error',
          message: isEnglish
            ? 'Device checked, but failed to save recommended settings to storage.'
            : 'Perangkat diperiksa, namun gagal menyimpan pengaturan rekomendasi.',
        });
      }
    } catch {
      if (!isMountedRef.current) return;
      setRecommendationFeedback({
        kind: 'error',
        message: isEnglish
          ? 'Failed to inspect device or apply recommendations.'
          : 'Gagal memeriksa perangkat atau menerapkan rekomendasi.',
      });
    } finally {
      if (isMountedRef.current) setApplyRecRunning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) {
        showSaveStatus(
          isEnglish
            ? 'Backup file is empty or unreadable'
            : 'File cadangan kosong atau tidak dapat dibaca',
          'error'
        );
        return;
      }
      const success = await onImportData(content);
      if (!isMountedRef.current) return;
      if (success) {
        showSaveStatus(
          isEnglish
            ? 'Backup restored — device credentials preserved'
            : 'Cadangan dipulihkan — kredensial perangkat ini dipertahankan',
          'success'
        );
      } else {
        showSaveStatus(
          isEnglish
            ? 'Failed to restore backup: invalid JSON format'
            : 'Gagal memulihkan cadangan: format JSON tidak valid',
          'error'
        );
      }
    };
    reader.onerror = () => {
      showSaveStatus(
        isEnglish ? 'Failed to read backup file' : 'Gagal membaca file cadangan',
        'error'
      );
    };
    reader.readAsText(file);
  };

  const diagnosticsLines = [
    `${isEnglish ? 'Application' : 'Aplikasi'}: SYNTXRR STREAM ${APP_VERSION}`,
    `Package: com.syntxrr.streamtools`,
    `${isEnglish ? 'Native Android runtime' : 'Runtime native Android'}: ${
      nativeAndroid ? (isEnglish ? 'yes' : 'ya') : isEnglish ? 'no' : 'tidak'
    }`,
    `Platform: ${navigator.platform || (isEnglish ? 'unknown' : 'tidak diketahui')}`,
    `Logical cores: ${
      deviceTest?.cores ??
      navigator.hardwareConcurrency ??
      (isEnglish ? 'unreadable' : 'tidak terbaca')
    }`,
    `Device memory: ${
      deviceTest?.memoryGB
        ? `${deviceTest.memoryGB} GB`
        : isEnglish
        ? 'unreadable'
        : 'tidak terbaca'
    }`,
    `WebGL renderer: ${
      deviceTest?.webglRenderer ?? (isEnglish ? 'unreadable' : 'tidak terbaca')
    }`,
    `Max texture: ${
      deviceTest?.maxTextureSize ?? (isEnglish ? 'unreadable' : 'tidak terbaca')
    }`,
    `${isEnglish ? 'Storage' : 'Penyimpanan'}: ${
      storageInfo
        ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}`
        : isEnglish
        ? 'unreadable'
        : 'tidak terbaca'
    }`,
    `${isEnglish ? 'Camera permission' : 'Izin kamera'}: ${
      permissionState.camera ?? (isEnglish ? 'not checked' : 'belum diperiksa')
    }`,
    `${isEnglish ? 'Microphone permission' : 'Izin mikrofon'}: ${
      permissionState.microphone ?? (isEnglish ? 'not checked' : 'belum diperiksa')
    }`,
    `${isEnglish ? 'Notification permission' : 'Izin notifikasi'}: ${
      permissionState.notifications ?? (isEnglish ? 'not checked' : 'belum diperiksa')
    }`,
    `${isEnglish ? 'Overlay permission' : 'Izin overlay'}: ${
      overlayGranted === null
        ? isEnglish
          ? 'not applicable / not checked'
          : 'tidak berlaku / belum diperiksa'
        : overlayGranted
        ? isEnglish
          ? 'granted'
          : 'diizinkan'
        : isEnglish
        ? 'not granted'
        : 'belum diizinkan'
    }`,
    `${isEnglish ? 'Active mode' : 'Mode aktif'}: ${settings.operatingMode}`,
    `User agent: ${
      typeof navigator !== 'undefined'
        ? navigator.userAgent
        : isEnglish
        ? 'unavailable'
        : 'tidak tersedia'
    }`,
  ];

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsLines.join('\n'));
      setDiagnosticsMessage(
        isEnglish ? 'Diagnostics copied to clipboard.' : 'Diagnostik disalin ke clipboard.'
      );
    } catch {
      setDiagnosticsMessage(
        isEnglish
          ? 'Clipboard unavailable; copy manually below.'
          : 'Clipboard tidak tersedia; salin manual di bawah.'
      );
    }
  };

  const warnings = computeWarnings(settings, isEnglish);
  const rtmpValidation = validateModeBRtmpConfig(settings.rtmpServer, settings.streamKey);
  const currentAudioSource: ModeBAudioSource =
    settings.modeBAudioSource === 'internal' || settings.modeBAudioSource === 'microphone'
      ? settings.modeBAudioSource
      : 'mix';

  const hudPanelMenus: Array<{ id: string; name: string; detail: string; status: UiStatus }> = [
    {
      id: 'chat',
      name: '1. Chat',
      detail: isEnglish
        ? 'Chat, gifts, likes & follows.'
        : 'Chat, gift, like & follow.',
      status: 'not_connected',
    },
    {
      id: 'soundboard',
      name: '2. Soundboard',
      detail: isEnglish
        ? 'Studio sounds & TTS volume.'
        : 'Suara Studio & volume TTS.',
      status: 'pending',
    },
    {
      id: 'music',
      name: '3. Music',
      detail: isEnglish
        ? 'Playback, volume & queue.'
        : 'Pemutar, volume & antrean.',
      status: 'pending',
    },
    {
      id: 'mixer',
      name: '4. Audio Mixer',
      detail: isEnglish
        ? 'Mic mute & input level.'
        : 'Mute mic & level input.',
      status: 'pending',
    },
  ];

  // Single-language strictly enforced categories (5 categories; About excluded from category list)
  const categories: Array<{
    id: SettingsCategoryId;
    icon: React.ElementType;
    shortTitle: string;
    title: string;
    description: string;
    liveSummary: string;
  }> = [
    {
      id: 'general',
      icon: SlidersHorizontal,
      shortTitle: isEnglish ? 'General' : 'Umum',
      title: isEnglish ? 'General' : 'Umum',
      description: isEnglish ? 'Language, haptics & safety' : 'Bahasa, getar & konfirmasi',
      liveSummary: `${(settings.language ?? 'id-ID') === 'en-US' ? 'English' : 'Indonesia'} · ${
        settings.hapticFeedback
          ? isEnglish
            ? 'Haptic On'
            : 'Getar On'
          : isEnglish
          ? 'Haptic Off'
          : 'Getar Off'
      }`,
    },
    {
      id: 'audio',
      icon: Mic,
      shortTitle: 'Audio',
      title: isEnglish ? 'Audio & Microphone' : 'Audio & Mikrofon',
      description: isEnglish ? 'Input device, live meter & DSP' : 'Input, meter tes & DSP',
      liveSummary: `${settings.micGain ?? 100}% · ${
        [settings.noiseSuppression, settings.micEchoCancellation, settings.micAutoGainControl].filter(
          Boolean
        ).length
      }/3 DSP`,
    },
    {
      id: 'hud',
      icon: PanelRight,
      shortTitle: 'HUD',
      title: 'Floating HUD',
      description: isEnglish ? 'Bubble size, edge & panels' : 'Bubble, posisi & panel',
      liveSummary: `${settings.hudButtonSize ?? 48}dp · ${settings.hudOpacity ?? 92}%`,
    },
    {
      id: 'performance',
      icon: Monitor,
      shortTitle: isEnglish ? 'Graphics' : 'Grafis',
      title: isEnglish ? 'Graphics & Performance' : 'Grafis & Performa',
      description: isEnglish ? 'Profile, bitrate & RTMP' : 'Profil, bitrate & RTMP',
      liveSummary: `${settings.targetResolution} · ${settings.frameRate}fps`,
    },
    {
      id: 'system',
      icon: Lock,
      shortTitle: isEnglish ? 'System' : 'Sistem',
      title: isEnglish ? 'System' : 'Sistem',
      description: isEnglish ? 'Permissions, cache & backup' : 'Izin, cache & cadangan',
      liveSummary: storageInfo
        ? formatBytes(storageInfo.usage)
        : isEnglish
        ? 'Permissions'
        : 'Izin & JSON',
    },
  ];

  return (
    <div className="space-y-3 pb-2">
      {/* Compact floating saveStatus feedback (replaces removed internal header without taking layout height) */}
      {saveStatus && (
        <div
          role="status"
          aria-live="polite"
          className="anim-pop-in fixed z-30 right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+58px)] xl:bottom-5 xl:right-6 min-h-[34px] max-w-[calc(100vw-24px)] text-[11px] font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 border shadow-lg backdrop-blur-md"
          style={
            saveStatus.kind === 'success'
              ? {
                  color: 'var(--app-ok)',
                  backgroundColor: 'color-mix(in srgb, var(--app-surface) 92%, var(--app-ok-soft))',
                  borderColor: 'color-mix(in srgb, var(--app-ok) 45%, transparent)',
                }
              : saveStatus.kind === 'error'
              ? {
                  color: 'var(--app-error)',
                  backgroundColor:
                    'color-mix(in srgb, var(--app-surface) 92%, var(--app-error-soft))',
                  borderColor: 'color-mix(in srgb, var(--app-error) 50%, transparent)',
                }
              : {
                  color: 'var(--app-text-secondary)',
                  backgroundColor: 'var(--app-surface-elevated)',
                  borderColor: 'var(--app-border-strong)',
                }
          }
        >
          {saveStatus.kind === 'success' ? (
            <Check className="w-3.5 h-3.5 shrink-0" />
          ) : saveStatus.kind === 'error' ? (
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Database className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate">{saveStatus.message}</span>
        </div>
      )}

      {/* Mobile Sticky 3-Column Category Matrix (< lg) — 5 Categories + 1 Intentionally Empty Slot */}
      <div className="lg:hidden sticky z-20 top-[calc(env(safe-area-inset-top,0px)+47px)] sm:top-[calc(env(safe-area-inset-top,0px)+53px)] -mx-2.5 sm:-mx-6 px-2.5 sm:px-6 pt-1 pb-2 bg-[var(--app-bg)]/95 backdrop-blur-md border-b border-[var(--app-border)]">
        <nav
          aria-label={isEnglish ? 'Settings categories' : 'Kategori pengaturan'}
          className="grid grid-cols-3 gap-1.5"
        >
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                aria-current={active ? 'page' : undefined}
                className={`btn-press min-h-[44px] px-2 py-1.5 rounded-xl border text-left flex flex-col justify-center gap-0.5 min-w-0 ${
                  active
                    ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-text)]'
                    : 'bg-[var(--app-surface)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className={`text-[11px] leading-tight truncate ${active ? 'font-bold' : 'font-semibold'}`}>
                    {cat.shortTitle}
                  </span>
                </div>
                <span className="text-[9px] leading-tight font-mono-num text-[var(--app-text-muted)] truncate">
                  {cat.liveSummary}
                </span>
              </button>
            );
          })}
          {/* Intentionally empty 6th slot in 3x2 mobile grid for future feature expansion */}
          <div aria-hidden="true" className="min-h-[44px]" />
        </nav>
      </div>

      {/* Desktop Two-Column Split (lg+) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Sticky Left Navigation Rail (lg+) */}
        <aside className="hidden lg:block lg:col-span-4 sticky top-[calc(env(safe-area-inset-top,0px)+68px)]">
          <nav
            aria-label={isEnglish ? 'Settings categories' : 'Kategori pengaturan'}
            className="rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] p-1.5 space-y-1"
            style={{ boxShadow: 'var(--app-shadow)' }}
          >
            {categories.map((cat) => {
              const Icon = cat.icon;
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`btn-press w-full min-h-[46px] px-2.5 py-1.5 rounded-lg border text-left flex items-center gap-2.5 ${
                    active
                      ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent-border)] text-[var(--app-text)]'
                      : 'bg-transparent border-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)]'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                      active
                        ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-text)]'
                        : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-xs font-bold leading-tight truncate ${
                        active ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-text)]'
                      }`}
                    >
                      {cat.title}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] truncate">
                      {cat.description}
                    </div>
                  </div>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-5 rounded-full bg-[var(--app-accent)] shrink-0"
                    />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--app-text-muted)] shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Active Configuration Workspace — Rendered strictly only after user picks a category */}
        {activeCategory !== null && (
          <div
            key={activeCategory}
            className="anim-tab-panel lg:col-span-8 space-y-3 min-w-0"
          >
            {/* ============================ 1. GENERAL ============================ */}
            {activeCategory === 'general' && (
              <ConsolePanel
                icon={SlidersHorizontal}
                title={isEnglish ? 'General' : 'Umum'}
                subtitle={
                  isEnglish
                    ? 'Language, haptics & live end confirmation'
                    : 'Bahasa, umpan balik getar & konfirmasi siaran'
                }
              >
                <DenseRow
                  title={t('settings.language.title', 'Bahasa Antarmuka')}
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
                </DenseRow>

                <FieldRow
                  title={isEnglish ? 'Haptic Feedback' : 'Umpan Balik Getar'}
                  hint={
                    isEnglish
                      ? 'Short vibration on primary controls'
                      : 'Getar singkat saat kontrol ditekan'
                  }
                  status={isHapticSupported() ? 'functional' : 'not_supported'}
                  control={
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isHapticSupported()) {
                            showSaveStatus(
                              t(
                                'settings.haptic.unsupported',
                                'Perangkat ini tidak mendukung getar melalui WebView'
                              ),
                              'error'
                            );
                            return;
                          }
                          const ok = vibrateNow('medium');
                          showSaveStatus(
                            ok
                              ? t('settings.haptic.success', 'Getar uji dikirim ke perangkat')
                              : t('settings.haptic.fail', 'Perangkat menolak permintaan getar'),
                            ok ? 'success' : 'error'
                          );
                        }}
                        className="btn-press min-h-[44px] px-3 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text)] whitespace-nowrap"
                      >
                        {t('settings.haptic.test', 'Uji Getar')}
                      </button>
                      <Toggle
                        label={isEnglish ? 'Haptic feedback' : 'Umpan balik getar'}
                        checked={!!settings.hapticFeedback}
                        onChange={(value) => handleUpdate('hapticFeedback', value)}
                      />
                    </>
                  }
                />

                <FieldRow
                  title={t('settings.confirmEnd.title', 'Konfirmasi Sebelum Mengakhiri LIVE')}
                  hint={
                    settings.confirmBeforeEndLive
                      ? isEnglish
                        ? 'Ask confirmation before stopping Mode B stream'
                        : 'Minta konfirmasi sebelum hentikan siaran Mode B'
                      : isEnglish
                      ? 'Stop Mode B stream immediately without prompt'
                      : 'Hentikan siaran Mode B langsung tanpa konfirmasi'
                  }
                  status="functional"
                  control={
                    <Toggle
                      label={t('settings.confirmEnd.title', 'Konfirmasi sebelum mengakhiri LIVE')}
                      checked={!!settings.confirmBeforeEndLive}
                      onChange={(value) => handleUpdate('confirmBeforeEndLive', value)}
                    />
                  }
                />
              </ConsolePanel>
            )}

            {/* ======================= 2. AUDIO & MICROPHONE ======================= */}
            {activeCategory === 'audio' && (
              <ConsolePanel
                icon={Mic}
                title={isEnglish ? 'Audio & Microphone' : 'Audio & Mikrofon'}
                subtitle={
                  isEnglish
                    ? 'Input device, live level meter & DSP'
                    : 'Perangkat input, meter tes & pemrosesan suara'
                }
                action={<StatusBadge status="functional" />}
              >
                {/* Live Mic Meter & Start/Stop */}
                <div className="py-1 pb-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2.5">
                    {micTestActive ? (
                      <button
                        type="button"
                        onClick={stopMicTest}
                        className="btn-press min-h-[44px] px-3.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                        style={{
                          backgroundColor: 'var(--app-error-soft)',
                          borderColor: 'color-mix(in srgb, var(--app-error) 50%, transparent)',
                          color: 'var(--app-error)',
                        }}
                      >
                        <Square className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('settings.micTest.stop', 'Hentikan Tes')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startMicTest()}
                        className="btn-press min-h-[44px] px-4 rounded-lg bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('settings.micTest.start', 'Mulai Tes Mikrofon')}</span>
                      </button>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="text-[var(--app-text-muted)] truncate">
                          {micTestActive
                            ? t('settings.micTest.level', 'Level input:')
                            : t('settings.micTest.idle', 'Tes tidak berjalan')}
                        </span>
                        <span className="font-mono-num text-sm font-bold text-[var(--app-text)] shrink-0">
                          {micTestActive ? `${micLevel}%` : '0%'}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[var(--app-bg)] border border-[var(--app-border)] overflow-hidden p-0.5">
                        <div
                          className="h-full rounded-full transition-[width] duration-75"
                          style={{
                            width: `${micTestActive ? micLevel : 0}%`,
                            backgroundColor:
                              micLevel > 85
                                ? 'var(--app-error)'
                                : micLevel > 55
                                ? 'var(--app-warn)'
                                : 'var(--app-ok)',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {micError && (
                    <div
                      role="alert"
                      className="p-2 rounded-lg border text-xs flex items-start gap-2"
                      style={{
                        backgroundColor: 'var(--app-error-soft)',
                        borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
                        color: 'var(--app-error)',
                      }}
                    >
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="min-w-0 break-words">{micError}</span>
                    </div>
                  )}
                </div>

                {/* Microphone Device + Gain Slider (2 Columns) */}
                <div className="py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {t('settings.micSelect.title', 'Pemilihan Mikrofon')}
                      </label>
                      <StatusBadge status="functional" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={settings.microphoneDeviceId ?? ''}
                        onChange={(e) => handleUpdate('microphoneDeviceId', e.target.value)}
                        className="flex-1 min-w-0 min-h-[44px] px-2.5 py-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs focus:outline-none focus:border-[var(--app-accent)]"
                      >
                        <option value="">
                          {t('settings.micSelect.default', 'Mikrofon bawaan sistem (default)')}
                        </option>
                        {micDevices.map((device, index) => (
                          <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                            {device.label ||
                              (isEnglish
                                ? `Microphone ${index + 1} (label requires permission)`
                                : `Mikrofon ${index + 1} (label perlu izin)`)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void refreshMicDevices()}
                        title={t('settings.micSelect.reload', 'Muat Ulang')}
                        aria-label={t('settings.micSelect.reload', 'Muat Ulang')}
                        className="btn-press min-w-[44px] min-h-[44px] rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] inline-flex items-center justify-center shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {t('settings.micGain.title', 'Sensitivitas / Gain Input')}
                      </span>
                      <StatusBadge status="stored" />
                    </div>
                    <SliderRow
                      label={isEnglish ? 'Test meter gain' : 'Gain meter tes'}
                      value={settings.micGain ?? 100}
                      min={0}
                      max={200}
                      step={5}
                      suffix="%"
                      onChange={(value) => handleUpdate('micGain', value)}
                    />
                  </div>
                </div>

                {/* Audio DSP Controls (3-col Desktop / Compact Stack Mobile) */}
                <div className="py-2.5 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--app-text)]">
                      {t('settings.advancedMic.title', 'Pengaturan Mikrofon Lanjutan')}
                    </span>
                    <StatusBadge
                      status={
                        typeof navigator !== 'undefined' &&
                        navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression
                          ? 'functional'
                          : 'not_supported'
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--app-text)] truncate">
                          {isEnglish ? 'Noise Suppression' : 'Redam Kebisingan'}
                        </div>
                        <div className="text-[10px] text-[var(--app-text-muted)] truncate">
                          {isEnglish ? 'Background noise' : 'Kebisingan latar'}
                        </div>
                      </div>
                      <Toggle
                        label={isEnglish ? 'Noise suppression' : 'Redam kebisingan'}
                        checked={!!settings.noiseSuppression}
                        onChange={(value) => handleUpdate('noiseSuppression', value)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--app-text)] truncate">
                          {isEnglish ? 'Echo Cancellation' : 'Peredam Gema'}
                        </div>
                        <div className="text-[10px] text-[var(--app-text-muted)] truncate">
                          {t('settings.echoCancellation.desc', 'Kurangi gema speaker')}
                        </div>
                      </div>
                      <Toggle
                        label={isEnglish ? 'Echo cancellation' : 'Peredam gema'}
                        checked={!!settings.micEchoCancellation}
                        onChange={(value) => handleUpdate('micEchoCancellation', value)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--app-text)] truncate">
                          {isEnglish ? 'Auto Gain Control' : 'Kontrol Gain Otomatis'}
                        </div>
                        <div className="text-[10px] text-[var(--app-text-muted)] truncate">
                          {t('settings.autoGain.desc', 'Normalisasi volume otomatis')}
                        </div>
                      </div>
                      <Toggle
                        label={isEnglish ? 'Auto gain control' : 'Kontrol gain otomatis'}
                        checked={!!settings.micAutoGainControl}
                        onChange={(value) => handleUpdate('micAutoGainControl', value)}
                      />
                    </div>
                  </div>
                </div>
              </ConsolePanel>
            )}

            {/* ============================ 3. FLOATING HUD ============================ */}
            {activeCategory === 'hud' && (
              <ConsolePanel
                icon={PanelRight}
                title="Floating HUD"
                subtitle={t(
                  'settings.secC.subtitle',
                  'Tombol mengambang dan panel satu tangan untuk Mode A dan Mode B'
                )}
                action={<StatusBadge status={nativeAndroid ? 'pending' : 'not_supported'} />}
              >
                {/* Master Switch + Preview & Native Bridge */}
                <div className="py-1 pb-2.5 space-y-2">
                  <FieldRow
                    title={t('settings.hudEnable.title', 'Aktifkan Floating HUD')}
                    hint={t(
                      'settings.hudEnable.desc',
                      'Preferensi tersimpan & langsung diterapkan ke bubble native.'
                    )}
                    control={
                      <Toggle
                        label={t('settings.hudEnable.title', 'Aktifkan Floating HUD')}
                        checked={!!settings.hudEnabled}
                        onChange={(value) => handleUpdate('hudEnabled', value)}
                      />
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                    <div className="px-3 py-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          aria-hidden="true"
                          className="rounded-full bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-mono-num font-bold text-[10px] flex items-center justify-center shrink-0 border border-[var(--app-accent-border)] shadow-sm transition-all"
                          style={{
                            width: `${Math.min(44, settings.hudButtonSize ?? 48)}px`,
                            height: `${Math.min(44, settings.hudButtonSize ?? 48)}px`,
                            opacity: (settings.hudOpacity ?? 92) / 100,
                          }}
                        >
                          {settings.hudButtonSize ?? 48}dp
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--app-text)] truncate">
                            {isEnglish ? 'Bubble Preview' : 'Pratinjau Bubble'}
                          </div>
                          <div className="text-[11px] font-mono-num text-[var(--app-text-muted)] truncate">
                            {settings.hudButtonSize ?? 48}dp · {settings.hudOpacity ?? 92}% ·{' '}
                            {(settings.hudPosition ?? 'right') === 'left'
                              ? t('settings.hudPosition.left', 'Kiri')
                              : t('settings.hudPosition.right', 'Kanan')}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono-num text-[var(--app-text-secondary)] shrink-0">
                        {settings.hudEnabled ? t('status.active', 'Aktif') : t('status.inactive', 'Off')}
                      </span>
                    </div>

                    {nativeAndroid ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await showFloatingHud({
                              sizeDp: settings.hudButtonSize ?? 48,
                              opacity: settings.hudOpacity ?? 92,
                              position: (settings.hudPosition ?? 'right') as 'left' | 'right',
                            });
                            setHudMessage(
                              result.message ??
                                (isEnglish
                                  ? 'Show HUD request sent.'
                                  : 'Permintaan tampilkan HUD dikirim.')
                            );
                          }}
                          className="btn-press min-h-[44px] px-2.5 rounded-lg bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{t('settings.hudEnable.show', 'Tampilkan HUD')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const result = await hideFloatingHud();
                            setHudMessage(
                              result.message ??
                                (isEnglish
                                  ? 'Hide HUD request sent.'
                                  : 'Permintaan sembunyikan HUD dikirim.')
                            );
                          }}
                          className="btn-press min-h-[44px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center justify-center gap-1.5"
                        >
                          <EyeOff className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{t('settings.hudEnable.hide', 'Sembunyikan HUD')}</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--app-text-muted)] px-1">
                        {t(
                          'settings.hudEnable.browserNote',
                          'Floating HUD native hanya tersedia pada APK Android. Di browser, preferensi tetap tersimpan.'
                        )}
                      </p>
                    )}
                  </div>

                  {hudMessage && (
                    <div
                      role="status"
                      className="p-2 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] text-xs text-[var(--app-accent-text)]"
                    >
                      {hudMessage}
                    </div>
                  )}
                </div>

                {/* Size, Opacity & Edge Position */}
                <div className="py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                  <SliderRow
                    label={t('settings.hudSize.title', 'Ukuran Tombol')}
                    value={settings.hudButtonSize ?? 48}
                    min={40}
                    max={64}
                    step={2}
                    suffix="dp"
                    onChange={(value) => handleUpdate('hudButtonSize', value)}
                  />
                  <SliderRow
                    label={t('settings.hudOpacity.title', 'Transparansi')}
                    value={settings.hudOpacity ?? 92}
                    min={30}
                    max={100}
                    step={1}
                    suffix="%"
                    onChange={(value) => handleUpdate('hudOpacity', value)}
                  />
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {t('settings.hudPosition.title', 'Posisi Tombol')}
                      </span>
                      <StatusBadge status={nativeAndroid ? 'functional' : 'not_supported'} />
                    </div>
                    <Segmented<HudPosition>
                      options={[
                        { value: 'left', label: t('settings.hudPosition.left', 'Kiri') },
                        { value: 'right', label: t('settings.hudPosition.right', 'Kanan') },
                      ]}
                      columns="grid-cols-2"
                      value={(settings.hudPosition ?? 'right') as HudPosition}
                      onChange={(value) => handleUpdate('hudPosition', value)}
                    />
                  </div>
                </div>

                {/* HUD Panel Display Toggles & Menu Matrix */}
                <div className="py-2.5 space-y-2">
                  <div className="text-xs font-semibold text-[var(--app-text)]">
                    {t('settings.hudPanels.title', 'Preferensi Tampilan Panel')}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
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
                        className="flex items-center justify-between gap-1.5 px-2.5 py-0.5 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)]"
                      >
                        <span className="text-xs font-medium text-[var(--app-text-secondary)] truncate">
                          {panel.label}
                        </span>
                        <Toggle
                          label={
                            isEnglish
                              ? `Show ${panel.label} menu`
                              : `Tampilkan menu ${panel.label}`
                          }
                          checked={!!settings[panel.key]}
                          onChange={(value) => handleUpdate(panel.key, value)}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {hudPanelMenus.map((menu) => (
                      <div
                        key={menu.id}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-between gap-2 min-w-0"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[var(--app-text)] truncate">
                            {menu.name}
                          </div>
                          <div className="text-[10px] text-[var(--app-text-muted)] truncate">
                            {menu.detail}
                          </div>
                        </div>
                        <StatusBadge status={menu.status} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Operational Boundaries */}
                <div className="py-2.5 last:pb-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    className="p-2.5 rounded-lg border space-y-1"
                    style={{
                      backgroundColor: 'var(--app-warn-soft)',
                      borderColor: 'color-mix(in srgb, var(--app-warn) 42%, transparent)',
                    }}
                  >
                    <div
                      className="flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: 'var(--app-warn)' }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('settings.hudRules.title', 'Batas Kemampuan Mode')}</span>
                    </div>
                    <p className="text-[11px] text-[var(--app-text-secondary)] leading-snug">
                      <strong className="text-[var(--app-text)]">Mode A:</strong>{' '}
                      {isEnglish
                        ? 'Official TikTok handles LIVE; SYNTXRR is companion.'
                        : 'TikTok menyiarkan LIVE; SYNTXRR pendamping HUD.'}
                    </p>
                    <p className="text-[11px] text-[var(--app-text-secondary)] leading-snug">
                      <strong className="text-[var(--app-text)]">Mode B:</strong>{' '}
                      {isEnglish
                        ? 'MediaProjection + RTMP controlled from Dashboard.'
                        : 'Encoder MediaProjection + RTMP dari Dashboard.'}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {t('settings.hudDeckRule.title', 'Aturan Stream Deck')}
                      </span>
                      <StatusBadge status="not_connected" />
                    </div>
                    <p className="text-[11px] text-[var(--app-text-secondary)] leading-snug">
                      {t(
                        'settings.hudDeckRule.desc',
                        'Stream Deck aktif → Floating HUD nonaktif, dan sebaliknya.'
                      )}
                    </p>
                  </div>
                </div>
              </ConsolePanel>
            )}

            {/* ================= 4. GRAPHICS & PERFORMANCE ================= */}
            {activeCategory === 'performance' && (
              <ConsolePanel
                icon={Monitor}
                title={isEnglish ? 'Graphics & Performance' : 'Grafis & Performa'}
                subtitle={
                  isEnglish
                    ? 'Device benchmark, resolution/FPS/bitrate, hardware & RTMP'
                    : 'Uji perangkat, resolusi/FPS/bitrate, hardware & RTMP'
                }
              >
                {/* Device Benchmark & Single Direct Apply Recommendations */}
                <DenseRow
                  title={
                    isEnglish
                      ? 'Device Check & Recommendations'
                      : 'Pemeriksaan & Rekomendasi Perangkat'
                  }
                  description={
                    isEnglish
                      ? 'Inspect CPU cores, memory, and WebGL GPU, then apply or review diagnostics.'
                      : 'Periksa core CPU, memori, dan GPU WebGL untuk diagnostik atau penerapan otomatis.'
                  }
                  status="functional"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApplyRecommendationsDirect()}
                      disabled={applyRecRunning || deviceTestRunning}
                      className="btn-press min-h-[44px] px-4 rounded-lg bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {applyRecRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {applyRecRunning
                          ? isEnglish
                            ? 'Inspecting & Applying…'
                            : 'Memeriksa & Menerapkan…'
                          : isEnglish
                          ? 'Apply Recommendations'
                          : 'Terapkan Rekomendasi'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={runDeviceTest}
                      disabled={deviceTestRunning || applyRecRunning}
                      className="btn-press min-h-[44px] px-3.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Cpu className="w-3.5 h-3.5 shrink-0 text-[var(--app-text-muted)]" />
                      <span>
                        {deviceTestRunning
                          ? t('settings.deviceTest.running', 'Menguji…')
                          : t('settings.deviceTest.run', 'Jalankan Uji Perangkat')}
                      </span>
                    </button>

                    {deviceTest && (
                      <span className="text-[11px] font-mono-num text-[var(--app-text-muted)]">
                        {new Date(deviceTest.testedAt).toLocaleTimeString(
                          isEnglish ? 'en-US' : 'id-ID'
                        )}
                      </span>
                    )}
                  </div>

                  {recommendationFeedback && (
                    <div
                      role="status"
                      className="p-2 rounded-lg border text-xs flex items-center gap-2"
                      style={
                        recommendationFeedback.kind === 'success'
                          ? {
                              backgroundColor: 'var(--app-ok-soft)',
                              borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                              color: 'var(--app-ok)',
                            }
                          : {
                              backgroundColor: 'var(--app-error-soft)',
                              borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
                              color: 'var(--app-error)',
                            }
                      }
                    >
                      {recommendationFeedback.kind === 'success' ? (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 break-words">{recommendationFeedback.message}</span>
                    </div>
                  )}

                  {deviceTest ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {[
                        {
                          label: 'Logical cores',
                          value: deviceTest.cores ?? (isEnglish ? 'unreadable' : 'tidak terbaca'),
                        },
                        {
                          label: 'Memory',
                          value: deviceTest.memoryGB
                            ? `${deviceTest.memoryGB} GB`
                            : isEnglish
                            ? 'unreadable'
                            : 'tidak terbaca',
                        },
                        {
                          label: isEnglish ? 'Recommended' : 'Rekomendasi',
                          value: `${deviceTest.recommendedResolution} · ${deviceTest.recommendedFrameRate}fps · ${deviceTest.recommendedBitrateKbps}k`,
                        },
                        {
                          label: 'Max texture',
                          value:
                            deviceTest.maxTextureSize ??
                            (isEnglish ? 'unreadable' : 'tidak terbaca'),
                        },
                        { label: 'Platform', value: deviceTest.platform },
                        {
                          label: 'WebGL GPU',
                          value:
                            deviceTest.webglRenderer ??
                            (isEnglish ? 'unreadable' : 'tidak terbaca'),
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0"
                        >
                          <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-[var(--app-text)] font-mono-num truncate">
                            {String(item.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--app-text-muted)]">
                      {t(
                        'settings.deviceTest.notTested',
                        'Belum ada hasil uji. Tidak ada nilai sebelum pengujian dijalankan.'
                      )}
                    </p>
                  )}
                </DenseRow>

                {/* Resolution, FPS & Bitrates */}
                <div className="py-2.5 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--app-text)] mb-1">
                        {t('settings.manualRes.title', 'Resolusi Manual')}
                      </label>
                      <Segmented<ResolutionTarget>
                        options={[
                          { value: '720p', label: '720p', hint: isEnglish ? 'Eco' : 'Hemat' },
                          { value: '1080p', label: '1080p', hint: isEnglish ? 'Ideal' : 'Ideal' },
                          { value: '1440p', label: '1440p', hint: isEnglish ? 'Heavy' : 'Berat' },
                        ]}
                        value={settings.targetResolution}
                        onChange={(value) => handleUpdate('targetResolution', value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--app-text)] mb-1">
                        {t('settings.manualFps.title', 'FPS Manual')}
                      </label>
                      <Segmented<FrameRate>
                        options={[
                          { value: 30, label: '30 FPS', hint: isEnglish ? 'Eco' : 'Hemat' },
                          { value: 60, label: '60 FPS', hint: isEnglish ? 'Smooth' : 'Mulus' },
                        ]}
                        columns="grid-cols-2"
                        value={settings.frameRate}
                        onChange={(value) => handleUpdate('frameRate', value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SliderRow
                      label={t('settings.videoBitrate.title', 'Bitrate Video')}
                      value={settings.videoBitrateKbps}
                      min={2500}
                      max={9000}
                      step={500}
                      suffix="Kbps"
                      onChange={(value) => handleUpdate('videoBitrateKbps', value)}
                    />
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

                  {warnings.length > 0 ? (
                    <div
                      role="alert"
                      className="p-2.5 rounded-lg border space-y-1"
                      style={{
                        backgroundColor: 'var(--app-warn-soft)',
                        borderColor: 'color-mix(in srgb, var(--app-warn) 45%, transparent)',
                      }}
                    >
                      <div
                        className="flex items-center gap-1.5 text-xs font-bold"
                        style={{ color: 'var(--app-warn)' }}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('settings.warnings.title', 'Peringatan Konfigurasi')}</span>
                      </div>
                      <ul className="text-[11px] text-[var(--app-text-secondary)] space-y-0.5 list-disc pl-4">
                        {warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p
                      className="text-[11px] flex items-center gap-1.5 font-medium"
                      style={{ color: 'var(--app-ok)' }}
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {t('settings.warnings.none', 'Tidak ada konfigurasi berisiko terdeteksi.')}
                      </span>
                    </p>
                  )}
                </div>

                {/* Performance Profile & Hardware GPU */}
                <div className="py-2.5 space-y-2">
                  <div className="text-xs font-bold text-[var(--app-text)]">
                    {t('settings.profile.title', 'Profil Performa & Hardware')}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        {
                          id: 'battery_saver',
                          name: t('settings.profile.battery', 'Hemat'),
                          desc: isEnglish ? 'Stable temp' : 'Suhu stabil',
                          icon: Battery,
                        },
                        {
                          id: 'balanced',
                          name: t('settings.profile.balanced', 'Seimbang'),
                          desc: isEnglish ? 'Long 1080p' : '1080p stabil',
                          icon: Cpu,
                        },
                        {
                          id: 'performance',
                          name: t('settings.profile.performance', 'Maksimal'),
                          desc: isEnglish ? 'Low latency' : 'Latensi rendah',
                          icon: Flame,
                        },
                      ] as const
                    ).map((profile) => {
                      const Icon = profile.icon;
                      const isSelected = settings.performanceProfile === profile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() =>
                            handleUpdate('performanceProfile', profile.id as PerformanceProfile)
                          }
                          aria-pressed={isSelected}
                          className={`btn-press min-h-[50px] p-2 rounded-lg text-left border ${
                            isSelected
                              ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent-border)] text-[var(--app-text)]'
                              : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected
                                  ? 'text-[var(--app-accent-text)]'
                                  : 'text-[var(--app-text-muted)]'
                              }`}
                            />
                            <span
                              className={`text-xs font-bold truncate ${
                                isSelected ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-text)]'
                              }`}
                            >
                              {profile.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--app-text-muted)] truncate mt-0.5">
                            {profile.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <FieldRow
                    title={t('settings.gpuAccel.title', 'Akselerasi Hardware GPU')}
                    hint={t(
                      'settings.gpuAccel.desc',
                      'Gunakan MediaCodec H.264 / HEVC hardware jika tersedia'
                    )}
                    control={
                      <Toggle
                        label={t('settings.gpuAccel.title', 'Akselerasi Hardware GPU')}
                        checked={!!settings.hardwareAcceleration}
                        onChange={(value) => handleUpdate('hardwareAcceleration', value)}
                      />
                    }
                  />
                </div>

                {/* Mode B RTMP / RTMPS Output */}
                <div className="py-2.5 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Radio className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
                      <span className="text-xs font-bold text-[var(--app-text)] truncate">
                        {t('settings.rtmp.title', 'Output Siaran Mode B (RTMP / RTMPS)')}
                      </span>
                    </div>
                    <StatusBadge
                      status={
                        rtmpValidation.valid
                          ? nativeAndroid
                            ? 'functional'
                            : 'stored'
                          : 'not_connected'
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[var(--app-text-secondary)] font-medium mb-1 text-xs">
                        {t('settings.rtmp.url', 'URL Server RTMP')}
                      </label>
                      <input
                        type="text"
                        value={settings.rtmpServer}
                        onChange={(e) => handleUpdate('rtmpServer', e.target.value)}
                        placeholder="rtmp://live.twitch.tv/app"
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--app-surface-muted)] border text-[var(--app-text)] font-mono-num text-xs focus:outline-none focus:border-[var(--app-accent)]"
                        style={{
                          borderColor: rtmpValidation.serverError
                            ? 'color-mix(in srgb, var(--app-warn) 70%, transparent)'
                            : 'var(--app-border-strong)',
                        }}
                      />
                      {rtmpValidation.serverError && (
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--app-warn)' }}>
                          {rtmpValidation.serverError}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[var(--app-text-secondary)] font-medium text-xs">
                          {isEnglish ? 'Stream Key' : 'Kunci Siaran'}
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowStreamKey(!showStreamKey)}
                          className="min-h-[24px] px-1.5 text-[11px] font-semibold text-[var(--app-accent-text)] hover:underline inline-flex items-center gap-1"
                        >
                          {showStreamKey ? (
                            <>
                              <EyeOff className="w-3 h-3" />
                              <span>{t('settings.rtmp.hide', 'Sembunyikan')}</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>{t('settings.rtmp.show', 'Tampilkan')}</span>
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        type={showStreamKey ? 'text' : 'password'}
                        value={settings.streamKey}
                        onChange={(e) => handleUpdate('streamKey', e.target.value)}
                        placeholder={isEnglish ? 'Platform stream key...' : 'Kunci siaran platform...'}
                        autoComplete="off"
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--app-surface-muted)] border text-[var(--app-text)] font-mono-num text-xs focus:outline-none focus:border-[var(--app-accent)]"
                        style={{
                          borderColor: rtmpValidation.streamKeyError
                            ? 'color-mix(in srgb, var(--app-warn) 70%, transparent)'
                            : 'var(--app-border-strong)',
                        }}
                      />
                      {rtmpValidation.streamKeyError && (
                        <p className="mt-1 text-[11px]" style={{ color: 'var(--app-warn)' }}>
                          {rtmpValidation.streamKeyError}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[var(--app-text-secondary)] font-medium text-xs mb-1">
                      {isEnglish ? 'Mode B Audio Source' : 'Sumber Audio Mode B'}
                    </label>
                    <Segmented<ModeBAudioSource>
                      options={[
                        {
                          value: 'mix',
                          label: isEnglish ? 'Mixed' : 'Campuran',
                          hint: isEnglish ? 'Sys + Mic' : 'Sistem + Mic',
                        },
                        {
                          value: 'internal',
                          label: 'Internal',
                          hint: 'Android 10+',
                        },
                        {
                          value: 'microphone',
                          label: isEnglish ? 'Mic' : 'Mikrofon',
                          hint: isEnglish ? 'Mic only' : 'Mic saja',
                        },
                      ]}
                      value={currentAudioSource}
                      onChange={(value) => handleUpdate('modeBAudioSource', value)}
                    />
                  </div>
                </div>
              </ConsolePanel>
            )}

            {/* =============================== 5. SYSTEM =============================== */}
            {activeCategory === 'system' && (
              <ConsolePanel
                icon={Lock}
                title={isEnglish ? 'System' : 'Sistem'}
                subtitle={
                  isEnglish
                    ? 'Permissions, storage & cache, diagnostics & backup'
                    : 'Manajer izin, penyimpanan & cache, diagnostik & cadangan'
                }
              >
                {/* Permissions Manager 2x2 Grid */}
                <DenseRow
                  title={isEnglish ? 'Permissions Manager' : 'Manajer Izin'}
                  status="functional"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {[
                      {
                        key: 'camera',
                        label: t('settings.permissions.camera', 'Kamera'),
                        status: permissionState.camera ?? (isEnglish ? 'checking…' : 'memeriksa…'),
                        busy: permissionBusy === 'camera',
                        disabled: false,
                        btnLabel: t('settings.permissions.request', 'Minta Izin'),
                        onClick: () => void requestMediaPermission('camera'),
                      },
                      {
                        key: 'microphone',
                        label: t('settings.permissions.mic', 'Mikrofon'),
                        status:
                          permissionState.microphone ?? (isEnglish ? 'checking…' : 'memeriksa…'),
                        busy: permissionBusy === 'microphone',
                        disabled: false,
                        btnLabel: t('settings.permissions.request', 'Minta Izin'),
                        onClick: () => void requestMediaPermission('microphone'),
                      },
                      {
                        key: 'notifications',
                        label: t('settings.permissions.notif', 'Notifikasi'),
                        status:
                          permissionState.notifications ??
                          (isEnglish ? 'checking…' : 'memeriksa…'),
                        busy: permissionBusy === 'notifications',
                        disabled: false,
                        btnLabel: t('settings.permissions.request', 'Minta Izin'),
                        onClick: () => void requestNotification(),
                      },
                      {
                        key: 'overlay',
                        label: isEnglish ? 'Overlay HUD' : 'Overlay HUD',
                        status:
                          overlayGranted === null
                            ? nativeAndroid
                              ? isEnglish
                                ? 'checking…'
                                : 'memeriksa…'
                              : isEnglish
                              ? 'Android APK only'
                              : 'Khusus APK Android'
                            : overlayGranted
                            ? isEnglish
                              ? 'granted'
                              : 'diizinkan'
                            : isEnglish
                            ? 'not granted'
                            : 'belum diizinkan',
                        busy: false,
                        disabled: !nativeAndroid,
                        btnLabel: overlayGranted
                          ? t('settings.permissions.recheck', 'Periksa Ulang')
                          : t('settings.permissions.request', 'Minta Izin'),
                        onClick: () => void askOverlayPermission(),
                      },
                    ].map((perm) => (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)]"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--app-text)] truncate">
                            {perm.label}
                          </div>
                          <div className="text-[10px] text-[var(--app-text-muted)] font-mono-num truncate">
                            {perm.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={perm.onClick}
                          disabled={perm.busy || perm.disabled}
                          className="btn-press min-h-[44px] px-2.5 rounded-lg bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text)] disabled:opacity-50 shrink-0"
                        >
                          {perm.busy
                            ? isEnglish
                              ? 'Requesting…'
                              : 'Meminta…'
                            : perm.btnLabel}
                        </button>
                      </div>
                    ))}
                  </div>
                </DenseRow>

                {/* Storage & Cache + JSON Backup & Restore (Side-by-side on sm+) */}
                <div className="py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {t('settings.storage.title', 'Penyimpanan & Cache')}
                      </span>
                      <StatusBadge status={storageInfo ? 'functional' : 'pending'} />
                    </div>
                    {storageInfo && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-[var(--app-text-secondary)]">
                          <span>{t('settings.storage.used', 'Terpakai')}</span>
                          <span className="font-mono-num font-semibold text-[var(--app-text)]">
                            {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--app-bg)] border border-[var(--app-border)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--app-accent)]"
                            style={{
                              width: `${Math.min(
                                100,
                                storageInfo.quota > 0
                                  ? (storageInfo.usage / storageInfo.quota) * 100
                                  : 0
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void clearAppCache()}
                        className="btn-press flex-1 min-h-[44px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center justify-center gap-1.5 min-w-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--app-error)] shrink-0" />
                        <span className="truncate">
                          {isEnglish ? 'Clear Cache' : 'Hapus Cache'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshStorage()}
                        aria-label={t('settings.storage.refresh', 'Segarkan')}
                        title={t('settings.storage.refresh', 'Segarkan')}
                        className="btn-press min-w-[44px] min-h-[44px] rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] inline-flex items-center justify-center shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {cacheMessage && (
                      <p className="text-[11px] text-[var(--app-accent-text)] leading-snug">
                        {cacheMessage}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {t('settings.backup.title', 'Pencadangan & Pemulihan JSON')}
                      </span>
                      <StatusBadge status="functional" />
                    </div>
                    <p className="text-[11px] text-[var(--app-text-muted)] leading-snug">
                      {t(
                        'settings.backup.securityNote',
                        'File cadangan tidak memuat Stream Key atau kunci API.'
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={onExportData}
                        className="btn-press min-h-[44px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-semibold flex items-center justify-center gap-1.5 min-w-0"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
                        <span className="truncate">{isEnglish ? 'Export' : 'Ekspor'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-press min-h-[44px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-semibold flex items-center justify-center gap-1.5 min-w-0"
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-ok)' }} />
                        <span className="truncate">{isEnglish ? 'Restore' : 'Pulihkan'}</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".json,application/json"
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                {/* Integration API Credentials */}
                <DenseRow
                  title={t('settings.credentials.title', 'Kredensial Integrasi')}
                  status="stored"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[var(--app-text-secondary)] font-medium text-xs flex items-center gap-1.5 truncate">
                          <Music2 className="w-3.5 h-3.5 text-[var(--app-error)] shrink-0" />
                          <span className="truncate">
                            {t('settings.credentials.youtube', 'YouTube Data v3')}
                          </span>
                        </label>
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[var(--app-accent-text)] hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>{t('settings.credentials.get', 'Dapatkan')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="relative">
                        <input
                          type={showYouTubeKey ? 'text' : 'password'}
                          value={settings.youtubeApiKey || ''}
                          onChange={(e) => handleUpdate('youtubeApiKey', e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full min-h-[44px] px-3 py-2 pr-12 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border-strong)] text-[var(--app-text)] font-mono-num text-xs focus:outline-none focus:border-[var(--app-accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowYouTubeKey(!showYouTubeKey)}
                          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)] hover:text-[var(--app-text)] rounded-r-lg"
                          aria-label={
                            showYouTubeKey
                              ? isEnglish
                                ? 'Hide YouTube API key'
                                : 'Sembunyikan kunci API YouTube'
                              : isEnglish
                              ? 'Show YouTube API key'
                              : 'Tampilkan kunci API YouTube'
                          }
                        >
                          {showYouTubeKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[var(--app-text-secondary)] font-medium text-xs flex items-center gap-1.5 truncate">
                          <Music2 className="w-3.5 h-3.5 text-[var(--app-ok)] shrink-0" />
                          <span className="truncate">
                            {t('settings.credentials.spotify', 'Spotify Client ID')}
                          </span>
                        </label>
                        <a
                          href="https://developer.spotify.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[var(--app-accent-text)] hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>{t('settings.credentials.portal', 'Portal')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <input
                        type="text"
                        value={settings.spotifyClientId || ''}
                        onChange={(e) => handleUpdate('spotifyClientId', e.target.value)}
                        placeholder={
                          isEnglish ? '32-char Client ID...' : 'Client ID 32-karakter...'
                        }
                        className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border-strong)] text-[var(--app-text)] font-mono-num text-xs focus:outline-none focus:border-[var(--app-accent)]"
                      />
                    </div>
                  </div>
                </DenseRow>

                {/* Diagnostics Viewer */}
                <DenseRow
                  title={t('settings.diag.title', 'Diagnostik')}
                  status="functional"
                  action={
                    <button
                      type="button"
                      onClick={() => void copyDiagnostics()}
                      className="btn-press min-h-[36px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[11px] font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3 h-3 shrink-0" />
                      <span>{t('settings.diag.copy', 'Salin Diagnostik')}</span>
                    </button>
                  }
                >
                  <div className="max-h-28 overflow-y-auto rounded-lg bg-[var(--app-bg)] border border-[var(--app-border)] p-2">
                    <ul className="space-y-0.5">
                      {diagnosticsLines.map((line) => (
                        <li
                          key={line}
                          className="text-[11px] text-[var(--app-text-secondary)] font-mono-num break-words"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {diagnosticsMessage && (
                    <p className="text-[11px] text-[var(--app-accent-text)]">{diagnosticsMessage}</p>
                  )}
                </DenseRow>

                {/* Danger Zone: Reset Defaults */}
                <div className="py-2.5">
                  <div
                    className="p-2.5 sm:p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    style={{
                      backgroundColor: 'var(--app-error-soft)',
                      borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
                    }}
                  >
                    <div className="min-w-0">
                      <div
                        className="text-xs font-bold flex items-center gap-1.5"
                        style={{ color: 'var(--app-error)' }}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isEnglish ? 'Factory Reset' : 'Atur Ulang Penuh'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--app-text-secondary)] mt-0.5 leading-snug">
                        {isEnglish
                          ? 'Resets settings, presets, studio, soundboard, marketplace, TikTok, TTS & music queue.'
                          : 'Kembalikan pengaturan, preset, Studio, soundboard, marketplace, TikTok, TTS & musik.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onResetDefaults}
                      className="btn-press min-h-[44px] px-3.5 rounded-lg bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--app-error) 60%, transparent)',
                        color: 'var(--app-error)',
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('settings.backup.reset', 'Atur Ulang Pengaturan')}</span>
                    </button>
                  </div>
                </div>

                {/* Preserved About, Version, Metadata, Licenses & Support (inside System disclosure; removed from category list) */}
                <div className="pt-2.5 last:pb-0 space-y-2">
                  <button
                    type="button"
                    aria-expanded={aboutExpanded}
                    onClick={() => setAboutExpanded((prev) => !prev)}
                    className="btn-press w-full min-h-[44px] px-2.5 py-1.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] flex items-center justify-between gap-2 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Info className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
                      <span className="text-xs font-semibold text-[var(--app-text)] truncate">
                        {isEnglish ? 'About SYNTXRR & Licenses' : 'Tentang SYNTXRR & Lisensi'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-mono-num text-[var(--app-text-muted)]">
                        v{APP_VERSION}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[var(--app-text-muted)] transition-transform ${
                          aboutExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {aboutExpanded && (
                    <div className="space-y-2.5 pt-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="p-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                            {t('settings.about.version', 'Versi')}
                          </div>
                          <div className="font-mono-num text-xs font-bold text-[var(--app-text)] mt-0.5">
                            v{APP_VERSION}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                            App ID
                          </div>
                          <div className="text-[11px] font-mono-num text-[var(--app-accent-text)] font-semibold truncate mt-0.5">
                            com.syntxrr.streamtools
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
                            Runtime
                          </div>
                          <div className="text-[11px] font-semibold text-[var(--app-text)] flex items-center gap-1 mt-0.5 truncate">
                            <Smartphone className="w-3 h-3 text-[var(--app-accent-text)] shrink-0" />
                            <span className="truncate">
                              {nativeAndroid ? 'Android APK' : 'Web Preview'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--app-text)]">
                            {isEnglish ? 'Build Metadata' : 'Metadata Build'}
                          </span>
                          <StatusBadge status="pending" />
                        </div>
                        <p className="text-[11px] text-[var(--app-text-muted)]">
                          {isEnglish
                            ? `Settings spec v${SETTINGS_SPEC_VERSION} · distributed via APK/CI build.`
                            : `Spec settings v${SETTINGS_SPEC_VERSION} · rilis via APK/CI build.`}
                        </p>
                        <ul className="space-y-0.5 text-[11px] text-[var(--app-text-secondary)] font-mono-num break-words">
                          <li>package.json → syntxrr-stream · v1.0.0</li>
                          <li>android/app/build.gradle → versionName 1.0.0 · versionCode 1</li>
                        </ul>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--app-text)]">
                            {t('settings.about.oss', 'Lisensi Komponen')}
                          </span>
                          <StatusBadge status="functional" />
                        </div>
                        <ul className="grid grid-cols-2 gap-1.5">
                          {OSS_COMPONENTS.map((component) => (
                            <li
                              key={component.name}
                              className="flex items-center justify-between gap-2 text-[11px] text-[var(--app-text-secondary)] px-2 py-1 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)]"
                            >
                              <span className="truncate">{component.name}</span>
                              <span className="font-mono-num text-[10px] text-[var(--app-text-muted)] shrink-0">
                                {component.license}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--app-text)]">
                            {isEnglish ? 'Support SYNTXRR' : 'Dukung SYNTXRR'}
                          </span>
                          <StatusBadge status="not_connected" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {[
                            {
                              label: isEnglish ? 'Donation' : 'Donasi',
                              detail: isEnglish
                                ? 'Official donation link not yet provided.'
                                : 'Tautan donasi resmi belum tersedia.',
                            },
                            {
                              label: 'Discord Server',
                              detail: isEnglish
                                ? 'Official Discord invite not yet provided.'
                                : 'Undangan Discord resmi belum tersedia.',
                            },
                          ].map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              disabled
                              className="min-h-[44px] text-left p-2 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] disabled:opacity-75 cursor-not-allowed"
                            >
                              <div className="text-xs font-semibold text-[var(--app-text)]">
                                {item.label}
                              </div>
                              <p className="text-[10px] text-[var(--app-text-muted)] truncate">
                                {item.detail}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ConsolePanel>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
