// Official Audius REST API v1 Connector for SYNTXRR STREAM
// Read-only catalog search (/tracks/search) and authorized stream verification (/tracks/{track_id}/stream).
// Enforces Open Music License / clearly verifiable open licensing, streamability, and non-gated checks.

export const AUDIUS_API_BASE = 'https://api.audius.co/v1';
export const AUDIUS_APP_NAME = 'SYNTXRR_STREAM';

export interface AudiusArtwork {
  '150x150'?: string;
  '480x480'?: string;
  '1000x1000'?: string;
  [size: string]: string | undefined;
}

export interface AudiusUser {
  id?: string;
  name?: string;
  handle?: string;
  is_verified?: boolean;
}

export interface AudiusTrack {
  id: string;
  title: string;
  duration?: number;
  genre?: string;
  mood?: string;
  permalink?: string;
  is_available?: boolean;
  is_streamable?: boolean;
  is_stream_gated?: boolean;
  stream_conditions?: Record<string, unknown> | null;
  access?: {
    stream?: boolean;
    download?: boolean;
  } | null;
  is_unlisted?: boolean;
  is_delete?: boolean;
  license?: string | { type?: string; name?: string } | null;
  copyright_notice?: string;
  copyright?: string;
  copyright_line?: { year?: number | string; text?: string } | null;
  producer_copyright_line?: { year?: number | string; text?: string } | null;
  artwork?: AudiusArtwork | null;
  track_image?: AudiusArtwork | null;
  user?: AudiusUser | null;
}

export interface AudiusAttributionMetadata {
  rightsHolder: string;
  licenseType: string;
  copyrightNotice?: string;
  trackUrl?: string;
}

export interface AudiusTrackAuthorizationResult {
  allowed: boolean;
  reason?: string;
  licenseType?: string;
  attribution: AudiusAttributionMetadata;
}

export interface AudiusAuthorizedCandidate {
  track: AudiusTrack;
  title: string;
  artist: string;
  durationSec: number;
  thumbnailUrl?: string;
  externalUrl?: string;
  attribution: AudiusAttributionMetadata;
}

export interface AudiusSearchOutcome {
  success: boolean;
  candidates: AudiusAuthorizedCandidate[];
  rejectedReasons: string[];
  hasMatchedTracks: boolean;
  rateLimited?: boolean;
  error?: string;
}

export interface AudiusStreamVerificationResult {
  ok: boolean;
  streamUrl?: string;
  rateLimited?: boolean;
  error?: string;
}

