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
  percentToUnitVolume,
  unitVolumeToPercent,
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
import {
  buildBlankPresetDraft,
  clonePresetWithRemappedIds,
  submitAsyncPresetCreation,
  type StudioSaveState,
} from '../services/studioPresetActions';
import { exportPresetPackageFile, importPresetPackageFile } from '../services/presetTransfer';
import { StudioPresetHub } from './studio/StudioPresetHub';
import {
  requestStudioDeviceOrientation,
  resolveDeviceOrientationForPreset,
  restoreStudioDeviceOrientation,
  type StudioDeviceOrientation,
} from '../services/studioOrientationBridge';
import { SOURCE_CATALOG } from './SourcesLibraryView';
import {
  createStudioElementFromSource,
  normalizeStudioElementProperties,
} from '../services/studioElementCatalog';
import { soundboardEngine } from '../services/soundboardEngine';
import {
  appendChatMessageFromEvent,
  appendUniqueStreamEvent,
  applyLikeEventToCount,
  buildChatMessagesFromHistory,
  buildEventFeedItems,
  buildLeaderboardEntries,
  buildLiveTextRenderModel,
  computeProgressBarModel,
  deduplicateStreamEvents,
  deriveInitialLikeCountFromHistory,
  extractViewerCountFromEvent,
  getActiveTargetTextFromElements,
  getLatestAudienceUsernameFromHistory,
  getLatestViewerCountFromHistory,
  getTopDonorNameFromHistory,
  resolveActiveUsernameModel,
  resolveDynamicAvatarModel,
  resolveDynamicTextOutput,
  resolveSeparatorStyle,
  resolveSoundboardControlModel,
  resolveStickerVisualModel,
  resolveViewerCounterDisplay,
  shouldPlayEventAlertSound,
  shouldShowViewerLiveBadge,
  type SupportedSoundboardSfx,
  type StudioChatItem,
  validateSafeBrowserEmbedUrl,
} from '../services/studioElementRenderModel';
import {
  canMutateStudioElementField,
  classifyCanvasElementPointerMove,
  isInteractiveCanvasChildTarget,
  isStudioElementReadOnly,
  resolveCanvasElementPointerUp,
  shouldClosePropertiesOnCanvasBackgroundClick,
  type PendingCanvasElementGesture,
} from '../services/studioCanvasGesture';
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
  User,
  Users,
  Award,
  Radio,
  MoreVertical,
  ArrowLeft,
} from 'lucide-react';

interface StudioViewProps {
  elements: StudioElement[];
  canvasOrientation: CanvasOrientation;
  onChangeOrientation: (orientation: CanvasOrientation) => void;
  onUpdateElements: (elements: StudioElement[]) => void;
  onSaveActivePreset?: () => Promise<{ success: boolean; message: string } | boolean | void> | boolean | void;
  onSaveAsPreset: () => Promise<boolean | void> | boolean | void;
  saveState?: StudioSaveState;
  // Shared Presets System integration
  presets?: StudioPreset[];
  activePresetId?: string;
  activePreset?: StudioPreset | null;
  onUpdateActivePreset?: (patch: Partial<StudioPreset>) => void | Promise<void>;
  onSelectPreset?: (presetId: string) => void;
  onCreatePreset?: (preset: Omit<StudioPreset, 'id' | 'createdAt'>) => Promise<boolean | void> | boolean | void;
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
  onFullscreenWorkspaceChange?: (isFullscreen: boolean) => void;
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

function toSafeHexColor(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
  }
  return fallback;
}

function clampNumericRange(rawValue: string, min: number, max: number, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

const INSPECTOR_SOUNDBOARD_OPTIONS: ReadonlyArray<{ value: SupportedSoundboardSfx; label: string }> = [
  { value: 'cheer', label: 'Cheer / Tepuk Tangan' },
  { value: 'horn', label: 'Air Horn' },
  { value: 'level_up', label: 'Level Up' },
  { value: 'game_over', label: 'Game Over' },
  { value: 'tada', label: 'Tada Fanfare' },
  { value: 'bell', label: 'Crystal Bell' },
];

const INSPECTOR_STICKER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'fire', label: '🔥 Fire Hype' },
  { value: 'heart', label: '❤️ Love Tap' },
  { value: 'love', label: '💖 Super Love' },
  { value: 'star', label: '⭐ Star Vote' },
  { value: 'clap', label: '👏 Applause' },
  { value: 'rocket', label: '🚀 Boost' },
  { value: 'laugh', label: '😂 LOL' },
  { value: 'crown', label: '👑 VIP Crown' },
  { value: 'gift', label: '🎁 Special Gift' },
];

