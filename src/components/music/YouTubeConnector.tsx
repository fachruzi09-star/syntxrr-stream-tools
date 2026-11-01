import React, { useState } from 'react';
import { YouTubeSearchResult } from '../../types';
import { YouTubeService } from '../../services/youtubeService';
import {
  Search,
  ExternalLink,
  Plus,
  AlertTriangle,
  Info,
  KeyRound,
  Check,
  Video,
} from 'lucide-react';

interface YouTubeConnectorProps {
  apiKey?: string;
  onAddToQueue: (result: YouTubeSearchResult) => void;
  onNavigateToSettings: () => void;
}

export const YouTubeConnector: React.FC<YouTubeConnectorProps> = ({
  apiKey,
  onAddToQueue,
  onNavigateToSettings,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const isConfigured = Boolean(apiKey && apiKey.trim().length > 5);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setErrorMessage(null);

    const response = await YouTubeService.searchCatalog(query, apiKey);
    setIsSearching(false);

    if (response.success) {
      setResults(response.results);
      if (response.results.length === 0) {
        setErrorMessage('No videos matched your search query.');
      }
    } else {
      setResults([]);
      setErrorMessage(response.error || 'Failed to search YouTube catalog.');
    }
  };

  const handleAddTrack = (item: YouTubeSearchResult) => {
    onAddToQueue(item);
    setAddedIds((prev) => new Set(prev).add(item.id));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 2000);
  };

  return (
    <div className="space-y-5">
      {/* Search Header Bar */}
      <div className="p-5 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-red-600 flex items-center justify-center text-white text-[10px] font-black">
                YT
              </span>
              YouTube Data API Catalog Connector
            </h3>
            <p className="text-xs text-slate-400">
              Search video metadata to populate viewer requests and overlay now-playing graphics
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            {isConfigured ? (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded-md">
                API Key Configured
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/80 border border-amber-800 px-2.5 py-1 rounded-md">
                Key Missing (Disconnected)
              </span>
            )}
          </div>
        </div>

        {/* Missing API Key Banner */}
        {!isConfigured && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-900/60 text-xs text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>YouTube Data API v3 Key Required</span>
            </div>
            <p className="leading-relaxed text-slate-300">
              To search official YouTube video catalog metadata in real-time, configure your YouTube Data API v3 key in Settings. No fake responses are simulated.
            </p>
            <button
              onClick={onNavigateToSettings}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /> Open Settings to Configure Key
            </button>
          </div>
        )}

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={isConfigured ? 'Search YouTube song title, artist, or channel...' : 'Configure API key in Settings first to enable live search...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!isConfigured || isSearching}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white text-xs focus:outline-none focus:border-red-500 disabled:opacity-50"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          <button
            type="submit"
            disabled={!isConfigured || isSearching || !query.trim()}
            className="min-h-[44px] px-5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {errorMessage && (
          <div className="text-xs text-amber-300 bg-amber-950/30 p-2.5 rounded-lg border border-amber-900/40">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Results List */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Found {results.length} Catalog Results</span>
            <span>Metadata Only · Zero Audio Extraction</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((item) => {
              const isAdded = addedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-slate-700 flex gap-3 transition-colors"
                >
                  {/* Video Thumbnail */}
                  <div className="relative w-28 h-20 rounded-lg bg-black overflow-hidden shrink-0 border border-slate-800">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Video className="w-6 h-6" />
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 px-1 bg-black/80 text-[9px] font-bold text-white rounded">
                      YouTube
                    </span>
                  </div>

                  {/* Metadata & Actions */}
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white line-clamp-2 leading-tight">
                        {item.title}
                      </h4>
                      <div className="text-[11px] text-slate-400 truncate mt-1">
                        {item.channelTitle}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => YouTubeService.openInYouTube(item.videoUrl)}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                        title="Open video in official YouTube app"
                      >
                        <ExternalLink className="w-3 h-3" /> View Video
                      </button>

                      <button
                        onClick={() => handleAddTrack(item)}
                        disabled={isAdded}
                        className={`min-h-[32px] px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                          isAdded
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Added
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" /> Add to Queue
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compliance & Policy Safeguard Card */}
      <div className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-1.5">
        <div className="flex items-center gap-2 text-blue-400 font-semibold">
          <Info className="w-4 h-4" />
          <span>YouTube API Policy Compliance</span>
        </div>
        <p className="leading-relaxed">
          SYNTXRR STREAM TOOLS adheres strictly to the YouTube Developer Terms of Service. YouTube catalog entries provide video titles, channel credits, and deep-links for your overlay graphics. No audio is ripped, downloaded, or mixed into the broadcast encoder.
        </p>
      </div>
    </div>
  );
};
