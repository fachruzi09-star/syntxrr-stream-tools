import { useState, useEffect, useRef } from 'react';
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
  CanvasOrientation,
  UnifiedQueueItem,
  LocalAudioTrackMeta,
  StudioPreset,
  StudioElement,
  SoundboardItem,
  MarketplaceItem,
  IntegrationProvider,
  TTSConfig,
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
} from './services/storage';
import { audioEngine } from './services/localAudioEngine';
import { soundboardEngine } from './services/soundboardEngine';
import { dispatchSoundboard } from './services/soundboardDispatcher';
import { ttsService, DEFAULT_TTS_CONFIG } from './services/ttsService';
import { streamEventBus } from './services/eventBus';
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
import { hideFloatingHud } from './services/nativeCompanionBridge';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<NavigationTab>('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);

  // App Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Studio & Presets State
  const [presets, setPresets] = useState<StudioPreset[]>(DEFAULT_PRESETS);
  const [activePresetId, setActivePresetId] = useState<string>(DEFAULT_PRESETS[0].id);
  const [studioElements, setStudioElements] = useState<StudioElement[]>(DEFAULT_STUDIO_ELEMENTS);

  // Soundboard & TTS State
  const [soundboardItems, setSoundboardItems] = useState<SoundboardItem[]>(DEFAULT_SOUNDBOARD);
  const previousSoundboardUrls = useRef<Map<string, string>>(new Map());
  const [ttsConfig, setTTSConfig] = useState<TTSConfig>(DEFAULT_TTS_CONFIG);

  // Marketplace & Integrations State
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>(DEFAULT_MARKETPLACE_ITEMS);
  const [integrations, setIntegrations] = useState<IntegrationProvider[]>(DEFAULT_INTEGRATIONS);

  // Music Center State (HTML5 local audio + Queue + Song Requests)
  const [songRequests, setSongRequests] = useState<SongRequest[]>(DEFAULT_SONG_REQUESTS);
  const [nowPlayingSong, setNowPlayingSong] = useState<SongRequest | null>(DEFAULT_SONG_REQUESTS[0]);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
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
        ]);

        setSettings(savedSettings);
        setPresets(savedPresets);
        setActivePresetId(savedActivePresetId);
        const sanitizedElements = ensureUniqueElementIds(savedStudioElements);
        setStudioElements(sanitizedElements);
        const hydratedSoundboard = await Promise.all(
          savedSoundboard.map(async (item) => {
            const audioBlob = await StorageService.getSoundboardAudio(item.id);
            return audioBlob ? { ...item, audioUrl: URL.createObjectURL(audioBlob) } : item;
          }),
        );
        setSoundboardItems(hydratedSoundboard);
        setMarketplaceItems(savedMarketplace);
        setIntegrations(savedIntegrations);
        setTTSConfig(savedTTSConfig);
        ttsService.updateConfig(savedTTSConfig);
        setUnifiedQueue(savedQueue);
        setLocalTracksMeta(savedLocalMeta);
        setSongRequests(savedRequests);
        const currentPlaying = savedRequests.find((r) => r.status === 'playing') || savedRequests[0] || null;
        setNowPlayingSong(currentPlaying);
        setScenes(savedScenes);
        setActiveSceneId(savedActiveSceneId);
        setAlertSettings(savedAlertSettings);
        setAlertHistory(savedAlertHistory);

        // Apply audio volume
        if (savedSettings.audioVolume !== undefined) {
          audioEngine.setVolume(savedSettings.audioVolume);
        }
      } catch (err) {
        console.error('Error loading data from IndexedDB:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

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

  // Subscribe to Stream Event Bus to display floating overlay alerts
  useEffect(() => {
    const unsubscribe = streamEventBus.subscribe((streamEvent) => {
      // Map stream event to floating alert banner
      const alert: AlertEvent = {
        id: streamEvent.id,
        type: streamEvent.type === 'gift' ? 'gift' : streamEvent.type === 'donation' ? 'donation' : 'follow',
        username: streamEvent.username,
        message: streamEvent.detail,
        amount: streamEvent.amount,
        currency: streamEvent.currency,
        timestamp: streamEvent.timestamp,
        formattedTime: new Date(streamEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setActiveFloatingAlert(alert);
      setTimeout(() => setActiveFloatingAlert(null), 5000);
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

      void dispatchSoundboard(slot, soundboardItems, settings.soundboardVolume ?? 0.85).then((result) => {
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

  // Android Native Hardware Back Button & Status Bar Handling (Capacitor)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#080C16' }).catch(() => {});
    }

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

  // Mode Selection
  const handleSelectMode = async (mode: OperatingMode) => {
    const isCurrentModeA =
      settings.operatingMode === 'MODE_A_TIKTOK_COMPANION' ||
      settings.operatingMode === 'MODE_A_OVERLAY';
    const isTargetModeB =
      mode === 'MODE_B_STREAMING_ENCODER' ||
      mode === 'MODE_B_ENCODER';

    if (isCurrentModeA && isTargetModeB) {
      try {
        await hideFloatingHud();
      } catch (err) {
        console.warn('Gagal menyembunyikan Floating HUD saat berpindah ke Mode B:', err);
      }
    }

    const updated = { ...settings, operatingMode: mode };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  // Canvas Orientation
  const handleOrientationChange = async (orientation: CanvasOrientation) => {
    const updated = { ...settings, canvasOrientation: orientation };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  // Studio Elements Handlers
  const handleUpdateStudioElements = async (newElements: StudioElement[]) => {
    const sanitized = ensureUniqueElementIds(newElements);
    setStudioElements(sanitized);
    await StorageService.saveStudioElements(sanitized);

    // Also sync elements to active preset
    const updatedPresets = presets.map((p) => {
      if (p.id === activePresetId) {
        return { ...p, elements: sanitized };
      }
      return p;
    });
    setPresets(updatedPresets);
    await StorageService.savePresets(updatedPresets);
  };

  const handleAddSingleElementToStudio = async (newElement: StudioElement) => {
    const uniqueId =
      newElement.id && !studioElements.some((e) => e.id === newElement.id)
        ? newElement.id
        : `elem_${newElement.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const updated = [...studioElements, { ...newElement, id: uniqueId }];
    await handleUpdateStudioElements(updated);
  };

  const handleInstallMarketplaceElements = async (elementsPayload: StudioElement[]) => {
    // Generate fresh unique IDs for installed elements so they never collide with existing elements
    const freshElements = elementsPayload.map((elem) => ({
      ...elem,
      id: `elem_${elem.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    }));
    const updated = [...studioElements, ...freshElements];
    await handleUpdateStudioElements(updated);
  };

  const handleSaveCanvasAsPreset = async () => {
    const newPreset: StudioPreset = {
      id: `preset_${Date.now()}`,
      name: `Preset Baru ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      category: settings.canvasOrientation === '9:16' ? 'hp_screen' : settings.canvasOrientation === '16:9' ? 'landscape' : 'portrait',
      canvasOrientation: settings.canvasOrientation,
      elements: ensureUniqueElementIds([...studioElements]),
      createdAt: Date.now(),
      isFavorite: false,
      description: 'Preset tersimpan dari Studio Canvas',
      thumbnailColor: '#2563EB',
    };
    const updated = [newPreset, ...presets];
    setPresets(updated);
    setActivePresetId(newPreset.id);
    await StorageService.savePresets(updated);
    await StorageService.saveActivePresetId(newPreset.id);
  };

  // Preset Handlers
  const handleSelectPreset = async (presetId: string) => {
    const target = presets.find((p) => p.id === presetId);
    if (target) {
      setActivePresetId(presetId);
      const sanitizedElements = ensureUniqueElementIds(target.elements);
      setStudioElements(sanitizedElements);
      const updatedSettings = { ...settings, canvasOrientation: target.canvasOrientation };
      setSettings(updatedSettings);
      await StorageService.saveActivePresetId(presetId);
      await StorageService.saveStudioElements(sanitizedElements);
      await StorageService.saveSettings(updatedSettings);
    }
  };

  const handleCreatePreset = async (presetData: Omit<StudioPreset, 'id' | 'createdAt'>) => {
    const newPreset: StudioPreset = {
      ...presetData,
      id: `preset_${Date.now()}`,
      elements: ensureUniqueElementIds(presetData.elements),
      createdAt: Date.now(),
    };
    const updated = [newPreset, ...presets];
    setPresets(updated);
    setActivePresetId(newPreset.id);
    setStudioElements(newPreset.elements);
    await StorageService.savePresets(updated);
    await StorageService.saveActivePresetId(newPreset.id);
  };

  const handleDuplicatePreset = async (presetId: string) => {
    const source = presets.find((p) => p.id === presetId);
    if (!source) return;
    const duplicated: StudioPreset = {
      ...source,
      id: `preset_${Date.now()}`,
      name: `${source.name} (Salinan)`,
      elements: source.elements.map((el) => ({
        ...el,
        id: `elem_${el.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      })),
      createdAt: Date.now(),
      isFavorite: false,
    };
    const updated = [...presets, duplicated];
    setPresets(updated);
    await StorageService.savePresets(updated);
  };

  const handleDeletePreset = async (presetId: string) => {
    if (presets.length <= 1) return;
    const updated = presets.filter((p) => p.id !== presetId);
    setPresets(updated);
    await StorageService.savePresets(updated);
    if (activePresetId === presetId) {
      const nextPreset = updated[0];
      setActivePresetId(nextPreset.id);
      setStudioElements(nextPreset.elements);
      await StorageService.saveActivePresetId(nextPreset.id);
      await StorageService.saveStudioElements(nextPreset.elements);
    }
  };

  const handleRenamePreset = async (presetId: string, newName: string) => {
    const updated = presets.map((p) => (p.id === presetId ? { ...p, name: newName } : p));
    setPresets(updated);
    await StorageService.savePresets(updated);
  };

  const handleToggleFavoritePreset = async (presetId: string) => {
    const updated = presets.map((p) => (p.id === presetId ? { ...p, isFavorite: !p.isFavorite } : p));
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

  // Music Player Controls (HTML5 Audio & Hybrid Queue)
  const handleTogglePlayMusic = () => {
    setIsPlayingMusic((prev) => !prev);
  };

  const handleNextTrack = async () => {
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
      setIsPlayingMusic(true);
    } else {
      setIsPlayingMusic(false);
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
      setIsPlayingMusic(true);
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

  const handleDeleteSongRequest = async (id: string) => {
    const updated = songRequests.filter((s) => s.id !== id);
    setSongRequests(updated);
    if (nowPlayingSong?.id === id) {
      const nextSong = updated[0] || null;
      setNowPlayingSong(nextSong);
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
    setIsPlayingMusic(true);
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

  const handleUpdateUnifiedQueue = async (queue: UnifiedQueueItem[]) => {
    setUnifiedQueue(queue);
    await StorageService.saveUnifiedQueue(queue);
  };

  const handleUpdateSpotifyToken = async (token: string) => {
    const updated = { ...settings, spotifyAccessToken: token };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  // Settings Handlers & Backup Export/Import
  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await StorageService.saveSettings(newSettings);
  };

  const handleExportData = async () => {
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
    const success = await StorageService.importData(json);
    if (success) {
      const [reloadedSettings, reloadedPresets, reloadedElements, reloadedIntegrations] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getPresets(),
        StorageService.getStudioElements(),
        StorageService.getIntegrations(),
      ]);
      setSettings(reloadedSettings);
      setPresets(reloadedPresets);
      setStudioElements(reloadedElements);
      setIntegrations(reloadedIntegrations);
    }
    return success;
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Apakah Anda yakin ingin mengembalikan seluruh pengaturan ke default?')) {
      soundboardItems.forEach((item) => {
        soundboardEngine.removeCustomFile(item.id);
        if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      });
      previousSoundboardUrls.current.clear();
      await StorageService.resetToDefaults();
      setSettings(DEFAULT_SETTINGS);
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
    const newEvent: AlertEvent = {
      id: `deck_evt_${Date.now()}`,
      type: (type as AlertType) || 'gift',
      username: 'Viewer_Deck',
      detail,
      amount,
      timestamp: Date.now(),
      formattedTime: new Date().toLocaleTimeString('id-ID'),
    };
    setActiveFloatingAlert(newEvent);
    streamEventBus.emit({
      id: newEvent.id,
      type: newEvent.type as any,
      username: newEvent.username,
      detail: newEvent.detail || '',
      amount: newEvent.amount,
      timestamp: newEvent.timestamp,
    });
    if (ttsConfig.enabled) {
      ttsService.prime();
      ttsService.speakEvent(newEvent.type, newEvent.username, newEvent.detail);
    }
  };

  const handlePlaySoundFromDeck = (soundId: string) => {
    if (soundId.includes('horn')) soundboardEngine.playSynthesizedSFX('horn');
    else if (soundId.includes('cheer')) soundboardEngine.playSynthesizedSFX('cheer');
    else if (soundId.includes('tada')) soundboardEngine.playSynthesizedSFX('tada');
    else if (soundId.includes('bell')) soundboardEngine.playSynthesizedSFX('bell');
    else soundboardEngine.playSynthesizedSFX('level_up');
  };

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

  const pendingRequestsCount = unifiedQueue.filter((s) => s.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#080c16] text-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <Header
        activeNav={activeNav}
        operatingMode={settings.operatingMode}
        activePreset={activePreset}
        onNavigate={setActiveNav}
        onOpenModeModal={() => setIsModeModalOpen(true)}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      {/* Floating Alert Banner Overlay */}
      <AlertBannerOverlay
        currentAlert={activeFloatingAlert}
        onDismiss={() => setActiveFloatingAlert(null)}
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
        onNavigate={setActiveNav}
        pendingMusicCount={pendingRequestsCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeNav === 'dashboard' && (
          <DashboardView
            settings={settings}
            activePreset={activePreset}
            integrations={integrations}
            onSelectMode={handleSelectMode}
            onNavigate={setActiveNav}
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
            onSelectPreset={handleSelectPreset}
            onCreatePreset={handleCreatePreset}
            onDuplicatePreset={handleDuplicatePreset}
            onDeletePreset={handleDeletePreset}
            onToggleFavoritePreset={handleToggleFavoritePreset}
            onRenamePreset={handleRenamePreset}
            marketplaceItems={marketplaceItems}
            onInstallMarketplaceElements={handleInstallMarketplaceElements}
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
            nowPlayingSong={nowPlayingSong}
            isPlaying={isPlayingMusic}
            onTogglePlay={handleTogglePlayMusic}
            onNextTrack={handleNextTrack}
            onPrevTrack={handlePrevTrack}
            onAddSongRequest={handleAddSongRequest}
            onDeleteRequest={handleDeleteSongRequest}
            onLoadPresetPack={handleLoadPresetPack}
            onSetNowPlaying={handleSetNowPlaying}
            // Stage 2 Upgraded Props
            unifiedQueue={unifiedQueue}
            onUpdateUnifiedQueue={handleUpdateUnifiedQueue}
            localTracksMeta={localTracksMeta}
            localFilesMap={localFilesMap}
            onAddLocalFiles={handleAddLocalFiles}
            onRemoveLocalTrack={handleRemoveLocalTrack}
            settings={settings}
            onNavigateToSettings={() => setActiveNav('settings')}
            onUpdateSpotifyToken={handleUpdateSpotifyToken}
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
        onNavigate={setActiveNav}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        pendingRequestsCount={pendingRequestsCount}
      />
    </div>
  );
}