export const StudioView: React.FC<StudioViewProps> = ({
  elements,
  canvasOrientation,
  onChangeOrientation,
  onUpdateElements,
  onSaveActivePreset,
  onSaveAsPreset,
  saveState,
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
  onFullscreenWorkspaceChange,
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

  // Canvas Pan, Zoom & Fullscreen Stage Sizing
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

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

  // Dynamic Live Event & Counter States (initialized cleanly from event bus history)
  const [studioEventHistory, setStudioEventHistory] = useState<StreamEvent[]>(() =>
    deduplicateStreamEvents(streamEventBus.getHistory(), 50),
  );
  const [latestViewerCount, setLatestViewerCount] = useState<number | null>(() =>
    getLatestViewerCountFromHistory(streamEventBus.getHistory()),
  );
  const [simulatedLikes, setSimulatedLikes] = useState<number>(() =>
    deriveInitialLikeCountFromHistory(streamEventBus.getHistory()),
  );
  const [recentChatList, setRecentChatList] = useState<StudioChatItem[]>(() =>
    buildChatMessagesFromHistory(streamEventBus.getHistory(), 20),
  );

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

  // Presets Category Filter & Async Integrity States
  const [presetFilterCategory, setPresetFilterCategory] = useState<PresetCategory>('all');
  const [newPresetModalOpen, setNewPresetModalOpen] = useState(false);
  const [newPresetNameInput, setNewPresetNameInput] = useState('');
  const [newPresetDescInput, setNewPresetDescInput] = useState('');
  const [isCreatingSidebarPreset, setIsCreatingSidebarPreset] = useState(false);
  const [sidebarCreateError, setSidebarCreateError] = useState<string | null>(null);

  const [isSavingActivePreset, setIsSavingActivePreset] = useState(false);
  const [isSavingCopy, setIsSavingCopy] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Preset Selector ALWAYS opens first whenever entering Studio
  const [showPresetSelector, setShowPresetSelector] = useState<boolean>(true);
  const [hasEnteredCanvasSession, setHasEnteredCanvasSession] = useState<boolean>(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState<boolean>(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState<boolean>(false);
  const [isCanvasLivePreview, setIsCanvasLivePreview] = useState<boolean>(false);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const presetImportInputRef = useRef<HTMLInputElement | null>(null);
  const isPresetTransferringRef = useRef<boolean>(false);
  const [isTransferringPreset, setIsTransferringPreset] = useState<boolean>(false);
  const [presetTransferNotice, setPresetTransferNotice] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);

  const [selectorCreateModalOpen, setSelectorCreateModalOpen] = useState(false);
  const [selectorPresetName, setSelectorPresetName] = useState('');
  const [selectorCategory, setSelectorCategory] = useState<PresetCategory>('hp_screen');
  const [selectorOrientation, setSelectorOrientation] = useState<CanvasOrientation>('9:16');
  const [selectorDescription, setSelectorDescription] = useState('');
  const [selectorTemplate, setSelectorTemplate] = useState<'blank' | 'gaming' | 'chatting' | 'music'>('gaming');
  const [selectorFilterCategory, setSelectorFilterCategory] = useState<PresetCategory>('all');
  const [editingPresetIdInSelector, setEditingPresetIdInSelector] = useState<string | null>(null);
  const [editingNameInSelector, setEditingNameInSelector] = useState('');
  const [isCreatingBlankCanvas, setIsCreatingBlankCanvas] = useState(false);
  const [selectorActionError, setSelectorActionError] = useState<string | null>(null);
  const [isCreatingSelectorPreset, setIsCreatingSelectorPreset] = useState(false);
  const [selectorCreateError, setSelectorCreateError] = useState<string | null>(null);

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

  // UNIFIED POINTER TAP, DRAG & RESIZE REFS
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pendingElementGestureRef = useRef<PendingCanvasElementGesture | null>(null);
  const suppressNextCanvasClickRef = useRef<boolean>(false);

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

  const hasRequestedNativeOrientationRef = useRef<boolean>(false);
  const lastNativeOrientationRef = useRef<StudioDeviceOrientation | null>(null);
  const isModeBMutationLockedRef = useRef<boolean>(isModeBMutationLocked);
  isModeBMutationLockedRef.current = isModeBMutationLocked;
  const targetDeviceOrientation = resolveDeviceOrientationForPreset(canvasOrientation);

  // Hide global Header & BottomNav only while inside the active Studio editing workspace
  useEffect(() => {
    onFullscreenWorkspaceChange?.(!showPresetSelector);
  }, [onFullscreenWorkspaceChange, showPresetSelector]);

  useEffect(() => {
    return () => {
      onFullscreenWorkspaceChange?.(false);
    };
  }, [onFullscreenWorkspaceChange]);

  // Request native Activity orientation inside workspace (16:9 -> landscape, 9:16 & 1:1 -> portrait)
  // and restore initial orientation on exit/unmount without touching Mode B when locked.
  useEffect(() => {
    if (showPresetSelector) {
      if (hasRequestedNativeOrientationRef.current && !isModeBMutationLocked) {
        hasRequestedNativeOrientationRef.current = false;
        lastNativeOrientationRef.current = null;
        void restoreStudioDeviceOrientation();
      }
      return;
    }

    if (isModeBMutationLocked) {
      return;
    }

    if (
      !hasRequestedNativeOrientationRef.current ||
      lastNativeOrientationRef.current !== targetDeviceOrientation
    ) {
      hasRequestedNativeOrientationRef.current = true;
      lastNativeOrientationRef.current = targetDeviceOrientation;
      void requestStudioDeviceOrientation(targetDeviceOrientation);
    }
  }, [showPresetSelector, targetDeviceOrientation, isModeBMutationLocked]);

  useEffect(() => {
    return () => {
      if (hasRequestedNativeOrientationRef.current && !isModeBMutationLockedRef.current) {
        hasRequestedNativeOrientationRef.current = false;
        lastNativeOrientationRef.current = null;
        void restoreStudioDeviceOrientation();
      }
    };
  }, []);

  // Dynamically measure interactive Stage bounds so Canvas fills available viewport accurately
  useEffect(() => {
    if (showPresetSelector) {
      setStageSize(null);
      return;
    }
    const node = stageContainerRef.current;
    if (!node) return;

    const updateSize = () => {
      const width = Math.max(0, Math.floor(node.clientWidth));
      const height = Math.max(0, Math.floor(node.clientHeight));
      setStageSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateSize();
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [showPresetSelector]);

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
  const selectedElementIndex = selectedElement
    ? elements.findIndex((element) => element.id === selectedElement.id)
    : -1;

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
  const isSelectedElementGroupLocked = selectedElement
    ? isElementLockedByGroup(selectedElement.id)
    : false;
  const isSelectedElementHiddenByGroup = selectedElement
    ? isElementHiddenByGroup(selectedElement.id)
    : false;
  const isSelectedElementLocked = Boolean(selectedElement?.locked);
  const isSelectedElementReadOnly = isStudioElementReadOnly({
    elementLocked: isSelectedElementLocked,
    isElementGroupLocked: isSelectedElementGroupLocked,
    isStrictModeBLocked,
  });
  const canToggleSelectedElementLock = Boolean(
    selectedElement && !isStrictModeBLocked && !isSelectedElementGroupLocked,
  );
  const canMutateSelectedElement = Boolean(
    selectedElement && !isSelectedElementReadOnly,
  );
  const canMoveSelectedLayerUp = Boolean(
    canMutateSelectedElement &&
      selectedElementIndex !== -1 &&
      selectedElementIndex < elements.length - 1,
  );
  const canMoveSelectedLayerDown = Boolean(
    canMutateSelectedElement && selectedElementIndex > 0,
  );

  // A preset is a separate editing document: never carry selection or undo history across it.
  useEffect(() => {
    if (previousPresetIdRef.current === activePresetId) return;
    previousPresetIdRef.current = activePresetId;
    setSelectedId(null);
    setSelectedLayerElementIds([]);
    setSelectedLayerGroupIds([]);
    setSelectedGroupId(null);
    setIsMobilePanelOpen(false);
    setHistory([]);
    setRedoStack([]);
    setActiveReactions({});
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
    setIsCanvasLivePreview(false);
    setNewPresetModalOpen(false);
    setSidebarCreateError(null);
    setSaveFeedback(null);
    isLiveDragRef.current = false;
    preDragElementsRef.current = null;
    pendingElementGestureRef.current = null;
    suppressNextCanvasClickRef.current = false;
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
    if (!selectedId) return;
    if (!elements.some((elem) => elem.id === selectedId)) {
      setSelectedId(null);
      setIsMobilePanelOpen((open) => (activeSidePanel === 'properties' ? false : open));
    }
  }, [elements, selectedId, activeSidePanel]);

  useEffect(() => {
    if (saveState?.status === 'pending') {
      setSaveFeedback((prev) => (prev?.tone === 'ok' ? null : prev));
    }
  }, [saveState?.status]);

  useEffect(() => {
    if (selectedGroupId && !activeGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [activeGroups, selectedGroupId]);

  useEffect(() => {
    if (!isHeaderMenuOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setIsHeaderMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHeaderMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHeaderMenuOpen]);

  useEffect(() => {
    if (!isCanvasLivePreview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCanvasLivePreview(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCanvasLivePreview]);

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

  // EVENT-TO-ELEMENT ENGINE: Single clean subscription to streamEventBus
  useEffect(() => {
    const unsubscribe = streamEventBus.subscribe((event: StreamEvent) => {
      const now = Date.now();
      setStudioEventHistory((prev) => appendUniqueStreamEvent(prev, event, 50));

      if (event.type === 'viewer') {
        const nextViewerCount = extractViewerCountFromEvent(event);
        if (nextViewerCount !== null) {
          setLatestViewerCount(nextViewerCount);
        }
      } else if (event.type === 'like') {
        setSimulatedLikes((prev) => applyLikeEventToCount(prev, event));
      } else if (event.type === 'chat') {
        setRecentChatList((prev) => appendChatMessageFromEvent(prev, event, 20));
      }

      elementsRef.current.forEach((elem) => {
        let isMatch = false;
        let action: 'show' | 'pulse' | 'bounce' | 'text_update' = 'pulse';
        const durationSec = elem.triggerConfig?.durationSec || 5;
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
            if (shouldPlayEventAlertSound(elem.properties)) {
              soundSynth.playAlertChime(event.type === 'gift' ? 'gift' : 'follower');
            }
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
            soundSynth.playAlertChime('chat_event');
          }
        } else if (elem.type === 'counter') {
          if (event.type === 'like') {
            isMatch = true;
            action = 'pulse';
            soundSynth.playAlertChime('like');
          }
        } else if (elem.type === 'live_viewer_counter') {
          if (event.type === 'viewer' && extractViewerCountFromEvent(event) !== null) {
            isMatch = true;
            action = 'pulse';
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
  }, []);

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
    const targetElem = elementsRef.current.find((elem) => elem.id === id);
    if (!targetElem) return;
    if (
      !canMutateStudioElementField({
        elementLocked: targetElem.locked,
        isElementGroupLocked: isElementLockedByGroup(id),
        isStrictModeBLocked,
        field: String(field),
      })
    ) {
      return;
    }
    const updated = elementsRef.current.map((elem) => {
      if (elem.id === id) {
        return { ...elem, [field]: value };
      }
      return elem;
    });
    commitElements(updated);
  };

  const updateElementProperty = (id: string, key: string, value: any) => {
    const targetElem = elementsRef.current.find((elem) => elem.id === id);
    if (
      !targetElem ||
      isStudioElementReadOnly({
        elementLocked: targetElem.locked,
        isElementGroupLocked: isElementLockedByGroup(id),
        isStrictModeBLocked,
      })
    ) {
      return;
    }
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
    const targetElem = elementsRef.current.find((elem) => elem.id === id);
    if (
      !targetElem ||
      isStudioElementReadOnly({
        elementLocked: targetElem.locked,
        isElementGroupLocked: isElementLockedByGroup(id),
        isStrictModeBLocked,
      })
    ) {
      return;
    }
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

  // Add Element via unified catalog factory (consistent with SourcesLibrary & Tab Sumber)
  const handleAddQuickElement = (type: SourceType, _defaultName?: string) => {
    if (isStrictModeBLocked) return;
    const newElem = createStudioElementFromSource(type, elements);

    commitElements([...elements, newElem]);
    setSelectedGroupId(null);
    setSelectedId(newElem.id);
    setActiveSidePanel('properties');
    setIsMobilePanelOpen(false);
  };

  const handleDuplicate = (id: string) => {
    const target = elements.find((e) => e.id === id);
    if (
      !target ||
      isStudioElementReadOnly({
        elementLocked: target.locked,
        isElementGroupLocked: isElementLockedByGroup(id),
        isStrictModeBLocked,
      })
    ) {
      return;
    }
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
    const target = elements.find((e) => e.id === id);
    if (
      !target ||
      isStudioElementReadOnly({
        elementLocked: target.locked,
        isElementGroupLocked: isElementLockedByGroup(id),
        isStrictModeBLocked,
      })
    ) {
      return;
    }
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
      setSelectedId(null);
      setIsMobilePanelOpen((open) => (activeSidePanel === 'properties' ? false : open));
    }
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    const target = elements.find((e) => e.id === id);
    if (
      !target ||
      isStudioElementReadOnly({
        elementLocked: target.locked,
        isElementGroupLocked: isElementLockedByGroup(id),
        isStrictModeBLocked,
      })
    ) {
      return;
    }
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

  // UNIFIED POINTER TAP, DRAG & RESIZE SYSTEM (TAP <= 8px OPENS INSPECTOR, DRAG > 8px MOVES ELEMENT)
  const handleElementPointerDown = (e: React.PointerEvent, elem: StudioElement) => {
    if (isCanvasLivePreview || e.button !== 0) return;
    if (isInteractiveCanvasChildTarget(e.target, e.currentTarget)) return;

    e.stopPropagation();
    setIsPanning(false);

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    const canDrag = !isStudioElementReadOnly({
      elementLocked: elem.locked,
      isElementGroupLocked: isElementLockedByGroup(elem.id),
      isStrictModeBLocked,
    });

    isLiveDragRef.current = false;
    preDragElementsRef.current = null;
    pendingElementGestureRef.current = {
      kind: 'pending_tap',
      elementId: elem.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: elem.x,
      origY: elem.y,
      origW: elem.width,
      origH: elem.height,
      canDrag,
      resizeHandle: null,
    };
  };

  const handleResizePointerDown = (e: React.PointerEvent, elem: StudioElement, handle: string) => {
    if (
      isCanvasLivePreview ||
      e.button !== 0 ||
      isStudioElementReadOnly({
        elementLocked: elem.locked,
        isElementGroupLocked: isElementLockedByGroup(elem.id),
        isStrictModeBLocked,
      })
    ) {
      return;
    }
    e.stopPropagation();
    setIsPanning(false);
    setSelectedGroupId(null);
    setSelectedId(elem.id);

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    preDragElementsRef.current = elementsRef.current;
    isLiveDragRef.current = false;
    pendingElementGestureRef.current = {
      kind: 'resizing',
      elementId: elem.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: elem.x,
      origY: elem.y,
      origW: elem.width,
      origH: elem.height,
      canDrag: true,
      resizeHandle: handle,
    };
  };

  const handleGroupPointerDown = (
    e: React.PointerEvent,
    group: StudioPresetGroup,
    mode: 'move' | 'resize',
    handle: string | null = null,
  ) => {
    if (isCanvasLivePreview || e.button !== 0 || isPresetGroupLocked(group)) return;
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
      suppressNextCanvasClickRef.current = true;
      return;
    }

    const gesture = pendingElementGestureRef.current;
    if (!canvasRef.current || !gesture || gesture.pointerId !== e.pointerId) return;

    const classification = classifyCanvasElementPointerMove({
      gesture,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (classification.outcome === 'still_pending') {
      return;
    }

    if (classification.outcome === 'ignore') {
      if (gesture.kind === 'pending_tap' && !gesture.canDrag) {
        gesture.kind = 'cancelled_locked_move';
      }
      return;
    }

    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    if (classification.outcome === 'confirm_drag') {
      gesture.kind = 'dragging';
      preDragElementsRef.current = elementsRef.current;
      isLiveDragRef.current = true;
      suppressNextCanvasClickRef.current = true;
      setSelectedGroupId(null);
      setSelectedId(gesture.elementId);
      if (classification.shouldClosePropertiesInspector) {
        setIsMobilePanelOpen((open) => (activeSidePanel === 'properties' ? false : open));
      }
    }

    const deltaX = ((e.clientX - gesture.startX) / rect.width) * 100;
    const deltaY = ((e.clientY - gesture.startY) / rect.height) * 100;

    if (gesture.kind === 'dragging') {
      const newX = Math.round((gesture.origX + deltaX) * 10) / 10;
      const newY = Math.round((gesture.origY + deltaY) * 10) / 10;
      isLiveDragRef.current = true;
      updateElementLive(gesture.elementId, { x: newX, y: newY });
    } else if (gesture.kind === 'resizing') {
      const handle = gesture.resizeHandle || 'bottom-right';
      let newW = gesture.origW;
      let newH = gesture.origH;
      let newX = gesture.origX;
      let newY = gesture.origY;

      if (handle.includes('right')) {
        newW = Math.max(5, Math.round((gesture.origW + deltaX) * 10) / 10);
      }
      if (handle.includes('bottom')) {
        newH = Math.max(3, Math.round((gesture.origH + deltaY) * 10) / 10);
      }
      if (handle.includes('left')) {
        const proposedW = Math.max(5, Math.round((gesture.origW - deltaX) * 10) / 10);
        newX = Math.round((gesture.origX + (gesture.origW - proposedW)) * 10) / 10;
        newW = proposedW;
      }
      if (handle.includes('top')) {
        const proposedH = Math.max(3, Math.round((gesture.origH - deltaY) * 10) / 10);
        newY = Math.round((gesture.origY + (gesture.origH - proposedH)) * 10) / 10;
        newH = proposedH;
      }

      isLiveDragRef.current = true;
      suppressNextCanvasClickRef.current = true;
      updateElementLive(gesture.elementId, { x: newX, y: newY, width: newW, height: newH });
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

    const gesture = pendingElementGestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    pendingElementGestureRef.current = null;
    const resolution = resolveCanvasElementPointerUp({
      gesture,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (resolution.outcome === 'open_inspector' && resolution.targetElementId) {
      isLiveDragRef.current = false;
      preDragElementsRef.current = null;
      suppressNextCanvasClickRef.current = false;
      const targetExists = elementsRef.current.some((item) => item.id === resolution.targetElementId);
      if (targetExists) {
        setSelectedGroupId(null);
        setSelectedId(resolution.targetElementId);
        setActiveSidePanel('properties');
        setIsMobilePanelOpen(true);
      }
      return;
    }

    if (resolution.outcome === 'commit_drag_or_resize') {
      if (isLiveDragRef.current && preDragElementsRef.current) {
        const savedSnapshot = preDragElementsRef.current;
        setHistory((prev) => [...prev.slice(-15), savedSnapshot]);
        setRedoStack([]);
        suppressNextCanvasClickRef.current = true;
        window.setTimeout(() => {
          suppressNextCanvasClickRef.current = false;
        }, 0);
      }
      isLiveDragRef.current = false;
      preDragElementsRef.current = null;
      return;
    }

    isLiveDragRef.current = false;
    preDragElementsRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    const groupTransform = groupTransformRef.current;
    if (groupTransform.mode && groupTransform.pointerId !== null && e.pointerId === groupTransform.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
      if (isLiveDragRef.current) {
        elementsRef.current = groupTransform.originalElements;
        onUpdateElements(groupTransform.originalElements);
      }
      isLiveDragRef.current = false;
      preDragElementsRef.current = null;
      suppressNextCanvasClickRef.current = false;
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

    const gesture = pendingElementGestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (isLiveDragRef.current && preDragElementsRef.current) {
      const restoreSnapshot = preDragElementsRef.current;
      elementsRef.current = restoreSnapshot;
      onUpdateElements(restoreSnapshot);
    }
    pendingElementGestureRef.current = null;
    isLiveDragRef.current = false;
    preDragElementsRef.current = null;
    suppressNextCanvasClickRef.current = false;
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
      setIsMobilePanelOpen(false);
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
      setIsMobilePanelOpen(false);
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
    setIsMobilePanelOpen(false);
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
    setIsMobilePanelOpen(false);
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

  // Render Element on Canvas (All 26 SourceTypes explicitly handled with non-destructive render-time normalization)
  const renderElementContent = (elem: StudioElement) => {
    const normalizedElem = normalizeStudioElementProperties(elem);
    const props = normalizedElem.properties;
    const isCameraActive = !!activeCameraStreams[normalizedElem.id];
    const reaction = activeReactions[normalizedElem.id];

    let animClass = '';
    if (reaction) {
      if (reaction.action === 'bounce') animClass = 'animate-bounce ring-4 ring-[var(--app-accent)] shadow-2xl';
      else if (reaction.action === 'pulse') animClass = 'animate-pulse ring-4 ring-[var(--app-accent)] shadow-2xl';
      else if (reaction.action === 'show') animClass = 'animate-fadeIn ring-2 ring-emerald-400';
    }

    switch (normalizedElem.type) {
      case 'camera': {
        const aspectFit = props.aspectFit === 'contain' ? 'object-contain' : 'object-cover';
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950 border relative overflow-hidden flex flex-col items-center justify-center transition-all ${animClass}`}
            style={{
              borderColor: props.borderColor || '#F2C230',
              borderRadius: `${props.borderRadius ?? 14}px`,
              borderWidth: `${props.borderWidth ?? 2}px`,
            }}
          >
            {isCameraActive ? (
              <video
                ref={(el) => {
                  videoRefs.current[normalizedElem.id] = el;
                  if (el && activeCameraStreams[normalizedElem.id] && el.srcObject !== activeCameraStreams[normalizedElem.id]) {
                    el.srcObject = activeCameraStreams[normalizedElem.id];
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className={`w-full h-full ${aspectFit}`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 p-2 text-center select-none">
                <Camera className="w-6 h-6 text-[#F2C230] mb-1" />
                <span className="text-[10px] font-bold text-white truncate max-w-full px-1">{normalizedElem.name}</span>
                <span className="text-[9px] text-zinc-400">
                  {props.facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleCameraForElement(normalizedElem.id, props.facingMode);
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
      }

      case 'screen_capture': {
        const cropClass =
          props.cropMode === 'cover' || props.cropMode === 'fill'
            ? 'object-cover'
            : 'object-contain';
        const fpsVal =
          typeof props.fps === 'number' && Number.isFinite(props.fps) && props.fps > 0
            ? Math.round(props.fps)
            : 60;
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950 border border-zinc-700 relative overflow-hidden flex flex-col items-center justify-center ${animClass}`}
            style={{ borderRadius: `${props.borderRadius ?? 12}px` }}
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
                className={`w-full h-full ${cropClass} bg-black`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 p-3 text-center select-none">
                <Monitor className="w-8 h-8 text-rose-400 mb-1.5" />
                <span className="text-xs font-bold text-white">Tangkapan Layar Android</span>
                <span className="text-[9px] text-zinc-400 mt-0.5">MediaProjection {fpsVal} FPS</span>
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
      }

      case 'shape': {
        const borderWidth =
          typeof props.borderWidth === 'number' && Number.isFinite(props.borderWidth) && props.borderWidth >= 0
            ? props.borderWidth
            : 2;
        const borderRadius =
          typeof props.borderRadius === 'number' && Number.isFinite(props.borderRadius) && props.borderRadius >= 0
            ? props.borderRadius
            : 12;
        return (
          <div
            aria-label={normalizedElem.name}
            className={`w-full h-full transition-all ${animClass}`}
            style={{
              backgroundColor:
                typeof props.backgroundColor === 'string' && props.backgroundColor.trim()
                  ? props.backgroundColor
                  : 'rgba(242, 194, 48, 0.25)',
              borderColor:
                typeof props.borderColor === 'string' && props.borderColor.trim()
                  ? props.borderColor
                  : '#F2C230',
              borderWidth: `${borderWidth}px`,
              borderStyle: borderWidth > 0 ? 'solid' : 'none',
              borderRadius: `${borderRadius}px`,
            }}
          />
        );
      }

      case 'separator': {
        const sep = resolveSeparatorStyle(normalizedElem, props);
        return (
          <div
            aria-label={normalizedElem.name}
            className={`w-full h-full flex items-center justify-center ${animClass}`}
          >
            <div
              className="rounded-full"
              style={
                sep.orientation === 'vertical'
                  ? {
                      width: `${sep.thickness}px`,
                      height: '100%',
                      backgroundColor: sep.lineColor,
                      boxShadow: sep.glow ? `0 0 10px ${sep.lineColor}` : 'none',
                    }
                  : {
                      width: '100%',
                      height: `${sep.thickness}px`,
                      backgroundColor: sep.lineColor,
                      boxShadow: sep.glow ? `0 0 10px ${sep.lineColor}` : 'none',
                    }
              }
            />
          </div>
        );
      }

      case 'browser_embed': {
        const urlCheck = validateSafeBrowserEmbedUrl(props.url);
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950 border border-zinc-700 overflow-hidden flex flex-col ${animClass}`}
          >
            {urlCheck.isValid ? (
              <>
                <div className="px-2 py-1 bg-zinc-900 border-b border-zinc-800 flex items-center gap-1.5 text-[9px] text-zinc-300 shrink-0">
                  <Globe className="w-3 h-3 text-teal-400 shrink-0" />
                  <span className="truncate font-mono">{urlCheck.hostname}</span>
                </div>
                <iframe
                  src={urlCheck.safeUrl}
                  title={normalizedElem.name}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="w-full flex-1 border-0 pointer-events-none bg-zinc-950"
                />
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-zinc-400 select-none">
                <Globe className="w-6 h-6 text-teal-400 mb-1" />
                <span className="text-[10px] font-bold text-white">
                  {urlCheck.reason === 'empty'
                    ? 'URL Browser Embed Kosong'
                    : 'URL Browser Embed Tidak Valid'}
                </span>
                <span className="text-[9px] text-zinc-400 mt-0.5">
                  Hanya URL http:// atau https:// yang diizinkan
                </span>
              </div>
            )}
          </div>
        );
      }

      case 'soundboard': {
        const sfxPlan = resolveSoundboardControlModel(props);
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/95 border border-pink-500/50 px-2.5 py-2 flex items-center justify-between gap-2 transition-all ${animClass}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 shrink-0">
                <Music className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-[10px] font-bold text-white truncate">{sfxPlan.label}</div>
                <div className="text-[8px] text-zinc-400 font-mono truncate">
                  Vol: {sfxPlan.volumePercent}% ·{' '}
                  {sfxPlan.mode === 'custom_url'
                    ? 'Audio URL'
                    : sfxPlan.mode === 'synth'
                      ? sfxPlan.sfxType
                      : 'Invalid SFX'}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={!sfxPlan.isSupported}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!sfxPlan.isSupported) return;
                if (sfxPlan.mode === 'custom_url') {
                  void soundboardEngine.playCustomFile(
                    normalizedElem.id,
                    sfxPlan.audioUrl,
                    sfxPlan.volumeUnit,
                  );
                } else {
                  void soundboardEngine.playSynthesizedSFX(
                    sfxPlan.sfxType,
                    sfxPlan.volumeUnit,
                  );
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 shrink-0 transition-colors ${
                sfxPlan.isSupported
                  ? 'bg-pink-500 hover:bg-pink-400 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3 h-3" />
              <span>Putar</span>
            </button>
          </div>
        );
      }

      case 'event_alert': {
        const badgeColor =
          (typeof props.badgeColor === 'string' && props.badgeColor.trim()) ||
          (typeof props.accentColor === 'string' && props.accentColor.trim()) ||
          '#F2C230';
        const fallbackAlertBody =
          typeof props.alertMessage === 'string' && props.alertMessage.trim()
            ? props.alertMessage
            : 'Menunggu event Gift / Follow / Donasi...';
        return (
          <div
            className={`w-full h-full rounded-xl bg-gradient-to-r from-amber-950/95 via-zinc-900/95 to-amber-950/95 border-2 p-2.5 flex items-center gap-3 shadow-2xl transition-all ${animClass}`}
            style={{ borderColor: badgeColor }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-950 shrink-0 font-bold shadow-md"
              style={{ backgroundColor: badgeColor }}
            >
              <Sparkles className="w-5 h-5 text-zinc-950" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div
                className="text-[9px] uppercase tracking-wider font-extrabold"
                style={{ color: badgeColor }}
              >
                {props.alertTitle || 'GIFT RECEIVED!'}
              </div>
              <div className="text-xs font-black text-white truncate">
                {reaction?.textOverride || fallbackAlertBody}
              </div>
            </div>
          </div>
        );
      }

      case 'chat_message': {
        const maxMessages =
          typeof props.maxMessages === 'number' && Number.isFinite(props.maxMessages) && props.maxMessages > 0
            ? Math.max(1, Math.min(10, Math.floor(props.maxMessages)))
            : 5;
        const chatBg =
          typeof props.backgroundColor === 'string' && props.backgroundColor.trim()
            ? props.backgroundColor
            : `rgba(12, 14, 18, ${(typeof props.bgOpacity === 'number' ? props.bgOpacity : 85) / 100})`;
        const chatFontSize =
          typeof props.fontSize === 'number' && Number.isFinite(props.fontSize) && props.fontSize > 0
            ? props.fontSize
            : 11;
        const visibleChats = recentChatList.slice(-maxMessages);
        return (
          <div
            className={`w-full h-full p-2.5 space-y-1.5 overflow-hidden text-left bg-zinc-950/90 rounded-xl border border-zinc-800 transition-all ${animClass}`}
            style={{ backgroundColor: chatBg }}
          >
            {visibleChats.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 text-center">
                Belum ada pesan chat masuk
              </div>
            ) : (
              visibleChats.map((chat) => (
                <div
                  key={chat.id}
                  className="flex items-center gap-1.5 leading-tight"
                  style={{ fontSize: `${chatFontSize}px` }}
                >
                  {props.showBadges !== false && chat.badge && (
                    <span className="px-1 py-0.2 rounded bg-amber-500/20 text-[#F2C230] font-bold text-[8px]">
                      {chat.badge}
                    </span>
                  )}
                  <span className="font-bold text-[#F2C230]">@{chat.user}:</span>
                  <span className="text-zinc-200 truncate">{chat.text}</span>
                </div>
              ))
            )}
          </div>
        );
      }

      case 'combo_counter': {
        const themeColor =
          typeof props.themeColor === 'string' && props.themeColor.trim()
            ? props.themeColor
            : '#EA580C';
        return (
          <div
            className={`w-full h-full rounded-xl p-2 flex items-center justify-center gap-2 text-white shadow-xl transition-all ${animClass}`}
            style={{
              background: `linear-gradient(90deg, ${themeColor}, #F59E0B)`,
            }}
          >
            <Flame className="w-5 h-5 text-amber-100 shrink-0" />
            <span className="text-xs font-black tracking-wider truncate">
              {props.comboLabel || 'x25 COMBO LOVE!'}
            </span>
          </div>
        );
      }

      case 'counter': {
        const goalValue = props.targetGoal ?? props.target;
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800 p-2 flex items-center justify-between gap-2 text-xs px-3 transition-all ${animClass}`}
          >
            <div className="flex items-center gap-2 font-bold text-white min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="font-mono text-sm tabular-nums">
                {simulatedLikes.toLocaleString('id-ID')}
              </span>
              {typeof goalValue === 'number' && Number.isFinite(goalValue) && goalValue > 0 && (
                <span className="text-[9px] text-zinc-400 font-mono truncate">
                  / {goalValue.toLocaleString('id-ID')}
                </span>
              )}
            </div>
            <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider truncate">
              {props.label || 'Taps / Likes'}
            </span>
          </div>
        );
      }

      case 'live_viewer_counter': {
        const viewerDisplay = resolveViewerCounterDisplay({
          liveViewerCount: latestViewerCount,
          fallbackPropertyValue: props.viewerCount,
        });
        const showLiveBadge = shouldShowViewerLiveBadge(
          props.liveBadge,
          viewerDisplay.hasLiveSample,
        );
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800 px-3 py-1.5 flex items-center justify-between gap-2 text-xs transition-all ${animClass}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {showLiveBadge && (
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[8px] font-black tracking-wider shrink-0">
                  LIVE
                </span>
              )}
              <Users className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
              <span className="font-mono text-sm font-bold text-white tabular-nums">
                {viewerDisplay.formattedCount}
              </span>
            </div>
            <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider shrink-0">
              {viewerDisplay.hasLiveSample ? 'Penonton' : 'Penonton (Standby)'}
            </span>
          </div>
        );
      }

      case 'running_text':
        return (
          <div
            className="w-full h-full flex items-center overflow-hidden rounded px-2 border border-zinc-800"
            style={{ backgroundColor: props.bgColor || '#0F1115' }}
          >
            <div
              className="whitespace-nowrap animate-marquee text-[11px] font-bold"
              style={{
                color: props.textColor || '#F2C230',
                fontSize: `${props.fontSize || 12}px`,
                animationDuration: `${Math.max(1, 20 - (props.speed || 4) * 2)}s`,
              }}
            >
              {props.text || '🔥 SYNTXRR STREAM: Siaran Langsung TikTok & Multi-Platform'}
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
            {props.showArt !== false && props.showAlbumArt !== false && (
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow ${
                  srState.isPlaying ? 'bg-[#F2C230] text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                <Music className="w-4 h-4" />
              </div>
            )}
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
                {props.showRequester !== false && srState.currentTrack?.requester && (
                  <span>· @{srState.currentTrack.requester}</span>
                )}
                {props.showQueueCount !== false && (
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
          typeof props.lyricsText === 'string'
            ? props.lyricsText.trim()
            : '';
        const textAlignClass =
          props.align === 'left'
            ? 'text-left'
            : props.align === 'right'
              ? 'text-right'
              : 'text-center';
        return (
          <div
            className={`w-full h-full p-2.5 rounded-xl bg-zinc-950/90 border border-violet-500/40 flex flex-col justify-center ${textAlignClass} transition-all ${animClass}`}
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
                {props.title || normalizedElem.name || 'Audio Manual (BGM)'}
              </div>
              <div className="text-[8px] text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 font-mono uppercase text-[7px] font-bold">
                  {props.channel || 'bgm'}
                </span>
                {props.localFileName && (
                  <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 truncate max-w-[90px]">
                    📁 {props.localFileName}
                  </span>
                )}
                <span>Vol: {props.volume ?? 85}%</span>
                {props.loop !== false && <span className="text-cyan-400">↻ Loop</span>}
              </div>
            </div>
          </div>
        );

      case 'text': {
        const textColor = props.textColor || props.color || '#FFFFFF';
        const bgColor =
          typeof props.backgroundColor === 'string' && props.backgroundColor.trim()
            ? props.backgroundColor
            : 'transparent';
        return (
          <div
            className={`w-full h-full flex items-center justify-center text-center px-2 select-none ${animClass}`}
            style={{
              color: textColor,
              fontSize: `${props.fontSize || 16}px`,
              fontWeight: props.fontWeight === 'normal' ? 500 : 700,
              backgroundColor: bgColor,
            }}
          >
            {props.text || normalizedElem.name}
          </div>
        );
      }

      case 'dynamic_text': {
        const nowTimeText = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const latestUser = getLatestAudienceUsernameFromHistory(studioEventHistory);
        const dynamicResult = resolveDynamicTextOutput({
          template: props.template ?? props.text,
          fallback: props.fallback,
          context: {
            latestUsername: latestUser,
            targetText: getActiveTargetTextFromElements(elements, props),
            currentTimeText: nowTimeText,
            durationText: null,
            topDonorName: getTopDonorNameFromHistory(studioEventHistory),
          },
        });
        const customBgColor =
          typeof props.backgroundColor === 'string' && props.backgroundColor.trim()
            ? props.backgroundColor.trim()
            : null;
        const isTransparentBg = customBgColor?.toLowerCase() === 'transparent';
        return (
          <div
            className={`w-full h-full rounded-lg flex items-center justify-center text-center px-2.5 select-none ${
              customBgColor
                ? isTransparentBg
                  ? 'border border-transparent'
                  : 'border border-zinc-800'
                : 'bg-zinc-950/75 border border-zinc-800'
            } ${animClass}`}
            style={{
              color: props.textColor || props.color || '#FFFFFF',
              fontSize: `${props.fontSize || 14}px`,
              fontWeight: 700,
              ...(customBgColor ? { backgroundColor: customBgColor } : {}),
            }}
          >
            <span className="truncate">{dynamicResult.text}</span>
          </div>
        );
      }

      case 'username': {
        const userModel = resolveActiveUsernameModel(studioEventHistory, props);
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-emerald-500/40 px-2.5 py-1.5 flex items-center justify-between gap-2 text-left ${animClass}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span
                className={`text-xs font-bold truncate ${
                  userModel.hasEvent ? 'text-white' : 'text-zinc-400 font-medium'
                }`}
              >
                {userModel.displayText}
              </span>
            </div>
            {userModel.hasEvent && userModel.badge && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-bold shrink-0">
                {userModel.badge}
              </span>
            )}
          </div>
        );
      }

      case 'avatar': {
        const avatarModel = resolveDynamicAvatarModel(studioEventHistory, props);
        const shapeClass =
          avatarModel.shape === 'square'
            ? 'rounded-none'
            : avatarModel.shape === 'rounded'
              ? 'rounded-xl'
              : 'rounded-full';
        const glowClass = avatarModel.borderGlow
          ? 'ring-2 ring-[#F2C230] shadow-[0_0_12px_rgba(242,194,48,0.45)]'
          : 'border border-zinc-700';
        return (
          <div className={`w-full h-full flex items-center justify-center p-1 ${animClass}`}>
            {avatarModel.avatarUrl ? (
              <img
                src={avatarModel.avatarUrl}
                alt={avatarModel.username || 'Avatar Penonton'}
                className={`w-full h-full object-cover select-none pointer-events-none ${shapeClass} ${glowClass}`}
              />
            ) : (
              <div
                className={`w-full h-full bg-zinc-900 flex items-center justify-center text-[#F2C230] font-black text-sm select-none ${shapeClass} ${glowClass}`}
              >
                {avatarModel.initial ? (
                  <span>{avatarModel.initial}</span>
                ) : (
                  <User className="w-5 h-5 text-zinc-400" />
                )}
              </div>
            )}
          </div>
        );
      }

      case 'event_feed': {
        const feedItems = buildEventFeedItems(studioEventHistory, props.maxItems);
        const slideAnim = props.slideAnimation !== false;
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800 p-2 overflow-hidden flex flex-col justify-start gap-1 text-left ${animClass}`}
          >
            {feedItems.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 text-center">
                Belum ada aktivitas penonton
              </div>
            ) : (
              feedItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-1.5 text-[10px] leading-tight ${
                    slideAnim ? 'transition-all' : ''
                  }`}
                >
                  <span className="px-1 py-0.2 rounded bg-orange-500/20 text-orange-300 font-mono text-[8px] font-bold uppercase shrink-0">
                    {item.type}
                  </span>
                  <span className="font-bold text-white shrink-0">@{item.username}</span>
                  <span className="text-zinc-300 truncate">{item.detail}</span>
                </div>
              ))
            )}
          </div>
        );
      }

      case 'progress_bar': {
        const progress = computeProgressBarModel(props);
        const barColor =
          typeof props.barColor === 'string' && props.barColor.trim()
            ? props.barColor
            : '#F2C230';
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800 px-3 py-1.5 flex flex-col justify-center gap-1 text-left ${animClass}`}
          >
            <div className="flex items-center justify-between gap-2 text-[9px] font-bold">
              <span className="text-zinc-200 truncate">
                {progress.formattedCurrent} / {progress.formattedTarget}
              </span>
              <span className="font-mono text-[#F2C230] shrink-0">{progress.percentLabel}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progress.percent}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        );
      }

      case 'leaderboard': {
        const entries = buildLeaderboardEntries(studioEventHistory, props.topCount);
        const showAmounts = props.showAmounts !== false;
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-amber-500/40 p-2 overflow-hidden flex flex-col justify-start gap-1 text-left ${animClass}`}
          >
            <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#F2C230] shrink-0">
              <Award className="w-3 h-3 shrink-0" />
              <span>Top Supporters</span>
            </div>
            {entries.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[10px] text-zinc-400 text-center">
                Belum ada gift / donasi sesi ini
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.username.toLowerCase()}
                  className="flex items-center justify-between gap-1.5 text-[10px]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-[#F2C230] shrink-0">
                      #{entry.rank}
                    </span>
                    <span className="font-semibold text-white truncate">@{entry.username}</span>
                    <span className="text-[8px] text-zinc-400 shrink-0">
                      ({entry.supportCount}x)
                    </span>
                  </div>
                  {showAmounts && entry.formattedLastAmount && (
                    <span className="text-[9px] font-mono text-emerald-300 shrink-0">
                      {entry.formattedLastAmount}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        );
      }

      case 'live_text': {
        const liveModel = buildLiveTextRenderModel({
          isModeBSelected,
          modeBStatus,
          showFps: props.showFps !== false,
          showBitrate: props.showBitrate !== false,
        });
        const badgeClass =
          liveModel.tone === 'live'
            ? 'bg-red-600 text-white'
            : liveModel.tone === 'transition'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : liveModel.tone === 'error'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700';
        return (
          <div
            className={`w-full h-full rounded-xl bg-zinc-950/90 border border-zinc-800 px-2.5 py-1 flex items-center justify-between gap-2 text-[9px] font-mono ${animClass}`}
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <Radio
                className={`w-3 h-3 ${
                  liveModel.isLive ? 'text-red-400' : 'text-zinc-400'
                }`}
              />
              <span className={`px-1.5 py-0.5 rounded font-bold text-[8px] ${badgeClass}`}>
                {liveModel.statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300 truncate">
              <span>RES: {liveModel.resolutionLabel}</span>
              {props.showFps !== false && <span>FPS: {liveModel.fpsLabel}</span>}
              {props.showBitrate !== false && <span>{liveModel.bitrateLabel}</span>}
            </div>
          </div>
        );
      }

      case 'image': {
        const resolvedImgSrc = resolveStudioElementMediaSrc(normalizedElem, 'image');
        const fitClass =
          props.fit === 'cover'
            ? 'object-cover'
            : props.fit === 'fill'
              ? 'object-fill'
              : 'object-contain';
        const imgRadius =
          typeof props.borderRadius === 'number' && Number.isFinite(props.borderRadius) && props.borderRadius >= 0
            ? props.borderRadius
            : 8;
        return resolvedImgSrc ? (
          <img
            src={resolvedImgSrc}
            alt={normalizedElem.name}
            className={`w-full h-full ${fitClass} select-none pointer-events-none ${animClass}`}
            style={{ borderRadius: `${imgRadius}px` }}
          />
        ) : (
          <div className="w-full h-full rounded bg-zinc-900/90 border border-[#F2C230]/40 flex flex-col items-center justify-center text-[#F2C230]">
            <ImageIcon className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold">{normalizedElem.name}</span>
          </div>
        );
      }

      case 'sticker': {
        const resolvedStickerImgSrc = resolveStudioElementMediaSrc(normalizedElem, 'image');
        const stickerVisual = resolveStickerVisualModel(props.stickerId, props.floatEffect);
        const floatClass = stickerVisual.floatEffect ? 'animate-bounce' : '';
        return resolvedStickerImgSrc ? (
          <img
            src={resolvedStickerImgSrc}
            alt={normalizedElem.name}
            className={`w-full h-full object-contain select-none pointer-events-none ${floatClass} ${animClass}`}
          />
        ) : (
          <div
            className={`w-full h-full rounded-xl bg-amber-500/15 border border-[#F2C230]/50 flex flex-col items-center justify-center gap-0.5 select-none ${animClass}`}
          >
            <span className={`text-2xl leading-none ${floatClass}`} role="img" aria-label={stickerVisual.label}>
              {stickerVisual.emoji}
            </span>
            <span className="text-[8px] font-bold text-[#F2C230] uppercase tracking-wider">
              {stickerVisual.label}
            </span>
          </div>
        );
      }

      case 'video': {
        const resolvedVideoSrc = resolveStudioElementMediaSrc(normalizedElem, 'video');
        return resolvedVideoSrc ? (
          <video
            src={resolvedVideoSrc}
            autoPlay={props.autoplay !== false}
            loop={props.loop !== false}
            muted={props.muted !== false}
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

      default: {
        const _exhaustiveCheck: never = normalizedElem.type;
        return (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
            {String(_exhaustiveCheck)}
          </div>
        );
      }
    }
  };

  const getCanvasAspectClass = () => {
    if (canvasOrientation === '9:16') {
      return 'aspect-[9/16] w-full max-w-[340px]';
    }
    if (canvasOrientation === '16:9') {
      return 'aspect-video w-full max-w-[660px]';
    }
    return 'aspect-square w-full max-w-[360px]';
  };

  const fittedCanvasDimensions = (() => {
    if (!stageSize) return null;
    const availW = Math.max(120, stageSize.width - 8);
    const availH = Math.max(120, stageSize.height - 8);
    const ratio =
      canvasOrientation === '9:16'
        ? 9 / 16
        : canvasOrientation === '16:9'
          ? 16 / 9
          : 1;

    let width = availW;
    let height = width / ratio;
    if (height > availH) {
      height = availH;
      width = height * ratio;
    }

    return {
      width: Math.max(120, Math.floor(width)),
      height: Math.max(120, Math.floor(height)),
    };
  })();

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

  // --- Preset Selector & Save Handlers ---
  const openStudioPanel = useCallback(
    (
      panel:
        | 'properties'
        | 'elements'
        | 'sources'
        | 'presets'
        | 'media'
        | 'layers'
        | 'simulator'
        | 'marketplace',
    ) => {
      setActiveSidePanel(panel);
      setIsMobilePanelOpen(true);
    },
    [],
  );

  const handleOpenPresetSelector = () => {
    setIsHeaderMenuOpen(false);
    setIsMobilePanelOpen(false);
    setIsCanvasLivePreview(false);
    setShowPresetSelector(true);
  };

  const handleClosePresetSelector = () => {
    setHasEnteredCanvasSession(true);
    setShowPresetSelector(false);
  };

  const handleSelectorSelectPreset = (presetId: string) => {
    setSelectorActionError(null);
    setPresetTransferNotice(null);
    if (onSelectPreset) onSelectPreset(presetId);
    setHasEnteredCanvasSession(true);
    setIsMobilePanelOpen(false);
    setShowPresetSelector(false);
  };

  const rollbackImportedMedia = async (assetIds: string[]) => {
    for (const assetId of assetIds) {
      try {
        await StorageService.deleteStudioMediaAsset(assetId);
      } catch {
        // Best-effort cleanup when preset creation is cancelled or fails.
      }
    }
  };

  const handleExportPreset = async (preset: StudioPreset) => {
    if (isPresetTransferringRef.current) return;
    isPresetTransferringRef.current = true;
    setIsTransferringPreset(true);
    setPresetTransferNotice(null);
    try {
      await exportPresetPackageFile(preset);
      const okMessage = `Preset "${preset.name}" berhasil diekspor ke file JSON.`;
      setPresetTransferNotice({ tone: 'ok', text: okMessage });
      if (!showPresetSelector) {
        setSaveFeedback({ tone: 'ok', text: okMessage });
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Preset gagal diekspor.';
      setPresetTransferNotice({ tone: 'error', text: errMessage });
      if (!showPresetSelector) {
        setSaveFeedback({ tone: 'error', text: errMessage });
      }
    } finally {
      isPresetTransferringRef.current = false;
      if (isMountedRef.current) {
        setIsTransferringPreset(false);
      }
    }
  };

  const handleImportPresetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isPresetTransferringRef.current) return;

    if (isModeBMutationLocked) {
      const msg =
        'Impor preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.';
      setPresetTransferNotice({ tone: 'error', text: msg });
      if (!showPresetSelector) setSaveFeedback({ tone: 'error', text: msg });
      return;
    }

    if (!onCreatePreset) {
      const msg = 'Aksi impor preset tidak tersedia.';
      setPresetTransferNotice({ tone: 'error', text: msg });
      return;
    }

    isPresetTransferringRef.current = true;
    setIsTransferringPreset(true);
    setPresetTransferNotice(null);
    try {
      const imported = await importPresetPackageFile(file);
      const baseName = imported.preset.name.trim();
      const existingNames = new Set(presets.map((preset) => preset.name.trim().toLowerCase()));
      let resolvedName = baseName;
      if (existingNames.has(resolvedName.toLowerCase())) {
        resolvedName = `${baseName} (Impor)`;
        let copyIndex = 2;
        while (existingNames.has(resolvedName.toLowerCase())) {
          resolvedName = `${baseName} (Impor ${copyIndex})`;
          copyIndex += 1;
        }
      }

      let created: void | boolean;
      try {
        created = await onCreatePreset({ ...imported.preset, name: resolvedName });
      } catch (createError) {
        await rollbackImportedMedia(imported.importedAssetIds);
        throw createError;
      }

      if (created === false) {
        await rollbackImportedMedia(imported.importedAssetIds);
        const msg =
          'Impor preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.';
        setPresetTransferNotice({ tone: 'error', text: msg });
        if (!showPresetSelector) setSaveFeedback({ tone: 'error', text: msg });
        return;
      }

      const okMsg = `Preset "${resolvedName}" berhasil diimpor${
        imported.importedMediaCount ? ` (${imported.importedMediaCount} media lokal)` : ''
      }.`;
      setPresetTransferNotice({ tone: 'ok', text: okMsg });
      setHasEnteredCanvasSession(true);
      setIsMobilePanelOpen(false);
      setShowPresetSelector(false);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'File preset gagal diimpor.';
      setPresetTransferNotice({ tone: 'error', text: errMsg });
      if (!showPresetSelector) setSaveFeedback({ tone: 'error', text: errMsg });
    } finally {
      isPresetTransferringRef.current = false;
      if (isMountedRef.current) {
        setIsTransferringPreset(false);
      }
    }
  };

  const handleSelectorBlankCanvas = async () => {
    if (isCreatingBlankCanvas) return;
    setSelectorActionError(null);
    if (!onCreatePreset) {
      setSelectorActionError('Aksi pembuatan kanvas kosong tidak tersedia.');
      return;
    }
    setIsCreatingBlankCanvas(true);
    try {
      const draft = buildBlankPresetDraft(presets, canvasOrientation);
      const result = await submitAsyncPresetCreation(() => onCreatePreset(draft));
      if (!isMountedRef.current) return;
      if (!result.ok) {
        setSelectorActionError(result.message);
        return;
      }
      setSelectedId(null);
      setSelectedGroupId(null);
      setHasEnteredCanvasSession(true);
      setIsMobilePanelOpen(false);
      setShowPresetSelector(false);
    } finally {
      if (isMountedRef.current) {
        setIsCreatingBlankCanvas(false);
      }
    }
  };

  const handleSelectorCreatePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingSelectorPreset) return;
    const trimmedName = selectorPresetName.trim();
    if (!trimmedName) {
      setSelectorCreateError('Nama preset wajib diisi.');
      return;
    }
    if (!onCreatePreset) {
      setSelectorCreateError('Aksi pembuatan preset tidak tersedia.');
      return;
    }

    setSelectorCreateError(null);
    setIsCreatingSelectorPreset(true);
    try {
      const templateElements = ensureUniqueElementIds(generateTemplateElements(selectorTemplate));
      const result = await submitAsyncPresetCreation(() =>
        onCreatePreset({
          name: trimmedName,
          category: selectorCategory,
          canvasOrientation: selectorOrientation,
          elements: templateElements,
          groups: [],
          superGroups: [],
          isFavorite: false,
          description: selectorDescription.trim() || 'Preset tata letak kustom SYNTXRR STREAM',
          thumbnailColor: '#F2C230',
        }),
      );
      if (!isMountedRef.current) return;
      if (!result.ok) {
        setSelectorCreateError(result.message);
        return;
      }
      setSelectorCreateModalOpen(false);
      setSelectorPresetName('');
      setSelectorDescription('');
      setSelectorCreateError(null);
      setHasEnteredCanvasSession(true);
      setIsMobilePanelOpen(false);
      setShowPresetSelector(false);
    } finally {
      if (isMountedRef.current) {
        setIsCreatingSelectorPreset(false);
      }
    }
  };

  const handleSidebarCreatePresetFromScene = async () => {
    if (isCreatingSidebarPreset) return;
    const trimmedName = newPresetNameInput.trim();
    if (!trimmedName) {
      setSidebarCreateError('Nama preset baru wajib diisi.');
      return;
    }

    setSidebarCreateError(null);
    setIsCreatingSidebarPreset(true);
    try {
      const result = await submitAsyncPresetCreation(async () => {
        if (onCreatePreset) {
          const cloned = clonePresetWithRemappedIds({
            sourcePreset: activePreset,
            currentElements: elements,
            existingPresets: presets,
            canvasOrientation,
            customName: trimmedName,
            customDescription:
              newPresetDescInput.trim() || activePreset?.description || 'Preset kustom Studio',
          });
          const { id: _id, createdAt: _createdAt, ...draft } = cloned;
          return onCreatePreset(draft);
        }
        return onSaveAsPreset();
      });
      if (!isMountedRef.current) return;
      if (!result.ok) {
        setSidebarCreateError(result.message);
        return;
      }
      setNewPresetNameInput('');
      setNewPresetDescInput('');
      setSidebarCreateError(null);
      setNewPresetModalOpen(false);
    } finally {
      if (isMountedRef.current) {
        setIsCreatingSidebarPreset(false);
      }
    }
  };

  const handleSaveActivePresetClick = async () => {
    if (isSavingActivePreset || !onSaveActivePreset) return;
    setSaveFeedback(null);
    setIsSavingActivePreset(true);
    try {
      const result = await onSaveActivePreset();
      if (!isMountedRef.current) return;
      if (result === false) {
        setSaveFeedback({
          tone: 'error',
          text: 'Gagal menyimpan perubahan ke preset aktif.',
        });
      } else if (result && typeof result === 'object' && 'success' in result) {
        setSaveFeedback({
          tone: result.success ? 'ok' : 'error',
          text:
            result.message ||
            (result.success ? 'Perubahan preset tersimpan.' : 'Gagal menyimpan preset aktif.'),
        });
      } else {
        setSaveFeedback({ tone: 'ok', text: 'Perubahan preset tersimpan.' });
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setSaveFeedback({
        tone: 'error',
        text:
          error instanceof Error && error.message
            ? error.message
            : 'Gagal menyimpan perubahan ke preset aktif.',
      });
    } finally {
      if (isMountedRef.current) {
        setIsSavingActivePreset(false);
      }
    }
  };

  const handleSavePresetCopyClick = async () => {
    if (isSavingCopy) return;
    setSaveFeedback(null);
    setIsSavingCopy(true);
    try {
      const result = await submitAsyncPresetCreation(() => onSaveAsPreset());
      if (!isMountedRef.current) return;
      if (!result.ok) {
        setSaveFeedback({ tone: 'error', text: result.message });
        return;
      }
      setSaveFeedback({ tone: 'ok', text: 'Salinan preset baru berhasil disimpan.' });
    } finally {
      if (isMountedRef.current) {
        setIsSavingCopy(false);
      }
    }
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

  const resolvedSaveStatus = isSavingActivePreset ? 'saving' : saveState?.status ?? 'saved';
  const resolvedSaveError =
    saveFeedback?.tone === 'error'
      ? saveFeedback.text
      : saveState?.status === 'error'
        ? saveState.errorMessage || 'Gagal menyimpan perubahan Studio.'
        : null;

  const canvasResolutionLabel =
    canvasOrientation === '16:9'
      ? '1920×1080'
      : canvasOrientation === '1:1'
        ? '1080×1080'
        : '1080×1920';

  return (
    <div
      className={
        showPresetSelector
          ? 'space-y-3.5 pb-20 xl:pb-6'
          : 'relative flex-1 w-full h-full min-h-0 overflow-hidden bg-[var(--app-bg)] select-none'
      }
    >
      {/* Shared Hidden JSON Preset Import Picker */}
      <input
        ref={presetImportInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => void handleImportPresetFile(e)}
      />

      {/* === PRESET SELECTION ENTRY SCREEN === */}
      {showPresetSelector ? (
        <StudioPresetHub
          presets={presets}
          activePresetId={activePresetId}
          activePreset={activePreset}
          canvasOrientation={canvasOrientation}
          hasResumeSession={hasEnteredCanvasSession}
          isModeBMutationLocked={isModeBMutationLocked}
          isModeBLive={isModeBLive}
          selectorFilterCategory={selectorFilterCategory}
          onChangeFilterCategory={setSelectorFilterCategory}
          selectorActionError={selectorActionError}
          onDismissActionError={() => setSelectorActionError(null)}
          transferNotice={presetTransferNotice}
          onDismissTransferNotice={() => setPresetTransferNotice(null)}
          isTransferringPreset={isTransferringPreset}
          isCreatingBlankCanvas={isCreatingBlankCanvas}
          editingPresetIdInSelector={editingPresetIdInSelector}
          editingNameInSelector={editingNameInSelector}
          onStartRenamePreset={(preset) => {
            setEditingPresetIdInSelector(preset.id);
            setEditingNameInSelector(preset.name);
          }}
          onChangeEditingName={setEditingNameInSelector}
          onSaveRenamePreset={handleSelectorSaveRename}
          onCancelRenamePreset={() => setEditingPresetIdInSelector(null)}
          onSelectPreset={handleSelectorSelectPreset}
          onResumeCanvas={handleClosePresetSelector}
          onCreateBlankCanvas={handleSelectorBlankCanvas}
          onOpenCreateModal={() => {
            setSelectorActionError(null);
            setSelectorCreateError(null);
            setSelectorCreateModalOpen(true);
          }}
          onToggleFavoritePreset={onToggleFavoritePreset}
          onDuplicatePreset={onDuplicatePreset}
          onDeletePreset={onDeletePreset}
          onExportPreset={handleExportPreset}
          onTriggerImportPreset={() => presetImportInputRef.current?.click()}
          createModalOpen={selectorCreateModalOpen}
          onCloseCreateModal={() => {
            setSelectorCreateError(null);
            setSelectorCreateModalOpen(false);
          }}
          presetNameInput={selectorPresetName}
          onChangePresetNameInput={setSelectorPresetName}
          presetOrientationInput={selectorOrientation}
          onChangePresetOrientationInput={(orientation, category) => {
            setSelectorOrientation(orientation);
            setSelectorCategory(category);
          }}
          presetTemplateInput={selectorTemplate}
          onChangePresetTemplateInput={setSelectorTemplate}
          presetDescriptionInput={selectorDescription}
          onChangePresetDescriptionInput={setSelectorDescription}
          isCreatingPreset={isCreatingSelectorPreset}
          createError={selectorCreateError}
          onSubmitCreatePreset={handleSelectorCreatePreset}
        />
      ) : (
      /* === IMMERSIVE FULLSCREEN STUDIO WORKSPACE === */
      <>
      {/* Full-Viewport Interactive Canvas Stage (always mounted, never unmounted by overlay drawer) */}
      <div
        ref={stageContainerRef}
        className="w-full h-full overflow-hidden flex items-center justify-center p-1 bg-[var(--app-bg)] relative select-none overscroll-y-contain"
        style={{
          touchAction: 'none',
          overscrollBehaviorY: 'contain',
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
        onMouseDown={(e) => {
          if (!isCanvasLivePreview && e.target === e.currentTarget) {
            setIsPanning(true);
            panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
          }
        }}
        onMouseMove={(e) => {
          if (isPanning && !isCanvasLivePreview) {
            setPanOffset({
              x: e.clientX - panStartRef.current.x,
              y: e.clientY - panStartRef.current.y,
            });
          }
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => setIsPanning(false)}
      >
        {/* The Actual Canvas (Proportional Contain/Fit Scaled to Full Viewport) */}
        <div
          ref={canvasRef}
          style={{
            ...(fittedCanvasDimensions
              ? {
                  width: `${fittedCanvasDimensions.width}px`,
                  height: `${fittedCanvasDimensions.height}px`,
                }
              : {}),
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel / 100})`,
            transformOrigin: 'center center',
            touchAction: 'none',
            overscrollBehaviorY: 'contain',
          }}
          className={`relative bg-[#07080A] border border-[var(--app-border-strong)] rounded-xl sm:rounded-2xl shadow-2xl transition-transform duration-75 overflow-hidden ${
            fittedCanvasDimensions ? 'shrink-0' : getCanvasAspectClass()
          } overscroll-y-contain`}
              onClick={() => {
                if (isCanvasLivePreview) return;
                if (suppressNextCanvasClickRef.current) {
                  suppressNextCanvasClickRef.current = false;
                  return;
                }
                setSelectedId(null);
                setSelectedGroupId(null);
                if (
                  shouldClosePropertiesOnCanvasBackgroundClick({
                    isCanvasLivePreview,
                    isMobilePanelOpen,
                    activeSidePanel,
                  })
                ) {
                  setIsMobilePanelOpen(false);
                }
              }}
            >
              {/* Safe-Zone Guide Margins for TikTok / Live Stream (hidden during Preview LIVE) */}
              {!isCanvasLivePreview && (
                <>
                  <div className="absolute inset-x-2 top-2 h-6 border border-dashed border-[var(--app-accent-border)] rounded flex items-center justify-center pointer-events-none">
                    <span className="text-[8px] font-mono text-[var(--app-accent)]/60">SAFE ZONE HEADER</span>
                  </div>
                  <div className="absolute inset-x-2 bottom-2 h-8 border border-dashed border-rose-500/30 rounded flex items-center justify-center pointer-events-none">
                    <span className="text-[8px] font-mono text-rose-400/60">SAFE ZONE FOOTER</span>
                  </div>
                </>
              )}

              {/* Elements Layer Rendering with UNIFIED POINTER EVENTS */}
              {elements.map((elem) => {
                if (!elem.visible || isElementHiddenByGroup(elem.id)) return null;
                const isSelected = !isCanvasLivePreview && selectedId === elem.id;

                return (
                  <div
                    key={elem.id}
                    onPointerDown={(e) => handleElementPointerDown(e, elem)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={(e) => {
                      if (!isCanvasLivePreview) e.stopPropagation();
                    }}
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
                    className={`group transition-shadow ${
                      isCanvasLivePreview
                        ? 'cursor-default'
                        : isSelected
                          ? 'cursor-move ring-2 ring-[var(--app-accent)] ring-offset-1 ring-offset-black'
                          : 'cursor-move hover:ring-1 hover:ring-[var(--app-accent)]/60'
                    }`}
                  >
                    {renderElementContent(elem)}

                    {isSelected && !elem.locked && !isElementLockedByGroup(elem.id) && (
                      <>
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'bottom-right')}
                          onClick={(e) => e.stopPropagation()}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-[var(--app-accent)] border-2 border-white rounded-full cursor-se-resize shadow-md z-30"
                          title="Resize Sudut Kanan-Bawah"
                        />
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'top-right')}
                          onClick={(e) => e.stopPropagation()}
                          style={{ touchAction: 'none' }}
                          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--app-accent)] border border-white rounded-full cursor-ne-resize shadow-sm z-30"
                          title="Resize Sudut Kanan-Atas"
                        />
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'bottom-left')}
                          onClick={(e) => e.stopPropagation()}
                          style={{ touchAction: 'none' }}
                          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--app-accent)] border border-white rounded-full cursor-sw-resize shadow-sm z-30"
                          title="Resize Sudut Kiri-Bawah"
                        />
                        <div
                          onPointerDown={(e) => handleResizePointerDown(e, elem, 'top-left')}
                          onClick={(e) => e.stopPropagation()}
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

              {!isCanvasLivePreview && selectedGroup && selectedGroupBounds && (
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
                    onPointerCancel={handlePointerCancel}
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
                          onPointerCancel={handlePointerCancel}
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

      {/* FLOATING RETURN TO EDITOR BUTTON WHEN PREVIEW LIVE IS ACTIVE */}
      {isCanvasLivePreview && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 z-40"
        >
          <button
            type="button"
            onClick={() => setIsCanvasLivePreview(false)}
            className="btn-press min-h-[36px] px-3 rounded-full bg-[var(--app-surface)]/88 hover:bg-[var(--app-surface-elevated)] backdrop-blur-md border border-[var(--app-border-strong)] text-[var(--app-text)] text-[11px] font-bold inline-flex items-center gap-1.5 shadow-2xl"
            title="Kembali ke Editor Studio"
            aria-label="Kembali ke Editor"
          >
            <EyeOff className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
            <span>Kembali ke Editor</span>
          </button>
        </div>
      )}

      {/* FLOATING TOP HEADER CAPSULES (overlaid above Canvas without eating permanent height) */}
      {!isCanvasLivePreview && (
      <header className="pointer-events-none absolute top-2 inset-x-2 sm:top-2.5 sm:inset-x-3 z-30 flex items-start justify-between gap-2">
        {/* Top-Left Compact Capsule: Back + Undo + Redo + Preset Name & Resolution + Save State */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto inline-flex items-center gap-0.5 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-[var(--app-surface)]/82 backdrop-blur-md border border-[var(--app-border-strong)]/75 shadow-lg min-w-0 w-fit max-w-[calc(100%-132px)] min-[440px]:max-w-[calc(100%-178px)] sm:max-w-[290px]"
        >
          <button
            type="button"
            onClick={handleOpenPresetSelector}
            className="btn-press min-h-[34px] min-w-[32px] sm:min-h-[36px] sm:min-w-[34px] rounded-lg sm:rounded-xl hover:bg-[var(--app-surface-hover)] text-[var(--app-text)] flex items-center justify-center shrink-0"
            title={`Kembali ke Preset Hub (${activePreset?.name || 'Studio Produksi'})`}
            aria-label={`Kembali ke Daftar Preset: ${activePreset?.name || 'Studio Produksi'}`}
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--app-accent-text)]" />
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={isStrictModeBLocked || history.length === 0}
            className="btn-press min-h-[34px] min-w-[30px] sm:min-h-[36px] sm:min-w-[32px] rounded-lg sm:rounded-xl hover:bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed"
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={isStrictModeBLocked || redoStack.length === 0}
            className="btn-press min-h-[34px] min-w-[30px] sm:min-h-[36px] sm:min-w-[32px] rounded-lg sm:rounded-xl hover:bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed"
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <div className="h-4 w-px bg-[var(--app-border)] mx-0.5 shrink-0" />

          <div className="min-w-0 pr-1.5 pl-0.5 flex flex-col justify-center leading-none gap-0.5">
            <span className="truncate font-display text-[10px] sm:text-[11px] font-bold text-[var(--app-text)] max-w-[115px] min-[400px]:max-w-[140px] sm:max-w-[165px]">
              {activePreset?.name || 'Studio Produksi'}
            </span>
            <div className="flex items-center gap-1 text-[9px] tabular-metrics text-[var(--app-text-muted)] whitespace-nowrap">
              <span className="shrink-0">{canvasResolutionLabel}</span>
              <span
                data-save-status={resolvedSaveStatus}
                title={
                  resolvedSaveStatus === 'saving'
                    ? 'Menyimpan...'
                    : resolvedSaveStatus === 'pending'
                      ? 'Perubahan belum tersimpan'
                      : resolvedSaveStatus === 'error'
                        ? 'Gagal menyimpan'
                        : 'Tersimpan'
                }
                aria-label={
                  resolvedSaveStatus === 'saving'
                    ? 'Menyimpan preset'
                    : resolvedSaveStatus === 'pending'
                      ? 'Perubahan belum tersimpan'
                      : resolvedSaveStatus === 'error'
                        ? 'Gagal menyimpan preset'
                        : 'Preset tersimpan'
                }
                className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                  resolvedSaveStatus === 'error'
                    ? 'text-rose-300'
                    : resolvedSaveStatus === 'pending' || resolvedSaveStatus === 'saving'
                      ? 'text-[var(--app-accent-text)]'
                      : 'text-[var(--app-ok)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    resolvedSaveStatus === 'error'
                      ? 'bg-rose-400'
                      : resolvedSaveStatus === 'pending' || resolvedSaveStatus === 'saving'
                        ? 'bg-[var(--app-accent)] animate-pulse'
                        : 'bg-[var(--app-ok)]'
                  }`}
                />
                <span>
                  {resolvedSaveStatus === 'saving'
                    ? 'Menyimpan…'
                    : resolvedSaveStatus === 'pending'
                      ? 'Belum'
                      : resolvedSaveStatus === 'error'
                        ? 'Gagal'
                        : 'Tersimpan'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Capsule: Preview LIVE + Overflow Menu + Simpan */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto flex items-center gap-0.5 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-[var(--app-surface)]/82 backdrop-blur-md border border-[var(--app-border-strong)]/75 shadow-lg shrink-0"
        >
          <button
            type="button"
            onClick={() => {
              setIsHeaderMenuOpen(false);
              setIsMobilePanelOpen(false);
              setIsPanning(false);
              setIsCanvasLivePreview(true);
            }}
            className="btn-press min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg sm:rounded-xl flex items-center justify-center transition-colors text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]"
            title="Preview LIVE"
            aria-label="Preview LIVE"
          >
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setIsHeaderMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={isHeaderMenuOpen}
              aria-label="Menu tambahan Studio"
              title="Menu tambahan"
              className={`btn-press min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg sm:rounded-xl flex items-center justify-center transition-colors ${
                isHeaderMenuOpen
                  ? 'bg-[var(--app-surface-elevated)] text-[var(--app-accent-text)]'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
              }`}
            >
              <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {isHeaderMenuOpen && (
              <div
                role="menu"
                aria-label="Opsi tambahan Studio"
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-[var(--app-surface-elevated)] border border-[var(--app-border-strong)] shadow-2xl p-2 z-40 space-y-2"
              >
                <div className="space-y-1">
                  <div className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                    Orientasi Kanvas
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs font-bold">
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
                        role="menuitemradio"
                        aria-checked={canvasOrientation === opt.id}
                        disabled={isModeBMutationLocked}
                        onClick={() => {
                          onChangeOrientation(opt.id);
                          setIsHeaderMenuOpen(false);
                        }}
                        className={`btn-press min-h-[40px] px-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          canvasOrientation === opt.id
                            ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                            : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[var(--app-border)] pt-1.5 space-y-1">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isModeBMutationLocked || isSavingCopy}
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      void handleSavePresetCopyClick();
                    }}
                    className="btn-press w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Copy className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <span>{isSavingCopy ? 'Menyalin...' : 'Simpan Salinan'}</span>
                  </button>

                  {activePreset && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isTransferringPreset}
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        void handleExportPreset(activePreset);
                      }}
                      className="btn-press w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
                    >
                      <Download className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                      <span>Ekspor Preset (.json)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    disabled={isModeBMutationLocked || isTransferringPreset}
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      presetImportInputRef.current?.click();
                    }}
                    className="btn-press w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
                  >
                    <Upload className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <span>Impor Preset (.json)</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      openStudioPanel('presets');
                    }}
                    className="btn-press w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2"
                  >
                    <Sliders className="w-4 h-4 text-[var(--app-ok)] shrink-0" />
                    <span>Pengaturan Mode B Preset</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleOpenPresetSelector}
                    className="btn-press w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-semibold flex items-center gap-2"
                  >
                    <Layout className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <span>Kelola Semua Preset</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {onSaveActivePreset && (
            <button
              type="button"
              disabled={isStrictModeBLocked || isSavingActivePreset}
              onClick={() => void handleSaveActivePresetClick()}
              className="btn-press min-h-[34px] min-w-[34px] sm:min-h-[36px] px-2 sm:px-3 rounded-lg sm:rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-[11px] font-bold inline-flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title="Simpan perubahan ke preset aktif"
              aria-label={isSavingActivePreset ? 'Menyimpan preset' : 'Simpan preset'}
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden min-[440px]:inline">
                {isSavingActivePreset ? 'Menyimpan...' : 'Simpan'}
              </span>
            </button>
          )}
        </div>
      </header>
      )}

      {/* FLOATING SAVE TOAST / MODE B LOCK NOTICE (only visible when active and not in Preview LIVE) */}
      {!isCanvasLivePreview && (resolvedSaveError || saveFeedback?.tone === 'ok' || (isModeBSelected && isModeBMutationLocked)) && (
        <div className="pointer-events-none absolute top-14 sm:top-[62px] inset-x-2 sm:inset-x-3 z-20 flex flex-col items-center gap-1.5">
          {(resolvedSaveError || saveFeedback?.tone === 'ok') && (
            <div
              role={resolvedSaveError ? 'alert' : 'status'}
              onPointerDown={(e) => e.stopPropagation()}
              className={`pointer-events-auto max-w-md px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-xl text-[11px] flex items-center justify-between gap-2 ${
                resolvedSaveError
                  ? 'border-rose-500/45 bg-rose-950/90 text-rose-100'
                  : 'border-emerald-500/40 bg-[var(--app-surface-elevated)]/95 text-[var(--app-text)]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {resolvedSaveError ? (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-[var(--app-ok)] shrink-0" />
                )}
                <span>{resolvedSaveError || saveFeedback?.text}</span>
              </span>
              <button
                type="button"
                onClick={() => setSaveFeedback(null)}
                className="text-[11px] font-semibold opacity-80 hover:opacity-100 px-1.5 shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          {isModeBSelected && isModeBMutationLocked && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className={`pointer-events-auto max-w-xl w-full sm:w-auto px-3 py-2 rounded-2xl border backdrop-blur-md shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                isModeBLive
                  ? 'bg-[var(--app-surface-elevated)]/92 border-emerald-500/40 text-[var(--app-text)]'
                  : 'bg-[var(--app-surface-elevated)]/92 border-amber-500/40 text-[var(--app-text)]'
              }`}
            >
              <div className="space-y-0.5 text-[11px]">
                <div className={`font-bold flex items-center gap-1.5 ${isModeBLive ? 'text-[var(--app-ok)]' : 'text-[var(--app-warn)]'}`}>
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isModeBLive
                      ? 'Mode B LIVE — Orientasi & Struktur Preset Dikunci'
                      : `Mode B sibuk (${modeBStatus?.status || 'transisi'}) — Mutasi Kanvas Dikunci`}
                  </span>
                </div>
                {modeBLiveApplyFeedback && (
                  <div className={`text-[10px] font-semibold ${modeBLiveApplyFeedback.success ? 'text-[var(--app-ok)]' : 'text-[var(--app-warn)]'}`}>
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
                  className="btn-press shrink-0 min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isModeBActionPending ? 'Menerapkan...' : 'Terapkan Perubahan ke LIVE'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* COMPACT FLOATING BOTTOM-LEFT WORKSPACE DOCK (Elemen, Marketplace, Lapisan, Alat, Zoom 100%/50%) */}
      {!isCanvasLivePreview && (
      <div className="pointer-events-none absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-30 max-w-[calc(100%-16px)]">
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-[var(--app-surface)]/84 backdrop-blur-md border border-[var(--app-border-strong)]/75 shadow-lg overflow-x-auto no-scrollbar max-w-full"
        >
          <button
            type="button"
            onClick={() => openStudioPanel('elements')}
            className={`btn-press min-h-[34px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-lg sm:rounded-xl text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors ${
              isMobilePanelOpen && (activeSidePanel === 'elements' || activeSidePanel === 'sources')
                ? 'bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] ring-1 ring-white/40'
                : 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
            }`}
            title="Tambah Elemen & Sumber"
            aria-label="Tambah Elemen"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Elemen</span>
          </button>

          <button
            type="button"
            onClick={() => openStudioPanel('marketplace')}
            className={`btn-press min-h-[34px] min-w-[34px] sm:min-h-[38px] px-2 sm:px-2.5 rounded-lg sm:rounded-xl text-[11px] font-semibold inline-flex items-center justify-center gap-1 shrink-0 transition-colors ${
              isMobilePanelOpen && activeSidePanel === 'marketplace'
                ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]'
                : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
            }`}
            title="Buka Marketplace Overlay"
            aria-label="Marketplace"
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0 text-[var(--app-accent-text)]" />
            <span className="hidden md:inline">Marketplace</span>
          </button>

          <button
            type="button"
            onClick={() => openStudioPanel('layers')}
            className={`btn-press min-h-[34px] min-w-[34px] sm:min-h-[38px] px-2 sm:px-2.5 rounded-lg sm:rounded-xl text-[11px] font-semibold inline-flex items-center justify-center gap-1 shrink-0 transition-colors ${
              isMobilePanelOpen && activeSidePanel === 'layers'
                ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]'
                : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
            }`}
            title="Lapisan & Grup"
            aria-label="Lapisan"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Lapisan</span>
          </button>

          <button
            type="button"
            onClick={() =>
              openStudioPanel(
                selectedElement
                  ? 'properties'
                  : activeSidePanel === 'properties'
                    ? 'elements'
                    : activeSidePanel,
              )
            }
            className={`btn-press min-h-[34px] min-w-[34px] sm:min-h-[38px] px-2 sm:px-2.5 rounded-lg sm:rounded-xl text-[11px] font-bold inline-flex items-center justify-center gap-1 shrink-0 transition-colors ${
              isMobilePanelOpen && activeSidePanel === 'properties'
                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                : selectedElement
                  ? 'text-[var(--app-accent-text)] hover:bg-[var(--app-surface-hover)]'
                  : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
            }`}
            title="Buka panel alat Studio & Properti"
            aria-label="Buka panel alat Studio"
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[380px]:inline">Alat</span>
          </button>

          {/* Direct 100% / 50% Canvas Zoom Toggle */}
          <button
            type="button"
            onClick={() => {
              setPanOffset({ x: 0, y: 0 });
              setZoomLevel((z) => (z === 50 ? 100 : 50));
            }}
            aria-pressed={zoomLevel === 50}
            aria-label={zoomLevel === 50 ? 'Kembalikan Zoom ke 100%' : 'Perkecil Kanvas ke 50%'}
            title={
              zoomLevel === 50
                ? 'Zoom 50% — ketuk untuk kembali ke 100%'
                : 'Zoom 100% — ketuk untuk perkecil ke 50%'
            }
            className={`btn-press min-h-[34px] min-w-[34px] sm:min-h-[38px] px-2 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] tabular-metrics font-bold inline-flex items-center justify-center gap-1 shrink-0 transition-colors ${
              zoomLevel === 50
                ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)]'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-hover)]'
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            {zoomLevel === 50 && <span>50%</span>}
          </button>
        </div>
      </div>
      )}

      {/* Overlay Backdrop (hidden on landscape/desktop when contextual Properties Inspector is active so Canvas remains directly interactive) */}
      {!isCanvasLivePreview && isMobilePanelOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsMobilePanelOpen(false)}
          className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] ${
            activeSidePanel === 'properties' ? 'landscape:hidden md:hidden' : ''
          }`}
        />
      )}

      {/* SECTION 2-6: CONSOLIDATED STUDIO TOOL PANEL (Bottom Sheet on Portrait, Left Contextual Drawer for Properties / Right Drawer for Other Tabs on Landscape & md+) */}
      <div
        ref={sidePanelRef}
        className={`${
          !isCanvasLivePreview && isMobilePanelOpen
            ? activeSidePanel === 'properties'
              ? 'fixed inset-x-0 bottom-0 pb-safe z-50 rounded-t-3xl border-t border-x border-[var(--app-accent-border)] bg-[var(--app-surface-elevated)] shadow-2xl max-h-[74dvh] landscape:inset-y-0 landscape:left-0 landscape:right-auto landscape:w-[340px] landscape:sm:w-[360px] landscape:max-w-[42vw] landscape:max-h-full landscape:rounded-none landscape:rounded-r-2xl landscape:border-t-0 landscape:border-l-0 landscape:border-r md:inset-y-0 md:left-0 md:right-auto md:w-[360px] md:max-w-[42vw] md:max-h-full md:rounded-none md:rounded-r-2xl md:border-t-0 md:border-l-0 md:border-r flex flex-col overflow-hidden anim-sheet-up'
              : 'fixed inset-x-0 bottom-0 pb-safe z-50 rounded-t-3xl border-t border-x border-[var(--app-accent-border)] bg-[var(--app-surface-elevated)] shadow-2xl max-h-[74dvh] landscape:inset-y-0 landscape:right-0 landscape:left-auto landscape:w-[360px] landscape:sm:w-[400px] landscape:max-w-[88vw] landscape:max-h-full landscape:rounded-none landscape:rounded-l-2xl landscape:border-t-0 landscape:border-l md:inset-y-0 md:right-0 md:left-auto md:w-[400px] md:max-w-[88vw] md:max-h-full md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l flex flex-col overflow-hidden anim-sheet-up'
            : 'hidden'
        }`}
      >
        {/* Overlay Panel Header */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5 border-b border-[var(--app-border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-1 rounded-full bg-[var(--app-border-strong)] shrink-0 landscape:hidden md:hidden" />
            <span className="text-xs font-display font-bold text-[var(--app-text)] truncate">
              {activeSidePanel === 'properties'
                ? selectedElement
                  ? `Properti: ${selectedElement.name}`
                  : 'Properti Elemen'
                : activeSidePanel === 'elements' || activeSidePanel === 'sources'
                  ? 'Tambah Elemen & Sumber'
                  : activeSidePanel === 'layers'
                    ? 'Lapisan & Grup'
                    : activeSidePanel === 'media'
                      ? 'Pustaka Media'
                      : activeSidePanel === 'presets'
                        ? 'Preset & Pengaturan Mode B'
                        : activeSidePanel === 'simulator'
                          ? 'Uji Live Simulator'
                          : 'Marketplace Overlay'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobilePanelOpen(false)}
            aria-label="Tutup panel Studio"
            className="btn-press min-h-[44px] min-w-[44px] -mr-2 rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

          {/* Main Module Tabs */}
          {!(activeSidePanel === 'properties' && selectedElement) && (
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
          )}

          <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto">
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
                        disabled={!canMutateSelectedElement}
                        className={`btn-press min-h-[44px] min-w-[44px] rounded-xl border text-xs flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                          selectedElement.visible && !isSelectedElementHiddenByGroup
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
                        disabled={!canToggleSelectedElementLock}
                        className={`btn-press min-h-[44px] min-w-[44px] rounded-xl border text-xs flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                          selectedElement.locked || isSelectedElementGroupLocked
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
                        disabled={!canMutateSelectedElement}
                        className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                        title="Duplikasi Elemen"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedElement.id)}
                        disabled={!canMutateSelectedElement}
                        className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-[var(--app-error)] hover:border-rose-500 flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                        title="Hapus Elemen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isSelectedElementReadOnly && (
                    <div className="my-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        {isStrictModeBLocked
                          ? 'Mode B sedang sibuk — mode baca-saja sementara.'
                          : isSelectedElementGroupLocked
                            ? 'Elemen berada di grup terkunci (mode baca-saja).'
                            : 'Elemen terkunci (baca-saja). Ketuk ikon gembok di atas untuk membuka edit.'}
                      </span>
                    </div>
                  )}

                  {/* Contextual Form Body strictly tailored to Selected Type */}
                  <fieldset
                    disabled={isSelectedElementReadOnly}
                    className={`min-w-0 w-full border-0 p-0 m-0 divide-y divide-[var(--app-border)] lg:max-h-[500px] lg:overflow-y-auto lg:pr-1 ${
                      isSelectedElementReadOnly ? 'opacity-70' : ''
                    }`}
                  >
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

                    {/* Text Static Inspector */}
                    {selectedElement.type === 'text' && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                          <Type className="w-4 h-4" /> Pengaturan Teks Statis
                        </span>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Isi Teks</label>
                          <textarea
                            rows={2}
                            value={typeof selectedElement.properties.text === 'string' ? selectedElement.properties.text : ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'text', e.target.value)}
                            placeholder="Masukkan teks overlay siaran..."
                            className="w-full mt-1 px-3 py-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Ukuran Font (px)</label>
                            <input
                              type="number"
                              min={8}
                              max={96}
                              value={
                                typeof selectedElement.properties.fontSize === 'number' &&
                                Number.isFinite(selectedElement.properties.fontSize)
                                  ? selectedElement.properties.fontSize
                                  : 16
                              }
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'fontSize',
                                  clampNumericRange(e.target.value, 8, 96, 16),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Ketebalan Font</label>
                            <select
                              value={selectedElement.properties.fontWeight === 'normal' ? 'normal' : 'bold'}
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'fontWeight',
                                  e.target.value as 'normal' | 'bold',
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            >
                              <option value="bold">Bold (Tebal)</option>
                              <option value="normal">Normal</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Warna Teks</label>
                            <input
                              type="color"
                              value={toSafeHexColor(
                                selectedElement.properties.textColor || selectedElement.properties.color,
                                '#FFFFFF',
                              )}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'textColor', e.target.value)}
                              className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Latar Belakang</label>
                              <button
                                type="button"
                                onClick={() => updateElementProperty(selectedElement.id, 'backgroundColor', 'transparent')}
                                className="text-[10px] font-semibold text-[var(--app-accent-text)] hover:underline"
                              >
                                Transparan
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <input
                                type="color"
                                aria-label="Pilih warna latar teks"
                                value={toSafeHexColor(selectedElement.properties.backgroundColor, '#0F131B')}
                                onChange={(e) => updateElementProperty(selectedElement.id, 'backgroundColor', e.target.value)}
                                className="w-11 min-h-[44px] p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer shrink-0"
                              />
                              <input
                                type="text"
                                value={
                                  typeof selectedElement.properties.backgroundColor === 'string'
                                    ? selectedElement.properties.backgroundColor
                                    : 'transparent'
                                }
                                onChange={(e) => updateElementProperty(selectedElement.id, 'backgroundColor', e.target.value)}
                                placeholder="transparent / #000000 / rgba(...)"
                                className="w-full min-w-0 min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shape Geometry Inspector */}
                    {selectedElement.type === 'shape' && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                          <Square className="w-4 h-4" /> Pengaturan Bentuk Geometri
                        </span>

                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Warna Latar (HEX / RGBA / transparent)
                            </label>
                            <button
                              type="button"
                              onClick={() => updateElementProperty(selectedElement.id, 'backgroundColor', 'transparent')}
                              className="text-[10px] font-semibold text-[var(--app-accent-text)] hover:underline"
                            >
                              Transparan
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="color"
                              aria-label="Pilih warna latar bentuk"
                              value={toSafeHexColor(selectedElement.properties.backgroundColor, '#F2C230')}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'backgroundColor', e.target.value)}
                              className="w-11 min-h-[44px] p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer shrink-0"
                            />
                            <input
                              type="text"
                              value={
                                typeof selectedElement.properties.backgroundColor === 'string'
                                  ? selectedElement.properties.backgroundColor
                                  : 'rgba(242, 194, 48, 0.25)'
                              }
                              onChange={(e) => updateElementProperty(selectedElement.id, 'backgroundColor', e.target.value)}
                              placeholder="rgba(242, 194, 48, 0.25)"
                              className="w-full min-h-[44px] px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Warna Border</label>
                            <input
                              type="color"
                              value={toSafeHexColor(selectedElement.properties.borderColor, '#F2C230')}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'borderColor', e.target.value)}
                              className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Tebal Border</label>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={
                                typeof selectedElement.properties.borderWidth === 'number' &&
                                Number.isFinite(selectedElement.properties.borderWidth)
                                  ? selectedElement.properties.borderWidth
                                  : 2
                              }
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'borderWidth',
                                  clampNumericRange(e.target.value, 0, 20, 2),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Radius Sudut</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={
                                typeof selectedElement.properties.borderRadius === 'number' &&
                                Number.isFinite(selectedElement.properties.borderRadius)
                                  ? selectedElement.properties.borderRadius
                                  : 12
                              }
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'borderRadius',
                                  clampNumericRange(e.target.value, 0, 100, 12),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Separator Inspector */}
                    {selectedElement.type === 'separator' && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                          <Sliders className="w-4 h-4" /> Pengaturan Garis Pembatas
                        </span>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Arah Garis</label>
                          <select
                            value={
                              selectedElement.properties.orientation === 'vertical' ||
                              selectedElement.properties.direction === 'vertical'
                                ? 'vertical'
                                : selectedElement.properties.orientation === 'horizontal' ||
                                    selectedElement.properties.direction === 'horizontal'
                                  ? 'horizontal'
                                  : selectedElement.height > selectedElement.width
                                    ? 'vertical'
                                    : 'horizontal'
                            }
                            onChange={(e) =>
                              updateElementProperty(
                                selectedElement.id,
                                'orientation',
                                e.target.value as 'horizontal' | 'vertical',
                              )
                            }
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          >
                            <option value="horizontal">Horizontal (Mendatar)</option>
                            <option value="vertical">Vertikal (Tegak)</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Warna Garis</label>
                            <input
                              type="color"
                              value={toSafeHexColor(
                                selectedElement.properties.lineColor || selectedElement.properties.borderColor,
                                '#F2C230',
                              )}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'lineColor', e.target.value)}
                              className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Ketebalan (px)</label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={
                                typeof selectedElement.properties.thickness === 'number' &&
                                Number.isFinite(selectedElement.properties.thickness)
                                  ? selectedElement.properties.thickness
                                  : typeof selectedElement.properties.borderWidth === 'number' &&
                                      Number.isFinite(selectedElement.properties.borderWidth)
                                    ? selectedElement.properties.borderWidth
                                    : 2
                              }
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'thickness',
                                  clampNumericRange(e.target.value, 1, 20, 2),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-[var(--app-text-secondary)]">Efek Cahaya (Glow)</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateElementProperty(
                                selectedElement.id,
                                'glow',
                                !(selectedElement.properties.glow !== false),
                              )
                            }
                            className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                              selectedElement.properties.glow !== false
                                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                            }`}
                          >
                            {selectedElement.properties.glow !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Browser Embed Inspector */}
                    {selectedElement.type === 'browser_embed' && (() => {
                      const embedValidation = validateSafeBrowserEmbedUrl(selectedElement.properties.url);
                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                            <Globe className="w-4 h-4" /> Pengaturan Browser Embed
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              URL Widget / Web Eksternal
                            </label>
                            <input
                              type="url"
                              value={typeof selectedElement.properties.url === 'string' ? selectedElement.properties.url : ''}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'url', e.target.value)}
                              placeholder="https://example.com/widget"
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div
                            className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                              embedValidation.isValid
                                ? 'bg-[var(--app-ok-soft)] border-emerald-500/35 text-[var(--app-ok)]'
                                : 'bg-[var(--app-error-soft)] border-rose-500/35 text-[var(--app-error)]'
                            }`}
                          >
                            {embedValidation.isValid ? (
                              <>
                                <Check className="w-4 h-4 shrink-0" />
                                <span className="truncate font-medium">
                                  URL valid ({embedValidation.hostname})
                                </span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>
                                  {embedValidation.reason === 'empty'
                                    ? 'URL kosong — masukkan tautan http:// atau https://.'
                                    : 'URL tidak valid — hanya http:// dan https:// yang diizinkan.'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Soundboard Inspector */}
                    {selectedElement.type === 'soundboard' && (() => {
                      const soundboardVolumePercent = unitVolumeToPercent(selectedElement.properties.volume, 0.9);
                      const activePresetSfx =
                        typeof selectedElement.properties.presetSfx === 'string' &&
                        INSPECTOR_SOUNDBOARD_OPTIONS.some((opt) => opt.value === selectedElement.properties.presetSfx)
                          ? selectedElement.properties.presetSfx
                          : 'horn';
                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-pink-400 flex items-center gap-1.5">
                            <Music className="w-4 h-4" /> Pengaturan Soundboard Cues
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Efek Suara Bawaan</label>
                            <select
                              value={activePresetSfx}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'presetSfx', e.target.value)}
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            >
                              {INSPECTOR_SOUNDBOARD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--app-text-secondary)]">
                              <span>Volume Soundboard</span>
                              <span className="tabular-metrics text-pink-400">{soundboardVolumePercent}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={soundboardVolumePercent}
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'volume',
                                  percentToUnitVolume(clampNumericRange(e.target.value, 0, 100, 90)),
                                )
                              }
                              className="w-full mt-2 accent-pink-500 cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              URL Audio Kustom (Opsional)
                            </label>
                            <input
                              type="url"
                              value={typeof selectedElement.properties.audioUrl === 'string' ? selectedElement.properties.audioUrl : ''}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'audioUrl', e.target.value)}
                              placeholder="https://... (kosongkan untuk memakai SFX bawaan)"
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Judul Audio Kustom (Opsional)
                            </label>
                            <input
                              type="text"
                              value={typeof selectedElement.properties.title === 'string' ? selectedElement.properties.title : ''}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'title', e.target.value)}
                              placeholder="Contoh: Efek Ledakan / Intro"
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Image / Video / Sticker Media Replacement & Visual Controls */}
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

                        {/* Image Display Options */}
                        {selectedElement.type === 'image' && (
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--app-border)]">
                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Mode Tampilan (Fit)</label>
                              <select
                                value={
                                  selectedElement.properties.fit === 'cover' || selectedElement.properties.fit === 'fill'
                                    ? selectedElement.properties.fit
                                    : 'contain'
                                }
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'fit',
                                    e.target.value as 'contain' | 'cover' | 'fill',
                                  )
                                }
                                className="w-full min-h-[44px] mt-1 px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                              >
                                <option value="contain">Contain (Utuh)</option>
                                <option value="cover">Cover (Penuh)</option>
                                <option value="fill">Fill (Regang)</option>
                              </select>
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Radius Sudut (px)</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={
                                  typeof selectedElement.properties.borderRadius === 'number' &&
                                  Number.isFinite(selectedElement.properties.borderRadius)
                                    ? selectedElement.properties.borderRadius
                                    : 8
                                }
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'borderRadius',
                                    clampNumericRange(e.target.value, 0, 100, 8),
                                  )
                                }
                                className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>
                          </div>
                        )}

                        {/* Video Playback Options */}
                        {selectedElement.type === 'video' && (
                          <div className="space-y-2 pt-2 border-t border-[var(--app-border)]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--app-text-secondary)]">Putar Otomatis (Autoplay)</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'autoplay',
                                    !(selectedElement.properties.autoplay !== false),
                                  )
                                }
                                className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                                  selectedElement.properties.autoplay !== false
                                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                    : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                                }`}
                              >
                                {selectedElement.properties.autoplay !== false ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--app-text-secondary)]">Putar Berulang (Loop)</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'loop',
                                    !(selectedElement.properties.loop !== false),
                                  )
                                }
                                className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                                  selectedElement.properties.loop !== false
                                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                    : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                                }`}
                              >
                                {selectedElement.properties.loop !== false ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--app-text-secondary)]">Bisukan Suara (Muted)</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'muted',
                                    !(selectedElement.properties.muted !== false),
                                  )
                                }
                                className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                                  selectedElement.properties.muted !== false
                                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                    : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                                }`}
                              >
                                {selectedElement.properties.muted !== false ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Sticker Visual Options */}
                        {selectedElement.type === 'sticker' && (
                          <div className="space-y-3 pt-2 border-t border-[var(--app-border)]">
                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">Ikon Stiker Reaksi</label>
                              <select
                                value={
                                  typeof selectedElement.properties.stickerId === 'string' &&
                                  selectedElement.properties.stickerId.trim()
                                    ? selectedElement.properties.stickerId.trim().toLowerCase()
                                    : 'fire'
                                }
                                onChange={(e) => updateElementProperty(selectedElement.id, 'stickerId', e.target.value)}
                                className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                              >
                                {INSPECTOR_STICKER_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--app-text-secondary)]">Efek Melayang (Float)</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'floatEffect',
                                    !(selectedElement.properties.floatEffect !== false),
                                  )
                                }
                                className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                                  selectedElement.properties.floatEffect !== false
                                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                    : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                                }`}
                              >
                                {selectedElement.properties.floatEffect !== false ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                          </div>
                        )}
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

                    {/* Dynamic Text Inspector */}
                    {selectedElement.type === 'dynamic_text' && (() => {
                      const currentTemplate =
                        typeof selectedElement.properties.template === 'string'
                          ? selectedElement.properties.template
                          : typeof selectedElement.properties.text === 'string'
                            ? selectedElement.properties.text
                            : '';
                      const currentFallback =
                        typeof selectedElement.properties.fallback === 'string'
                          ? selectedElement.properties.fallback
                          : '';
                      const previewNowTime = new Date().toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      });
                      const previewOutput = resolveDynamicTextOutput({
                        template: currentTemplate,
                        fallback: currentFallback,
                        context: {
                          latestUsername: getLatestAudienceUsernameFromHistory(studioEventHistory),
                          targetText: getActiveTargetTextFromElements(elements, selectedElement.properties || {}),
                          currentTimeText: previewNowTime,
                          durationText: null,
                          topDonorName: getTopDonorNameFromHistory(studioEventHistory),
                        },
                      });
                      const supportedTokens = [
                        '{username}',
                        '{target}',
                        '{waktu}',
                        '{durasi}',
                        '{top_donor_name}',
                      ] as const;

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <Type className="w-4 h-4" /> Pengaturan Teks Dinamis
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Template Teks
                            </label>
                            <textarea
                              rows={2}
                              value={currentTemplate}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'template', e.target.value)}
                              placeholder="Contoh: Top Donatur: {top_donor_name}"
                              className="w-full mt-1 px-3 py-2 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] space-y-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              Token Didukung (ketuk untuk sisipkan)
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {supportedTokens.map((token) => (
                                <button
                                  key={token}
                                  type="button"
                                  onClick={() => {
                                    const nextTemplate = currentTemplate
                                      ? `${currentTemplate}${currentTemplate.endsWith(' ') ? '' : ' '}${token}`
                                      : token;
                                    updateElementProperty(selectedElement.id, 'template', nextTemplate);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-[10px] font-mono text-[var(--app-accent-text)]"
                                >
                                  {token}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Catatan: Token <code className="font-mono text-[var(--app-text-secondary)]">{'{durasi}'}</code> saat ini belum memiliki sumber waktu mulai LIVE tepercaya (<code className="font-mono">null</code>), sehingga akan otomatis memakai teks fallback bila digunakan.
                            </p>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Teks Fallback (Saat Data Belum Tersedia)
                            </label>
                            <input
                              type="text"
                              value={currentFallback}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'fallback', e.target.value)}
                              placeholder="Menunggu data siaran..."
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Ukuran Font (px)
                              </label>
                              <input
                                type="number"
                                min={8}
                                max={96}
                                value={
                                  typeof selectedElement.properties.fontSize === 'number' &&
                                  Number.isFinite(selectedElement.properties.fontSize)
                                    ? selectedElement.properties.fontSize
                                    : 14
                                }
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'fontSize',
                                    clampNumericRange(e.target.value, 8, 96, 14),
                                  )
                                }
                                className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Warna Teks
                              </label>
                              <input
                                type="color"
                                value={toSafeHexColor(
                                  selectedElement.properties.textColor || selectedElement.properties.color,
                                  '#FFFFFF',
                                )}
                                onChange={(e) => updateElementProperty(selectedElement.id, 'textColor', e.target.value)}
                                className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Warna Latar Belakang
                              </label>
                              <button
                                type="button"
                                onClick={() => updateElementProperty(selectedElement.id, 'backgroundColor', 'transparent')}
                                className="text-[10px] font-semibold text-[var(--app-accent-text)] hover:underline"
                              >
                                Transparan
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <input
                                type="color"
                                aria-label="Pilih warna latar teks dinamis"
                                value={toSafeHexColor(selectedElement.properties.backgroundColor, '#09090B')}
                                onChange={(e) => updateElementProperty(selectedElement.id, 'backgroundColor', e.target.value)}
                                className="w-11 min-h-[44px] p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer shrink-0"
                              />
                              <input
                                type="text"
                                value={
                                  typeof selectedElement.properties.backgroundColor === 'string'
                                    ? selectedElement.properties.backgroundColor
                                    : ''
                                }
                                onChange={(e) => updateElementProperty(selectedElement.id, 'backgroundColor', e.target.value)}
                                placeholder="transparent / #09090B / rgba(...)"
                                className="w-full min-w-0 min-h-[44px] px-2.5 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-0.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              Hasil Preview ({previewOutput.usedFallback ? 'Fallback Aktif' : 'Data Terisi'})
                            </div>
                            <div className="font-semibold text-[var(--app-text)] truncate">
                              {previewOutput.text}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Username Inspector */}
                    {selectedElement.type === 'username' && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <User className="w-4 h-4" /> Pengaturan Nama Penonton Aktif
                        </span>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                            Prefix Nama
                          </label>
                          <input
                            type="text"
                            value={typeof selectedElement.properties.prefix === 'string' ? selectedElement.properties.prefix : ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'prefix', e.target.value)}
                            placeholder="Contoh: ⭐ atau @"
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                            Badge / Label Pendukung
                          </label>
                          <input
                            type="text"
                            value={typeof selectedElement.properties.badge === 'string' ? selectedElement.properties.badge : ''}
                            onChange={(e) => updateElementProperty(selectedElement.id, 'badge', e.target.value)}
                            placeholder="Contoh: VIP Supporter (kosongkan untuk sembunyi)"
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          />
                        </div>

                        <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                          Menampilkan username dari event interaksi penonton terbaru (chat, gift, like, follow, share, join, donasi) tanpa nama simulasi palsu.
                        </p>
                      </div>
                    )}

                    {/* Avatar Inspector */}
                    {selectedElement.type === 'avatar' && (
                      <div className="py-4 space-y-3">
                        <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                          <User className="w-4 h-4" /> Pengaturan Avatar Penonton
                        </span>

                        <div>
                          <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                            Bentuk Bingkai Avatar
                          </label>
                          <select
                            value={
                              selectedElement.properties.shape === 'square' ||
                              selectedElement.properties.shape === 'rounded'
                                ? selectedElement.properties.shape
                                : 'circle'
                            }
                            onChange={(e) =>
                              updateElementProperty(
                                selectedElement.id,
                                'shape',
                                e.target.value as 'circle' | 'square' | 'rounded',
                              )
                            }
                            className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                          >
                            <option value="circle">Circle (Bulat)</option>
                            <option value="rounded">Rounded (Sudut Membulat)</option>
                            <option value="square">Square (Persegi)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-[var(--app-text-secondary)]">Efek Border Glow</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateElementProperty(
                                selectedElement.id,
                                'borderGlow',
                                !(selectedElement.properties.borderGlow !== false),
                              )
                            }
                            className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                              selectedElement.properties.borderGlow !== false
                                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                            }`}
                          >
                            {selectedElement.properties.borderGlow !== false ? 'Aktif' : 'Nonaktif'}
                          </button>
                        </div>

                        <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                          Foto profil selalu dipasangkan dengan event penonton terbaru yang sama dengan elemen Nama Penonton.
                        </p>
                      </div>
                    )}

                    {/* Event Feed Inspector */}
                    {selectedElement.type === 'event_feed' && (() => {
                      const currentMaxItems =
                        typeof selectedElement.properties.maxItems === 'number' &&
                        Number.isFinite(selectedElement.properties.maxItems) &&
                        selectedElement.properties.maxItems > 0
                          ? Math.max(1, Math.min(20, Math.floor(selectedElement.properties.maxItems)))
                          : 4;
                      const slideTransitionEnabled = selectedElement.properties.slideAnimation !== false;

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-orange-400 flex items-center gap-1.5">
                            <Zap className="w-4 h-4" /> Pengaturan Event Feed
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Jumlah Maksimal Aktivitas (1–20)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              step={1}
                              value={currentMaxItems}
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'maxItems',
                                  clampNumericRange(e.target.value, 1, 20, 4),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
                              Membatasi jumlah baris aktivitas terbaru yang ditampilkan pada feed (default 4, rentang 1–20).
                            </p>
                          </div>

                          <div className="space-y-1 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--app-text-secondary)]">Transisi CSS Item</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'slideAnimation',
                                    !(selectedElement.properties.slideAnimation !== false),
                                  )
                                }
                                className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                                  slideTransitionEnabled
                                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                    : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                                }`}
                              >
                                {slideTransitionEnabled ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Mengontrol kelas transisi CSS pada setiap baris item saat daftar diperbarui.
                            </p>
                          </div>

                          <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                            Sumber data berasal langsung dari riwayat aktivitas penonton aktual tanpa event simulasi palsu.
                          </p>
                        </div>
                      );
                    })()}

                    {/* Live Viewer Counter Inspector */}
                    {selectedElement.type === 'live_viewer_counter' && (() => {
                      const currentFallbackViewerCount =
                        typeof selectedElement.properties.viewerCount === 'number' &&
                        Number.isFinite(selectedElement.properties.viewerCount) &&
                        selectedElement.properties.viewerCount >= 0
                          ? Math.floor(selectedElement.properties.viewerCount)
                          : 1420;
                      const liveBadgeEnabled = selectedElement.properties.liveBadge !== false;
                      const viewerPreview = resolveViewerCounterDisplay({
                        liveViewerCount: latestViewerCount,
                        fallbackPropertyValue: currentFallbackViewerCount,
                      });
                      const previewShowsLiveBadge = shouldShowViewerLiveBadge(
                        selectedElement.properties.liveBadge,
                        viewerPreview.hasLiveSample,
                      );

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <Users className="w-4 h-4" /> Pengaturan Penghitung Penonton
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Angka Cadangan (Standby)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={currentFallbackViewerCount}
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'viewerCount',
                                  clampNumericRange(e.target.value, 0, 999999999, 1420),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
                              Hanya digunakan sebagai angka cadangan ketika belum ada sampel penonton LIVE. Data penonton LIVE aktual tetap diprioritaskan dan tidak akan tertimpa.
                            </p>
                          </div>

                          <div className="space-y-1 pt-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[var(--app-text-secondary)]">Badge LIVE</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'liveBadge',
                                    !(selectedElement.properties.liveBadge !== false),
                                  )
                                }
                                className={`btn-press min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors ${
                                  liveBadgeEnabled
                                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                                    : 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]'
                                }`}
                              >
                                {liveBadgeEnabled ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Badge LIVE hanya tampil di layar jika sampel jumlah penonton LIVE yang valid tersedia dan opsi ini aktif.
                            </p>
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-0.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              Status Tampilan Saat Ini ({viewerPreview.hasLiveSample ? 'Data LIVE Aktual' : 'Standby / Cadangan'})
                            </div>
                            <div className="font-semibold text-[var(--app-text)] tabular-metrics flex items-center gap-1.5">
                              {previewShowsLiveBadge && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black tracking-wider">
                                  LIVE
                                </span>
                              )}
                              <span>{viewerPreview.formattedCount} penonton</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Counter Inspector */}
                    {selectedElement.type === 'counter' && (() => {
                      const rawGoal = selectedElement.properties.targetGoal ?? selectedElement.properties.target;
                      const effectiveGoal =
                        typeof rawGoal === 'number' && Number.isFinite(rawGoal) && rawGoal > 0
                          ? Math.floor(rawGoal)
                          : 2000;
                      const currentLabel =
                        typeof selectedElement.properties.label === 'string'
                          ? selectedElement.properties.label
                          : 'Target Follower Hari Ini';

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4" /> Pengaturan Penghitung Target
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Target Penghitung (Goal)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={999999999}
                              step={1}
                              value={effectiveGoal}
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'targetGoal',
                                  clampNumericRange(e.target.value, 1, 999999999, 2000),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
                              Bilangan bulat positif (minimal 1, default 2000). Disimpan ke <code className="font-mono">targetGoal</code> dengan kompatibilitas fallback <code className="font-mono">target</code>.
                            </p>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Label Penghitung
                            </label>
                            <input
                              type="text"
                              value={currentLabel}
                              onChange={(e) => updateElementProperty(selectedElement.id, 'label', e.target.value)}
                              placeholder="Target Follower Hari Ini"
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              Angka Berjalan Saat Ini (Event LIVE)
                            </div>
                            <div className="font-mono font-bold text-emerald-400 tabular-metrics">
                              {simulatedLikes.toLocaleString('id-ID')} / {effectiveGoal.toLocaleString('id-ID')}
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Angka berjalan berasal langsung dari event like/tap LIVE yang diterima aplikasi dan tidak diubah secara manual melalui properti elemen.
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Progress Bar Inspector */}
                    {selectedElement.type === 'progress_bar' && (() => {
                      const propsObj = selectedElement.properties || {};
                      const progressPreview = computeProgressBarModel(propsObj);
                      const hasExplicitCurrent =
                        propsObj.currentAmount !== undefined || propsObj.current !== undefined;
                      const currentAmountInputValue = hasExplicitCurrent
                        ? Math.max(0, Math.floor(progressPreview.current))
                        : 350000;
                      const hasExplicitTarget =
                        propsObj.targetAmount !== undefined || propsObj.target !== undefined;
                      const targetAmountInputValue = hasExplicitTarget
                        ? progressPreview.isValidTarget
                          ? Math.max(1, Math.floor(progressPreview.target))
                          : ''
                        : 1000000;
                      const currentCurrency =
                        typeof propsObj.currency === 'string' ? propsObj.currency : 'Rp';
                      const safeBarColor = toSafeHexColor(propsObj.barColor, '#F2C230');

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-[var(--app-accent-text)] flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4" /> Pengaturan Progress Bar Donasi
                          </span>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Jumlah Terkumpul
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={currentAmountInputValue}
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'currentAmount',
                                    clampNumericRange(e.target.value, 0, 999999999999, 0),
                                  )
                                }
                                className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Target Donasi (&gt; 0)
                              </label>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={targetAmountInputValue}
                                placeholder="Target > 0"
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'targetAmount',
                                    clampNumericRange(e.target.value, 1, 999999999999, 1000000),
                                  )
                                }
                                className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Mata Uang / Prefix
                              </label>
                              <input
                                type="text"
                                value={currentCurrency}
                                onChange={(e) =>
                                  updateElementProperty(selectedElement.id, 'currency', e.target.value)
                                }
                                placeholder="Rp"
                                className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Warna Progress Bar
                              </label>
                              <input
                                type="color"
                                aria-label="Pilih warna progress bar"
                                value={safeBarColor}
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'barColor',
                                    toSafeHexColor(e.target.value, '#F2C230'),
                                  )
                                }
                                className="w-full min-h-[44px] mt-1 p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer"
                              />
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              <span>Preview Progress</span>
                              <span className="font-mono text-[var(--app-accent-text)]">
                                {progressPreview.percentLabel}
                              </span>
                            </div>
                            <div className="font-semibold text-[var(--app-text)] truncate tabular-metrics">
                              {progressPreview.formattedCurrent} / {progressPreview.formattedTarget}
                            </div>
                            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${progressPreview.percent}%`,
                                  backgroundColor: safeBarColor,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Combo Counter Inspector */}
                    {selectedElement.type === 'combo_counter' && (() => {
                      const propsObj = selectedElement.properties || {};
                      const currentComboLabel =
                        typeof propsObj.comboLabel === 'string'
                          ? propsObj.comboLabel
                          : 'x25 COMBO MAWAR MERAH!';
                      const safeThemeColor = toSafeHexColor(propsObj.themeColor, '#EA580C');

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-orange-400 flex items-center gap-1.5">
                            <Flame className="w-4 h-4" /> Pengaturan Combo Counter
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Label Combo
                            </label>
                            <input
                              type="text"
                              value={currentComboLabel}
                              onChange={(e) =>
                                updateElementProperty(selectedElement.id, 'comboLabel', e.target.value)
                              }
                              placeholder="x25 COMBO MAWAR MERAH!"
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
                            />
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
                              Teks yang ditampilkan langsung di banner combo (default: x25 COMBO MAWAR MERAH!). Jika dikosongkan, renderer menggunakan fallback <code className="font-mono">x25 COMBO LOVE!</code>.
                            </p>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Warna Tema Combo
                            </label>
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="color"
                                aria-label="Pilih warna tema combo"
                                value={safeThemeColor}
                                onChange={(e) =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'themeColor',
                                    toSafeHexColor(e.target.value, '#EA580C'),
                                  )
                                }
                                className="w-14 min-h-[44px] p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] cursor-pointer shrink-0"
                              />
                              <div
                                className="flex-1 min-h-[44px] px-3 rounded-xl flex items-center justify-between text-white shadow-sm overflow-hidden"
                                style={{
                                  background: `linear-gradient(90deg, ${safeThemeColor}, #F59E0B)`,
                                }}
                              >
                                <span className="text-[11px] font-black tracking-wider truncate">
                                  {currentComboLabel || 'x25 COMBO LOVE!'}
                                </span>
                                <span className="text-[10px] font-mono opacity-90 shrink-0 ml-2">
                                  {safeThemeColor.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
                              Mengatur warna awal gradient banner combo (default #EA580C ke aksen #F59E0B).
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Leaderboard Inspector */}
                    {selectedElement.type === 'leaderboard' && (() => {
                      const propsObj = selectedElement.properties || {};
                      const effectiveTopCount =
                        typeof propsObj.topCount === 'number' &&
                        Number.isFinite(propsObj.topCount) &&
                        propsObj.topCount > 0
                          ? Math.max(1, Math.min(10, Math.floor(propsObj.topCount)))
                          : 3;
                      const showAmountsEnabled = propsObj.showAmounts !== false;
                      const leaderboardPreviewEntries = buildLeaderboardEntries(
                        studioEventHistory,
                        effectiveTopCount,
                      );

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-[#F2C230] flex items-center gap-1.5">
                            <Award className="w-4 h-4" /> Pengaturan Peringkat Donatur (Leaderboard)
                          </span>

                          <div>
                            <label className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                              Jumlah Peringkat (1–10)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              step={1}
                              value={effectiveTopCount}
                              onChange={(e) =>
                                updateElementProperty(
                                  selectedElement.id,
                                  'topCount',
                                  clampNumericRange(e.target.value, 1, 10, 3),
                                )
                              }
                              className="w-full min-h-[44px] mt-1 px-3 bg-[var(--app-surface-muted)] border border-[var(--app-border)] rounded-xl text-xs text-[var(--app-text)] tabular-metrics focus:outline-none focus:border-[var(--app-accent)]"
                            />
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-1 leading-relaxed">
                              Membatasi jumlah peringkat teratas yang ditampilkan antara 1 sampai 10 (default: 3).
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Tampilkan Nominal
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'showAmounts',
                                    !(selectedElement.properties.showAmounts !== false),
                                  )
                                }
                                className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold border transition-all ${
                                  showAmountsEnabled
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                    : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
                                }`}
                              >
                                {showAmountsEnabled ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              {showAmountsEnabled
                                ? 'Menampilkan nominal dukungan terakhir pada setiap peringkat jika tersedia.'
                                : 'Menyembunyikan nominal sementara peringkat dan jumlah interaksi tetap tampil.'}
                            </p>
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              <span>Informasi Sumber Data</span>
                              <span className="font-mono text-[#F2C230]">
                                {leaderboardPreviewEntries.length} entri
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Daftar peringkat dihitung otomatis hanya dari event <code className="font-mono">gift</code> dan <code className="font-mono">donation</code> aktual yang memiliki username. Jika sesi belum memiliki gift/donasi, elemen tetap menampilkan status kosong &ldquo;Belum ada gift / donasi sesi ini&rdquo; tanpa data palsu atau input donatur manual.
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Live Text Inspector */}
                    {selectedElement.type === 'live_text' && (() => {
                      const propsObj = selectedElement.properties || {};
                      const showFpsEnabled = propsObj.showFps !== false;
                      const showBitrateEnabled = propsObj.showBitrate !== false;
                      const livePreview = buildLiveTextRenderModel({
                        isModeBSelected,
                        modeBStatus,
                        showFps: showFpsEnabled,
                        showBitrate: showBitrateEnabled,
                      });

                      return (
                        <div className="py-4 space-y-3">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <Radio className="w-4 h-4" /> Pengaturan Teks Siaran Langsung (Live Text)
                          </span>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Tampilkan FPS
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'showFps',
                                    !(selectedElement.properties.showFps !== false),
                                  )
                                }
                                className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold border transition-all ${
                                  showFpsEnabled
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                    : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
                                }`}
                              >
                                {showFpsEnabled ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Menampilkan atau menyembunyikan label <code className="font-mono">FPS</code> pada elemen Live Text (default: Aktif).
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-[var(--app-text-secondary)]">
                                Tampilkan Bitrate
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateElementProperty(
                                    selectedElement.id,
                                    'showBitrate',
                                    !(selectedElement.properties.showBitrate !== false),
                                  )
                                }
                                className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold border transition-all ${
                                  showBitrateEnabled
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                    : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
                                }`}
                              >
                                {showBitrateEnabled ? 'Aktif' : 'Nonaktif'}
                              </button>
                            </div>
                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Menampilkan atau menyembunyikan angka bitrate dari snapshot runtime Mode B (default: Aktif).
                            </p>
                          </div>

                          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[11px] space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
                              <span>Informasi Status LIVE (Read-Only)</span>
                              <span className="font-mono text-[var(--app-accent-text)]">
                                {livePreview.statusLabel}
                              </span>
                            </div>

                            <div className="px-2.5 py-1.5 rounded-lg bg-zinc-950/90 border border-zinc-800 flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-300">
                              <span className="font-bold text-white shrink-0">{livePreview.statusLabel}</span>
                              <div className="flex items-center gap-2 truncate">
                                <span>RES: {livePreview.resolutionLabel}</span>
                                {showFpsEnabled && <span>FPS: {livePreview.fpsLabel}</span>}
                                {showBitrateEnabled && <span>{livePreview.bitrateLabel}</span>}
                              </div>
                            </div>

                            <p className="text-[10px] text-[var(--app-text-muted)] leading-relaxed">
                              Status <code className="font-mono">LIVE</code>, <code className="font-mono">CONNECTING</code>, <code className="font-mono">HOST WAIT</code>, <code className="font-mono">STOPPING</code>, <code className="font-mono">OFFLINE</code>, maupun error berasal langsung dari runtime Mode B (Mode A tampil sebagai <code className="font-mono">STANDBY</code>). Bitrate dibaca dari snapshot <code className="font-mono">modeBStatus</code> saat memenuhi kondisi helper. Nilai FPS dan resolusi saat ini belum dipasok ke <code className="font-mono">buildLiveTextRenderModel()</code> oleh pemanggil di StudioView, sehingga ketika tidak tersedia tetap ditampilkan sebagai <code className="font-mono">&mdash;</code>.
                            </p>
                          </div>
                        </div>
                      );
                    })()}

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
                            disabled={!canMoveSelectedLayerUp}
                            className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] hover:text-[var(--app-text)] disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            Ke Atas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveLayer(selectedElement.id, 'down')}
                            disabled={!canMoveSelectedLayerDown}
                            className="btn-press min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] hover:text-[var(--app-text)] disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            Ke Bawah
                          </button>
                        </div>
                      </div>
                    </div>
                  </fieldset>
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
            <div className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
              {/* Shortcut Banner to Full Sources Catalog */}
              <button
                type="button"
                onClick={() => setActiveSidePanel('sources')}
                className="btn-press w-full min-h-[44px] px-3.5 rounded-xl bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] text-[var(--app-accent-text)] text-xs font-bold flex items-center justify-between hover:border-[var(--app-accent)] transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 shrink-0" />
                  <span>Katalog {SOURCE_CATALOG.length} Sumber Siaran Lengkap</span>
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

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('text', 'Teks Statis')}
                    className="btn-press min-h-[56px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex items-center gap-2 transition-all"
                  >
                    <Type className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--app-text)] block">Teks / Judul</span>
                      <span className="text-[10px] text-[var(--app-text-secondary)]">Label &amp; header kustom</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('shape', 'Bentuk Geometri')}
                    className="btn-press min-h-[56px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-left flex items-center gap-2 transition-all"
                  >
                    <Square className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--app-text)] block">Bentuk Panel</span>
                      <span className="text-[10px] text-[var(--app-text-secondary)]">Backdrop card &amp; frame</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddQuickElement('soundboard', 'Tombol Soundboard')}
                    className="btn-press min-h-[56px] p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-cyan-500/60 text-left flex items-center gap-2 transition-all col-span-2"
                  >
                    <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-[var(--app-text)] block">Tombol Soundboard SFX</span>
                      <span className="text-[10px] text-[var(--app-text-secondary)]">Efek suara instan 1-tap saat LIVE</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SOURCES CATALOG (INTEGRATED SOURCES LIBRARY) */}
          {activeSidePanel === 'sources' && (
            <div className="space-y-3.5 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
              <div className="pl-3 border-l-2 border-[var(--app-accent)] text-xs text-[var(--app-text-secondary)]">
                Pustaka {SOURCE_CATALOG.length} sumber overlay siaran terkurasi. Klik <strong className="text-[var(--app-text)]">Tambah</strong> untuk memasukkan sumber ke kanvas.
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
                      {cat === 'all'
                        ? `Semua (${SOURCE_CATALOG.length})`
                        : cat === 'basic'
                          ? `Dasar (${SOURCE_CATALOG.filter((item) => item.category === 'basic').length})`
                          : `Dinamis (${SOURCE_CATALOG.filter((item) => item.category === 'dynamic').length})`}
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
            <div className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
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
                  onClick={() => {
                    setSidebarCreateError(null);
                    setNewPresetModalOpen(true);
                  }}
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
                  {sidebarCreateError && (
                    <div
                      role="alert"
                      className="p-2 rounded-lg border border-rose-500/40 bg-rose-950/40 text-[11px] text-rose-200 flex items-center gap-1.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>{sidebarCreateError}</span>
                    </div>
                  )}
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
                      disabled={isCreatingSidebarPreset}
                      onClick={() => {
                        setSidebarCreateError(null);
                        setNewPresetModalOpen(false);
                      }}
                      className="btn-press min-h-[44px] px-3.5 bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] rounded-xl text-xs font-semibold disabled:opacity-40"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={isCreatingSidebarPreset}
                      onClick={() => void handleSidebarCreatePresetFromScene()}
                      className="btn-press min-h-[44px] px-4 bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      {isCreatingSidebarPreset ? 'Menyimpan...' : 'Simpan Salinan'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MEDIA LIBRARY & LOCAL IMPORT */}
          {activeSidePanel === 'media' && (
            <div className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
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
            <div className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
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
            <div className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
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
            <div className="space-y-3.5 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
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
