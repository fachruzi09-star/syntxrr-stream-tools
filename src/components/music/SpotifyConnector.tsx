import React, { useState } from 'react';
import { SpotifySearchResult } from '../../types';
import { SpotifyService } from '../../services/spotifyService';
import { showInAppNotice } from '../../services/uiNotice';
import {
  Search,
  ExternalLink,
  Plus,
  AlertTriangle,
  Info,
  KeyRound,
  Check,
  Disc3,
  LogIn,
  LogOut,
} from 'lucide-react';

interface SpotifyConnectorProps {
  clientId?: string;
  accessToken?: string;
  onUpdateSpotifyToken: (token: string) => void;
  onAddToQueue: (result: SpotifySearchResult) => void;
  onNavigateToSettings: () => void;
}

export const SpotifyConnector: React.FC<SpotifyConnectorProps> = ({
  clientId,
  accessToken,
  onUpdateSpotifyToken,
  onAddToQueue,
  onNavigateToSettings,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const isAuthorized = Boolean(accessToken && accessToken.trim().length > 10);
  const isClientIdConfigured = Boolean(clientId && clientId.trim().length > 5);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setErrorMessage(null);

    const response = await SpotifyService.searchCatalog(query, accessToken);
    setIsSearching(false);

    if (response.success) {
      setResults(response.results);
      if (response.results.length === 0) {
        setErrorMessage('No tracks matched your Spotify catalog search.');
      }
    } else {
      setResults([]);
      setErrorMessage(response.error || 'Failed to search Spotify catalog.');
    }
  };

  const handleStartOAuthConnect = () => {
    if (!clientId?.trim()) {
      onNavigateToSettings();
      return;
    }

    const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';
    const authUrl = SpotifyService.getAuthUrl(clientId, redirectUri);

    // Open official Spotify OAuth authorization window
    const popup = window.open(authUrl, 'spotify_oauth_popup', 'width=600,height=700');
    if (!popup) {
      const msg = 'Popup blocker mencegah pembukaan jendela login Spotify. Izinkan popup untuk melanjutkan.';
      setErrorMessage(msg);
      showInAppNotice({
        tone: 'warn',
        title: 'Popup Diblokir',
        message: msg,
      });
    }
  };

  const handleAddTrack = (item: SpotifySearchResult) => {
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
              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black text-xs font-black">
                ●
              </span>
              Spotify Developer Catalog Connector
            </h3>
            <p className="text-xs text-slate-400">
              Official Spotify Web API search for viewer track requests and overlay artwork display
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAuthorized ? (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded-md flex items-center gap-1">
                <Check className="w-3 h-3" /> Spotify Connected
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/80 border border-amber-800 px-2.5 py-1 rounded-md">
                Disconnected (Auth Required)
              </span>
            )}
          </div>
        </div>

        {/* Authorization State Card */}
        {!isAuthorized ? (
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/50 text-xs text-slate-300 space-y-3">
            <div className="flex items-center gap-2 font-bold text-emerald-300">
              <AlertTriangle className="w-4 h-4 text-emerald-400" />
              <span>Spotify Account Authorization Required</span>
            </div>
            <p className="leading-relaxed">
              Spotify requires an active OAuth access token or registered Client ID to search track catalog metadata. Client secrets are never embedded in the frontend code.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isClientIdConfigured ? (
                <button
                  onClick={handleStartOAuthConnect}
                  className="min-h-[38px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-950/50"
                >
                  <LogIn className="w-4 h-4" /> Connect with Spotify OAuth
                </button>
              ) : (
                <button
                  onClick={onNavigateToSettings}
                  className="min-h-[38px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-emerald-400" /> Configure Client ID in Settings
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-slate-400 bg-[#080c16] px-3 py-2 rounded-xl border border-slate-800">
            <span className="text-emerald-400 font-medium">Session token active</span>
            <button
              onClick={() => onUpdateSpotifyToken('')}
              className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        )}

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={isAuthorized ? 'Search Spotify song title or artist...' : 'Connect Spotify above or in Settings to enable search...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!isAuthorized || isSearching}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          <button
            type="submit"
            disabled={!isAuthorized || isSearching || !query.trim()}
            className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
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

      {/* Results Grid */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Found {results.length} Spotify Tracks</span>
            <span>Metadata Only · Zero Audio Extraction</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((item) => {
              const isAdded = addedIds.has(item.id);
              const durationSec = Math.round(item.durationMs / 1000);
              const mins = Math.floor(durationSec / 60);
              const secs = durationSec % 60;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#0e1626] border border-slate-800 hover:border-slate-700 flex gap-3 transition-colors"
                >
                  {/* Album Cover */}
                  <div className="relative w-16 h-16 rounded-lg bg-black overflow-hidden shrink-0 border border-slate-800">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Disc3 className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Metadata & Actions */}
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white truncate">
                        {item.title}
                      </h4>
                      <div className="text-[11px] text-slate-300 truncate mt-0.5">
                        {item.artist}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {item.albumName} · {mins}:{secs < 10 ? '0' : ''}{secs}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => SpotifyService.openInSpotify(item.spotifyUrl)}
                        className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                        title="Open track in official Spotify app"
                      >
                        <ExternalLink className="w-3 h-3" /> View in Spotify
                      </button>

                      <button
                        onClick={() => handleAddTrack(item)}
                        disabled={isAdded}
                        className={`min-h-[32px] px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                          isAdded
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
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

      {/* Spotify Developer Policy Notice */}
      <div className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-1.5">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <Info className="w-4 h-4" />
          <span>Spotify Developer Terms Compliance</span>
        </div>
        <p className="leading-relaxed">
          Spotify audio cannot be extracted, recorded, or routed into the live streaming encoder. The Spotify connector synchronizes song titles, artists, and album artwork metadata for stream overlays and viewer track requests.
        </p>
      </div>
    </div>
  );
};
