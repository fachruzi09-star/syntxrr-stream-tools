import React, { useState } from 'react';
import {
  StudioPreset,
  PresetCategory,
  CanvasOrientation,
  StudioElement,
} from '../types';
import {
  Layout,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Star,
  Check,
  Smartphone,
  Monitor,
  Square,
  Sparkles,
  Layers,
  ArrowRight,
  Sliders,
  X,
} from 'lucide-react';

interface PresetManagerViewProps {
  presets: StudioPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onCreatePreset: (preset: Omit<StudioPreset, 'id' | 'createdAt'>) => void;
  onDuplicatePreset: (presetId: string) => void;
  onDeletePreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, newName: string) => void;
  onToggleFavorite: (presetId: string) => void;
  onNavigateToStudio: () => void;
}

export const PresetManagerView: React.FC<PresetManagerViewProps> = ({
  presets,
  activePresetId,
  onSelectPreset,
  onCreatePreset,
  onDuplicatePreset,
  onDeletePreset,
  onRenamePreset,
  onToggleFavorite,
  onNavigateToStudio,
}) => {
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Form state for creating new preset
  const [newPresetName, setNewPresetName] = useState('');
  const [newCategory, setNewCategory] = useState<PresetCategory>('hp_screen');
  const [newOrientation, setNewOrientation] = useState<CanvasOrientation>('9:16');
  const [newDescription, setNewDescription] = useState('');
  const [starterTemplate, setStarterTemplate] = useState<'blank' | 'gaming' | 'chatting' | 'music'>('gaming');

  const filteredPresets = presets.filter((p) => {
    if (activeCategory === 'favorites') return p.isFavorite;
    if (activeCategory === 'all') return true;
    return p.category === activeCategory;
  });

  const activePreset = presets.find((p) => p.id === activePresetId) || presets[0];

  const handleStartRename = (preset: StudioPreset) => {
    setEditingPresetId(preset.id);
    setEditingName(preset.name);
  };

  const handleSaveRename = (presetId: string) => {
    if (editingName.trim()) {
      onRenamePreset(presetId, editingName.trim());
    }
    setEditingPresetId(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    let elements: StudioElement[] = [];

    if (starterTemplate === 'gaming') {
      elements = [
        {
          id: `elem_screen_${Date.now()}`,
          name: 'Layar Game (Screen Capture)',
          type: 'screen_capture',
          x: 0,
          y: 20,
          width: 100,
          height: 56,
          layer: 1,
          visible: true,
          locked: true,
          opacity: 100,
          rotation: 0,
          properties: { fps: 60 },
        },
        {
          id: `elem_cam_${Date.now()}`,
          name: 'Facecam Bulat',
          type: 'camera',
          x: 6,
          y: 4,
          width: 28,
          height: 15,
          layer: 2,
          visible: true,
          locked: false,
          opacity: 100,
          rotation: 0,
          properties: { borderRadius: 16, borderColor: '#2563EB' },
        },
        {
          id: `elem_chat_${Date.now()}`,
          name: 'Live Chat Penonton',
          type: 'chat_message',
          x: 6,
          y: 78,
          width: 88,
          height: 20,
          layer: 3,
          visible: true,
          locked: false,
          opacity: 90,
          rotation: 0,
          properties: { maxMessages: 4 },
        },
      ];
    } else if (starterTemplate === 'chatting') {
      elements = [
        {
          id: `elem_cam_${Date.now()}`,
          name: 'Kamera Utama Full Frame',
          type: 'camera',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          layer: 1,
          visible: true,
          locked: true,
          opacity: 100,
          rotation: 0,
          properties: { facingMode: 'user' },
        },
        {
          id: `elem_chat_${Date.now()}`,
          name: 'Kotak Chat Kaca',
          type: 'chat_message',
          x: 6,
          y: 60,
          width: 88,
          height: 30,
          layer: 2,
          visible: true,
          locked: false,
          opacity: 85,
          rotation: 0,
          properties: { maxMessages: 6 },
        },
        {
          id: `elem_alert_${Date.now()}`,
          name: 'Alert Gift & Follow',
          type: 'event_alert',
          x: 10,
          y: 10,
          width: 80,
          height: 12,
          layer: 3,
          visible: true,
          locked: false,
          opacity: 100,
          rotation: 0,
          properties: { soundEnabled: true },
        },
      ];
    } else if (starterTemplate === 'music') {
      elements = [
        {
          id: `elem_song_${Date.now()}`,
          name: 'Now Playing Widget',
          type: 'song_request',
          x: 6,
          y: 40,
          width: 88,
          height: 16,
          layer: 2,
          visible: true,
          locked: false,
          opacity: 100,
          rotation: 0,
          properties: { showAlbumArt: true },
        },
        {
          id: `elem_chat_${Date.now()}`,
          name: 'Request Queue Chat',
          type: 'chat_message',
          x: 6,
          y: 65,
          width: 88,
          height: 25,
          layer: 3,
          visible: true,
          locked: false,
          opacity: 90,
          rotation: 0,
          properties: { maxMessages: 5 },
        },
      ];
    }

    onCreatePreset({
      name: newPresetName.trim(),
      category: newCategory,
      canvasOrientation: newOrientation,
      elements,
      isFavorite: false,
      description: newDescription.trim() || 'Preset tata letak kustom SYNTXRR STREAM',
      thumbnailColor: '#1e3a8a',
    });

    setIsCreateModalOpen(false);
    setNewPresetName('');
    setNewDescription('');
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1e293b] text-blue-400 border border-blue-500/20">
                Studio Scene Presets
              </span>
              <span className="text-xs text-slate-400">
                {presets.length} Preset Tersimpan
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Manajer Preset & Adegan (Presets)
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Simpan dan beralih antara konfigurasi tata letak overlay tanpa perlu menata ulang dari awal. Mendukung orientasi 9:16 (Layar HP), 16:9 (Landscape), dan 1:1.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-600 active:scale-95 text-white font-bold text-sm flex items-center space-x-2 transition shadow-lg shadow-blue-600/25"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Preset Baru</span>
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-[#1e293b]">
          {(
            [
              { id: 'all', label: 'Semua Preset' },
              { id: 'hp_screen', label: 'Layar HP (9:16)' },
              { id: 'landscape', label: 'Landscape (16:9)' },
              { id: 'portrait', label: 'Portrait' },
              { id: 'favorites', label: '⭐ Favorit' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeCategory === cat.id
                  ? 'bg-[#2563EB] text-white shadow'
                  : 'bg-[#080c16] text-slate-400 hover:text-white border border-[#1e293b]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPresets.map((preset) => {
          const isActive = preset.id === activePresetId;

          return (
            <div
              key={preset.id}
              className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden ${
                isActive
                  ? 'bg-[#101b33] border-[#38BDF8] shadow-xl shadow-blue-950/50'
                  : 'bg-[#0e172a] border-[#1e293b] hover:border-slate-700'
              }`}
            >
              {/* Card Header & Preview */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#080c16] text-blue-400 border border-[#1e293b] flex items-center space-x-1">
                      {preset.canvasOrientation === '9:16' && <Smartphone className="w-3 h-3" />}
                      {preset.canvasOrientation === '16:9' && <Monitor className="w-3 h-3" />}
                      {preset.canvasOrientation === '1:1' && <Square className="w-3 h-3" />}
                      <span>{preset.canvasOrientation}</span>
                    </span>

                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Sedang Digunakan</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onToggleFavorite(preset.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-[#1e293b] transition"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        preset.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Preset Name or Edit Input */}
                {editingPresetId === preset.id ? (
                  <div className="flex items-center space-x-2 my-1">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 bg-[#080c16] border border-[#2563EB] rounded px-2 py-1 text-sm text-white focus:outline-none font-bold"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveRename(preset.id)}
                      className="px-2 py-1 bg-[#2563EB] text-white text-xs rounded hover:bg-blue-600 font-bold"
                    >
                      Simpan
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {preset.name}
                    </h3>
                    <button
                      onClick={() => handleStartRename(preset)}
                      className="text-slate-500 hover:text-slate-300 p-1"
                      title="Ubah Nama"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>

                {/* Elements count badge */}
                <div className="mt-4 flex items-center space-x-2 text-xs text-slate-400">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>{preset.elements.length} Elemen Overlay di Kanvas</span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="p-4 bg-[#080c16]/50 border-t border-[#1e293b] flex items-center justify-between gap-2">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onDuplicatePreset(preset.id)}
                    className="p-2 rounded-lg bg-[#1e293b] hover:bg-[#334155] text-slate-300 text-xs transition"
                    title="Duplikasi Preset"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {presets.length > 1 && (
                    <button
                      onClick={() => onDeletePreset(preset.id)}
                      className="p-2 rounded-lg bg-[#1e293b] hover:bg-red-500/20 text-slate-400 hover:text-red-400 text-xs transition"
                      title="Hapus Preset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isActive ? (
                  <button
                    onClick={onNavigateToStudio}
                    className="px-3.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-600 active:scale-95 text-white font-bold text-xs flex items-center space-x-1 transition shadow"
                  >
                    <span>Buka Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectPreset(preset.id)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#1e293b] hover:bg-[#2563EB] hover:text-white text-slate-300 font-semibold text-xs transition"
                  >
                    <span>Gunakan Preset</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Buat Preset Baru */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e172a] border border-[#1e293b] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
              <div className="flex items-center space-x-2">
                <Layout className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Buat Preset Studio Baru</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nama Preset
                </label>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Misal: Mobile Gaming Pro, TikTok Live Malam"
                  required
                  className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Orientasi Kanvas
                </label>
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
                        setNewOrientation(orient.id);
                        if (orient.id === '9:16') setNewCategory('hp_screen');
                        else if (orient.id === '16:9') setNewCategory('landscape');
                        else setNewCategory('portrait');
                      }}
                      className={`p-2.5 rounded-xl text-center text-xs font-semibold border transition ${
                        newOrientation === orient.id
                          ? 'bg-[#2563EB] border-[#38BDF8] text-white'
                          : 'bg-[#080c16] border-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                    >
                      {orient.icon}
                      <span>{orient.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Pilihan Template Permulaan
                </label>
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
                      onClick={() => setStarterTemplate(tmpl.id)}
                      className={`p-2.5 rounded-xl text-left border transition ${
                        starterTemplate === tmpl.id
                          ? 'bg-[#131f38] border-[#38BDF8] text-white'
                          : 'bg-[#080c16] border-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold text-white mb-0.5">{tmpl.label}</div>
                      <div className="text-[10px] text-slate-400">{tmpl.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Deskripsi (Opsional)
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Keterangan singkat tentang preset ini..."
                  rows={2}
                  className="w-full bg-[#080c16] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1e293b] text-slate-300 text-xs font-semibold hover:bg-[#334155]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold shadow-lg shadow-blue-600/30"
                >
                  Simpan & Buat Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