export interface AudiusPlayableResolution {
  success: boolean;
  candidate?: AudiusAuthorizedCandidate;
  streamUrl?: string;
  hasMatchedTracks: boolean;
  rejectedReasons: string[];
  error?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

function extractLicenseString(license: AudiusTrack['license']): string {
  if (typeof license === 'string') return license.trim();
  if (license && typeof license === 'object') {
    if (typeof license.type === 'string' && license.type.trim()) return license.type.trim();
    if (typeof license.name === 'string' && license.name.trim()) return license.name.trim();
  }
  return '';
}

export interface AudiusLicenseEvaluationOptions {
  /**
   * True ONLY when caller has verified full Audius API track metadata:
   * is_available !== false, !is_unlisted, !is_delete, is_streamable === true,
   * !is_stream_gated, stream_conditions null/empty, access?.stream !== false.
   * Under Audius Terms of Use & OML, public API-streamable ungated tracks with
   * "All rights reserved" or null/empty license are licensed under Open Music License (OML).
   */
  apiStreamableUngated?: boolean;
}

export function isPermittedAudiusLicenseLabel(
  licenseInput: AudiusTrack['license'],
  options?: AudiusLicenseEvaluationOptions,
): { permitted: boolean; normalizedLabel?: string; reason?: string } {
  const raw = extractLicenseString(licenseInput);
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const apiStreamableUngated = options?.apiStreamableUngated === true;

  if (!normalized) {
    if (apiStreamableUngated) {
      return { permitted: true, normalizedLabel: 'Open Music License' };
    }
    return {
      permitted: false,
      reason: 'Bukti lisensi track Audius tidak tersedia atau kosong.',
    };
  }

  if (
    lower === 'all rights reserved' ||
    lower === 'all-rights-reserved' ||
    lower === 'all_rights_reserved'
  ) {
    if (apiStreamableUngated) {
      return { permitted: true, normalizedLabel: 'Open Music License' };
    }
    return {
      permitted: false,
      reason: `Label "${normalized}" tanpa verifikasi status streamable & ungated API Audius (OML) tidak dapat diputar langsung.`,
    };
  }

  if (
    lower === 'arr' ||
    lower === 'copyright' ||
    lower === 'unknown' ||
    lower === 'unspecified' ||
    lower === 'none'
  ) {
    return {
      permitted: false,
      reason: `Metadata lisensi "${normalized}" tidak cukup jelas untuk pemutaran otomatis.`,
    };
  }

  // 1. Check NonCommercial (NC) FIRST — includes CC BY-NC, CC BY-NC-SA, CC BY-NC-ND.
  if (
    /\b(nc|non[-_\s]?commercial)\b/i.test(lower) ||
    /(^|[\s_-])by[\s_-]*nc([\s_-]|$)/i.test(lower)
  ) {
    return {
      permitted: false,
      reason: `Lisensi "${normalized}" memiliki pembatasan NonCommercial (NC) yang tidak diizinkan untuk siaran langsung.`,
    };
  }

  // 2. Check NoDerivatives (ND) SEPARATELY — CC BY-ND permits commercial use without derivative works,
  // but is held back conservatively in Stage 1 due to live broadcast mixing/overlay derivative ambiguity.
  if (
    /\b(nd|no[-_\s]?derivatives?|noderivs)\b/i.test(lower) ||
    /(^|[\s_-])by[\s_-]*nd([\s_-]|$)/i.test(lower)
  ) {
    return {
      permitted: false,
      reason: `Lisensi "${normalized}" (CC BY-ND) mengizinkan penggunaan komersial tanpa karya turunan, tetapi ditolak secara konservatif karena pembatasan NoDerivatives (ND) saat diputar bersama siaran live.`,
    };
  }

  if (
    /^(audius[\s_-]+)?open[\s_-]+music[\s_-]+license(\s*\(oml\))?$/i.test(normalized) ||
    /^oml$/i.test(normalized)
  ) {
    return { permitted: true, normalizedLabel: 'Open Music License' };
  }

  if (
    /^(cc0(\s*1\.0)?|cc0-1\.0|public[\s_-]+domain(\s+cc0)?)$/i.test(normalized)
  ) {
    return { permitted: true, normalizedLabel: 'CC0 / Public Domain' };
  }

  if (
    /^(cc[\s_-]*)?by(\s*4\.0)?$/i.test(normalized) ||
    /^creative\s+commons\s+attribution(\s*4\.0)?$/i.test(normalized) ||
    /^attribution(\s*\(?\s*cc[\s_-]*by\s*\)?)?$/i.test(normalized)
  ) {
    return { permitted: true, normalizedLabel: 'CC BY' };
  }

  if (
    /^(cc[\s_-]*)?by[\s_-]*sa(\s*4\.0)?$/i.test(normalized) ||
    /^creative\s+commons\s+attribution[\s_-]*sharealike(\s*4\.0)?$/i.test(normalized) ||
    /^attribution[\s_-]*sharealike(\s*\(?\s*cc[\s_-]*by[\s_-]*sa\s*\)?)?$/i.test(normalized)
  ) {
    return { permitted: true, normalizedLabel: 'CC BY-SA' };
  }

  return {
    permitted: false,
    reason: `Lisensi alternatif "${normalized}" belum dapat diverifikasi untuk pemutaran otomatis.`,
  };
}

function resolveAudiusArtworkUrl(track: AudiusTrack): string | undefined {
  const art = track.artwork || track.track_image;
  if (!art || typeof art !== 'object') return undefined;
  const candidate = art['480x480'] || art['1000x1000'] || art['150x150'];
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

export function resolveAudiusTrackExternalUrl(permalink?: string, trackId?: string): string | undefined {
  if (typeof permalink === 'string' && permalink.trim()) {
    const trimmed = permalink.trim();
    if (/^https?:\/\/(www\.)?audius\.co\//i.test(trimmed)) {
      return trimmed;
    }
    if (!/^[a-z]+:/i.test(trimmed)) {
      const cleanPath = trimmed.replace(/^\/+/, '');
      if (cleanPath) {
        return `https://audius.co/${cleanPath}`;
      }
    }
  }
  if (typeof trackId === 'string' && trackId.trim()) {
    return `https://audius.co/tracks/${encodeURIComponent(trackId.trim())}`;
  }
  return undefined;
}

function resolveAudiusRightsHolder(track: AudiusTrack): string {
  const name = typeof track.user?.name === 'string' ? track.user.name.trim() : '';
  if (name) return name;
  const handle = typeof track.user?.handle === 'string' ? track.user.handle.trim() : '';
  if (handle) return handle;
  return 'Unknown Artist';
}

function resolveAudiusCopyrightNotice(track: AudiusTrack): string | undefined {
  if (typeof track.copyright_notice === 'string' && track.copyright_notice.trim()) {
    return track.copyright_notice.trim();
  }
  if (typeof track.copyright === 'string' && track.copyright.trim()) {
    return track.copyright.trim();
  }
  if (track.copyright_line && typeof track.copyright_line.text === 'string' && track.copyright_line.text.trim()) {
    const year = track.copyright_line.year ? `${track.copyright_line.year} ` : '';
    return `${year}${track.copyright_line.text.trim()}`.trim();
  }
  if (
    track.producer_copyright_line &&
    typeof track.producer_copyright_line.text === 'string' &&
    track.producer_copyright_line.text.trim()
  ) {
    const year = track.producer_copyright_line.year ? `${track.producer_copyright_line.year} ` : '';
    return `${year}${track.producer_copyright_line.text.trim()}`.trim();
  }
  return undefined;
}

export function evaluateAudiusTrackAuthorization(
  track: AudiusTrack | null | undefined,
): AudiusTrackAuthorizationResult {
  if (!track || typeof track !== 'object' || typeof track.id !== 'string' || !track.id.trim()) {
    return {
      allowed: false,
      reason: 'Metadata track Audius tidak lengkap.',
      attribution: {
        rightsHolder: 'Unknown Artist',
        licenseType: 'Unknown',
      },
    };
  }

  const rightsHolder = resolveAudiusRightsHolder(track);
  const copyrightNotice = resolveAudiusCopyrightNotice(track);
  const trackUrl = resolveAudiusTrackExternalUrl(track.permalink, track.id);
  const rawLicenseLabel = extractLicenseString(track.license) || 'Unspecified';

  const baseAttribution: AudiusAttributionMetadata = {
    rightsHolder,
    licenseType: rawLicenseLabel,
    ...(copyrightNotice ? { copyrightNotice } : {}),
    ...(trackUrl ? { trackUrl } : {}),
  };

  if (track.is_delete === true || track.is_unlisted === true || track.is_available === false) {
    return {
      allowed: false,
      reason: 'Track Audius tidak tersedia untuk publik (unlisted, dihapus, atau tidak tersedia).',
      attribution: baseAttribution,
    };
  }

  if (track.is_streamable !== true) {
    return {
      allowed: false,
      reason: 'Track Audius tidak mengizinkan streaming melalui API (is_streamable=false).',
      attribution: baseAttribution,
    };
  }

  const hasStreamConditions =
    track.stream_conditions !== null &&
    track.stream_conditions !== undefined &&
    (typeof track.stream_conditions !== 'object' ||
      Object.keys(track.stream_conditions).length > 0);

  if (track.is_stream_gated === true || hasStreamConditions || track.access?.stream === false) {
    return {
      allowed: false,
      reason: 'Track Audius bersifat stream-gated atau akses streaming dibatasi.',
      attribution: baseAttribution,
    };
  }

  const licenseEval = isPermittedAudiusLicenseLabel(track.license, {
    apiStreamableUngated: true,
  });
  if (!licenseEval.permitted || !licenseEval.normalizedLabel) {
    return {
      allowed: false,
      reason: licenseEval.reason || 'Metadata lisensi track Audius tidak dapat diverifikasi.',
      attribution: baseAttribution,
    };
  }

  return {
    allowed: true,
    licenseType: licenseEval.normalizedLabel,
    attribution: {
      ...baseAttribution,
      licenseType: licenseEval.normalizedLabel,
    },
  };
}

export function buildAudiusStreamEndpointUrl(trackId: string, baseUrl: string = AUDIUS_API_BASE): string {
  const cleanId = trackId.trim();
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const endpoint = new URL(`${cleanBase}/tracks/${encodeURIComponent(cleanId)}/stream`);
  endpoint.searchParams.set('app_name', AUDIUS_APP_NAME);
  return endpoint.toString();
}

function isValidHttpStreamUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || /^(blob|data|javascript):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  ) {
    return true;
  }
  return false;
}

