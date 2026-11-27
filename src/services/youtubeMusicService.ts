// Official YouTube Data API v3 Connector (Music Category Scope) for SYNTXRR STREAM
// Catalog Metadata Search & YouTube Music Deep-Linking (Zero Scraping, Zero Audio Extraction)

export const YOUTUBE_DATA_API_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
export const YOUTUBE_MUSIC_CATEGORY_ID = '10'; // Official YouTube Data API v3 "Music" videoCategoryId

export interface YouTubeMusicSearchResult {
  id: string;
  title: string;
  artist: string;
  channelTitle: string;
  thumbnailUrl: string;
  musicUrl: string;
  videoUrl: string;
  publishedAt: string;
}

export interface YouTubeMusicSearchResponse {
  success: boolean;
  results: YouTubeMusicSearchResult[];
  error?: string;
  isKeyMissing?: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeBasicHtmlEntities(value: string): string {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in NAMED_HTML_ENTITIES) {
      return NAMED_HTML_ENTITIES[lower];
    }
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
    }
    return full;
  });
}

export function extractYouTubeMusicArtist(channelTitle: string): string {
  const clean = channelTitle.trim();
  if (!clean) return 'YouTube Music';
  const strippedTopic = clean.replace(/\s*-\s*Topic$/i, '').trim();
  return strippedTopic || clean;
}

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function scoreMusicCandidate(result: YouTubeMusicSearchResult, queryTokens: string[]): number {
  let score = 0;
  const titleLower = result.title.toLowerCase();
  const artistLower = result.artist.toLowerCase();
  const channelLower = result.channelTitle.toLowerCase();
  const combined = `${titleLower} ${artistLower}`;

  if (queryTokens.length > 0) {
    let matched = 0;
    for (const token of queryTokens) {
      if (combined.includes(token)) {
        matched += 1;
      }
    }
    score += Math.round((matched / queryTokens.length) * 100);
  }

  if (/\s*-\s*topic$/i.test(result.channelTitle)) {
    score += 15;
  } else if (channelLower.includes('vevo')) {
    score += 10;
  }

  if (/\bofficial\s+(audio|music\s+video|lyric)\b/i.test(titleLower)) {
    score += 8;
  }

  return score;
}

async function fetchWithTimeout(
  input: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller !== null
      ? setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;
  try {
    return await fetch(input, {
      method: 'GET',
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

export const YouTubeMusicService = {
  async searchMusicCatalog(query: string, apiKey?: string): Promise<YouTubeMusicSearchResponse> {
    const trimmedKey = apiKey?.trim();
    if (!trimmedKey) {
      return {
        success: false,
        results: [],
        isKeyMissing: true,
        error:
          'YouTube Data API v3 Key belum dikonfigurasi. Tambahkan API key di Settings untuk pencarian katalog YouTube Music.',
      };
    }

    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      return {
        success: true,
        results: [],
      };
    }

    try {
      const endpoint = new URL(YOUTUBE_DATA_API_SEARCH_ENDPOINT);
      endpoint.searchParams.set('part', 'snippet');
      endpoint.searchParams.set('maxResults', '10');
      endpoint.searchParams.set('q', cleanQuery);
      endpoint.searchParams.set('type', 'video');
      endpoint.searchParams.set('videoCategoryId', YOUTUBE_MUSIC_CATEGORY_ID);
      endpoint.searchParams.set('key', trimmedKey);

      const res = await fetchWithTimeout(endpoint.toString());
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData?.error?.message ||
          `YouTube Music API Error (${res.status}): ${res.statusText || 'Gagal mencari katalog.'}`;
        return {
          success: false,
          results: [],
          error: message,
        };
      }

      const data = await res.json().catch(() => ({}));
      const rawItems: any[] = Array.isArray(data?.items) ? data.items : [];
      const mapped: YouTubeMusicSearchResult[] = [];

      for (const item of rawItems) {
        const rawId = typeof item?.id?.videoId === 'string' ? item.id.videoId.trim() : '';
        if (!rawId) continue;

        const title = decodeBasicHtmlEntities(item?.snippet?.title || 'Unknown Title').trim() || 'Unknown Title';
        const channelTitle =
          decodeBasicHtmlEntities(item?.snippet?.channelTitle || 'YouTube Music').trim() || 'YouTube Music';
        const artist = extractYouTubeMusicArtist(channelTitle);
        const thumbnailUrl =
          item?.snippet?.thumbnails?.medium?.url ||
          item?.snippet?.thumbnails?.high?.url ||
          item?.snippet?.thumbnails?.default?.url ||
          '';
        const encodedId = encodeURIComponent(rawId);

        mapped.push({
          id: rawId,
          title,
          artist,
          channelTitle,
          thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : '',
          musicUrl: `https://music.youtube.com/watch?v=${encodedId}`,
          videoUrl: `https://www.youtube.com/watch?v=${encodedId}`,
          publishedAt: typeof item?.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : '',
        });
      }

      const queryTokens = normalizeTokens(cleanQuery);
      const ranked = mapped
        .map((result, index) => ({
          result,
          index,
          score: scoreMusicCandidate(result, queryTokens),
        }))
        .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
        .map((entry) => entry.result);

      return {
        success: true,
        results: ranked,
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      return {
        success: false,
        results: [],
        error: isAbort
          ? 'Permintaan katalog YouTube Music melebihi batas waktu.'
          : err?.message || 'Gangguan jaringan saat menghubungi YouTube Data API v3.',
      };
    }
  },
};
