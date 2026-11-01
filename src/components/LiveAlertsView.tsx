import React, { useState } from 'react';
import { AlertSettings, AlertEvent, AlertType } from '../types';
import {
  Bell,
  UserCheck,
  Gift,
  Heart,
  MessageSquare,
  Play,
  Volume2,
  VolumeX,
  Clock,
  Sparkles,
  Info,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface LiveAlertsViewProps {
  alertSettings: AlertSettings;
  alertHistory: AlertEvent[];
  onFireTestAlert: (type: AlertType) => void;
  onUpdateAlertSettings: (settings: AlertSettings) => void;
  onClearHistory: () => void;
}

export const LiveAlertsView: React.FC<LiveAlertsViewProps> = ({
  alertSettings,
  alertHistory,
  onFireTestAlert,
  onUpdateAlertSettings,
  onClearHistory,
}) => {
  const [activeCategory, setActiveCategory] = useState<AlertType>('follower');

  const defaultCategoryConfig = {
    enabled: true,
    messageTemplate: '{username} baru saja berinteraksi!',
    durationSec: 5,
    soundEnabled: true,
    accentColor: '#38bdf8',
  };

  const updateCategoryConfig = (type: AlertType, field: string, value: any) => {
    const existing = alertSettings[type] || defaultCategoryConfig;
    const updated: AlertSettings = {
      ...alertSettings,
      [type]: {
        ...existing,
        [field]: value,
      },
    };
    onUpdateAlertSettings(updated);
  };

  const categories = [
    {
      id: 'follower' as AlertType,
      label: 'New Follower',
      icon: UserCheck,
      color: '#38bdf8',
      desc: 'Fires when a new viewer follows your channel',
    },
    {
      id: 'gift' as AlertType,
      label: 'Gift',
      icon: Gift,
      color: '#fbbf24',
      desc: 'Fires when coins, roses, superchats or stream gifts are sent',
    },
    {
      id: 'like' as AlertType,
      label: 'Like Combo',
      icon: Heart,
      color: '#f43f5e',
      desc: 'Fires when viewers tap like cascades on TikTok LIVE or YouTube',
    },
    {
      id: 'chat_event' as AlertType,
      label: 'Chat Event',
      icon: MessageSquare,
      color: '#a855f7',
      desc: 'Fires for first-time chats, subscriber tiers, or channel raids',
    },
  ];

  const currentConfig = alertSettings[activeCategory] || defaultCategoryConfig;
  const activeCatMeta = categories.find((c) => c.id === activeCategory) || categories[0];
  const ActiveIcon = activeCatMeta.icon;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-400" />
            Live Alerts
          </h1>
          <p className="text-xs text-slate-400">
            Real-time broadcast event notifications, alert testing engine, and overlay banner styling
          </p>
        </div>

        {/* Not connected badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-900/60 flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Platform Integration: Disconnected</span>
          </div>
        </div>
      </div>

      {/* Realistic Integration Disclaimer */}
      <div className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-1.5">
        <div className="flex items-center gap-2 text-blue-400 font-semibold">
          <Info className="w-4 h-4" />
          <span>Platform Event Bridge Notice</span>
        </div>
        <p className="leading-relaxed">
          TikTok LIVE, Twitch PubSub, and YouTube Live Chat APIs require authenticated backend event webhooks or Android companion services. In this Stage 1 foundation, you can test and preview all overlay alert styles, sound cues, and animation timings locally using the <strong>Alert Simulator</strong> below.
        </p>
      </div>

      {/* Category Tabs & Quick Test Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = activeCategory === cat.id;

          return (
            <div
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-blue-950/50 border-blue-500 ring-1 ring-blue-500 shadow-lg'
                  : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      alertSettings[cat.id]?.enabled
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {alertSettings[cat.id]?.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="text-sm font-bold text-white">{cat.label}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                    {cat.desc}
                  </div>
                </div>
              </div>

              {/* Fire Test Trigger Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFireTestAlert(cat.id);
                }}
                className="mt-3 w-full py-2 px-2.5 rounded-xl bg-[#080c16] hover:bg-blue-600 hover:text-white border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                title={`Test fire ${cat.label} on screen`}
              >
                <Play className="w-3.5 h-3.5" /> Test Alert
              </button>
            </div>
          );
        })}
      </div>

      {/* Selected Alert Category Configuration Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: `${activeCatMeta.color}20`,
                color: activeCatMeta.color,
              }}
            >
              <ActiveIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Configure {activeCatMeta.label}
              </h2>
              <p className="text-xs text-slate-400">{activeCatMeta.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onFireTestAlert(activeCategory)}
              className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-blue-900/30"
            >
              <Play className="w-4 h-4 ml-0.5" /> Fire Test Now
            </button>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#080c16] border border-slate-800">
            <div>
              <span className="font-semibold text-white block">
                Enable this Alert Category
              </span>
              <span className="text-[11px] text-slate-400">
                Display pop-up banners on the stream overlay when triggered
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={currentConfig.enabled}
                onChange={(e) =>
                  updateCategoryConfig(activeCategory, 'enabled', e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>

          {/* Message Template */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Message Template (Variables: {'{username}'}, {'{detail}'})
            </label>
            <input
              type="text"
              value={currentConfig.messageTemplate}
              onChange={(e) =>
                updateCategoryConfig(activeCategory, 'messageTemplate', e.target.value)
              }
              className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Sliders: Duration & Sound Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Display Duration:</span>
                <span className="font-mono text-blue-400">
                  {currentConfig.durationSec}s
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="15"
                value={currentConfig.durationSec}
                onChange={(e) =>
                  updateCategoryConfig(
                    activeCategory,
                    'durationSec',
                    parseInt(e.target.value, 10)
                  )
                }
                className="w-full accent-blue-500"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#080c16] border border-slate-800">
              <div className="flex items-center gap-2">
                {currentConfig.soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
                <span className="font-semibold text-white">Audio Chime Cue</span>
              </div>
              <input
                type="checkbox"
                checked={currentConfig.soundEnabled}
                onChange={(e) =>
                  updateCategoryConfig(activeCategory, 'soundEnabled', e.target.checked)
                }
                className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Simulated Alert Feed History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              Simulated Event Feed
            </h2>
            <p className="text-xs text-slate-400">
              Recent alert events tested or recorded locally
            </p>
          </div>
          {alertHistory.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors min-h-[36px]"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Feed
            </button>
          )}
        </div>

        {alertHistory.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#0e1626] border border-slate-800 text-center text-xs text-slate-400">
            No alert events yet. Tap &quot;Test Alert&quot; on any category above to simulate live triggers.
          </div>
        ) : (
          <div className="space-y-2">
            {alertHistory.slice(0, 10).map((event) => {
              const meta = categories.find((c) => c.id === event.type);
              const Icon = meta ? meta.icon : Bell;

              return (
                <div
                  key={event.id}
                  className="p-3 rounded-xl bg-[#0e1626] border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: meta ? `${meta.color}20` : '#38bdf820',
                        color: meta ? meta.color : '#38bdf8',
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        {event.username}
                      </div>
                      <div className="text-[11px] text-slate-300 truncate">
                        {event.detail}
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