export function isValidAudiusRedirectUrl(candidateUrl: unknown, originalEndpointUrl: string): candidateUrl is string {
  if (!isValidHttpStreamUrl(candidateUrl)) return false;
  try {
    const target = new URL(candidateUrl);
    const origin = new URL(originalEndpointUrl);
    if (target.username || target.password) return false;
    // Do not allow HTTPS endpoint to downgrade to plaintext HTTP
    if (origin.protocol === 'https:' && target.protocol !== 'https:') {
      return false;
    }
    if (target.hostname !== origin.hostname) {
      if (isPrivateOrLocalHostname(target.hostname) && !isPrivateOrLocalHostname(origin.hostname)) {
        return false;
      }
      // Redirected content node URLs on Audius resolve to /tracks/cidstream/<cid> or /tracks/<id>/stream
      const path = target.pathname;
      const matchesAudiusStreamPath =
        /^\/tracks\/cidstream\/[^/]+/i.test(path) ||
        /^\/(v1\/)?tracks\/[^/]+\/stream$/i.test(path);
      if (!matchesAudiusStreamPath) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeMimeType(contentTypeHeader: string | null): string {
  if (!contentTypeHeader) return '';
  return contentTypeHeader.split(';')[0].trim().toLowerCase();
}

function isExplicitlyRejectedMimeType(mime: string): boolean {
  if (!mime) return true;
  if (
    mime === 'application/json' ||
    mime === 'text/html' ||
    mime === 'text/plain' ||
    mime === 'application/xml' ||
    mime === 'text/xml' ||
    mime === 'application/xhtml+xml' ||
    mime.startsWith('text/') ||
    mime.startsWith('image/')
  ) {
    return true;
  }
  return false;
}

export function hasAudioMagicBytes(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 2) return false;

  // 1. ID3v2 tag ("ID3") — common MP3 container returned by Audius creatornode
  if (bytes.byteLength >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  // 2. Ogg ("OggS")
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return true;
  }
  // 3. FLAC ("fLaC")
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return true;
  }
  // 4. WAV ("RIFF....WAVE")
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return true;
  }
  // 5. AIFF ("FORM....AIFF" / "FORM....AIFC")
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x52 &&
    bytes[3] === 0x4d &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x49 &&
    bytes[10] === 0x46 &&
    (bytes[11] === 0x46 || bytes[11] === 0x43)
  ) {
    return true;
  }
  // 6. ISO BMFF / M4A / MP4 ("....ftyp")
  if (
    bytes.byteLength >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }
  // 7. Matroska / WebM EBML header (0x1A 0x45 0xDF 0xA3)
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return true;
  }
  // 8. Raw MPEG audio frame sync (MP3 without ID3) or ADTS AAC syncword
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    const versionBits = (bytes[1] >> 3) & 0x03;
    const layerBits = (bytes[1] >> 1) & 0x03;
    // MPEG-1/2/2.5 audio: versionBits !== 1, layerBits !== 0
    if (versionBits !== 0x01 && layerBits !== 0x00) {
      return true;
    }
    // ADTS AAC frame sync: 0xFFF with layer === 0
    if ((bytes[1] & 0xf6) === 0xf0) {
      return true;
    }
  }

  return false;
}

