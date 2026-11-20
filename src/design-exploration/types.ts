export type OptionId = 'D_PLUS' | 'D' | 'A' | 'B' | 'C';
export type ExplorationTab = OptionId | 'D_DIFF' | 'OVERVIEW';
export type ThemeMode = 'dark' | 'light';
export type ViewportPreset = '1280x800' | '412x915' | '390x844' | '360x800';
export type OperatingMode = 'mode_a' | 'mode_b';

export type ExplorationModule =
  | 'dashboard'
  | 'studio'
  | 'live_center'
  | 'sources'
  | 'audio'
  | 'hud'
  | 'integrations'
  | 'remote_deck'
  | 'settings';

export type StudioInspectorTab =
  | 'elements'
  | 'sources'
  | 'layers'
  | 'inspector'
  | 'presets'
  | 'marketplace'
  | 'media'
  | 'simulator'
  | 'song_request';

export interface MockStudioElement {
  id: string;
  name: string;
  category: 'camera' | 'overlay' | 'alert' | 'text' | 'media' | 'widget';
  groupId?: string;
  superGroupId?: string;
  visible: boolean;
  locked: boolean;
  x: number; // % 0-100
  y: number; // % 0-100
  width: number; // % 0-100
  height: number; // % 0-100
  opacity: number; // 0-100
  zIndex: number;
  summary: string;
}

export interface MockStudioGroup {
  id: string;
  name: string;
  superGroupId?: string;
  visible: boolean;
  locked: boolean;
}

export interface MockStudioSuperGroup {
  id: string;
  name: string;
  visible: boolean;
}

export interface MockStudioPreset {
  id: string;
  name: string;
  aspect: '9:16' | '16:9';
  category: string;
  elementsCount: number;
  groupsCount: number;
  favorite: boolean;
  summary: string;
}

export interface MockLiveEvent {
  id: string;
  type: 'chat' | 'gift' | 'follow' | 'join' | 'system';
  user: string;
  message: string;
  time: string;
  diamonds?: number;
  readByTts?: boolean;
}

export interface MockSourceItem {
  id: string;
  kind: 'camera' | 'microphone' | 'screen' | 'media';
  name: string;
  detail: string;
  permission: 'granted' | 'prompt' | 'denied';
  connected: boolean;
  activeInScene: boolean;
}

export interface MockSoundSlot {
  id: string;
  name: string;
  duration: string;
  category: string;
  favorite: boolean;
  source: 'built_in' | 'local';
}

export interface MockSongItem {
  id: string;
  title: string;
  artist: string;
  requester: string;
  duration: string;
  status: 'playing' | 'approved' | 'pending';
}

export interface ExplorationSharedState {
  optionId: OptionId;
  theme: ThemeMode;
  isMobileViewport: boolean;
  viewportWidth: number;
  activeModule: ExplorationModule;
  onNavigate: (module: ExplorationModule) => void;
  operatingMode: OperatingMode;
  onChangeOperatingMode: (mode: OperatingMode) => void;
  isLiveActive: boolean;
  onToggleLiveActive: () => void;
  canvasAspect: '9:16' | '16:9';
  onChangeCanvasAspect: (aspect: '9:16' | '16:9') => void;
  activePresetId: string;
  onSelectPreset: (id: string) => void;
  studioElements: MockStudioElement[];
  selectedElementId: string;
  onSelectElement: (id: string) => void;
  onToggleElementVisibility: (id: string) => void;
  onToggleElementLock: (id: string) => void;
  onUpdateElementProp: (id: string, patch: Partial<MockStudioElement>) => void;
  onAddMockElement: (name: string, category: MockStudioElement['category']) => void;
  studioDockTab: StudioInspectorTab;
  onChangeStudioDockTab: (tab: StudioInspectorTab) => void;
  simulatedBanner: string | null;
  onTriggerSimulator: (label: string) => void;
  liveFilter: 'all' | 'chat' | 'gift' | 'follow' | 'join';
  onChangeLiveFilter: (f: 'all' | 'chat' | 'gift' | 'follow' | 'join') => void;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  playingSoundId: string | null;
  onPlaySound: (id: string) => void;
  sounds: MockSoundSlot[];
  onToggleSoundFavorite: (id: string) => void;
  masterVol: number;
  sfxVol: number;
  micGain: number;
  onChangeAudioLevel: (key: 'master' | 'sfx' | 'mic', val: number) => void;
  musicPlaying: boolean;
  onToggleMusicPlaying: () => void;
  hudExpanded: boolean;
  onToggleHudExpanded: () => void;
  hudSide: 'left' | 'right';
  onChangeHudSide: (side: 'left' | 'right') => void;
  hudOpacity: number;
  onChangeHudOpacity: (val: number) => void;
  hudTab: 'chat' | 'soundboard' | 'music' | 'mixer';
  onChangeHudTab: (tab: 'chat' | 'soundboard' | 'music' | 'mixer') => void;
  sources: MockSourceItem[];
  onToggleSourceConnected: (id: string) => void;
  tiktokMethod: 'direct' | 'euler';
  onChangeTiktokMethod: (m: 'direct' | 'euler') => void;
  eulerAuthType: 'api_key' | 'jwt';
  onChangeEulerAuthType: (t: 'api_key' | 'jwt') => void;
  onToggleTheme: () => void;
}
