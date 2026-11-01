import { useState, useEffect } from 'react';
import {
  ActiveNav,
  AppSettings,
  Scene,
  SongRequest,
  AlertSettings,
  AlertEvent,
  OperatingMode,
  OverlayWidgetConfig,
  AlertType,
  UnifiedQueueItem,
  LocalAudioTrackMeta,
} from './types';
import {
  StorageService,
  DEFAULT_SETTINGS,
  DEFAULT_SCENES,
  DEFAULT_SONG_REQUESTS,
  DEFAULT_ALERT_SETTINGS,
  DEFAULT_OVERLAY_CONFIG,
} from './services/storage';
import { soundSynth } from './services/audioSimulator';
import { audioEngine } from './services/localAudioEngine';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { AlertBannerOverlay } from './components/AlertBannerOverlay';
import { ModeLauncherModal } from './components/ModeLauncherModal';
import { DashboardView } from './components/DashboardView';
import { MusicCenterView } from './components/MusicCenterView';
import { OverlayStudioView } from './components/OverlayStudioView';
import { SceneManagerView } from './components/SceneManagerView';
import { LiveAlertsView } from './components/LiveAlertsView';
import { SettingsView } from './components/SettingsView';
import { Radio } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<ActiveNav>('dashboard');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [scenes, setScenes] = useState<Scene[]>(DEFAULT_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>(DEFAULT_SCENES[0].id);
  const [songRequests, setSongRequests] = useState<SongRequest[]>(DEFAULT_SONG_REQUESTS);
  const [nowPlayingSong, setNowPlayingSong] = useState<SongRequest | null>(DEFAULT_SONG_REQUESTS[0]);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [alertHistory, setAlertHistory] = useState<AlertEvent[]>([]);
  const [activeFloatingAlert, setActiveFloatingAlert] = useState<AlertEvent | null>(null);
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);

  // Stage 2: Music Center Hybrid State
  const [unifiedQueue, setUnifiedQueue] = useState<UnifiedQueueItem[]>([]);
  const [localTracksMeta, setLocalTracksMeta] = useState<LocalAudioTrackMeta[]>([]);
  const [localFilesMap, setLocalFilesMap] = useState<Map<string, File>>(new Map());

  // Load from IndexedDB on startup
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [
          savedSettings,
          savedScenes,
          savedActiveId,
          savedRequests,
          savedAlertSettings,
          savedAlertHistory,
          savedQueue,
          savedLocalMeta,
        ] = await Promise.all([
          StorageService.getSettings(),
          StorageService.getScenes(),
          StorageService.getActiveSceneId(),
          StorageService.getSongRequests(),
          StorageService.getAlertSettings(),
          StorageService.getAlertHistory(),
          StorageService.getUnifiedQueue(),
          StorageService.getLocalTracksMeta(),
        ]);

        setSettings(savedSettings);
        setScenes(savedScenes);
        setActiveSceneId(savedActiveId);
        setSongRequests(savedRequests);
        const currentPlaying = savedRequests.find((r) => r.status === 'playing') || savedRequests[0] || null;
        setNowPlayingSong(currentPlaying);
        setAlertSettings(savedAlertSettings);
        setAlertHistory(savedAlertHistory);
        setUnifiedQueue(savedQueue);
        setLocalTracksMeta(savedLocalMeta);

        // Apply audio engine volume from saved settings
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

  // Android Native Hardware Back Button & Status Bar Handling (Capacitor)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#080C16' }).catch(() => {});
    }

    const backListenerPromise = CapApp.addListener('backButton', () => {
      // 1. If modal is open, dismiss it first
      if (isModeModalOpen) {
        setIsModeModalOpen(false);
        return;
      }
      // 2. If floating alert is shown, dismiss it
      if (activeFloatingAlert) {
        setActiveFloatingAlert(null);
        return;
      }
      // 3. If in a secondary navigation view, navigate back to dashboard
      if (activeNav !== 'dashboard') {
        setActiveNav('dashboard');
        return;
      }
      // 4. If already on dashboard, exit the app
      CapApp.exitApp();
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [isModeModalOpen, activeFloatingAlert, activeNav]);

  // Listen for OAuth hash token redirects (Spotify redirect flow support)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      if (accessToken) {
        const updated = { ...settings, spotifyAccessToken: accessToken };
        setSettings(updated);
        StorageService.saveSettings(updated);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [settings]);

  const activeScene = scenes.find((s) => s.id === activeSceneId) || scenes[0] || null;

  // Handle Mode Selection
  const handleSelectMode = async (mode: OperatingMode) => {
    const updated = { ...settings, operatingMode: mode };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  // Music Player Controls (Stage 1 Backwards Compatible)
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

    // Also sync to unified queue
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
        { id: `req_${Date.now()}_3`, title: 'Nightfall Cruiser', artist: 'Midnight Drive', duration: 185, requesterName: 'VectorPilot', platform: 'YouTube', status: 'queued', requestedAt: Date.now(), source: 'youtube', externalUrl: 'https://youtube.com' },
      ];
    } else if (packName === 'lofi') {
      newTracks = [
        { id: `req_${Date.now()}_1`, title: 'Tokyo Rain Walk', artist: 'Tea Garden', duration: 154, requesterName: 'CoffeeLover', platform: 'YouTube', status: 'queued', requestedAt: Date.now(), source: 'youtube', externalUrl: 'https://youtube.com' },
        { id: `req_${Date.now()}_2`, title: 'Midnight Study Sessions', artist: 'Paper Lanterns', duration: 172, requesterName: 'QuietVibes', platform: 'TikTok', status: 'queued', requestedAt: Date.now(), source: 'viewer_request' },
      ];
    } else {
      newTracks = [
        { id: `req_${Date.now()}_1`, title: 'Apex Predator Clutch', artist: 'Battle Arena', duration: 220, requesterName: 'FragMaster', platform: 'Twitch', status: 'queued', requestedAt: Date.now(), source: 'viewer_request' },
        { id: `req_${Date.now()}_2`, title: 'Overtime Victory', artist: 'Esports Audio', duration: 195, requesterName: 'AcePlayer', platform: 'TikTok', status: 'queued', requestedAt: Date.now(), source: 'viewer_request' },
      ];
    }

    const merged = [...songRequests, ...newTracks];
    setSongRequests(merged);
    await StorageService.saveSongRequests(merged);

    // Merge into unified queue
    const newQueueItems: UnifiedQueueItem[] = newTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      source: t.source || 'viewer_request',
      externalUrl: t.externalUrl,
      duration: t.duration,
      requesterName: t.requesterName,
      platform: t.platform,
      addedAt: t.requestedAt,
      status: 'approved',
    }));
    const mergedQueue = [...unifiedQueue, ...newQueueItems];
    setUnifiedQueue(mergedQueue);
    await StorageService.saveUnifiedQueue(mergedQueue);
  };

  // Stage 2: Local Audio File Handlers
  const handleAddLocalFiles = async (files: File[]) => {
    const newMetaList: LocalAudioTrackMeta[] = [];
    const newFilesMap = new Map(localFilesMap);

    for (const file of files) {
      const trackId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      // Extract clean title from filename
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const parts = cleanName.split('-');
      const artist = parts.length > 1 ? parts[0].trim() : 'Local Audio';
      const title = parts.length > 1 ? parts.slice(1).join('-').trim() : cleanName;

      // Probe audio duration via temporary audio element
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

    const updatedMeta = [...localTracksMeta, ...newMetaList];
    setLocalTracksMeta(updatedMeta);
    setLocalFilesMap(newFilesMap);
    await StorageService.saveLocalTracksMeta(updatedMeta);
  };

  const handleRemoveLocalTrack = async (id: string) => {
    const updatedMeta = localTracksMeta.filter((t) => t.id !== id);
    const newFilesMap = new Map(localFilesMap);
    newFilesMap.delete(id);

    setLocalTracksMeta(updatedMeta);
    setLocalFilesMap(newFilesMap);
    await StorageService.saveLocalTracksMeta(updatedMeta);

    // If currently playing, cleanup audio engine
    if (audioEngine.getState().currentTrackId === id) {
      audioEngine.cleanup();
    }
  };

  // Stage 2: Unified Queue Handlers
  const handleUpdateUnifiedQueue = async (updatedQueue: UnifiedQueueItem[]) => {
    setUnifiedQueue(updatedQueue);
    await StorageService.saveUnifiedQueue(updatedQueue);

    // Sync legacy requests
    const legacyRequests: SongRequest[] = updatedQueue.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      duration: item.duration || 180,
      requesterName: item.requesterName,
      platform: item.platform || 'Manual',
      status: item.status === 'playing' ? 'playing' : item.status === 'completed' ? 'played' : 'queued',
      requestedAt: item.addedAt,
      source: item.source,
      externalUrl: item.externalUrl,
      thumbnailUrl: item.thumbnailUrl,
      queueStatus: item.status,
    }));
    setSongRequests(legacyRequests);
  };

  const handleUpdateSpotifyToken = async (token: string) => {
    const updated = { ...settings, spotifyAccessToken: token };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  // Overlay Studio Update
  const handleUpdateOverlayConfig = async (newConfig: OverlayWidgetConfig) => {
    if (!activeScene) return;
    const updatedScenes = scenes.map((s) => {
      if (s.id === activeScene.id) {
        return { ...s, overlayConfig: newConfig };
      }
      return s;
    });
    setScenes(updatedScenes);
    await StorageService.saveScenes(updatedScenes);
  };

  // Scene Manager Controls
  const handleSelectScene = async (id: string) => {
    setActiveSceneId(id);
    await StorageService.saveActiveSceneId(id);
  };

  const handleCreateScene = async (name: string, description: string, baseConfig?: OverlayWidgetConfig) => {
    const newScene: Scene = {
      id: `scene_${Date.now()}`,
      name,
      description,
      createdAt: Date.now(),
      overlayConfig: baseConfig || DEFAULT_OVERLAY_CONFIG,
    };
    const updated = [...scenes, newScene];
    setScenes(updated);
    setActiveSceneId(newScene.id);
    await StorageService.saveScenes(updated);
    await StorageService.saveActiveSceneId(newScene.id);
  };

  const handleRenameScene = async (id: string, newName: string, newDescription: string) => {
    const updated = scenes.map((s) => {
      if (s.id === id) {
        return { ...s, name: newName, description: newDescription };
      }
      return s;
    });
    setScenes(updated);
    await StorageService.saveScenes(updated);
  };

  const handleDuplicateScene = async (id: string) => {
    const target = scenes.find((s) => s.id === id);
    if (!target) return;
    const duplicated: Scene = {
      ...target,
      id: `scene_${Date.now()}`,
      name: `${target.name} (Copy)`,
      createdAt: Date.now(),
      overlayConfig: JSON.parse(JSON.stringify(target.overlayConfig)),
    };
    const updated = [...scenes, duplicated];
    setScenes(updated);
    await StorageService.saveScenes(updated);
  };

  const handleDeleteScene = async (id: string) => {
    if (scenes.length <= 1) return;
    const updated = scenes.filter((s) => s.id !== id);
    setScenes(updated);
    if (activeSceneId === id) {
      setActiveSceneId(updated[0].id);
      await StorageService.saveActiveSceneId(updated[0].id);
    }
    await StorageService.saveScenes(updated);
  };

  // Alert Actions & Simulator
  const handleFireTestAlert = async (type: AlertType) => {
    const config = alertSettings[type];
    if (config.soundEnabled) {
      soundSynth.playAlertChime(type);
    }

    const testUsernames = ['CyberViper', 'AeroKnight', 'StreamSamurai', 'LunaGamer', 'NeonPulse'];
    const randomUser = testUsernames[Math.floor(Math.random() * testUsernames.length)];

    let detail = '';
    if (type === 'follower') detail = 'Just hit the Follow button!';
    else if (type === 'gift') detail = 'Sent 5x Cyber Stars!';
    else if (type === 'like') detail = 'Liked stream 50 times!';
    else detail = 'First time chatter in stream!';

    const newEvent: AlertEvent = {
      id: `ev_${Date.now()}`,
      type,
      username: randomUser,
      detail,
      timestamp: Date.now(),
    };

    setActiveFloatingAlert(newEvent);
    const updatedHistory = [newEvent, ...alertHistory];
    setAlertHistory(updatedHistory);
    await StorageService.saveAlertHistory(updatedHistory);
  };

  const handleUpdateAlertSettings = async (newSettings: AlertSettings) => {
    setAlertSettings(newSettings);
    await StorageService.saveAlertSettings(newSettings);
  };

  const handleClearAlertHistory = async () => {
    setAlertHistory([]);
    await StorageService.saveAlertHistory([]);
  };

  // Settings & Storage Actions
  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await StorageService.saveSettings(newSettings);
  };

  const handleExportData = async () => {
    const json = await StorageService.exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `syntxrr_stream_tools_backup_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (json: string): Promise<boolean> => {
    const success = await StorageService.importData(json);
    if (success) {
      const [
        savedSettings,
        savedScenes,
        savedActiveId,
        savedRequests,
        savedAlertSettings,
        savedAlertHistory,
        savedQueue,
        savedLocalMeta,
      ] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getScenes(),
        StorageService.getActiveSceneId(),
        StorageService.getSongRequests(),
        StorageService.getAlertSettings(),
        StorageService.getAlertHistory(),
        StorageService.getUnifiedQueue(),
        StorageService.getLocalTracksMeta(),
      ]);
      setSettings(savedSettings);
      setScenes(savedScenes);
      setActiveSceneId(savedActiveId);
      setSongRequests(savedRequests);
      setAlertSettings(savedAlertSettings);
      setAlertHistory(savedAlertHistory);
      setUnifiedQueue(savedQueue);
      setLocalTracksMeta(savedLocalMeta);
    }
    return success;
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Reset all scenes and configurations to factory defaults?')) {
      await StorageService.resetToDefaults();
      setSettings(DEFAULT_SETTINGS);
      setScenes(DEFAULT_SCENES);
      setActiveSceneId(DEFAULT_SCENES[0].id);
      setSongRequests(DEFAULT_SONG_REQUESTS);
      setNowPlayingSong(DEFAULT_SONG_REQUESTS[0]);
      setAlertSettings(DEFAULT_ALERT_SETTINGS);
      setAlertHistory([]);
      setUnifiedQueue([]);
      setLocalTracksMeta([]);
      setLocalFilesMap(new Map());
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c16] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mx-auto text-blue-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div className="text-sm font-bold text-white tracking-wider">
            SYNTXRR STREAM TOOLS
          </div>
          <div className="text-xs text-slate-400">
            Loading Stage 2 Hybrid Studio environment...
          </div>
        </div>
      </div>
    );
  }

  const pendingRequestsCount = unifiedQueue.filter((s) => s.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#080c16] text-slate-100 flex flex-col">
      {/* Top Bar Header */}
      <Header
        activeNav={activeNav}
        operatingMode={settings.operatingMode}
        activeScene={activeScene}
        onNavigate={setActiveNav}
        onOpenModeModal={() => setIsModeModalOpen(true)}
      />

      {/* Floating Real-Time Alert Banner Overlay */}
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeNav === 'dashboard' && (
          <DashboardView
            settings={settings}
            activeScene={activeScene}
            nowPlayingSong={nowPlayingSong}
            isPlayingMusic={isPlayingMusic}
            queuedSongs={songRequests.filter((s) => s.status === 'queued')}
            onTogglePlayMusic={handleTogglePlayMusic}
            onSelectMode={handleSelectMode}
            onNavigate={setActiveNav}
            onOpenModeModal={() => setIsModeModalOpen(true)}
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

        {activeNav === 'overlay' && (
          <OverlayStudioView
            activeScene={activeScene}
            nowPlayingSong={nowPlayingSong}
            queuedSongs={songRequests.filter((s) => s.status === 'queued')}
            onUpdateOverlayConfig={handleUpdateOverlayConfig}
          />
        )}

        {activeNav === 'scenes' && (
          <SceneManagerView
            scenes={scenes}
            activeSceneId={activeSceneId}
            onSelectScene={handleSelectScene}
            onCreateScene={handleCreateScene}
            onRenameScene={handleRenameScene}
            onDuplicateScene={handleDuplicateScene}
            onDeleteScene={handleDeleteScene}
            onNavigateToOverlay={() => setActiveNav('overlay')}
          />
        )}

        {activeNav === 'alerts' && (
          <LiveAlertsView
            alertSettings={alertSettings}
            alertHistory={alertHistory}
            onFireTestAlert={handleFireTestAlert}
            onUpdateAlertSettings={handleUpdateAlertSettings}
            onClearHistory={handleClearAlertHistory}
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
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        activeNav={activeNav}
        onNavigate={setActiveNav}
        pendingRequestsCount={pendingRequestsCount}
      />
    </div>
  );
}
