import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActiveNav,
  NavigationTab,
  AppSettings,
  Scene,
  SongRequest,
  AlertSettings,
  AlertEvent,
  AlertType,
  OperatingMode,
  isModeAOperatingMode,
  isModeBOperatingMode,
  normalizeOperatingMode,
  normalizeUnitVolume,
  unitVolumeToPercent,
  percentToUnitVolume,
  CanvasOrientation,
  UnifiedQueueItem,
  LocalAudioTrackMeta,
  StudioPreset,
  StudioElement,
  SoundboardItem,
  MarketplaceItem,
  IntegrationProvider,
  TTSConfig,
  TikTokConnectorStatus,
  ModeASessionMode,
  TikTokAccountState,
  TikTokConnectionMethod,
} from './types';
import {
  StorageService,
  ensureUniqueElementIds,
  DEFAULT_SETTINGS,
  DEFAULT_SCENES,
  DEFAULT_SONG_REQUESTS,
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_PRESETS,
  DEFAULT_STUDIO_ELEMENTS,
  DEFAULT_SOUNDBOARD,
  DEFAULT_MARKETPLACE_ITEMS,
  DEFAULT_INTEGRATIONS,
  DEFAULT_TIKTOK_ACCOUNT_STATE,
} from './services/storage';
import { normalizeStudioPreset } from './services/presetModel';
import { triggerHaptic } from './services/haptics';
import { audioEngine, type AudioEngineState } from './services/localAudioEngine';
import { soundboardEngine } from './services/soundboardEngine';
import { dispatchSoundboard } from './services/soundboardDispatcher';
import { ttsService, DEFAULT_TTS_CONFIG } from './services/ttsService';
import { streamEventBus } from './services/eventBus';
import {
  songRequestEngine,
  type SongRequestItem,
  type SongRequestState,
} from './services/songRequestEngine';
import {
  tiktokLiveConnector,
  buildModeAHonestStatus,
  isValidTikTokTargetUsername,
  normalizeTikTokTargetUsername,
  resolveTikTokTargetUsername,
} from './services/tiktokLiveConnector';
import {
  applyVerifiedProfileToAccountState,
  handleTikTokAuthCallbackUrl,
  startTikTokOAuthLogin,
} from './services/tiktokAuthService';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { NavigationDrawerModal } from './components/NavigationDrawerModal';
import { AlertBannerOverlay } from './components/AlertBannerOverlay';
import { ModeLauncherModal } from './components/ModeLauncherModal';
import { DashboardView } from './components/DashboardView';
import { StudioView } from './components/StudioView';
import { SourcesLibraryView } from './components/SourcesLibraryView';
import { PresetManagerView } from './components/PresetManagerView';
import { LiveCenterView } from './components/LiveCenterView';
import { MusicCenterView } from './components/MusicCenterView';
import { MarketplaceView } from './components/MarketplaceView';
import { IntegrationsView } from './components/IntegrationsView';
import { SettingsView } from './components/SettingsView';
import { StreamDeckView } from './components/StreamDeckView';
import { Radio } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  checkOverlayPermission,
  hideFloatingHud,
  onFloatingHudClick,
  onHudCommand,
  onHudPanelChanged,
  onHudResync,
  pushHudState,
  showFloatingHud,
  startCompanion,
  stopCompanion,
  isCompanionRunning,
} from './services/nativeCompanionBridge';
import {
  canChangeActivePresetDuringModeB,
  forwardModeBOverlayEvent,
  getModeBStreamStatus,
  isModeBSceneMutationLocked,
  isNativeStreamingAvailable,
  onModeBStreamState,
  requestModeBScreenReshare,
  setModeBHostWait,
  stopModeBStream,
  type ModeBStreamSnapshot,
} from './services/nativeStreamingBridge';
import { shouldLockModeBSceneMutations } from './services/modeBSceneMutationPolicy';
import {
  applyLiveSceneChangeToModeB,
  createModeBLifecycleCoordinator,
  executeOperatingModeSwitch,
  isModeBSessionActive,
  prepareAndStartModeBStream,
  stopModeBStreamAndWaitForCleanup,
  type ModeBLifecycleCoordinator,
} from './services/modeBController';
import type { HudChatTab, HudPanelId, HudStateModel } from './services/nativeCompanionBridge';
import { FloatingHudPanel } from './components/FloatingHudPanel';
import type { HudMixerKey } from './components/FloatingHudPanel';
import {
  HUD_EVENT_BUFFER_LIMIT,
  buildHudSnapshot,
  buildChatModel,
  buildMixerModel,
  buildMusicModel,
  buildSoundboardModel,
  hudEventSourceStatus,
} from './services/hudController';
import type { HudChatEntry } from './services/hudController';
import { applyTheme, getThemeMeta } from './theme/themeEngine';
import { I18nProvider } from './i18n/I18nContext';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<NavigationTab>('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);

  // App Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  /**
   * Navigation wrapper: gives the haptic feedback toggle a real effect by applying it to
   * primary navigation. Nothing vibrates while the setting is off or the device cannot vibrate.
   */
  const handleNavigate = useCallback(
    (nav: NavigationTab) => {
      triggerHaptic(settings, 'light');
      setActiveNav(nav);
    },
    [settings]
  );

  // Studio & Presets State
  const [presets, setPresets] = useState<StudioPreset[]>(DEFAULT_PRESETS);
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESETS[0].id);
  const [studioElements, setStudioElements] = useState<StudioElement[]>(DEFAULT_STUDIO_ELEMENTS);
  const pendingStudioPersistenceRef = useRef<{ elements: StudioElement[]; presets: StudioPreset[] } | null>(null);
  const studioPersistenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Studio drag emits many visual updates per second. Keep UI state immediate, but coalesce
  // IndexedDB writes so a gesture cannot flood storage or race a preset switch.
  const flushStudioPersistence = useCallback(async () => {
    if (studioPersistenceTimerRef.current) {
      clearTimeout(studioPersistenceTimerRef.current);
      studioPersistenceTimerRef.current = null;
    }
    const pending = pendingStudioPersistenceRef.current;
    if (!pending) return;
    pendingStudioPersistenceRef.current = null;
    await Promise.all([
      StorageService.saveStudioElements(pending.elements),
      StorageService.savePresets(pending.presets),
    ]);
  }, []);

  useEffect(() => {
    return () => {
      if (studioPersistenceTimerRef.current) {
        clearTimeout(studioPersistenceTimerRef.current);
        studioPersistenceTimerRef.current = null;
      }
      const pending = pendingStudioPersistenceRef.current;
      if (pending) {
        pendingStudioPersistenceRef.current = null;
        void Promise.all([
          StorageService.saveStudioElements(pending.elements),
          StorageService.savePresets(pending.presets),
        ]).catch((error) => console.error('Gagal menyimpan perubahan Studio saat keluar:', error));
      }
    };
  }, []);

  // Soundboard & TTS State
  const [soundboardItems, setSoundboardItems] = useState<SoundboardItem[]>(DEFAULT_SOUNDBOARD);
  const previousSoundboardUrls = useRef<Map<string, string>>(new Map());
  const [ttsConfig, setTTSConfig] = useState<TTSConfig>(DEFAULT_TTS_CONFIG);

  // Marketplace & Integrations State
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>(DEFAULT_MARKETPLACE_ITEMS);
  const [integrations, setIntegrations] = useState<IntegrationProvider[]>(DEFAULT_INTEGRATIONS);
  const [tiktokStatus, setTiktokStatus] = useState<TikTokConnectorStatus>(() =>
    tiktokLiveConnector.getStatus()
  );
  const [tiktokAccount, setTiktokAccount] = useState<TikTokAccountState>(
    DEFAULT_TIKTOK_ACCOUNT_STATE
  );
  const [modeASessionMode, setModeASessionMode] = useState<ModeASessionMode>('inactive');
  const [openTikTokSettingsNonce, setOpenTikTokSettingsNonce] = useState(0);
  const tiktokAccountRef = useRef<TikTokAccountState>(DEFAULT_TIKTOK_ACCOUNT_STATE);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  // Mode B Standalone RTMP Encoder State (single source of truth synced with native streamState)
  const INITIAL_MODE_B_STATUS: ModeBStreamSnapshot = {
    status: 'idle',
    message: 'Encoder Mode B siap dikonfigurasi.',
    isStreaming: false,
    bitrateKbps: 0,
  };
  const [modeBStatus, setModeBStatus] = useState<ModeBStreamSnapshot>(INITIAL_MODE_B_STATUS);
  const modeBStatusRef = useRef<ModeBStreamSnapshot>(modeBStatus);
  const [isModeBActionPending, setIsModeBActionPending] = useState(false);
  const modeBActionPendingRef = useRef(false);
  const modeBCoordinatorRef = useRef<ModeBLifecycleCoordinator | null>(null);
  if (!modeBCoordinatorRef.current) {
    modeBCoordinatorRef.current = createModeBLifecycleCoordinator(INITIAL_MODE_B_STATUS, {
      onSnapshotChange: (next) => {
        modeBStatusRef.current = next;
        setModeBStatus(next);
      },
      onPendingChange: (pending) => {
        modeBActionPendingRef.current = pending;
        setIsModeBActionPending(pending);
      },
    });
  }
  const getModeBCoordinator = () => modeBCoordinatorRef.current!;
  const [modeBNotificationWarning, setModeBNotificationWarning] = useState<string | null>(null);
  const [modeBNoticeBanner, setModeBNoticeBanner] = useState<string | null>(null);
  const [pendingConfirmModal, setPendingConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'warn' | 'danger';
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  useEffect(() => {
    tiktokAccountRef.current = tiktokAccount;
  }, [tiktokAccount]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Music Center State (HTML5 local audio + Queue + Song Requests)
  const [songRequests, setSongRequests] = useState<SongRequest[]>(DEFAULT_SONG_REQUESTS);
  const [nowPlayingSong, setNowPlayingSong] = useState<SongRequest | null>(null);
  const [audioEngineState, setAudioEngineState] = useState<AudioEngineState>(audioEngine.getState());
  const [srState, setSrState] = useState<SongRequestState>(songRequestEngine.getState());
  const [unifiedQueue, setUnifiedQueue] = useState<UnifiedQueueItem[]>([]);
  const [localTracksMeta, setLocalTracksMeta] = useState<LocalAudioTrackMeta[]>([]);
  const [localFilesMap, setLocalFilesMap] = useState<Map<string, File>>(new Map());

  // Alerts & Scenes Backwards-Compatibility State
  const [scenes, setScenes] = useState<Scene[]>(DEFAULT_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>(DEFAULT_SCENES[0].id);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [alertHistory, setAlertHistory] = useState<AlertEvent[]>([]);
  const [activeFloatingAlert, setActiveFloatingAlert] = useState<AlertEvent | null>(null);

  // Load from IndexedDB on startup
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [
          savedSettings,
          savedPresets,
          savedActivePresetId,
          savedStudioElements,
          savedSoundboard,
          savedMarketplace,
          savedIntegrations,
          savedTTSConfig,
          savedQueue,
          savedLocalMeta,
          savedRequests,
          savedScenes,
          savedActiveSceneId,
          savedAlertSettings,
          savedAlertHistory,
          savedTikTokAccount,
        ] = await Promise.all([
          StorageService.getSettings(),
          StorageService.getPresets(),
          StorageService.getActivePresetId(),
          StorageService.getStudioElements(),
          StorageService.getSoundboard(),
          StorageService.getMarketplace(),
          StorageService.getIntegrations(),
          StorageService.getTTSConfig(),
          StorageService.getUnifiedQueue(),
          StorageService.getLocalTracksMeta(),
          StorageService.getSongRequests(),
          StorageService.getScenes(),
          StorageService.getActiveSceneId(),
          StorageService.getAlertSettings(),
          StorageService.getAlertHistory(),
          StorageService.getTikTokAccount(),
        ]);

        // The dedicated canvas record is the same source previously used by Studio on load.
        // Keep it authoritative when reconciling legacy preset data, including a deliberately
        // empty canvas; then repair the selected preset so both records become consistent.
        const activePresetFromStorage =
          savedPresets.find((preset) => preset.id === savedActivePresetId) || savedPresets[0] || null;
        const effectiveActivePresetId = activePresetFromStorage?.id || savedActivePresetId;
        const hydratedSettings = activePresetFromStorage
          ? { ...savedSettings, canvasOrientation: activePresetFromStorage.canvasOrientation }
          : savedSettings;
        setSettings(hydratedSettings);
        settingsRef.current = hydratedSettings;
        const sanitizedElements = ensureUniqueElementIds(savedStudioElements);
        const hydratedPresets = activePresetFromStorage
          ? savedPresets.map((preset) =>
              preset.id === activePresetFromStorage.id
                ? normalizeStudioPreset({ ...preset, elements: sanitizedElements })
                : preset,
            )
          : savedPresets;
        setPresets(hydratedPresets);
        setActivePresetId(effectiveActivePresetId);
        setStudioElements(sanitizedElements);
        if (effectiveActivePresetId !== savedActivePresetId) {
          await StorageService.saveActivePresetId(effectiveActivePresetId);
        }
        if (hydratedSettings.canvasOrientation !== savedSettings.canvasOrientation) {
          await StorageService.saveSettings(hydratedSettings);
        }
        if (JSON.stringify(savedStudioElements) !== JSON.stringify(sanitizedElements)) {
          await StorageService.saveStudioElements(sanitizedElements);
        }
        if (JSON.stringify(savedPresets) !== JSON.stringify(hydratedPresets)) {
          await StorageService.savePresets(hydratedPresets);
        }
        const hydratedSoundboard = await Promise.all(
          savedSoundboard.map(async (item) => {
            const audioBlob = await StorageService.getSoundboardAudio(item.id);
            return audioBlob ? { ...item, audioUrl: URL.createObjectURL(audioBlob) } : item;
          }),
        );
        setSoundboardItems(hydratedSoundboard);
        setMarketplaceItems(savedMarketplace);
        setTiktokAccount(savedTikTokAccount);
        const liveNow = tiktokLiveConnector.isConnected();
        const savedTargetUser = resolveTikTokTargetUsername(savedSettings, savedTikTokAccount);
        setIntegrations(
          savedIntegrations.map((item) =>
            item.id === 'tiktok'
              ? {
                  ...item,
                  status: liveNow ? 'ACTIVE' : 'NOT_CONNECTED',
                  connectedUser: liveNow
                    ? tiktokLiveConnector.getStatus().username || savedTargetUser || undefined
                    : savedTargetUser ||
                      (savedTikTokAccount.isLinked
                        ? savedTikTokAccount.displayName || savedTikTokAccount.openId
                        : undefined),
                }
              : item
          )
        );
        setTTSConfig(savedTTSConfig);
        ttsService.updateConfig(savedTTSConfig);
        setUnifiedQueue(savedQueue);
        setLocalTracksMeta(savedLocalMeta);
        setSongRequests(savedRequests);
        setScenes(savedScenes);
        setActiveSceneId(savedActiveSceneId);
        setAlertSettings(savedAlertSettings);
        setAlertHistory(savedAlertHistory);

        // Apply audio volumes (canonical 0.0-1.0)
        const initialVolumeUnit = normalizeUnitVolume(savedSettings.audioVolume, 0.85);
        audioEngine.setVolume(initialVolumeUnit);
        songRequestEngine.configureContext({
          operatingMode: savedSettings.operatingMode,
          youtubeApiKey: savedSettings.youtubeApiKey || '',
          spotifyAccessToken: savedSettings.spotifyAccessToken || '',
          volumeUnit: initialVolumeUnit,
        });
        soundboardEngine.setVolume(normalizeUnitVolume(savedSettings.soundboardVolume, 0.85));

        // Apply saved theme immediately on startup
        applyTheme(savedSettings.theme || 'navy_dark');
      } catch (err) {
        console.error('Error loading data from IndexedDB:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Synchronize theme changes in real time across the entire application
  useEffect(() => {
    applyTheme(settings.theme || 'navy_dark');
  }, [settings.theme]);

  useEffect(() => {
    const activeUrls = new Map(
      soundboardItems
        .filter((item) => item.audioUrl)
        .map((item) => [item.id, item.audioUrl as string]),
    );
    previousSoundboardUrls.current.forEach((url, id) => {
      if (activeUrls.get(id) !== url) {
        soundboardEngine.removeCustomFile(id);
        URL.revokeObjectURL(url);
      }
    });
    previousSoundboardUrls.current = activeUrls;
  }, [soundboardItems]);

  useEffect(() => () => {
    previousSoundboardUrls.current.forEach((url, id) => {
      soundboardEngine.removeCustomFile(id);
      URL.revokeObjectURL(url);
    });
    previousSoundboardUrls.current.clear();
  }, []);

  // Subscribe to Song Request Engine state
  useEffect(() => {
    return songRequestEngine.subscribe(setSrState);
  }, []);

  // Keep Song Request Engine context & local audio library synchronized
  useEffect(() => {
    songRequestEngine.configureContext({
      operatingMode: settings.operatingMode,
      youtubeApiKey: settings.youtubeApiKey || '',
      spotifyAccessToken: settings.spotifyAccessToken || '',
      volumeUnit: normalizeUnitVolume(settings.audioVolume, 0.85),
    });
  }, [
    settings.operatingMode,
    settings.youtubeApiKey,
    settings.spotifyAccessToken,
    settings.audioVolume,
  ]);

  useEffect(() => {
    songRequestEngine.registerLocalLibrary(localTracksMeta, localFilesMap);
  }, [localTracksMeta, localFilesMap]);

  // Synchronize manual audioEngine playback state and automatic track progression
  useEffect(() => {
    const unsub = audioEngine.subscribe((state) => {
      setAudioEngineState(state);
    });
    audioEngine.setOnEnded(() => {
      void handleNextTrack();
    });
    return () => {
      unsub();
      audioEngine.setOnEnded(null);
    };
  }, [unifiedQueue, srState.currentTrack, srState.queue]);

  const handleDismissAlert = useCallback(() => {
    setActiveFloatingAlert(null);
  }, []);

  // Subscribe to Stream Event Bus to display floating overlay alerts
  useEffect(() => {
    const mapStreamEventToAlertType = (eventType: string): AlertType => {
      switch (eventType) {
        case 'gift':
          return 'gift';
        case 'donation':
          return 'donation';
        case 'follow':
        case 'follower':
          return 'follow';
        case 'like':
          return 'like';
        case 'share':
          return 'share';
        case 'sub':
          return 'sub';
        case 'chat':
        case 'chat_event':
        case 'join':
        case 'viewer':
        case 'custom':
        default:
          return 'chat_event';
      }
    };

    const unsubscribe = streamEventBus.subscribe((streamEvent) => {
      // Forward only real (non-simulated) events to active native Mode B overlay compositor.
      if (!streamEvent.isSimulation && isModeBOperatingMode(settingsRef.current.operatingMode)) {
        forwardModeBOverlayEvent(streamEvent);
      }

      // Map stream event to floating alert banner using canonical `message` property
      const alert: AlertEvent = {
        id: streamEvent.id,
        type: mapStreamEventToAlertType(streamEvent.type),
        username: streamEvent.username,
        message: streamEvent.detail,
        amount: streamEvent.amount,
        currency: streamEvent.currency,
        timestamp: streamEvent.timestamp,
        formattedTime: new Date(streamEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setActiveFloatingAlert(alert);
    });

    return () => unsubscribe();
  }, []);

  // Prime TTS engine on first user gesture (Android WebView requires this)
  useEffect(() => {
    const primeTTS = () => {
      ttsService.prime();
      window.removeEventListener('pointerdown', primeTTS);
      window.removeEventListener('keydown', primeTTS);
    };
    window.addEventListener('pointerdown', primeTTS, { once: true });
    window.addEventListener('keydown', primeTTS, { once: true });
    return () => {
      window.removeEventListener('pointerdown', primeTTS);
      window.removeEventListener('keydown', primeTTS);
    };
  }, []);

  // Quick Slots keyboard shortcuts
  useEffect(() => {
    const handleQuickSlotKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest(
            '[contenteditable="true"], button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="slider"], [role="dialog"], [aria-haspopup], [tabindex]:not([tabindex="-1"])'
          )
        )
      ) {
        return;
      }

      const slot = Number(event.key);
      if (!Number.isInteger(slot) || slot < 1 || slot > 4) return;

      const sbVolume = normalizeUnitVolume(settings.soundboardVolume, 0.85);
      void dispatchSoundboard(slot, soundboardItems, sbVolume).then((result) => {
        switch (result.status) {
          case 'played':
            return;
          case 'not_found':
            if (result.reason === 'slot_collision') return;
            return;
          case 'invalid_audio':
          case 'error':
            return;
        }
      });
    };

    window.addEventListener('keydown', handleQuickSlotKeyDown);
    return () => window.removeEventListener('keydown', handleQuickSlotKeyDown);
  }, [settings.soundboardVolume, soundboardItems]);

  // Android status bar follows the resolved theme (Adaptive Dark / Adaptive Light)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const meta = getThemeMeta(settings.theme);
    // Capacitor semantics: Style.Dark = light icons (dark background),
    // Style.Light = dark icons (light background).
    StatusBar.setBackgroundColor({ color: meta.bg }).catch(() => {});
    StatusBar.setStyle({ style: meta.mode === 'light' ? Style.Light : Style.Dark }).catch(() => {});
  }, [settings.theme]);

  // Android Native Hardware Back Button Handling (Capacitor)
  useEffect(() => {

    const backListenerPromise = CapApp.addListener('backButton', () => {
      // 1. If drawer or modal is open, dismiss it
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        return;
      }
      if (isModeModalOpen) {
        setIsModeModalOpen(false);
        return;
      }
      if (activeFloatingAlert) {
        setActiveFloatingAlert(null);
        return;
      }
      // 2. If in secondary navigation, navigate back to dashboard
      if (activeNav !== 'dashboard') {
        setActiveNav('dashboard');
        return;
      }
      // 3. If on dashboard, exit app
      CapApp.exitApp();
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [isDrawerOpen, isModeModalOpen, activeFloatingAlert, activeNav]);

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0] || null;
  const isModeBSelected = isModeBOperatingMode(settings.operatingMode);
  const isModeBMutationLocked =
    isModeBSelected &&
    (shouldLockModeBSceneMutations(modeBStatus) || isModeBSceneMutationLocked());

  // Mode Selection with safe Mode A <-> Mode B isolation and user confirmation
  const applyModeSwitch = async (targetMode: OperatingMode) => {
    const actionResult = await getModeBCoordinator().runExclusiveAction('Perpindahan Mode', async () => {
      const switchOutcome = await executeOperatingModeSwitch({
        currentMode: settingsRef.current.operatingMode,
        targetMode,
        companionRunning,
        modeASessionMode,
        isTikTokActive: tiktokLiveConnector.isActiveSession(),
        modeBStatus: modeBStatusRef.current,
        isNativeStreaming: isNativeStreamingAvailable(),
        stopModeASession: async () => {
          return stopModeASessionVerified();
        },
        verifyModeAStopped: async () => {
          if (tiktokLiveConnector.isActiveSession()) return false;
          if (!isNativeAndroidPlatform) return true;
          try {
            const st = await isCompanionRunning();
            const running = !!st?.isRunning;
            setCompanionRunning(running);
            if (running) {
              setModeASessionMode(
                tiktokLiveConnector.isActiveSession()
                  ? 'with_live_connector'
                  : 'without_live_connection',
              );
              return false;
            }
            return true;
          } catch {
            return false;
          }
        },
        hideHudIfNeeded: async () => {
          try {
            await hideFloatingHud();
          } catch (err) {
            console.warn('Gagal menyembunyikan Floating HUD saat berpindah ke Mode B:', err);
          }
        },
        stopModeBSession: async () => {
          const capturedRev = getModeBCoordinator().getRevision();
          const res = await stopModeBStream();
          getModeBCoordinator().commitPromiseSnapshotIfUnchanged(capturedRev, res);
          return res;
        },
        getModeBStatus: async () => {
          const capturedRev = getModeBCoordinator().getRevision();
          const res = await getModeBStreamStatus();
          getModeBCoordinator().commitPromiseSnapshotIfUnchanged(capturedRev, res);
          return res;
        },
      });

      if (!switchOutcome.switched) {
        setModeBNoticeBanner(
          switchOutcome.errorMessage ||
            'Perpindahan mode dibatalkan karena sesi aktif belum selesai dibersihkan.',
        );
        return;
      }

      const updated = { ...settingsRef.current, operatingMode: switchOutcome.nextMode };
      settingsRef.current = updated;
      setSettings(updated);
      setModeBNoticeBanner(null);
      await StorageService.saveSettings(updated);
    });

    if (!actionResult.acquired) {
      setModeBNoticeBanner(actionResult.reason);
    }
  };

  const handleSelectMode = async (mode: OperatingMode) => {
    if (modeBActionPendingRef.current) {
      setModeBNoticeBanner(
        'Operasi Mode B lain sedang berjalan. Tunggu hingga selesai sebelum berpindah mode.',
      );
      return;
    }

    const normalizedMode = normalizeOperatingMode(mode);
    const isCurrentModeA = isModeAOperatingMode(settingsRef.current.operatingMode);
    const isCurrentModeB = isModeBOperatingMode(settingsRef.current.operatingMode);
    const isTargetModeB = isModeBOperatingMode(normalizedMode);
    const isTargetModeA = isModeAOperatingMode(normalizedMode);

    if (
      isCurrentModeA &&
      isTargetModeB &&
      (companionRunning || modeASessionMode !== 'inactive' || tiktokLiveConnector.isActiveSession())
    ) {
      setPendingConfirmModal({
        title: 'Hentikan Sesi Mode A?',
        message:
          'Berpindah ke Mode B akan memutus konektor TikTok LIVE, menyembunyikan Floating HUD, dan menghentikan Companion Service yang sedang aktif. Lanjutkan?',
        confirmLabel: 'Hentikan Mode A & Pindah',
        tone: 'warn',
        onConfirm: () => applyModeSwitch(normalizedMode),
      });
      return;
    }

    if (isCurrentModeB && isTargetModeA && isModeBSessionActive(modeBStatusRef.current)) {
      setPendingConfirmModal({
        title: 'Hentikan Siaran RTMP Mode B?',
        message:
          'Berpindah ke Mode A saat encoder RTMP aktif akan menghentikan siaran LIVE Mode B terlebih dahulu. Lanjutkan?',
        confirmLabel: 'Hentikan Siaran & Pindah',
        tone: 'danger',
        onConfirm: () => applyModeSwitch(normalizedMode),
      });
      return;
    }

    await applyModeSwitch(normalizedMode);
  };

  // Mode B RTMP Actions (Single source of truth)
  const handleStartModeBStream = async () => {
    const actionResult = await getModeBCoordinator().runExclusiveAction('Go Live Mode B', async () => {
      setModeBNoticeBanner(null);
      const capturedRevision = getModeBCoordinator().getRevision();
      const outcome = await prepareAndStartModeBStream({
        settings: settingsRef.current,
        elements: studioElements,
        activePreset,
        resolveAssets: (ids) => StorageService.getStudioMediaAssetsByIds(ids),
      });
      setModeBNotificationWarning(
        outcome.notification.state === 'denied'
          ? outcome.notification.warningMessage ||
              'Izin notifikasi Android belum diberikan.'
          : null,
      );
      getModeBCoordinator().commitPromiseSnapshotIfUnchanged(capturedRevision, outcome.snapshot);
      if (outcome.snapshot.status === 'error' && outcome.snapshot.message) {
        setModeBNoticeBanner(outcome.snapshot.message);
      }
    });

    if (!actionResult.acquired) {
      setModeBNoticeBanner(actionResult.reason);
    }
  };

  const executeStopModeBStream = async () => {
    const actionResult = await getModeBCoordinator().runExclusiveAction('Stop LIVE Mode B', async () => {
      const stopRevision = getModeBCoordinator().getRevision();
      const cleanupResult = await stopModeBStreamAndWaitForCleanup({
        stopFn: () => stopModeBStream(),
        onStopSnapshot: (stopSnapshot) => {
          getModeBCoordinator().commitPromiseSnapshotIfUnchanged(stopRevision, stopSnapshot);
        },
        getStatusFn: async () => {
          const pollRevision = getModeBCoordinator().getRevision();
          const snapshot = await getModeBStreamStatus();
          getModeBCoordinator().commitPromiseSnapshotIfUnchanged(pollRevision, snapshot);
          return snapshot;
        },
      });
      if (!cleanupResult.ready && cleanupResult.message) {
        setModeBNoticeBanner(cleanupResult.message);
      }
    });

    if (!actionResult.acquired) {
      setModeBNoticeBanner(actionResult.reason);
    }
  };

  const handleStopModeBStream = async () => {
    if (modeBActionPendingRef.current) {
      setModeBNoticeBanner(
        'Operasi Mode B lain sedang berjalan. Tunggu hingga selesai sebelum menghentikan siaran.',
      );
      return;
    }
    const isActiveLive =
      modeBStatusRef.current.isStreaming ||
      ['live', 'host_wait', 'connecting', 'starting', 'reshare_waiting', 'resharing'].includes(
        modeBStatusRef.current.status,
      );
    if (settingsRef.current.confirmBeforeEndLive && isActiveLive) {
      setPendingConfirmModal({
        title: 'Akhiri Siaran RTMP Mode B?',
        message:
          'Siaran RTMP yang sedang aktif akan dihentikan dan koneksi ke server streaming akan diputus.',
        confirmLabel: 'Ya, Akhiri Siaran',
        tone: 'danger',
        onConfirm: executeStopModeBStream,
      });
      return;
    }
    await executeStopModeBStream();
  };

  const handleRequestModeBReshare = async () => {
    const actionResult = await getModeBCoordinator().runExclusiveAction('Bagikan Layar Lagi', async () => {
      const capturedRevision = getModeBCoordinator().getRevision();
      const result = await requestModeBScreenReshare();
      getModeBCoordinator().commitPromiseSnapshotIfUnchanged(capturedRevision, result);
    });

    if (!actionResult.acquired) {
      setModeBNoticeBanner(actionResult.reason);
    }
  };

  const handleToggleModeBHostWait = async () => {
    const actionResult = await getModeBCoordinator().runExclusiveAction('Layar Tunggu Host', async () => {
      const capturedRevision = getModeBCoordinator().getRevision();
      const nextEnabled = modeBStatusRef.current.status !== 'host_wait';
      const result = await setModeBHostWait(nextEnabled);
      getModeBCoordinator().commitPromiseSnapshotIfUnchanged(capturedRevision, result);
    });

    if (!actionResult.acquired) {
      setModeBNoticeBanner(actionResult.reason);
    }
  };

  const handleApplyLiveSceneToModeB = async (
    elementsOverride?: StudioElement[],
    presetOverride?: StudioPreset | null,
  ): Promise<{ success: boolean; message: string }> => {
    const actionResult = await getModeBCoordinator().runExclusiveAction('Terapkan Perubahan ke LIVE', async () => {
      const targetPreset = presetOverride ?? activePreset;
      const result = await applyLiveSceneChangeToModeB({
        elements: elementsOverride ?? studioElements,
        targetPreset,
        activePreset,
        modeBStatus: modeBStatusRef.current,
        resolveAssets: (ids) => StorageService.getStudioMediaAssetsByIds(ids),
      });
      const msg =
        result.message ||
        (result.applied
          ? 'Perubahan scene berhasil diterapkan ke siaran LIVE.'
          : 'Scene siap.');
      setModeBNoticeBanner(msg);
      return { success: result.allowed && result.applied, message: msg };
    });

    if (!actionResult.acquired) {
      setModeBNoticeBanner(actionResult.reason);
      return { success: false, message: actionResult.reason };
    }
    return actionResult.value;
  };

  const handleUpdatePresetModeBSettings = async (
    presetId: string,
    patch: Pick<
      Partial<StudioPreset>,
      'backgroundUri' | 'screensaver' | 'transitionIn' | 'transitionOut'
    >,
  ) => {
    await flushStudioPersistence();
    const updatedPresets = presets.map((p) =>
      p.id === presetId ? normalizeStudioPreset({ ...p, ...patch }) : p,
    );
    setPresets(updatedPresets);
    await StorageService.savePresets(updatedPresets);
  };

  const guardModeBStructuralPresetAction = async (): Promise<boolean> => {
    if (!isModeBOperatingMode(settingsRef.current.operatingMode)) return true;
    const allowed = await canChangeActivePresetDuringModeB();
    if (!allowed) {
      setModeBNoticeBanner(
        'Saat Mode B aktif atau sibuk, pembuatan/penghapusan/perubahan struktur preset diblokir. Hentikan siaran terlebih dahulu atau pilih preset statis yang kompatibel saat LIVE.',
      );
      return false;
    }
    return true;
  };

  const handleUpdateActivePresetMetadata = async (patch: Partial<StudioPreset>) => {
    if (!(await guardModeBStructuralPresetAction())) return;
    await flushStudioPersistence();
    const latestElements = ensureUniqueElementIds(studioElements);
    const updated = presets.map((preset) =>
      preset.id === activePresetId
        ? normalizeStudioPreset({
            ...preset,
            ...patch,
            elements: latestElements,
          })
        : preset,
    );
    setPresets(updated);
    await StorageService.savePresets(updated);
  };

  // Canvas Orientation
  const handleOrientationChange = async (orientation: CanvasOrientation) => {
    if (isModeBMutationLocked) {
      setModeBNoticeBanner(
        'Orientasi kanvas tidak dapat diubah saat siaran Mode B aktif. Hentikan siaran terlebih dahulu.',
      );
      return;
    }
    await flushStudioPersistence();
    const updated = { ...settingsRef.current, canvasOrientation: orientation };
    const updatedPresets = presets.map((preset) =>
      preset.id === activePresetId
        ? normalizeStudioPreset({
            ...preset,
            canvasOrientation: orientation,
            category: (orientation === '9:16' ? 'hp_screen' : orientation === '16:9' ? 'landscape' : 'portrait') as StudioPreset['category'],
            canvas: undefined,
          })
        : preset,
    );
    settingsRef.current = updated;
    setSettings(updated);
    setPresets(updatedPresets);
    await Promise.all([
      StorageService.saveSettings(updated),
      StorageService.savePresets(updatedPresets),
    ]);
  };

  // Studio Elements Handlers
  const handleUpdateStudioElements = (newElements: StudioElement[]) => {
    if (isModeBMutationLocked && modeBStatusRef.current.status !== 'live') {
      setModeBNoticeBanner(
        'Kanvas Studio dikunci sementara selama Mode B memulai/mengakhiri atau berbagi layar.',
      );
      return;
    }
    const sanitized = ensureUniqueElementIds(newElements);
    setStudioElements(sanitized);

    // The active preset and live canvas are one editing document. Update both in memory
    // immediately, then persist one coalesced snapshot after the current gesture settles.
    const updatedPresets = presets.map((preset) =>
      preset.id === activePresetId ? normalizeStudioPreset({ ...preset, elements: sanitized }) : preset,
    );
    setPresets(updatedPresets);
    pendingStudioPersistenceRef.current = { elements: sanitized, presets: updatedPresets };
    if (studioPersistenceTimerRef.current) clearTimeout(studioPersistenceTimerRef.current);
    studioPersistenceTimerRef.current = setTimeout(() => {
      void flushStudioPersistence().catch((error) => {
        console.error('Gagal menyimpan perubahan Studio:', error);
      });
    }, 220);
  };

  const handleAddSingleElementToStudio = async (newElement: StudioElement) => {
    const uniqueId =
      newElement.id && !studioElements.some((e) => e.id === newElement.id)
        ? newElement.id
        : `elem_${newElement.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const updated = [...studioElements, { ...newElement, id: uniqueId }];
    handleUpdateStudioElements(updated);
    await flushStudioPersistence();
  };

  const handleInstallMarketplaceElements = async (elementsPayload: StudioElement[]) => {
    // Generate fresh unique IDs for installed elements so they never collide with existing elements
    const freshElements = elementsPayload.map((elem) => ({
      ...elem,
      id: `elem_${elem.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }));
    const updated = [...studioElements, ...freshElements];
    handleUpdateStudioElements(updated);
    await flushStudioPersistence();
  };

  const handleSaveCanvasAsPreset = async () => {
    if (!(await guardModeBStructuralPresetAction())) return;
    await flushStudioPersistence();
    const currentOrientation = settingsRef.current.canvasOrientation;
    const newPreset: StudioPreset = normalizeStudioPreset({
      id: `preset_${Date.now()}`,
      name: `Preset Baru ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      category: currentOrientation === '9:16' ? 'hp_screen' : currentOrientation === '16:9' ? 'landscape' : 'portrait',
      canvasOrientation: currentOrientation,
      elements: ensureUniqueElementIds([...studioElements]),
      createdAt: Date.now(),
      isFavorite: false,
      description: 'Preset tersimpan dari Studio Canvas',
      thumbnailColor: '#2563EB',
    });
    const updated = [newPreset, ...presets];
    setPresets(updated);
    setActivePresetId(newPreset.id);
    setStudioElements(newPreset.elements);
    const updatedSettings = {
      ...settingsRef.current,
      canvasOrientation: newPreset.canvasOrientation,
    };
    settingsRef.current = updatedSettings;
    setSettings(updatedSettings);
    await StorageService.savePresets(updated);
    await StorageService.saveActivePresetId(newPreset.id);
    await StorageService.saveStudioElements(newPreset.elements);
    await StorageService.saveSettings(updatedSettings);
  };

  // Preset Handlers
  const handleSelectPreset = async (presetId: string) => {
    await flushStudioPersistence();
    const target = presets.find((p) => p.id === presetId);
    if (!target || presetId === activePresetId) return;

    if (isModeBOperatingMode(settingsRef.current.operatingMode)) {
      const actionResult = await getModeBCoordinator().runExclusiveAction('Mengganti Preset Mode B', async () => {
        const liveCheck = await applyLiveSceneChangeToModeB({
          elements: target.elements,
          targetPreset: target,
          activePreset,
          modeBStatus: modeBStatusRef.current,
          resolveAssets: (ids) => StorageService.getStudioMediaAssetsByIds(ids),
        });
        if (!liveCheck.allowed) {
          if (liveCheck.message) setModeBNoticeBanner(liveCheck.message);
          return;
        }
        if (liveCheck.applied && liveCheck.message) {
          setModeBNoticeBanner(liveCheck.message);
        }

        setActivePresetId(presetId);
        const sanitizedElements = ensureUniqueElementIds(target.elements);
        setStudioElements(sanitizedElements);
        const updatedSettings = {
          ...settingsRef.current,
          canvasOrientation: target.canvasOrientation,
        };
        settingsRef.current = updatedSettings;
        setSettings(updatedSettings);
        await StorageService.saveActivePresetId(presetId);
        await StorageService.saveStudioElements(sanitizedElements);
        await StorageService.saveSettings(updatedSettings);
      });

      if (!actionResult.acquired) {
        setModeBNoticeBanner(actionResult.reason);
      }
      return;
    }

    setActivePresetId(presetId);
    const sanitizedElements = ensureUniqueElementIds(target.elements);
    setStudioElements(sanitizedElements);
    const updatedSettings = {
      ...settingsRef.current,
      canvasOrientation: target.canvasOrientation,
    };
    settingsRef.current = updatedSettings;
    setSettings(updatedSettings);
    await StorageService.saveActivePresetId(presetId);
    await StorageService.saveStudioElements(sanitizedElements);
    await StorageService.saveSettings(updatedSettings);
  };

  const handleCreatePreset = async (presetData: Omit<StudioPreset, 'id' | 'createdAt'>): Promise<boolean> => {
    if (!(await guardModeBStructuralPresetAction())) return false;
    await flushStudioPersistence();
    const newPreset: StudioPreset = normalizeStudioPreset({
      ...presetData,
      id: `preset_${Date.now()}`,
      elements: ensureUniqueElementIds(presetData.elements),
      createdAt: Date.now(),
    });
    const updated = [newPreset, ...presets];
    const updatedSettings = {
      ...settingsRef.current,
      canvasOrientation: newPreset.canvasOrientation,
    };
    await StorageService.savePresetActivationAtomically({
      presets: updated,
      activePresetId: newPreset.id,
      studioElements: newPreset.elements,
      settings: updatedSettings,
    });
    setPresets(updated);
    setActivePresetId(newPreset.id);
    setStudioElements(newPreset.elements);
    settingsRef.current = updatedSettings;
    setSettings(updatedSettings);
    return true;
  };

  const handleDuplicatePreset = async (presetId: string) => {
    if (!(await guardModeBStructuralPresetAction())) return;
    await flushStudioPersistence();
    const source = presets.find((p) => p.id === presetId);
    if (!source) return;
    const elementIdMap = new Map<string, string>();
    const duplicatedElements = source.elements.map((el, index) => {
      const id = `elem_${el.type}_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`;
      elementIdMap.set(el.id, id);
      return { ...el, id };
    });
    const groupIdMap = new Map<string, string>();
    const duplicatedGroups = (source.groups || []).map((group, index) => {
      const id = `group_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
      groupIdMap.set(group.id, id);
      return {
        ...group,
        id,
        elementIds: group.elementIds
          .map((elementId) => elementIdMap.get(elementId))
          .filter((value): value is string => Boolean(value)),
      };
    });
    const duplicatedSuperGroups = (source.superGroups || []).map((group, index) => ({
      ...group,
      id: `super_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      groupIds: group.groupIds
        .map((groupId) => groupIdMap.get(groupId))
        .filter((value): value is string => Boolean(value)),
    }));
    const duplicated: StudioPreset = normalizeStudioPreset({
      ...source,
      id: `preset_${Date.now()}`,
      name: `${source.name} (Salinan)`,
      elements: duplicatedElements,
      groups: duplicatedGroups,
      superGroups: duplicatedSuperGroups,
      createdAt: Date.now(),
      isFavorite: false,
    });
    const updated = [...presets, duplicated];
    setPresets(updated);
    await StorageService.savePresets(updated);
  };

  const handleDeletePreset = async (presetId: string) => {
    if (presets.length <= 1) return;
    if (!(await guardModeBStructuralPresetAction())) return;
    await flushStudioPersistence();
    const updated = presets.filter((p) => p.id !== presetId);
    if (updated.length === 0) return;
    setPresets(updated);
    await StorageService.savePresets(updated);
    if (activePresetId === presetId) {
      const nextPreset = updated[0];
      const sanitizedElements = ensureUniqueElementIds(nextPreset.elements);
      const updatedSettings = {
        ...settingsRef.current,
        canvasOrientation: nextPreset.canvasOrientation,
      };
      setActivePresetId(nextPreset.id);
      setStudioElements(sanitizedElements);
      settingsRef.current = updatedSettings;
      setSettings(updatedSettings);
      await StorageService.saveActivePresetId(nextPreset.id);
      await StorageService.saveStudioElements(sanitizedElements);
      await StorageService.saveSettings(updatedSettings);
    }
  };

  const handleRenamePreset = async (presetId: string, newName: string) => {
    await flushStudioPersistence();
    const updated = presets.map((p) =>
      p.id === presetId ? normalizeStudioPreset({ ...p, name: newName }) : p,
    );
    setPresets(updated);
    await StorageService.savePresets(updated);
  };

  const handleToggleFavoritePreset = async (presetId: string) => {
    await flushStudioPersistence();
    const updated = presets.map((p) =>
      p.id === presetId ? normalizeStudioPreset({ ...p, isFavorite: !p.isFavorite }) : p,
    );
    setPresets(updated);
    await StorageService.savePresets(updated);
  };

  // TTS & Integrations Handlers
  const handleUpdateTTSConfig = async (newConfig: TTSConfig) => {
    setTTSConfig(newConfig);
    ttsService.updateConfig(newConfig);
    await StorageService.saveTTSConfig(newConfig);
  };

  const handleUpdateIntegrations = async (newIntegrations: IntegrationProvider[]) => {
    setIntegrations(newIntegrations);
    await StorageService.saveIntegrations(newIntegrations);
  };

  // Sinkronisasi status konektor TikTok LIVE Mode A yang sebenarnya (tanpa status palsu).
  useEffect(() => {
    const unsubscribe = tiktokLiveConnector.subscribe((nextStatus) => {
      setTiktokStatus(nextStatus);
      const trulyConnected =
        nextStatus.state === 'connected_direct' || nextStatus.state === 'connected_euler';
      setIntegrations((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (item.id !== 'tiktok') return item;
          const desiredStatus = trulyConnected ? 'ACTIVE' : 'NOT_CONNECTED';
          const configuredTarget = resolveTikTokTargetUsername(
            settingsRef.current,
            tiktokAccountRef.current
          );
          const linkedLabel = tiktokAccountRef.current.isLinked
            ? tiktokAccountRef.current.username ||
              tiktokAccountRef.current.displayName ||
              tiktokAccountRef.current.openId
            : undefined;
          const desiredUser = nextStatus.username || configuredTarget || linkedLabel;
          if (item.status !== desiredStatus || item.connectedUser !== desiredUser) {
            changed = true;
            return {
              ...item,
              status: desiredStatus as IntegrationProvider['status'],
              connectedUser: desiredUser,
            };
          }
          return item;
        });
        return changed ? next : prev;
      });
    });

    if (Capacitor.getPlatform() === 'android') {
      void tiktokLiveConnector.syncFromNative();
    }

    return () => unsubscribe();
  }, []);

  // Proses callback OAuth PKCE TikTok (deep link Android atau postMessage popup Web).
  const processTikTokOAuthCallback = useCallback(async (callbackUrl: string) => {
    setTiktokAccount((prev) => ({
      ...prev,
      accountLinkStatus: 'linking',
      linkErrorMessage: undefined,
    }));

    const result = await handleTikTokAuthCallbackUrl(callbackUrl);
    const current = tiktokAccountRef.current;

    if (result.success) {
      const nextAccount = await StorageService.saveTikTokAccount(
        applyVerifiedProfileToAccountState(current, result.profile)
      );
      setTiktokAccount(nextAccount);

      const nextSettings: AppSettings = {
        ...settingsRef.current,
        tiktokUsername: resolveTikTokTargetUsername(settingsRef.current, nextAccount),
      };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      await writeSettingsToStorage(nextSettings);
      return;
    }

    const failedAccount = await StorageService.saveTikTokAccount({
      ...current,
      isLinked: false,
      openId: undefined,
      username: undefined,
      displayName: undefined,
      avatarUrl: undefined,
      grantedScopes: undefined,
      accountLinkStatus: 'failed',
      linkErrorMessage: result.message,
    });
    setTiktokAccount(failedAccount);
  }, []);

  useEffect(() => {
    let disposed = false;
    const urlListenerPromise = CapApp.addListener('appUrlOpen', ({ url }) => {
      if (disposed || !url) return;
      if (url.includes('state=') && (url.includes('code=') || url.includes('error='))) {
        void processTikTokOAuthCallback(url);
      }
    });

    const handleWindowMessage = (event: MessageEvent) => {
      if (disposed) return;
      const isAllowedOrigin =
        event.origin === window.location.origin ||
        event.origin.endsWith('.run.app') ||
        event.origin.startsWith('http://localhost');
      if (!isAllowedOrigin) return;
      const payload = event.data as { type?: string; url?: string } | null;
      if (payload?.type === 'TIKTOK_OAUTH_CALLBACK' && typeof payload.url === 'string') {
        void processTikTokOAuthCallback(payload.url);
      }
    };
    window.addEventListener('message', handleWindowMessage);

    return () => {
      disposed = true;
      void urlListenerPromise.then((handle) => handle.remove()).catch(() => {});
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [processTikTokOAuthCallback]);

  const handleLoginTikTok = async () => {
    setTiktokAccount((prev) => ({
      ...prev,
      accountLinkStatus: 'linking',
      linkErrorMessage: undefined,
    }));

    const startRes = await startTikTokOAuthLogin();
    if (!startRes.started) {
      const failedAccount = await StorageService.saveTikTokAccount({
        ...tiktokAccountRef.current,
        isLinked: false,
        accountLinkStatus: 'failed',
        linkErrorMessage: startRes.message,
      });
      setTiktokAccount(failedAccount);
    }
  };

  const handleSaveTikTokTargetUsername = async (rawUsername: string) => {
    const trimmed = (rawUsername || '').trim();
    const normalized = trimmed === '' ? '' : normalizeTikTokTargetUsername(trimmed);
    if (normalized !== '' && !isValidTikTokTargetUsername(normalized)) {
      return;
    }

    const nextSettings: AppSettings = {
      ...settingsRef.current,
      tiktokUsername: normalized,
    };
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    await writeSettingsToStorage(nextSettings);

    const resolvedPreview = resolveTikTokTargetUsername(nextSettings, tiktokAccountRef.current);
    setIntegrations((prev) =>
      prev.map((item) =>
        item.id === 'tiktok'
          ? {
              ...item,
              connectedUser: tiktokLiveConnector.isConnected()
                ? tiktokLiveConnector.getStatus().username || resolvedPreview || undefined
                : resolvedPreview || undefined,
            }
          : item
      )
    );
  };

  const handleUnlinkTikTok = async () => {
    await tiktokLiveConnector.disconnect();
    const cleared = await StorageService.clearTikTokAccount();
    tiktokAccountRef.current = cleared;
    setTiktokAccount(cleared);

    const persistedSettings = await StorageService.getSettings();
    settingsRef.current = persistedSettings;
    setSettings(persistedSettings);

    const remainingTarget = resolveTikTokTargetUsername(persistedSettings, cleared);
    setIntegrations((prev) =>
      prev.map((item) =>
        item.id === 'tiktok'
          ? {
              ...item,
              status: 'NOT_CONNECTED',
              connectedUser: remainingTarget || undefined,
            }
          : item
      )
    );
  };

  const handleUpdateTikTokConnectionPrefs = async (prefs: {
    connectionMethod: TikTokConnectionMethod;
    fallbackEnabled: boolean;
    eulerApiKey?: string;
    clearEulerApiKey?: boolean;
    eulerJwtKey?: string;
    clearEulerJwtKey?: boolean;
  }) => {
    const savedAccount = await StorageService.saveTikTokAccount({
      ...tiktokAccountRef.current,
      connectionMethod: prefs.connectionMethod,
      fallbackEnabled: prefs.fallbackEnabled,
    });
    setTiktokAccount(savedAccount);

    const credentialUpdates: Partial<AppSettings> = {};
    if (prefs.clearEulerApiKey) {
      credentialUpdates.eulerStreamApiKey = '';
    } else if (prefs.eulerApiKey !== undefined) {
      const trimmedApiKey = prefs.eulerApiKey.trim();
      credentialUpdates.eulerStreamApiKey = trimmedApiKey;
      if (trimmedApiKey) {
        // Exactly one Euler credential may be active at a time.
        credentialUpdates.eulerStreamJwtKey = '';
      }
    }

    if (prefs.clearEulerJwtKey) {
      credentialUpdates.eulerStreamJwtKey = '';
    } else if (prefs.eulerJwtKey !== undefined) {
      const trimmedJwtKey = prefs.eulerJwtKey.trim();
      credentialUpdates.eulerStreamJwtKey = trimmedJwtKey;
      if (trimmedJwtKey) {
        // Exactly one Euler credential may be active at a time.
        credentialUpdates.eulerStreamApiKey = '';
      }
    }

    const nextSettings: AppSettings = {
      ...settingsRef.current,
      tiktokConnectionMethod: prefs.connectionMethod,
      tiktokEulerFallbackEnabled: prefs.fallbackEnabled,
      ...credentialUpdates,
    };
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    await writeSettingsToStorage(nextSettings);

    const activeStatus = tiktokLiveConnector.getStatus();
    if (
      (prefs.clearEulerApiKey || prefs.clearEulerJwtKey) &&
      (tiktokLiveConnector.isActiveSession() || activeStatus.state === 'waiting_for_live') &&
      (prefs.connectionMethod === 'euler' ||
        activeStatus.connectionMethod === 'euler' ||
        activeStatus.transport === 'euler')
    ) {
      await tiktokLiveConnector.disconnect();
    }
  };

  const handleConnectTikTok = async (
    username: string,
    eulerApiKey?: string,
    allowEulerFallback?: boolean,
    connectionMethod?: TikTokConnectionMethod,
    eulerJwtKey?: string
  ) => {
    const normalized = normalizeTikTokTargetUsername(username);
    if (!isValidTikTokTargetUsername(normalized)) {
      return;
    }

    const useCallerCredentials = eulerApiKey !== undefined || eulerJwtKey !== undefined;
    await tiktokLiveConnector.connect({
      username: normalized,
      eulerApiKey: useCallerCredentials ? eulerApiKey : settingsRef.current.eulerStreamApiKey,
      eulerJwtKey: useCallerCredentials ? eulerJwtKey : settingsRef.current.eulerStreamJwtKey,
      allowEulerFallback:
        allowEulerFallback ??
        tiktokAccountRef.current.fallbackEnabled ??
        settingsRef.current.tiktokEulerFallbackEnabled ??
        true,
      connectionMethod:
        connectionMethod ??
        tiktokAccountRef.current.connectionMethod ??
        settingsRef.current.tiktokConnectionMethod ??
        'direct',
    });
  };

  const handleDisconnectTikTok = async () => {
    await tiktokLiveConnector.disconnect();
  };

  const handleOpenTikTokConnection = () => {
    setOpenTikTokSettingsNonce((n) => n + 1);
    handleNavigate('integrations');
  };

  const mapSrItemToUnifiedQueueItem = (
    item: SongRequestItem,
    status: 'playing' | 'approved'
  ): UnifiedQueueItem => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    source:
      item.sourceType === 'local_file'
        ? 'local'
        : item.sourceType === 'youtube_metadata'
        ? 'youtube'
        : item.sourceType === 'spotify_metadata'
        ? 'spotify'
        : 'viewer_request',
    externalUrl: item.externalUrl,
    thumbnailUrl: item.thumbnailUrl,
    duration: item.durationSec,
    requesterName: item.requester,
    platform: item.platform || 'TikTok',
    addedAt: item.requestedAt,
    status,
    notes: item.notes,
    localFileKey: item.localFileId,
  });

  const srActiveIds = new Set<string>([
    ...(srState.currentTrack ? [srState.currentTrack.id] : []),
    ...srState.queue.map((item) => item.id),
  ]);

  const combinedUnifiedQueue: UnifiedQueueItem[] = [
    ...(srState.currentTrack
      ? [mapSrItemToUnifiedQueueItem(srState.currentTrack, 'playing')]
      : []),
    ...srState.queue.map((item) => mapSrItemToUnifiedQueueItem(item, 'approved')),
    ...unifiedQueue.filter((item) => !srActiveIds.has(item.id)),
  ];

  const effectiveNowPlayingSong: SongRequest | null = srState.currentTrack
    ? {
        id: srState.currentTrack.id,
        title: srState.currentTrack.title,
        artist: srState.currentTrack.artist,
        duration: srState.durationSec || srState.currentTrack.durationSec,
        requesterName: srState.currentTrack.requester,
        platform: srState.currentTrack.platform || 'TikTok',
        status: srState.isPlaying ? 'playing' : 'queued',
        requestedAt: srState.currentTrack.requestedAt,
        source:
          srState.currentTrack.sourceType === 'local_file'
            ? 'local'
            : srState.currentTrack.sourceType === 'youtube_metadata'
            ? 'youtube'
            : srState.currentTrack.sourceType === 'spotify_metadata'
            ? 'spotify'
            : 'viewer_request',
        externalUrl: srState.currentTrack.externalUrl,
        thumbnailUrl: srState.currentTrack.thumbnailUrl,
      }
    : audioEngineState.currentTrackId
    ? {
        id: audioEngineState.currentTrackId,
        title: audioEngineState.title,
        artist: audioEngineState.artist,
        duration: Math.round(audioEngineState.duration || 0),
        requesterName: nowPlayingSong?.requesterName || 'Streamer',
        platform: nowPlayingSong?.platform || 'Local',
        status: audioEngineState.isPlaying ? 'playing' : 'queued',
        requestedAt: nowPlayingSong?.requestedAt || Date.now(),
      }
    : nowPlayingSong;

  const effectiveIsPlayingMusic = srState.currentTrack
    ? srState.isPlaying
    : audioEngineState.isPlaying;

  // Music Player Controls (Mode A SongRequestEngine + HTML5 LocalAudioEngine)
  const handleTogglePlayMusic = () => {
    if (srState.currentTrack || srState.queue.length > 0) {
      if (audioEngine.getState().isPlaying) {
        audioEngine.pause();
      }
      void songRequestEngine.togglePlayPause();
      return;
    }

    const audioState = audioEngine.getState();
    if (audioState.isPlaying) {
      audioEngine.pause();
    } else if (audioState.currentTrackId) {
      void audioEngine.play();
    } else {
      const activeSong = unifiedQueue.find((s) => s.status === 'playing') || unifiedQueue[0];
      if (activeSong?.localFileKey) {
        const file = localFilesMap.get(activeSong.localFileKey);
        if (file) {
          void audioEngine.loadAndPlayFile(activeSong.id, activeSong.title, activeSong.artist, file);
        }
      } else if (activeSong?.externalUrl) {
        void audioEngine.loadAndPlayUrl(activeSong.id, activeSong.title, activeSong.artist, activeSong.externalUrl);
      }
    }
  };

  const handleNextTrack = async () => {
    if (srState.currentTrack || srState.queue.length > 0) {
      await songRequestEngine.skipTrack('Streamer');
      return;
    }

    const queued = unifiedQueue.filter((s) => s.status === 'approved' || s.status === 'pending');
    if (queued.length > 0) {
      const nextItem = queued[0];
      const updatedQueue = unifiedQueue.map((item) => {
        if (item.status === 'playing') return { ...item, status: 'completed' as const };
        if (item.id === nextItem.id) return { ...item, status: 'playing' as const };
        return item;
      });
      setUnifiedQueue(updatedQueue);
      await StorageService.saveUnifiedQueue(updatedQueue);

      const legacyItem: SongRequest = {
        id: nextItem.id,
        title: nextItem.title,
        artist: nextItem.artist,
        duration: nextItem.duration || 180,
        requesterName: nextItem.requesterName,
        platform: nextItem.platform || 'Manual',
        status: 'playing',
        requestedAt: nextItem.addedAt,
      };
      setNowPlayingSong(legacyItem);
      if (nextItem.localFileKey && localFilesMap.has(nextItem.localFileKey)) {
        const file = localFilesMap.get(nextItem.localFileKey)!;
        await audioEngine.loadAndPlayFile(nextItem.id, nextItem.title, nextItem.artist, file);
      } else if (nextItem.externalUrl && nextItem.source === 'local') {
        await audioEngine.loadAndPlayUrl(nextItem.id, nextItem.title, nextItem.artist, nextItem.externalUrl);
      }
    } else {
      audioEngine.pause();
      setNowPlayingSong(null);
    }
  };

  const handlePrevTrack = async () => {
    const completed = unifiedQueue.filter((s) => s.status === 'completed');
    if (completed.length > 0) {
      const prevItem = completed[completed.length - 1];
      const updatedQueue = unifiedQueue.map((item) => {
        if (item.id === prevItem.id) return { ...item, status: 'playing' as const };
        if (item.status === 'playing') return { ...item, status: 'approved' as const };
        return item;
      });
      setUnifiedQueue(updatedQueue);
      await StorageService.saveUnifiedQueue(updatedQueue);

      const legacyItem: SongRequest = {
        id: prevItem.id,
        title: prevItem.title,
        artist: prevItem.artist,
        duration: prevItem.duration || 180,
        requesterName: prevItem.requesterName,
        platform: prevItem.platform || 'Manual',
        status: 'playing',
        requestedAt: prevItem.addedAt,
      };
      setNowPlayingSong(legacyItem);
      if (prevItem.localFileKey && localFilesMap.has(prevItem.localFileKey)) {
        const file = localFilesMap.get(prevItem.localFileKey)!;
        await audioEngine.loadAndPlayFile(prevItem.id, prevItem.title, prevItem.artist, file);
      } else if (prevItem.externalUrl && prevItem.source === 'local') {
        await audioEngine.loadAndPlayUrl(prevItem.id, prevItem.title, prevItem.artist, prevItem.externalUrl);
      }
    }
  };

  const handleAddSongRequest = async (newRequest: Omit<SongRequest, 'id' | 'requestedAt'>) => {
    const newSong: SongRequest = {
      ...newRequest,
      id: `req_${Date.now()}`,
      requestedAt: Date.now(),
    };
    const updated = [...songRequests, newSong];
    setSongRequests(updated);
    await StorageService.saveSongRequests(updated);

    if (isModeAOperatingMode(settings.operatingMode) && newRequest.title?.trim()) {
      await songRequestEngine.handlePlayCommand(
        newRequest.requesterName || 'Streamer',
        newRequest.title.trim(),
        false
      );
      return;
    }

    const queueItem: UnifiedQueueItem = {
      id: newSong.id,
      title: newSong.title,
      artist: newSong.artist,
      source: 'viewer_request',
      duration: newSong.duration,
      requesterName: newSong.requesterName,
      platform: newSong.platform,
      addedAt: newSong.requestedAt,
      status: 'pending',
    };
    const updatedQueue = [...unifiedQueue, queueItem];
    setUnifiedQueue(updatedQueue);
    await StorageService.saveUnifiedQueue(updatedQueue);
  };

  /**
   * Buffer event LIVE untuk panel Chat HUD.
   * - terbatas di memori (HUD_EVENT_BUFFER_LIMIT), terbaru lebih dulu
   * - identitas event unik agar tidak duplikat saat reconnect
   * - perintah !play / !next Mode A diproses oleh songRequestEngine.
   */
  useEffect(() => {
    type BusEvent = ReturnType<typeof streamEventBus.getHistory>[number];

    const pushEvent = (streamEvent: BusEvent) => {
      setHudEvents((prev) => {
        if (prev.some((item) => item.id === streamEvent.id)) return prev;
        const next: HudChatEntry[] = [
          {
            id: streamEvent.id,
            type: streamEvent.type,
            username: streamEvent.username,
            detail: streamEvent.detail,
            timestamp: streamEvent.timestamp,
            isSimulation: streamEvent.isSimulation,
          },
          ...prev,
        ];
        return next.length > HUD_EVENT_BUFFER_LIMIT ? next.slice(0, HUD_EVENT_BUFFER_LIMIT) : next;
      });
      if (hudPausedRef.current) setHudUnread((count) => count + 1);
    };

    streamEventBus.getHistory().forEach((item) => pushEvent(item));

    return streamEventBus.subscribe((streamEvent) => {
      pushEvent(streamEvent);
    });
  }, []);

  const handleDeleteSongRequest = async (id: string) => {
    const updated = songRequests.filter((s) => s.id !== id);
    setSongRequests(updated);
    if (srState.currentTrack?.id === id) {
      await songRequestEngine.stop();
    } else if (srState.queue.some((q) => q.id === id)) {
      songRequestEngine.removeQueueItem(id);
    }
    if (nowPlayingSong?.id === id) {
      setNowPlayingSong(null);
    }
    await StorageService.saveSongRequests(updated);

    const updatedQueue = unifiedQueue.filter((q) => q.id !== id);
    setUnifiedQueue(updatedQueue);
    await StorageService.saveUnifiedQueue(updatedQueue);
  };

  const handleSetNowPlaying = async (song: SongRequest) => {
    const updated = songRequests.map((s) => {
      if (s.id === song.id) return { ...s, status: 'playing' as const };
      if (s.id === nowPlayingSong?.id) return { ...s, status: 'queued' as const };
      return s;
    });
    setSongRequests(updated);
    setNowPlayingSong(song);
    await StorageService.saveSongRequests(updated);
  };

  const handleLoadPresetPack = async (packName: string) => {
    let newTracks: SongRequest[] = [];
    if (packName === 'synthwave') {
      newTracks = [
        { id: `req_${Date.now()}_1`, title: 'Cyber City Run', artist: 'Outrun 84', duration: 198, requesterName: 'NeonKnight', platform: 'Twitch', status: 'queued', requestedAt: Date.now(), source: 'viewer_request' },
        { id: `req_${Date.now()}_2`, title: 'Laser Grid Odyssey', artist: 'Megadrive Dreams', duration: 210, requesterName: 'SynthAddict', platform: 'TikTok', status: 'queued', requestedAt: Date.now(), source: 'viewer_request' },
      ];
    } else {
      newTracks = [
        { id: `req_${Date.now()}_1`, title: 'Tokyo Rain Walk', artist: 'Tea Garden', duration: 154, requesterName: 'CoffeeLover', platform: 'YouTube', status: 'queued', requestedAt: Date.now(), source: 'youtube', externalUrl: 'https://youtube.com' },
      ];
    }

    const merged = [...songRequests, ...newTracks];
    setSongRequests(merged);
    await StorageService.saveSongRequests(merged);
  };

  const handleAddLocalFiles = async (files: File[]) => {
    const newMetaList: LocalAudioTrackMeta[] = [];
    const newFilesMap = new Map(localFilesMap);

    for (const file of files) {
      const trackId = `track_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const parts = cleanName.split('-');
      const artist = parts.length > 1 ? parts[0].trim() : 'Local Audio';
      const title = parts.length > 1 ? parts.slice(1).join('-').trim() : cleanName;

      const tempAudio = new Audio();
      const objUrl = URL.createObjectURL(file);
      tempAudio.src = objUrl;

      const duration: number = await new Promise((resolve) => {
        tempAudio.onloadedmetadata = () => {
          URL.revokeObjectURL(objUrl);
          resolve(tempAudio.duration || 180);
        };
        tempAudio.onerror = () => {
          URL.revokeObjectURL(objUrl);
          resolve(180);
        };
      });

      const meta: LocalAudioTrackMeta = {
        id: trackId,
        title,
        artist,
        filename: file.name,
        duration: Math.round(duration),
        sizeBytes: file.size,
        mimeType: file.type || 'audio/mpeg',
        addedAt: Date.now(),
      };

      newMetaList.push(meta);
      newFilesMap.set(trackId, file);
    }

    const mergedMeta = [...localTracksMeta, ...newMetaList];
    setLocalTracksMeta(mergedMeta);
    setLocalFilesMap(newFilesMap);
    await StorageService.saveLocalTracksMeta(mergedMeta);
  };

  const handleRemoveLocalTrack = async (id: string) => {
    const updated = localTracksMeta.filter((t) => t.id !== id);
    setLocalTracksMeta(updated);
    const updatedMap = new Map(localFilesMap);
    updatedMap.delete(id);
    setLocalFilesMap(updatedMap);
    await StorageService.saveLocalTracksMeta(updated);
  };

  const handleUpdateUnifiedQueue = async (nextQueue: UnifiedQueueItem[]) => {
    const currentSrId = srState.currentTrack?.id;
    const queuedSrMap = new Map(srState.queue.map((item) => [item.id, item]));

    if (currentSrId && !nextQueue.some((item) => item.id === currentSrId)) {
      await songRequestEngine.stop();
    }

    const updatedSrQueue: SongRequestItem[] = [];
    const manualQueue: UnifiedQueueItem[] = [];
    for (const item of nextQueue) {
      if (item.id === currentSrId) {
        continue;
      }
      const existingSr = queuedSrMap.get(item.id);
      if (existingSr) {
        updatedSrQueue.push(existingSr);
      } else {
        manualQueue.push(item);
      }
    }

    songRequestEngine.setQueue(updatedSrQueue);
    setUnifiedQueue(manualQueue);
    await StorageService.saveUnifiedQueue(manualQueue);
  };

  const handleUpdateSpotifyToken = async (token: string) => {
    const updated = { ...settings, spotifyAccessToken: token };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  // Settings Handlers & Backup Export/Import
  // Phase 2: persistensi settings yang andal (debounce, flush, status nyata)
  const SETTINGS_SAVE_DEBOUNCE_MS = 400;
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<AppSettings | null>(null);
  const pendingSaveResolversRef = useRef<Array<(success: boolean) => void>>([]);
  const settingsSaveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));

  const writeSettingsToStorage = (next: AppSettings): Promise<boolean> => {
    const write = settingsSaveChainRef.current.then(async () => {
      try {
        await StorageService.saveSettings(next);
        return true;
      } catch (error) {
        console.error('Gagal menyimpan pengaturan:', error instanceof Error ? error.message : 'unknown error');
        return false;
      }
    });
    settingsSaveChainRef.current = write.catch(() => false);
    return write;
  };

  /** Tulis segera semua perubahan settings yang masih tertunda. */
  const flushPendingSettings = (): Promise<boolean> => {
    if (settingsSaveTimerRef.current !== null) {
      clearTimeout(settingsSaveTimerRef.current);
      settingsSaveTimerRef.current = null;
    }
    const resolvers = pendingSaveResolversRef.current;
    pendingSaveResolversRef.current = [];
    const pending = pendingSettingsRef.current;
    pendingSettingsRef.current = null;

    if (!pending) {
      const inFlight = settingsSaveChainRef.current;
      resolvers.forEach((resolve) => {
        void inFlight.then(resolve);
      });
      return inFlight;
    }

    const write = writeSettingsToStorage(pending);
    resolvers.forEach((resolve) => {
      void write.then(resolve);
    });
    return write;
  };

  const handleUpdateSettings = (newSettings: AppSettings): Promise<boolean> => {
    setSettings(newSettings); // UI tetap responsif saat mengetik
    pendingSettingsRef.current = newSettings; // tulisan terakhir yang menang
    if (settingsSaveTimerRef.current !== null) clearTimeout(settingsSaveTimerRef.current);
    return new Promise<boolean>((resolve) => {
      pendingSaveResolversRef.current.push(resolve);
      settingsSaveTimerRef.current = setTimeout(() => {
        settingsSaveTimerRef.current = null;
        void flushPendingSettings();
      }, SETTINGS_SAVE_DEBOUNCE_MS);
    });
  };

  // ===================== FLOATING HUD PANEL (Phase 1) =====================
  const [isHudPanelOpen, setIsHudPanelOpen] = useState(false);
  const [companionRunning, setCompanionRunning] = useState(false);
  const isNativeAndroidPlatform = Capacitor.getPlatform() === 'android';

  // State panel HUD native. Sumber kebenaran tetap state aplikasi di bawah ini.
  const [hudPanel, setHudPanel] = useState<HudPanelId | null>(null);
  const [hudChatTab, setHudChatTab] = useState<HudChatTab>('chat');
  const [hudChatPaused, setHudChatPaused] = useState(false);
  const [hudPausedSnapshot, setHudPausedSnapshot] = useState<HudChatEntry[] | null>(null);
  const [hudEvents, setHudEvents] = useState<HudChatEntry[]>([]);
  const [hudUnread, setHudUnread] = useState(0);
  const [hudPlayingSoundId, setHudPlayingSoundId] = useState<string | null>(null);
  const [musicMuted, setMusicMuted] = useState(false);

  /**
   * Bubble native mengirim event "floatingHudClick" lewat bridge. Listener didaftarkan
   * sekali dan dilepas saat unmount agar tidak ada listener ganda.
   */
  useEffect(() => {
    let disposed = false;
    let handle: Awaited<ReturnType<typeof onFloatingHudClick>> = null;

    // Bubble adalah master toggle: buka launcher/panel, tekan lagi untuk menutup semuanya.
    // Di Android, bubble mengendalikan toolbar/panel native sepenuhnya, jadi state WebView
    // hanya dipakai sebagai fallback web.
    onFloatingHudClick(() => {
      if (disposed) return;
      if (Capacitor.getPlatform() === 'android') return;
      setIsHudPanelOpen((prev) => !prev);
    })
      .then((registered) => {
        if (disposed) {
          void registered?.remove();
          return;
        }
        handle = registered;
      })
      .catch((err) => {
        console.warn('Gagal mendaftarkan listener Floating HUD:', err);
      });

    return () => {
      disposed = true;
      void handle?.remove();
    };
  }, []);

  // Status Companion Service & Native Mode B Encoder yang sebenarnya (bukan asumsi dari UI).
  useEffect(() => {
    let cancelled = false;
    let modeBListenerHandle: { remove: () => Promise<void> } | null = null;

    const syncModeBState = () => {
      const capturedRevision = getModeBCoordinator().getRevision();
      void getModeBStreamStatus()
        .then((snapshot) => {
          if (!cancelled) {
            getModeBCoordinator().commitPromiseSnapshotIfUnchanged(capturedRevision, snapshot);
          }
        })
        .catch(() => {});
    };

    syncModeBState();
    void onModeBStreamState((snapshot) => {
      if (!cancelled) {
        getModeBCoordinator().commitNativeEvent(snapshot);
      }
    })
      .then((handle) => {
        if (!handle) return;
        if (cancelled) void handle.remove();
        else modeBListenerHandle = handle;
      })
      .catch(() => {});

    const syncNativeSessionState = () => {
      if (!isNativeAndroidPlatform) return;
      void isCompanionRunning()
        .then((res) => {
          if (cancelled) return;
          const running = !!res?.isRunning;
          setCompanionRunning(running);
          setModeASessionMode((prev) => {
            if (!running) return 'inactive';
            if (tiktokLiveConnector.isActiveSession()) return 'with_live_connector';
            return prev === 'inactive' ? 'without_live_connection' : prev;
          });
        })
        .catch(() => {});
    };

    syncNativeSessionState();

    const appStateListener = isNativeAndroidPlatform
      ? CapApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive || cancelled) return;
          syncNativeSessionState();
          syncModeBState();
          void tiktokLiveConnector.syncFromNative();
        })
      : null;

    return () => {
      cancelled = true;
      void modeBListenerHandle?.remove();
      void appStateListener?.then((handle) => handle.remove()).catch(() => {});
    };
  }, [isNativeAndroidPlatform]);

  // Panel yang diizinkan mengikuti preferensi di Settings.
  const hudPanels: HudPanelId[] = [];
  if (settings.hudPanelChat !== false) hudPanels.push('chat');
  if (settings.hudPanelSoundboard !== false) hudPanels.push('soundboard');
  if (settings.hudPanelMusic !== false) hudPanels.push('music');
  if (settings.hudPanelMixer !== false) hudPanels.push('mixer');
  // Live Control dan Settings sengaja tidak lagi menjadi ikon HUD.

  /**
   * Mixer FloatingHudPanel mengirim slider UI (0–100 untuk audio/soundboard, 0–200 untuk micGain).
   * Nilai volume audio disimpan ke settings pada skala kanonik 0.0–1.0.
   */
  const handleHudMixerChange = (key: HudMixerKey, sliderValue: number) => {
    const next: AppSettings = { ...settings };
    if (key === 'audioVolume') {
      const unit = percentToUnitVolume(sliderValue, 0.85);
      next.audioVolume = unit;
      if (!musicMuted) audioEngine.setVolume(unit);
      songRequestEngine.setVolume(Math.round(unit * 100));
    } else if (key === 'soundboardVolume') {
      const unit = percentToUnitVolume(sliderValue, 0.85);
      next.soundboardVolume = unit;
      soundboardEngine.setVolume(unit);
    } else {
      const safeGain = Number.isFinite(sliderValue) ? sliderValue : (settings.micGain ?? 100);
      next.micGain = Math.max(0, Math.min(200, Math.round(safeGain)));
    }
    void handleUpdateSettings(next);
  };

  const maybeShowNativeFloatingHud = async () => {
    if (!isNativeAndroidPlatform || settingsRef.current.hudEnabled === false) return;
    const perm = await checkOverlayPermission();
    if (!perm.granted) return;
    await showFloatingHud({
      sizeDp: settingsRef.current.hudButtonSize ?? 48,
      opacity: settingsRef.current.hudOpacity ?? 92,
      position: settingsRef.current.hudPosition === 'left' ? 'left' : 'right',
    });
  };

  // Kondisi C: Sambungkan & mulai (Mode A dengan konektor TikTok LIVE).
  const handleStartModeAWithConnection = async () => {
    const acct = tiktokAccountRef.current;
    const activeSettings = settingsRef.current;
    const targetUsername = resolveTikTokTargetUsername(activeSettings, acct);
    if (!isValidTikTokTargetUsername(targetUsername)) {
      return;
    }

    if (isNativeAndroidPlatform) {
      const res = await startCompanion();
      setCompanionRunning(!!res?.isRunning);
      if (res?.isRunning) {
        setModeASessionMode('with_live_connector');
        await maybeShowNativeFloatingHud();
      }
    } else {
      setModeASessionMode('with_live_connector');
    }

    await tiktokLiveConnector.connect({
      username: targetUsername,
      connectionMethod: acct.connectionMethod ?? activeSettings.tiktokConnectionMethod ?? 'direct',
      eulerApiKey: activeSettings.eulerStreamApiKey,
      eulerJwtKey: activeSettings.eulerStreamJwtKey,
      allowEulerFallback: acct.fallbackEnabled ?? activeSettings.tiktokEulerFallbackEnabled ?? true,
    });
  };

  // Kondisi D: Mulai tanpa koneksi (overlay/companion tetap aktif tanpa memanggil konektor/WebSocket TikTok).
  const handleStartModeAWithoutConnection = async () => {
    if (tiktokLiveConnector.isActiveSession() || tiktokLiveConnector.isConnected()) {
      await tiktokLiveConnector.disconnect();
    }

    if (isNativeAndroidPlatform) {
      const res = await startCompanion();
      setCompanionRunning(!!res?.isRunning);
      setModeASessionMode(res?.isRunning ? 'without_live_connection' : 'inactive');
      if (res?.isRunning) {
        await maybeShowNativeFloatingHud();
      }
    } else {
      setModeASessionMode('without_live_connection');
    }
  };

  const stopModeASessionVerified = async (): Promise<boolean> => {
    await tiktokLiveConnector.disconnect();
    await hideFloatingHud();
    const res = await stopCompanion();
    const stillRunning = !!res?.isRunning;
    setCompanionRunning(stillRunning);
    setModeASessionMode(stillRunning ? 'without_live_connection' : 'inactive');
    return !stillRunning && !tiktokLiveConnector.isActiveSession();
  };

  const handleStopModeASession = async () => {
    await stopModeASessionVerified();
  };

  const handleToggleCompanion = async () => {
    try {
      if (companionRunning) {
        await handleStopModeASession();
        return;
      }
      const res = await startCompanion();
      setCompanionRunning(!!res?.isRunning);
      if (res?.isRunning) {
        setModeASessionMode(
          tiktokLiveConnector.isActiveSession() ? 'with_live_connector' : 'without_live_connection'
        );
      } else if (res?.message) {
        console.warn(res.message);
      }
    } catch (err) {
      console.warn('Gagal mengubah status Companion Service:', err);
    }
  };

  // Pastikan tulisan tertunda tidak hilang saat app di-background atau ditutup.
  useEffect(() => {
    const flushPending = () => {
      if (settingsSaveTimerRef.current !== null) {
        clearTimeout(settingsSaveTimerRef.current);
        settingsSaveTimerRef.current = null;
      }
      const pending = pendingSettingsRef.current;
      pendingSettingsRef.current = null;
      if (pending) void writeSettingsToStorage(pending);
      void flushStudioPersistence();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    window.addEventListener('beforeunload', flushPending);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPending);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExportData = async () => {
    await flushStudioPersistence();
    const jsonString = await StorageService.exportAllData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syntxrr_stream_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (json: string): Promise<boolean> => {
    // Selesaikan tulisan tertunda agar tidak menimpa hasil pemulihan.
    await flushPendingSettings();
    await flushStudioPersistence();
    const success = await StorageService.importData(json);
    if (success) {
      const [reloadedSettings, reloadedPresets, reloadedActivePresetId, reloadedElements, reloadedIntegrations] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getPresets(),
        StorageService.getActivePresetId(),
        StorageService.getStudioElements(),
        StorageService.getIntegrations(),
      ]);
      setSettings(reloadedSettings);
      setPresets(reloadedPresets);
      setActivePresetId(reloadedActivePresetId);
      setStudioElements(reloadedElements);
      setIntegrations(reloadedIntegrations);
    }
    return success;
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan seluruh pengaturan ke default?')) {
      // Selesaikan tulisan tertunda agar data lama tidak dibangkitkan setelah reset.
      await flushPendingSettings();
      await flushStudioPersistence();
      soundboardItems.forEach((item) => {
        soundboardEngine.removeCustomFile(item.id);
        if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      });
      previousSoundboardUrls.current.clear();
      await tiktokLiveConnector.disconnect();
      await StorageService.resetToDefaults();
      setSettings(DEFAULT_SETTINGS);
      setTiktokAccount(DEFAULT_TIKTOK_ACCOUNT_STATE);
      setModeASessionMode('inactive');
      setPresets(DEFAULT_PRESETS);
      setActivePresetId(DEFAULT_PRESETS[0].id);
      setStudioElements(DEFAULT_STUDIO_ELEMENTS);
      setSoundboardItems(DEFAULT_SOUNDBOARD);
      setMarketplaceItems(DEFAULT_MARKETPLACE_ITEMS);
      setIntegrations(DEFAULT_INTEGRATIONS);
      setTTSConfig(DEFAULT_TTS_CONFIG);
      setUnifiedQueue([]);
      setLocalTracksMeta([]);
    }
  };

  const handleSimulateEventFromDeck = (type: string, detail: string, amount?: number) => {
    const timestamp = Date.now();
    const id = `deck_evt_${timestamp}`;
    const eventType = type || 'gift';
    streamEventBus.emit({
      id,
      type: eventType as any,
      username: 'Viewer_Deck',
      detail: detail || '',
      amount,
      timestamp,
      isSimulation: true,
    });
    if (ttsConfig.enabled) {
      ttsService.prime();
      ttsService.speakEvent(eventType, 'Viewer_Deck', detail);
    }
  };

  const handlePlaySoundFromDeck = (soundId: string) => {
    if (soundId.includes('horn')) soundboardEngine.playSynthesizedSFX('horn');
    else if (soundId.includes('cheer')) soundboardEngine.playSynthesizedSFX('cheer');
    else if (soundId.includes('tada')) soundboardEngine.playSynthesizedSFX('tada');
    else if (soundId.includes('bell')) soundboardEngine.playSynthesizedSFX('bell');
    else soundboardEngine.playSynthesizedSFX('level_up');
  };

  // ===================== FLOATING HUD — NATIVE MODEL SYNC =====================
  // Overlay native hanya menggambar. Semua nilai berasal dari state aplikasi di atas,
  // sehingga HUD dan aplikasi utama memakai satu sumber kebenaran.
  const hudSoundTimerRef = useRef<number | null>(null);
  const hudLastModelRef = useRef('');
  const hudPausedRef = useRef(false);
  const hudEventsRef = useRef<HudChatEntry[]>([]);
  // Dinaikkan saat native meminta resync agar model panel dikirim ulang setelah app kembali foreground.
  const [hudResyncNonce, setHudResyncNonce] = useState(0);

  const musicVolumeUnit = normalizeUnitVolume(settings.audioVolume, 0.85);
  const soundboardVolumeUnit = normalizeUnitVolume(settings.soundboardVolume, 0.85);
  const ttsVolumeUnit = normalizeUnitVolume(ttsConfig.volume, 0.9);

  /** Tap sound di HUD: memakai engine Soundboard yang sama, satu suara pada satu waktu. */
  const handleHudPlaySound = (soundId: string) => {
    const item = soundboardItems.find((sound) => sound.id === soundId);
    if (!item) return;

    void dispatchSoundboard(item, soundboardItems, soundboardVolumeUnit).then((result) => {
      if (result.status !== 'played') return;

      setHudPlayingSoundId(item.id);
      if (hudSoundTimerRef.current !== null) window.clearTimeout(hudSoundTimerRef.current);
      const durationMs = Math.max(600, Math.min(15, Number(item.durationSec) || 3) * 1000);
      hudSoundTimerRef.current = window.setTimeout(() => {
        hudSoundTimerRef.current = null;
        setHudPlayingSoundId(null);
      }, durationMs);
    });
  };

  const handleHudToggleMusicMute = () => {
    setMusicMuted((prev) => {
      const next = !prev;
      audioEngine.setVolume(next ? 0 : musicVolumeUnit);
      songRequestEngine.setMuted(next);
      return next;
    });
  };

  const handleHudMusicVolume = (percent: number) => {
    const unit = percentToUnitVolume(percent, 0.85);
    if (!musicMuted) audioEngine.setVolume(unit);
    songRequestEngine.setVolume(Math.round(unit * 100));
    void handleUpdateSettings({ ...settings, audioVolume: unit });
  };

  const handleHudSoundboardVolume = (percent: number) => {
    const unit = percentToUnitVolume(percent, 0.85);
    soundboardEngine.setVolume(unit);
    void handleUpdateSettings({ ...settings, soundboardVolume: unit });
  };

  const handleHudTtsVolume = (percent: number) => {
    const unit = percentToUnitVolume(percent, 0.9);
    void handleUpdateTTSConfig({ ...ttsConfig, volume: unit });
  };

  const hudCommandHandlersRef = useRef({
    playSound: handleHudPlaySound,
    toggleMusic: handleTogglePlayMusic,
    nextTrack: handleNextTrack,
    toggleMute: handleHudToggleMusicMute,
    musicVolume: handleHudMusicVolume,
    soundboardVolume: handleHudSoundboardVolume,
    ttsVolume: handleHudTtsVolume,
  });

  useEffect(() => {
    hudCommandHandlersRef.current = {
      playSound: handleHudPlaySound,
      toggleMusic: handleTogglePlayMusic,
      nextTrack: handleNextTrack,
      toggleMute: handleHudToggleMusicMute,
      musicVolume: handleHudMusicVolume,
      soundboardVolume: handleHudSoundboardVolume,
      ttsVolume: handleHudTtsVolume,
    };
  });

  useEffect(() => {
    hudPausedRef.current = hudChatPaused;
  }, [hudChatPaused]);

  useEffect(() => {
    hudEventsRef.current = hudEvents;
  }, [hudEvents]);

  // Pemantauan level mikrofon dan mute/unmute Audio Mixer dijalankan langsung oleh NativeMicMonitor di Android.

  // Event native: panel yang dibuka/ditutup + perintah dari panel.
  useEffect(() => {
    if (!isNativeAndroidPlatform) return;

    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    void onHudPanelChanged((payload) => {
      if (disposed) return;
      const panel = (payload?.panel ?? null) as HudPanelId | null;
      setHudPanel(panel);
      if (panel === 'chat') setHudUnread(0);
    }).then((handle) => {
      if (!handle) return;
      if (disposed) void handle.remove();
      else handles.push(handle);
    });

    void onHudCommand((payload) => {
      if (disposed || !payload) return;

      const { action, id, value } = payload;
      const handlers = hudCommandHandlersRef.current;

      switch (action) {
        case 'chat.tab':
          if (id) setHudChatTab(id as HudChatTab);
          setHudUnread(0);
          return;
        case 'chat.pause':
          setHudPausedSnapshot(hudEventsRef.current);
          setHudChatPaused(true);
          return;
        case 'chat.latest':
          setHudChatPaused(false);
          setHudPausedSnapshot(null);
          setHudUnread(0);
          return;
        case 'soundboard.play':
          if (id) handlers.playSound(id);
          return;
        case 'soundboard.volume':
          handlers.soundboardVolume(Number(value) || 0);
          return;
        case 'tts.volume':
          handlers.ttsVolume(Number(value) || 0);
          return;
        case 'music.toggle':
          handlers.toggleMusic();
          return;
        case 'music.next':
          // Next hanya dari streamer (HUD/aplikasi), tidak pernah dari chat viewer.
          void handlers.nextTrack();
          return;
        case 'music.mute':
          handlers.toggleMute();
          return;
        case 'music.volume':
          handlers.musicVolume(Number(value) || 0);
          return;
        case 'mic.mute':
          // Dieksekusi langsung oleh FloatingCompanionPlugin + NativeMicMonitor di sisi native.
          return;
        default:
          return;
      }
    }).then((handle) => {
      if (!handle) return;
      if (disposed) void handle.remove();
      else handles.push(handle);
    });

    // Setelah proses dibekukan sistem (HUD dipakai di atas aplikasi lain), model panel bisa
    // tertinggal. Native mengirim hudResync saat app kembali foreground; paksa kirim ulang
    // agar status musik, mic, dan event sesuai kondisi sebenarnya.
    void onHudResync(() => {
      if (disposed) return;
      hudLastModelRef.current = '';
      void tiktokLiveConnector.syncFromNative();
      setHudResyncNonce((value) => value + 1);
    }).then((handle) => {
      if (!handle) return;
      if (disposed) void handle.remove();
      else handles.push(handle);
    });

    return () => {
      disposed = true;
      handles.forEach((handle) => {
        void handle.remove();
      });
    };
  }, [isNativeAndroidPlatform]);

  // Bangun model untuk panel mana pun dari state aplikasi yang sama (single source of truth).
  const buildHudModelFor = useCallback(
    (panel: HudPanelId): HudStateModel => {
      const chatEvents = hudChatPaused ? hudPausedSnapshot ?? hudEvents : hudEvents;
      if (panel === 'chat') {
        return buildChatModel(
          chatEvents,
          hudChatTab,
          hudChatPaused,
          hudUnread,
          tiktokStatus.state,
          modeASessionMode
        );
      }
      if (panel === 'soundboard') {
        return buildSoundboardModel(
          soundboardItems.map((sound) => ({
            id: sound.id,
            name: sound.name,
            icon: sound.icon,
            isFavorite: sound.isFavorite,
            isQuickSlot: sound.isQuickSlot,
          })),
          hudPlayingSoundId,
          soundboardVolumeUnit,
          ttsVolumeUnit
        );
      }
      if (panel === 'music') {
        const isLiveTransportConnected =
          tiktokStatus.state === 'connected_direct' || tiktokStatus.state === 'connected_euler';
        return buildMusicModel({
          nowPlaying: effectiveNowPlayingSong
            ? { title: effectiveNowPlayingSong.title, artist: effectiveNowPlayingSong.artist }
            : null,
          isPlaying: effectiveIsPlayingMusic,
          muted: musicMuted,
          volume: Math.round(musicVolumeUnit * 100),
          queue: combinedUnifiedQueue
            .filter(
              (item) =>
                item.status === 'approved' || item.status === 'pending' || item.status === 'playing'
            )
            .filter((item) => item.id !== effectiveNowPlayingSong?.id)
            .slice(0, 6)
            .map((item) => ({ id: item.id, title: item.title, artist: item.artist })),
          requestSourceConnected:
            isLiveTransportConnected ||
            hudEventSourceStatus(hudEvents, tiktokStatus.state, modeASessionMode).tone === 'ok',
          playbackStatus: srState.currentTrack ? srState.playbackStatus : undefined,
          errorMessage: srState.lastError,
        });
      }
      return buildMixerModel({
        available: false,
        metering: false,
        muted: false,
        level: 0,
      });
    },
    [
      hudChatPaused,
      hudPausedSnapshot,
      hudEvents,
      hudChatTab,
      hudUnread,
      tiktokStatus.state,
      modeASessionMode,
      soundboardItems,
      hudPlayingSoundId,
      soundboardVolumeUnit,
      ttsVolumeUnit,
      effectiveNowPlayingSong,
      effectiveIsPlayingMusic,
      musicMuted,
      musicVolumeUnit,
      combinedUnifiedQueue,
      srState.playbackStatus,
      srState.lastError,
      srState.currentTrack,
    ]
  );

  // Kirim snapshot SEMUA panel, bukan hanya panel aktif. Native menyimpan tiap panel sehingga
  // panel mana pun tetap dapat digambar ketika WebView ditangguhkan Android di background.
  const sendHudSnapshot = useCallback(() => {
    if (!isNativeAndroidPlatform) return;
    const panels = {
      chat: buildHudModelFor('chat'),
      soundboard: buildHudModelFor('soundboard'),
      music: buildHudModelFor('music'),
      mixer: buildHudModelFor('mixer'),
    };
    const serializedPanels = JSON.stringify(panels);
    if (serializedPanels === hudLastModelRef.current) return;
    hudLastModelRef.current = serializedPanels;
    const snapshot = buildHudSnapshot(panels);
    void pushHudState(snapshot);
  }, [buildHudModelFor, isNativeAndroidPlatform]);

  useEffect(() => {
    if (!isNativeAndroidPlatform) return;
    const timer = window.setTimeout(sendHudSnapshot, 180);
    return () => window.clearTimeout(timer);
  }, [sendHudSnapshot, hudResyncNonce, isNativeAndroidPlatform]);

  // Kirim snapshot tepat sebelum WebView dijeda agar cache native lengkap saat background.
  useEffect(() => {
    if (!isNativeAndroidPlatform) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') sendHudSnapshot();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [sendHudSnapshot, isNativeAndroidPlatform]);

  useEffect(() => {
    return () => {
      if (hudSoundTimerRef.current !== null) window.clearTimeout(hudSoundTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c16] flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center animate-pulse">
            <Radio className="w-6 h-6 text-blue-400" />
          </div>
          <div className="absolute -inset-1 rounded-xl bg-blue-500/20 blur-md -z-10 animate-ping" />
        </div>
        <div className="text-center space-y-1">
          <div className="text-sm font-extrabold text-white tracking-wider">
            SYNTXRR STREAM
          </div>
          <div className="text-xs text-slate-400">
            Memuat lingkungan Mobile Streaming Studio...
          </div>
        </div>
      </div>
    );
  }

  const pendingRequestsCount = combinedUnifiedQueue.filter((s) => s.status === 'pending' || s.status === 'approved').length;
  const modeAHonestStatus = buildModeAHonestStatus({
    account: tiktokAccount,
    connector: tiktokStatus,
    companionRunning,
    sessionMode: modeASessionMode,
  });

  const modeBHeaderLabel = (() => {
    switch (modeBStatus.status) {
      case 'live':
        return `Mode B LIVE${modeBStatus.bitrateKbps > 0 ? ` • ${modeBStatus.bitrateKbps} kbps` : ''}`;
      case 'host_wait':
        return 'Mode B LIVE • Layar Tunggu';
      case 'starting':
      case 'connecting':
        return 'Mode B Menyambungkan…';
      case 'reshare_waiting':
        return 'Mode B LIVE • Menunggu Layar';
      case 'resharing':
        return 'Mode B Menyambungkan Layar…';
      case 'stopping':
        return 'Mode B Menghentikan…';
      case 'capture_lost':
        return 'Mode B Capture Terputus';
      case 'error':
        return 'Mode B Error';
      case 'disconnected':
        return 'Mode B Terputus';
      case 'stopped':
      case 'idle':
      default:
        return 'Mode B Standby';
    }
  })();

  const modeBHeaderTone: 'ok' | 'warn' | 'error' | 'off' =
    modeBStatus.status === 'live' && modeBStatus.isStreaming
      ? 'ok'
      : modeBStatus.status === 'host_wait' ||
          modeBStatus.status === 'reshare_waiting' ||
          modeBStatus.status === 'starting' ||
          modeBStatus.status === 'connecting' ||
          modeBStatus.status === 'resharing' ||
          modeBStatus.status === 'stopping'
        ? 'warn'
        : modeBStatus.status === 'error' || modeBStatus.status === 'capture_lost'
          ? 'error'
          : 'off';

  const headerStatusLabel = isModeAOperatingMode(settings.operatingMode)
    ? companionRunning || modeASessionMode !== 'inactive'
      ? `${modeAHonestStatus.modeASession.label} • ${modeAHonestStatus.eventTransport.label}`
      : modeAHonestStatus.accountLinked.tone === 'ok'
      ? `Akun: ${modeAHonestStatus.accountLinked.label} • Sesi Nonaktif`
      : 'Sesi Mode A Nonaktif'
    : modeBHeaderLabel;

  const headerStatusTone: 'ok' | 'warn' | 'error' | 'off' = isModeAOperatingMode(
    settings.operatingMode
  )
    ? modeAHonestStatus.eventTransport.tone === 'ok'
      ? 'ok'
      : modeAHonestStatus.eventTransport.tone === 'error'
      ? 'error'
      : companionRunning || modeASessionMode !== 'inactive'
      ? 'warn'
      : 'off'
    : modeBHeaderTone;

  return (
    <I18nProvider language={settings.language || 'id-ID'}>
      <div className="min-h-screen bg-[#080c16] text-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <Header
        activeNav={activeNav}
        operatingMode={settings.operatingMode}
        activePreset={activePreset}
        honestStatusLabel={headerStatusLabel}
        honestStatusTone={headerStatusTone}
        onNavigate={handleNavigate}
        onOpenModeModal={() => setIsModeModalOpen(true)}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      {/* In-app Confirmation Modal (Mode Switch & Confirm End Live) */}
      {pendingConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0e172a] border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">{pendingConfirmModal.title}</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {pendingConfirmModal.message}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPendingConfirmModal(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = pendingConfirmModal.onConfirm;
                  setPendingConfirmModal(null);
                  void action();
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-white text-xs font-bold ${
                  pendingConfirmModal.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {pendingConfirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Alert Banner Overlay */}
      <AlertBannerOverlay
        currentAlert={activeFloatingAlert}
        onDismiss={handleDismissAlert}
      />

      {/* Mode A / Mode B Launcher Preview Modal */}
      <ModeLauncherModal
        isOpen={isModeModalOpen}
        onClose={() => setIsModeModalOpen(false)}
        currentMode={settings.operatingMode}
        settings={settings}
        onSelectMode={handleSelectMode}
      />

      {/* Mobile Drawer Navigation Modal for All 9 Modules */}
      <NavigationDrawerModal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeNav={activeNav}
        onNavigate={handleNavigate}
        pendingMusicCount={pendingRequestsCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {modeBNoticeBanner && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/50 border border-amber-600/60 text-xs text-amber-200 flex items-center justify-between gap-3">
            <span>{modeBNoticeBanner}</span>
            <button
              type="button"
              onClick={() => setModeBNoticeBanner(null)}
              className="px-2 py-0.5 rounded bg-amber-900/60 text-[11px] text-amber-100 hover:bg-amber-800"
            >
              Tutup
            </button>
          </div>
        )}

        {activeNav === 'dashboard' && (
          <DashboardView
            settings={settings}
            activePreset={activePreset}
            integrations={integrations}
            tiktokAccount={tiktokAccount}
            tiktokStatus={tiktokStatus}
            companionRunning={companionRunning}
            modeASessionMode={modeASessionMode}
            modeBStatus={modeBStatus}
            isModeBActionPending={isModeBActionPending}
            modeBNotificationWarning={modeBNotificationWarning}
            onStartModeBStream={handleStartModeBStream}
            onStopModeBStream={handleStopModeBStream}
            onRequestModeBReshare={handleRequestModeBReshare}
            onToggleModeBHostWait={handleToggleModeBHostWait}
            onUpdateSettings={handleUpdateSettings}
            onStartModeAWithConnection={handleStartModeAWithConnection}
            onStartModeAWithoutConnection={handleStartModeAWithoutConnection}
            onStopModeASession={handleStopModeASession}
            onOpenTikTokConnection={handleOpenTikTokConnection}
            onSelectMode={handleSelectMode}
            onNavigate={handleNavigate}
            onOpenModeModal={() => setIsModeModalOpen(true)}
          />
        )}

        {(activeNav === 'studio' || (activeNav as string) === 'overlay') && (
          <StudioView
            elements={studioElements}
            canvasOrientation={settings.canvasOrientation}
            onChangeOrientation={handleOrientationChange}
            onUpdateElements={handleUpdateStudioElements}
            onSaveAsPreset={handleSaveCanvasAsPreset}
            presets={presets}
            activePresetId={activePresetId}
            activePreset={activePreset}
            onUpdateActivePreset={handleUpdateActivePresetMetadata}
            onSelectPreset={handleSelectPreset}
            onCreatePreset={handleCreatePreset}
            onDuplicatePreset={handleDuplicatePreset}
            onDeletePreset={handleDeletePreset}
            onToggleFavoritePreset={handleToggleFavoritePreset}
            onRenamePreset={handleRenamePreset}
            marketplaceItems={marketplaceItems}
            onInstallMarketplaceElements={handleInstallMarketplaceElements}
            isModeBSelected={isModeBSelected}
            modeBStatus={modeBStatus}
            isModeBMutationLocked={isModeBMutationLocked}
            isModeBActionPending={isModeBActionPending}
            onApplyLiveSceneToModeB={handleApplyLiveSceneToModeB}
            onUpdatePresetModeBSettings={handleUpdatePresetModeBSettings}
          />
        )}

        {activeNav === 'sources' && (
          <SourcesLibraryView
            onAddElementToStudio={handleAddSingleElementToStudio}
            onNavigateToStudio={() => setActiveNav('studio')}
          />
        )}

        {(activeNav === 'presets' || (activeNav as string) === 'scenes') && (
          <PresetManagerView
            presets={presets}
            activePresetId={activePresetId}
            onSelectPreset={handleSelectPreset}
            onCreatePreset={handleCreatePreset}
            onCanImportPreset={guardModeBStructuralPresetAction}
            onDuplicatePreset={handleDuplicatePreset}
            onDeletePreset={handleDeletePreset}
            onRenamePreset={handleRenamePreset}
            onToggleFavorite={handleToggleFavoritePreset}
            onNavigateToStudio={() => setActiveNav('studio')}
          />
        )}

        {(activeNav === 'live_center' || (activeNav as string) === 'alerts') && (
        <LiveCenterView
          ttsConfig={ttsConfig}
          onUpdateTTSConfig={handleUpdateTTSConfig}
          soundboardItems={soundboardItems}
          onSoundboardItemsChange={async (items) => {
            setSoundboardItems(items);
            await StorageService.saveSoundboard(items);
          }}
        />
        )}

        {activeNav === 'music' && (
          <MusicCenterView
            // Stage 1 Backwards Compatible Props
            songRequests={songRequests}
            nowPlayingSong={effectiveNowPlayingSong}
            isPlaying={effectiveIsPlayingMusic}
            onTogglePlay={handleTogglePlayMusic}
            onNextTrack={handleNextTrack}
            onPrevTrack={handlePrevTrack}
            onAddSongRequest={handleAddSongRequest}
            onDeleteRequest={handleDeleteSongRequest}
            onLoadPresetPack={handleLoadPresetPack}
            onSetNowPlaying={handleSetNowPlaying}
            // Stage 2 Upgraded Props
            unifiedQueue={combinedUnifiedQueue}
            onUpdateUnifiedQueue={handleUpdateUnifiedQueue}
            localTracksMeta={localTracksMeta}
            localFilesMap={localFilesMap}
            onAddLocalFiles={handleAddLocalFiles}
            onRemoveLocalTrack={handleRemoveLocalTrack}
            settings={settings}
            onNavigateToSettings={() => setActiveNav('settings')}
            onUpdateSpotifyToken={handleUpdateSpotifyToken}
            songRequestState={srState}
          />
        )}

        {activeNav === 'marketplace' && (
          <MarketplaceView
            items={marketplaceItems}
            onInstallElements={handleInstallMarketplaceElements}
            onNavigateToStudio={() => setActiveNav('studio')}
          />
        )}

        {activeNav === 'integrations' && (
          <IntegrationsView
            integrations={integrations}
            onUpdateIntegrations={handleUpdateIntegrations}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            tiktokStatus={tiktokStatus}
            tiktokAccount={tiktokAccount}
            companionRunning={companionRunning}
            modeASessionMode={modeASessionMode}
            openTikTokSettingsNonce={openTikTokSettingsNonce}
            onSaveTikTokTargetUsername={handleSaveTikTokTargetUsername}
            onLoginTikTok={handleLoginTikTok}
            onUnlinkTikTok={handleUnlinkTikTok}
            onUpdateTikTokConnectionPrefs={handleUpdateTikTokConnectionPrefs}
            onConnectTikTok={handleConnectTikTok}
            onDisconnectTikTok={handleDisconnectTikTok}
          />
        )}

        {activeNav === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onResetDefaults={handleResetDefaults}
          />
        )}

        {activeNav === 'remote_deck' && (
          <StreamDeckView
            settings={settings}
            activePreset={activePreset}
            presets={presets}
            operatingMode={settings.operatingMode}
            onSelectPreset={handleSelectPreset}
            onSelectMode={handleSelectMode}
            onTriggerEvent={handleSimulateEventFromDeck}
            onPlaySound={handlePlaySoundFromDeck}
            onToggleMusic={handleTogglePlayMusic}
            onSkipMusic={handleNextTrack}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        activeNav={activeNav}
        onNavigate={handleNavigate}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        pendingRequestsCount={pendingRequestsCount}
      />

      {/* Fallback web: overlay native hanya ada di Android. Di Android toolbar/panel
          digambar langsung oleh FloatingHudManager di atas aplikasi lain. */}
      {!isNativeAndroidPlatform && (
      <FloatingHudPanel
        open={isHudPanelOpen}
        onClose={() => setIsHudPanelOpen(false)}
        bubbleSide={(settings.hudPosition ?? 'right') as 'left' | 'right'}
        enabledPanels={hudPanels}
        alerts={alertHistory}
        sounds={soundboardItems}
        onPlaySound={handlePlaySoundFromDeck}
        nowPlaying={effectiveNowPlayingSong}
        isPlayingMusic={effectiveIsPlayingMusic}
        onTogglePlayMusic={handleTogglePlayMusic}
        queueCount={combinedUnifiedQueue.filter((s) => s.status === 'approved' || s.status === 'pending').length}
        masterVolume={unitVolumeToPercent(settings.audioVolume, 0.85)}
        soundboardVolume={unitVolumeToPercent(settings.soundboardVolume, 0.85)}
        micGain={Math.max(0, Math.min(200, Math.round(settings.micGain ?? 100)))}
        onMixerChange={handleHudMixerChange}
        operatingMode={settings.operatingMode}
        isNativeAndroid={isNativeAndroidPlatform}
        companionRunning={companionRunning}
        onToggleCompanion={() => {
          void handleToggleCompanion();
        }}
        onOpenSettingsPage={() => {
          setIsHudPanelOpen(false);
          handleNavigate('settings');
        }}
      />
      )}
      </div>
    </I18nProvider>
  );
}
