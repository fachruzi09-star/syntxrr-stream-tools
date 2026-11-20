import React, { useState } from 'react';
import { UnifiedQueueItem, MusicSourceType } from '../../types';
import {
  Send,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Music2,
  User,
  X,
} from 'lucide-react';

interface ViewerRequestPortalProps {
  queue: UnifiedQueueItem[];
  onSubmitRequest: (request: Omit<UnifiedQueueItem, 'id' | 'addedAt'>) => { success: boolean; message: string };
}

export const ViewerRequestPortal: React.FC<ViewerRequestPortalProps> = ({
  queue,
  onSubmitRequest,
}) => {
  const [songInput, setSongInput] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [sourceType, setSourceType] = useState<MusicSourceType>('youtube');
  const [platform, setPlatform] = useState<'TikTok' | 'Twitch' | 'YouTube' | 'Spotify' | 'Manual'>('TikTok');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-detect source if URL is pasted
  const handleInputChange = (val: string) => {
    setSongInput(val);
    if (val.includes('youtube.com') || val.includes('youtu.be')) {
      setSourceType('youtube');
      setPlatform('YouTube');
    } else if (val.includes('spotify.com')) {
      setSourceType('spotify');
      setPlatform('Spotify');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!songInput.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a song title or valid URL.' });
      return;
    }
    if (!requesterName.trim()) {
      setFeedback({ type: 'error', message: 'Please enter your username.' });
      return;
    }

    // URL validation if marked as URL
    const isUrl = songInput.startsWith('http://') || songInput.startsWith('https://');
    let title = songInput.trim();
    let externalUrl: string | undefined = undefined;

    if (isUrl) {
      externalUrl = songInput.trim();
      // Simple parse of clean title from URL or placeholder
      try {
        const parsed = new URL(externalUrl);
        if (parsed.hostname.includes('youtube') || parsed.hostname.includes('youtu.be')) {
          title = `YouTube Request (${parsed.pathname.slice(0, 15)})`;
        } else if (parsed.hostname.includes('spotify')) {
          title = `Spotify Track (${parsed.pathname.slice(0, 15)})`;
        }
      } catch {
        setFeedback({ type: 'error', message: 'The entered URL is invalid.' });
        return;
      }
    }

    const result = onSubmitRequest({
      title,
      artist: artistInput.trim() || (isUrl ? 'Web Link' : 'Unknown Artist'),
      source: sourceType,
      externalUrl,
      requesterName: requesterName.trim(),
      platform,
      status: 'pending',
      notes: notes.trim() || undefined,
    });

    if (result.success) {
      setFeedback({ type: 'success', message: result.message });
      setSongInput('');
      setArtistInput('');
      setNotes('');
    } else {
      setFeedback({ type: 'error', message: result.message });
    }
  };

  // Recent user requests from this device
  const myRecentRequests = queue.filter(
    (item) => requesterName.trim() && item.requesterName.toLowerCase() === requesterName.trim().toLowerCase()
  );

  return (
    <div className="space-y-5">
      {/* Portal Header & Form */}
      <div className="p-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-[var(--app-text)] flex items-center gap-2">
            <Music2 className="w-4 h-4 text-[var(--app-accent-text)]" />
            Viewer Song Request Portal
          </h3>
          <p className="text-xs text-[var(--app-text-secondary)]">
            Submit your song to the streamer&apos;s queue. In Stage 2, requests are simulated locally with full validation.
          </p>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-[var(--app-ok-soft)] border border-emerald-500/35 text-[var(--app-ok)]'
                : 'bg-[var(--app-error-soft)] border border-rose-500/35 text-[var(--app-error)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Tutup pesan"
              className="min-h-[44px] min-w-[44px] -my-2 -mr-2 rounded-lg flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Request Submission Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-[var(--app-text-secondary)] font-semibold mb-1.5">
              Song Title or URL *
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Midnight City, or paste YouTube/Spotify link"
                value={songInput}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
              />
              <Link2 className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--app-text-secondary)] font-semibold mb-1.5">
                Artist Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. M83"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
              />
            </div>

            <div>
              <label className="block text-[var(--app-text-secondary)] font-semibold mb-1.5">
                Your Stream Username *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="@viewer_handle"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
                />
                <User className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--app-text-secondary)] font-semibold mb-1.5">
                Source Type
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as MusicSourceType)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
              >
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="viewer_request">Custom Track / Request</option>
              </select>
            </div>

            <div>
              <label className="block text-[var(--app-text-secondary)] font-semibold mb-1.5">
                Origin Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as 'TikTok' | 'Twitch' | 'YouTube' | 'Spotify' | 'Manual')}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] focus:outline-none focus:border-[var(--app-accent)]"
              >
                <option value="TikTok">TikTok LIVE</option>
                <option value="Twitch">Twitch</option>
                <option value="YouTube">YouTube Live</option>
                <option value="Spotify">Spotify</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[var(--app-text-secondary)] font-semibold mb-1.5">
              Viewer Message / Dedication (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Good luck on the ranked match!"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] placeholder-[var(--app-text-muted)] focus:outline-none focus:border-[var(--app-accent)]"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="min-h-[44px] px-6 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" /> Submit Song Request
            </button>
          </div>
        </form>
      </div>

      {/* Queue Status Tracker for Requester */}
      {requesterName.trim() && (
        <div className="p-4 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[var(--app-text)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
              Your Request Status ({myRecentRequests.length})
            </span>
            <span className="text-[var(--app-text-secondary)]">Handle: {requesterName}</span>
          </div>

          {myRecentRequests.length === 0 ? (
            <p className="text-xs text-[var(--app-text-secondary)]">
              You haven&apos;t submitted any songs under &quot;{requesterName}&quot; yet.
            </p>
          ) : (
            <div className="space-y-2">
              {myRecentRequests.map((req) => {
                const queueIndex = queue.findIndex((item) => item.id === req.id);

                return (
                  <div
                    key={req.id}
                    className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--app-text)] truncate">{req.title}</div>
                      <div className="text-[11px] text-[var(--app-text-secondary)] truncate">
                        Status: <span className="text-[var(--app-accent-text)] font-semibold">{req.status}</span>
                      </div>
                    </div>

                    <span className="text-xs font-mono-num font-bold text-[var(--app-text)] bg-[var(--app-surface)] px-2.5 py-1 rounded-lg border border-[var(--app-border)] shrink-0">
                      Position: #{queueIndex + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Future Remote Architecture Blueprint */}
      <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] space-y-1.5">
        <div className="flex items-center gap-2 text-[var(--app-accent-text)] font-semibold">
          <Info className="w-4 h-4 shrink-0" />
          <span>Stage 2 Architecture Note: Future Hosted Endpoint</span>
        </div>
        <p className="leading-relaxed">
          In this Stage 2 prototype, the Viewer Request Portal demonstrates local submission validation, duplicate detection, and queue position tracking. In Stage 3, a lightweight WebSocket or Webhook URL (e.g. <code>https://syntxrr.stream/request/:streamerId</code>) will allow mobile viewers in your chat to submit directly to this queue without accessing your dashboard.
        </p>
      </div>
    </div>
  );
};
