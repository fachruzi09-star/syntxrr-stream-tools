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
  MessageSquare,
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
      {/* Portal Header */}
      <div className="p-5 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Music2 className="w-4 h-4 text-blue-400" />
            Viewer Song Request Portal
          </h3>
          <p className="text-xs text-slate-400">
            Submit your song to the streamer&apos;s queue. In Stage 2, requests are simulated locally with full validation.
          </p>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                : 'bg-rose-950/80 border border-rose-800 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs opacity-75 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Request Submission Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Song Title or URL *
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Midnight City, or paste YouTube/Spotify link"
                value={songInput}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Artist Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. M83"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Your Stream Username *
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="@viewer_handle"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Source Type
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as MusicSourceType)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="youtube">YouTube</option>
                <option value="spotify">Spotify</option>
                <option value="viewer_request">Custom Track / Request</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Origin Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
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
            <label className="block text-slate-300 font-medium mb-1">
              Viewer Message / Dedication (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Good luck on the ranked match!"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#080c16] border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="min-h-[44px] px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-blue-900/30"
            >
              <Send className="w-4 h-4" /> Submit Song Request
            </button>
          </div>
        </form>
      </div>

      {/* Queue Status Tracker for Requester */}
      {requesterName.trim() && (
        <div className="p-4 rounded-xl bg-[#0e1626] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              Your Request Status ({myRecentRequests.length})
            </span>
            <span className="text-slate-400">Handle: {requesterName}</span>
          </div>

          {myRecentRequests.length === 0 ? (
            <p className="text-xs text-slate-400">
              You haven&apos;t submitted any songs under &quot;{requesterName}&quot; yet.
            </p>
          ) : (
            <div className="space-y-2">
              {myRecentRequests.map((req) => {
                const queueIndex = queue.findIndex((item) => item.id === req.id);

                return (
                  <div
                    key={req.id}
                    className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{req.title}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        Status: <span className="text-blue-400 font-semibold">{req.status}</span>
                      </div>
                    </div>

                    <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">
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
      <div className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-1.5">
        <div className="flex items-center gap-2 text-blue-400 font-semibold">
          <Info className="w-4 h-4" />
          <span>Stage 2 Architecture Note: Future Hosted Endpoint</span>
        </div>
        <p className="leading-relaxed">
          In this Stage 2 prototype, the Viewer Request Portal demonstrates local submission validation, duplicate detection, and queue position tracking. In Stage 3, a lightweight WebSocket or Webhook URL (e.g. <code>https://syntxrr.stream/request/:streamerId</code>) will allow mobile viewers in your chat to submit directly to this queue without accessing your dashboard.
        </p>
      </div>
    </div>
  );
};
