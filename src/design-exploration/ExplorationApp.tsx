import React, { useEffect, useState } from 'react';
import { Layers, Monitor, Moon, RotateCcw, Smartphone, Sun } from 'lucide-react';
import { ComparisonOverview, DvsDPlusComparison } from './ComparisonOverview';
import { DashboardAlternativeRenderer, type DashboardActionHandlers } from './DashboardAlternatives';
import { DashboardComparisonView } from './DashboardComparison';
import {
  INITIAL_DASHBOARD_SCENARIO,
  MODE_A_SCENARIO_PRESETS,
  MODE_B_SCENARIO_PRESETS,
  type DashboardAlternativeId,
  type DashboardScenarioState,
  type DashboardViewTab,
} from './dashboardTypes';
import { OptionShellRenderer } from './OptionShells';
import {
  INITIAL_SOUNDBOARD,
  INITIAL_SOURCES,
  INITIAL_STUDIO_ELEMENTS,
} from './mockData';
import { OPTION_SYSTEMS } from './tokens';
import type {
  ExplorationModule,
  ExplorationSharedState,
  ExplorationTab,
  MockSoundSlot,
  MockSourceItem,
  MockStudioElement,
  OperatingMode,
  OptionId,
  StudioInspectorTab,
  ThemeMode,
  ViewportPreset,
} from './types';

interface ExplorationAppProps {
  onOpenProductionApp: () => void;
}

type ExplorationWorkspace = 'DASHBOARD_EXPLORATION' | 'FULL_ECOSYSTEM';

const DASHBOARD_TABS: Array<{ id: DashboardViewTab; label: string }> = [
  { id: 'A', label: 'A — Executive Command' },
  { id: 'B', label: 'B — Broadcast Overview' },
  { id: 'C', label: 'C — Minimal Focus' },
  { id: 'D', label: 'D — Adaptive Operations' },
  { id: 'COMPARE', label: 'Compare A–D' },
];

const OPTION_TABS: Array<{ id: ExplorationTab; label: string }> = [
  { id: 'D_PLUS', label: 'D+ — FLAGSHIP EDITION (SELECTED)' },
  { id: 'D', label: 'D — Baseline (Before)' },
  { id: 'D_DIFF', label: 'D vs D+ Comparison' },
  { id: 'A', label: 'A — Quiet Luxury (Ref)' },
  { id: 'B', label: 'B — Broadcast Elite (Ref)' },
  { id: 'C', label: 'C — Future Luxe (Ref)' },
  { id: 'OVERVIEW', label: 'All Options Overview' },
];

const VIEWPORT_SPECS: Record<ViewportPreset, { width: number; height: number; label: string; isMobile: boolean }> = {
  '1280x800': { width: 1280, height: 800, label: 'Desktop 1280×800', isMobile: false },
  '412x915': { width: 412, height: 915, label: 'Android 412×915', isMobile: true },
  '390x844': { width: 390, height: 844, label: 'Android 390×844', isMobile: true },
  '360x800': { width: 360, height: 800, label: 'Android 360×800', isMobile: true },
};

const QUICK_MODULES: Array<{ id: ExplorationModule; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'studio', label: 'Studio' },
  { id: 'live_center', label: 'Live Center' },
  { id: 'sources', label: 'Sources' },
  { id: 'audio', label: 'Audio & SFX' },
  { id: 'hud', label: 'Floating HUD' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'remote_deck', label: 'Remote Deck' },
  { id: 'settings', label: 'Settings' },
];

