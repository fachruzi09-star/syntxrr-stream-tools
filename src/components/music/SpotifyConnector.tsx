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
      <div className="p-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-display font-bold text-[var(--app-text)] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black text-xs font-black">
                ●
              </span>
              Spotify Developer Catalog Connector
            </h3>
            <p className="text-xs text-[var(--app-text-secondary)]">
              Official Spotify Web API search for viewer track requests and overlay artwork display
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAuthorized ? (
              <span className="text-[11px] font-semibold text-[var(--app-ok)] bg-[var(--app-ok-soft)] border border-emerald-500/30 px-2.5 py-1 rounded-md flex items-center gap-1">
                <Check className="w-3 h-3" /> Spotify Connected
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-[var(--app-warn)] bg-[var(--app-warn-soft)] border border-amber-500/30 px-2.5 py-1 rounded-md">
                Disconnected (Auth Required)
              </span>
            )}
          </div>
        </div>

        {/* Authorization State Card */}
        {!isAuthorized ? (
          <div className="p-4 rounded-xl bg-[var(--app-ok-soft)] border border-emerald-500/30 text-xs text-[var(--app-text)] space-y-3">
            <div className="flex items-center gap-2 font-bold text-[var(--app-ok)]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Spotify Account Authorization Required</span>
            </div>
            <p className="leading-relaxed text-[var(--app-text-secondary)]">
              Spotify requires an active OAuth access token or registered Client ID to search track catalog metadata. Client secrets are never embedded in the frontend code.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isClientIdConfigured ? (
                <button
                  type="button"
                  onClick={handleStartOAuthConnect}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <LogIn className="w-4 h-4" /> Connect with Spotify OAuth
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onNavigateToSettings}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-surface-elevated)] hover:border-[var(--app-accent-border)] border border-[var(--app-border)] text-[var(--app-text)] font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-[var(--app-ok)]" /> Configure Client ID in Settings
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-[var(--app-text-secondary)] bg-[var(--app-surface-muted)] px-3.5 py-1.5 rounded-xl border border-[var(--app-border)]">
            <span className="text-[var(--app-ok)] font-semibold">Session token active</span>
            <button
              type="button"
              onClick={() => onUpdateSpotifyToken('')}
              className="min-h-[44px] px-2 -mr-1 text-[var(--app-text-secondary)] hover:text-[var(--app-error)] transition-colors flex items-center gap-1.5 font-semibold"
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        )}

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={
                isAuthorized
                  ? 'Search Spotify song title or artist...'
                  : 'Connect Spotify above or in Settings to enable search...'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!isAuthorized || isSearching}
              className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text)] placeholder-[var(--app-text-muted)] text-xs focus:outline-none focus:border-[var(--app-ok)] disabled:opacity-50"
            />
            <Search className="w-4 h-4 text-[var(--app-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          <button
            type="submit"
            disabled={!isAuthorized || isSearching || !query.trim()}
            className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {errorMessage && (
          <div className="text-xs text-[var(--app-warn)] bg-[var(--app-warn-soft)] p-3 rounded-xl border border-amber-500/30">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Results Grid */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--app-text-secondary)] px-1">
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
                  className="p-3.5 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] flex gap-3 transition-colors"
                >
                  {/* Album Cover */}
                  <div className="relative w-16 h-16 rounded-lg bg-[var(--app-surface-muted)] overflow-hidden shrink-0 border border-[var(--app-border)]">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--app-text-muted)]">
                        <Disc3 className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Metadata & Actions */}
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--app-text)] truncate">
                        {item.title}
                      </h4>
                      <div className="text-[11px] text-[var(--app-text-secondary)] truncate mt-0.5">
                        {item.artist}
                      </div>
                      <div className="text-[10px] text-[var(--app-text-muted)] truncate font-mono-num">
                        {item.albumName} · {mins}:{secs < 10 ? '0' : ''}{secs}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => SpotifyService.openInSpotify(item.spotifyUrl)}
                        className="min-h-[44px] px-2 -ml-2 text-[11px] text-[var(--app-text-secondary)] hover:text-[var(--app-ok)] flex items-center gap-1 transition-colors"
                        title="Open track in official Spotify app"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View in Spotify
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddTrack(item)}
                        disabled={isAdded}
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors ${
                          isAdded
                            ? 'bg-[var(--app-ok-soft)] text-[var(--app-ok)] border border-emerald-500/35'
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
      <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] space-y-1.5">
        <div className="flex items-center gap-2 text-[var(--app-ok)] font-semibold">
          <Info className="w-4 h-4 shrink-0" />
          <span>Spotify Developer Terms Compliance</span>
        </div>
        <p className="leading-relaxed">
          Spotify audio cannot be extracted, recorded, or routed into the live streaming encoder. The Spotify connector synchronizes song titles, artists, and album artwork metadata for stream overlays and viewer track requests.
        </p>
      </div>
    </div>
  );
};
