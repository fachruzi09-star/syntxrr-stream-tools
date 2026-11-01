import React, { useState } from 'react';
import { UnifiedQueueItem, QueueItemStatus, MusicSourceType } from '../../types';
import {
  ListMusic,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  ExternalLink,
  Play,
  FileMusic,
  User,
  Filter,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface UnifiedQueueManagerProps {
  queue: UnifiedQueueItem[];
  onUpdateQueue: (queue: UnifiedQueueItem[]) => void;
  onPlayLocalItem?: (item: UnifiedQueueItem) => void;
  currentlyPlayingId?: string | null;
}

export const UnifiedQueueManager: React.FC<UnifiedQueueManagerProps> = ({
  queue,
  onUpdateQueue,
  onPlayLocalItem,
  currentlyPlayingId,
}) => {
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...queue];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    onUpdateQueue(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const updated = [...queue];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    onUpdateQueue(updated);
  };

  const handleUpdateStatus = (id: string, newStatus: QueueItemStatus) => {
    const updated = queue.map((item) => {
      if (item.id === id) {
        return { ...item, status: newStatus };
      }
      return item;
    });
    onUpdateQueue(updated);
  };

  const handleRemove = (id: string) => {
    const updated = queue.filter((item) => item.id !== id);
    onUpdateQueue(updated);
  };

  const handleClearCompleted = () => {
    const updated = queue.filter((item) => item.status !== 'completed' && item.status !== 'rejected');
    onUpdateQueue(updated);
  };

  // Filter items
  const filteredQueue = queue.filter((item) => {
    if (filterSource !== 'all' && item.source !== filterSource) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    return true;
  });

  const getSourceBadge = (source: MusicSourceType) => {
    switch (source) {
      case 'local':
        return {
          label: 'Local File',
          className: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800',
        };
      case 'youtube':
        return {
          label: 'YouTube',
          className: 'bg-red-950/80 text-red-400 border border-red-800',
        };
      case 'spotify':
        return {
          label: 'Spotify',
          className: 'bg-emerald-950/80 text-emerald-400 border border-emerald-700',
        };
      case 'viewer_request':
      default:
        return {
          label: 'Viewer Request',
          className: 'bg-blue-950/80 text-blue-400 border border-blue-800',
        };
    }
  };

  const getStatusBadge = (status: QueueItemStatus) => {
    switch (status) {
      case 'playing':
        return 'text-emerald-400 font-bold';
      case 'approved':
        return 'text-blue-400 font-semibold';
      case 'pending':
        return 'text-amber-400 font-semibold';
      case 'rejected':
        return 'text-rose-400 line-through';
      case 'completed':
        return 'text-slate-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#0e1626] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-blue-400" />
            Unified Request Queue ({queue.length} items)
          </h3>
          <p className="text-xs text-slate-400">
            Orchestrating local audio, YouTube, Spotify, and viewer submissions in one place
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Source Filter */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 text-xs text-slate-300 focus:outline-none"
          >
            <option value="all">All Sources</option>
            <option value="local">Local Audio</option>
            <option value="youtube">YouTube</option>
            <option value="spotify">Spotify</option>
            <option value="viewer_request">Viewer Requests</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[#080c16] border border-slate-700 text-xs text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="playing">Playing</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            onClick={handleClearCompleted}
            className="min-h-[34px] px-2.5 rounded-lg bg-[#080c16] hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
            title="Clean up completed and rejected items"
          >
            Clean Completed
          </button>
        </div>
      </div>

      {/* Queue List */}
      {filteredQueue.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#0e1626] border border-slate-800 text-center space-y-2">
          <ListMusic className="w-8 h-8 text-slate-600 mx-auto" />
          <div className="text-sm font-semibold text-slate-300">
            No items in queue matching your filter
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Add local songs, search YouTube or Spotify catalogs, or submit requests via the Viewer Portal tab.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQueue.map((item, index) => {
            const badge = getSourceBadge(item.source);
            const isPlaying = currentlyPlayingId === item.id || item.status === 'playing';

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isPlaying
                    ? 'bg-blue-950/40 border-blue-500/80 shadow-md ring-1 ring-blue-500/40'
                    : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Left: Reorder Controls + Info */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  {/* Position number & up/down */}
                  <div className="flex flex-col items-center justify-center shrink-0">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-20 transition-colors"
                      title="Move up in queue"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-xs font-bold text-slate-400">
                      #{index + 1}
                    </span>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === queue.length - 1}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-20 transition-colors"
                      title="Move down in queue"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Thumbnail / Source Icon */}
                  <div className="relative w-11 h-11 rounded-lg bg-black/60 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : item.source === 'local' ? (
                      <FileMusic className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ListMusic className="w-5 h-5 text-blue-400" />
                    )}
                  </div>

                  {/* Title & Requester */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className={`text-[10px] capitalize ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-white truncate mt-1">
                      {item.title}
                    </div>

                    <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                      <span>{item.artist || 'Unknown Artist'}</span>
                      <span>·</span>
                      <span className="text-slate-300">
                        Req by {item.requesterName}
                      </span>
                      {item.notes && (
                        <>
                          <span>·</span>
                          <span className="text-blue-300 italic truncate max-w-[150px]">
                            &quot;{item.notes}&quot;
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80 w-full sm:w-auto justify-end">
                  {/* Local audio playback action */}
                  {item.source === 'local' && onPlayLocalItem && (
                    <button
                      onClick={() => onPlayLocalItem(item)}
                      className="min-h-[34px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Play in local audio engine"
                    >
                      <Play className="w-3.5 h-3.5" /> Play
                    </button>
                  )}

                  {/* External app link for YouTube / Spotify */}
                  {item.externalUrl && (
                    <button
                      onClick={() => window.open(item.externalUrl, '_blank', 'noopener,noreferrer')}
                      className="min-h-[34px] px-2 rounded-lg bg-[#080c16] hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center gap-1 transition-colors"
                      title="Open in official app/browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </button>
                  )}

                  {/* Status Toggle Buttons */}
                  {item.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'approved')}
                        className="min-h-[34px] px-2 rounded-lg bg-blue-950/80 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Approve request"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'rejected')}
                        className="min-h-[34px] px-2 rounded-lg bg-rose-950/50 text-rose-400 hover:bg-rose-900/60 border border-rose-900/60 text-xs flex items-center gap-1 transition-colors"
                        title="Reject request"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {item.status === 'approved' && (
                    <button
                      onClick={() => handleUpdateStatus(item.id, 'completed')}
                      className="min-h-[34px] px-2 rounded-lg bg-[#080c16] text-slate-400 hover:text-emerald-400 border border-slate-800 text-xs flex items-center gap-1 transition-colors"
                      title="Mark as completed/played"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Done
                    </button>
                  )}

                  <button
                    onClick={() => handleRemove(item.id)}
                    className="min-h-[34px] min-w-[34px] rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 flex items-center justify-center transition-colors"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Broadcast Audio Separation Notice */}
      <div className="p-3.5 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Audio Routing Integrity:</strong> YouTube and Spotify entries are stored as metadata cards for on-screen overlays and viewer management. Only authorized local audio files loaded into the Local Audio Engine are decoded inside the application.
        </p>
      </div>
    </div>
  );
};
