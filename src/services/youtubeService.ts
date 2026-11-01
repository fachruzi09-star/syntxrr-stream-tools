// Official YouTube Data API v3 Connector for SYNTXRR STREAM TOOLS
// Catalog Metadata Search & Deep-Linking (Zero Audio Extraction)

import { YouTubeSearchResult } from '../types';

export interface YouTubeSearchResponse {
  success: boolean;
  results: YouTubeSearchResult[];
  error?: string;
  isKeyMissing?: boolean;
}

export const YouTubeService = {
  async searchCatalog(query: string, apiKey?: string): Promise<YouTubeSearchResponse> {
    const trimmedKey = apiKey?.trim();
    if (!trimmedKey) {
      return {
        success: false,
        results: [],
        isKeyMissing: true,
        error: 'YouTube Data API v3 Key is not configured. Add your API key in Settings to search YouTube.',
      };
    }

    if (!query.trim()) {
      return {
        success: true,
        results: [],
      };
    }

    try {
      const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
      endpoint.searchParams.set('part', 'snippet');
      endpoint.searchParams.set('maxResults', '10');
      endpoint.searchParams.set('q', query.trim());
      endpoint.searchParams.set('type', 'video');
      endpoint.searchParams.set('key', trimmedKey);

      const res = await fetch(endpoint.toString());
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData?.error?.message ||
          `YouTube API Error (${res.status}): ${res.statusText}. Check API key quotas and permissions.`;
        return {
          success: false,
          results: [],
          error: message,
        };
      }

      const data = await res.json();
      const results: YouTubeSearchResult[] = (data.items || []).map((item: any) => {
        const videoId = item.id?.videoId || '';
        return {
          id: videoId,
          title: decodeHtmlEntities(item.snippet?.title || 'Unknown Title'),
          channelTitle: decodeHtmlEntities(item.snippet?.channelTitle || 'Unknown Channel'),
          thumbnailUrl:
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            '',
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: item.snippet?.publishedAt || '',
        };
      });

      return {
        success: true,
        results,
      };
    } catch (err: any) {
      return {
        success: false,
        results: [],
        error: err?.message || 'Network error reaching YouTube Data API.',
      };
    }
  },

  // Helper to open link safely in external window/app
  openInYouTube(videoUrl: string) {
    if (typeof window !== 'undefined' && videoUrl) {
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    }
  },
};

function decodeHtmlEntities(str: string): string {
  if (typeof document === 'undefined') return str;
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}
