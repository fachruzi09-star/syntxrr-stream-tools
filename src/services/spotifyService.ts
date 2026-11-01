// Official Spotify Web API Connector for SYNTXRR STREAM TOOLS
// Catalog Metadata Search & Deep-Linking (Zero Audio Extraction)

import { SpotifySearchResult } from '../types';

export interface SpotifySearchResponse {
  success: boolean;
  results: SpotifySearchResult[];
  error?: string;
  isAuthRequired?: boolean;
}

export const SpotifyService = {
  // Construct official Spotify OAuth Authorization URL (PKCE / Implicit Flow for SPA)
  getAuthUrl(clientId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId.trim(),
      response_type: 'token',
      redirect_uri: redirectUri,
      scope: 'user-read-private playlist-read-private',
      show_dialog: 'true',
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  },

  async searchCatalog(query: string, accessToken?: string): Promise<SpotifySearchResponse> {
    const trimmedToken = accessToken?.trim();
    if (!trimmedToken) {
      return {
        success: false,
        results: [],
        isAuthRequired: true,
        error: 'Spotify authorization token is missing. Connect your Spotify account or configure a client token in Settings.',
      };
    }

    if (!query.trim()) {
      return {
        success: true,
        results: [],
      };
    }

    try {
      const endpoint = new URL('https://api.spotify.com/v1/search');
      endpoint.searchParams.set('q', query.trim());
      endpoint.searchParams.set('type', 'track');
      endpoint.searchParams.set('limit', '10');

      const res = await fetch(endpoint.toString(), {
        headers: {
          Authorization: `Bearer ${trimmedToken}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          return {
            success: false,
            results: [],
            isAuthRequired: true,
            error: 'Spotify session expired or unauthorized. Please re-authenticate in Settings.',
          };
        }
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData?.error?.message ||
          `Spotify API Error (${res.status}): ${res.statusText}.`;
        return {
          success: false,
          results: [],
          error: message,
        };
      }

      const data = await res.json();
      const items = data.tracks?.items || [];
      const results: SpotifySearchResult[] = items.map((track: any) => ({
        id: track.id,
        title: track.name,
        artist: (track.artists || []).map((a: any) => a.name).join(', '),
        albumName: track.album?.name || '',
        thumbnailUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '',
        spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        durationMs: track.duration_ms || 180000,
      }));

      return {
        success: true,
        results,
      };
    } catch (err: any) {
      return {
        success: false,
        results: [],
        error: err?.message || 'Network error reaching Spotify Web API.',
      };
    }
  },

  openInSpotify(url: string) {
    if (typeof window !== 'undefined' && url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },
};
