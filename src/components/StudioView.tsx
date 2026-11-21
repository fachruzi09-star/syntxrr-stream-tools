import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StudioElement,
  CanvasOrientation,
  SourceType,
  StreamEventType,
  StreamEvent,
  StudioPreset,
  StudioPresetGroup,
  StudioPresetSuperGroup,
  PresetCategory,
  MarketplaceItem,
  MarketplaceCategory,
} from '../types';
import { streamEventBus } from '../services/eventBus';
import { soundSynth } from '../services/audioSimulator';
import { showInAppNotice } from '../services/uiNotice';
import { audioEngine } from '../services/localAudioEngine';
import {
  songRequestEngine,
  SongRequestState,
  SongRequestTestPipelineResult,
} from '../services/songRequestEngine';
import {
  ensureUniqueElementIds,
  DEFAULT_MARKETPLACE_ITEMS,
  StorageService,
  createStudioMediaAssetUri,
  getStudioMediaAssetIdFromUri,
} from '../services/storage';
import {
  applyPresetGroupStateToElements,
  createGroupForElements,
  createSuperGroupForGroups,
  getPresetGroupBounds,
  transformPresetGroupElements,
} from '../services/presetModel';
import type { PresetGroupBounds } from '../services/presetModel';
import type { ModeBStreamSnapshot } from '../services/nativeStreamingBridge';
import {
  MODE_B_SCREENSAVER_DEFAULT_FADE_MS,
  MODE_B_SCREENSAVER_DEFAULT_TEXT,
  isSupportedScreensaverAssetSelection,
  toStudioScreensaverSettings,
} from '../services/modeBScreensaverPolicy';
import { SOURCE_CATALOG } from './SourcesLibraryView';
import {
  Tv,
  Layers,
  Plus,
  Trash2,
  Copy,
  Lock,
  Volume2,
  Unlock,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Camera,
  MessageSquare,
  Bell,
  Sparkles,
  Undo2,
  Redo2,
  Zap,
  Globe,
  Type,
  Image as ImageIcon,
  Video,
  TrendingUp,
  Sliders,
  Play,
  Pause,
  FastForward,
  Music,
  Monitor,
  Flame,
  ListMusic,
  Check,
  AlertCircle,
  FolderOpen,
  Upload,
  Star,
  ExternalLink,
  ShieldCheck,
  FileAudio,
  Film,
  Layout,
  Smartphone,
  Square,
  Edit2,
  ArrowRight,
  X,
  ShoppingBag,
  Box,
  Search,
  Download,
  Move,
} from 'lucide-react';

interface StudioViewProps {
  elements: StudioElement[];
  canvasOrientation: CanvasOrientation;
  onChangeOrientation: (orientation: CanvasOrientation) => void;
  onUpdateElements: (elements: StudioElement[]) => void;
  onSaveAsPreset: () => void;
  // Shared Presets System integration
  presets?: StudioPreset[];
  activePresetId?: string;
  activePreset?: StudioPreset | null;
  onUpdateActivePreset?: (patch: Partial<StudioPreset>) => void | Promise<void>;
  onSelectPreset?: (presetId: string) => void;
  onCreatePreset?: (preset: Omit<StudioPreset, 'id' | 'createdAt'>) => void;
  onDuplicatePreset?: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  onToggleFavoritePreset?: (presetId: string) => void;
  onRenamePreset?: (presetId: string, newName: string) => void;
  // Production Hub Integration
  marketplaceItems?: MarketplaceItem[];
  onInstallMarketplaceElements?: (elements: StudioElement[]) => void;
  // Mode B RTMP Encoder Integration
  isModeBSelected?: boolean;
  modeBStatus?: ModeBStreamSnapshot;
  isModeBMutationLocked?: boolean;
  isModeBActionPending?: boolean;
  onApplyLiveSceneToModeB?: (
    elementsOverride?: StudioElement[],
    presetOverride?: StudioPreset | null,
  ) => Promise<{ success: boolean; message: string }>;
  onUpdatePresetModeBSettings?: (
    presetId: string,
    patch: Pick<
      Partial<StudioPreset>,
      'backgroundUri' | 'screensaver' | 'transitionIn' | 'transitionOut'
    >,
  ) => Promise<void> | void;
}

// Active trigger reaction state for canvas animation
interface ActiveElementReaction {
  elementId: string;
  action: 'show' | 'pulse' | 'bounce' | 'text_update';
  textOverride?: string;
  countOverride?: number;
  expiresAt: number;
}

// Local Media Item in Media Library
interface LocalMediaItem {
  id: string;
  assetId?: string;
  mimeType?: string;
  name: string;
  type: 'image' | 'video';
  url: string; // Data URL, Object URL, or HTTPS URL
  sizeBytes?: number;
  addedAt: number;
}

