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
import { StudioWorkspaceHeader } from './studio/StudioWorkspaceHeader';
import { StudioPanelNav, type StudioPanelId } from './studio/StudioPanelNav';
import { PresetLibrary } from './studio/PresetLibrary';

interface StudioViewProps {
  elements: StudioElement[];
  canvasOrientation: CanvasOrientation;
  onChangeOrientation: (orientation: CanvasOrientation) => void;
  onUpdateElements: (elements: StudioElement[]) => void;
  onSaveAsPreset: () => void;
  /** Batch 7.2: which tool panel the workspace opens with (used by the Presets route). */
  initialSidePanel?: StudioPanelId;
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
  initialSidePanel = 'properties',
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
  const [activeSidePanel, setActiveSidePanel] = useState<StudioPanelId>(initialSidePanel);

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
  const [showPresetSelector, setShowPresetSelector] = useState(false);
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
          alert('Webcam mediaDevices tidak didukung oleh browser ini.');
        }
      } catch (err: any) {
        console.warn('Camera error for element', elemId, err);
        alert('Gagal mengakses kamera: ' + (err.message || 'Izin kamera ditolak'));
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
          alert('Screen capture getDisplayMedia tidak didukung di perangkat/browser ini.');
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
      alert('Format file audio tidak didukung. Harap pilih file audio MP3, WAV, OGG, M4A, atau AAC.');
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
          borderColor: '#2563EB',
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
      if (reaction.action === 'bounce') animClass = 'animate-bounce ring-4 ring-amber-400 shadow-2xl';
      else if (reaction.action === 'pulse') animClass = 'animate-pulse ring-4 ring-blue-400 shadow-2xl';
      else if (reaction.action === 'show') animClass = 'animate-fadeIn ring-2 ring-emerald-400';
    }

    switch (elem.type) {
      case 'camera':
        return (
          <div
            className={`w-full h-full rounded-xl bg-slate-950 border relative overflow-hidden flex flex-col items-center justify-center transition-all ${animClass}`}
            style={{
              borderColor: elem.properties.borderColor || '#2563EB',
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
              <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center select-none">
                <Camera className="w-6 h-6 text-blue-400 mb-1" />
                <span className="text-[10px] font-bold text-white truncate max-w-full px-1">{elem.name}</span>
                <span className="text-[9px] text-blue-300/80">
                  {elem.properties.facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleCameraForElement(elem.id, elem.properties.facingMode);
                  }}
                  className="mt-1 px-2 py-0.5 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-[9px] font-semibold"
                >
                  Aktifkan Feed
                </button>
              </div>
            )}
            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600/90 text-white text-[8px] font-mono font-bold flex items-center gap-1 shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              {isCameraActive ? 'LIVE CAM' : 'STANDBY'}
            </div>
          </div>
        );

      case 'screen_capture':
        return (
          <div
            className={`w-full h-full rounded-xl bg-slate-950 border border-slate-700 relative overflow-hidden flex flex-col items-center justify-center ${animClass}`}
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
              <div className="flex flex-col items-center justify-center text-slate-400 p-3 text-center select-none">
                <Monitor className="w-8 h-8 text-rose-400 mb-1.5" />
                <span className="text-xs font-bold text-white">Tangkapan Layar Android</span>
                <span className="text-[9px] text-slate-400 mt-0.5">MediaProjection 60 FPS</span>
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
            className={`w-full h-full rounded-xl bg-gradient-to-r from-amber-950/95 via-amber-900/90 to-amber-950/95 border-2 border-amber-500 p-2.5 flex items-center gap-3 shadow-2xl transition-all ${animClass}`}
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 shrink-0 font-bold shadow-md">
              <Sparkles className="w-5 h-5 text-slate-950 animate-spin" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="text-[9px] uppercase tracking-wider font-extrabold text-amber-300">
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
            className={`w-full h-full p-2.5 space-y-1.5 overflow-hidden text-left bg-[#050811]/90 rounded-xl border border-slate-800 transition-all ${animClass}`}
            style={{ backgroundColor: `rgba(5, 8, 17, ${(elem.properties.bgOpacity || 85) / 100})` }}
          >
            {recentChatList.map((chat) => (
              <div key={chat.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                {elem.properties.showBadges && chat.badge && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold text-[8px]">
                    {chat.badge}
                  </span>
                )}
                <span className="font-bold text-blue-400">@{chat.user}:</span>
                <span className="text-slate-200 truncate">{chat.text}</span>
              </div>
            ))}
          </div>
        );

      case 'combo_counter':
        return (
          <div
            className={`w-full h-full rounded-xl bg-gradient-to-r from-orange-600 to-red-600 p-2 flex items-center justify-center gap-2 text-white shadow-xl transition-all ${animClass}`}
          >
            <Flame className="w-5 h-5 text-yellow-300 animate-bounce" />
            <span className="text-xs font-black tracking-wider">
              {elem.properties.comboLabel || 'x25 COMBO LOVE!'}
            </span>
          </div>
        );

      case 'counter':
      case 'live_viewer_counter':
        return (
          <div
            className={`w-full h-full rounded-xl bg-slate-950/90 border border-slate-800 p-2 flex items-center justify-between text-xs px-3 transition-all ${animClass}`}
          >
            <div className="flex items-center gap-2 font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="font-mono text-sm">{simulatedLikes.toLocaleString('id-ID')}</span>
            </div>
            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
              {elem.properties.label || 'Taps / Likes'}
            </span>
          </div>
        );

      case 'running_text':
        return (
          <div
            className="w-full h-full flex items-center overflow-hidden rounded px-2 border border-slate-800"
            style={{ backgroundColor: elem.properties.bgColor || '#0B1120' }}
          >
            <div
              className="whitespace-nowrap animate-marquee text-[11px] font-bold"
              style={{
                color: elem.properties.textColor || '#60A5FA',
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
            className={`w-full h-full p-2.5 rounded-xl bg-[#0e1626]/95 border ${
              srState.lastError
                ? 'border-rose-500/60'
                : srState.isPlaying
                ? 'border-emerald-500/60'
                : 'border-blue-500/50'
            } flex items-center gap-3 text-left transition-all ${animClass}`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow ${
                srState.isPlaying ? 'bg-blue-600 animate-pulse' : 'bg-slate-800 text-slate-300'
              }`}
            >
              <Music className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-blue-300 font-bold truncate">
                {srState.currentTrack?.title || 'Tidak ada lagu aktif'}
              </div>
              <div className="text-[8px] text-slate-400 truncate flex items-center gap-1.5">
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
                  <span className="px-1 py-0.2 rounded bg-blue-950 text-blue-400 font-mono">
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
            className={`w-full h-full p-2.5 rounded-xl bg-[#0e1626]/90 border border-violet-500/40 flex flex-col justify-center text-center transition-all ${animClass}`}
          >
            <div className="text-[9px] font-bold text-violet-300 truncate">
              {activeTitle
                ? `${activeTitle}${activeArtist ? ` — ${activeArtist}` : ''}`
                : 'Lyrics Widget (Menunggu lagu aktif)'}
            </div>
            <div className="text-[10px] text-slate-300 mt-1 line-clamp-2">
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
            className={`w-full h-full p-2.5 rounded-xl bg-[#091322]/95 border border-cyan-500/50 flex items-center gap-2.5 text-left transition-all ${animClass}`}
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-600/30 border border-cyan-500/50 flex items-center justify-center shrink-0 text-cyan-400 shadow">
              <Volume2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-cyan-300 font-bold truncate">
                {elem.properties.title || elem.name || 'Audio Manual (BGM)'}
              </div>
              <div className="text-[8px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 font-mono uppercase text-[7px] font-bold">
                  {elem.properties.channel || 'bgm'}
                </span>
                {elem.properties.localFileName && (
                  <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-300 truncate max-w-[90px]">
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
          <div className="w-full h-full rounded bg-blue-950/40 border border-blue-900/50 flex flex-col items-center justify-center text-blue-400">
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
          <div className="w-full h-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-indigo-400">
            <Video className="w-6 h-6 mb-1" />
            <span className="text-[9px] font-bold">Video Background Loop</span>
          </div>
        );
      }

      default:
        return (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-semibold">
            {elem.name}
          </div>
        );
    }
  };

  const getCanvasAspectClass = () => {
    if (canvasOrientation === '9:16') return 'aspect-[9/16] w-[270px] sm:w-[320px]';
    if (canvasOrientation === '16:9') return 'aspect-video w-full max-w-[580px]';
    return 'aspect-square w-[320px]';
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
        { id: `elem_cam_${Date.now()}`, name: 'Facecam Bulat', type: 'camera', x: 6, y: 4, width: 28, height: 15, layer: 2, visible: true, locked: false, opacity: 100, rotation: 0, properties: { borderRadius: 16, borderColor: '#2563EB' } },
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
      thumbnailColor: '#1e3a8a',
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
    <div className="space-y-6 pb-20 md:pb-8">
      {/* === PRESET SELECTION ENTRY SCREEN === */}
      {showPresetSelector ? (
        <div className="space-y-6">
          {/* Selector Header */}
          <div className="bg-sx-surface border border-sx-border-subtle rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-sx-accent/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sx-surface-3 text-sx-accent-text border border-sx-selected-border">
                    Studio Scene Presets
                  </span>
                  <span className="text-xs text-sx-text-secondary">
                    {presets.length} Preset Tersimpan
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-sx-text tracking-tight flex items-center gap-2">
                  <Tv className="w-6 h-6 text-sx-accent-text" />
                  Pilih Preset Studio
                </h1>
                <p className="text-sm text-sx-text-secondary mt-1 max-w-2xl">
                  Pilih preset untuk dimuat ke kanvas, buat preset baru dari template, atau mulai dengan kanvas kosong. Mendukung orientasi 9:16, 16:9, dan 1:1.
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setSelectorCreateModalOpen(true)}
                  disabled={isModeBMutationLocked}
                  className="px-4 py-2.5 rounded-xl bg-sx-accent hover:bg-sx-accent-hover active:scale-95 text-sx-accent-fg font-bold text-sm flex items-center space-x-2 transition shadow-lg  disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Preset Baru</span>
                </button>
                <button
                  onClick={handleSelectorBlankCanvas}
                  disabled={isStrictModeBLocked}
                  className="px-4 py-2.5 rounded-xl bg-sx-surface-3 hover:bg-sx-surface-3 active:scale-95 text-sx-text hover:text-sx-text font-bold text-sm flex items-center space-x-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Layout className="w-4 h-4" />
                  <span>Kanvas Kosong</span>
                </button>
              </div>
            </div>

            {/* Selector Category Tabs */}
            <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-sx-border-subtle">
              {(
                [
                  { id: 'all', label: 'Semua Preset' },
                  { id: 'hp_screen', label: 'Layar HP (9:16)' },
                  { id: 'landscape', label: 'Landscape (16:9)' },
                  { id: 'portrait', label: 'Portrait' },
                  { id: 'favorites', label: 'Favorit' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectorFilterCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                    selectorFilterCategory === cat.id
                      ? 'bg-sx-accent text-sx-accent-fg shadow'
                      : 'bg-sx-bg text-sx-text-secondary hover:text-sx-text border border-sx-border-subtle'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selector Preset Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {selectorFilteredPresets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <div
                  key={preset.id}
                  className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden ${
                    isActive
                      ? 'bg-sx-selected border-sx-selected-border shadow-xl '
                      : 'bg-sx-surface border-sx-border-subtle hover:border-sx-border'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sx-bg text-sx-accent-text border border-sx-border-subtle flex items-center space-x-1">
                          {preset.canvasOrientation === '9:16' && <Smartphone className="w-3 h-3" />}
                          {preset.canvasOrientation === '16:9' && <Monitor className="w-3 h-3" />}
                          {preset.canvasOrientation === '1:1' && <Square className="w-3 h-3" />}
                          <span>{preset.canvasOrientation}</span>
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sx-success/10 text-sx-success border border-sx-success/30 flex items-center space-x-1">
                            <Check className="w-3 h-3" />
                            <span>Aktif</span>
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onToggleFavoritePreset?.(preset.id)}
                        className="p-1.5 rounded-lg text-sx-text-secondary hover:text-sx-warning hover:bg-sx-surface-3 transition"
                      >
                        <Star className={`w-4 h-4 ${preset.isFavorite ? 'fill-amber-400 text-sx-warning' : ''}`} />
                      </button>
                    </div>

                    {editingPresetIdInSelector === preset.id ? (
                      <div className="flex items-center space-x-1.5 my-1">
                        <input
                          type="text"
                          value={editingNameInSelector}
                          onChange={(e) => setEditingNameInSelector(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSelectorSaveRename(preset.id);
                            if (e.key === 'Escape') setEditingPresetIdInSelector(null);
                          }}
                          className="flex-1 bg-sx-bg border border-sx-accent rounded px-2 py-1 text-sm text-sx-text focus:outline-none font-bold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSelectorSaveRename(preset.id)}
                          className="px-2.5 py-1 bg-sx-accent text-sx-accent-fg text-xs rounded hover:bg-sx-accent-hover font-bold shrink-0"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPresetIdInSelector(null)}
                          className="px-2 py-1 bg-sx-surface-3 text-sx-text text-xs rounded hover:bg-sx-surface-3 shrink-0"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-sx-text tracking-tight">{preset.name}</h3>
                        <button
                          onClick={() => { setEditingPresetIdInSelector(preset.id); setEditingNameInSelector(preset.name); }}
                          className="text-sx-text-muted hover:text-sx-text p-1"
                          title="Ubah Nama"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <p className="text-xs text-sx-text-secondary mt-1 line-clamp-2 leading-relaxed">{preset.description}</p>

                    <div className="mt-4 flex items-center space-x-2 text-xs text-sx-text-secondary">
                      <Layers className="w-3.5 h-3.5 text-sx-accent-text" />
                      <span>{preset.elements.length} Elemen Overlay</span>
                    </div>
                  </div>

                  <div className="p-4 bg-sx-bg/50 border-t border-sx-border-subtle flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => onDuplicatePreset?.(preset.id)}
                        disabled={isModeBMutationLocked}
                        className="p-2 rounded-lg bg-sx-surface-3 hover:bg-sx-surface-3 text-sx-text text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Duplikasi"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {presets.length > 1 && (
                        <button
                          onClick={() => onDeletePreset?.(preset.id)}
                          disabled={isModeBMutationLocked}
                          className="p-2 rounded-lg bg-sx-surface-3 hover:bg-sx-danger-soft text-sx-text-secondary hover:text-sx-danger text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => handleSelectorSelectPreset(preset.id)}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1 transition ${
                        isActive
                          ? 'bg-sx-accent hover:bg-sx-accent-hover active:scale-95 text-sx-accent-fg shadow'
                          : 'bg-sx-surface-3 hover:bg-sx-accent hover:text-sx-text text-sx-text'
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
              <div className="bg-sx-surface border border-sx-border-subtle rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-sx-border-subtle">
                  <div className="flex items-center space-x-2">
                    <Layout className="w-5 h-5 text-sx-accent-text" />
                    <h3 className="text-base font-bold text-sx-text">Buat Preset Studio Baru</h3>
                  </div>
                  <button onClick={() => setSelectorCreateModalOpen(false)} className="text-sx-text-secondary hover:text-sx-text">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSelectorCreatePreset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-sx-text mb-1">Nama Preset</label>
                    <input
                      type="text"
                      value={selectorPresetName}
                      onChange={(e) => setSelectorPresetName(e.target.value)}
                      placeholder="Misal: Mobile Gaming Pro, TikTok Live Malam"
                      required
                      className="w-full bg-sx-bg border border-sx-border-subtle rounded-xl px-3 py-2 text-sm text-sx-text placeholder:text-sx-text-muted focus:outline-none focus:border-sx-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-sx-text mb-1">Orientasi Kanvas</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: '9:16', label: '9:16 (Layar HP)', icon: <Smartphone className="w-4 h-4 mx-auto mb-1" /> },
                          { id: '16:9', label: '16:9 (Landscape)', icon: <Monitor className="w-4 h-4 mx-auto mb-1" /> },
                          { id: '1:1', label: '1:1 (Persegi)', icon: <Square className="w-4 h-4 mx-auto mb-1" /> },
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
                          className={`p-2.5 rounded-xl text-center text-xs font-semibold border transition ${
                            selectorOrientation === orient.id
                              ? 'bg-sx-accent border-sx-selected-border text-sx-accent-fg'
                              : 'bg-sx-bg border-sx-border-subtle text-sx-text-secondary hover:text-sx-text'
                          }`}
                        >
                          {orient.icon}
                          <span>{orient.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-sx-text mb-1">Pilihan Template Permulaan</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'gaming', label: 'Mobile Gaming', desc: 'Screen Capture + Facecam + Chat' },
                          { id: 'chatting', label: 'Just Chatting', desc: 'Kamera Penuh + Alert + Chat' },
                          { id: 'music', label: 'Music Stream', desc: 'Now Playing + Queue + Chat' },
                          { id: 'blank', label: 'Kanvas Kosong', desc: 'Mulai dari kanvas bersih' },
                        ] as const
                      ).map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => setSelectorTemplate(tmpl.id)}
                          className={`p-2.5 rounded-xl text-left border transition ${
                            selectorTemplate === tmpl.id
                              ? 'bg-sx-accent-soft border-sx-selected-border text-sx-accent-fg'
                              : 'bg-sx-bg border-sx-border-subtle text-sx-text-secondary hover:text-sx-text'
                          }`}
                        >
                          <div className="text-xs font-bold text-sx-text mb-0.5">{tmpl.label}</div>
                          <div className="text-[10px] text-sx-text-secondary">{tmpl.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-sx-text mb-1">Deskripsi (Opsional)</label>
                    <textarea
                      value={selectorDescription}
                      onChange={(e) => setSelectorDescription(e.target.value)}
                      placeholder="Keterangan singkat tentang preset ini..."
                      rows={2}
                      className="w-full bg-sx-bg border border-sx-border-subtle rounded-xl px-3 py-2 text-xs text-sx-text placeholder:text-sx-text-muted focus:outline-none focus:border-sx-accent"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectorCreateModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-sx-surface-3 text-sx-text text-xs font-semibold hover:bg-sx-surface-3"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-sx-accent hover:bg-sx-accent-hover text-sx-accent-fg text-xs font-bold shadow-lg "
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
      {/* Studio workspace header — Batch 7.2 */}
      <StudioWorkspaceHeader
        presetName={activePreset?.name ?? null}
        elementCount={elements.length}
        orientation={canvasOrientation}
        onChangeOrientation={onChangeOrientation}
        locked={isModeBMutationLocked}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveAsPreset={onSaveAsPreset}
        onOpenPresetLibrary={() => setActiveSidePanel('presets')}
      />

      {/* Mode B Active Status / Lock / Live Apply Banner */}
      {isModeBSelected && isModeBMutationLocked && (
        <div
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isModeBLive
              ? 'bg-sx-success-soft border-sx-success/60 text-sx-success'
              : 'bg-sx-warning-soft border-sx-warning/60 text-sx-warning'
          }`}
        >
          <div className="space-y-1 text-xs">
            <div className="font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              {isModeBLive
                ? 'Mode B sedang LIVE — Orientasi & Struktur Preset Dikunci'
                : `Mode B sedang sibuk (${modeBStatus?.status || 'transisi'}) — Mutasi Kanvas Dikunci Sementara`}
            </div>
            <p className="text-[11px] opacity-90 leading-relaxed">
              {isModeBLive
                ? 'Anda tetap dapat menyesuaikan overlay/teks/layar tunggu atau memilih preset statis yang kompatibel, lalu tekan "Terapkan Perubahan ke LIVE" untuk mengirim ke encoder native.'
                : 'Mutasi struktur kanvas dan preset diblokir sementara selama Mode B memulai, menghentikan, atau meminta ulang Screen Share.'}
            </p>
            {modeBLiveApplyFeedback && (
              <div
                className={`text-[11px] font-semibold pt-0.5 ${
                  modeBLiveApplyFeedback.success ? 'text-sx-success' : 'text-sx-warning'
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
              className="shrink-0 px-3.5 py-2 rounded-xl bg-sx-success hover:bg-sx-success text-white text-xs font-bold shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isModeBActionPending ? 'Menerapkan...' : 'Terapkan Perubahan ke LIVE'}
            </button>
          )}
        </div>
      )}

      {/* Main Studio Viewport Split (Canvas on Left, Modular Consolidated Panel on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SECTION 1: CANVAS EDITOR */}
        <div
          className="lg:col-span-7 bg-sx-surface border border-sx-border-subtle rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col items-center justify-between space-y-4 overscroll-y-contain"
          style={{ overscrollBehaviorY: 'contain' }}
        >
          {/* Viewport Toolbar */}
          <div className="w-full flex items-center justify-between text-xs text-sx-text-secondary px-1 border-b border-sx-border-subtle pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sx-accent" />
              <span className="font-bold text-sx-text font-mono">
                Kanvas {canvasOrientation} ({elements.length} Elemen)
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0}
                className="p-1.5 rounded-lg bg-sx-input border border-sx-border-subtle text-sx-text hover:text-sx-text disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="p-1.5 rounded-lg bg-sx-input border border-sx-border-subtle text-sx-text hover:text-sx-text disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-px bg-sx-surface-3 mx-1" />

              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                className="p-1.5 rounded-lg bg-sx-input border border-sx-border-subtle text-sx-text hover:text-sx-text"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] px-1 text-sx-text">{zoomLevel}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(180, z + 10))}
                className="p-1.5 rounded-lg bg-sx-input border border-sx-border-subtle text-sx-text hover:text-sx-text"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoomLevel(100);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1.5 rounded-lg bg-sx-input border border-sx-border-subtle text-sx-text hover:text-sx-text ml-1"
                title="Reset Posisi & Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Screen Stage Container */}
          <div
            className="w-full overflow-hidden flex items-center justify-center p-2 sm:p-4 bg-sx-bg rounded-xl border border-sx-border-subtle relative min-h-[380px] sm:min-h-[460px] select-none overscroll-y-contain"
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
              className={`relative bg-black border border-sx-border rounded-xl shadow-sm transition-transform duration-75 overflow-hidden ${getCanvasAspectClass()} overscroll-y-contain`}
              onClick={() => {
                setSelectedId(null);
                setSelectedGroupId(null);
              }}
            >
              {/* Safe-Zone Guide Margins for TikTok / Live Stream */}
              <div className="absolute inset-x-2 top-2 h-7 border border-dashed border-sx-info/30 rounded flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-sx-info/60">SAFE ZONE HEADER (STATUS BAR)</span>
              </div>
              <div className="absolute inset-x-2 bottom-2 h-10 border border-dashed border-sx-danger/30 rounded flex items-center justify-center pointer-events-none">
                <span className="text-[8px] font-mono text-sx-danger/50">SAFE ZONE FOOTER (CHAT / GIFTS AREA)</span>
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
                        ? 'ring-2 ring-sx-accent ring-offset-1 ring-offset-black'
                        : 'hover:ring-1 hover:ring-sx-accent'
                    }`}
                  >
                    {/* Render Content */}
                    {renderElementContent(elem)}

                    {/* Resize Handles on Selected Element (4 corners & 2 edges) */}
                    {isSelected && !elem.locked && !isElementLockedByGroup(elem.id) && (
                      <>
                        {/* Bottom-Right Handle */}
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'bottom-right')}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-sx-accent border-2 border-sx-accent-fg/70 rounded-full cursor-se-resize shadow-md z-30"
                          title="Resize Sudut Kanan-Bawah"
                        />
                        {/* Top-Right Handle */}
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'top-right')}
                          style={{ touchAction: 'none' }}
                          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-sx-accent border border-sx-accent-fg/70 rounded-full cursor-ne-resize shadow-sm z-30"
                          title="Resize Sudut Kanan-Atas"
                        />
                        {/* Bottom-Left Handle */}
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'bottom-left')}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-sx-accent border border-sx-accent-fg/70 rounded-full cursor-sw-resize shadow-sm z-30"
                          title="Resize Sudut Kiri-Bawah"
                        />
                        {/* Top-Left Handle */}
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'top-left')}
                          style={{ touchAction: 'none' }}
                          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-sx-accent border border-sx-accent-fg/70 rounded-full cursor-nw-resize shadow-sm z-30"
                          title="Resize Sudut Kiri-Atas"
                        />
                      </>
                    )}

                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute -top-4 left-0 px-1.5 py-0.5 bg-sx-accent text-sx-accent-fg font-mono text-[9px] rounded uppercase font-bold tracking-wider pointer-events-none">
                        {elem.name}
                      </div>
                    )}
                  </div>
                );
              })}

              {selectedGroup && selectedGroupBounds && (
                <div
                  className="absolute border-2 border-sx-warning rounded-sm pointer-events-none"
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
                    className="absolute -top-6 left-0 px-2 py-1 rounded-t-md bg-sx-warning text-sx-accent-fg text-[9px] font-bold whitespace-nowrap cursor-move select-none"
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
                          className={`absolute w-3.5 h-3.5 bg-sx-warning border-2 border-sx-accent-fg/70 rounded-full shadow-md ${
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

          {/* Quick Helper Legend */}
          <div className="w-full flex items-center justify-between text-[11px] text-sx-text-secondary px-2">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-sx-accent shrink-0" />Geser elemen bebas horizontal &amp; vertikal (mouse/sentuhan Android).</span>
            <span className="font-mono text-sx-accent-text">1080p Produksi</span>
          </div>
        </div>

        {/* SECTION 2-6: CONSOLIDATED STUDIO TOOL PANEL */}
        <div className="lg:col-span-5 bg-sx-surface border border-sx-border-subtle rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
          {/* Studio panel navigation — Batch 7.2 */}
          <StudioPanelNav active={activeSidePanel} onChange={setActiveSidePanel} />

          {/* TAB 1: CONTEXTUAL PROPERTIES PANEL */}
          {activeSidePanel === 'properties' && (
            <div className="space-y-4">
              {selectedElement ? (
                <>
                  <div className="p-3 bg-sx-bg rounded-xl border border-sx-border-subtle flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-sx-text flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sx-accent" />
                        {selectedElement.name}
                      </div>
                      <div className="text-[10px] text-sx-text-secondary font-mono mt-0.5">
                        Tipe: {selectedElement.type} · Layer #{selectedElement.layer}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateElementField(selectedElement.id, 'visible', !selectedElement.visible)}
                        className={`p-1.5 rounded-lg border text-xs ${
                          selectedElement.visible
                            ? 'bg-sx-surface-3 border-sx-border text-sx-text'
                            : 'bg-sx-danger-soft border-sx-danger text-sx-danger'
                        }`}
                        title={selectedElement.visible ? 'Sembunyikan' : 'Tampilkan'}
                      >
                        {selectedElement.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateElementField(selectedElement.id, 'locked', !selectedElement.locked)}
                        className={`p-1.5 rounded-lg border text-xs ${
                          selectedElement.locked
                            ? 'bg-sx-warning-soft border-sx-warning/40 text-sx-warning'
                            : 'bg-sx-surface-3 border-sx-border text-sx-text'
                        }`}
                        title={selectedElement.locked ? 'Buka Kunci' : 'Kunci Posisi'}
                      >
                        {selectedElement.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(selectedElement.id)}
                        className="p-1.5 rounded-lg bg-sx-surface-3 border border-sx-border text-sx-text hover:text-sx-text"
                        title="Duplikasi Elemen"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedElement.id)}
                        className="p-1.5 rounded-lg bg-sx-danger-soft border border-sx-danger/40 text-sx-danger hover:bg-sx-danger-soft"
                        title="Hapus Elemen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contextual Form Body strictly tailored to Selected Type */}
                  <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
                    {/* Camera */}
                    {selectedElement.type === 'camera' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-accent-text flex items-center gap-1.5">
                            <Camera className="w-4 h-4" /> Sumber Kamera Siaran
                          </span>
                          <span className="text-[10px] text-sx-text-secondary font-mono">Multi-Camera Ready</span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-sx-text">Pilihan Lensa / Arah Kamera</label>
                          <select
                            value={selectedElement.properties.facingMode || 'user'}
                            onChange={(e) => {
                              const facing = e.target.value as 'user' | 'environment';
                              updateElementProperty(selectedElement.id, 'facingMode', facing);
                              if (activeCameraStreams[selectedElement.id]) {
                                handleToggleCameraForElement(selectedElement.id, facing);
                              }
                            }}
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          >
                            <option value="user">Kamera Depan (Facecam / Selfie)</option>
                            <option value="environment">Kamera Belakang (Handcam / Meja)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs text-sx-text">Uji Live Feed Kamera:</span>
                          <button
                            type="button"
                            onClick={() => handleToggleCameraForElement(selectedElement.id, selectedElement.properties.facingMode)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                              activeCameraStreams[selectedElement.id]
                                ? 'bg-sx-danger text-sx-text'
                                : 'bg-sx-accent text-sx-accent-fg hover:bg-sx-accent-hover'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {activeCameraStreams[selectedElement.id] ? 'Matikan Kamera' : 'Aktifkan Kamera'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Warna Border</label>
                            <input
                              type="color"
                              value={selectedElement.properties.borderColor || '#2563EB'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderColor', e.target.value)}
                              className="w-full h-8 mt-1 rounded bg-sx-input border border-sx-border-subtle cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Radius Sudut (px)</label>
                            <input
                              type="number"
                              value={selectedElement.properties.borderRadius || 14}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderRadius', parseInt(e.target.value) || 0)}
                              className="w-full mt-1 px-3 py-1.5 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen Capture */}
                    {selectedElement.type === 'screen_capture' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-danger/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-danger flex items-center gap-1.5">
                            <Monitor className="w-4 h-4" /> Tangkapan Layar HP (Game Capture)
                          </span>
                        </div>
                        <p className="text-[11px] text-sx-text-secondary leading-relaxed">
                          Menangkap feed game Android atau tampilan layar dengan MediaProjection 60 FPS.
                        </p>
                        <div className="p-2.5 rounded-lg bg-sx-bg/80 border border-sx-border-subtle text-[10px] text-sx-text space-y-1">
                          <div>
                            <strong className="text-sx-danger">Aturan Mode B RTMP:</strong> Layer Tangkapan Layar harus berada di lapisan paling bawah (Layer #1 / di bawah semua overlay).
                          </div>
                          <div className="text-sx-text-secondary">
                            Crop Mode aktif: <span className="font-mono text-sx-text">Fit</span> · Rotasi didukung: <span className="font-mono text-sx-text">0° / 90° / 180° / 270°</span>.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleScreenCapture}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                            screenCaptureStream ? 'bg-sx-danger text-sx-text' : 'bg-sx-danger text-sx-text hover:bg-sx-danger'
                          }`}
                        >
                          <Monitor className="w-4 h-4" />
                          {screenCaptureStream ? 'Hentikan Screen Share' : 'Mulai Screen Share (getDisplayMedia)'}
                        </button>
                      </div>
                    )}

                    {/* Event Alert */}
                    {selectedElement.type === 'event_alert' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-warning/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-warning flex items-center gap-1.5">
                            <Bell className="w-4 h-4" /> Auto-Trigger: Alert Notifikasi
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sx-warning/20 text-sx-warning font-bold text-[9px]">
                            Auto-Mapped
                          </span>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-sx-text">Pemicu Event</label>
                          <select
                            value={selectedElement.triggerConfig?.eventType || 'gift'}
                            onChange={(e) => updateElementTrigger(selectedElement.id, { eventType: e.target.value })}
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          >
                            <option value="gift">Gift / Hadiah Penonton (Default)</option>
                            <option value="follow">Follower Baru</option>
                            <option value="donation">Donasi Saweria</option>
                            <option value="all">Semua Event Live</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-sx-text">Judul Banner Default</label>
                          <input
                            type="text"
                            value={selectedElement.properties.alertTitle || 'GIFT RECEIVED!'}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'alertTitle', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] font-bold text-sx-text">
                            <span>Durasi Muncul (Detik)</span>
                            <span className="font-mono text-sx-warning">
                              {selectedElement.triggerConfig?.durationSec || 5}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="20"
                            value={selectedElement.triggerConfig?.durationSec || 5}
                            onChange={(e) => updateElementTrigger(selectedElement.id, { durationSec: parseInt(e.target.value) })}
                            className="w-full mt-1 accent-amber-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Chat Message */}
                    {selectedElement.type === 'chat_message' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-info/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-info flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4" /> Auto-Trigger: Live Chatbox
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sx-info-soft text-sx-info font-bold text-[9px]">
                            Live Feed
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Maks. Pesan</label>
                            <input
                              type="number"
                              min="2"
                              max="10"
                              value={selectedElement.properties.maxMessages || 4}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'maxMessages', parseInt(e.target.value) || 4)}
                              className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Opasitas Latar (%)</label>
                            <input
                              type="number"
                              min="10"
                              max="100"
                              value={selectedElement.properties.bgOpacity || 85}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'bgOpacity', parseInt(e.target.value) || 85)}
                              className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-sx-text">Tampilkan Lencana VIP / Sub</span>
                          <button
                            type="button"
                            onClick={() => updateElementProperty(selectedElement.id, 'showBadges', !selectedElement.properties.showBadges)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              selectedElement.properties.showBadges !== false
                                ? 'bg-sx-info text-sx-text'
                                : 'bg-sx-surface-3 text-sx-text-secondary'
                            }`}
                          >
                            {selectedElement.properties.showBadges !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Image / Video / Media Replacement */}
                    {(selectedElement.type === 'image' || selectedElement.type === 'sticker' || selectedElement.type === 'video') && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-success/30 space-y-3">
                        <span className="text-xs font-bold text-sx-success flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4" /> Sumber Media (Lokal &amp; URL)
                        </span>

                        <div>
                          <label className="text-[11px] font-bold text-sx-text">
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
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveSidePanel('media')}
                          className="w-full py-2 bg-sx-success/20 hover:bg-sx-success/30 border border-sx-success/40 text-sx-success rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Pilih dari Media Library Lokal
                        </button>
                      </div>
                    )}

                    {/* Song Request Widget Inspector */}
                    {selectedElement.type === 'song_request' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-accent-text flex items-center gap-1.5">
                            <ListMusic className="w-4 h-4" /> Song Request Live Display
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sx-surface-3/20 text-sx-accent-text font-bold text-[9px]">
                            Mode A Engine
                          </span>
                        </div>

                        <p className="text-[11px] text-sx-text-secondary">
                          Widget ini terhubung langsung ke subsistem Song Request Mode A (!play & !next) dan status pemutaran sebenarnya.
                        </p>

                        <div className="p-2.5 rounded-lg bg-sx-input border border-sx-border-subtle flex items-center justify-between text-xs">
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-sx-text truncate">
                              {srState.currentTrack?.title || 'Tidak ada lagu aktif'}
                            </div>
                            <div className="text-[10px] text-sx-accent-text truncate">
                              {srState.currentTrack
                                ? `Req: @${srState.currentTrack.requester} · ${srState.playbackStatus}`
                                : `Antrean: ${srState.queue.length} lagu`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                void songRequestEngine.togglePlayPause();
                              }}
                              className="p-1.5 rounded-lg bg-sx-surface-3 text-sx-text"
                              title={srState.isPlaying ? 'Jeda' : 'Putar'}
                            >
                              {srState.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void songRequestEngine.skipTrack('Streamer');
                              }}
                              className="p-1.5 rounded-lg bg-sx-surface-3 text-sx-text hover:text-sx-text"
                              title="Skip Lagu (!next)"
                            >
                              <FastForward className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {srState.lastError && (
                          <div className="p-2 rounded-lg bg-sx-danger-soft border border-sx-danger/40 text-[11px] text-sx-danger">
                            {srState.lastError}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-sx-text">Tampilkan Nama Pengirim Request</span>
                          <button
                            type="button"
                            onClick={() => updateElementProperty(selectedElement.id, 'showRequester', !selectedElement.properties.showRequester)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              selectedElement.properties.showRequester !== false ? 'bg-sx-surface-3 text-sx-text' : 'bg-sx-surface-3 text-sx-text-secondary'
                            }`}
                          >
                            {selectedElement.properties.showRequester !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Lyrics Widget Inspector */}
                    {selectedElement.type === 'lyrics' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-accent-text flex items-center gap-1.5">
                            <Music className="w-4 h-4" /> Lyrics Display (Integrasi Terpisah)
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sx-info-soft text-sx-accent-text font-bold text-[9px]">
                            Follows Track
                          </span>
                        </div>
                        <p className="text-[11px] text-sx-text-secondary">
                          Mengikuti lagu aktif dari Song Request / Local Audio ({srState.currentTrack?.title || manualAudioTitle || 'Belum ada lagu aktif'}) tanpa membuat lirik palsu.
                        </p>
                        <div>
                          <label className="text-[11px] font-semibold text-sx-text">
                            Teks Lirik Manual (Opsional)
                          </label>
                          <textarea
                            rows={3}
                            value={selectedElement.properties.lyricsText || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'lyricsText', e.target.value)}
                            placeholder="Kosongkan jika menggunakan integrasi sumber lirik terpisah..."
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          />
                        </div>
                      </div>
                    )}

                    {/* Dedicated Audio Manual Inspector */}
                    {selectedElement.type === 'audio' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle space-y-3.5">
                        {/* Hidden Native Audio File Input */}
                        <input
                          ref={audioFileInputRef}
                          type="file"
                          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
                          className="hidden"
                          onChange={handleManualAudioFileSelect}
                        />

                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sx-info flex items-center gap-1.5">
                            <Volume2 className="w-4 h-4" /> Audio Manual Player (BGM / SFX)
                          </span>
                          <span className="px-2 py-0.5 rounded bg-sx-info-soft text-sx-info font-bold text-[9px] uppercase font-mono">
                            {selectedElement.properties.channel || 'bgm'}
                          </span>
                        </div>

                        <p className="text-[11px] text-sx-text-secondary">
                          Elemen audio terdedikasi untuk background music siaran atau sound effect yang dikontrol langsung via audio engine perangkat secara mandiri (terpisah dari antrean Song Request).
                        </p>

                        {/* 1. LOCAL AUDIO FILE PICKER */}
                        <div className="p-3 rounded-xl bg-sx-input border border-sx-border-subtle space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sx-text flex items-center gap-1.5">
                              <FileAudio className="w-4 h-4 text-sx-info" /> Sumber File Audio Lokal
                            </span>
                            <span className="text-[9px] text-sx-text-secondary">MP3 / WAV / OGG / M4A / AAC</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => audioFileInputRef.current?.click()}
                            className="w-full py-2.5 px-3 rounded-xl bg-sx-info-soft hover:bg-sx-info-soft border border-sx-border/50 text-sx-info font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98 shadow-sm"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Pilih File Audio dari Perangkat Android</span>
                          </button>

                          {/* Display selected file status */}
                          {selectedElement.properties.localFileName ? (
                            <div className="p-2.5 rounded-lg bg-sx-bg border border-sx-border/40 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <div className="w-7 h-7 rounded-lg bg-sx-info-soft flex items-center justify-center text-sx-info shrink-0">
                                  <FileAudio className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-sx-text truncate text-[11px]">
                                    {selectedElement.properties.localFileName}
                                  </div>
                                  <div className="text-[9px] text-sx-info flex items-center gap-1 mt-0.5">
                                    <span className="px-1.5 py-0.2 rounded bg-sx-info-soft font-semibold">File Lokal Sesi</span>
                                    {selectedElement.properties.localFileSize && (
                                      <span className="text-sx-text-secondary">
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
                                className="p-1 rounded text-sx-text-secondary hover:text-sx-danger hover:bg-sx-surface-3 transition"
                                title="Hapus file dan beralih ke URL"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-sx-text-secondary">
                              Belum ada file lokal dipilih untuk elemen ini. Anda dapat memilih file audio dari penyimpanan HP atau mengisi URL di bawah.
                            </div>
                          )}
                        </div>

                        {/* 2. ALTERNATIVE URL INPUT */}
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-bold text-sx-text">
                              Atau Gunakan Tautan URL Audio Online
                            </label>
                            {selectedElement.properties.localFileName && (
                              <span className="text-[9px] text-sx-text-muted">(File lokal diprioritaskan)</span>
                            )}
                          </div>
                          <div className="flex gap-2 mt-1">
                            <input
                              type="text"
                              value={selectedElement.properties.audioUrl || ''}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'audioUrl', e.target.value)}
                              placeholder="https://... file MP3 / OGG"
                              className="flex-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
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
                              className="px-2.5 py-1.5 bg-sx-info-soft/60 hover:bg-sx-info-soft border border-sx-border-subtle text-[10px] text-sx-info font-semibold rounded-lg shrink-0"
                              title="Muat sample audio bebas royalti"
                            >
                              Sample BGM
                            </button>
                          </div>
                        </div>

                        {/* Title Input */}
                        <div>
                          <label className="text-[11px] font-bold text-sx-text">Judul / Label Trek</label>
                          <input
                            type="text"
                            value={selectedElement.properties.title || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'title', e.target.value)}
                            placeholder="Contoh: Lo-Fi Chill Stream BGM"
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          />
                        </div>

                        {/* Channel & Volume */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Kanal Audio</label>
                            <select
                              value={selectedElement.properties.channel || 'bgm'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'channel', e.target.value)}
                              className="w-full mt-1 px-2.5 py-1.5 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text font-medium"
                            >
                              <option value="bgm">BGM (Musik Latar)</option>
                              <option value="sfx">SFX (Efek Suara)</option>
                            </select>
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-sx-text">Volume</label>
                              <span className="text-[11px] font-mono text-sx-info">
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
                              className="w-full mt-1.5 accent-cyan-500"
                            />
                          </div>
                        </div>

                        {/* Loop Toggle */}
                        <div className="flex items-center justify-between pt-1">
                          <div>
                            <span className="text-xs text-sx-text block">Putar Berulang (Loop Playback)</span>
                            <span className="text-[10px] text-sx-text-muted">Audio akan otomatis mengulang saat habis</span>
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
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                              selectedElement.properties.loop !== false
                                ? 'bg-sx-info text-sx-text shadow'
                                : 'bg-sx-surface-3 text-sx-text-secondary'
                            }`}
                          >
                            {selectedElement.properties.loop !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>

                        {/* Active Playback Status Indicator */}
                        <div className="p-2.5 rounded-lg bg-sx-input border border-sx-border-subtle text-xs flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <span className="text-[9px] uppercase tracking-wider text-sx-text-secondary font-semibold block">
                              Sumber Aktif
                            </span>
                            <span className="font-bold text-sx-text truncate block text-[11px] mt-0.5">
                              {selectedElement.properties.localFileName
                                ? `📁 ${selectedElement.properties.localFileName}`
                                : selectedElement.properties.audioUrl
                                ? `🌐 ${selectedElement.properties.audioUrl.slice(0, 35)}...`
                                : '🎵 Sample BGM Bawaan'}
                            </span>
                          </div>
                          <div className="shrink-0">
                            {audioEngine.getState().currentTrackId === selectedElement.id && isTestingAudio ? (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-sx-info-soft border border-sx-border-subtle text-sx-info text-[10px] font-bold">
                                <span className="w-2 h-2 rounded-full bg-sx-info animate-ping" />
                                Memutar
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-sx-bg text-sx-text-secondary text-[10px] font-semibold">
                                Standby
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Play and Stop Buttons */}
                        <div className="pt-2 border-t border-sx-border-subtle flex items-center justify-between gap-2">
                          <span className="text-[11px] text-sx-text-secondary">Kontrol Pemutaran Audio:</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handlePlayManualAudio}
                              className="px-3 py-1.5 rounded-lg bg-sx-info hover:bg-sx-info text-sx-text text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
                            >
                              {audioEngine.getState().currentTrackId === selectedElement.id && isTestingAudio ? (
                                <>
                                  <Pause className="w-3.5 h-3.5" /> Jeda
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" /> Putar Audio
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={handleStopManualAudio}
                              className="px-3 py-1.5 rounded-lg bg-sx-surface-3 hover:bg-sx-surface-3 text-sx-text text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                              title="Hentikan dan reset posisi playback ke awal"
                            >
                              <Square className="w-3 h-3 fill-current" /> Stop
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Running Text */}
                    {selectedElement.type === 'running_text' && (
                      <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle space-y-3">
                        <span className="text-xs font-bold text-sx-info flex items-center gap-1.5">
                          <Type className="w-4 h-4" /> Konten Teks Berjalan (Marquee)
                        </span>
                        <div>
                          <label className="text-[11px] font-bold text-sx-text">Teks Siaran</label>
                          <textarea
                            rows={2}
                            value={selectedElement.properties.text || ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'text', e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Kecepatan (1-10)</label>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={selectedElement.properties.speed || 4}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'speed', parseInt(e.target.value) || 4)}
                              className="w-full mt-1 px-3 py-1.5 bg-sx-input border border-sx-border-subtle rounded-lg text-xs text-sx-text"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-sx-text">Warna Teks</label>
                            <input
                              type="color"
                              value={selectedElement.properties.textColor || '#60A5FA'}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'textColor', e.target.value)}
                              className="w-full h-8 mt-1 rounded bg-sx-input border border-sx-border-subtle cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Common Geometry & Transform (Editable X, Y, Width, Height) */}
                    <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-sx-text">
                        <span>Geometri &amp; Tata Letak Kanvas</span>
                        <span className="text-[10px] text-sx-accent-text font-mono">Bisa di luar batas layar</span>
                      </div>

                      {/* Position & Size */}
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-sx-text-secondary">X (%)</span>
                          <input
                            type="number"
                            value={selectedElement.x}
                            onChange={(e) => updateElementField(selectedElement.id, 'x', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 px-2 py-1 bg-sx-input border border-sx-border-subtle rounded text-center font-mono text-sx-text text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-sx-text-secondary">Y (%)</span>
                          <input
                            type="number"
                            value={selectedElement.y}
                            onChange={(e) => updateElementField(selectedElement.id, 'y', parseFloat(e.target.value) || 0)}
                            className="w-full mt-0.5 px-2 py-1 bg-sx-input border border-sx-border-subtle rounded text-center font-mono text-sx-text text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-sx-text-secondary">W (%)</span>
                          <input
                            type="number"
                            value={selectedElement.width}
                            min="2"
                            max="100"
                            onChange={(e) => updateElementField(selectedElement.id, 'width', parseFloat(e.target.value) || 10)}
                            className="w-full mt-0.5 px-2 py-1 bg-sx-input border border-sx-border-subtle rounded text-center font-mono text-sx-text text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-sx-text-secondary">H (%)</span>
                          <input
                            type="number"
                            value={selectedElement.height}
                            min="2"
                            max="100"
                            onChange={(e) => updateElementField(selectedElement.id, 'height', parseFloat(e.target.value) || 5)}
                            className="w-full mt-0.5 px-2 py-1 bg-sx-input border border-sx-border-subtle rounded text-center font-mono text-sx-text text-xs"
                          />
                        </div>
                      </div>

                      {/* Opacity & Rotation */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-sx-text">
                            <span>Opasitas</span>
                            <span className="font-mono text-sx-accent-text">{selectedElement.opacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={selectedElement.opacity}
                            onChange={(e) => updateElementField(selectedElement.id, 'opacity', parseInt(e.target.value))}
                            className="w-full mt-1 accent-blue-500"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-sx-text">
                            <span>Rotasi</span>
                            <span className="font-mono text-sx-accent-text">{selectedElement.rotation}°</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation}
                            onChange={(e) => updateElementField(selectedElement.id, 'rotation', parseInt(e.target.value))}
                            className="w-full mt-1 accent-blue-500"
                          />
                        </div>
                      </div>

                      {/* Layer order buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-sx-border-subtle">
                        <span className="text-[11px] text-sx-text-secondary">Urutan Lapisan (Layer #{selectedElement.layer})</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleMoveLayer(selectedElement.id, 'up')}
                            className="px-2.5 py-1 rounded bg-sx-input border border-sx-border text-xs text-sx-text hover:text-sx-text"
                          >
                            Ke Atas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveLayer(selectedElement.id, 'down')}
                            className="px-2.5 py-1 rounded bg-sx-input border border-sx-border text-xs text-sx-text hover:text-sx-text"
                          >
                            Ke Bawah
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center bg-sx-bg rounded-xl border border-sx-border-subtle space-y-2">
                  <Sliders className="w-8 h-8 text-sx-text-muted mx-auto mb-1" />
                  <p className="text-xs font-semibold text-sx-text">Tidak ada elemen yang dipilih</p>
                  <p className="text-[11px] text-sx-text-muted">
                    Klik salah satu elemen di canvas untuk mengatur properti, style, dan trigger-nya.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ELEMENT LIBRARY */}
          {activeSidePanel === 'elements' && (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              {/* Shortcut Banner to Full Sources Catalog */}
              <button
                type="button"
                onClick={() => setActiveSidePanel('sources')}
                className="w-full p-2.5 rounded-xl bg-gradient-to-r from-sx-bg via-sx-border-subtle to-sx-bg border border-sx-selected-border/40 text-sx-accent-text text-xs font-semibold flex items-center justify-between hover:border-sx-selected-border transition-all shadow-sm group"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-sx-accent-text group-hover:scale-110 transition-transform" />
                  <span>Katalog 25 Sumber Siaran Lengkap</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-sx-accent-text group-hover:translate-x-1 transition-transform" />
              </button>

              <div>
                <h3 className="text-xs font-bold text-sx-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-sx-accent-text" />
                  Sumber Video (Multi-Kamera)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('camera', 'Kamera Siaran')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-selected-border text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Camera className="w-4 h-4 text-sx-accent-text group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-accent/20 text-sx-accent-text text-[8px] font-bold rounded">
                        Multi-Cam
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Kamera / Facecam</span>
                    <span className="text-[10px] text-sx-text-secondary">Depan / belakang mandiri</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('screen_capture', 'Tangkapan Layar (Game)')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-danger text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Monitor className="w-4 h-4 text-sx-danger group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-danger-soft text-sx-danger text-[8px] font-bold rounded">
                        60 FPS
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Tangkapan Layar</span>
                    <span className="text-[10px] text-sx-text-secondary">MediaProjection game capture</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-sx-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-sx-warning" />
                  Elemen Interaksi &amp; Auto-Trigger
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('event_alert', 'Alert Gift & Follow')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-warning text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Bell className="w-4 h-4 text-sx-warning group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-warning/20 text-sx-warning text-[8px] font-bold rounded">
                        Auto Gift
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Alert Pop-up</span>
                    <span className="text-[10px] text-sx-text-secondary">Hadiah mawar/paus &amp; follow</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('chat_message', 'Live Chatbox')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-info text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <MessageSquare className="w-4 h-4 text-sx-info group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-info-soft text-sx-info text-[8px] font-bold rounded">
                        Auto Chat
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Kotak Chat Live</span>
                    <span className="text-[10px] text-sx-text-secondary">Komentar dengan VIP badge</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('combo_counter', 'Combo Gift Counter')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-warning text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Flame className="w-4 h-4 text-sx-warning group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-warning-soft text-sx-warning text-[8px] font-bold rounded">
                        Multiplier
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Combo Counter</span>
                    <span className="text-[10px] text-sx-text-secondary">Multiplier gift penonton</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('counter', 'Penghitung Like')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-success text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <TrendingUp className="w-4 h-4 text-sx-success group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-success/20 text-sx-success text-[8px] font-bold rounded">
                        Auto Like
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Goal / Tap Counter</span>
                    <span className="text-[10px] text-sx-text-secondary">Hitungan like &amp; tap layar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('song_request', 'Now Playing Song')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-border text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <ListMusic className="w-4 h-4 text-sx-accent-text group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-surface-3/20 text-sx-accent-text text-[8px] font-bold rounded">
                        Auto BGM
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Song Request Widget</span>
                    <span className="text-[10px] text-sx-text-secondary">Display judul &amp; requester</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('audio', 'Audio Manual (BGM)')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-border text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Volume2 className="w-4 h-4 text-sx-info group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-info-soft text-sx-info text-[8px] font-bold rounded">
                        Manual BGM
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Audio Manual (BGM)</span>
                    <span className="text-[10px] text-sx-text-secondary">Musik latar &amp; SFX independen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('running_text', 'Running Text (Ticker)')}
                    className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-selected-border text-left flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <Type className="w-4 h-4 text-sx-accent-text group-hover:scale-110 transition-transform" />
                      <span className="px-1.5 py-0.2 bg-sx-accent/20 text-sx-accent-text text-[8px] font-bold rounded">
                        Marquee
                      </span>
                    </div>
                    <span className="font-bold text-sx-text mt-1">Teks Berjalan</span>
                    <span className="text-[10px] text-sx-text-secondary">Pengumuman &amp; link Saweria</span>
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-sx-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-sx-success" />
                  Grafis Statis &amp; Video
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('image', 'Logo Siaran')}
                    className="p-2.5 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-success text-left flex items-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4 text-sx-success shrink-0" />
                    <div>
                      <span className="font-semibold text-sx-text block">Gambar / Logo</span>
                      <span className="text-[9px] text-sx-text-secondary">PNG transparan / sponsor</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('video', 'Video Background')}
                    className="p-2.5 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-border text-left flex items-center gap-2"
                  >
                    <Video className="w-4 h-4 text-sx-info shrink-0" />
                    <div>
                      <span className="font-semibold text-sx-text block">Video Loop</span>
                      <span className="text-[9px] text-sx-text-secondary">Background MP4/WebM</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SOURCES CATALOG (INTEGRATED SOURCES LIBRARY) */}
          {activeSidePanel === 'sources' && (
            <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
              <div className="p-3 bg-sx-info-soft/30 border border-sx-border-subtle/50 rounded-xl text-xs text-sx-accent-text flex items-start gap-2.5">
                <Box className="w-4 h-4 text-sx-accent-text shrink-0 mt-0.5" />
                <p>
                  Pustaka 25 sumber overlay siaran terkurasi. Klik <strong>Tambah</strong> untuk memasukkan sumber langsung ke kanvas dengan ukuran dan auto-trigger yang sesuai.
                </p>
              </div>

              {/* Category Filter & Search */}
              <div className="space-y-2">
                <div className="flex gap-1.5 p-1 bg-sx-bg rounded-xl border border-sx-border-subtle text-xs">
                  {(['all', 'basic', 'dynamic'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSourceCategoryFilter(cat)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                        sourceCategoryFilter === cat
                          ? 'bg-sx-accent text-sx-accent-fg shadow-sm'
                          : 'text-sx-text-secondary hover:text-sx-text'
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
                    className="w-full pl-8 pr-3 py-1.5 bg-sx-bg border border-sx-border-subtle rounded-xl text-xs text-sx-text placeholder:text-sx-text-muted focus:outline-none focus:border-sx-selected-border"
                  />
                  <Search className="w-3.5 h-3.5 text-sx-text-muted absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Source List */}
              <div className="space-y-2">
                {filteredSourcesList.map((src) => (
                  <div
                    key={src.name}
                    className="p-3 bg-sx-bg border border-sx-border-subtle hover:border-sx-selected-border/60 rounded-xl transition-all flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-sx-accent/10 border border-sx-info/30 flex items-center justify-center text-sx-accent-text shrink-0">
                        {src.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-sx-text flex items-center gap-1.5">
                          <span className="truncate">{src.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-sx-surface-3 text-sx-text-secondary font-normal shrink-0">
                            {src.category === 'basic' ? 'Dasar' : 'Dinamis'}
                          </span>
                        </div>
                        <p className="text-[10px] text-sx-text-secondary truncate mt-0.5">{src.description}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddQuickElement(src.type, src.name)}
                      className="px-2.5 py-1.5 rounded-lg bg-sx-accent hover:bg-sx-accent-hover text-sx-accent-fg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SHARED PRESET LIBRARY — one implementation for Studio and the Presets route */}
          {activeSidePanel === 'presets' && (
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <PresetLibrary
                presets={presets || []}
                activePresetId={activePresetId}
                variant="panel"
                onSelectPreset={onSelectPreset}
                onCreatePreset={onCreatePreset}
                onDuplicatePreset={onDuplicatePreset}
                onDeletePreset={onDeletePreset}
                onRenamePreset={onRenamePreset}
                onToggleFavorite={onToggleFavoritePreset}
                onCanImportPreset={async () => !isModeBMutationLocked}
              />
            </div>
          )}

          {/* TAB 4: MEDIA LIBRARY & LOCAL IMPORT */}
          {activeSidePanel === 'media' && (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              <div>
                <h3 className="text-xs font-bold text-sx-text flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-sx-success" /> Pustaka Media Lokal &amp; Import
                </h3>
                <p className="text-[10px] text-sx-text-secondary">
                  Pilih file gambar atau video langsung dari galeri Android atau masukkan URL
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
                  className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-success text-left flex flex-col gap-1 transition-all group"
                >
                  <Upload className="w-4 h-4 text-sx-success group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-xs text-sx-text">Import Gambar HP</span>
                  <span className="text-[9px] text-sx-text-secondary">Galeri / PNG / JPG / WebP</span>
                </button>

                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle hover:border-sx-border text-left flex flex-col gap-1 transition-all group"
                >
                  <Film className="w-4 h-4 text-sx-info group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-xs text-sx-text">Import Video HP</span>
                  <span className="text-[9px] text-sx-text-secondary">MP4 / WebM lokal</span>
                </button>
              </div>

              {mediaUploadError && (
                <div className="p-2 rounded bg-sx-danger-soft border border-sx-danger text-[11px] text-sx-danger flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {mediaUploadError}
                </div>
              )}

              {mediaModeBNotice && (
                <div className="p-2 rounded bg-sx-warning-soft border border-sx-warning/60 text-[11px] text-sx-warning flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {mediaModeBNotice}
                </div>
              )}

              {/* URL Manual Input Alternative */}
              <div className="p-3 rounded-xl bg-sx-bg border border-sx-border-subtle space-y-2">
                <label className="text-[10px] font-bold text-sx-text">Atau Gunakan Tautan URL Media</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={manualMediaUrlInput}
                    onChange={(e) => setManualMediaUrlInput(e.target.value)}
                    placeholder="https://.../gambar.png"
                    className="flex-1 px-3 py-1.5 bg-sx-input border border-sx-border-subtle rounded text-xs text-sx-text"
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
                    className="px-3 py-1.5 bg-sx-accent hover:bg-sx-accent-hover text-sx-accent-fg rounded text-xs font-semibold"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* Media Preview Box */}
              {previewMediaUrl && (
                <div className="p-3 rounded-xl bg-sx-bg border border-sx-success/30 space-y-2">
                  <div className="text-[11px] font-bold text-sx-success">Pratinjau Media Baru:</div>
                  <div className="w-full h-32 rounded bg-black/60 flex items-center justify-center overflow-hidden border border-sx-border-subtle">
                    {previewMediaType === 'image' ? (
                      <img src={previewMediaUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <video src={previewMediaUrl} controls className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
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
                      className="flex-1 py-1.5 bg-sx-success hover:bg-sx-success text-white rounded text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" /> Pasang Sebagai Elemen Baru
                    </button>
                    {selectedElement && (selectedElement.type === 'image' || selectedElement.type === 'sticker' || selectedElement.type === 'video') && (
                      <button
                        type="button"
                        disabled={isStrictModeBLocked}
                        onClick={() => handleApplyMediaToSelectedElement(previewMediaUrl, previewAssetId)}
                        className="py-1.5 px-3 bg-sx-accent hover:bg-sx-accent-hover text-sx-accent-fg rounded text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Terapkan ke elemen yang sedang dipilih di canvas"
                      >
                        Ganti Elemen Terpilih
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Media Items Catalog */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-sx-text-secondary uppercase tracking-wider">
                  Daftar Media Tersimpan ({mediaLibrary.length})
                </div>
                {mediaLibrary.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-sx-bg border border-sx-border-subtle flex items-center justify-between gap-3"
                  >
                    <div className="w-10 h-10 rounded bg-sx-bg border border-sx-border-subtle overflow-hidden shrink-0 flex items-center justify-center">
                      {item.type === 'image' ? (
                        <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-5 h-5 text-sx-info" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-sx-text truncate">{item.name}</div>
                      <div className="text-[9px] text-sx-text-muted capitalize">
                        {item.assetId ? `${item.type} lokal tersimpan` : `${item.type} URL`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewMediaUrl(item.url);
                          setPreviewMediaType(item.type);
                          setPreviewAssetId(item.assetId);
                        }}
                        className="p-1.5 rounded bg-sx-surface-3 text-sx-text hover:text-sx-text text-xs"
                        title="Lihat Pratinjau"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isStrictModeBLocked}
                        onClick={() => handleAddMediaToCanvas(item)}
                        className="p-1.5 rounded bg-sx-accent text-sx-accent-fg hover:bg-sx-accent-hover text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Tambahkan ke Kanvas"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {item.assetId && (
                        <button
                          type="button"
                          disabled={isStrictModeBLocked}
                          onClick={() => void handleDeleteLocalMediaAsset(item)}
                          className="p-1.5 rounded bg-sx-danger-soft text-sx-danger hover:bg-sx-danger-soft text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Hapus Asset Lokal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: LAYERS LIST — element groups and super-groups */}
          {activeSidePanel === 'layers' && (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-sx-text-secondary pb-1">
                <span>Lapisan &amp; Grup Kanvas</span>
                <span className="font-mono text-sx-accent-text">{elements.length} elemen</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isStrictModeBLocked || !onUpdateActivePreset || selectedLayerElementIds.length < 2}
                  onClick={handleCreatePresetGroup}
                  className="min-h-[40px] rounded-lg border border-sx-border bg-sx-info-soft/50 text-sx-accent-text text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Layers className="w-3.5 h-3.5 inline mr-1" /> Buat Grup ({selectedLayerElementIds.length})
                </button>
                <button
                  type="button"
                  disabled={isStrictModeBLocked || !onUpdateActivePreset || selectedLayerGroupIds.length < 2}
                  onClick={handleCreatePresetSuperGroup}
                  className="min-h-[40px] rounded-lg border border-sx-border bg-sx-info-soft text-sx-info text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Box className="w-3.5 h-3.5 inline mr-1" /> Supergroup ({selectedLayerGroupIds.length})
                </button>
              </div>

              {!activePreset && (
                <div className="p-2 rounded-lg bg-sx-warning-soft border border-sx-warning/40 text-[10px] text-sx-warning">
                  Pilih preset aktif untuk mengelola struktur grup.
                </div>
              )}

              {activeSuperGroups.length > 0 && (
                <section className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-sx-info font-bold">Supergroups</div>
                  {activeSuperGroups.map((superGroup) => {
                    const childGroups = activeGroups.filter((group) => superGroup.groupIds.includes(group.id));
                    return (
                      <div key={superGroup.id} className="p-2.5 rounded-xl border border-sx-border bg-sx-info-soft space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 text-xs font-bold text-sx-info truncate">{superGroup.name}</span>
                          <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetSuperGroupVisibility(superGroup.id, !superGroup.visible)} className="p-1.5 rounded bg-sx-bg text-sx-text disabled:opacity-40" title={superGroup.visible ? 'Sembunyikan supergroup' : 'Tampilkan supergroup'}>
                            {superGroup.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetSuperGroupLocked(superGroup.id, !superGroup.locked)} className={`p-1.5 rounded bg-sx-bg disabled:opacity-40 ${superGroup.locked ? 'text-sx-warning' : 'text-sx-text'}`} title={superGroup.locked ? 'Buka kunci supergroup' : 'Kunci supergroup'}>
                            {superGroup.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" disabled={isStrictModeBLocked} onClick={() => handleUngroupPresetSuperGroup(superGroup.id)} className="p-1.5 rounded bg-sx-bg text-sx-text-secondary hover:text-sx-danger disabled:opacity-40" title="Lepas supergroup">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {childGroups.map((group) => (
                            <span key={group.id} className="px-2 py-1 rounded-md bg-sx-bg/70 border border-sx-border-subtle text-[9px] text-sx-info">
                              {group.name} · {group.elementIds.length}
                            </span>
                          ))}
                          {childGroups.length === 0 && <span className="text-[10px] text-sx-text-muted">Tidak ada grup anak</span>}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              {activeGroups.length > 0 && (
                <section className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-sx-accent-text font-bold">Groups</div>
                  {activeGroups.map((group) => {
                    const childElements = group.elementIds.map((id) => elements.find((element) => element.id === id)).filter((element): element is StudioElement => Boolean(element));
                    const isSelectedForSuperGroup = selectedLayerGroupIds.includes(group.id);
                    return (
                      <div key={group.id} className="rounded-xl border border-sx-border bg-sx-info-soft/20 overflow-hidden">
                        <div className="p-2.5 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelectedForSuperGroup}
                            onChange={() => toggleLayerGroupSelection(group.id)}
                            aria-label={`Pilih ${group.name} untuk supergroup`}
                            className="accent-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => { setSelectedGroupId(group.id); setSelectedId(null); }}
                            className={`min-w-0 flex-1 text-left rounded-md px-1.5 py-1 ${selectedGroupId === group.id ? 'bg-sx-warning/15 ring-1 ring-sx-warning' : 'hover:bg-sx-bg/70'}`}
                            title="Pilih grup di canvas untuk memindahkan atau mengubah ukurannya"
                          >
                            <span className={`block text-xs font-bold truncate ${selectedGroupId === group.id ? 'text-sx-warning' : 'text-sx-accent-text'}`}>{group.name}</span>
                            <span className="block text-[9px] text-sx-text-secondary">{childElements.length} elemen · {group.elementIds.length} referensi</span>
                          </button>
                          <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetGroupVisibility(group.id, !group.visible)} className="p-1.5 rounded bg-sx-bg text-sx-text disabled:opacity-40" title={group.visible ? 'Sembunyikan grup' : 'Tampilkan grup'}>
                            {group.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" disabled={isStrictModeBLocked} onClick={() => handleSetGroupLocked(group.id, !group.locked)} className={`p-1.5 rounded bg-sx-bg disabled:opacity-40 ${group.locked ? 'text-sx-warning' : 'text-sx-text'}`} title={group.locked ? 'Buka kunci grup' : 'Kunci grup'}>
                            {group.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" disabled={isStrictModeBLocked} onClick={() => handleUngroupPresetGroup(group.id)} className="p-1.5 rounded bg-sx-bg text-sx-text-secondary hover:text-sx-danger disabled:opacity-40" title="Ungroup, elemen tetap ada">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="border-t border-sx-border-subtle px-2 py-1.5 space-y-1">
                          {childElements.map((elem) => (
                            <div key={elem.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-sx-bg/70">
                              <input
                                type="checkbox"
                                checked={selectedLayerElementIds.includes(elem.id)}
                                onChange={() => toggleLayerElementSelection(elem.id)}
                                aria-label={`Pilih elemen ${elem.name}`}
                                className="accent-blue-500"
                              />
                              <button type="button" onClick={() => { setSelectedGroupId(null); setSelectedId(elem.id); setActiveSidePanel('properties'); }} className="min-w-0 flex-1 text-left">
                                <span className="block text-[10px] text-sx-text truncate">{elem.name}</span>
                                <span className="block text-[9px] text-sx-text-muted">Layer #{elem.layer} · {elem.type}</span>
                              </button>
                            </div>
                          ))}
                          {childElements.length === 0 && <div className="text-[10px] text-sx-warning px-1 py-1">Referensi elemen tidak tersedia</div>}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              <section className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-sx-text-secondary font-bold">Elemen Lepas</div>
                {elements.filter((elem) => !activeGroups.some((group) => group.elementIds.includes(elem.id))).length === 0 ? (
                  <div className="p-3 text-center text-[10px] text-sx-text-muted bg-sx-bg rounded-xl border border-sx-border-subtle">Semua elemen sudah berada dalam grup.</div>
                ) : (
                  elements.filter((elem) => !activeGroups.some((group) => group.elementIds.includes(elem.id))).map((elem) => {
                    const isSelected = selectedId === elem.id;
                    const isLayerSelected = selectedLayerElementIds.includes(elem.id);
                    return (
                      <div key={elem.id} className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${isSelected ? 'bg-sx-info-soft/60 border-sx-selected-border' : 'bg-sx-bg border-sx-border-subtle'}`}>
                        <input
                          type="checkbox"
                          checked={isLayerSelected}
                          onChange={() => toggleLayerElementSelection(elem.id)}
                          aria-label={`Pilih elemen ${elem.name} untuk grup`}
                          className="accent-blue-500"
                        />
                        <button type="button" onClick={() => { setSelectedGroupId(null); setSelectedId(elem.id); setActiveSidePanel('properties'); }} className="min-w-0 flex-1 text-left">
                          <span className="block text-xs font-bold text-sx-text truncate">{elem.name}</span>
                          <span className="block text-[10px] text-sx-text-secondary">Layer #{elem.layer} · {elem.type}</span>
                        </button>
                        <button type="button" onClick={() => updateElementField(elem.id, 'visible', !elem.visible)} className="p-1.5 rounded-lg text-sx-text-secondary hover:text-sx-text" title={elem.visible ? 'Sembunyikan' : 'Tampilkan'}>
                          {elem.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => updateElementField(elem.id, 'locked', !elem.locked)} className={`p-1.5 rounded-lg text-sx-text-secondary hover:text-sx-text ${elem.locked ? 'text-sx-warning' : ''}`} title={elem.locked ? 'Buka kunci' : 'Kunci'}>
                          {elem.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })
                )}
              </section>
            </div>
          )}

          {/* TAB 6: PREVIEW & 7-STAGE TEST SIMULATOR */}
          {activeSidePanel === 'simulator' && (
            <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
              <div className="p-3 rounded-xl bg-sx-info-soft/40 border border-sx-border-subtle/60 text-xs text-sx-accent-text flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-sx-warning shrink-0 mt-0.5" />
                <p>
                  Uji respon elemen canvas langsung dengan simulasi interaktif. Semua event ditandai secara jujur sebagai{' '}
                  <span className="font-mono text-sx-warning font-bold">[SIMULASI]</span> agar terpisah dari event LIVE asli.
                </p>
              </div>

              {/* Event Simulator Grid */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => triggerSimulation('gift', 'RizkyKing', 'mengirim Paus Biru (2.150 Koin)!', 2150)}
                  className="w-full p-2.5 rounded-xl bg-gradient-to-r from-sx-accent to-sx-accent-hover hover:from-sx-accent text-sx-text text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sx-warning animate-spin" />
                    <span>[SIMULASI] Gift Paus (2.150 Koin)</span>
                  </div>
                  <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded">Pemicu Alert</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerSimulation('follow', 'Fajar_Streamer', 'mulai mengikuti siaran!')}
                  className="w-full p-2.5 rounded-xl bg-sx-bg border border-sx-border hover:border-sx-selected-border text-sx-text text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-sx-accent-text" />
                    <span>[SIMULASI] Follower Baru (@Fajar_Streamer)</span>
                  </div>
                  <span className="text-[10px] bg-sx-info-soft px-2 py-0.5 rounded text-sx-accent-text">Follow</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerSimulation('like', 'Viewer_Tap', 'mengetuk layar', 10)}
                  className="w-full p-2.5 rounded-xl bg-sx-bg border border-sx-success/40 hover:border-sx-success text-sx-text text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-sx-success" />
                    <span>[SIMULASI] Tap Layar / Like (+10 Likes)</span>
                  </div>
                  <span className="text-[10px] bg-sx-success-soft px-2 py-0.5 rounded text-sx-success">Like</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerSimulation('chat', 'Budi_Gamer', 'Keren bang, setting overlaynya rapi banget! 🔥')}
                  className="w-full p-2.5 rounded-xl bg-sx-bg border border-sx-info/40 hover:border-sx-info text-sx-text text-xs font-bold flex items-center justify-between shadow transition-all"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sx-info" />
                    <span>[SIMULASI] Komentar Live Chat</span>
                  </div>
                  <span className="text-[10px] bg-sx-info-soft px-2 py-0.5 rounded text-sx-info">Chat</span>
                </button>
              </div>

              {/* 7-STAGE SONG REQUEST TEST WORKFLOW (COMPACT DIAGNOSTIC TRIGGER) */}
              <div className="p-3.5 rounded-xl bg-sx-bg border border-sx-border-subtle/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-sx-accent-text flex items-center gap-1.5">
                    <Music className="w-4 h-4" /> Uji Alur Song Request
                  </div>
                  <span className="px-2 py-0.5 rounded bg-sx-surface-3/20 text-sx-accent-text font-mono text-[9px]">
                    7-Stage Pipeline
                  </span>
                </div>

                <p className="text-[11px] text-sx-text-secondary leading-relaxed">
                  Diagnostik lengkap pemisahan audio lokal, antrean penonton, TTS announcer, dan kepatuhan hukum YouTube ToS.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsSongTestModalOpen(true)}
                    className="w-full py-2.5 px-3 bg-sx-surface-3 hover:bg-sx-surface-3 text-sx-text rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Buka Diagnostik Pipeline</span>
                    {activeTestPipeline && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          activeTestPipeline.overallSuccess
                            ? 'bg-sx-success-soft text-sx-success border border-sx-success/40'
                            : 'bg-sx-danger-soft text-sx-danger border border-sx-danger'
                        }`}
                      >
                        {activeTestPipeline.overallSuccess ? '7 TAHAP OK' : 'GAGAL'}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: MARKETPLACE OVERLAYS & SCENE PACKS */}
          {activeSidePanel === 'marketplace' && (
            <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
              <div className="p-3 bg-sx-accent-soft border border-sx-border-subtle/50 rounded-xl text-xs text-sx-accent-text flex items-start gap-2.5">
                <ShoppingBag className="w-4 h-4 text-sx-accent-text shrink-0 mt-0.5" />
                <p>
                  Katalog pack overlay, alert, dan widget siap pakai. Klik <strong>Pasang</strong> untuk menerapkan elemen desain langsung ke kanvas siaran Anda.
                </p>
              </div>

              {/* Category Filter & Search */}
              <div className="space-y-2">
                <div className="flex gap-1 overflow-x-auto no-scrollbar p-1 bg-sx-bg rounded-xl border border-sx-border-subtle text-[11px]">
                  {(['all', 'scene', 'alert', 'goal', 'chat', 'widget'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMarketplaceCategoryFilter(cat)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg font-semibold capitalize transition-colors ${
                        marketplaceCategoryFilter === cat
                          ? 'bg-sx-surface-3 text-sx-text shadow-sm'
                          : 'text-sx-text-secondary hover:text-sx-text'
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
                    className="w-full pl-8 pr-3 py-1.5 bg-sx-bg border border-sx-border-subtle rounded-xl text-xs text-sx-text placeholder:text-sx-text-muted focus:outline-none focus:border-sx-border"
                  />
                  <Search className="w-3.5 h-3.5 text-sx-text-muted absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2.5">
                {filteredMarketplaceList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-sx-bg border border-sx-border-subtle hover:border-sx-border/60 rounded-xl transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-sx-text flex items-center gap-1.5">
                          <span>{item.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-sx-accent-soft text-sx-accent-text font-mono">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-sx-text-secondary mt-0.5 line-clamp-2">{item.description}</p>
                        <div className="text-[9px] text-sx-text-muted mt-1 flex items-center gap-2">
                          <span>Oleh {item.author}</span>
                          <span>·</span>
                          <span className="text-sx-warning flex items-center gap-0.5">
                            ★ {item.rating}
                          </span>
                          <span>·</span>
                          <span>{item.elementsPayload.length} Elemen</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleInstallMarketplacePack(item)}
                        className="px-3 py-1.5 rounded-lg bg-sx-surface-3 hover:bg-sx-surface-3 text-sx-text text-xs font-bold flex items-center gap-1 shrink-0 transition-colors shadow"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Pasang</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7-STAGE SONG REQUEST DIAGNOSTIC MODAL */}
      {isSongTestModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overscroll-contain"
          onClick={() => setIsSongTestModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-sx-input border border-sx-border-subtle/80 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-sx-border-subtle pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sx-surface-3/20 border border-sx-border/40 flex items-center justify-center text-sx-accent-text shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-sx-text flex items-center gap-2">
                    Diagnostik Pipeline Song Request
                  </h3>
                  <p className="text-[10px] text-sx-text-secondary">Pengujian 7-Tahap Alur & Kepatuhan Layanan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSongTestModalOpen(false)}
                className="p-1.5 rounded-lg bg-sx-surface-3 hover:bg-sx-surface-3 text-sx-text-secondary hover:text-sx-text transition-colors"
                title="Tutup Diagnostik"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input & Run Test */}
            <div className="flex gap-2 shrink-0">
              <input
                type="text"
                value={testQueryInput}
                onChange={(e) => setTestQueryInput(e.target.value)}
                placeholder="Judul lagu test (e.g. Neon Horizon)"
                className="flex-1 px-3 py-2 bg-sx-bg border border-sx-border-subtle rounded-xl text-xs text-sx-text placeholder:text-sx-text-muted focus:outline-none focus:border-sx-border"
              />
              <button
                type="button"
                onClick={handleRun7StageSongTest}
                className="px-3.5 py-2 bg-sx-surface-3 hover:bg-sx-surface-3 text-sx-text rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-colors shadow"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Jalankan Uji 7 Tahap</span>
              </button>
            </div>

            {/* Scrollable Pipeline Stage Results */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
              {activeTestPipeline ? (
                <>
                  <div className="flex items-center justify-between text-[11px] pb-1 border-b border-sx-border-subtle">
                    <span className="font-bold text-sx-text">Hasil Uji: {activeTestPipeline.command}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        activeTestPipeline.overallSuccess
                          ? 'bg-sx-success-soft text-sx-success border border-sx-success/40'
                          : 'bg-sx-danger-soft text-sx-danger border border-sx-danger'
                      }`}
                    >
                      {activeTestPipeline.overallSuccess ? '7 TAHAP SUKSES' : 'TAHAP GAGAL'}
                    </span>
                  </div>

                  {Object.values(activeTestPipeline.stages).map((stage) => (
                    <div
                      key={stage.stageNumber}
                      className="p-2.5 rounded-lg bg-sx-bg border border-sx-border-subtle text-[10px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-sx-text">
                          Tahap {stage.stageNumber}: {stage.name}
                        </span>
                        <span
                          className={
                            stage.status === 'success'
                              ? 'text-sx-success font-mono'
                              : stage.status === 'warning'
                              ? 'text-sx-warning font-mono'
                              : 'text-sx-danger font-mono'
                          }
                        >
                          {stage.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sx-text-secondary">{stage.summary}</div>
                      <div className="text-[9px] text-sx-text-muted font-mono truncate">{stage.technicalDetail}</div>
                    </div>
                  ))}

                  {/* YouTube ToS Compliance Notice */}
                  <div className="p-2.5 rounded-lg bg-sx-bg/80 border border-sx-border-subtle text-[9px] text-sx-text-secondary leading-relaxed flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sx-accent-text shrink-0 mt-0.5" />
                    <span>
                      <strong>Kepatuhan Hukum YouTube:</strong> Pemisahan audio dari video tanpa layar melanggar Ketentuan Layanan YouTube. SYNTXRR STREAM menggunakan file audio lokal streamer dan sumber bebas royalti untuk routing audio streaming yang sah.
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-sx-text-muted text-xs flex flex-col items-center justify-center space-y-2">
                  <Music className="w-8 h-8 text-sx-text-muted mb-1" />
                  <p className="font-medium text-sx-text-secondary">Belum ada hasil pengujian pipeline</p>
                  <p className="text-[10px] text-sx-text-muted max-w-xs">
                    Ketik judul lagu di atas dan klik &ldquo;Jalankan Uji 7 Tahap&rdquo; untuk memeriksa setiap tahap alur Song Request.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-sx-border-subtle flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsSongTestModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-sx-surface-3 hover:bg-sx-surface-3 text-xs font-semibold text-sx-text hover:text-sx-text transition-colors"
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
