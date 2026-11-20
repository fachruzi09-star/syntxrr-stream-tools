import type {
  MockLiveEvent,
  MockSongItem,
  MockSoundSlot,
  MockSourceItem,
  MockStudioElement,
  MockStudioGroup,
  MockStudioPreset,
  MockStudioSuperGroup,
} from './types';

export const EXPLORATION_IMAGES = {
  studioStage: '/src/assets/images/creator_studio_stage_1795202577714.jpg',
  hostAvatar: '/src/assets/images/host_portrait_avatar_1795202577618.jpg',
};

export const INITIAL_SUPER_GROUPS: MockStudioSuperGroup[] = [
  { id: 'sg_broadcast', name: 'Main Broadcast Rig', visible: true },
];

export const INITIAL_GROUPS: MockStudioGroup[] = [
  { id: 'grp_overlays', name: 'Interactive Overlays', superGroupId: 'sg_broadcast', visible: true, locked: false },
  { id: 'grp_branding', name: 'Channel Identity', visible: true, locked: false },
];

export const INITIAL_STUDIO_ELEMENTS: MockStudioElement[] = [
  {
    id: 'el_camera',
    name: 'Host Camera (Primary)',
    category: 'camera',
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    opacity: 100,
    zIndex: 1,
    summary: '1080p · Front / USB UVC Feed',
  },
  {
    id: 'el_alert',
    name: 'Gift & Follow Alert Stage',
    category: 'alert',
    groupId: 'grp_overlays',
    superGroupId: 'sg_broadcast',
    visible: true,
    locked: false,
    x: 10,
    y: 12,
    width: 80,
    height: 15,
    opacity: 96,
    zIndex: 4,
    summary: 'Animated queue · 4.2s hold',
  },
  {
    id: 'el_chat',
    name: 'Live Chat Dock',
    category: 'overlay',
    groupId: 'grp_overlays',
    superGroupId: 'sg_broadcast',
    visible: true,
    locked: false,
    x: 6,
    y: 56,
    width: 68,
    height: 26,
    opacity: 92,
    zIndex: 3,
    summary: 'Auto-scroll · 5 visible messages',
  },
  {
    id: 'el_song',
    name: 'Now Playing Strip',
    category: 'widget',
    groupId: 'grp_branding',
    visible: true,
    locked: false,
    x: 6,
    y: 85,
    width: 88,
    height: 9,
    opacity: 94,
    zIndex: 5,
    summary: 'Song Request ticker + visualizer',
  },
  {
    id: 'el_banner',
    name: 'Lower-Third Creator Tag',
    category: 'text',
    groupId: 'grp_branding',
    visible: true,
    locked: true,
    x: 6,
    y: 6,
    width: 56,
    height: 5,
    opacity: 90,
    zIndex: 6,
    summary: '@syntxrr.atelier · Acoustic Session',
  },
];

export const MOCK_PRESETS: MockStudioPreset[] = [
  {
    id: 'preset_studio_night',
    name: 'Acoustic Night Portrait',
    aspect: '9:16',
    category: 'Talk & Music',
    elementsCount: 5,
    groupsCount: 2,
    favorite: true,
    summary: 'Clean 9:16 creator framing with lower chat dock and compact song strip.',
  },
  {
    id: 'preset_brb_pause',
    name: 'Intermission / Screensaver',
    aspect: '9:16',
    category: 'Standby',
    elementsCount: 3,
    groupsCount: 1,
    favorite: true,
    summary: 'Looping ambient canvas safe for Mode B audio continuity.',
  },
  {
    id: 'preset_gaming_desk',
    name: 'Dual-Cam Widescreen',
    aspect: '16:9',
    category: 'Desktop / Capture',
    elementsCount: 6,
    groupsCount: 2,
    favorite: false,
    summary: '16:9 screen capture stage with corner host PiP and clean right rail.',
  },
  {
    id: 'preset_podcast_minimal',
    name: 'Editorial Duo Talk',
    aspect: '16:9',
    category: 'Podcast',
    elementsCount: 4,
    groupsCount: 1,
    favorite: false,
    summary: 'Warm typography lower-third and muted gift banner.',
  },
];

export const MOCK_ELEMENT_CATALOG: Array<{
  name: string;
  category: MockStudioElement['category'];
  spec: string;
}> = [
  { name: 'Gift Goal Bar', category: 'widget', spec: 'Live diamond progress counter' },
  { name: 'Pinned Topic Card', category: 'text', spec: 'Editable stream headline block' },
  { name: 'VIP Alert Banner', category: 'alert', spec: 'High-value gift priority trigger' },
  { name: 'Local Loop Visual', category: 'media', spec: 'MP4 / WebM hardware-decoded loop' },
  { name: 'Secondary Angle PiP', category: 'camera', spec: 'Picture-in-Picture camera slot' },
  { name: 'Top Gifter Ticker', category: 'overlay', spec: 'Rolling contributor recognition' },
];

export const MOCK_MARKETPLACE_PACKS = [
  {
    id: 'mk_atelier',
    name: 'Monochrome Editorial Pack',
    author: 'SYNTXRR Studio',
    elements: 6,
    category: 'Minimalist',
    installed: true,
  },
  {
    id: 'mk_broadcast',
    name: 'Broadcast Lower-Thirds Set',
    author: 'ProMaster Audio',
    elements: 8,
    category: 'Production',
    installed: false,
  },
  {
    id: 'mk_acoustic',
    name: 'Late Night Vinyl Widgets',
    author: 'Atelier Jakarta',
    elements: 5,
    category: 'Music LIVE',
    installed: false,
  },
];