export const StudioView: React.FC<StudioViewProps> = ({
  elements,
  canvasOrientation,
  onChangeOrientation,
  onUpdateElements,
  onSaveAsPreset,
  presets = [],
  activePresetId,
  activePreset: activePresetProp,
  onUpdateActivePreset,
  onSelectPreset,
  onCreatePreset,
  onDuplicatePreset,
  onDeletePreset,
  onToggleFavoritePreset,
  onRenamePreset,
  marketplaceItems = DEFAULT_MARKETPLACE_ITEMS,
  onInstallMarketplaceElements,
  isModeBSelected = false,
  modeBStatus,
  isModeBMutationLocked = false,
  isModeBActionPending = false,
  onApplyLiveSceneToModeB,
  onUpdatePresetModeBSettings,
}) => {
  // Selected Element & Group Selection
  const [selectedId, setSelectedId] = useState<string | null>(elements[0]?.id || null);
  const [selectedLayerElementIds, setSelectedLayerElementIds] = useState<string[]>([]);
  const [selectedLayerGroupIds, setSelectedLayerGroupIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Studio Sub-Sections: 'properties' | 'elements' | 'sources' | 'presets' | 'media' | 'layers' | 'simulator' | 'marketplace'
  const [activeSidePanel, setActiveSidePanel] = useState<
    'properties' | 'elements' | 'sources' | 'presets' | 'media' | 'layers' | 'simulator' | 'marketplace'
  >('properties');

  // Sources Catalog Filter & Search States
  const [sourceCategoryFilter, setSourceCategoryFilter] = useState<'all' | 'basic' | 'dynamic'>('all');
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');

  // Marketplace Filter & Search States
  const [marketplaceCategoryFilter, setMarketplaceCategoryFilter] = useState<string>('all');
  const [marketplaceSearchQuery, setMarketplaceSearchQuery] = useState('');

  // Canvas Pan & Zoom
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isMonitorExpanded, setIsMonitorExpanded] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Multi-Camera Stream Store (elementId -> MediaStream)
  const [activeCameraStreams, setActiveCameraStreams] = useState<Record<string, MediaStream>>({});
  const activeCameraStreamsRef = useRef<Record<string, MediaStream>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Screen Capture Stream Store
  const [screenCaptureStream, setScreenCaptureStream] = useState<MediaStream | null>(null);
  const screenCaptureStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Active Reactions on Canvas (Trigger Engine)
  const [activeReactions, setActiveReactions] = useState<Record<string, ActiveElementReaction>>({});

  // Dynamic Live Simulation Counter States
  const [simulatedLikes, setSimulatedLikes] = useState<number>(1240);
  const [recentChatList, setRecentChatList] = useState<{ id: string; user: string; text: string; badge?: string }[]>([
    { id: 'c1', user: 'DimasGamer', text: 'Keren banget gameplay-nya bang! 🔥', badge: 'VIP' },
    { id: 'c2', user: 'SitiStream', text: 'Gaskeun win streak malam ini!', badge: 'SUB' },
  ]);

  // Song Request Engine State Sync
  const [srState, setSrState] = useState<SongRequestState>(songRequestEngine.getState());
  const [testQueryInput, setTestQueryInput] = useState<string>('Neon Horizon');
  const [activeTestPipeline, setActiveTestPipeline] = useState<SongRequestTestPipelineResult | null>(null);
  const [isSongTestModalOpen, setIsSongTestModalOpen] = useState<boolean>(false);

  useEffect(() => {
    return songRequestEngine.subscribe((state) => {
      setSrState(state);
      if (state.lastTestPipelineResult) {
        setActiveTestPipeline(state.lastTestPipelineResult);
      }
    });
  }, []);

  // Manual Audio Test State
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [manualAudioTitle, setManualAudioTitle] = useState('');
  const [manualAudioArtist, setManualAudioArtist] = useState('');

  useEffect(() => {
    return audioEngine.subscribe((state) => {
      setIsTestingAudio(state.isPlaying);
      setManualAudioTitle(state.currentTrackId ? state.title : '');
      setManualAudioArtist(state.currentTrackId ? state.artist : '');
    });
  }, []);

  // History for Undo/Redo
  const [history, setHistory] = useState<StudioElement[][]>([]);
  const [redoStack, setRedoStack] = useState<StudioElement[][]>([]);

  // Presets Category Filter
  const [presetFilterCategory, setPresetFilterCategory] = useState<PresetCategory>('all');
  const [newPresetModalOpen, setNewPresetModalOpen] = useState(false);
  const [newPresetNameInput, setNewPresetNameInput] = useState('');
  const [newPresetDescInput, setNewPresetDescInput] = useState('');

  // Preset Selector (entry screen before canvas)
  const [showPresetSelector, setShowPresetSelector] = useState(true);
  const [selectorCreateModalOpen, setSelectorCreateModalOpen] = useState(false);
  const [selectorPresetName, setSelectorPresetName] = useState('');
  const [selectorCategory, setSelectorCategory] = useState<PresetCategory>('hp_screen');
  const [selectorOrientation, setSelectorOrientation] = useState<CanvasOrientation>('9:16');
  const [selectorDescription, setSelectorDescription] = useState('');
  const [selectorTemplate, setSelectorTemplate] = useState<'blank' | 'gaming' | 'chatting' | 'music'>('gaming');
  const [selectorFilterCategory, setSelectorFilterCategory] = useState<PresetCategory>('all');
  const [editingPresetIdInSelector, setEditingPresetIdInSelector] = useState<string | null>(null);
  const [editingNameInSelector, setEditingNameInSelector] = useState('');

  // Preset rename in sidebar
  const [editingPresetIdInSidebar, setEditingPresetIdInSidebar] = useState<string | null>(null);
  const [editingNameInSidebar, setEditingNameInSidebar] = useState<string>('');

  // Manual Audio File Picker State
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const manualAudioFilesRef = useRef<Map<string, File>>(new Map());
  const [manualAudioFilesState, setManualAudioFilesState] = useState<Record<string, { name: string; size: number; type: string }>>({});

  // Media Library State
  const [mediaLibrary, setMediaLibrary] = useState<LocalMediaItem[]>([
    {
      id: 'default_img_1',
      name: 'Logo Sponsor Neon',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
      addedAt: Date.now() - 3600000,
    },
  ]);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);
  const [previewMediaType, setPreviewMediaType] = useState<'image' | 'video'>('image');
  const [previewAssetId, setPreviewAssetId] = useState<string | undefined>(undefined);
  const [manualMediaUrlInput, setManualMediaUrlInput] = useState<string>('');
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [mediaModeBNotice, setMediaModeBNotice] = useState<string | null>(null);
  const [modeBLiveApplyFeedback, setModeBLiveApplyFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const createdObjectUrlsRef = useRef<Map<string, string>>(new Map());
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // UNIFIED POINTER DRAG & RESIZE REFS
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    resizeHandle: string | null;
    elementId: string | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  }>({
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    elementId: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origW: 0,
    origH: 0,
  });

  // Refs for performant live-drag (avoid per-move history pushes + stale closures)
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const isLiveDragRef = useRef(false);
  const preDragElementsRef = useRef<StudioElement[] | null>(null);
  const groupTransformRef = useRef<{
    mode: 'move' | 'resize' | null;
    group: StudioPresetGroup | null;
    pointerId: number | null;
    handle: string | null;
    startX: number;
    startY: number;
    startBounds: PresetGroupBounds | null;
    lastBounds: PresetGroupBounds | null;
    originalElements: StudioElement[];
  }>({
    mode: null,
    group: null,
    pointerId: null,
    handle: null,
    startX: 0,
    startY: 0,
    startBounds: null,
    lastBounds: null,
    originalElements: [],
  });

  const selectedElement = elements.find((e) => e.id === selectedId) || null;
  const previousPresetIdRef = useRef(activePresetId);

  useEffect(() => {
    activeCameraStreamsRef.current = activeCameraStreams;
  }, [activeCameraStreams]);

  useEffect(() => {
    screenCaptureStreamRef.current = screenCaptureStream;
  }, [screenCaptureStream]);

  // Stop orphaned camera streams if a preset switch or external update removes those elements
  useEffect(() => {
    const activeElementIds = new Set(
      elements.filter((elem) => elem.type === 'camera').map((elem) => elem.id)
    );
    const currentStreams = activeCameraStreamsRef.current;
    const orphanedIds = Object.keys(currentStreams).filter((id) => !activeElementIds.has(id));
    if (orphanedIds.length === 0) return;

    orphanedIds.forEach((id) => {
      currentStreams[id]?.getTracks().forEach((track) => track.stop());
      if (videoRefs.current[id]) {
        videoRefs.current[id]!.srcObject = null;
      }
    });

    setActiveCameraStreams((prev) => {
      let changed = false;
      const next = { ...prev };
      orphanedIds.forEach((id) => {
        if (next[id]) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [elements]);

  const activePreset = activePresetProp ?? presets.find((p) => p.id === activePresetId) ?? presets[0] ?? null;
  const isModeBLive = Boolean(
    isModeBSelected && modeBStatus?.status === 'live' && modeBStatus?.isStreaming,
  );
  const isStrictModeBLocked = Boolean(
    isModeBSelected && isModeBMutationLocked && !isModeBLive,
  );

  const activeGroups = activePreset?.groups || [];
  const activeSuperGroups = activePreset?.superGroups || [];
  const selectedGroup = activeGroups.find((group) => group.id === selectedGroupId) || null;
  const selectedGroupBounds = selectedGroup ? getPresetGroupBounds(selectedGroup, elements) : null;
  const isPresetGroupLocked = (group: StudioPresetGroup): boolean => {
    const parent = activeSuperGroups.find((item) => item.groupIds.includes(group.id));
    const children = group.elementIds.map((id) => elements.find((element) => element.id === id));
    return Boolean(
      isStrictModeBLocked ||
        group.locked ||
        parent?.locked ||
        children.some((element) => !element || element.locked),
    );
  };
  const selectedGroupIsLocked = selectedGroup ? isPresetGroupLocked(selectedGroup) : false;

  const updatePresetStructure = (groups: StudioPresetGroup[], superGroups: StudioPresetSuperGroup[]) => {
    if (!onUpdateActivePreset || isStrictModeBLocked) return;
    return onUpdateActivePreset({ groups, superGroups });
  };

  const toggleLayerElementSelection = (elementId: string) => {
    setSelectedLayerElementIds((previous) =>
      previous.includes(elementId)
        ? previous.filter((id) => id !== elementId)
        : [...previous, elementId],
    );
  };

  const toggleLayerGroupSelection = (groupId: string) => {
    setSelectedLayerGroupIds((previous) =>
      previous.includes(groupId)
        ? previous.filter((id) => id !== groupId)
        : [...previous, groupId],
    );
  };

  const handleCreatePresetGroup = () => {
    const selectedIds = selectedLayerElementIds.filter((id) =>
      elements.some((element) => element.id === id),
    );
    if (selectedIds.length < 2 || !activePreset || !onUpdateActivePreset || isStrictModeBLocked) return;
    const selectedSet = new Set(selectedIds);
    const retainedGroups = activeGroups
      .map((group) => ({
        ...group,
        elementIds: group.elementIds.filter((id) => !selectedSet.has(id)),
      }))
      .filter((group) => group.elementIds.length > 0);
    const retainedGroupIds = new Set(retainedGroups.map((group) => group.id));
    const nextSuperGroups = activeSuperGroups
      .map((group) => ({
        ...group,
        groupIds: group.groupIds.filter((id) => retainedGroupIds.has(id)),
      }))
      .filter((group) => group.groupIds.length > 0);
    const nextGroup = createGroupForElements(elements, selectedIds, `Grup ${activeGroups.length + 1}`);
    const updateResult = updatePresetStructure([...retainedGroups, nextGroup], nextSuperGroups);
    void Promise.resolve(updateResult)
      .then(() => {
        if (!isMountedRef.current) return;
        setSelectedGroupId(nextGroup.id);
        setSelectedId(null);
      })
      .catch((error) => {
        console.error('Gagal menyimpan struktur Group:', error);
      });
    setSelectedLayerElementIds([]);
    setSelectedLayerGroupIds([]);
  };

  const handleCreatePresetSuperGroup = () => {
    const selectedIds = selectedLayerGroupIds.filter((id) =>
      activeGroups.some((group) => group.id === id),
    );
    if (selectedIds.length < 2 || !activePreset || !onUpdateActivePreset || isStrictModeBLocked) return;
    const selectedSet = new Set(selectedIds);
    const retainedSuperGroups = activeSuperGroups
      .map((group) => ({
        ...group,
        groupIds: group.groupIds.filter((id) => !selectedSet.has(id)),
      }))
      .filter((group) => group.groupIds.length > 0);
    const nextSuperGroup = createSuperGroupForGroups(
      activeGroups,
      selectedIds,
      `Supergroup ${activeSuperGroups.length + 1}`,
    );
    updatePresetStructure(activeGroups, [...retainedSuperGroups, nextSuperGroup]);
    setSelectedLayerGroupIds([]);
  };

  const handleUngroupPresetGroup = (groupId: string) => {
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    const nextGroups = activeGroups.filter((group) => group.id !== groupId);
    const nextSuperGroups = activeSuperGroups
      .map((group) => ({
        ...group,
        groupIds: group.groupIds.filter((id) => id !== groupId),
      }))
      .filter((group) => group.groupIds.length > 0);
    updatePresetStructure(nextGroups, nextSuperGroups);
  };

  const handleUngroupPresetSuperGroup = (superGroupId: string) => {
    updatePresetStructure(
      activeGroups,
      activeSuperGroups.filter((group) => group.id !== superGroupId),
    );
  };

  const handleSetGroupVisibility = (groupId: string, visible: boolean) => {
    updatePresetStructure(
      activeGroups.map((group) => (group.id === groupId ? { ...group, visible } : group)),
      activeSuperGroups,
    );
  };

  const handleSetGroupLocked = (groupId: string, locked: boolean) => {
    updatePresetStructure(
      activeGroups.map((group) => (group.id === groupId ? { ...group, locked } : group)),
      activeSuperGroups,
    );
  };

  const handleSetSuperGroupVisibility = (superGroupId: string, visible: boolean) => {
    updatePresetStructure(
      activeGroups,
      activeSuperGroups.map((group) =>
        group.id === superGroupId ? { ...group, visible } : group,
      ),
    );
  };

  const handleSetSuperGroupLocked = (superGroupId: string, locked: boolean) => {
    updatePresetStructure(
      activeGroups,
      activeSuperGroups.map((group) =>
        group.id === superGroupId ? { ...group, locked } : group,
      ),
    );
  };

  const effectiveElements = applyPresetGroupStateToElements({
    elements,
    groups: activeGroups,
    superGroups: activeSuperGroups,
  });
  const effectiveStateByElementId = new Map(
    effectiveElements.map((element) => [element.id, element]),
  );
  const isElementHiddenByGroup = (elementId: string): boolean => {
    const element = elements.find((item) => item.id === elementId);
    return Boolean(
      element && effectiveStateByElementId.get(elementId)?.visible === false && element.visible !== false,
    );
  };
  const isElementLockedByGroup = (elementId: string): boolean => {
    const group = activeGroups.find((item) => item.elementIds.includes(elementId));
    if (group?.locked) return true;
    return Boolean(
      group && activeSuperGroups.find((item) => item.groupIds.includes(group.id))?.locked,
    );
  };

  // A preset is a separate editing document: never carry selection or undo history across it.
  useEffect(() => {
    if (previousPresetIdRef.current === activePresetId) return;
    previousPresetIdRef.current = activePresetId;
    setSelectedId(elementsRef.current[0]?.id || null);
    setSelectedLayerElementIds([]);
    setSelectedLayerGroupIds([]);
    setSelectedGroupId(null);
    setHistory([]);
    setRedoStack([]);
    setActiveReactions({});
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
    setNewPresetModalOpen(false);
    isLiveDragRef.current = false;
    preDragElementsRef.current = null;
    dragRef.current.isDragging = false;
    dragRef.current.isResizing = false;
    dragRef.current.elementId = null;
    dragRef.current.pointerId = null;
    groupTransformRef.current = {
      mode: null,
      group: null,
      pointerId: null,
      handle: null,
      startX: 0,
      startY: 0,
      startBounds: null,
      lastBounds: null,
      originalElements: [],
    };
  }, [activePresetId]);

  useEffect(() => {
    if (selectedGroupId && !activeGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [activeGroups, selectedGroupId]);

  // Hydrate persisted Studio media assets (images & MP4/video blobs) from IndexedDB cleanly
  useEffect(() => {
    let cancelled = false;
    void StorageService.getStudioMediaAssets()
      .then((assets) => {
        if (cancelled || !assets.length) return;
        const hydrated: LocalMediaItem[] = [];
        for (const asset of assets) {
          if (asset.type !== 'image' && asset.type !== 'video') continue;
          let objUrl = createdObjectUrlsRef.current.get(asset.id);
          if (!objUrl) {
            objUrl = URL.createObjectURL(asset.blob);
            createdObjectUrlsRef.current.set(asset.id, objUrl);
          }
          hydrated.push({
            id: asset.id,
            assetId: asset.id,
            mimeType: asset.mimeType,
            name: asset.name,
            type: asset.type,
            url: objUrl,
            sizeBytes: asset.sizeBytes,
            addedAt: asset.addedAt,
          });
        }
        if (hydrated.length === 0) return;
        setMediaLibrary((prev) => {
          const seenIds = new Set(hydrated.map((item) => item.id));
          return [...hydrated, ...prev.filter((item) => !seenIds.has(item.id))];
        });
      })
      .catch((err) => {
        console.warn('Gagal memuat pustaka media Studio dari penyimpanan lokal:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup all remaining camera, screen tracks, and object URLs strictly on component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      Object.values(activeCameraStreamsRef.current).forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      if (screenCaptureStreamRef.current) {
        screenCaptureStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      createdObjectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      createdObjectUrlsRef.current.clear();
    };
  }, []);

  // EVENT-TO-ELEMENT ENGINE: Subscribe to streamEventBus
  useEffect(() => {
    const unsubscribe = streamEventBus.subscribe((event: StreamEvent) => {
      const now = Date.now();

      elements.forEach((elem) => {
        let isMatch = false;
        let action: 'show' | 'pulse' | 'bounce' | 'text_update' = 'pulse';
        let durationSec = elem.triggerConfig?.durationSec || 5;
        let textOverride: string | undefined = undefined;

        // Auto-Trigger Logic per Element Type
        if (elem.type === 'event_alert') {
          if (elem.triggerConfig?.eventType) {
            isMatch = elem.triggerConfig.eventType === 'all' || elem.triggerConfig.eventType === event.type;
          } else {
            isMatch = event.type === 'gift' || event.type === 'donation' || event.type === 'follow';
          }
          if (isMatch) {
            action = 'bounce';
            textOverride = `${event.username}: ${event.detail}`;
            soundSynth.playAlertChime(event.type === 'gift' ? 'gift' : 'follower');
          }
        } else if (elem.type === 'combo_counter') {
          if (event.type === 'gift' || event.type === 'like') {
            isMatch = true;
            action = 'pulse';
            soundSynth.playAlertChime('gift');
          }
        } else if (elem.type === 'chat_message') {
          if (event.type === 'chat') {
            isMatch = true;
            action = 'text_update';
            setRecentChatList((prev) => [
              ...prev.slice(-4),
              { id: `c_${now}`, user: event.username, text: event.detail, badge: 'LIVE' },
            ]);
            soundSynth.playAlertChime('chat_event');
          }
        } else if (elem.type === 'counter' || elem.type === 'live_viewer_counter') {
          if (event.type === 'like') {
            isMatch = true;
            action = 'pulse';
            setSimulatedLikes((prev) => prev + (event.amount || 1));
            soundSynth.playAlertChime('like');
          }
        } else if (elem.type === 'song_request') {
          if (event.type === 'chat' && event.detail.startsWith('!play')) {
            isMatch = true;
            action = 'pulse';
          }
        } else if (elem.triggerConfig && elem.triggerConfig.eventType) {
          if (elem.triggerConfig.eventType === 'all' || elem.triggerConfig.eventType === event.type) {
            isMatch = true;
            action = (elem.triggerConfig.action as any) || 'show';
          }
        }

        if (isMatch) {
          setActiveReactions((prev) => ({
            ...prev,
            [elem.id]: {
              elementId: elem.id,
              action,
              textOverride,
              expiresAt: now + durationSec * 1000,
            },
          }));
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [elements]);

  // Periodic expiration cleaner for active reactions
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveReactions((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.entries(next).forEach(([id, reaction]) => {
          if (reaction.expiresAt <= now) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 500);

    return () => clearInterval(timer);
  }, []);

  // Record undo/redo history
  const commitElements = useCallback(
    (newElements: StudioElement[]) => {
      if (isStrictModeBLocked) return;
      setHistory((prev) => [...prev.slice(-15), elements]);
      setRedoStack([]);
      onUpdateElements(ensureUniqueElementIds(newElements));
    },
    [elements, isStrictModeBLocked, onUpdateElements]
  );

  // Lightweight live update during drag: updates elements without pushing undo history
  const updateElementLive = useCallback(
    (id: string, updates: Partial<StudioElement>) => {
      if (isStrictModeBLocked) return;
      const updated = elementsRef.current.map((elem) =>
        elem.id === id ? { ...elem, ...updates } : elem
      );
      onUpdateElements(updated);
    },
    [isStrictModeBLocked, onUpdateElements]
  );

  const handleUndo = () => {
    if (isStrictModeBLocked) return;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [...prev, elementsRef.current]);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    elementsRef.current = previous;
    onUpdateElements(previous);
  };

  const handleRedo = () => {
    if (isStrictModeBLocked) return;
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((prev) => [...prev, elementsRef.current]);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    elementsRef.current = next;
    onUpdateElements(next);
  };

  const updateElementField = (id: string, field: keyof StudioElement, value: any) => {
    if (isStrictModeBLocked || isElementLockedByGroup(id)) return;
    const updated = elementsRef.current.map((elem) => {
      if (elem.id === id) {
        return { ...elem, [field]: value };
      }
      return elem;
    });
    commitElements(updated);
  };

  const updateElementProperty = (id: string, key: string, value: any) => {
    if (isStrictModeBLocked || isElementLockedByGroup(id)) return;
    const updated = elementsRef.current.map((elem) => {
      if (elem.id === id) {
        const nextProperties = {
          ...elem.properties,
          [key]: value,
        };
        if (key === 'imageUrl' && typeof value === 'string' && !value.startsWith('studio-media://')) {
          delete nextProperties.imageAssetId;
        }
        if (key === 'videoUrl' && typeof value === 'string' && !value.startsWith('studio-media://')) {
          delete nextProperties.videoAssetId;
        }
        return {
          ...elem,
          properties: nextProperties,
        };
      }
      return elem;
    });
    commitElements(updated);
  };

  const updateElementTrigger = (id: string, partial: any) => {
    if (isStrictModeBLocked || isElementLockedByGroup(id)) return;
    const updated = elementsRef.current.map((elem) => {
      if (elem.id === id) {
        return {
          ...elem,
          triggerConfig: {
            ...elem.triggerConfig,
            ...partial,
          },
        };
      }
      return elem;
    });
    commitElements(updated);
  };

  // MULTI-CAMERA STREAM CONTROL PER ELEMENT
  const handleToggleCameraForElement = async (elemId: string, requestedFacingMode?: 'user' | 'environment') => {
    const existing = activeCameraStreamsRef.current[elemId];
    if (existing) {
      existing.getTracks().forEach((track) => track.stop());
      setActiveCameraStreams((prev) => {
        if (!prev[elemId]) return prev;
        const next = { ...prev };
        delete next[elemId];
        return next;
      });
      if (videoRefs.current[elemId]) {
        videoRefs.current[elemId]!.srcObject = null;
      }
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const targetElement = elementsRef.current.find((e) => e.id === elemId);
          const facing = requestedFacingMode || targetElement?.properties?.facingMode || 'user';
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facing,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });

          if (!isMountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          setActiveCameraStreams((prev) => {
            const previousForElem = prev[elemId];
            if (previousForElem && previousForElem !== stream) {
              previousForElem.getTracks().forEach((track) => track.stop());
            }
            return {
              ...prev,
              [elemId]: stream,
            };
          });

          if (videoRefs.current[elemId]) {
            videoRefs.current[elemId]!.srcObject = stream;
            videoRefs.current[elemId]!.play().catch(() => {});
          }
        } else {
          showInAppNotice({
            tone: 'warn',
            title: 'Kamera Tidak Didukung',
            message: 'Webcam mediaDevices tidak didukung oleh browser ini.',
          });
        }
      } catch (err: any) {
        console.warn('Camera error for element', elemId, err);
        showInAppNotice({
          tone: 'error',
          title: 'Gagal Mengakses Kamera',
          message: err?.message || 'Izin kamera ditolak.',
        });
      }
    }
  };

  // SCREEN CAPTURE CONTROL (getDisplayMedia)
  const handleToggleScreenCapture = async () => {
    const existingScreen = screenCaptureStreamRef.current;
    if (existingScreen) {
      existingScreen.getTracks().forEach((t) => t.stop());
      setScreenCaptureStream(null);
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
    } else {
      try {
        if (navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia) {
          const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: { frameRate: { ideal: 60 } },
            audio: true,
          });

          if (!isMountedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          setScreenCaptureStream(stream);
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = stream;
            screenVideoRef.current.play().catch(() => {});
          }
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.onended = () => {
              setScreenCaptureStream((current) => (current === stream ? null : current));
              if (screenVideoRef.current && screenVideoRef.current.srcObject === stream) {
                screenVideoRef.current.srcObject = null;
              }
            };
          }
        } else {
          showInAppNotice({
            tone: 'warn',
            title: 'Screen Capture Tidak Didukung',
            message: 'Screen capture getDisplayMedia tidak didukung di perangkat/browser ini.',
          });
        }
      } catch (err: any) {
        console.warn('Screen capture error:', err);
      }
    }
  };

  // MANUAL AUDIO FILE & PLAYBACK HANDLERS
  const handleManualAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedElement) return;

    const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const lowerName = file.name.toLowerCase();
    const isAudio = file.type.startsWith('audio/') || validExts.some((ext) => lowerName.endsWith(ext));

    if (!isAudio) {
      showInAppNotice({
        tone: 'warn',
        title: 'Format Audio Tidak Didukung',
        message: 'Harap pilih file audio MP3, WAV, OGG, M4A, atau AAC.',
      });
      e.target.value = '';
      return;
    }

    manualAudioFilesRef.current.set(selectedElement.id, file);
    setManualAudioFilesState((prev) => ({
      ...prev,
      [selectedElement.id]: {
        name: file.name,
        size: file.size,
        type: file.type || 'audio/mpeg',
      },
    }));

    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').trim();
    updateElementProperty(selectedElement.id, 'localFileName', file.name);
    updateElementProperty(selectedElement.id, 'localFileSize', file.size);
    updateElementProperty(selectedElement.id, 'audioSourceType', 'local');

    if (
      !selectedElement.properties.title ||
      selectedElement.properties.title === 'Audio Manual (BGM)' ||
      selectedElement.properties.title === 'Audio Manual Track'
    ) {
      updateElementProperty(selectedElement.id, 'title', cleanTitle);
    }

    e.target.value = '';
  };

  const handlePlayManualAudio = async () => {
    if (!selectedElement) return;
    const current = audioEngine.getState();
    const isCurrentTrack = current.currentTrackId === selectedElement.id;

    if (isCurrentTrack && isTestingAudio) {
      audioEngine.pause();
      setIsTestingAudio(false);
      return;
    }

    if (isCurrentTrack && !isTestingAudio && current.currentTime > 0) {
      await audioEngine.play();
      setIsTestingAudio(true);
      return;
    }

    const vol = (selectedElement.properties.volume ?? 85) / 100;
    audioEngine.setVolume(vol);
    audioEngine.setLoop(selectedElement.properties.loop !== false);

    const localFile = manualAudioFilesRef.current.get(selectedElement.id);
    if (localFile) {
      const trackTitle = selectedElement.properties.title || localFile.name;
      const channelLabel = (selectedElement.properties.channel || 'bgm').toUpperCase();
      const success = await audioEngine.loadAndPlayFile(
        selectedElement.id,
        trackTitle,
        `Manual Audio (${channelLabel})`,
        localFile
      );
      setIsTestingAudio(success);
    } else {
      const audioUrl =
        selectedElement.properties.audioUrl ||
        'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg';
      const trackTitle = selectedElement.properties.title || selectedElement.name;
      const channelLabel = (selectedElement.properties.channel || 'bgm').toUpperCase();
      const success = await audioEngine.loadAndPlayUrl(
        selectedElement.id,
        trackTitle,
        `Manual Audio (${channelLabel})`,
        audioUrl
      );
      setIsTestingAudio(success);
    }
  };

  const handleStopManualAudio = () => {
    audioEngine.stop();
    setIsTestingAudio(false);
  };

  // Add Element with strictly mapped auto-triggers and defaults
  const handleAddQuickElement = (type: SourceType, defaultName: string) => {
    if (isStrictModeBLocked) return;
    const uniqueId = `elem_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let defaultWidth = 80;
    let defaultHeight = 12;
    let defaultX = 10;
    let defaultY = 20 + (elements.length % 5) * 8;
    let defaultProps: Record<string, any> = {};
    let defaultTrigger: any = undefined;

    switch (type) {
      case 'camera':
        const cameraCount = elements.filter((e) => e.type === 'camera').length + 1;
        defaultName = `Kamera ${cameraCount} (${cameraCount === 1 ? 'Depan / Facecam' : 'Belakang / Tablecam'})`;
        defaultWidth = 42;
        defaultHeight = 24;
        defaultProps = {
          facingMode: cameraCount === 1 ? 'user' : 'environment',
          borderColor: '#F2C230',
          borderRadius: 14,
          borderWidth: 2,
          aspectFit: 'cover',
        };
        break;

      case 'screen_capture':
        defaultName = 'Tangkapan Layar (Game)';
        defaultWidth = 92;
        defaultHeight = 52;
        defaultProps = {
          cropMode: 'fit',
          fps: 60,
          borderRadius: 12,
        };
        break;

      case 'event_alert':
        defaultName = 'Alert Notifikasi (Gift & Follow)';
        defaultWidth = 86;
        defaultHeight = 14;
        defaultProps = {
          alertTitle: 'GIFT MAWAR EMAS',
          alertMessage: 'mengirim 500 Koin!',
          animationEffect: 'bounce',
          soundEffect: true,
          badgeColor: '#F59E0B',
        };
        defaultTrigger = {
          eventType: 'gift',
          action: 'bounce',
          durationSec: 5,
        };
        break;

      case 'chat_message':
        defaultName = 'Kotak Chat Interaktif';
        defaultWidth = 85;
        defaultHeight = 26;
        defaultProps = {
          maxMessages: 4,
          fontSize: 12,
          showBadges: true,
          bgOpacity: 85,
        };
        defaultTrigger = {
          eventType: 'chat',
          action: 'text_update',
          durationSec: 8,
        };
        break;

      case 'combo_counter':
        defaultName = 'Combo Gift Multiplier';
        defaultWidth = 45;
        defaultHeight = 12;
        defaultProps = {
          comboLabel: 'x50 COMBO MAWAR!',
          themeColor: '#EA580C',
        };
        defaultTrigger = {
          eventType: 'gift',
          action: 'pulse',
          durationSec: 4,
        };
        break;

      case 'counter':
      case 'live_viewer_counter':
        defaultName = 'Penghitung Like & Target';
        defaultWidth = 48;
        defaultHeight = 10;
        defaultProps = {
          targetGoal: 5000,
          label: 'Target Like Hari Ini',
        };
        defaultTrigger = {
          eventType: 'like',
          action: 'pulse',
          durationSec: 2,
        };
        break;

      case 'running_text':
        defaultName = 'Running Text (Ticker)';
        defaultWidth = 100;
        defaultHeight = 6;
        defaultProps = {
          text: '🔥 SYNTXRR STREAM: Selamat datang di siaran langsung! Follow & Tap Layar!',
          speed: 4,
          fontSize: 12,
          textColor: '#60A5FA',
          bgColor: '#0B1120',
        };
        break;

      case 'song_request':
        defaultName = 'Widget Song Request (Now Playing)';
        defaultWidth = 88;
        defaultHeight = 13;
        defaultProps = {
          cardStyle: 'compact',
          showRequester: true,
          showQueueCount: true,
        };
        defaultTrigger = {
          eventType: 'chat',
          action: 'pulse',
          durationSec: 4,
        };
        break;

      case 'audio':
        defaultName = 'Audio Manual (BGM)';
        defaultWidth = 65;
        defaultHeight = 12;
        defaultProps = {
          title: 'Audio Manual (BGM)',
          channel: 'bgm',
          volume: 85,
          loop: true,
          audioUrl: 'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg',
        };
        break;

      case 'image':
      case 'sticker':
        defaultName = 'Gambar / Logo Sponsor';
        defaultWidth = 28;
        defaultHeight = 16;
        defaultProps = {
          imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
          borderRadius: 8,
        };
        break;

      case 'video':
        defaultName = 'Video Background Loop';
        defaultWidth = 60;
        defaultHeight = 34;
        defaultProps = {
          loop: true,
          muted: true,
          videoUrl: '',
        };
        break;

      case 'text':
      case 'dynamic_text':
      default:
        defaultName = 'Teks Siaran';
        defaultWidth = 60;
        defaultHeight = 8;
        defaultProps = {
          text: 'STREAM TITLE HERE',
          fontSize: 18,
          textColor: '#FFFFFF',
        };
        break;
    }

    const newElem: StudioElement = {
      id: uniqueId,
      name: defaultName,
      type,
      x: defaultX,
      y: defaultY,
      width: defaultWidth,
      height: defaultHeight,
      layer: elements.length + 1,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: defaultProps,
      triggerConfig: defaultTrigger,
    };

    commitElements([...elements, newElem]);
    setSelectedGroupId(null);
    setSelectedId(newElem.id);
    setActiveSidePanel('properties');
  };

  const handleDuplicate = (id: string) => {
    if (isStrictModeBLocked || isElementLockedByGroup(id)) return;
    const target = elements.find((e) => e.id === id);
    if (!target) return;
    const clone: StudioElement = {
      ...target,
      id: `elem_${target.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${target.name} (Salinan)`,
      x: target.x + 3,
      y: target.y + 3,
      layer: elements.length + 1,
    };
    commitElements([...elements, clone]);
    setSelectedGroupId(null);
    setSelectedId(clone.id);
  };

  const handleDelete = (id: string) => {
    if (isStrictModeBLocked || isElementLockedByGroup(id)) return;
    if (activeCameraStreams[id]) {
      activeCameraStreams[id].getTracks().forEach((t) => t.stop());
      setActiveCameraStreams((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    const updated = elements.filter((e) => e.id !== id);
    commitElements(updated);
    if (selectedId === id) {
      setSelectedGroupId(null);
      setSelectedId(updated[0]?.id || null);
    }
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    if (isStrictModeBLocked || isElementLockedByGroup(id)) return;
    const index = elements.findIndex((e) => e.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === elements.length - 1) return;
    if (direction === 'down' && index === 0) return;

    const newIndex = direction === 'up' ? index + 1 : index - 1;
    const updated = [...elements];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;

    const reordered = updated.map((e, idx) => ({ ...e, layer: idx + 1 }));
    commitElements(reordered);
  };

  // UNIFIED POINTER DRAG & RESIZE SYSTEM (FIXES HORIZONTAL & VERTICAL MOVEMENT)
  const handleElementPointerDown = (e: React.PointerEvent, elem: StudioElement) => {
    if (elem.locked || isElementLockedByGroup(elem.id) || isStrictModeBLocked) return;
    if (e.button !== 0) return; // Only primary button
    e.stopPropagation();
    setSelectedGroupId(null);
    setSelectedId(elem.id);

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    preDragElementsRef.current = elementsRef.current;
    dragRef.current = {
      isDragging: true,
      isResizing: false,
      resizeHandle: null,
      elementId: elem.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: elem.x,
      origY: elem.y,
      origW: elem.width,
      origH: elem.height,
    };
  };

  const handleResizePointerDown = (e: React.PointerEvent, elem: StudioElement, handle: string) => {
    if (elem.locked || isElementLockedByGroup(elem.id) || isStrictModeBLocked) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedGroupId(null);
    setSelectedId(elem.id);

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    preDragElementsRef.current = elementsRef.current;
    dragRef.current = {
      isDragging: false,
      isResizing: true,
      resizeHandle: handle,
      elementId: elem.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: elem.x,
      origY: elem.y,
      origW: elem.width,
      origH: elem.height,
    };
  };

  const handleGroupPointerDown = (
    e: React.PointerEvent,
    group: StudioPresetGroup,
    mode: 'move' | 'resize',
    handle: string | null = null,
  ) => {
    if (e.button !== 0 || isPresetGroupLocked(group)) return;
    const bounds = getPresetGroupBounds(group, elementsRef.current);
    if (!bounds) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedGroupId(group.id);
    setSelectedId(null);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}

    const originalElements = elementsRef.current;
    preDragElementsRef.current = originalElements;
    groupTransformRef.current = {
      mode,
      group,
      pointerId: e.pointerId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: bounds,
      lastBounds: bounds,
      originalElements,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const groupTransform = groupTransformRef.current;
    if (groupTransform.mode && groupTransform.group && groupTransform.startBounds) {
      if (!canvasRef.current || (groupTransform.pointerId !== null && e.pointerId !== groupTransform.pointerId)) return;
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const deltaX = ((e.clientX - groupTransform.startX) / rect.width) * 100;
      const deltaY = ((e.clientY - groupTransform.startY) / rect.height) * 100;
      const start = groupTransform.startBounds;
      const target: PresetGroupBounds = { ...start };

      if (groupTransform.mode === 'move') {
        target.x = Math.round((start.x + deltaX) * 10) / 10;
        target.y = Math.round((start.y + deltaY) * 10) / 10;
      } else {
        const handle = groupTransform.handle || 'bottom-right';
        if (handle.includes('right')) {
          target.width = Math.max(5, Math.round((start.width + deltaX) * 10) / 10);
        }
        if (handle.includes('bottom')) {
          target.height = Math.max(3, Math.round((start.height + deltaY) * 10) / 10);
        }
        if (handle.includes('left')) {
          target.width = Math.max(5, Math.round((start.width - deltaX) * 10) / 10);
          target.x = Math.round((start.x + start.width - target.width) * 10) / 10;
        }
        if (handle.includes('top')) {
          target.height = Math.max(3, Math.round((start.height - deltaY) * 10) / 10);
          target.y = Math.round((start.y + start.height - target.height) * 10) / 10;
        }
      }

      const updated = transformPresetGroupElements(
        groupTransform.originalElements,
        groupTransform.group,
        groupTransform.originalElements,
        start,
        target,
      );
      elementsRef.current = updated;
      onUpdateElements(updated);
      groupTransform.lastBounds = target;
      isLiveDragRef.current = true;
      return;
    }

    if (!canvasRef.current || !dragRef.current.elementId) return;
    if (!dragRef.current.isDragging && !dragRef.current.isResizing) return;
    if (dragRef.current.pointerId !== null && e.pointerId !== dragRef.current.pointerId) return;

    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Accurate calculation relative to canvas screen dimensions
    // rect.width and rect.height already reflect zoom/scale on the viewport
    const deltaX = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const deltaY = ((e.clientY - dragRef.current.startY) / rect.height) * 100;

    if (dragRef.current.isDragging) {
      const newX = Math.round((dragRef.current.origX + deltaX) * 10) / 10;
      const newY = Math.round((dragRef.current.origY + deltaY) * 10) / 10;
      isLiveDragRef.current = true;
      updateElementLive(dragRef.current.elementId, { x: newX, y: newY });
    } else if (dragRef.current.isResizing) {
      const handle = dragRef.current.resizeHandle || 'bottom-right';
      let newW = dragRef.current.origW;
      let newH = dragRef.current.origH;
      let newX = dragRef.current.origX;
      let newY = dragRef.current.origY;

      if (handle.includes('right')) {
        newW = Math.max(5, Math.round((dragRef.current.origW + deltaX) * 10) / 10);
      }
      if (handle.includes('bottom')) {
        newH = Math.max(3, Math.round((dragRef.current.origH + deltaY) * 10) / 10);
      }
      if (handle.includes('left')) {
        const proposedW = Math.max(5, Math.round((dragRef.current.origW - deltaX) * 10) / 10);
        newX = Math.round((dragRef.current.origX + (dragRef.current.origW - proposedW)) * 10) / 10;
        newW = proposedW;
      }
      if (handle.includes('top')) {
        const proposedH = Math.max(3, Math.round((dragRef.current.origH - deltaY) * 10) / 10);
        newY = Math.round((dragRef.current.origY + (dragRef.current.origH - proposedH)) * 10) / 10;
        newH = proposedH;
      }

      isLiveDragRef.current = true;
      updateElementLive(dragRef.current.elementId, { x: newX, y: newY, width: newW, height: newH });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const groupTransform = groupTransformRef.current;
    if (groupTransform.mode && groupTransform.pointerId !== null && e.pointerId === groupTransform.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      const didTransform = isLiveDragRef.current;
      if (didTransform && preDragElementsRef.current) {
        const savedSnapshot = preDragElementsRef.current;
        setHistory((prev) => [...prev.slice(-15), savedSnapshot]);
        setRedoStack([]);
      }
      isLiveDragRef.current = false;
      preDragElementsRef.current = null;
      // App-level preset normalization recalculates Group bounds from the updated child elements,
      // including when this gesture is later undone or redone.
      groupTransformRef.current = {
        mode: null,
        group: null,
        pointerId: null,
        handle: null,
        startX: 0,
        startY: 0,
        startBounds: null,
        lastBounds: null,
        originalElements: [],
      };
      return;
    }

    if (dragRef.current.pointerId !== null && e.pointerId === dragRef.current.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      if (isLiveDragRef.current && preDragElementsRef.current) {
        const savedSnapshot = preDragElementsRef.current;
        isLiveDragRef.current = false;
        preDragElementsRef.current = null;
        setHistory((prev) => [...prev.slice(-15), savedSnapshot]);
        setRedoStack([]);
      }
      dragRef.current.isDragging = false;
      dragRef.current.isResizing = false;
      dragRef.current.elementId = null;
      dragRef.current.pointerId = null;
    }
  };

  // LOCAL MEDIA IMPORT HANDLERS (PERSISTED TO INDEXEDDB FOR STUDIO & MODE B NATIVE)
  const handleLocalImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaUploadError(null);
    setMediaModeBNotice(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMediaUploadError('File yang dipilih bukan format gambar yang valid.');
      return;
    }

    try {
      const saved = await StorageService.saveStudioMediaAsset({
        name: file.name,
        type: 'image',
        mimeType: file.type,
        blob: file,
      });
      const objUrl = URL.createObjectURL(file);
      createdObjectUrlsRef.current.set(saved.id, objUrl);

      const newItem: LocalMediaItem = {
        id: saved.id,
        assetId: saved.id,
        mimeType: saved.mimeType,
        name: saved.name,
        type: 'image',
        url: objUrl,
        sizeBytes: saved.sizeBytes,
        addedAt: saved.addedAt,
      };
      setMediaLibrary((prev) => [newItem, ...prev.filter((item) => item.id !== saved.id)]);
      setPreviewMediaUrl(objUrl);
      setPreviewMediaType('image');
      setPreviewAssetId(saved.id);
    } catch (err: any) {
      setMediaUploadError(err?.message || 'Gagal menyimpan file gambar ke penyimpanan lokal.');
    }
  };

  const handleLocalVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaUploadError(null);
    setMediaModeBNotice(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setMediaUploadError('File yang dipilih bukan format video yang valid.');
      return;
    }

    try {
      const saved = await StorageService.saveStudioMediaAsset({
        name: file.name,
        type: 'video',
        mimeType: file.type,
        blob: file,
      });
      const objUrl = URL.createObjectURL(file);
      createdObjectUrlsRef.current.set(saved.id, objUrl);

      const newItem: LocalMediaItem = {
        id: saved.id,
        assetId: saved.id,
        mimeType: saved.mimeType,
        name: saved.name,
        type: 'video',
        url: objUrl,
        sizeBytes: saved.sizeBytes,
        addedAt: saved.addedAt,
      };
      setMediaLibrary((prev) => [newItem, ...prev.filter((item) => item.id !== saved.id)]);
      setPreviewMediaUrl(objUrl);
      setPreviewMediaType('video');
      setPreviewAssetId(saved.id);

      if (saved.mimeType !== 'video/mp4') {
        setMediaModeBNotice(
          'Video tersimpan untuk pratinjau Studio. Untuk output native Mode B, gunakan video berformat MP4 (video/mp4).',
        );
      }
    } catch (err: any) {
      setMediaUploadError(err?.message || 'Gagal menyimpan file video ke penyimpanan lokal.');
    }
  };

  const handleDeleteLocalMediaAsset = async (item: LocalMediaItem) => {
    if (isStrictModeBLocked || !item.assetId) return;
    await StorageService.deleteStudioMediaAsset(item.assetId);
    const cachedUrl = createdObjectUrlsRef.current.get(item.assetId);
    if (cachedUrl) {
      try {
        URL.revokeObjectURL(cachedUrl);
      } catch {}
      createdObjectUrlsRef.current.delete(item.assetId);
    }
    setMediaLibrary((prev) => prev.filter((entry) => entry.id !== item.id));
    if (previewAssetId === item.assetId) {
      setPreviewMediaUrl(null);
      setPreviewAssetId(undefined);
    }
  };

  const handleAddMediaToCanvas = (item: LocalMediaItem) => {
    if (isStrictModeBLocked) return;
    const assetUri = item.assetId ? createStudioMediaAssetUri(item.assetId) : undefined;
    if (item.type === 'image') {
      const newElem: StudioElement = {
        id: `elem_image_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: item.name.slice(0, 24),
        type: 'image',
        x: 15,
        y: 25,
        width: 35,
        height: 20,
        layer: elements.length + 1,
        visible: true,
        locked: false,
        opacity: 100,
        rotation: 0,
        properties: {
          imageUrl: assetUri || item.url,
          ...(item.assetId ? { imageAssetId: item.assetId } : {}),
          borderRadius: 8,
        },
      };
      commitElements([...elements, newElem]);
      setSelectedGroupId(null);
      setSelectedId(newElem.id);
      setActiveSidePanel('properties');
    } else {
      const newElem: StudioElement = {
        id: `elem_video_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: item.name.slice(0, 24),
        type: 'video',
        x: 10,
        y: 20,
        width: 60,
        height: 35,
        layer: elements.length + 1,
        visible: true,
        locked: false,
        opacity: 100,
        rotation: 0,
        properties: {
          videoUrl: assetUri || item.url,
          ...(item.assetId ? { videoAssetId: item.assetId } : {}),
          loop: true,
          muted: true,
        },
      };
      commitElements([...elements, newElem]);
      setSelectedGroupId(null);
      setSelectedId(newElem.id);
      setActiveSidePanel('properties');
    }
  };

  const handleApplyMediaToSelectedElement = (url: string, assetId?: string) => {
    if (!selectedElement || isStrictModeBLocked || isElementLockedByGroup(selectedElement.id)) return;
    const assetUri = assetId ? createStudioMediaAssetUri(assetId) : undefined;
    const updated = elements.map((elem) => {
      if (elem.id !== selectedElement.id) return elem;
      const nextProps = { ...elem.properties };
      if (selectedElement.type === 'image' || selectedElement.type === 'sticker') {
        nextProps.imageUrl = assetUri || url;
        if (assetId) nextProps.imageAssetId = assetId;
        else delete nextProps.imageAssetId;
      } else if (selectedElement.type === 'video') {
        nextProps.videoUrl = assetUri || url;
        if (assetId) nextProps.videoAssetId = assetId;
        else delete nextProps.videoAssetId;
      }
      return { ...elem, properties: nextProps };
    });
    commitElements(updated);
  };

  // Event Simulator Emitter
  const triggerSimulation = (type: StreamEventType, user: string, detail: string, amount?: number) => {
    streamEventBus.emit({
      id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      username: user,
      detail,
      amount,
      timestamp: Date.now(),
      isSimulation: true,
    });
  };

  // Run explicit 7-Stage Song Request Test
  const handleRun7StageSongTest = () => {
    const query = testQueryInput.trim() || 'Lagu Test';
    const preview = songRequestEngine.execute7StageTestPipeline(query, 'Tester_Streamer', true);
    setActiveTestPipeline(preview);

    // Emit command into Mode A event bus so SongRequestEngine & live canvas widgets process it
    streamEventBus.emit({
      id: `sim_sr_${Date.now()}`,
      type: 'chat',
      username: 'Tester_Streamer',
      detail: `!play ${query}`,
      timestamp: Date.now(),
      isSimulation: true,
    });
  };

  // Preset Application
  const handleApplyPresetToScene = (preset: StudioPreset) => {
    if (onSelectPreset) {
      onSelectPreset(preset.id);
    } else {
      onChangeOrientation(preset.canvasOrientation);
      commitElements(ensureUniqueElementIds(preset.elements));
    }
  };

  // Filtered Sources from SOURCE_CATALOG
  const filteredSourcesList = SOURCE_CATALOG.filter((src) => {
    if (sourceCategoryFilter !== 'all' && src.category !== sourceCategoryFilter) return false;
    if (sourceSearchQuery.trim() !== '') {
      const q = sourceSearchQuery.toLowerCase();
      return src.name.toLowerCase().includes(q) || src.description.toLowerCase().includes(q);
    }
    return true;
  });

  // Filtered Marketplace Items
  const filteredMarketplaceList = (marketplaceItems || DEFAULT_MARKETPLACE_ITEMS).filter((item) => {
    if (marketplaceCategoryFilter !== 'all' && item.category !== marketplaceCategoryFilter) return false;
    if (marketplaceSearchQuery.trim() !== '') {
      const q = marketplaceSearchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleInstallMarketplacePack = (item: MarketplaceItem) => {
    if (isStrictModeBLocked) return;
    if (onInstallMarketplaceElements) {
      onInstallMarketplaceElements(item.elementsPayload);
    } else {
      const freshElements = item.elementsPayload.map((elem) => ({
        ...elem,
        id: `elem_${elem.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      }));
      commitElements([...elements, ...freshElements]);
    }
    setActiveSidePanel('properties');
  };

  const resolveStudioElementMediaSrc = (elem: StudioElement, kind: 'image' | 'video'): string => {
    const rawUrl = kind === 'video' ? elem.properties.videoUrl : elem.properties.imageUrl;
    const explicitAssetId =
      kind === 'video' ? elem.properties.videoAssetId : elem.properties.imageAssetId;
    const assetId =
      (typeof explicitAssetId === 'string' && explicitAssetId.trim()) ||
      getStudioMediaAssetIdFromUri(rawUrl);

    if (assetId) {
      const matched = mediaLibrary.find((m) => m.assetId === assetId || m.id === assetId);
      if (matched?.url) return matched.url;
      const cached = createdObjectUrlsRef.current.get(assetId);
      if (cached) return cached;
      return '';
    }
    return typeof rawUrl === 'string' ? rawUrl : '';
  };

  // Render Element on Canvas
  const renderElementContent = (elem: StudioElement) => {
    const isCameraActive = !!activeCameraStreams[elem.id];
    const reaction = activeReactions[elem.id];

    let animClass = '';
    if (reaction) {
      if (reaction.action === 'bounce') animClass = 'animate-bounce ring-4 ring-[var(--app-accent)] shadow-2xl';
      else if (reaction.action === 'pulse') animClass = 'animate-pulse ring-4 ring-[var(--app-accent)] shadow-2xl';
      else if (reaction.action === 'show') animClass = 'animate-fadeIn ring-2 ring-emerald-400';
    }

    switch (elem.type) {
      case 'camera':
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950 border relative overflow-hidden flex flex-col items-center justify-center transition-all ${animClass}`}
            style={{
              borderColor: elem.properties.borderColor || '#F2C230',
              borderRadius: `${elem.properties.borderRadius || 14}px`,
              borderWidth: `${elem.properties.borderWidth || 2}px`,
            }}
          >
            {isCameraActive ? (
              <video
                ref={(el) => {
                  videoRefs.current[elem.id] = el;
                  if (el && activeCameraStreams[elem.id] && el.srcObject !== activeCameraStreams[elem.id]) {
                    el.srcObject = activeCameraStreams[elem.id];
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 p-2 text-center select-none">
                <Camera className="w-6 h-6 text-[#F2C230] mb-1" />
                <span className="text-[10px] font-bold text-white truncate max-w-full px-1">{elem.name}</span>
                <span className="text-[9px] text-zinc-400">
                  {elem.properties.facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleCameraForElement(elem.id, elem.properties.facingMode);
                  }}
                  className="mt-1 px-2.5 py-1 rounded-md bg-[#F2C230] hover:bg-[#e0b220] text-zinc-950 text-[9px] font-bold"
                >
                  Aktifkan Feed
                </button>
              </div>
            )}
            <div
              className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold flex items-center gap-1 shadow ${
                isCameraActive ? 'bg-red-600/90 text-white' : 'bg-zinc-900/90 text-zinc-300 border border-zinc-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isCameraActive ? 'bg-white' : 'bg-[#F2C230]'}`} />
              {isCameraActive ? 'LIVE CAM' : 'STANDBY'}
            </div>
          </div>
        );

      case 'screen_capture':
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950 border border-zinc-700 relative overflow-hidden flex flex-col items-center justify-center ${animClass}`}
            style={{ borderRadius: `${elem.properties.borderRadius || 12}px` }}
          >
            {screenCaptureStream ? (
              <video
                ref={(el) => {
                  screenVideoRef.current = el;
                  if (el && screenCaptureStream && el.srcObject !== screenCaptureStream) {
                    el.srcObject = screenCaptureStream;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 p-3 text-center select-none">
                <Monitor className="w-8 h-8 text-rose-400 mb-1.5" />
                <span className="text-xs font-bold text-white">Tangkapan Layar Android</span>
                <span className="text-[9px] text-zinc-400 mt-0.5">MediaProjection 60 FPS</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleScreenCapture();
                  }}
                  className="mt-2 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold shadow"
                >
                  Mulai Screen Share
                </button>
              </div>
            )}
          </div>
        );

      case 'event_alert':
        return (
          <div
            className={`w-full h-full rounded-xl bg-gradient-to-r from-amber-950/95 via-zinc-900/95 to-amber-950/95 border-2 border-[#F2C230] p-2.5 flex items-center gap-3 shadow-2xl transition-all ${animClass}`}
          >
            <div className="w-8 h-8 rounded-lg bg-[#F2C230] flex items-center justify-center text-zinc-950 shrink-0 font-bold shadow-md">
              <Sparkles className="w-5 h-5 text-zinc-950" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-[#F2C230]">
                {elem.properties.alertTitle || 'GIFT RECEIVED!'}
              </div>
              <div className="text-xs font-black text-white truncate">
                {reaction?.textOverride || '@RizkyKing mengirim Paus Biru (2.150 Koin)!'}
              </div>
            </div>
          </div>
        );

      case 'chat_message':
        return (
          <div
            className={`w-full h-full p-2.5 space-y-1.5 overflow-hidden text-left bg-zinc-950/90 rounded-xl border border-zinc-800 transition-all ${animClass}`}
            style={{ backgroundColor: `rgba(12, 14, 18, ${(elem.properties.bgOpacity || 85) / 100})` }}
          >
            {recentChatList.map((chat) => (
              <div key={chat.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                {elem.properties.showBadges && chat.badge && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/20 text-[#F2C230] font-bold text-[8px]">
                    {chat.badge}
                  </span>
                )}
                <span className="font-bold text-[#F2C230]">@{chat.user}:</span>
                <span className="text-zinc-200 truncate">{chat.text}</span>
              </div>
            ))}
          </div>
        );

      case 'combo_counter':
        return (
          <div
            className={`w-full h-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 p-2 flex items-center justify-center gap-2 text-white shadow-xl transition-all ${animClass}`}
          >
            <Flame className="w-5 h-5 text-amber-200" />
            <span className="text-xs font-black tracking-wider">
              {elem.properties.comboLabel || 'x25 COMBO LOVE!'}
            </span>
          </div>
        );

      case 'counter':
      case 'live_viewer_counter':
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800 p-2 flex items-center justify-between text-xs px-3 transition-all ${animClass}`}
          >
            <div className="flex items-center gap-2 font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-mono text-sm">{simulatedLikes.toLocaleString('id-ID')}</span>
            </div>
            <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider">
              {elem.properties.label || 'Taps / Likes'}
            </span>
          </div>
        );

      case 'running_text':
        return (
          <div
            className="w-full h-full flex items-center overflow-hidden rounded px-2 border border-zinc-800"
            style={{ backgroundColor: elem.properties.bgColor || '#0F1115' }}
          >
            <div
              className="whitespace-nowrap animate-marquee text-[11px] font-bold"
              style={{
                color: elem.properties.textColor || '#F2C230',
                fontSize: `${elem.properties.fontSize || 12}px`,
                animationDuration: `${Math.max(1, 20 - (elem.properties.speed || 4) * 2)}s`,
              }}
            >
              {elem.properties.text || '🔥 SYNTXRR STREAM: Siaran Langsung TikTok & Multi-Platform'}
            </div>
          </div>
        );

      case 'song_request':
        return (
          <div
            className={`w-full h-full p-2.5 rounded-xl bg-zinc-950/95 border ${
              srState.lastError
                ? 'border-rose-500/60'
                : srState.isPlaying
                ? 'border-emerald-500/60'
                : 'border-[#F2C230]/50'
            } flex items-center gap-3 text-left transition-all ${animClass}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow ${
                srState.isPlaying ? 'bg-[#F2C230] text-zinc-950' : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              <Music className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[#F2C230] font-bold truncate">
                {srState.currentTrack?.title || 'Tidak ada lagu aktif'}
              </div>
              <div className="text-[8px] text-zinc-400 truncate flex items-center gap-1.5">
                <span>
                  {srState.isPlaying
                    ? 'Memutar'
                    : srState.playbackStatus === 'preparing'
                    ? 'Memuat...'
                    : srState.playbackStatus === 'error'
                    ? 'Error'
                    : srState.currentTrack
                    ? 'Dijeda'
                    : 'Idle'}
                </span>
                {elem.properties.showRequester && srState.currentTrack?.requester && (
                  <span>· @{srState.currentTrack.requester}</span>
                )}
                {elem.properties.showQueueCount !== false && (
                  <span className="px-1 py-0.2 rounded bg-zinc-900 text-[#F2C230] font-mono">
                    Antrean: {srState.queue.length}
                  </span>
                )}
              </div>
              {srState.lastError && (
                <div className="text-[8px] text-rose-400 truncate mt-0.5">
                  {srState.lastError}
                </div>
              )}
            </div>
          </div>
        );

      case 'lyrics': {
        const activeTitle = srState.currentTrack?.title || manualAudioTitle;
        const activeArtist = srState.currentTrack?.artist || manualAudioArtist;
        const customLyrics =
          typeof elem.properties.lyricsText === 'string'
            ? elem.properties.lyricsText.trim()
            : '';
        return (
          <div
            className={`w-full h-full p-2.5 rounded-xl bg-zinc-950/90 border border-violet-500/40 flex flex-col justify-center text-center transition-all ${animClass}`}
          >
            <div className="text-[9px] font-bold text-violet-300 truncate">
              {activeTitle
                ? `${activeTitle}${activeArtist ? ` — ${activeArtist}` : ''}`
                : 'Lyrics Widget (Menunggu lagu aktif)'}
            </div>
            <div className="text-[10px] text-zinc-300 mt-1 line-clamp-2">
              {customLyrics
                ? customLyrics
                : activeTitle
                ? 'Integrasi sumber lirik belum aktif — mengikuti metadata lagu aktif.'
                : 'Belum ada lagu aktif dari Song Request / Audio.'}
            </div>
          </div>
        );
      }

      case 'audio':
        return (
          <div
            className={`w-full h-full p-2.5 rounded-xl bg-zinc-950/95 border border-cyan-500/50 flex items-center gap-2.5 text-left transition-all ${animClass}`}
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-600/25 border border-cyan-500/50 flex items-center justify-center shrink-0 text-cyan-400 shadow">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-cyan-300 font-bold truncate">
                {elem.properties.title || elem.name || 'Audio Manual (BGM)'}
              </div>
              <div className="text-[8px] text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 font-mono uppercase text-[7px] font-bold">
                  {elem.properties.channel || 'bgm'}
                </span>
                {elem.properties.localFileName && (
                  <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 truncate max-w-[90px]">
                    📁 {elem.properties.localFileName}
                  </span>
                )}
                <span>Vol: {elem.properties.volume ?? 85}%</span>
                {elem.properties.loop !== false && <span className="text-cyan-400">↻ Loop</span>}
              </div>
            </div>
          </div>
        );

      case 'text':
      case 'dynamic_text':
        return (
          <div
            className={`w-full h-full flex items-center justify-center text-center font-bold px-2 select-none ${animClass}`}
            style={{
              color: elem.properties.textColor || '#FFFFFF',
              fontSize: `${elem.properties.fontSize || 16}px`,
            }}
          >
            {elem.properties.text || elem.name}
          </div>
        );

      case 'image':
      case 'sticker': {
        const resolvedImgSrc = resolveStudioElementMediaSrc(elem, 'image');
        return resolvedImgSrc ? (
          <img
            src={resolvedImgSrc}
            alt={elem.name}
            className={`w-full h-full object-contain rounded select-none pointer-events-none ${animClass}`}
          />
        ) : (
          <div className="w-full h-full rounded bg-zinc-900/90 border border-[#F2C230]/40 flex flex-col items-center justify-center text-[#F2C230]">
            <ImageIcon className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold">{elem.name}</span>
          </div>
        );
      }

      case 'video': {
        const resolvedVideoSrc = resolveStudioElementMediaSrc(elem, 'video');
        return resolvedVideoSrc ? (
          <video
            src={resolvedVideoSrc}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover rounded pointer-events-none"
          />
        ) : (
          <div className="w-full h-full rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center text-[#F2C230]">
            <Video className="w-6 h-6 mb-1" />
            <span className="text-[9px] font-bold">Video Background Loop</span>
          </div>
        );
      }

      default:
        return (
          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs font-semibold">
            {elem.name}
          </div>
        );
    }
  };

  const getCanvasAspectClass = () => {
    if (canvasOrientation === '9:16') {
      return isMonitorExpanded
        ? 'aspect-[9/16] w-[260px] sm:w-[320px]'
        : 'aspect-[9/16] w-[176px] sm:w-[270px] lg:w-[310px]';
    }
    if (canvasOrientation === '16:9') return 'aspect-video w-full max-w-[580px]';
    return isMonitorExpanded ? 'aspect-square w-[290px] sm:w-[320px]' : 'aspect-square w-[240px] sm:w-[300px]';
  };

  const filteredPresets = presets.filter((p) => {
    if (presetFilterCategory === 'favorites') return p.isFavorite;
    if (presetFilterCategory === 'all') return true;
    return p.category === presetFilterCategory;
  });

  // --- Preset Selector: filtered list for entry screen ---
  const selectorFilteredPresets = presets.filter((p) => {
    if (selectorFilterCategory === 'favorites') return p.isFavorite;
    if (selectorFilterCategory === 'all') return true;
    return p.category === selectorFilterCategory;
  });

  // --- Preset Selector: template generator (mirrors PresetManagerView) ---
  const generateTemplateElements = (template: 'blank' | 'gaming' | 'chatting' | 'music'): StudioElement[] => {
    if (template === 'gaming') {
      return [
        { id: `elem_screen_${Date.now()}`, name: 'Layar Game (Screen Capture)', type: 'screen_capture', x: 0, y: 20, width: 100, height: 56, layer: 1, visible: true, locked: true, opacity: 100, rotation: 0, properties: { fps: 60 } },
        { id: `elem_cam_${Date.now()}`, name: 'Facecam Bulat', type: 'camera', x: 6, y: 4, width: 28, height: 15, layer: 2, visible: true, locked: false, opacity: 100, rotation: 0, properties: { borderRadius: 16, borderColor: '#F2C230' } },
        { id: `elem_chat_${Date.now()}`, name: 'Live Chat Penonton', type: 'chat_message', x: 6, y: 78, width: 88, height: 20, layer: 3, visible: true, locked: false, opacity: 90, rotation: 0, properties: { maxMessages: 4 } },
      ];
    }
    if (template === 'chatting') {
      return [
        { id: `elem_cam_${Date.now()}`, name: 'Kamera Utama Full Frame', type: 'camera', x: 0, y: 0, width: 100, height: 100, layer: 1, visible: true, locked: true, opacity: 100, rotation: 0, properties: { facingMode: 'user' } },
        { id: `elem_chat_${Date.now()}`, name: 'Kotak Chat Kaca', type: 'chat_message', x: 6, y: 60, width: 88, height: 30, layer: 2, visible: true, locked: false, opacity: 85, rotation: 0, properties: { maxMessages: 6 } },
        { id: `elem_alert_${Date.now()}`, name: 'Alert Gift & Follow', type: 'event_alert', x: 10, y: 10, width: 80, height: 12, layer: 3, visible: true, locked: false, opacity: 100, rotation: 0, properties: { soundEnabled: true } },
      ];
    }
    if (template === 'music') {
      return [
        { id: `elem_song_${Date.now()}`, name: 'Now Playing Widget', type: 'song_request', x: 6, y: 40, width: 88, height: 16, layer: 2, visible: true, locked: false, opacity: 100, rotation: 0, properties: { showAlbumArt: true } },
        { id: `elem_chat_${Date.now()}`, name: 'Request Queue Chat', type: 'chat_message', x: 6, y: 65, width: 88, height: 25, layer: 3, visible: true, locked: false, opacity: 90, rotation: 0, properties: { maxMessages: 5 } },
      ];
    }
    return [];
  };

  // --- Preset Selector: handlers ---
  const handleSelectorSelectPreset = (presetId: string) => {
    if (onSelectPreset) onSelectPreset(presetId);
    setShowPresetSelector(false);
  };

  const handleSelectorBlankCanvas = () => {
    if (onUpdateElements) onUpdateElements([]);
    setShowPresetSelector(false);
  };

  const handleSelectorCreatePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectorPresetName.trim() || !onCreatePreset) return;
    const elements = generateTemplateElements(selectorTemplate);
    onCreatePreset({
      name: selectorPresetName.trim(),
      category: selectorCategory,
      canvasOrientation: selectorOrientation,
      elements,
      isFavorite: false,
      description: selectorDescription.trim() || 'Preset tata letak kustom SYNTXRR STREAM',
      thumbnailColor: '#F2C230',
    });
    setSelectorCreateModalOpen(false);
    setSelectorPresetName('');
    setSelectorDescription('');
    setShowPresetSelector(false);
  };

  const handleSelectorSaveRename = (presetId: string) => {
    if (editingNameInSelector.trim() && onRenamePreset) {
      onRenamePreset(presetId, editingNameInSelector.trim());
    }
    setEditingPresetIdInSelector(null);
  };

  const handleSidebarSaveRename = (presetId: string) => {
    if (editingNameInSidebar.trim() && onRenamePreset) {
      onRenamePreset(presetId, editingNameInSidebar.trim());
    }
    setEditingPresetIdInSidebar(null);
  };

  return (
    <div className="space-y-4 pb-6">
      {/* === PRESET SELECTION ENTRY SCREEN === */}
      {showPresetSelector ? (
        <div className="space-y-4">
          <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight truncate">
                  Pilih Preset Studio
                </h1>
                <span className="text-xs text-[var(--app-text-muted)] tabular-metrics whitespace-nowrap">
                  {presets.length} Tersimpan
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectorCreateModalOpen(true)}
                  disabled={isModeBMutationLocked}
                  className="btn-press min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Preset</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectorBlankCanvas}
                  disabled={isStrictModeBLocked}
                  className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] font-semibold text-xs inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Layout className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Kanvas Kosong</span>
                </button>
              </div>
            </div>

            <div className="pt-2.5 border-t border-[var(--app-border)] flex items-center gap-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'hp_screen', label: '9:16 HP' },
                  { id: 'landscape', label: '16:9 PC' },
                  { id: 'portrait', label: 'Portrait' },
                  { id: 'favorites', label: 'Favorit' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectorFilterCategory(cat.id)}
                  className={`btn-press min-h-[44px] px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                    selectorFilterCategory === cat.id
                      ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                      : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </header>

          {/* Selector Preset Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {selectorFilteredPresets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <div
                  key={preset.id}
                  className={`rounded-2xl border flex flex-col justify-between overflow-hidden transition-colors ${
                    isActive
                      ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)]'
                      : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)] tabular-metrics">
                          <span className="inline-flex items-center gap-1">
                            {preset.canvasOrientation === '9:16' && <Smartphone className="w-3 h-3" />}
                            {preset.canvasOrientation === '16:9' && <Monitor className="w-3 h-3" />}
                            {preset.canvasOrientation === '1:1' && <Square className="w-3 h-3" />}
                            <span>{preset.canvasOrientation}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{preset.elements.length} elemen</span>
                          {isActive && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-[var(--app-ok)]">Aktif</span>
                            </>
                          )}
                        </div>

                        {editingPresetIdInSelector === preset.id ? (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <input
                              type="text"
                              value={editingNameInSelector}
                              onChange={(e) => setEditingNameInSelector(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSelectorSaveRename(preset.id);
                                if (e.key === 'Escape') setEditingPresetIdInSelector(null);
                              }}
                              className="flex-1 min-w-[130px] min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-accent)] rounded-xl px-3 text-xs text-[var(--app-text)] focus:outline-none font-bold"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSelectorSaveRename(preset.id)}
                              className="btn-press min-h-[44px] px-3 bg-[var(--app-accent)] text-[var(--app-accent-ink)] text-xs rounded-xl font-bold shrink-0"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPresetIdInSelector(null)}
                              className="btn-press min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs rounded-xl shrink-0"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-0.5">
                            <h2 className="text-sm sm:text-base font-display font-bold text-[var(--app-text)] tracking-tight truncate">
                              {preset.name}
                            </h2>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPresetIdInSelector(preset.id);
                                setEditingNameInSelector(preset.name);
                              }}
                              className="min-h-[44px] min-w-[44px] -my-2 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] flex items-center justify-center shrink-0"
                              aria-label={`Ubah nama ${preset.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleFavoritePreset?.(preset.id)}
                        aria-label="Toggle favorit preset"
                        className="btn-press min-h-[44px] min-w-[44px] -mt-1 -mr-1 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] hover:bg-[var(--app-surface-muted)] flex items-center justify-center shrink-0"
                      >
                        <Star className={`w-4 h-4 ${preset.isFavorite ? 'fill-[var(--app-accent)] text-[var(--app-accent)]' : ''}`} />
                      </button>
                    </div>

                    <p className="text-xs text-[var(--app-text-muted)] line-clamp-2 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>

                  <div className="px-4 py-3 bg-[var(--app-surface-muted)] border-t border-[var(--app-border)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onDuplicatePreset?.(preset.id)}
                        disabled={isModeBMutationLocked}
                        className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Duplikasi"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {presets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeletePreset?.(preset.id)}
                          disabled={isModeBMutationLocked}
                          className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:bg-rose-950/60 text-[var(--app-text-muted)] hover:text-rose-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectorSelectPreset(preset.id)}
                      className={`btn-press min-h-[44px] px-4 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isActive
                          ? 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
                          : 'bg-[var(--app-surface)] hover:bg-[var(--app-accent)] hover:text-[var(--app-accent-ink)] border border-[var(--app-border-strong)] text-[var(--app-text)]'
                      }`}
                    >
                      <span>{isActive ? 'Muat ke Studio' : 'Gunakan Preset'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selector: Create Preset Modal */}
          {selectorCreateModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-[var(--app-shadow)] space-y-4 anim-pop-in">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--app-border)]">
                  <div className="flex items-center gap-2">
                    <Layout className="w-5 h-5 text-[var(--app-accent-text)]" />
                    <h3 className="text-base font-display font-bold text-[var(--app-text)]">Buat Preset Studio Baru</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectorCreateModalOpen(false)}
                    aria-label="Tutup modal preset"
                    className="btn-press min-h-[44px] min-w-[44px] -mr-2 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSelectorCreatePreset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">Nama Preset</label>
                    <input
                      type="text"
                      value={selectorPresetName}
                      onChange={(e) => setSelectorPresetName(e.target.value)}
                      placeholder="Misal: Mobile Gaming Pro, TikTok Live Malam"
                      required
                      className="w-full min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl px-3.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">Orientasi Kanvas</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: '9:16', label: '9:16 HP', icon: <Smartphone className="w-4 h-4 mx-auto mb-1" /> },
                          { id: '16:9', label: '16:9 Wide', icon: <Monitor className="w-4 h-4 mx-auto mb-1" /> },
                          { id: '1:1', label: '1:1 Square', icon: <Square className="w-4 h-4 mx-auto mb-1" /> },
                        ] as const
                      ).map((orient) => (
                        <button
                          key={orient.id}
                          type="button"
                          onClick={() => {
                            setSelectorOrientation(orient.id);
                            if (orient.id === '9:16') setSelectorCategory('hp_screen');
                            else if (orient.id === '16:9') setSelectorCategory('landscape');
                            else setSelectorCategory('portrait');
                          }}
                          className={`btn-press min-h-[58px] p-2.5 rounded-xl text-center text-xs font-bold border transition-colors ${
                            selectorOrientation === orient.id
                              ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-accent-ink)]'
                              : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                          }`}
                        >
                          {orient.icon}
                          <span>{orient.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">Pilihan Template</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'gaming', label: 'Mobile Gaming', desc: 'Screen + Facecam + Chat' },
                          { id: 'chatting', label: 'Just Chatting', desc: 'Kamera + Alert + Chat' },
                          { id: 'music', label: 'Music Stream', desc: 'Now Playing + Chat' },
                          { id: 'blank', label: 'Kanvas Kosong', desc: 'Mulai dari nol' },
                        ] as const
                      ).map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => setSelectorTemplate(tmpl.id)}
                          className={`btn-press min-h-[56px] p-2.5 rounded-xl text-left border transition-colors ${
                            selectorTemplate === tmpl.id
                              ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent)] text-[var(--app-text)]'
                              : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                          }`}
                        >
                          <div className="text-xs font-bold text-[var(--app-text)]">{tmpl.label}</div>
                          <div className="text-[10px] text-[var(--app-text-muted)] mt-0.5">{tmpl.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[var(--app-text-secondary)]">Deskripsi (Opsional)</label>
                    <textarea
                      value={selectorDescription}
                      onChange={(e) => setSelectorDescription(e.target.value)}
                      placeholder="Keterangan singkat tentang preset ini..."
                      rows={2}
                      className="w-full bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl px-3.5 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectorCreateModalOpen(false)}
                      className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs font-semibold hover:text-[var(--app-text)]"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="btn-press min-h-[44px] px-5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold"
                    >
                      Simpan &amp; Buat Preset
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : (
      /* === MAIN STUDIO CANVAS VIEW === */
      <>
      {/* Compact Studio Toolbar Header */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3 sm:px-4 sm:py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setShowPresetSelector(true)}
            className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            title="Ganti Preset"
          >
            <Layout className="w-4 h-4 text-[var(--app-accent-text)]" />
            <span>Preset</span>
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)] tracking-tight truncate">
              {activePreset?.name || 'Studio Produksi'}
            </h1>
            <div className="text-[11px] text-[var(--app-text-muted)] tabular-metrics truncate">
              {canvasOrientation} · {elements.length} elemen
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-xs font-bold">
            {(
              [
                { id: '9:16', label: '9:16' },
                { id: '16:9', label: '16:9' },
                { id: '1:1', label: '1:1' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={isModeBMutationLocked}
                onClick={() => onChangeOrientation(opt.id)}
                className={`btn-press min-h-[44px] px-2.5 sm:px-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  canvasOrientation === opt.id
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                    : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isModeBMutationLocked}
            onClick={onSaveAsPreset}
            className="btn-press min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>Simpan Preset</span>
          </button>
        </div>
      </header>

      {/* Mode B Active Status / Lock / Live Apply Banner */}
      {isModeBSelected && isModeBMutationLocked && (
        <div
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isModeBLive
              ? 'bg-[var(--app-ok-soft)] border-emerald-500/35 text-[var(--app-text)]'
              : 'bg-[var(--app-warn-soft)] border-amber-500/35 text-[var(--app-text)]'
          }`}
        >
          <div className="space-y-1 text-xs">
            <div className={`font-bold flex items-center gap-2 ${isModeBLive ? 'text-[var(--app-ok)]' : 'text-[var(--app-warn)]'}`}>
              <Lock className="w-4 h-4 shrink-0" />
              {isModeBLive
                ? 'Mode B sedang LIVE — Orientasi & Struktur Preset Dikunci'
                : `Mode B sedang sibuk (${modeBStatus?.status || 'transisi'}) — Mutasi Kanvas Dikunci Sementara`}
            </div>
            <p className="text-[11px] text-[var(--app-text-secondary)] leading-relaxed">
              {isModeBLive
                ? 'Anda tetap dapat menyesuaikan overlay/teks/layar tunggu atau memilih preset statis yang kompatibel, lalu tekan "Terapkan Perubahan ke LIVE" untuk mengirim ke encoder native.'
                : 'Mutasi struktur kanvas dan preset diblokir sementara selama Mode B memulai, menghentikan, atau meminta ulang Screen Share.'}
            </p>
            {modeBLiveApplyFeedback && (
              <div
                className={`text-[11px] font-semibold pt-0.5 ${
                  modeBLiveApplyFeedback.success ? 'text-[var(--app-ok)]' : 'text-[var(--app-warn)]'
                }`}
              >
                {modeBLiveApplyFeedback.message}
              </div>
            )}
          </div>
          {isModeBLive && onApplyLiveSceneToModeB && (
            <button
              type="button"
              disabled={isModeBActionPending}
              onClick={async () => {
                const res = await onApplyLiveSceneToModeB(elements, activePreset);
                setModeBLiveApplyFeedback(res);
              }}
              className="btn-press shrink-0 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isModeBActionPending ? 'Menerapkan...' : 'Terapkan Perubahan ke LIVE'}
            </button>
          )}
        </div>
      )}

      {/* Main Studio Viewport Split (Canvas on Left, Consolidated Panel on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* SECTION 1: CANVAS EDITOR */}
        <div
          className="lg:col-span-7 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-between space-y-3 overscroll-y-contain"
          style={{ overscrollBehaviorY: 'contain' }}
        >
          {/* Viewport Toolbar */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--app-text-secondary)] border-b border-[var(--app-border)] pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[var(--app-accent)] shrink-0" />
              <span className="font-bold text-[var(--app-text)] tabular-metrics truncate">
                Kanvas {canvasOrientation} ({elements.length})
              </span>
              <button
                type="button"
                onClick={() => setIsMonitorExpanded((v) => !v)}
                className="lg:hidden min-h-[36px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] font-semibold text-[var(--app-text-secondary)]"
              >
                {isMonitorExpanded ? 'Ringkas' : 'Perbesar'}
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0}
                className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>

              <div className="h-5 w-px bg-[var(--app-border)] mx-0.5" />

              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="tabular-metrics text-[11px] px-1 text-[var(--app-text)]">{zoomLevel}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(180, z + 10))}
                className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomLevel(100);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center"
                title="Reset Posisi & Zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Screen Stage Container */}
          <div
            className={`w-full overflow-hidden flex items-center justify-center p-2 sm:p-3 bg-[var(--app-bg)] rounded-xl border border-[var(--app-border)] relative select-none overscroll-y-contain ${
              isMonitorExpanded ? 'min-h-[380px] sm:min-h-[460px]' : 'min-h-[290px] sm:min-h-[400px] lg:min-h-[470px]'
            }`}
            style={{
              touchAction: 'none',
              overscrollBehaviorY: 'contain',
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setIsPanning(true);
                panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
              }
            }}
            onMouseMove={(e) => {
              if (isPanning) {
                setPanOffset({
                  x: e.clientX - panStartRef.current.x,
                  y: e.clientY - panStartRef.current.y,
                });
              }
            }}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
          >
            {/* The Actual Canvas (Orientation Scaled) */}
            <div
              ref={canvasRef}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
                touchAction: 'none',
                overscrollBehaviorY: 'contain',
              }}
              className={`relative bg-[#07080A] border-2 border-[var(--app-border-strong)] rounded-2xl shadow-2xl transition-transform duration-75 overflow-hidden ${getCanvasAspectClass()} overscroll-y-contain`}
              onClick={() => {
                setSelectedId(null);
                setSelectedGroupId(null);
              }}
            >
              {/* Safe-Zone Guide Margins for TikTok / Live Stream */}
              <div className="absolute inset-x-2 top-2 h-6 border border-dashed border-[var(--app-accent-border)] rounded flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-[var(--app-accent)]/60">SAFE ZONE HEADER</span>
              </div>
              <div className="absolute inset-x-2 bottom-2 h-8 border border-dashed border-rose-500/30 rounded flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-rose-400/60">SAFE ZONE FOOTER</span>
              </div>

              {/* Elements Layer Rendering with UNIFIED POINTER EVENTS */}
              {elements.map((elem) => {
                if (!elem.visible || isElementHiddenByGroup(elem.id)) return null;
                const isSelected = selectedId === elem.id;

                return (
                  <div
                    key={elem.id}
                    onPointerDown={(e) => handleElementPointerDown(e, elem)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{
                      position: 'absolute',
                      left: `${elem.x}%`,
                      top: `${elem.y}%`,
                      width: `${elem.width}%`,
                      height: `${elem.height}%`,
                      zIndex: elem.layer,
                      opacity: elem.opacity / 100,
                      transform: `rotate(${elem.rotation}deg)`,
                      touchAction: 'none',
                      userSelect: 'none',
                    }}
                    className={`group cursor-move transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-[var(--app-accent)] ring-offset-1 ring-offset-black'
                        : 'hover:ring-1 hover:ring-[var(--app-accent)]/60'
                    }`}
                  >
                    {renderElementContent(elem)}

                    {isSelected && !elem.locked && !isElementLockedByGroup(elem.id) && (
                      <>
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'bottom-right')}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-[var(--app-accent)] border-2 border-white rounded-full cursor-se-resize shadow-md z-30"
                          title="Resize Sudut Kanan-Bawah"
                        />
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'top-right')}
                          style={{ touchAction: 'none' }}
                          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--app-accent)] border border-white rounded-full cursor-ne-resize shadow-sm z-30"
                          title="Resize Sudut Kanan-Atas"
                        />
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'bottom-left')}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--app-accent)] border border-white rounded-full cursor-sw-resize shadow-sm z-30"
                          title="Resize Sudut Kiri-Bawah"
                        />
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'top-left')}
                          style={{ touchAction: 'none' }}
                          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--app-accent)] border border-white rounded-full cursor-nw-resize shadow-sm z-30"
                          title="Resize Sudut Kiri-Atas"
                        />
                      </>
                    )}

                    {isSelected && (
                      <div className="absolute -top-4 left-0 px-1.5 py-0.2 bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-mono text-[8px] rounded uppercase font-bold tracking-wider pointer-events-none">
                        {elem.name}
                      </div>
                    )}
                  </div>
                );
              })}

              {selectedGroup && selectedGroupBounds && (
                <div
                  className="absolute border-2 border-[var(--app-accent)] rounded-sm pointer-events-none"
                  style={{
                    left: `${selectedGroupBounds.x}%`,
                    top: `${selectedGroupBounds.y}%`,
                    width: `${selectedGroupBounds.width}%`,
                    height: `${selectedGroupBounds.height}%`,
                    zIndex: 10000,
                  }}
                >
                  <div
                    onPointerDown={(e) => handleGroupPointerDown(e, selectedGroup, 'move')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onClick={(e) => e.stopPropagation()}
                    style={{ pointerEvents: 'auto', touchAction: 'none' }}
                    className="absolute -top-6 left-0 px-2 py-1 rounded-t-md bg-[var(--app-accent)] text-[var(--app-accent-ink)] text-[9px] font-bold whitespace-nowrap cursor-move select-none"
                    title={selectedGroupIsLocked ? 'Grup terkunci; buka kunci untuk memindahkan' : 'Seret untuk memindahkan seluruh grup'}
                  >
                    <Move className="w-3 h-3 inline mr-1" />
                    {selectedGroup.name}{selectedGroupIsLocked ? ' · TERKUNCI' : ' · PINDAHKAN'}
                  </div>
                  {!selectedGroupIsLocked && (
                    <>
                      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((handle) => (
                        <div
                          key={handle}
                          onPointerDown={(e) => handleGroupPointerDown(e, selectedGroup, 'resize', handle)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                          onClick={(e) => e.stopPropagation()}
                          style={{ pointerEvents: 'auto', touchAction: 'none' }}
                          className={`absolute w-3.5 h-3.5 bg-[var(--app-accent)] border-2 border-white rounded-full shadow-md ${
                            handle.includes('top') ? '-top-2' : '-bottom-2'
                          } ${handle.includes('left') ? '-left-2' : '-right-2'} ${
                            handle === 'top-left' || handle === 'bottom-right' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                          }`}
                          title={`Ubah ukuran grup (${handle})`}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--app-text-muted)] px-1">
            <span>Geser elemen bebas horizontal &amp; vertikal.</span>
            <span className="tabular-metrics text-[var(--app-accent-text)] font-semibold">1080p Produksi</span>
          </div>
        </div>

        {/* SECTION 2-6: CONSOLIDATED STUDIO TOOL PANEL */}
        <div className="lg:col-span-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl overflow-hidden flex flex-col">
          {/* Main Module Tabs (Properties, Elements, Sources, Presets, Media, Layers, Simulator, Marketplace) */}
          <div
            className="flex overflow-x-auto no-scrollbar gap-1 p-1.5 bg-[var(--app-surface-muted)]/70 border-b border-[var(--app-border)] text-[11px] font-semibold select-none shrink-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <button
              type="button"
              onClick={() => setActiveSidePanel('properties')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'properties'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span>Properti</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('elements')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'elements'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Elemen</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('sources')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'sources'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <Box className="w-3.5 h-3.5 shrink-0" />
              <span>Sumber</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('presets')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'presets'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span>Preset</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('media')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'media'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
              <span>Media</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('layers')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'layers'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Lapisan</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('simulator')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[76px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'simulator'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span>Uji Live</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSidePanel('marketplace')}
              className={`btn-press min-h-[44px] shrink-0 px-3 min-w-[88px] rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 ${
                activeSidePanel === 'marketplace'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span>Marketplace</span>
            </button>
          </div>

          <div className="p-4 sm:p-5 flex-1">
          {/* TAB 1: CONTEXTUAL PROPERTIES PANEL */}
          {activeSidePanel === 'properties' && (
            <div className="divide-y divide-[var(--app-border)]">
              {selectedElement ? (
                <>
                  <div className="pb-3.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--app-accent)] shrink-0" />
                        <span className="truncate">{selectedElement.name}</span>
                      </div>
                      <div className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics mt-0.5">
                        Tipe: {selectedElement.type} · Layer #{selectedElement.layer}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateElementField(selectedElement.id, 'visible', !selectedElement.visible)}
                        className={`btn-press min-h-[44px] min-w-[44px] rounded-xl border text-xs flex items-center justify-center transition-colors ${
                          selectedElement.visible
                            ? 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                            : 'bg-[var(--app-error-soft)] border-rose-500/35 text-[var(--app-error)]'
                        }`}
                        title={selectedElement.visible ? 'Sembunyikan' : 'Tampilkan'}
                      >
                        {selectedElement.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateElementField(selectedElement.id, 'locked', !selectedElement.locked)}
                        className={`btn-press min-h-[44px] min-w-[44px] rounded-xl border text-xs flex items-center justify-center transition-colors ${
                          selectedElement.locked
                            ? 'bg-[var(--app-warn-soft)] border-amber-500/35 text-[var(--app-warn)]'
                            : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                        }`}
                        title={selectedElement.locked ? 'Buka Kunci' : 'Kunci Posisi'}
                      >
                        {selectedElement.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(selectedElement.id)}
                        className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center transition-colors"
                        title="Duplikasi Elemen"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedElement.id)}
                        className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-[var(--app-error)] hover:border-rose-500 flex items-center justify-center transition-colors"
                        title="Hapus Elemen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Contextual Form Body strictly tailored to Selected Type */}
                  <div className="divide-y divide-[var(--app-border)] max-h-[460px] overflow-y-auto pr-1">
                    {/* Camera */}
                    {selectedElement.type === 'camera' && (
                      <div className="py-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <Camera className="w-4 h-4" /> Sumber Kamera Siaran
                          </span>
                          <span className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics">Multi-Camera Ready</span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Pilihan Lensa / Arah Kamera</label>
                          <select
                            value={selectedElement.properties.facingMode || 'user'}
                            onChange={(e) => {
                              const facing = e.target.value as 'user' | 'environment';
                              updateElementProperty(selectedElement.id, 'facingMode', facing);
                              if (activeCameraStreams[selectedElement.id]) {
                                handleToggleCameraForElement(selectedElement.id, facing);
                              }
                            }}
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          >
                            <option value="user">Kamera Depan (Facecam / Selfie)</option>
                            <option value="environment">Kamera Belakang (Handcam / Meja)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-[var(--app-text-secondary)]">Uji Live Feed Kamera:</span>
                          <button
                            type="button"
                            onClick={() => handleToggleCameraForElement(selectedElement.id, selectedElement.properties.facingMode)}
                            className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                              activeCameraStreams[selectedElement.id]
                                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                : 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {activeCameraStreams[selectedElement.id] ? 'Matikan Kamera' : 'Aktifkan Kamera'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Warna Border</label>
                            <input
                              type="color"
                              value={selectedElement.properties.borderColor || '#F2C230'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderColor', e.target.value)}
                              className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Radius Sudut (px)</label>
                            <input
                              type="number"
                              value={selectedElement.properties.borderRadius || 14}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderRadius', parseInt(e.target.value) || 0)}
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen Capture */}
                    {selectedElement.type === 'screen_capture' && (
                      <div className="py-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--app-error)] flex items-center gap-1.5">
                            <Monitor className="w-4 h-4" /> Tangkapan Layar HP (Game Capture)
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--app-text-secondary)] leading-relaxed">
                          Menangkap feed game Android atau tampilan layar dengan MediaProjection 60 FPS.
                        </p>
                        <div className="pl-3 border-l-2 border-rose-500/50 text-[11px] text-[var(--app-text-secondary)] space-y-1">
                          <div>
                            <strong className="text-[var(--app-error)]">Aturan Mode B RTMP:</strong> Layer Tangkapan Layar harus berada di lapisan paling bawah (Layer #1 / di bawah semua overlay).
                          </div>
                          <div>
                            Crop Mode aktif: <span className="tabular-metrics text-[var(--app-text)] font-medium">Fit</span> · Rotasi didukung: <span className="tabular-metrics text-[var(--app-text)] font-medium">0° / 90° / 180° / 270°</span>.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleScreenCapture}
                          className="btn-press w-full min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors bg-rose-600 hover:bg-rose-500 text-white"
                        >
                          <Monitor className="w-4 h-4" />
                          {screenCaptureStream ? 'Hentikan Screen Share' : 'Mulai Screen Share (getDisplayMedia)'}
                        </button>
                      </div>
                    )}

                    {/* Event Alert */}
                    {selectedElement.type === 'event_alert' && (
                      <div className="py-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--app-warn)] flex items-center gap-1.5">
                            <Bell className="w-4 h-4" /> Auto-Trigger: Alert Notifikasi
                          </span>
                          <span className="text-[10px] text-[var(--app-warn)] font-bold">Auto-Mapped</span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Pemicu Event</label>
                          <select
                            value={selectedElement.triggerConfig?.eventType || 'gift'}
                            onChange={(e) => updateElementTrigger(selectedElement.id, { eventType: e.target.value })}
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          >
                            <option value="gift">Gift / Hadiah Penonton (Default)</option>
                            <option value="follow">Follower Baru</option>
                            <option value="donation">Donasi Saweria</option>
                            <option value="all">Semua Event Live</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Judul Banner Default</label>
                          <input
                            type="text"
                            value={selectedElement.properties.alertTitle || 'GIFT RECEIVED!'}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'alertTitle', e.target.value)}
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] font-bold text-[var(--app-text-secondary)]">
                            <span>Durasi Muncul (Detik)</span>
                            <span className="tabular-metrics text-[var(--app-accent-text)]">
                              {selectedElement.triggerConfig?.durationSec || 5}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="20"
                            value={selectedElement.triggerConfig?.durationSec || 5}
                            onChange={(e) => updateElementTrigger(selectedElement.id, { durationSec: parseInt(e.target.value) })}
                            className="w-full mt-2 accent-[var(--app-accent)] cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {/* Chat Message */}
                    {selectedElement.type === 'chat_message' && (
                      <div className="py-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4" /> Auto-Trigger: Live Chatbox
                          </span>
                          <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Live Feed</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Maks. Pesan</label>
                            <input
                              type="number"
                              min="2"
                              max="10"
                              value={selectedElement.properties.maxMessages || 4}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'maxMessages', parseInt(e.target.value) || 4)}
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Opasitas Latar (%)</label>
                            <input
                              type="number"
                              min="10"
                              max="100"
                              value={selectedElement.properties.bgOpacity || 85}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'bgOpacity', parseInt(e.target.value) || 85)}
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-[var(--app-text-secondary)]">Tampilkan Lencana VIP / Sub</span>
                          <button
                            type="button"
                            onClick={() => updateElementProperty(selectedElement.id, 'showBadges', !selectedElement.properties.showBadges)}
                            className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                              selectedElement.properties.showBadges !== false
                                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                            }`}
                          >
                            {selectedElement.properties.showBadges !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Image / Video / Media Replacement */}
                    {(selectedElement.type === 'image' || selectedElement.type === 'sticker' || selectedElement.type === 'video') && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-[var(--app-ok)] flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4" /> Sumber Media (Lokal &amp; URL)
                        </span>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                            {selectedElement.type === 'video' ? 'URL Video (MP4/WebM)' : 'URL Gambar (PNG/JPG)'}
                          </label>
                          <input
                            type="text"
                            value={selectedElement.type === 'video' ? selectedElement.properties.videoUrl || '' : selectedElement.properties.imageUrl || ''}
                            onChange={(e) => {
                              if (selectedElement.type === 'video') {
                                updateElementProperty(selectedElement.id, 'videoUrl', e.target.value);
                              } else {
                                updateElementProperty(selectedElement.id, 'imageUrl', e.target.value);
                              }
                            }}
                            placeholder="https://... atau ganti dari tab Media"
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveSidePanel('media')}
                          className="btn-press w-full min-h-[44px] bg-[var(--app-ok-soft)] hover:border-emerald-500 border border-emerald-500/35 text-[var(--app-ok)] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <FolderOpen className="w-4 h-4" /> Pilih dari Media Library Lokal
                        </button>
                      </div>
                    )}

                    {/* Song Request Widget Inspector */}
                    {selectedElement.type === 'song_request' && (
                      <div className="py-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <ListMusic className="w-4 h-4" /> Song Request Live Display
                          </span>
                          <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Mode A Engine</span>
                        </div>

                        <p className="text-[11px] text-[var(--app-text-secondary)]">
                          Widget ini terhubung langsung ke subsistem Song Request Mode A (!play &amp; !next) dan status pemutaran sebenarnya.
                        </p>

                        <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-[var(--app-text)] truncate">
                              {srState.currentTrack?.title || 'Tidak ada lagu aktif'}
                            </div>
                            <div className="text-[10px] text-[var(--app-accent-text)] truncate tabular-metrics">
                              {srState.currentTrack
                                ? `Req: @${srState.currentTrack.requester} · ${srState.playbackStatus}`
                                : `Antrean: ${srState.queue.length} lagu`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                void songRequestEngine.togglePlayPause();
                              }}
                              className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-accent)] text-[var(--app-accent-ink)] flex items-center justify-center"
                              title={srState.isPlaying ? 'Jeda' : 'Putar'}
                            >
                              {srState.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void songRequestEngine.skipTrack('Streamer');
                              }}
                              className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center"
                              title="Skip Lagu (!next)"
                            >
                              <FastForward className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {srState.lastError && (
                          <div className="p-2.5 rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-[11px] text-[var(--app-error)]">
                            {srState.lastError}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-[var(--app-text-secondary)]">Tampilkan Nama Pengirim Request</span>
                          <button
                            type="button"
                            onClick={() => updateElementProperty(selectedElement.id, 'showRequester', !selectedElement.properties.showRequester)}
                            className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold ${
                              selectedElement.properties.showRequester !== false
                                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                            }`}
                          >
                            {selectedElement.properties.showRequester !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Lyrics Widget Inspector */}
                    {selectedElement.type === 'lyrics' && (
                      <div className="py-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <Music className="w-4 h-4" /> Lyrics Display (Integrasi Terpisah)
                          </span>
                          <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Follows Track</span>
                        </div>
                        <p className="text-[11px] text-[var(--app-text-secondary)]">
                          Mengikuti lagu aktif dari Song Request / Local Audio ({srState.currentTrack?.title || manualAudioTitle || 'Belum ada lagu aktif'}) tanpa membuat lirik palsu.
                        </p>
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--app-text-secondary)]">
                            Teks Lirik Manual (Opsional)
                          </label>
                          <textarea
                            rows={3}
                            value={selectedElement.properties.lyricsText || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'lyricsText', e.target.value)}
                            placeholder="Kosongkan jika menggunakan integrasi sumber lirik terpisah..."
                            className="w-full mt-1 px-3 py-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Dedicated Audio Manual Inspector */}
                    {selectedElement.type === 'audio' && (
                      <div className="py-4 space-y-3.5">
                        {/* Hidden Native Audio File Input */}
                        <input
                          ref={audioFileInputRef}
                          type="file"
                          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                          className="hidden"
                          onChange={handleManualAudioFileSelect}
                        />

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                            <Volume2 className="w-4 h-4" /> Audio Manual Player (BGM / SFX)
                          </span>
                          <span className="text-[10px] text-cyan-400 font-bold uppercase tabular-metrics">
                            {selectedElement.properties.channel || 'bgm'}
                          </span>
                        </div>

                        <p className="text-[11px] text-[var(--app-text-secondary)]">
                          Elemen audio terdedikasi untuk background music siaran atau sound effect yang dikontrol langsung via audio engine perangkat secara mandiri (terpisah dari antrean Song Request).
                        </p>

                        {/* 1. LOCAL AUDIO FILE PICKER */}
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                              <FileAudio className="w-4 h-4 text-cyan-400" /> Sumber File Audio Lokal
                            </span>
                            <span className="text-[10px] text-[var(--app-text-muted)] tabular-metrics">MP3 / WAV / OGG / M4A / AAC</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => audioFileInputRef.current?.click()}
                            className="btn-press w-full min-h-[44px] px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Pilih File Audio dari Perangkat Android</span>
                          </button>

                          {/* Display selected file status */}
                          {selectedElement.properties.localFileName ? (
                            <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-cyan-500/35 flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-cyan-950/60 flex items-center justify-center text-cyan-400 shrink-0">
                                  <FileAudio className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-[var(--app-text)] truncate text-[11px]">
                                    {selectedElement.properties.localFileName}
                                  </div>
                                  <div className="text-[10px] text-cyan-400 flex items-center gap-1 mt-0.5 tabular-metrics">
                                    <span className="font-semibold">File Lokal Sesi</span>
                                    {selectedElement.properties.localFileSize && (
                                      <span className="text-[var(--app-text-secondary)]">
                                        · {(selectedElement.properties.localFileSize / (1024 * 1024)).toFixed(2)} MB
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  manualAudioFilesRef.current.delete(selectedElement.id);
                                  setManualAudioFilesState((prev) => {
                                    const next = { ...prev };
                                    delete next[selectedElement.id];
                                    return next;
                                  });
                                  updateElementProperty(selectedElement.id, 'localFileName', '');
                                  updateElementProperty(selectedElement.id, 'audioSourceType', 'url');
                                }}
                                className="btn-press min-h-[44px] min-w-[44px] rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-error)] hover:bg-[var(--app-error-soft)] flex items-center justify-center transition"
                                title="Hapus file dan beralih ke URL"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-[11px] text-[var(--app-text-secondary)]">
                              Belum ada file lokal dipilih untuk elemen ini. Anda dapat memilih file audio dari penyimpanan HP atau mengisi URL di bawah.
                            </div>
                          )}
                        </div>

                        {/* 2. ALTERNATIVE URL INPUT */}
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Atau Gunakan Tautan URL Audio Online
                            </label>
                            {selectedElement.properties.localFileName && (
                              <span className="text-[10px] text-[var(--app-text-muted)]">(File lokal diprioritaskan)</span>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1">
                            <input
                              type="text"
                              value={selectedElement.properties.audioUrl || ''}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'audioUrl', e.target.value)}
                              placeholder="https://... file MP3 / OGG"
                              className="flex-1 min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                updateElementProperty(
                                  selectedElement.id,
                                  'audioUrl',
                                  'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg'
                                );
                                updateElementProperty(selectedElement.id, 'localFileName', '');
                                updateElementProperty(selectedElement.id, 'audioSourceType', 'url');
                              }}
                              className="btn-press min-h-[44px] px-3 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-[11px] text-cyan-300 font-semibold rounded-xl shrink-0"
                              title="Muat sample audio bebas royalti"
                            >
                              Sample BGM
                            </button>
                          </div>
                        </div>

                        {/* Title Input */}
                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Judul / Label Trek</label>
                          <input
                            type="text"
                            value={selectedElement.properties.title || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'title', e.target.value)}
                            placeholder="Contoh: Lo-Fi Chill Stream BGM"
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>

                        {/* Channel & Volume */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Kanal Audio</label>
                            <select
                              value={selectedElement.properties.channel || 'bgm'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'channel', e.target.value)}
                              className="w-full min-h-[44px] mt-1 px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] font-medium"
                            >
                              <option value="bgm">BGM (Musik Latar)</option>
                              <option value="sfx">SFX (Efek Suara)</option>
                            </select>
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Volume</label>
                              <span className="text-[11px] tabular-metrics text-cyan-400 font-semibold">
                                {selectedElement.properties.volume ?? 85}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={selectedElement.properties.volume ?? 85}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateElementProperty(selectedElement.id, 'volume', val);
                                if (audioEngine.getState().currentTrackId === selectedElement.id) {
                                  audioEngine.setVolume(val / 100);
                                }
                              }}
                              className="w-full mt-3 accent-cyan-500 cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Loop Toggle */}
                        <div className="flex items-center justify-between pt-1 gap-2">
                          <div>
                            <span className="text-xs text-[var(--app-text)] block">Putar Berulang (Loop Playback)</span>
                            <span className="text-[10px] text-[var(--app-text-secondary)]">Audio akan otomatis mengulang saat habis</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const nextLoop = selectedElement.properties.loop === false ? true : false;
                              updateElementProperty(selectedElement.id, 'loop', nextLoop);
                              if (audioEngine.getState().currentTrackId === selectedElement.id) {
                                audioEngine.setLoop(nextLoop);
                              }
                            }}
                            className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition shrink-0 ${
                              selectedElement.properties.loop !== false
                                ? 'bg-cyan-600 text-white'
                                : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                            }`}
                          >
                            {selectedElement.properties.loop !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>

                        {/* Active Playback Status Indicator */}
                        <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] font-semibold block">
                              Sumber Aktif
                            </span>
                            <span className="font-bold text-[var(--app-text)] truncate block text-[11px] mt-0.5">
                              {selectedElement.properties.localFileName
                                ? selectedElement.properties.localFileName
                                : selectedElement.properties.audioUrl
                                ? `${selectedElement.properties.audioUrl.slice(0, 35)}...`
                                : 'Sample BGM Bawaan'}
                            </span>
                          </div>
                          <div className="shrink-0">
                            {audioEngine.getState().currentTrackId === selectedElement.id && isTestingAudio ? (
                              <span className="flex items-center gap-1.5 text-cyan-400 text-[11px] font-bold">
                                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                Memutar
                              </span>
                            ) : (
                              <span className="text-[var(--app-text-secondary)] text-[11px] font-semibold">
                                Standby
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Play and Stop Buttons */}
                        <div className="pt-2 border-t border-[var(--app-border)] flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-[var(--app-text-secondary)]">Kontrol Pemutaran Audio:</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handlePlayManualAudio}
                              className="btn-press min-h-[44px] px-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                            >
                              {audioEngine.getState().currentTrackId === selectedElement.id && isTestingAudio ? (
                                <>
                                  <Pause className="w-4 h-4" /> Jeda
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4" /> Putar Audio
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleStopManualAudio}
                              className="btn-press min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-bold flex items-center gap-1.5 transition"
                              title="Hentikan dan reset posisi playback ke awal"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" /> Stop
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Running Text */}
                    {selectedElement.type === 'running_text' && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                          <Type className="w-4 h-4" /> Konten Teks Berjalan (Marquee)
                        </span>
                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Teks Siaran</label>
                          <textarea
                            rows={2}
                            value={selectedElement.properties.text || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'text', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Kecepatan (1-10)</label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={selectedElement.properties.speed || 4}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'speed', parseInt(e.target.value) || 4)}
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Warna Teks</label>
                            <input
                              type="color"
                              value={selectedElement.properties.textColor || '#F2C230'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'textColor', e.target.value)}
                              className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Common Geometry & Transform (Editable X, Y, Width, Height) */}
                    <div className="py-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--app-text)]">
                        <span>Geometri &amp; Tata Letak Kanvas</span>
                        <span className="text-[10px] text-[var(--app-accent-text)] tabular-metrics">Bisa di luar batas layar</span>
                      </div>

                      {/* Position & Size */}
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-[var(--app-text-secondary)]">X (%)</span>
                          <input
                            type="number"
                            value={selectedElement.x}
                            onChange={(e) => updateElementField(selectedElement.id, 'x', parseFloat(e.target.value) || 0)}
                            className="w-full min-h-[44px] mt-0.5 px-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-center tabular-metrics text-[var(--app-text)] text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--app-text-secondary)]">Y (%)</span>
                          <input
                            type="number"
                            value={selectedElement.y}
                            onChange={(e) => updateElementField(selectedElement.id, 'y', parseFloat(e.target.value) || 0)}
                            className="w-full min-h-[44px] mt-0.5 px-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-center tabular-metrics text-[var(--app-text)] text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--app-text-secondary)]">W (%)</span>
                          <input
                            type="number"
                            value={selectedElement.width}
                            min="2"
                            max="100"
                            onChange={(e) => updateElementField(selectedElement.id, 'width', parseFloat(e.target.value) || 10)}
                            className="w-full min-h-[44px] mt-0.5 px-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-center tabular-metrics text-[var(--app-text)] text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--app-text-secondary)]">H (%)</span>
                          <input
                            type="number"
                            value={selectedElement.height}
                            min="2"
                            max="100"
                            onChange={(e) => updateElementField(selectedElement.id, 'height', parseFloat(e.target.value) || 5)}
                            className="w-full min-h-[44px] mt-0.5 px-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-center tabular-metrics text-[var(--app-text)] text-xs"
                          />
                        </div>
                      </div>

                      {/* Opacity & Rotation */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--app-text-secondary)]">
                            <span>Opasitas</span>
                            <span className="tabular-metrics text-[var(--app-accent-text)] font-semibold">{selectedElement.opacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={selectedElement.opacity}
                            onChange={(e) => updateElementField(selectedElement.id, 'opacity', parseInt(e.target.value))}
                            className="w-full mt-2 accent-[var(--app-accent)] cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--app-text-secondary)]">
                            <span>Rotasi</span>
                            <span className="tabular-metrics text-[var(--app-accent-text)] font-semibold">{selectedElement.rotation}°</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation}
                            onChange={(e) => updateElementField(selectedElement.id, 'rotation', parseInt(e.target.value))}
                            className="w-full mt-2 accent-[var(--app-accent)] cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Layer order buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--app-border)]">
                        <span className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics">
                          Urutan Lapisan (Layer #{selectedElement.layer})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleMoveLayer(selectedElement.id, 'up')}
                            className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
                          >
                            Ke Atas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveLayer(selectedElement.id, 'down')}
                            className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
                          >
                            Ke Bawah
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 px-4 text-center space-y-2">
                  <Sliders className="w-8 h-8 text-[var(--app-text-muted)] mx-auto mb-1" />
                  <p className="text-xs font-semibold text-[var(--app-text)]">Tidak ada elemen yang dipilih</p>
                  <p className="text-[11px] text-[var(--app-text-secondary)]">
                    Klik salah satu elemen di canvas untuk mengatur properti, style, dan trigger-nya.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ELEMENT LIBRARY */}
          {activeSidePanel === 'elements' && (
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              {/* Shortcut Banner to Full Sources Catalog */}
              <button
                type="button"
                onClick={() => setActiveSidePanel('sources')}
                className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] text-[var(--app-accent-text)] text-xs font-bold flex items-center justify-between hover:border-[var(--app-accent)] transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 shrink-0" />
                  <span>Katalog 25 Sumber Siaran Lengkap</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>

              <div>
                <h3 className="text-[11px] font-bold text-[var(--app-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
                  Sumber Video (Multi-Kamera)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('camera', 'Kamera Siaran')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Camera className="w-4 h-4 text-[var(--app-accent-text)]" />
                      <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Multi-Cam</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Kamera / Facecam</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Depan / belakang mandiri</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('screen_capture', 'Tangkapan Layar (Game)')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-rose-500/60 text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Monitor className="w-4 h-4 text-[var(--app-error)]" />
                      <span className="text-[10px] text-[var(--app-error)] font-bold tabular-metrics">60 FPS</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Tangkapan Layar</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">MediaProjection game capture</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-bold text-[var(--app-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
                  Elemen Interaksi &amp; Auto-Trigger
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('event_alert', 'Alert Gift & Follow')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <Bell className="w-4 h-4 text-[var(--app-warn)]" />
                      <span className="text-[10px] text-[var(--app-warn)] font-bold">Auto Gift</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Alert Pop-up</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Hadiah mawar/paus &amp; follow</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('chat_message', 'Live Chatbox')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <MessageSquare className="w-4 h-4 text-[var(--app-accent-text)]" />
                      <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Auto Chat</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Kotak Chat Live</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Komentar dengan VIP badge</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('combo_counter', 'Combo Gift Counter')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-orange-500/60 text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <Flame className="w-4 h-4 text-orange-400" />
                      <span className="text-[10px] text-orange-400 font-bold">Multiplier</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Combo Counter</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Multiplier gift penonton</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('counter', 'Penghitung Like')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-emerald-500/60 text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <TrendingUp className="w-4 h-4 text-[var(--app-ok)]" />
                      <span className="text-[10px] text-[var(--app-ok)] font-bold">Auto Like</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Goal / Tap Counter</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Hitungan like &amp; tap layar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('song_request', 'Now Playing Song')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <ListMusic className="w-4 h-4 text-[var(--app-accent-text)]" />
                      <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Auto BGM</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Song Request Widget</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Display judul &amp; requester</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('audio', 'Audio Manual (BGM)')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-cyan-500/60 text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <span className="text-[10px] text-cyan-400 font-bold">Manual BGM</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Audio Manual (BGM)</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Musik latar &amp; SFX independen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('running_text', 'Running Text (Ticker)')}
                    className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex flex-col gap-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <Type className="w-4 h-4 text-[var(--app-accent-text)]" />
                      <span className="text-[10px] text-[var(--app-accent-text)] font-bold">Marquee</span>
                    </div>
                    <span className="font-bold text-[var(--app-text)] mt-1">Teks Berjalan</span>
                    <span className="text-[10px] text-[var(--app-text-secondary)]">Pengumuman &amp; link Saweria</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-bold text-[var(--app-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[var(--app-ok)]" />
                  Grafis Statis &amp; Video
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('image', 'Logo Siaran')}
                    className="btn-press min-h-[56px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-emerald-500/60 text-left flex items-center gap-2 transition-all"
                  >
                    <ImageIcon className="w-4 h-4 text-[var(--app-ok)] shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--app-text)] block">Gambar / Logo</span>
                      <span className="text-[10px] text-[var(--app-text-secondary)]">PNG transparan / sponsor</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('video', 'Video Background')}
                    className="btn-press min-h-[56px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex items-center gap-2 transition-all"
                  >
                    <Video className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--app-text)] block">Video Loop</span>
                      <span className="text-[10px] text-[var(--app-text-secondary)]">Background MP4/WebM</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SOURCES CATALOG (INTEGRATED SOURCES LIBRARY) */}
          {activeSidePanel === 'sources' && (
            <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1">
              <div className="pl-3 border-l-2 border-[var(--app-accent)] text-xs text-[var(--app-text-secondary)]">
                Pustaka 25 sumber overlay siaran terkurasi. Klik <strong className="text-[var(--app-text)]">Tambah</strong> untuk memasukkan sumber ke kanvas.
              </div>

              {/* Category Filter & Search */}
              <div className="space-y-2">
                <div className="flex gap-1 p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-xs">
                  {(['all', 'basic', 'dynamic'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSourceCategoryFilter(cat)}
                      className={`btn-press flex-1 min-h-[44px] rounded-lg text-xs font-semibold capitalize tabular-metrics transition-colors ${
                        sourceCategoryFilter === cat
                          ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                          : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                      }`}
                    >
                      {cat === 'all' ? 'Semua (25)' : cat === 'basic' ? 'Dasar (11)' : 'Dinamis (14)'}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={sourceSearchQuery}
                    onChange={(e) => setSourceSearchQuery(e.target.value)}
                    placeholder="Cari sumber (kamera, teks, timer, chat...)"
                    className="w-full min-h-[44px] pl-9 pr-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                  />
                  <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Source List */}
              <div className="divide-y divide-[var(--app-border)]">
                {filteredSourcesList.map((src) => (
                  <div
                    key={src.name}
                    className="py-2.5 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)] shrink-0">
                        {src.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                          <span className="truncate">{src.name}</span>
                          <span className="text-[10px] text-[var(--app-text-muted)] font-medium shrink-0">
                            · {src.category === 'basic' ? 'Dasar' : 'Dinamis'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--app-text-secondary)] truncate mt-0.5">{src.description}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddQuickElement(src.type, src.name)}
                      className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: ONE SHARED PRESET SYSTEM */}
          {activeSidePanel === 'presets' && (
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-[var(--app-accent-text)]" /> Pustaka Preset Bersama
                  </h3>
                  <p className="text-[11px] text-[var(--app-text-secondary)]">
                    Pilih preset untuk diterapkan ke canvas atau simpan scene aktif
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isModeBMutationLocked}
                  onClick={() => setNewPresetModalOpen(true)}
                  className="btn-press min-h-[44px] px-3.5 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Baru
                </button>
              </div>

              {/* Preset Category Filter */}
              <div className="flex items-center p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-[11px] font-semibold">
                {(['all', 'hp_screen', 'landscape', 'favorites'] as PresetCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPresetFilterCategory(cat)}
                    className={`btn-press flex-1 min-h-[44px] rounded-lg transition-colors capitalize ${
                      presetFilterCategory === cat
                        ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                        : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {cat === 'all' ? 'Semua' : cat === 'hp_screen' ? '9:16 HP' : cat === 'landscape' ? '16:9 PC' : 'Favorit'}
                  </button>
                ))}
              </div>

              {/* Presets List */}
              <div className="divide-y divide-[var(--app-border)]">
                {filteredPresets.map((preset) => {
                  const isActive = preset.id === activePresetId;

                  return (
                    <div
                      key={preset.id}
                      className={`py-3 transition-colors ${
                        isActive ? 'pl-2.5 border-l-2 border-l-[var(--app-accent)]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {editingPresetIdInSidebar === preset.id ? (
                            <div className="flex flex-wrap items-center gap-1.5 my-1">
                              <input
                                type="text"
                                value={editingNameInSidebar}
                                onChange={(e) => setEditingNameInSidebar(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSidebarSaveRename(preset.id);
                                  if (e.key === 'Escape') setEditingPresetIdInSidebar(null);
                                }}
                                className="flex-1 min-w-[120px] min-h-[44px] bg-[var(--app-surface-muted)] border border-[var(--app-accent)] rounded-xl px-2.5 text-xs text-[var(--app-text)] focus:outline-none font-bold"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSidebarSaveRename(preset.id)}
                                className="btn-press min-h-[44px] px-3 bg-[var(--app-accent)] text-[var(--app-accent-ink)] text-xs rounded-xl font-bold shrink-0"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPresetIdInSidebar(null)}
                                className="btn-press min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] text-xs rounded-xl shrink-0"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-xs text-[var(--app-text)] truncate">{preset.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPresetIdInSidebar(preset.id);
                                  setEditingNameInSidebar(preset.name);
                                }}
                                className="min-h-[44px] min-w-[44px] text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] flex items-center justify-center shrink-0"
                                title="Ganti Nama Preset"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <p className="text-[11px] text-[var(--app-text-secondary)] line-clamp-1">{preset.description}</p>
                          <div className="text-[10px] text-[var(--app-text-muted)] tabular-metrics mt-0.5 flex items-center gap-1.5">
                            <span>{preset.canvasOrientation}</span>
                            <span>·</span>
                            <span>{preset.elements.length} elemen</span>
                            {isActive && (
                              <>
                                <span>·</span>
                                <span className="text-[var(--app-ok)] font-bold">Aktif</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {onToggleFavoritePreset && (
                            <button
                              type="button"
                              onClick={() => onToggleFavoritePreset(preset.id)}
                              className={`btn-press min-h-[44px] min-w-[44px] rounded-xl border text-xs flex items-center justify-center ${
                                preset.isFavorite
                                  ? 'text-[var(--app-accent-text)] border-[var(--app-accent-border)] bg-[var(--app-accent-soft)]'
                                  : 'text-[var(--app-text-muted)] border-[var(--app-border)] bg-[var(--app-surface-muted)]'
                              }`}
                              title="Favorit"
                            >
                              <Star className="w-4 h-4 fill-current" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isStrictModeBLocked || isModeBActionPending}
                            onClick={() => handleApplyPresetToScene(preset)}
                            className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Terapkan
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Preset Mode B Background & Screensaver Settings */}
              {activePreset && onUpdatePresetModeBSettings && (() => {
                const screensaver = toStudioScreensaverSettings(activePreset.screensaver);
                const savedLocalVisualAssets = mediaLibrary.filter((m) => Boolean(m.assetId));
                const compatibleScreensaverAssets = savedLocalVisualAssets.filter((m) =>
                  isSupportedScreensaverAssetSelection(
                    screensaver.mediaType === 'video' ? 'video' : 'image',
                    m.type,
                    m.mimeType || '',
                  ),
                );
                const readTransitionType = (t: unknown): 'fade' | 'cut' => {
                  if (t === 'cut' || t === 'none') return 'cut';
                  if (t && typeof t === 'object' && (t as any).type === 'cut') return 'cut';
                  return 'fade';
                };

                return (
                  <div className="pt-4 border-t border-[var(--app-border)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--app-ok)]">
                        Pengaturan Mode B Preset Aktif
                      </span>
                      <span className="text-[11px] tabular-metrics text-[var(--app-text-secondary)] truncate max-w-[150px]">
                        {activePreset.name}
                      </span>
                    </div>

                    {/* Background Studio Media */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[var(--app-text-secondary)] block">
                        Background Studio (Opsional)
                      </label>
                      <select
                        disabled={isStrictModeBLocked}
                        value={activePreset.backgroundUri || ''}
                        onChange={(e) =>
                          void onUpdatePresetModeBSettings(activePreset.id, {
                            backgroundUri: e.target.value || undefined,
                          })
                        }
                        className="w-full min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] disabled:opacity-50"
                      >
                        <option value="">Tanpa Background Studio</option>
                        {savedLocalVisualAssets.map((item) => {
                          const uri = createStudioMediaAssetUri(item.assetId!) || '';
                          return (
                            <option key={item.id} value={uri}>
                              {item.type === 'video' ? '[Video]' : '[Gambar]'} {item.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Layar Tunggu / Host Wait */}
                    <div className="pt-3 border-t border-[var(--app-border)] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-bold text-[var(--app-text)]">Layar Tunggu (Screensaver)</div>
                          <div className="text-[10px] text-[var(--app-text-secondary)]">
                            Ditampilkan saat mode Layar Tunggu diaktifkan ketika LIVE.
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isStrictModeBLocked}
                          onClick={() =>
                            void onUpdatePresetModeBSettings(activePreset.id, {
                              screensaver: { ...screensaver, on: !screensaver.on },
                            })
                          }
                          className={`btn-press min-h-[44px] px-3 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-50 shrink-0 ${
                            screensaver.on
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                          }`}
                        >
                          {screensaver.on ? 'Siap Pakai' : 'Standby'}
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[var(--app-text-secondary)] block mb-1">
                          Teks Layar Tunggu
                        </label>
                        <input
                          type="text"
                          disabled={isStrictModeBLocked}
                          value={screensaver.text || ''}
                          onChange={(e) =>
                            void onUpdatePresetModeBSettings(activePreset.id, {
                              screensaver: { ...screensaver, text: e.target.value },
                            })
                          }
                          placeholder={MODE_B_SCREENSAVER_DEFAULT_TEXT}
                          className="w-full min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] disabled:opacity-50"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-[var(--app-text-secondary)] block mb-1">
                            Jenis Media
                          </label>
                          <select
                            disabled={isStrictModeBLocked}
                            value={screensaver.mediaType === 'video' ? 'video' : 'image'}
                            onChange={(e) =>
                              void onUpdatePresetModeBSettings(activePreset.id, {
                                screensaver: {
                                  ...screensaver,
                                  mediaType: e.target.value === 'video' ? 'video' : 'image',
                                  media: '',
                                },
                              })
                            }
                            className="w-full min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] disabled:opacity-50"
                          >
                            <option value="image">Gambar (PNG/JPG/GIF)</option>
                            <option value="video">Video MP4</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[var(--app-text-secondary)] block mb-1">
                            Asset Lokal
                          </label>
                          <select
                            disabled={isStrictModeBLocked}
                            value={screensaver.media || ''}
                            onChange={(e) =>
                              void onUpdatePresetModeBSettings(activePreset.id, {
                                screensaver: { ...screensaver, media: e.target.value },
                              })
                            }
                            className="w-full min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] disabled:opacity-50"
                          >
                            <option value="">Teks saja</option>
                            {compatibleScreensaverAssets.map((item) => {
                              const uri = createStudioMediaAssetUri(item.assetId!) || '';
                              return (
                                <option key={item.id} value={uri}>
                                  {item.name}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {screensaver.mediaType === 'video' && (
                        <label className="min-h-[44px] flex items-center gap-2 text-[11px] text-[var(--app-text-secondary)] cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={isStrictModeBLocked}
                            checked={screensaver.mediaSound === true}
                            onChange={(e) =>
                              void onUpdatePresetModeBSettings(activePreset.id, {
                                screensaver: { ...screensaver, mediaSound: e.target.checked },
                              })
                            }
                            className="w-4 h-4 accent-emerald-500"
                          />
                          <span>Putar audio video layar tunggu</span>
                        </label>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-[var(--app-text-secondary)] block mb-1">
                            Transisi Masuk
                          </label>
                          <select
                            disabled={isStrictModeBLocked}
                            value={readTransitionType(screensaver.enter)}
                            onChange={(e) =>
                              void onUpdatePresetModeBSettings(activePreset.id, {
                                screensaver: {
                                  ...screensaver,
                                  enter:
                                    e.target.value === 'cut'
                                      ? { type: 'cut', duration: 0 }
                                      : { type: 'fade', duration: MODE_B_SCREENSAVER_DEFAULT_FADE_MS },
                                },
                              })
                            }
                            className="w-full min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] disabled:opacity-50"
                          >
                            <option value="fade">Fade (300ms)</option>
                            <option value="cut">Cut (Instan)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[var(--app-text-secondary)] block mb-1">
                            Transisi Keluar
                          </label>
                          <select
                            disabled={isStrictModeBLocked}
                            value={readTransitionType(screensaver.exit)}
                            onChange={(e) =>
                              void onUpdatePresetModeBSettings(activePreset.id, {
                                screensaver: {
                                  ...screensaver,
                                  exit:
                                    e.target.value === 'cut'
                                      ? { type: 'cut', duration: 0 }
                                      : { type: 'fade', duration: MODE_B_SCREENSAVER_DEFAULT_FADE_MS },
                                },
                              })
                            }
                            className="w-full min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] disabled:opacity-50"
                          >
                            <option value="fade">Fade (300ms)</option>
                            <option value="cut">Cut (Instan)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Modal Save Scene as New Preset */}
              {newPresetModalOpen && (
                <div className="anim-pop-in p-3.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-accent-border)] space-y-3">
                  <div className="text-xs font-bold text-[var(--app-accent-text)]">Simpan Scene Sebagai Preset Baru</div>
                  <div>
                    <label className="text-[10px] text-[var(--app-text-secondary)]">Nama Preset</label>
                    <input
                      type="text"
                      value={newPresetNameInput}
                      onChange={(e) => setNewPresetNameInput(e.target.value)}
                      placeholder="Contoh: Mobile Legends Pro 9:16"
                      className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--app-text-secondary)]">Keterangan Singkat</label>
                    <input
                      type="text"
                      value={newPresetDescInput}
                      onChange={(e) => setNewPresetDescInput(e.target.value)}
                      placeholder="Deskripsi tata letak elemen..."
                      className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewPresetModalOpen(false)}
                      className="btn-press min-h-[44px] px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] rounded-xl text-xs font-semibold"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (newPresetNameInput.trim()) {
                          if (onCreatePreset) {
                            onCreatePreset({
                              name: newPresetNameInput.trim(),
                              category: canvasOrientation === '9:16' ? 'hp_screen' : canvasOrientation === '16:9' ? 'landscape' : 'portrait',
                              canvasOrientation,
                              elements: ensureUniqueElementIds([...elements]),
                              isFavorite: false,
                              description: newPresetDescInput.trim() || 'Preset kustom Studio',
                              thumbnailColor: '#F2C230',
                            });
                          } else {
                            onSaveAsPreset();
                          }
                          setNewPresetNameInput('');
                          setNewPresetDescInput('');
                          setNewPresetModalOpen(false);
                        }
                      }}
                      className="btn-press min-h-[44px] px-4 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MEDIA LIBRARY & LOCAL IMPORT */}
          {activeSidePanel === 'media' && (
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              <div>
                <h3 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-[var(--app-ok)]" /> Pustaka Media Lokal &amp; Import
                </h3>
                <p className="text-[11px] text-[var(--app-text-secondary)]">
                  Pilih file gambar atau video dari galeri Android atau masukkan URL
                </p>
              </div>

              {/* Hidden Native File Inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalImageSelected}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleLocalVideoSelected}
              />

              {/* Actual File Picker Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-emerald-500/60 text-left flex flex-col gap-1 transition-all"
                >
                  <Upload className="w-4 h-4 text-[var(--app-ok)]" />
                  <span className="font-bold text-xs text-[var(--app-text)]">Import Gambar HP</span>
                  <span className="text-[10px] text-[var(--app-text-secondary)]">Galeri / PNG / JPG / WebP</span>
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="btn-press min-h-[76px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex flex-col gap-1 transition-all"
                >
                  <Film className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span className="font-bold text-xs text-[var(--app-text)]">Import Video HP</span>
                  <span className="text-[10px] text-[var(--app-text-secondary)]">MP4 / WebM lokal</span>
                </button>
              </div>

              {mediaUploadError && (
                <div className="p-2.5 rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-[11px] text-[var(--app-error)] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {mediaUploadError}
                </div>
              )}

              {mediaModeBNotice && (
                <div className="p-2.5 rounded-xl bg-[var(--app-warn-soft)] border border-amber-500/35 text-[11px] text-[var(--app-warn)] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {mediaModeBNotice}
                </div>
              )}

              {/* URL Manual Input Alternative */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Atau Gunakan Tautan URL Media</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={manualMediaUrlInput}
                    onChange={(e) => setManualMediaUrlInput(e.target.value)}
                    placeholder="https://.../gambar.png"
                    className="flex-1 min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (manualMediaUrlInput.trim()) {
                        const isVid = manualMediaUrlInput.includes('.mp4') || manualMediaUrlInput.includes('.webm');
                        const newItem: LocalMediaItem = {
                          id: `url_${Date.now()}`,
                          name: isVid ? 'Video Eksternal' : 'Gambar Eksternal',
                          type: isVid ? 'video' : 'image',
                          url: manualMediaUrlInput.trim(),
                          addedAt: Date.now(),
                        };
                        setMediaLibrary((prev) => [newItem, ...prev]);
                        setPreviewMediaUrl(newItem.url);
                        setPreviewMediaType(newItem.type);
                        setPreviewAssetId(undefined);
                        setManualMediaUrlInput('');
                      }
                    }}
                    className="btn-press min-h-[44px] px-3.5 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold shrink-0"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* Media Preview Box */}
              {previewMediaUrl && (
                <div className="pt-3 border-t border-[var(--app-border)] space-y-2">
                  <div className="text-[11px] font-bold text-[var(--app-ok)]">Pratinjau Media Baru:</div>
                  <div className="w-full h-32 rounded-xl bg-black/70 flex items-center justify-center overflow-hidden border border-[var(--app-border)]">
                    {previewMediaType === 'image' ? (
                      <img src={previewMediaUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <video src={previewMediaUrl} controls className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isStrictModeBLocked}
                      onClick={() => {
                        handleAddMediaToCanvas({
                          id: previewAssetId || `item_${Date.now()}`,
                          assetId: previewAssetId,
                          name: previewMediaType === 'image' ? 'Gambar Lokal' : 'Video Lokal',
                          type: previewMediaType,
                          url: previewMediaUrl,
                          addedAt: Date.now(),
                        });
                      }}
                      className="btn-press flex-1 min-h-[44px] px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" /> Pasang Sebagai Elemen Baru
                    </button>
                    {selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'sticker' || selectedElement.type === 'video') && (
                      <button
                        type="button"
                        disabled={isStrictModeBLocked}
                        onClick={() => handleApplyMediaToSelectedElement(previewMediaUrl, previewAssetId)}
                        className="btn-press min-h-[44px] px-3 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Terapkan ke elemen yang sedang dipilih di canvas"
                      >
                        Ganti Elemen Terpilih
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Media Items Catalog */}
              <div className="pt-3 border-t border-[var(--app-border)]">
                <div className="text-[11px] font-bold text-[var(--app-text-secondary)] uppercase tracking-wider mb-1.5 tabular-metrics">
                  Daftar Media Tersimpan ({mediaLibrary.length})
                </div>
                <div className="divide-y divide-[var(--app-border)]">
                  {mediaLibrary.map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] overflow-hidden shrink-0 flex items-center justify-center">
                        {item.type === 'image' ? (
                          <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <Film className="w-5 h-5 text-[var(--app-accent-text)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[var(--app-text)] truncate">{item.name}</div>
                        <div className="text-[10px] text-[var(--app-text-secondary)] capitalize">
                          {item.assetId ? `${item.type} lokal tersimpan` : `${item.type} URL`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewMediaUrl(item.url);
                            setPreviewMediaType(item.type);
                            setPreviewAssetId(item.assetId);
                          }}
                          className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center text-xs"
                          title="Lihat Pratinjau"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isStrictModeBLocked}
                          onClick={() => handleAddMediaToCanvas(item)}
                          className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] flex items-center justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Tambahkan ke Kanvas"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {item.assetId && (
                          <button
                            type="button"
                            disabled={isStrictModeBLocked}
                            onClick={() => void handleDeleteLocalMediaAsset(item)}
                            className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-[var(--app-error)] flex items-center justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Hapus Asset Lokal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: LAYERS LIST — element groups and super-groups */}
          {activeSidePanel === 'layers' && (
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-[var(--app-text-secondary)]">
                <span className="font-semibold">Lapisan &amp; Grup Kanvas</span>
                <span className="tabular-metrics text-[var(--app-accent-text)] font-bold">{elements.length} elemen</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isStrictModeBLocked || !onUpdateActivePreset || selectedLayerElementIds.length < 2}
                  onClick={handleCreatePresetGroup}
                  className="btn-press min-h-[44px] px-2 rounded-xl border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Layers className="w-3.5 h-3.5 inline mr-1" /> Buat Grup ({selectedLayerElementIds.length})
                </button>
                <button
                  type="button"
                  disabled={isStrictModeBLocked || !onUpdateActivePreset || selectedLayerGroupIds.length < 2}
                  onClick={handleCreatePresetSuperGroup}
                  className="btn-press min-h-[44px] px-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)] text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Box className="w-3.5 h-3.5 inline mr-1" /> Supergroup ({selectedLayerGroupIds.length})
                </button>
              </div>

              {!activePreset && (
                <div className="p-2.5 rounded-xl bg-[var(--app-warn-soft)] border border-amber-500/35 text-[11px] text-[var(--app-warn)]">
                  Pilih preset aktif untuk mengelola struktur grup.
                </div>
              )}

              {activeSuperGroups.length > 0 && (
                <section className="pt-3 border-t border-[var(--app-border)] space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--app-accent-text)] font-bold">Supergroups</div>
                  <div className="divide-y divide-[var(--app-border)]">
                    {activeSuperGroups.map((superGroup) => {
                      const childGroups = activeGroups.filter((group) => superGroup.groupIds.includes(group.id));
                      return (
                        <div key={superGroup.id} className="py-2.5 space-y-1.5 pl-2.5 border-l-2 border-l-[var(--app-accent)]">
                          <div className="flex items-center gap-1.5">
                            <span className="min-w-0 flex-1 text-xs font-bold text-[var(--app-text)] truncate">{superGroup.name}</span>
                            <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetSuperGroupVisibility(superGroup.id, !superGroup.visible)} className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] flex items-center justify-center disabled:opacity-40" title={superGroup.visible ? 'Sembunyikan supergroup' : 'Tampilkan supergroup'}>
                              {superGroup.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetSuperGroupLocked(superGroup.id, !superGroup.locked)} className={`btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-center disabled:opacity-40 ${superGroup.locked ? 'text-[var(--app-warn)]' : 'text-[var(--app-text-secondary)]'}`} title={superGroup.locked ? 'Buka kunci supergroup' : 'Kunci supergroup'}>
                              {superGroup.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                            <button type="button" disabled={isStrictModeBLocked} onClick={() => handleUngroupPresetSuperGroup(superGroup.id)} className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-error)] flex items-center justify-center disabled:opacity-40" title="Lepas supergroup">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="text-[11px] text-[var(--app-text-secondary)] tabular-metrics">
                            {childGroups.length > 0
                              ? childGroups.map((group) => `${group.name} (${group.elementIds.length})`).join(' · ')
                              : 'Tidak ada grup anak'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {activeGroups.length > 0 && (
                <section className="pt-3 border-t border-[var(--app-border)] space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--app-accent-text)] font-bold">Groups</div>
                  <div className="space-y-2.5">
                    {activeGroups.map((group) => {
                      const childElements = group.elementIds.map((id) => elements.find((element) => element.id === id)).filter((element): element is StudioElement => Boolean(element));
                      const isSelectedForSuperGroup = selectedLayerGroupIds.includes(group.id);
                      return (
                        <div key={group.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)]/60 overflow-hidden">
                          <div className="p-2 flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={isSelectedForSuperGroup}
                              onChange={() => toggleLayerGroupSelection(group.id)}
                              aria-label={`Pilih ${group.name} untuk supergroup`}
                              className="w-4 h-4 accent-[var(--app-accent)] shrink-0 ml-1"
                            />
                            <button
                              type="button"
                              onClick={() => { setSelectedGroupId(group.id); setSelectedId(null); }}
                              className={`min-w-0 min-h-[44px] flex-1 text-left rounded-lg px-2 py-1 transition-colors ${selectedGroupId === group.id ? 'bg-[var(--app-accent-soft)] ring-1 ring-[var(--app-accent-border)]' : 'hover:bg-[var(--app-surface)]'}`}
                              title="Pilih grup di canvas untuk memindahkan atau mengubah ukurannya"
                            >
                              <span className={`block text-xs font-bold truncate ${selectedGroupId === group.id ? 'text-[var(--app-accent-text)]' : 'text-[var(--app-text)]'}`}>{group.name}</span>
                              <span className="block text-[10px] text-[var(--app-text-secondary)] tabular-metrics">{childElements.length} elemen · {group.elementIds.length} referensi</span>
                            </button>
                            <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetGroupVisibility(group.id, !group.visible)} className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] flex items-center justify-center disabled:opacity-40" title={group.visible ? 'Sembunyikan grup' : 'Tampilkan grup'}>
                              {group.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetGroupLocked(group.id, !group.locked)} className={`btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex items-center justify-center disabled:opacity-40 ${group.locked ? 'text-[var(--app-warn)]' : 'text-[var(--app-text-secondary)]'}`} title={group.locked ? 'Buka kunci grup' : 'Kunci grup'}>
                              {group.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                            <button type="button" disabled={isStrictModeBLocked} onClick={() => handleUngroupPresetGroup(group.id)} className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-error)] flex items-center justify-center disabled:opacity-40" title="Ungroup, elemen tetap ada">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="border-t border-[var(--app-border)] px-2.5 py-1 divide-y divide-[var(--app-border)]">
                            {childElements.map((elem) => (
                              <div key={elem.id} className="flex items-center gap-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={selectedLayerElementIds.includes(elem.id)}
                                  onChange={() => toggleLayerElementSelection(elem.id)}
                                  aria-label={`Pilih elemen ${elem.name}`}
                                  className="w-4 h-4 accent-[var(--app-accent)] shrink-0"
                                />
                                <button type="button" onClick={() => { setSelectedGroupId(null); setSelectedId(elem.id); setActiveSidePanel('properties'); }} className="min-w-0 min-h-[44px] flex-1 text-left flex flex-col justify-center">
                                  <span className="block text-[11px] font-medium text-[var(--app-text)] truncate">{elem.name}</span>
                                  <span className="block text-[10px] text-[var(--app-text-secondary)] tabular-metrics">Layer #{elem.layer} · {elem.type}</span>
                                </button>
                              </div>
                            ))}
                            {childElements.length === 0 && <div className="text-[11px] text-[var(--app-warn)] py-2">Referensi elemen tidak tersedia</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="pt-3 border-t border-[var(--app-border)] space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-[var(--app-text-secondary)] font-bold">Elemen Lepas</div>
                {elements.filter((elem) => !activeGroups.some((group) => group.elementIds.includes(elem.id))).length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-[var(--app-text-muted)]">Semua elemen sudah berada dalam grup.</div>
                ) : (
                  <div className="divide-y divide-[var(--app-border)]">
                    {elements.filter((elem) => !activeGroups.some((group) => group.elementIds.includes(elem.id))).map((elem) => {
                      const isSelected = selectedId === elem.id;
                      const isLayerSelected = selectedLayerElementIds.includes(elem.id);
                      return (
                        <div key={elem.id} className={`py-2 flex items-center justify-between gap-2 ${isSelected ? 'pl-2.5 border-l-2 border-l-[var(--app-accent)]' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isLayerSelected}
                            onChange={() => toggleLayerElementSelection(elem.id)}
                            aria-label={`Pilih elemen ${elem.name} untuk grup`}
                            className="w-4 h-4 accent-[var(--app-accent)] shrink-0"
                          />
                          <button type="button" onClick={() => { setSelectedGroupId(null); setSelectedId(elem.id); setActiveSidePanel('properties'); }} className="min-w-0 min-h-[44px] flex-1 text-left">
                            <span className="block text-xs font-bold text-[var(--app-text)] truncate">{elem.name}</span>
                            <span className="block text-[10px] text-[var(--app-text-secondary)] tabular-metrics">Layer #{elem.layer} · {elem.type}</span>
                          </button>
                          <button type="button" onClick={() => updateElementField(elem.id, 'visible', !elem.visible)} className="btn-press min-h-[44px] min-w-[44px] rounded-xl text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center" title={elem.visible ? 'Sembunyikan' : 'Tampilkan'}>
                            {elem.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          <button type="button" onClick={() => updateElementField(elem.id, 'locked', !elem.locked)} className={`btn-press min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center ${elem.locked ? 'text-[var(--app-warn)]' : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'}`} title={elem.locked ? 'Buka kunci' : 'Kunci'}>
                            {elem.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 6: PREVIEW & 7-STAGE TEST SIMULATOR */}
          {activeSidePanel === 'simulator' && (
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              <div className="pl-3 border-l-2 border-[var(--app-accent)] text-xs text-[var(--app-text-secondary)]">
                Uji respon elemen canvas langsung dengan simulasi interaktif. Semua event ditandai secara jujur sebagai{' '}
                <span className="tabular-metrics text-[var(--app-accent-text)] font-bold">[SIMULASI]</span> agar terpisah dari event LIVE asli.
              </div>

              {/* Event Simulator Grid */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => triggerSimulation('gift', 'RizkyKing', 'mengirim Paus Biru (2.150 Koin)!', 2150)}
                  className="btn-press w-full min-h-[44px] p-3 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>[SIMULASI] Gift Paus (2.150 Koin)</span>
                  </div>
                  <span className="text-[11px] font-semibold opacity-80 shrink-0">Pemicu Alert</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerSimulation('follow', 'Fajar_Streamer', 'mulai mengikuti siaran!')}
                  className="btn-press w-full min-h-[44px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-[var(--app-text)] text-xs font-bold flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <span>[SIMULASI] Follower Baru (@Fajar_Streamer)</span>
                  </div>
                  <span className="text-[11px] text-[var(--app-accent-text)] font-semibold shrink-0">Follow</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerSimulation('like', 'Viewer_Tap', 'mengetuk layar', 10)}
                  className="btn-press w-full min-h-[44px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-emerald-500/35 hover:border-emerald-500 text-[var(--app-text)] text-xs font-bold flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[var(--app-ok)] shrink-0" />
                    <span>[SIMULASI] Tap Layar / Like (+10 Likes)</span>
                  </div>
                  <span className="text-[11px] text-[var(--app-ok)] font-semibold shrink-0">Like</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerSimulation('chat', 'Budi_Gamer', 'Keren bang, setting overlaynya rapi banget! 🔥')}
                  className="btn-press w-full min-h-[44px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-bold flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <span>[SIMULASI] Komentar Live Chat</span>
                  </div>
                  <span className="text-[11px] text-[var(--app-text-secondary)] font-semibold shrink-0">Chat</span>
                </button>
              </div>

              {/* 7-STAGE SONG REQUEST TEST WORKFLOW (COMPACT DIAGNOSTIC TRIGGER) */}
              <div className="pt-4 border-t border-[var(--app-border)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                    <Music className="w-4 h-4" /> Uji Alur Song Request
                  </div>
                  <span className="text-[10px] text-[var(--app-accent-text)] tabular-metrics font-bold">
                    7-Stage Pipeline
                  </span>
                </div>

                <p className="text-[11px] text-[var(--app-text-secondary)] leading-relaxed">
                  Diagnostik lengkap pemisahan audio lokal, antrean penonton, TTS announcer, dan kepatuhan hukum YouTube ToS.
                </p>

                <button
                  type="button"
                  onClick={() => setIsSongTestModalOpen(true)}
                  className="btn-press w-full min-h-[44px] px-3 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Buka Diagnostik Pipeline</span>
                  {activeTestPipeline && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded tabular-metrics font-bold ${
                        activeTestPipeline.overallSuccess
                          ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700'
                          : 'bg-rose-950/90 text-rose-300 border border-rose-700'
                      }`}
                    >
                      {activeTestPipeline.overallSuccess ? '7 TAHAP OK' : 'GAGAL'}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 8: MARKETPLACE OVERLAYS & SCENE PACKS */}
          {activeSidePanel === 'marketplace' && (
            <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1">
              <div className="pl-3 border-l-2 border-[var(--app-accent)] text-xs text-[var(--app-text-secondary)]">
                Katalog pack overlay, alert, dan widget siap pakai. Klik <strong className="text-[var(--app-text)]">Pasang</strong> untuk menerapkan ke kanvas.
              </div>

              {/* Category Filter & Search */}
              <div className="space-y-2">
                <div className="flex gap-1 overflow-x-auto no-scrollbar p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-[11px]">
                  {(['all', 'scene', 'alert', 'goal', 'chat', 'widget'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMarketplaceCategoryFilter(cat)}
                      className={`btn-press shrink-0 min-h-[44px] px-3 rounded-lg font-semibold capitalize transition-colors ${
                        marketplaceCategoryFilter === cat
                          ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)] font-bold'
                          : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                      }`}
                    >
                      {cat === 'all' ? 'Semua' : cat}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={marketplaceSearchQuery}
                    onChange={(e) => setMarketplaceSearchQuery(e.target.value)}
                    placeholder="Cari tema, pack, author..."
                    className="w-full min-h-[44px] pl-9 pr-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                  />
                  <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Items List */}
              <div className="divide-y divide-[var(--app-border)]">
                {filteredMarketplaceList.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-start justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[var(--app-text)] flex flex-wrap items-center gap-1.5">
                        <span>{item.name}</span>
                        <span className="text-[10px] text-[var(--app-accent-text)] font-semibold uppercase">
                          · {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--app-text-secondary)] mt-0.5 line-clamp-2">{item.description}</p>
                      <div className="text-[10px] text-[var(--app-text-muted)] mt-1 flex items-center gap-1.5 tabular-metrics">
                        <span>Oleh {item.author}</span>
                        <span>·</span>
                        <span className="text-[var(--app-accent-text)]">★ {item.rating}</span>
                        <span>·</span>
                        <span>{item.elementsPayload.length} Elemen</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleInstallMarketplacePack(item)}
                      className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Pasang</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* 7-STAGE SONG REQUEST DIAGNOSTIC MODAL */}
      {isSongTestModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overscroll-contain"
          onClick={() => setIsSongTestModalOpen(false)}
        >
          <div
            className="anim-pop-in w-full max-w-lg bg-[var(--app-surface-elevated)] border border-[var(--app-border)] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--app-border)] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)] shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-[var(--app-text)] flex items-center gap-2">
                    Diagnostik Pipeline Song Request
                  </h3>
                  <p className="text-[11px] text-[var(--app-text-secondary)]">Pengujian 7-Tahap Alur &amp; Kepatuhan Layanan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSongTestModalOpen(false)}
                className="btn-press min-h-[44px] min-w-[44px] -mr-2 rounded-xl bg-[var(--app-surface-muted)] hover:border-[var(--app-border-strong)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center transition-colors"
                title="Tutup Diagnostik"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input & Run Test */}
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <input
                type="text"
                value={testQueryInput}
                onChange={(e) => setTestQueryInput(e.target.value)}
                placeholder="Judul lagu test (e.g. Neon Horizon)"
                className="flex-1 min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
              />
              <button
                type="button"
                onClick={handleRun7StageSongTest}
                className="btn-press min-h-[44px] px-4 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold shrink-0 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Jalankan Uji 7 Tahap</span>
              </button>
            </div>

            {/* Scrollable Pipeline Stage Results */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-[140px]">
              {activeTestPipeline ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] pb-2 border-b border-[var(--app-border)]">
                    <span className="font-bold text-[var(--app-text)]">Hasil Uji: {activeTestPipeline.command}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold tabular-metrics ${
                        activeTestPipeline.overallSuccess
                          ? 'bg-[var(--app-ok-soft)] text-[var(--app-ok)] border border-emerald-500/35'
                          : 'bg-[var(--app-error-soft)] text-[var(--app-error)] border border-rose-500/35'
                      }`}
                    >
                      {activeTestPipeline.overallSuccess ? '7 TAHAP SUKSES' : 'TAHAP GAGAL'}
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--app-border)]">
                    {Object.values(activeTestPipeline.stages).map((stage) => (
                      <div
                        key={stage.stageNumber}
                        className="py-2.5 text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-[var(--app-text)]">
                            Tahap {stage.stageNumber}: {stage.name}
                          </span>
                          <span
                            className={`tabular-metrics ${
                              stage.status === 'success'
                                ? 'text-[var(--app-ok)]'
                                : stage.status === 'warning'
                                ? 'text-[var(--app-warn)]'
                                : 'text-[var(--app-error)]'
                            }`}
                          >
                            {stage.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[var(--app-text-secondary)]">{stage.summary}</div>
                        <div className="text-[10px] text-[var(--app-text-muted)] tabular-metrics truncate">{stage.technicalDetail}</div>
                      </div>
                    ))}
                  </div>

                  {/* YouTube ToS Compliance Notice */}
                  <div className="pt-3 border-t border-[var(--app-border)] text-[11px] text-[var(--app-text-secondary)] leading-relaxed flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-[var(--app-accent-text)] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-[var(--app-text)]">Kepatuhan Hukum YouTube:</strong> Pemisahan audio dari video tanpa layar melanggar Ketentuan Layanan YouTube. SYNTXRR STREAM menggunakan file audio lokal streamer dan sumber bebas royalti untuk routing audio streaming yang sah.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-[var(--app-text-secondary)] text-xs flex flex-col items-center justify-center space-y-2">
                  <Music className="w-8 h-8 text-[var(--app-text-muted)] mb-1" />
                  <p className="font-medium text-[var(--app-text)]">Belum ada hasil pengujian pipeline</p>
                  <p className="text-[11px] text-[var(--app-text-secondary)] max-w-xs">
                    Ketik judul lagu di atas dan klik &ldquo;Jalankan Uji 7 Tahap&rdquo; untuk memeriksa setiap tahap alur Song Request.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-[var(--app-border)] flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsSongTestModalOpen(false)}
                className="btn-press min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-text)] transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
