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

  const getSourceBadge = (source: MusicSourceType, platform?: UnifiedQueueItem['platform']) => {
    switch (source) {
      case 'local':
        return {
          label: 'Local File',
          className: 'bg-[var(--app-ok-soft)] text-[var(--app-ok)] border border-emerald-500/30',
        };
      case 'youtube':
        return {
          label: platform === 'YouTube Music' ? 'YouTube Music' : 'YouTube',
          className: 'bg-[var(--app-error-soft)] text-[var(--app-error)] border border-rose-500/30',
        };
      case 'spotify':
        return {
          label: 'Spotify',
          className: 'bg-[var(--app-ok-soft)] text-[var(--app-ok)] border border-emerald-500/30',
        };
      case 'viewer_request':
      default:
        return {
          label: 'Viewer Request',
          className: 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] border border-[var(--app-accent-border)]',
        };
    }
  };

  const getStatusBadge = (status: QueueItemStatus) => {
    switch (status) {
      case 'playing':
        return 'text-[var(--app-ok)] font-bold';
      case 'approved':
        return 'text-[var(--app-accent-text)] font-semibold';
      case 'pending':
        return 'text-[var(--app-warn)] font-semibold';
      case 'rejected':
        return 'text-[var(--app-error)] line-through';
      case 'completed':
        return 'text-[var(--app-text-muted)]';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Bar */}
      <div className="p-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-display font-bold text-[var(--app-text)] flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-[var(--app-accent-text)]" />
            Unified Request Queue ({queue.length} items)
          </h3>
          <p className="text-xs text-[var(--app-text-secondary)]">
            Orchestrating local audio, YouTube, Spotify, and viewer submissions in one place
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Source Filter */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            aria-label="Filter by source"
            className="min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
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
            aria-label="Filter by status"
            className="min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="playing">Playing</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            type="button"
            onClick={handleClearCompleted}
            className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:border-[var(--app-border-strong)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] text-xs font-semibold transition-colors"
            title="Clean up completed and rejected items"
          >
            Clean Completed
          </button>
        </div>
      </div>

      {/* Queue List */}
      {filteredQueue.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] text-center space-y-2">
          <ListMusic className="w-8 h-8 text-[var(--app-text-muted)] mx-auto" />
          <div className="text-sm font-display font-bold text-[var(--app-text)]">
            No items in queue matching your filter
          </div>
          <p className="text-xs text-[var(--app-text-secondary)] max-w-sm mx-auto">
            Add local songs, search YouTube or Spotify catalogs, or submit requests via the Viewer Portal tab.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQueue.map((item, index) => {
            const badge = getSourceBadge(item.source, item.platform);
            const isPlaying = currentlyPlayingId === item.id || item.status === 'playing';

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isPlaying
                    ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] shadow-sm'
                    : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                }`}
              >
                {/* Left: Reorder Controls + Info */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  {/* Position number & up/down */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] disabled:opacity-25 flex items-center justify-center transition-colors"
                      title="Move up in queue"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <span className="font-mono-num text-xs font-bold text-[var(--app-text-secondary)] min-w-[26px] text-center">
                      #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === queue.length - 1}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] disabled:opacity-25 flex items-center justify-center transition-colors"
                      title="Move down in queue"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Thumbnail / Source Icon */}
                  <div className="relative w-11 h-11 rounded-lg bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-center shrink-0 overflow-hidden">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : item.source === 'local' ? (
                      <FileMusic className="w-5 h-5 text-[var(--app-ok)]" />
                    ) : (
                      <ListMusic className="w-5 h-5 text-[var(--app-accent-text)]" />
                    )}
                  </div>

                  {/* Title & Requester */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className={`text-[10px] capitalize ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-[var(--app-text)] truncate mt-1">
                      {item.title}
                    </div>

                    <div className="text-[11px] text-[var(--app-text-secondary)] truncate flex items-center gap-1.5 mt-0.5">
                      <span>{item.artist || 'Unknown Artist'}</span>
                      <span>·</span>
                      <span className="text-[var(--app-text)]">Req by {item.requesterName}</span>
                      {item.notes && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--app-accent-text)] italic truncate max-w-[150px]">
                            &quot;{item.notes}&quot;
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--app-border)] w-full sm:w-auto justify-end">
                  {/* Local audio playback action */}
                  {item.source === 'local' && onPlayLocalItem && (
                    <button
                      type="button"
                      onClick={() => onPlayLocalItem(item)}
                      className="min-h-[44px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                      title="Play in local audio engine"
                    >
                      <Play className="w-3.5 h-3.5" /> Play
                    </button>
                  )}

                  {/* External app link for YouTube / Spotify */}
                  {item.externalUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(item.externalUrl, '_blank', 'noopener,noreferrer')}
                      className="min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:border-[var(--app-border-strong)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Open in official app/browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </button>
                  )}

                  {/* Status Toggle Buttons */}
                  {item.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item.id, 'approved')}
                        className="min-h-[44px] px-3 rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] hover:bg-[var(--app-accent)] hover:text-[var(--app-accent-ink)] border border-[var(--app-accent-border)] text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title="Approve request"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item.id, 'rejected')}
                        className="min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-error-soft)] text-[var(--app-error)] hover:border-rose-500/50 border border-rose-500/30 text-xs flex items-center justify-center transition-colors"
                        title="Reject request"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {item.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(item.id, 'completed')}
                      className="min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)] hover:text-[var(--app-ok)] border border-[var(--app-border)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Mark as completed/played"
                    >
                      <CheckCircle className="w-4 h-4" /> Done
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="min-h-[44px] min-w-[44px] rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-error)] hover:bg-[var(--app-error-soft)] flex items-center justify-center transition-colors"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Broadcast Audio Separation Notice */}
      <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[var(--app-accent-text)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[var(--app-text)]">Audio Routing Integrity:</strong> YouTube Music, YouTube, and Spotify entries are stored as metadata cards for on-screen overlays and viewer management. Only authorized local audio files loaded into the Local Audio Engine are decoded inside the application.
        </p>
      </div>
    </div>
  );
};
