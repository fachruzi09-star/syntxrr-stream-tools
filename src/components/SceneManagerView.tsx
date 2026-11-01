import React, { useState } from 'react';
import { Scene, OverlayWidgetConfig } from '../types';
import { DEFAULT_OVERLAY_CONFIG } from '../services/storage';
import {
  Layers,
  Plus,
  Copy,
  Trash2,
  Edit2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Monitor,
} from 'lucide-react';

interface SceneManagerViewProps {
  scenes: Scene[];
  activeSceneId: string;
  onSelectScene: (id: string) => void;
  onCreateScene: (name: string, description: string, baseConfig?: OverlayWidgetConfig) => void;
  onRenameScene: (id: string, newName: string, newDescription: string) => void;
  onDuplicateScene: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onNavigateToOverlay: () => void;
}

export const SceneManagerView: React.FC<SceneManagerViewProps> = ({
  scenes,
  activeSceneId,
  onSelectScene,
  onCreateScene,
  onRenameScene,
  onDuplicateScene,
  onDeleteScene,
  onNavigateToOverlay,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneDesc, setNewSceneDesc] = useState('');
  const [sceneTemplate, setSceneTemplate] = useState<'blank' | 'gaming' | 'chatting' | 'intermission'>('gaming');

  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSceneName.trim()) return;

    let baseConfig = { ...DEFAULT_OVERLAY_CONFIG };
    if (sceneTemplate === 'chatting') {
      baseConfig = {
        ...baseConfig,
        liveChat: { ...baseConfig.liveChat, x: 65, y: 30, maxMessages: 8 },
        nowPlaying: { ...baseConfig.nowPlaying, x: 6, y: 75 },
      };
    } else if (sceneTemplate === 'intermission') {
      baseConfig = {
        ...baseConfig,
        customText: { ...baseConfig.customText, text: 'STREAM PAUSED · BE RIGHT BACK', x: 50, y: 50 },
        liveChat: { ...baseConfig.liveChat, x: 50, y: 70 },
      };
    }

    onCreateScene(newSceneName.trim(), newSceneDesc.trim() || 'Custom stream layout', baseConfig);
    setNewSceneName('');
    setNewSceneDesc('');
    setShowCreateModal(false);
  };

  const handleStartEdit = (scene: Scene) => {
    setEditingScene(scene);
    setEditName(scene.name);
    setEditDesc(scene.description);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScene || !editName.trim()) return;
    onRenameScene(editingScene.id, editName.trim(), editDesc.trim());
    setEditingScene(null);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-400" />
            Scene Manager
          </h1>
          <p className="text-xs text-slate-400">
            Create, duplicate, and assign persistent overlay configurations per stream scene
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="min-h-[44px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-blue-900/30 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> New Scene
        </button>
      </div>

      {/* Active Scene Spotlight */}
      <div className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
              Currently Active Scene
            </div>
            <div className="text-sm font-bold text-white">
              {scenes.find((s) => s.id === activeSceneId)?.name || 'Default Scene'}
            </div>
          </div>
        </div>

        <button
          onClick={onNavigateToOverlay}
          className="min-h-[40px] px-3.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800 text-xs font-semibold text-blue-300 flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          Open in Overlay Studio <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scene Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId;
          const { overlayConfig } = scene;
          const enabledCount = Object.values(overlayConfig).filter((w) => w.enabled).length;

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                isActive
                  ? 'bg-[#101b33] border-blue-500/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500'
                  : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-[#080c16] border border-slate-800 text-blue-400 flex items-center justify-center text-xs font-bold font-mono">
                      {scene.name.slice(0, 2).toUpperCase()}
                    </span>
                    <h3 className="text-sm font-bold text-white truncate">
                      {scene.name}
                    </h3>
                  </div>

                  {isActive ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2.5 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectScene(scene.id);
                      }}
                      className="text-[11px] font-semibold text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 shrink-0"
                    >
                      Make Active
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">
                  {scene.description}
                </p>

                {/* Layer Summary Chips */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-slate-400 font-medium">Layers:</span>
                  {overlayConfig.nowPlaying.enabled && (
                    <span className="px-1.5 py-0.5 rounded bg-[#080c16] text-blue-300 border border-slate-800">
                      Now Playing
                    </span>
                  )}
                  {overlayConfig.liveChat.enabled && (
                    <span className="px-1.5 py-0.5 rounded bg-[#080c16] text-sky-300 border border-slate-800">
                      Live Chat
                    </span>
                  )}
                  {overlayConfig.eventAlert.enabled && (
                    <span className="px-1.5 py-0.5 rounded bg-[#080c16] text-amber-300 border border-slate-800">
                      Alerts
                    </span>
                  )}
                  {overlayConfig.musicRequest.enabled && (
                    <span className="px-1.5 py-0.5 rounded bg-[#080c16] text-cyan-300 border border-slate-800">
                      Requests
                    </span>
                  )}
                  {overlayConfig.customText.enabled && (
                    <span className="px-1.5 py-0.5 rounded bg-[#080c16] text-purple-300 border border-slate-800">
                      Goal/Text
                    </span>
                  )}
                  <span className="text-slate-500 ml-auto font-mono">
                    {enabledCount}/5 active
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(scene);
                    }}
                    className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
                    title="Rename Scene"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateScene(scene.id);
                    }}
                    className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
                    title="Duplicate Scene"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {scenes.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteScene(scene.id);
                      }}
                      className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 flex items-center justify-center transition-colors"
                      title="Delete Scene"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectScene(scene.id);
                    onNavigateToOverlay();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#131f36] hover:bg-blue-600 hover:text-white border border-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  Edit Overlays
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Scene Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-scene-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-[#0e1626] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
            <h2 id="create-scene-title" className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              Create New Stream Scene
            </h2>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Scene Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Boss Fight View or Ending Credits"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Minimalist layout for competitive matches"
                  value={newSceneDesc}
                  onChange={(e) => setNewSceneDesc(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Starting Preset Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSceneTemplate('gaming')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      sceneTemplate === 'gaming'
                        ? 'border-blue-500 bg-blue-950/60 text-white'
                        : 'border-slate-800 bg-[#080c16] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">🎮 Gaming HUD</div>
                    <div className="text-[10px]">Compact corner layout</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSceneTemplate('chatting')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      sceneTemplate === 'chatting'
                        ? 'border-blue-500 bg-blue-950/60 text-white'
                        : 'border-slate-800 bg-[#080c16] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">💬 Just Chatting</div>
                    <div className="text-[10px]">Prominent chat window</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSceneTemplate('intermission')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      sceneTemplate === 'intermission'
                        ? 'border-blue-500 bg-blue-950/60 text-white'
                        : 'border-slate-800 bg-[#080c16] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">☕ Intermission</div>
                    <div className="text-[10px]">BRB text + goal banner</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSceneTemplate('blank')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      sceneTemplate === 'blank'
                        ? 'border-blue-500 bg-blue-950/60 text-white'
                        : 'border-slate-800 bg-[#080c16] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">✨ Standard Pack</div>
                    <div className="text-[10px]">All widgets centered</div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Create Scene
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Scene Modal */}
      {editingScene && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-scene-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-[#0e1626] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
            <h2 id="edit-scene-title" className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-400" />
              Edit Scene Details
            </h2>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Scene Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingScene(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
