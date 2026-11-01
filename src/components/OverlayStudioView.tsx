import React, { useState } from 'react';
import { Scene, OverlayWidgetConfig, SongRequest } from '../types';
import {
  Sparkles,
  Layers,
  Sliders,
  Eye,
  EyeOff,
  Copy,
  Check,
  Disc3,
  MessageSquare,
  Bell,
  Type,
  Music2,
  Send,
  RotateCcw,
} from 'lucide-react';

interface OverlayStudioViewProps {
  activeScene: Scene | null;
  nowPlayingSong: SongRequest | null;
  queuedSongs: SongRequest[];
  onUpdateOverlayConfig: (config: OverlayWidgetConfig) => void;
}

type SelectedWidgetKey = 'nowPlaying' | 'musicRequest' | 'liveChat' | 'eventAlert' | 'customText';

interface SimulatedChatMessage {
  id: string;
  user: string;
  message: string;
  badge?: string;
  time: string;
}

export const OverlayStudioView: React.FC<OverlayStudioViewProps> = ({
  activeScene,
  nowPlayingSong,
  queuedSongs,
  onUpdateOverlayConfig,
}) => {
  const [selectedWidget, setSelectedWidget] = useState<SelectedWidgetKey>('nowPlaying');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [testChatMessage, setTestChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<SimulatedChatMessage[]>([
    { id: '1', user: 'VibeGamer', message: 'That clutch play was insane! 🔥', badge: 'VIP', time: '12:01' },
    { id: '2', user: 'PixelKnight', message: 'What song is currently playing?', time: '12:02' },
    { id: '3', user: 'AeroStream', message: 'Hello from YouTube Live!', badge: 'SUB', time: '12:03' },
  ]);

  if (!activeScene) {
    return (
      <div className="p-8 text-center text-slate-400">
        No active scene selected. Please choose a scene from Scene Manager.
      </div>
    );
  }

  const { overlayConfig } = activeScene;

  const handleToggleWidget = (key: SelectedWidgetKey) => {
    const updated = {
      ...overlayConfig,
      [key]: {
        ...overlayConfig[key],
        enabled: !overlayConfig[key].enabled,
      },
    };
    onUpdateOverlayConfig(updated);
  };

  const handleUpdateWidgetField = (key: SelectedWidgetKey, field: string, value: any) => {
    const updated = {
      ...overlayConfig,
      [key]: {
        ...overlayConfig[key],
        [field]: value,
      },
    };
    onUpdateOverlayConfig(updated);
  };

  const handlePositionPreset = (key: SelectedWidgetKey, preset: 'tl' | 'tr' | 'bl' | 'br' | 'tc' | 'bc' | 'center') => {
    let x = 50;
    let y = 50;
    if (preset === 'tl') { x = 6; y = 10; }
    if (preset === 'tr') { x = 74; y = 10; }
    if (preset === 'bl') { x = 6; y = 80; }
    if (preset === 'br') { x = 74; y = 80; }
    if (preset === 'tc') { x = 50; y = 10; }
    if (preset === 'bc') { x = 50; y = 85; }
    if (preset === 'center') { x = 50; y = 50; }

    const updated = {
      ...overlayConfig,
      [key]: {
        ...overlayConfig[key],
        x,
        y,
      },
    };
    onUpdateOverlayConfig(updated);
  };

  const handleSendTestChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testChatMessage.trim()) return;
    const newMsg: SimulatedChatMessage = {
      id: Date.now().toString(),
      user: 'You (Host)',
      message: testChatMessage.trim(),
      badge: 'MOD',
      time: 'Now',
    };
    setChatMessages((prev) => [...prev.slice(-6), newMsg]);
    setTestChatMessage('');
  };

  const handleCopyBrowserSourceUrl = () => {
    const fakeUrl = `https://syntxrr.stream/overlay/${activeScene.id}?token=preview-1080p`;
    navigator.clipboard?.writeText(fakeUrl).catch(() => {});
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Title & Scene Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-400" />
            Overlay Studio
          </h1>
          <p className="text-xs text-slate-400">
            Interactive 1080p preview canvas and modular broadcast overlay widgets
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyBrowserSourceUrl}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#0e1626] border border-blue-900/60 hover:border-blue-500 text-xs font-semibold text-blue-300 flex items-center gap-1.5 transition-colors"
          >
            {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copiedUrl ? 'Copied Source URL' : 'Copy Browser Source'}
          </button>
        </div>
      </div>

      {/* 16:9 Canvas Stream Preview Window */}
      <div className="rounded-2xl bg-[#0a0f1d] border border-slate-800 p-3 sm:p-4 shadow-2xl space-y-2">
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-bold text-white tracking-wide">
              1080p Stream Canvas Preview ({activeScene.name})
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            1920 × 1080 (16:9 scaled)
          </span>
        </div>

        {/* The 16:9 interactive canvas */}
        <div
          className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950 flex flex-col justify-between p-3 select-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 50%, #0d1527 0%, #050811 100%)',
          }}
        >
          {/* Subtle grid lines for studio feel */}
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage:
                'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {/* Canvas Center Safe Zone Guide Markers */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-b border-white/5 pointer-events-none" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-r border-white/5 pointer-events-none" />

          {/* WIDGET 1: Now Playing */}
          {overlayConfig.nowPlaying.enabled && (
            <div
              onClick={() => setSelectedWidget('nowPlaying')}
              className={`absolute transition-all cursor-pointer rounded-lg border backdrop-blur-md p-2 max-w-[210px] sm:max-w-[260px] ${
                selectedWidget === 'nowPlaying'
                  ? 'border-blue-400 bg-blue-950/80 ring-2 ring-blue-500/50 shadow-lg'
                  : 'border-slate-800 bg-black/60 hover:border-slate-600'
              }`}
              style={{
                left: `${overlayConfig.nowPlaying.x}%`,
                top: `${overlayConfig.nowPlaying.y}%`,
                opacity: overlayConfig.nowPlaying.opacity / 100,
                transform: 'translate(-10%, -10%)',
              }}
            >
              <div className="flex items-center gap-2">
                {overlayConfig.nowPlaying.showAlbumArt && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-blue-600/30 border border-blue-500/40 flex items-center justify-center shrink-0">
                    <Disc3 className="w-4 h-4 text-blue-400 animate-spin" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[9px] font-bold text-blue-400 tracking-wider uppercase">
                    Now Playing
                  </div>
                  <div className="text-[10px] sm:text-xs font-bold text-white truncate">
                    {nowPlayingSong ? nowPlayingSong.title : 'Neon Horizon'}
                  </div>
                  <div className="text-[9px] text-slate-300 truncate">
                    {nowPlayingSong ? nowPlayingSong.artist : 'Syntxrr Sound Lab'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WIDGET 2: Music Request Ticker */}
          {overlayConfig.musicRequest.enabled && (
            <div
              onClick={() => setSelectedWidget('musicRequest')}
              className={`absolute transition-all cursor-pointer rounded-lg border backdrop-blur-md p-2 max-w-[200px] sm:max-w-[240px] ${
                selectedWidget === 'musicRequest'
                  ? 'border-blue-400 bg-blue-950/80 ring-2 ring-blue-500/50'
                  : 'border-slate-800 bg-black/60 hover:border-slate-600'
              }`}
              style={{
                left: `${overlayConfig.musicRequest.x}%`,
                top: `${overlayConfig.musicRequest.y}%`,
                opacity: overlayConfig.musicRequest.opacity / 100,
                transform: 'translate(-10%, -10%)',
              }}
            >
              <div className="text-[9px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                <Music2 className="w-2.5 h-2.5" /> Next Request:
              </div>
              <div className="text-[10px] text-white font-semibold truncate mt-0.5">
                {queuedSongs.length > 0 ? queuedSongs[0].title : 'Midnight Overdrive'}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                by {queuedSongs.length > 0 ? queuedSongs[0].requesterName : '@PixelBlade'}
              </div>
            </div>
          )}

          {/* WIDGET 3: Event Alert Badge */}
          {overlayConfig.eventAlert.enabled && (
            <div
              onClick={() => setSelectedWidget('eventAlert')}
              className={`absolute transition-all cursor-pointer rounded-lg border backdrop-blur-md px-3 py-1.5 flex items-center gap-2 ${
                selectedWidget === 'eventAlert'
                  ? 'border-amber-400 bg-amber-950/80 ring-2 ring-amber-500/50 shadow-lg'
                  : 'border-amber-500/50 bg-amber-950/40 hover:border-amber-400'
              }`}
              style={{
                left: `${overlayConfig.eventAlert.x}%`,
                top: `${overlayConfig.eventAlert.y}%`,
                opacity: overlayConfig.eventAlert.opacity / 100,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <div className="text-[10px] font-bold text-amber-300 whitespace-nowrap">
                New Follower: <span className="text-white">GhostRider_X</span>
              </div>
            </div>
          )}

          {/* WIDGET 4: Live Chat Box */}
          {overlayConfig.liveChat.enabled && (
            <div
              onClick={() => setSelectedWidget('liveChat')}
              className={`absolute transition-all cursor-pointer rounded-lg border backdrop-blur-md p-2 w-[180px] sm:w-[220px] space-y-1 ${
                selectedWidget === 'liveChat'
                  ? 'border-blue-400 bg-blue-950/80 ring-2 ring-blue-500/50 shadow-lg'
                  : 'border-slate-800 bg-black/60 hover:border-slate-600'
              }`}
              style={{
                left: `${overlayConfig.liveChat.x}%`,
                top: `${overlayConfig.liveChat.y}%`,
                opacity: overlayConfig.liveChat.opacity / 100,
                transform: 'translate(-10%, -10%)',
              }}
            >
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between pb-1 border-b border-white/10">
                <span>Stream Chat</span>
                <span className="text-blue-400 font-mono">Live</span>
              </div>
              <div className="space-y-1">
                {chatMessages.slice(-overlayConfig.liveChat.maxMessages).map((msg) => (
                  <div
                    key={msg.id}
                    className="leading-tight"
                    style={{ fontSize: `${overlayConfig.liveChat.fontSize}px` }}
                  >
                    {overlayConfig.liveChat.showBadges && msg.badge && (
                      <span className="text-[8px] bg-blue-600 text-white font-bold px-1 rounded mr-1">
                        {msg.badge}
                      </span>
                    )}
                    <span className="font-bold text-blue-300 mr-1">{msg.user}:</span>
                    <span className="text-white">{msg.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WIDGET 5: Custom Text & Goal */}
          {overlayConfig.customText.enabled && (
            <div
              onClick={() => setSelectedWidget('customText')}
              className={`absolute transition-all cursor-pointer rounded-lg border backdrop-blur-md px-3 py-1 text-center ${
                selectedWidget === 'customText'
                  ? 'border-sky-400 bg-sky-950/80 ring-2 ring-sky-500/50 shadow-lg'
                  : 'border-slate-800 bg-black/60 hover:border-slate-600'
              }`}
              style={{
                left: `${overlayConfig.customText.x}%`,
                top: `${overlayConfig.customText.y}%`,
                opacity: overlayConfig.customText.opacity / 100,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider"
                style={{ color: overlayConfig.customText.color }}
              >
                {overlayConfig.customText.text}
              </div>
              {overlayConfig.customText.showGoal && (
                <div className="text-[9px] font-mono text-slate-300">
                  [{overlayConfig.customText.goalCurrent} / {overlayConfig.customText.goalTarget}]
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Widget Layer Selector Bar */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          Overlay Widget Layers
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(
            [
              { key: 'nowPlaying', label: 'Now Playing', icon: Disc3 },
              { key: 'musicRequest', label: 'Music Request', icon: Music2 },
              { key: 'liveChat', label: 'Live Chat', icon: MessageSquare },
              { key: 'eventAlert', label: 'Event Alert', icon: Bell },
              { key: 'customText', label: 'Custom Goal', icon: Type },
            ] as const
          ).map((item) => {
            const isEnabled = overlayConfig[item.key].enabled;
            const isSelected = selectedWidget === item.key;
            const Icon = item.icon;

            return (
              <div
                key={item.key}
                onClick={() => setSelectedWidget(item.key)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-blue-950/50 border-blue-500 shadow-md ring-1 ring-blue-500'
                    : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon
                    className={`w-4 h-4 ${
                      isSelected ? 'text-blue-400' : 'text-slate-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleWidget(item.key);
                    }}
                    className={`min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center transition-colors ${
                      isEnabled
                        ? 'text-emerald-400 hover:bg-emerald-950/40'
                        : 'text-slate-500 hover:bg-slate-800'
                    }`}
                    title={isEnabled ? 'Disable layer' : 'Enable layer'}
                  >
                    {isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="mt-2">
                  <div className="text-xs font-bold text-white truncate">
                    {item.label}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {isEnabled ? 'Visible on stream' : 'Hidden'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Widget Configuration Inspector Panel */}
      <div className="p-5 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white capitalize">
              Configuring: {selectedWidget.replace(/([A-Z])/g, ' $1')}
            </h3>
          </div>
          <button
            onClick={() => handleToggleWidget(selectedWidget)}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              overlayConfig[selectedWidget].enabled
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {overlayConfig[selectedWidget].enabled ? (
              <>
                <Eye className="w-3.5 h-3.5" /> Layer Enabled
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" /> Layer Disabled
              </>
            )}
          </button>
        </div>

        {/* Position Presets */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            Quick Alignment Presets:
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'tl')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Top-Left
            </button>
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'tc')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Top-Center
            </button>
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'tr')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Top-Right
            </button>
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'bl')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Bottom-Left
            </button>
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'bc')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Bottom-Center
            </button>
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'br')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Bottom-Right
            </button>
            <button
              onClick={() => handlePositionPreset(selectedWidget, 'center')}
              className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 hover:border-blue-500 text-slate-200"
            >
              Dead Center
            </button>
          </div>
        </div>

        {/* Sliders Grid: X, Y, Opacity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Position X:</span>
              <span className="font-mono text-blue-400">
                {overlayConfig[selectedWidget].x}%
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="92"
              value={overlayConfig[selectedWidget].x}
              onChange={(e) =>
                handleUpdateWidgetField(selectedWidget, 'x', parseInt(e.target.value, 10))
              }
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Position Y:</span>
              <span className="font-mono text-blue-400">
                {overlayConfig[selectedWidget].y}%
              </span>
            </div>
            <input
              type="range"
              min="2"
              max="92"
              value={overlayConfig[selectedWidget].y}
              onChange={(e) =>
                handleUpdateWidgetField(selectedWidget, 'y', parseInt(e.target.value, 10))
              }
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Opacity:</span>
              <span className="font-mono text-blue-400">
                {overlayConfig[selectedWidget].opacity}%
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              value={overlayConfig[selectedWidget].opacity}
              onChange={(e) =>
                handleUpdateWidgetField(selectedWidget, 'opacity', parseInt(e.target.value, 10))
              }
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Specific Widget Customizers */}
        {selectedWidget === 'customText' && (
          <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Custom Overlay Banner Text
                </label>
                <input
                  type="text"
                  value={overlayConfig.customText.text}
                  onChange={(e) => handleUpdateWidgetField('customText', 'text', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Accent Color
                </label>
                <input
                  type="color"
                  value={overlayConfig.customText.color}
                  onChange={(e) => handleUpdateWidgetField('customText', 'color', e.target.value)}
                  className="w-full h-9 rounded-xl bg-[#080c16] border border-slate-700 cursor-pointer p-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overlayConfig.customText.showGoal}
                  onChange={(e) => handleUpdateWidgetField('customText', 'showGoal', e.target.checked)}
                  className="rounded accent-blue-500"
                />
                <span className="text-slate-300">Show numeric goal counter</span>
              </label>
            </div>
          </div>
        )}

        {selectedWidget === 'liveChat' && (
          <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Max Visible Messages ({overlayConfig.liveChat.maxMessages})
                </label>
                <input
                  type="range"
                  min="3"
                  max="10"
                  value={overlayConfig.liveChat.maxMessages}
                  onChange={(e) =>
                    handleUpdateWidgetField('liveChat', 'maxMessages', parseInt(e.target.value, 10))
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Font Size ({overlayConfig.liveChat.fontSize}px)
                </label>
                <input
                  type="range"
                  min="11"
                  max="18"
                  value={overlayConfig.liveChat.fontSize}
                  onChange={(e) =>
                    handleUpdateWidgetField('liveChat', 'fontSize', parseInt(e.target.value, 10))
                  }
                  className="w-full accent-blue-500"
                />
              </div>
            </div>

            {/* Test Chat Message Sender */}
            <form onSubmit={handleSendTestChat} className="flex gap-2 pt-2">
              <input
                type="text"
                placeholder="Type a test chat message to preview live..."
                value={testChatMessage}
                onChange={(e) => setTestChatMessage(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-[#080c16] border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" /> Post
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