export const MOCK_LOCAL_MEDIA = [
  { id: 'med_1', name: 'opening_bumper_1080p.mp4', kind: 'Video', duration: '00:14', size: '18.4 MB' },
  { id: 'med_2', name: 'screensaver_warm_lamp.mp4', kind: 'Loop', duration: '00:30', size: '31.2 MB' },
  { id: 'med_3', name: 'atelier_watermark.png', kind: 'Graphic', duration: 'Static', size: '420 KB' },
];

export const MOCK_LIVE_EVENTS: MockLiveEvent[] = [
  { id: 'ev_1', type: 'gift', user: 'nadia_k', message: 'Sent Galaxy (x1)', diamonds: 1000, time: '20:41:12', readByTts: true },
  { id: 'ev_2', type: 'chat', user: 'arief.studio', message: '!play Midnight Velvet', time: '20:41:08', readByTts: true },
  { id: 'ev_3', type: 'follow', user: 'raka_wibowo', message: 'Followed the broadcast', time: '20:40:59' },
  { id: 'ev_4', type: 'chat', user: 'sinta_audio', message: 'Kualitas vokal & balance musiknya rapi sekali malam ini.', time: '20:40:51', readByTts: true },
  { id: 'ev_5', type: 'gift', user: 'bima_pratama', message: 'Sent Rose (x5)', diamonds: 5, time: '20:40:44' },
  { id: 'ev_6', type: 'join', user: 'dewi.n', message: 'Joined the LIVE room', time: '20:40:38' },
  { id: 'ev_7', type: 'system', user: 'Transport', message: 'Connected Direct WebSocket (Room 741982014)', time: '20:39:50' },
];

export const INITIAL_SOURCES: MockSourceItem[] = [
  {
    id: 'src_cam_front',
    kind: 'camera',
    name: 'Front Camera (Wide)',
    detail: '1080×1920 · 30 fps · Auto Exposure',
    permission: 'granted',
    connected: true,
    activeInScene: true,
  },
  {
    id: 'src_mic_usb',
    kind: 'microphone',
    name: 'Shure MV7 USB Audio',
    detail: '48 kHz Mono · Noise Suppression Active',
    permission: 'granted',
    connected: true,
    activeInScene: true,
  },
  {
    id: 'src_screen',
    kind: 'screen',
    name: 'Android Screen Projection',
    detail: 'MediaProjection · Audio Playback Capture',
    permission: 'prompt',
    connected: false,
    activeInScene: false,
  },
  {
    id: 'src_media_loop',
    kind: 'media',
    name: 'Local Media Pool (3 Assets)',
    detail: 'IndexedDB & Device Storage · Ready',
    permission: 'granted',
    connected: true,
    activeInScene: true,
  },
];

export const INITIAL_SOUNDBOARD: MockSoundSlot[] = [
  { id: 'sb_1', name: 'Warm Applause', duration: '2.4s', category: 'Audience', favorite: true, source: 'built_in' },
  { id: 'sb_2', name: 'Broadcast Chime', duration: '1.1s', category: 'Cue', favorite: true, source: 'built_in' },
  { id: 'sb_3', name: 'Rimshot Accent', duration: '0.8s', category: 'Reaction', favorite: false, source: 'built_in' },
  { id: 'sb_4', name: 'Vinyl Transition', duration: '1.9s', category: 'Bridge', favorite: true, source: 'local' },
  { id: 'sb_5', name: 'Subtle Air Horn', duration: '1.4s', category: 'Hype', favorite: false, source: 'built_in' },
  { id: 'sb_6', name: 'Night Outro Pad', duration: '3.8s', category: 'Outro', favorite: false, source: 'local' },
];

export const MOCK_SONG_QUEUE: MockSongItem[] = [
  { id: 'sg_1', title: 'Midnight Velvet (Live Lo-Fi Mix)', artist: 'Nusa Quartet', requester: 'arief.studio', duration: '03:42', status: 'playing' },
  { id: 'sg_2', title: 'Jakarta Rain 2AM', artist: 'Sore Collective', requester: 'nadia_k', duration: '04:08', status: 'approved' },
  { id: 'sg_3', title: 'Warm Cassette Echoes', artist: 'Kopi & Synth', requester: 'sinta_audio', duration: '03:19', status: 'pending' },
];

export const MOCK_INTEGRATIONS = [
  { id: 'int_tt', name: 'TikTok LIVE', role: 'Direct WebSocket + Optional EulerStream', status: 'Connected Direct', detail: '@syntxrr.atelier · OAuth Optional' },
  { id: 'int_yt', name: 'YouTube Data API', role: 'Song Request Catalog Search', status: 'Standby', detail: 'Local key not configured' },
  { id: 'int_sp', name: 'Spotify Playback', role: 'Metadata & Queue Bridge', status: 'Configured', detail: 'Client ID linked locally' },
  { id: 'int_wh', name: 'Saweria / Webhook', role: 'External Donation Alert Feed', status: 'Ready', detail: 'Local listener enabled' },
];

export const MOCK_DECK_MACROS = [
  { id: 'mc_1', title: 'Acoustic Portrait', subtitle: 'Switch Preset', group: 'Scene' },
  { id: 'mc_2', title: 'Screensaver Pause', subtitle: 'Mode B Safe Loop', group: 'Scene' },
  { id: 'mc_3', title: 'Trigger Gift Test', subtitle: 'Simulate Galaxy', group: 'Simulator' },
  { id: 'mc_4', title: 'Play Chime', subtitle: 'Soundboard #2', group: 'Audio' },
  { id: 'mc_5', title: 'Skip Current Song', subtitle: 'Advance Queue', group: 'Music' },
  { id: 'mc_6', title: 'Mute TTS Voice', subtitle: 'Toggle Reader', group: 'Voice' },
];