export const ExplorationApp: React.FC<ExplorationAppProps> = ({ onOpenProductionApp }) => {
  const [workspace, setWorkspace] = useState<ExplorationWorkspace>('DASHBOARD_EXPLORATION');
  const [dashboardTab, setDashboardTab] = useState<DashboardViewTab>('A');
  const [activeTab, setActiveTab] = useState<ExplorationTab>('D_PLUS');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [viewport, setViewport] = useState<ViewportPreset>('1280x800');
  const [activeModule, setActiveModule] = useState<ExplorationModule>('dashboard');
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1400,
  );

  // Dashboard Exploration interactive scenario state
  const [scenario, setScenario] = useState<DashboardScenarioState>(INITIAL_DASHBOARD_SCENARIO);
  const [activeScenarioPresetId, setActiveScenarioPresetId] = useState<string>('ma_standby');

  // Interactive isolated mock states for Full Ecosystem
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('mode_a');
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [canvasAspect, setCanvasAspect] = useState<'9:16' | '16:9'>('9:16');
  const [activePresetId, setActivePresetId] = useState('preset_studio_night');
  const [studioElements, setStudioElements] = useState<MockStudioElement[]>(INITIAL_STUDIO_ELEMENTS);
  const [selectedElementId, setSelectedElementId] = useState<string>('el_camera');
  const [studioDockTab, setStudioDockTab] = useState<StudioInspectorTab>('inspector');
  const [simulatedBanner, setSimulatedBanner] = useState<string | null>(null);
  const [liveFilter, setLiveFilter] = useState<'all' | 'chat' | 'gift' | 'follow' | 'join'>('all');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [sounds, setSounds] = useState<MockSoundSlot[]>(INITIAL_SOUNDBOARD);
  const [masterVol, setMasterVol] = useState(86);
  const [sfxVol, setSfxVol] = useState(74);
  const [micGain, setMicGain] = useState(92);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [hudExpanded, setHudExpanded] = useState(true);
  const [hudSide, setHudSide] = useState<'left' | 'right'>('right');
  const [hudOpacity, setHudOpacity] = useState(92);
  const [hudTab, setHudTab] = useState<'chat' | 'soundboard' | 'music' | 'mixer'>('chat');
  const [sources, setSources] = useState<MockSourceItem[]>(INITIAL_SOURCES);
  const [tiktokMethod, setTiktokMethod] = useState<'direct' | 'euler'>('direct');
  const [eulerAuthType, setEulerAuthType] = useState<'api_key' | 'jwt'>('jwt');

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const flashDashboardFeedback = (msg: string) => {
    setScenario((prev) => ({ ...prev, lastFeedback: msg }));
    window.setTimeout(() => {
      setScenario((prev) => (prev.lastFeedback === msg ? { ...prev, lastFeedback: null } : prev));
    }, 2800);
  };

  const applyScenarioPreset = (presetId: string) => {
    const allPresets = [...MODE_A_SCENARIO_PRESETS, ...MODE_B_SCENARIO_PRESETS];
    const found = allPresets.find((pr) => pr.id === presetId);
    if (!found) return;
    setActiveScenarioPresetId(found.id);
    setOperatingMode(found.mode);
    setScenario((prev) => ({ ...prev, ...found.patch, lastFeedback: null }));
  };

  const handleModeSwitch = (mode: OperatingMode) => {
    setOperatingMode(mode);
    if (mode === 'mode_a') {
      const currentIsA = MODE_A_SCENARIO_PRESETS.some((p) => p.id === activeScenarioPresetId);
      if (!currentIsA) {
        setActiveScenarioPresetId('ma_standby');
        setScenario((prev) => ({ ...prev, ...MODE_A_SCENARIO_PRESETS[0].patch, lastFeedback: null }));
      }
    } else {
      const currentIsB = MODE_B_SCENARIO_PRESETS.some((p) => p.id === activeScenarioPresetId);
      if (!currentIsB) {
        setActiveScenarioPresetId('mb_idle');
        setScenario((prev) => ({ ...prev, ...MODE_B_SCENARIO_PRESETS[0].patch, lastFeedback: null }));
      }
    }
  };

  const dashboardActions: DashboardActionHandlers = {
    onChangeMode: handleModeSwitch,
    onStartModeAConnect: () => {
      setActiveScenarioPresetId('ma_connected_direct');
      setScenario((prev) => ({
        ...prev,
        modeASessionMode: 'with_live_connector',
        modeATransportState: prev.connectionMethod === 'euler' ? 'connected_euler' : 'connected_direct',
        modeARoomStatus: 'live',
        modeAMessage:
          prev.connectionMethod === 'euler'
            ? 'EulerStream WebSocket terhubung ke room LIVE.'
            : 'Direct TikTok WebSocket terhubung ke room LIVE.',
        viewerCount: 1284,
        likeCount: 18420,
        roomId: '741982014091',
        hudVisible: prev.overlayPermissionGranted ? true : prev.hudVisible,
      }));
      flashDashboardFeedback('Mock Preview: Sesi Companion dimulai & event transport terhubung.');
    },
    onStartModeAWithoutLive: () => {
      setActiveScenarioPresetId('ma_companion_only');
      setScenario((prev) => ({
        ...prev,
        modeASessionMode: 'without_live_connection',
        modeATransportState: 'disconnected',
        modeARoomStatus: 'unknown',
        modeAMessage: 'Sesi Companion lokal aktif tanpa koneksi event TikTok LIVE.',
        viewerCount: null,
        likeCount: null,
        roomId: null,
        hudVisible: prev.overlayPermissionGranted ? true : prev.hudVisible,
      }));
      flashDashboardFeedback('Mock Preview: Sesi Mode A berjalan tanpa koneksi event LIVE.');
    },
    onStopModeA: () => {
      setActiveScenarioPresetId('ma_standby');
      setScenario((prev) => ({
        ...prev,
        modeASessionMode: 'inactive',
        modeATransportState: 'disconnected',
        modeARoomStatus: 'unknown',
        modeAMessage: 'Companion dihentikan. Siap memulai kembali bersama aplikasi TikTok resmi.',
        viewerCount: null,
        likeCount: null,
        roomId: null,
        hudVisible: false,
      }));
      flashDashboardFeedback('Mock Preview: Sesi Mode A dihentikan.');
    },
    onToggleModeAMethod: () => {
      setScenario((prev) => {
        const nextMethod = prev.connectionMethod === 'direct' ? 'euler' : 'direct';
        const connected =
          prev.modeATransportState === 'connected_direct' || prev.modeATransportState === 'connected_euler';
        return {
          ...prev,
          connectionMethod: nextMethod,
          modeATransportState: connected
            ? nextMethod === 'euler'
              ? 'connected_euler'
              : 'connected_direct'
            : prev.modeATransportState,
        };
      });
    },
    onShowHud: () => {
      setScenario((prev) => ({ ...prev, hudVisible: true }));
      flashDashboardFeedback('Mock Preview: Floating HUD ditampilkan.');
    },
    onHideHud: () => {
      setScenario((prev) => ({ ...prev, hudVisible: false }));
      flashDashboardFeedback('Mock Preview: Floating HUD disembunyikan.');
    },
    onGrantOverlayPermission: () => {
      setScenario((prev) => ({ ...prev, overlayPermissionGranted: true }));
      flashDashboardFeedback('Mock Preview: Izin Floating Overlay Android diaktifkan.');
    },
    onStartModeB: () => {
      setActiveScenarioPresetId('mb_live');
      setScenario((prev) => ({
        ...prev,
        modeBStatus: 'live',
        modeBStreaming: true,
        bitrateKbps: 5840,
        modeBMessage: 'Encoder RTMP aktif mengirim video H.264 & audio AAC.',
      }));
      flashDashboardFeedback('Mock Preview: Siaran Native RTMP dimulai.');
    },
    onStopModeB: () => {
      setActiveScenarioPresetId('mb_idle');
      setScenario((prev) => ({
        ...prev,
        modeBStatus: 'idle',
        modeBStreaming: false,
        bitrateKbps: null,
        modeBMessage: 'Encoder RTMP dihentikan.',
      }));
      flashDashboardFeedback('Mock Preview: Siaran RTMP dihentikan.');
    },
    onToggleHostWait: () => {
      setScenario((prev) => {
        const entering = prev.modeBStatus !== 'host_wait';
        return {
          ...prev,
          modeBStatus: entering ? 'host_wait' : 'live',
          bitrateKbps: entering ? 1420 : 5840,
          modeBMessage: entering
            ? 'Mode Host Wait aktif: frame jeda dikirim tanpa memutus koneksi RTMP.'
            : 'Encoder RTMP aktif mengirim video H.264 & audio AAC.',
        };
      });
    },
    onRequestScreenReshare: () => {
      setActiveScenarioPresetId('mb_live');
      setScenario((prev) => ({
        ...prev,
        modeBStatus: 'live',
        modeBStreaming: true,
        bitrateKbps: 5620,
        screenPermission: 'granted',
        modeBMessage: 'Capture layar berhasil dipulihkan dan kembali live.',
      }));
      flashDashboardFeedback('Mock Preview: Share layar ulang disetujui.');
    },
    onChangeAudioSource: (source) => {
      setScenario((prev) => ({ ...prev, audioSource: source }));
      flashDashboardFeedback(`Mock Preview: Sumber audio Mode B diubah ke ${source}.`);
    },
    onRunHardwareCheck: () => {
      setScenario((prev) => ({
        ...prev,
        hardwareCheckState: 'verified',
        cameraPermission: 'granted',
        micPermission: 'granted',
        screenPermission: 'prompt',
        overlayPermissionGranted: prev.overlayPermissionGranted ?? true,
        notificationPermissionGranted: prev.notificationPermissionGranted ?? true,
      }));
      flashDashboardFeedback('Mock Preview: Pemeriksaan kesiapan perangkat & izin Android selesai.');
    },
    onConfigureTargetUsername: () => {
      setScenario((prev) => ({
        ...prev,
        targetUsername: 'syntxrr.atelier',
        modeATransportState: prev.modeATransportState === 'error' ? 'disconnected' : prev.modeATransportState,
        modeARoomStatus: prev.modeARoomStatus === 'not_found' ? 'unknown' : prev.modeARoomStatus,
        modeAMessage: 'Target @syntxrr.atelier diatur. Siap memulai sesi Companion.',
      }));
      flashDashboardFeedback('Mock Preview: Target @syntxrr.atelier diterapkan.');
    },
    onCompleteRtmpConfig: () => {
      setScenario((prev) => ({
        ...prev,
        rtmpUrlConfigured: true,
        rtmpStreamKeyConfigured: true,
        modeBMessage: 'Konfigurasi RTMP lengkap. Encoder siap memulai siaran.',
      }));
      flashDashboardFeedback('Mock Preview: Konfigurasi RTMP dilengkapi.');
    },
    onGrantNotificationPermission: () => {
      setScenario((prev) => ({ ...prev, notificationPermissionGranted: true }));
      flashDashboardFeedback('Mock Preview: Izin Notifikasi Android 13+ diberikan.');
    },
  };

  const isDashboardCompare = workspace === 'DASHBOARD_EXPLORATION' && dashboardTab === 'COMPARE';
  const isFullEcosystemComparison =
    workspace === 'FULL_ECOSYSTEM' && (activeTab === 'OVERVIEW' || activeTab === 'D_DIFF');
  const isComparisonView = isDashboardCompare || isFullEcosystemComparison;
  const currentOption: OptionId =
    workspace === 'DASHBOARD_EXPLORATION'
      ? 'D_PLUS'
      : activeTab === 'OVERVIEW' || activeTab === 'D_DIFF'
      ? 'D_PLUS'
      : activeTab;
  const activeSys = OPTION_SYSTEMS[currentOption];
  const spec = VIEWPORT_SPECS[viewport];

  // Auto-scale 1280x800 preview gracefully if browser preview pane is narrower than 1320px
  const horizontalMargin = 48;
  const availableW = Math.max(320, windowWidth - horizontalMargin);
  const previewScale = spec.width > availableW ? Number((availableW / spec.width).toFixed(3)) : 1;

  const isDarkChrome = theme === 'dark';
  const chromeBg = isDarkChrome ? '#07090E' : '#EEF1F6';
  const chromeBarBg = isDarkChrome ? '#0E121B' : '#FFFFFF';
  const chromeBorder = isDarkChrome ? '#1E2534' : '#D5DCE8';
  const chromeText = isDarkChrome ? '#F3F6FB' : '#0F172A';
  const chromeMuted = isDarkChrome ? '#8D98AE' : '#64748B';

  const resetSandbox = () => {
    setOperatingMode('mode_a');
    setIsLiveActive(true);
    setCanvasAspect('9:16');
    setActivePresetId('preset_studio_night');
    setStudioElements(INITIAL_STUDIO_ELEMENTS);
    setSelectedElementId('el_camera');
    setStudioDockTab('inspector');
    setSimulatedBanner(null);
    setLiveFilter('all');
    setTtsEnabled(true);
    setSounds(INITIAL_SOUNDBOARD);
    setSources(INITIAL_SOURCES);
    setHudExpanded(true);
    setScenario(INITIAL_DASHBOARD_SCENARIO);
    setActiveScenarioPresetId('ma_standby');
  };

  const effectiveLiveActiveForShell =
    workspace === 'DASHBOARD_EXPLORATION'
      ? operatingMode === 'mode_a'
        ? scenario.modeASessionMode !== 'inactive'
        : scenario.modeBStreaming
      : isLiveActive;

  const handleShellLiveToggle = () => {
    if (workspace === 'DASHBOARD_EXPLORATION') {
      if (operatingMode === 'mode_a') {
        if (scenario.modeASessionMode === 'inactive') {
          dashboardActions.onStartModeAConnect();
        } else {
          dashboardActions.onStopModeA();
        }
      } else {
        if (scenario.modeBStreaming) {
          dashboardActions.onStopModeB();
        } else if (scenario.rtmpUrlConfigured && scenario.rtmpStreamKeyConfigured) {
          dashboardActions.onStartModeB();
        }
      }
    } else {
      setIsLiveActive((v) => !v);
    }
  };

  const sharedState: ExplorationSharedState = {
    optionId: currentOption,
    theme,
    isMobileViewport: spec.isMobile,
    viewportWidth: spec.width,
    activeModule: workspace === 'DASHBOARD_EXPLORATION' ? activeModule : activeModule,
    onNavigate: setActiveModule,
    operatingMode,
    onChangeOperatingMode: handleModeSwitch,
    isLiveActive: effectiveLiveActiveForShell,
    onToggleLiveActive: handleShellLiveToggle,
    canvasAspect,
    onChangeCanvasAspect: setCanvasAspect,
    activePresetId,
    onSelectPreset: setActivePresetId,
    studioElements,
    selectedElementId,
    onSelectElement: setSelectedElementId,
    onToggleElementVisibility: (id) =>
      setStudioElements((prev) => prev.map((el) => (el.id === id ? { ...el, visible: !el.visible } : el))),
    onToggleElementLock: (id) =>
      setStudioElements((prev) => prev.map((el) => (el.id === id ? { ...el, locked: !el.locked } : el))),
    onUpdateElementProp: (id, patch) =>
      setStudioElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el))),
    onAddMockElement: (name, category) => {
      const nextId = `el_custom_${Date.now()}`;
      setStudioElements((prev) => [
        ...prev,
        {
          id: nextId,
          name,
          category,
          groupId: 'grp_overlays',
          superGroupId: 'sg_broadcast',
          visible: true,
          locked: false,
          x: 12,
          y: 28,
          width: 72,
          height: 16,
          opacity: 96,
          zIndex: prev.length + 1,
          summary: `${category} layer added in exploration`,
        },
      ]);
      setSelectedElementId(nextId);
      setStudioDockTab('inspector');
    },
    studioDockTab,
    onChangeStudioDockTab: setStudioDockTab,
    simulatedBanner,
    onTriggerSimulator: (label) => {
      setSimulatedBanner(label);
      window.setTimeout(() => setSimulatedBanner(null), 3200);
    },
    liveFilter,
    onChangeLiveFilter: setLiveFilter,
    ttsEnabled,
    onToggleTts: () => setTtsEnabled((v) => !v),
    playingSoundId,
    onPlaySound: (id) => {
      setPlayingSoundId(id);
      window.setTimeout(() => setPlayingSoundId((cur) => (cur === id ? null : cur)), 1400);
    },
    sounds,
    onToggleSoundFavorite: (id) =>
      setSounds((prev) => prev.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s))),
    masterVol,
    sfxVol,
    micGain,
    onChangeAudioLevel: (key, val) => {
      if (key === 'master') setMasterVol(val);
      if (key === 'sfx') setSfxVol(val);
      if (key === 'mic') setMicGain(val);
    },
    musicPlaying,
    onToggleMusicPlaying: () => setMusicPlaying((v) => !v),
    hudExpanded,
    onToggleHudExpanded: () => setHudExpanded((v) => !v),
    hudSide,
    onChangeHudSide: setHudSide,
    hudOpacity,
    onChangeHudOpacity: setHudOpacity,
    hudTab,
    onChangeHudTab: setHudTab,
    sources,
    onToggleSourceConnected: (id) =>
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, connected: !s.connected } : s))),
    tiktokMethod,
    onChangeTiktokMethod: setTiktokMethod,
    eulerAuthType,
    onChangeEulerAuthType: setEulerAuthType,
    onToggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
  };

  const dPlusPal = OPTION_SYSTEMS.D_PLUS.palettes[theme];
  const scenarioPresetsForMode =
    operatingMode === 'mode_a' ? MODE_A_SCENARIO_PRESETS : MODE_B_SCENARIO_PRESETS;

  const dashboardOverrideNode =
    workspace === 'DASHBOARD_EXPLORATION' && dashboardTab !== 'COMPARE' ? (
      <DashboardAlternativeRenderer
        variant={dashboardTab}
        theme={theme}
        isMobile={spec.isMobile}
        operatingMode={operatingMode}
        scenario={scenario}
        actions={dashboardActions}
      />
    ) : undefined;

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ backgroundColor: chromeBg, color: chromeText, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Persistent Top Exploration Switchboard */}
      <header
        className="sticky top-0 z-50 px-4 sm:px-6 py-3 space-y-2.5"
        style={{ backgroundColor: chromeBarBg, borderBottom: `1px solid ${chromeBorder}` }}
      >
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="text-sm font-bold tracking-tight">SYNTXRR STREAM</span>
            <div
              className="inline-flex p-0.5"
              style={{ backgroundColor: chromeBg, border: `1px solid ${chromeBorder}`, borderRadius: '8px' }}
            >
              {(
                [
                  { id: 'DASHBOARD_EXPLORATION', label: 'D+ Dashboard Exploration [A–D]' },
                  { id: 'FULL_ECOSYSTEM', label: 'Full D+ & A–D Ecosystem' },
                ] as const
              ).map((ws) => {
                const active = workspace === ws.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setWorkspace(ws.id);
                      if (ws.id === 'DASHBOARD_EXPLORATION') {
                        setActiveModule('dashboard');
                      }
                    }}
                    className="px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors"
                    style={{
                      borderRadius: '6px',
                      backgroundColor: active ? dPlusPal.accent : 'transparent',
                      color: active ? dPlusPal.accentInk : chromeMuted,
                    }}
                  >
                    {ws.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Theme Switch */}
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
              style={{
                borderRadius: '8px',
                border: `1px solid ${chromeBorder}`,
                backgroundColor: chromeBg,
                color: chromeText,
              }}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Dark Theme' : 'Light Theme'}</span>
            </button>

            {/* Viewport Switch */}
            {!isComparisonView && (
              <div
                className="inline-flex p-0.5 overflow-x-auto max-w-full"
                style={{ backgroundColor: chromeBg, border: `1px solid ${chromeBorder}`, borderRadius: '8px' }}
              >
                {(Object.keys(VIEWPORT_SPECS) as ViewportPreset[]).map((vp) => {
                  const s = VIEWPORT_SPECS[vp];
                  const active = viewport === vp;
                  return (
                    <button
                      key={vp}
                      type="button"
                      onClick={() => setViewport(vp)}
                      className="px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap"
                      style={{
                        borderRadius: '6px',
                        backgroundColor: active ? chromeBarBg : 'transparent',
                        color: active ? chromeText : chromeMuted,
                      }}
                    >
                      {s.isMobile ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                      <span>{vp === '1280x800' ? 'Desktop 1280' : vp}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={resetSandbox}
              className="px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1"
              style={{ borderRadius: '8px', border: `1px solid ${chromeBorder}`, color: chromeMuted }}
              title="Reset exploration mock controls"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={onOpenProductionApp}
              className="px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
              style={{
                borderRadius: '8px',
                border: `1px solid ${chromeBorder}`,
                backgroundColor: isDarkChrome ? '#1B2231' : '#E2E8F0',
                color: chromeText,
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Live Production App</span>
            </button>
          </div>
        </div>

        {/* Sub-Row Navigation (Dashboard A-D Switcher vs Full Ecosystem Selector) */}
        {workspace === 'DASHBOARD_EXPLORATION' ? (
          <div className="max-w-[1440px] mx-auto space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {DASHBOARD_TABS.map((tab) => {
                  const selected = dashboardTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setDashboardTab(tab.id);
                        setActiveModule('dashboard');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap"
                      style={{
                        borderRadius: '8px',
                        backgroundColor: selected ? dPlusPal.accent : chromeBg,
                        color: selected ? dPlusPal.accentInk : chromeText,
                        border: `1px solid ${selected ? dPlusPal.accent : chromeBorder}`,
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {dashboardTab !== 'COMPARE' && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span style={{ color: chromeMuted }}>Mock Preview State:</span>
                  <div
                    className="inline-flex p-0.5"
                    style={{ backgroundColor: chromeBg, border: `1px solid ${chromeBorder}`, borderRadius: '7px' }}
                  >
                    {(['mode_a', 'mode_b'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleModeSwitch(m)}
                        className="px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          borderRadius: '5px',
                          backgroundColor: operatingMode === m ? dPlusPal.accentSoft : 'transparent',
                          color: operatingMode === m ? dPlusPal.accentText : chromeMuted,
                        }}
                      >
                        {m === 'mode_a' ? 'Mode A' : 'Mode B'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {dashboardTab !== 'COMPARE' && (
              <div
                className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                style={{
                  backgroundColor: chromeBg,
                  border: `1px solid ${chromeBorder}`,
                  borderRadius: '8px',
                }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold" style={{ color: chromeMuted }}>
                    Scenario ({operatingMode === 'mode_a' ? 'Mode A' : 'Mode B'}):
                  </span>
                  {scenarioPresetsForMode.map((sp) => {
                    const active = activeScenarioPresetId === sp.id;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => applyScenarioPreset(sp.id)}
                        className="px-2 py-1 font-medium whitespace-nowrap transition-colors"
                        style={{
                          borderRadius: '6px',
                          backgroundColor: active ? dPlusPal.accentSoft : chromeBarBg,
                          border: `1px solid ${active ? dPlusPal.accent : chromeBorder}`,
                          color: active ? dPlusPal.accentText : chromeText,
                        }}
                        title={sp.summary}
                      >
                        {sp.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setScenario((prev) => ({
                        ...prev,
                        hardwareCheckState: prev.hardwareCheckState === 'unchecked' ? 'verified' : 'unchecked',
                        cameraPermission: prev.hardwareCheckState === 'unchecked' ? 'granted' : 'unchecked',
                        micPermission: prev.hardwareCheckState === 'unchecked' ? 'granted' : 'unchecked',
                      }))
                    }
                    className="px-2.5 py-1 font-medium"
                    style={{
                      borderRadius: '6px',
                      backgroundColor: chromeBarBg,
                      border: `1px solid ${chromeBorder}`,
                      color: chromeText,
                    }}
                  >
                    HW State: {scenario.hardwareCheckState === 'unchecked' ? 'Belum diperiksa' : 'Checked'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {OPTION_TABS.map((tab) => {
                const selected = activeTab === tab.id;
                const pal =
                  tab.id === 'OVERVIEW' || tab.id === 'D_DIFF'
                    ? activeSys.palettes[theme]
                    : OPTION_SYSTEMS[tab.id].palettes[theme];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap"
                    style={{
                      borderRadius: '8px',
                      backgroundColor: selected ? pal.accent : chromeBg,
                      color: selected ? pal.accentInk : chromeText,
                      border: `1px solid ${selected ? pal.accent : chromeBorder}`,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {!isComparisonView && (
              <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5">
                {QUICK_MODULES.map((m) => {
                  const active = activeModule === m.id;
                  const pal = activeSys.palettes[theme];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveModule(m.id)}
                      className="px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                      style={{
                        borderRadius: '6px',
                        backgroundColor: active ? pal.accentSoft : 'transparent',
                        color: active ? pal.accentText : chromeMuted,
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Exploration Stage */}
      <main className="flex-1 px-4 sm:px-6 py-5">
        <div className="max-w-[1440px] mx-auto">
          {workspace === 'DASHBOARD_EXPLORATION' && dashboardTab === 'COMPARE' ? (
            <DashboardComparisonView
              theme={theme}
              onInspectAlternative={(id: DashboardAlternativeId, vp?: ViewportPreset, thm?: ThemeMode) => {
                setDashboardTab(id);
                setActiveModule('dashboard');
                if (vp) setViewport(vp);
                if (thm) setTheme(thm);
              }}
            />
          ) : workspace === 'FULL_ECOSYSTEM' && activeTab === 'OVERVIEW' ? (
            <ComparisonOverview
              theme={theme}
              onSelectOption={(opt, vp, mod, thm) => {
                setActiveTab(opt);
                if (vp) setViewport(vp);
                if (mod) setActiveModule(mod);
                if (thm) setTheme(thm);
              }}
            />
          ) : workspace === 'FULL_ECOSYSTEM' && activeTab === 'D_DIFF' ? (
            <DvsDPlusComparison
              theme={theme}
              onSelectOption={(opt, vp, mod, thm) => {
                setActiveTab(opt);
                if (vp) setViewport(vp);
                if (mod) setActiveModule(mod);
                if (thm) setTheme(thm);
              }}
            />
          ) : (
            <div className="space-y-4">
              {/* Compact Context Caption above Viewport Frame */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold" style={{ color: chromeText }}>
                    {workspace === 'DASHBOARD_EXPLORATION'
                      ? `D+ Flagship Shell · Dashboard ${dashboardTab}`
                      : `${activeSys.title} (${activeSys.codeName})`}
                  </span>
                  <span style={{ color: chromeMuted }}>·</span>
                  <span style={{ color: chromeMuted }}>
                    {workspace === 'DASHBOARD_EXPLORATION'
                      ? DASHBOARD_TABS.find((t) => t.id === dashboardTab)?.label
                      : activeSys.subtitle}
                  </span>
                  <span style={{ color: chromeMuted }}>·</span>
                  <span style={{ color: activeSys.palettes[theme].accentText }}>{spec.label}</span>
                  {previewScale < 1 && (
                    <span style={{ color: chromeMuted }}>· Scaled {Math.round(previewScale * 100)}% to fit pane</span>
                  )}
                </div>
                <div style={{ color: chromeMuted }}>
                  {workspace === 'DASHBOARD_EXPLORATION'
                    ? 'Mock Preview · Strictly Isolated (No Production Changes)'
                    : `Surface: ${activeSys.surfacePhilosophy}`}
                </div>
              </div>

              {/* Exact Responsive Device Frame */}
              <div className="flex justify-center overflow-hidden py-1">
                <div
                  style={{
                    width: `${Math.round(spec.width * previewScale)}px`,
                    height: `${Math.round(spec.height * previewScale)}px`,
                  }}
                >
                  <div
                    className="overflow-hidden"
                    style={{
                      width: `${spec.width}px`,
                      height: `${spec.height}px`,
                      transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
                      transformOrigin: 'top left',
                      borderRadius: spec.isMobile ? '28px' : '12px',
                      border: `2px solid ${isDarkChrome ? '#2B3447' : '#CBD5E1'}`,
                      boxShadow: isDarkChrome
                        ? '0 24px 60px -18px rgba(0, 0, 0, 0.72)'
                        : '0 24px 54px -18px rgba(15, 23, 42, 0.16)',
                    }}
                  >
                    <OptionShellRenderer shared={sharedState} dashboardOverride={dashboardOverrideNode} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