async function readPrefixBytes(res: Response, maxBytes: number = 64): Promise<Uint8Array> {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const collected = new Uint8Array(maxBytes);
    let offset = 0;
    try {
      while (offset < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value || value.byteLength === 0) break;
        const copyLen = Math.min(value.byteLength, maxBytes - offset);
        collected.set(value.subarray(0, copyLen), offset);
        offset += copyLen;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore stream cancel errors
      }
    }
    return collected.subarray(0, offset);
  }
  try {
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf.slice(0, maxBytes));
  } catch {
    return new Uint8Array(0);
  }
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
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
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

export const AudiusService = {
  async searchCatalog(
    query: string,
    options?: { baseUrl?: string; limit?: number },
  ): Promise<AudiusSearchOutcome> {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      return {
        success: true,
        candidates: [],
        rejectedReasons: [],
        hasMatchedTracks: false,
      };
    }

    const baseUrl = (options?.baseUrl || AUDIUS_API_BASE).replace(/\/+$/, '');
    const endpoint = new URL(`${baseUrl}/tracks/search`);
    endpoint.searchParams.set('query', cleanQuery);
    endpoint.searchParams.set('app_name', AUDIUS_APP_NAME);
    if (typeof options?.limit === 'number' && options.limit > 0) {
      endpoint.searchParams.set('limit', String(Math.round(options.limit)));
    }

    try {
      const res = await fetchWithTimeout(endpoint.toString());
      if (res.status === 429) {
        return {
          success: false,
          candidates: [],
          rejectedReasons: [],
          hasMatchedTracks: false,
          rateLimited: true,
          error: 'Audius API sedang membatasi permintaan (rate limit 429). Coba lagi beberapa saat.',
        };
      }
      if (!res.ok) {
        return {
          success: false,
          candidates: [],
          rejectedReasons: [],
          hasMatchedTracks: false,
          error: `Audius API Error (${res.status}): ${res.statusText || 'Gagal mencari katalog.'}`,
        };
      }

      const payload = await res.json().catch(() => null);
      const rawTracks: AudiusTrack[] = Array.isArray(payload?.data) ? payload.data : [];
      if (rawTracks.length === 0) {
        return {
          success: true,
          candidates: [],
          rejectedReasons: [],
          hasMatchedTracks: false,
        };
      }

      const candidates: AudiusAuthorizedCandidate[] = [];
      const rejectedReasons: string[] = [];

      for (const track of rawTracks) {
        const auth = evaluateAudiusTrackAuthorization(track);
        if (!auth.allowed) {
          if (auth.reason) rejectedReasons.push(auth.reason);
          continue;
        }
        candidates.push({
          track,
          title: typeof track.title === 'string' && track.title.trim() ? track.title.trim() : 'Untitled Track',
          artist: auth.attribution.rightsHolder,
          durationSec:
            typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0
              ? Math.round(track.duration)
              : 0,
          thumbnailUrl: resolveAudiusArtworkUrl(track),
          externalUrl: auth.attribution.trackUrl,
          attribution: auth.attribution,
        });
      }

      return {
        success: true,
        candidates,
        rejectedReasons,
        hasMatchedTracks: true,
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      return {
        success: false,
        candidates: [],
        rejectedReasons: [],
        hasMatchedTracks: false,
        error: isAbort
          ? 'Permintaan ke katalog Audius melebihi batas waktu.'
          : err?.message || 'Gagal terhubung ke API Audius (gangguan jaringan).',
      };
    }
  },

  async verifyAndResolveStream(
    trackId: string,
    options?: { baseUrl?: string },
  ): Promise<AudiusStreamVerificationResult> {
    const cleanId = (trackId || '').trim();
    if (!cleanId) {
      return { ok: false, error: 'ID track Audius kosong.' };
    }

    const baseUrl = (options?.baseUrl || AUDIUS_API_BASE).replace(/\/+$/, '');
    const streamEndpoint = buildAudiusStreamEndpointUrl(cleanId, baseUrl);
    if (!isValidHttpStreamUrl(streamEndpoint)) {
      return { ok: false, error: 'URL streaming Audius tidak valid.' };
    }

    try {
      let usedGetFallback = false;
      let res = await fetchWithTimeout(streamEndpoint, {
        method: 'HEAD',
        redirect: 'follow',
      });

      if (res.status === 405 || res.status === 501) {
        usedGetFallback = true;
        res = await fetchWithTimeout(streamEndpoint, {
          method: 'GET',
          headers: { Range: 'bytes=0-63' },
          redirect: 'follow',
        });
      }

      if (res.status === 429) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          rateLimited: true,
          error: 'Endpoint stream Audius sedang terkena rate limit (429).',
        };
      }

      if (!res.ok) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: `Stream audio Audius tidak tersedia (HTTP ${res.status}).`,
        };
      }

      const candidateUrl = res.url && res.url.trim() ? res.url.trim() : streamEndpoint;
      if (!isValidAudiusRedirectUrl(candidateUrl, streamEndpoint)) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: 'URL tujuan redirect stream Audius tidak valid atau tidak aman.',
        };
      }

      const mimeType = normalizeMimeType(res.headers.get('content-type'));
      if (isExplicitlyRejectedMimeType(mimeType)) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: 'Respons endpoint stream Audius bukan aliran audio yang valid.',
        };
      }

      const contentLengthHeader = res.headers.get('content-length');
      if (contentLengthHeader !== null && Number(contentLengthHeader) === 0) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: 'Respons endpoint stream Audius kosong (content-length 0).',
        };
      }

      if (mimeType.startsWith('audio/')) {
        if (usedGetFallback) {
          try {
            await res.body?.cancel();
          } catch {
            // ignore
          }
        }
        return {
          ok: true,
          streamUrl: candidateUrl,
        };
      }

      if (mimeType !== 'application/octet-stream') {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: `MIME stream Audius tidak dikenal atau tidak didukung (${mimeType || 'kosong'}).`,
        };
      }

      // Real Audius /tracks/{id}/stream often returns application/octet-stream.
      // Never accept HEAD 2xx blindly: inspect real prefix audio bytes via GET Range.
      let inspectRes = res;
      if (!usedGetFallback) {
        inspectRes = await fetchWithTimeout(candidateUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-63' },
          redirect: 'follow',
        });

        if (inspectRes.status === 429) {
          try {
            await inspectRes.body?.cancel();
          } catch {
            // ignore
          }
          return {
            ok: false,
            rateLimited: true,
            error: 'Endpoint stream Audius sedang terkena rate limit (429).',
          };
        }

        if (!inspectRes.ok) {
          try {
            await inspectRes.body?.cancel();
          } catch {
            // ignore
          }
          return {
            ok: false,
            error: `Verifikasi byte audio Audius gagal (HTTP ${inspectRes.status}).`,
          };
        }
      }

      const finalUrl = inspectRes.url && inspectRes.url.trim() ? inspectRes.url.trim() : candidateUrl;
      if (!isValidAudiusRedirectUrl(finalUrl, streamEndpoint)) {
        try {
          await inspectRes.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: 'URL tujuan redirect stream Audius tidak valid atau tidak aman.',
        };
      }

      const inspectMime = normalizeMimeType(inspectRes.headers.get('content-type'));
      if (isExplicitlyRejectedMimeType(inspectMime) || (inspectMime !== 'application/octet-stream' && !inspectMime.startsWith('audio/'))) {
        try {
          await inspectRes.body?.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          error: `Respons inspeksi stream Audius bukan audio yang valid (${inspectMime || 'kosong'}).`,
        };
      }

      const sampleBytes = await readPrefixBytes(inspectRes, 64);
      if (sampleBytes.byteLength === 0 || !hasAudioMagicBytes(sampleBytes)) {
        return {
          ok: false,
          error: 'Respons application/octet-stream Audius tidak terbukti berisi header/byte audio yang valid.',
        };
      }

      return {
        ok: true,
        streamUrl: finalUrl,
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      return {
        ok: false,
        error: isAbort
          ? 'Verifikasi stream Audius melebihi batas waktu.'
          : err?.message || 'Gagal mengakses endpoint stream Audius.',
      };
    }
  },

  async resolvePlayableTrack(
    query: string,
    options?: { baseUrl?: string },
  ): Promise<AudiusPlayableResolution> {
    const searchRes = await this.searchCatalog(query, options);
    if (!searchRes.success) {
      return {
        success: false,
        hasMatchedTracks: searchRes.hasMatchedTracks,
        rejectedReasons: searchRes.rejectedReasons,
        error: searchRes.error || 'Pencarian katalog Audius gagal.',
      };
    }

    if (!searchRes.hasMatchedTracks) {
      return {
        success: false,
        hasMatchedTracks: false,
        rejectedReasons: [],
        error: `Lagu "${query.trim()}" tidak ditemukan di katalog Audius.`,
      };
    }

    const streamErrors: string[] = [];
    for (const candidate of searchRes.candidates) {
      const streamRes = await this.verifyAndResolveStream(candidate.track.id, options);
      if (streamRes.ok && streamRes.streamUrl) {
        return {
          success: true,
          candidate,
          streamUrl: streamRes.streamUrl,
          hasMatchedTracks: true,
          rejectedReasons: searchRes.rejectedReasons,
        };
      }
      if (streamRes.error) {
        streamErrors.push(streamRes.error);
      }
    }

    const combinedErrors = [...streamErrors, ...searchRes.rejectedReasons];
    return {
      success: false,
      hasMatchedTracks: true,
      rejectedReasons: combinedErrors,
      error:
        combinedErrors[0] ||
        `Tidak ada track Audius yang lolos pemeriksaan izin dan stream untuk "${query.trim()}".`,
    };
  },

  async refreshStreamForTrackId(
    trackId: string,
    options?: { baseUrl?: string },
  ): Promise<{
    success: boolean;
    streamUrl?: string;
    candidate?: AudiusAuthorizedCandidate;
    error?: string;
  }> {
    const cleanId = (trackId || '').trim();
    if (!cleanId) {
      return { success: false, error: 'ID track Audius tidak valid.' };
    }

    const baseUrl = (options?.baseUrl || AUDIUS_API_BASE).replace(/\/+$/, '');
    const metaEndpoint = new URL(`${baseUrl}/tracks/${encodeURIComponent(cleanId)}`);
    metaEndpoint.searchParams.set('app_name', AUDIUS_APP_NAME);

    try {
      const res = await fetchWithTimeout(metaEndpoint.toString());
      if (res.status === 429) {
        return {
          success: false,
          error: 'Audius API sedang membatasi permintaan (rate limit 429).',
        };
      }
      if (!res.ok) {
        return {
          success: false,
          error: `Gagal memverifikasi ulang metadata track Audius (HTTP ${res.status}).`,
        };
      }
      const payload = await res.json().catch(() => null);
      const track: AudiusTrack | undefined =
        payload?.data && !Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload?.data)
          ? payload.data[0]
          : undefined;
      if (!track) {
        return {
          success: false,
          error: 'Metadata track Audius tidak ditemukan saat menyegarkan stream.',
        };
      }

      const auth = evaluateAudiusTrackAuthorization(track);
      if (!auth.allowed) {
        return {
          success: false,
          error: auth.reason || 'Track Audius tidak lagi memenuhi izin streaming.',
        };
      }

      const streamRes = await this.verifyAndResolveStream(cleanId, options);
      if (!streamRes.ok || !streamRes.streamUrl) {
        return {
          success: false,
          error: streamRes.error || 'Stream audio Audius tidak tersedia.',
        };
      }

      return {
        success: true,
        streamUrl: streamRes.streamUrl,
        candidate: {
          track,
          title: typeof track.title === 'string' && track.title.trim() ? track.title.trim() : 'Untitled Track',
          artist: auth.attribution.rightsHolder,
          durationSec:
            typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0
              ? Math.round(track.duration)
              : 0,
          thumbnailUrl: resolveAudiusArtworkUrl(track),
          externalUrl: auth.attribution.trackUrl,
          attribution: auth.attribution,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Gagal menyegarkan sumber stream Audius.',
      };
    }
  },
};
