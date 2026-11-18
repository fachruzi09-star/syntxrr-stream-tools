// tiktokAuthService.ts
// Pengelolaan alur autentikasi resmi TikTok Login Kit / OAuth v2 + PKCE untuk SYNTXRR STREAM.
//
// Prinsip keamanan & kejujuran:
// - Tidak pernah menanam client_secret, access_token, atau refresh_token di source Android/Web.
// - Tidak pernah meminta password TikTok pengguna atau mengambil cookie sesi lewat WebView/Accessibility.
// - Pertukaran authorization code -> token & profil dilakukan hanya lewat backend exchange URL terkonfigurasi.
// - Tidak pernah membuat status Terhubung (linked) palsu jika konfigurasi developer / backend belum tersedia.
// - Hanya mengisi username apabila scope "user.info.profile" disetujui dan server mengembalikannya.

import type { TikTokAccountState } from '../types';

export const TIKTOK_AUTHORIZE_ENDPOINT = 'https://www.tiktok.com/v2/auth/authorize/';
export const DEFAULT_TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile'] as const;
const PKCE_SESSION_KEY = 'syntxrr_tiktok_pkce_pending_v1';
const PKCE_TTL_MS = 10 * 60 * 1000;

export interface TikTokAuthConfiguration {
  clientKey: string;
  redirectUri: string;
  tokenExchangeUrl: string;
  requestedScopes: string[];
  androidOpenSdkConfigured: boolean;
  manifestRedirectConfigured: boolean;
  isWebOAuthReady: boolean;
  missingRequirements: string[];
}

export interface PendingPkceTransaction {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  requestedScopes: string[];
  createdAt: number;
}

export interface VerifiedTikTokProfileResponse {
  open_id?: string;
  openId?: string;
  username?: string;
  display_name?: string;
  displayName?: string;
  avatar_url?: string;
  avatarUrl?: string;
  scope?: string | string[];
  grantedScopes?: string[];
  error?: string;
  message?: string;
}

export type TikTokAuthStartResult =
  | {
      started: true;
      authorizeUrl: string;
      state: string;
      message: string;
    }
  | {
      started: false;
      errorCode: 'OAUTH_NOT_CONFIGURED' | 'CRYPTO_UNAVAILABLE' | 'POPUP_BLOCKED';
      message: string;
      missingRequirements: string[];
    };

export type TikTokAuthCallbackResult =
  | {
      success: true;
      profile: {
        openId: string;
        username?: string;
        displayName?: string;
        avatarUrl?: string;
        grantedScopes: string[];
        authorizedAt: number;
      };
    }
  | {
      success: false;
      errorCode:
        | 'STATE_MISMATCH'
        | 'NO_PENDING_AUTH'
        | 'EXPIRED_AUTH'
        | 'PROVIDER_DENIED'
        | 'MISSING_CODE'
        | 'EXCHANGE_ENDPOINT_MISSING'
        | 'EXCHANGE_FAILED'
        | 'INVALID_PROFILE';
      message: string;
    };

function readViteEnv(name: string): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env;
    const val = metaEnv?.[name];
    return typeof val === 'string' ? val.trim() : '';
  } catch {
    return '';
  }
}

export function parseScopeList(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim()).filter(Boolean);
  }
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isScopeGrantingUsername(scopes: readonly string[]): boolean {
  return scopes.includes('user.info.profile');
}

export function getTikTokAuthConfiguration(): TikTokAuthConfiguration {
  const clientKey = readViteEnv('VITE_TIKTOK_CLIENT_KEY');
  const redirectUri = readViteEnv('VITE_TIKTOK_REDIRECT_URI');
  const tokenExchangeUrl = readViteEnv('VITE_TIKTOK_AUTH_EXCHANGE_URL');
  const envScopes = parseScopeList(readViteEnv('VITE_TIKTOK_SCOPES'));
  const requestedScopes = envScopes.length > 0 ? envScopes : [...DEFAULT_TIKTOK_SCOPES];

  // AndroidManifest.xml & build.gradle adalah file terlindungi pada tahap ini;
  // keduanya belum memuat OpenSDK auth dependency maupun intent-filter deep link TikTok.
  const androidOpenSdkConfigured = false;
  const manifestRedirectConfigured = false;

  const missingRequirements: string[] = [];
  if (!clientKey) {
    missingRequirements.push(
      'Client Key SYNTXRR dari TikTok Developer Portal belum dikonfigurasi (VITE_TIKTOK_CLIENT_KEY).'
    );
  }
  if (!redirectUri) {
    missingRequirements.push(
      'Redirect URI / callback terdaftar belum dikonfigurasi (VITE_TIKTOK_REDIRECT_URI).'
    );
  }
  if (!tokenExchangeUrl) {
    missingRequirements.push(
      'Backend pertukaran authorization code -> access token & /v2/user/info/ belum tersedia (VITE_TIKTOK_AUTH_EXCHANGE_URL).'
    );
  }
  if (!androidOpenSdkConfigured || !manifestRedirectConfigured) {
    missingRequirements.push(
      'Build Android saat ini belum memasang TikTok OpenSDK/Login Kit di build.gradle dan intent-filter redirect URI di AndroidManifest.xml (file terlindungi).'
    );
  }

  return {
    clientKey,
    redirectUri,
    tokenExchangeUrl,
    requestedScopes,
    androidOpenSdkConfigured,
    manifestRedirectConfigured,
    isWebOAuthReady: Boolean(clientKey && redirectUri && tokenExchangeUrl),
    missingRequirements,
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string; state: string }> {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues || !crypto.subtle) {
    throw new Error('CRYPTO_UNAVAILABLE');
  }
  const verifierBytes = new Uint8Array(32);
  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(verifierBytes);
  crypto.getRandomValues(stateBytes);

  const verifier = base64UrlEncode(verifierBytes);
  const state = base64UrlEncode(stateBytes);
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = base64UrlEncode(new Uint8Array(digest));

  return { verifier, challenge, state };
}

let inMemoryPendingPkce: PendingPkceTransaction | null = null;

export function savePendingPkce(tx: PendingPkceTransaction): void {
  inMemoryPendingPkce = tx;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PKCE_SESSION_KEY, JSON.stringify(tx));
    }
  } catch {
    // Abaikan jika sessionStorage tidak tersedia
  }
}

export function loadPendingPkce(): PendingPkceTransaction | null {
  if (inMemoryPendingPkce) return inMemoryPendingPkce;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(PKCE_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingPkceTransaction;
        if (parsed && typeof parsed.state === 'string' && typeof parsed.codeVerifier === 'string') {
          inMemoryPendingPkce = parsed;
          return parsed;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function clearPendingPkce(): void {
  inMemoryPendingPkce = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PKCE_SESSION_KEY);
    }
  } catch {
    // Abaikan
  }
}

export function buildTikTokAuthorizeUrl(params: {
  clientKey: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_key: params.clientKey,
    scope: params.scopes.join(','),
    response_type: 'code',
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${TIKTOK_AUTHORIZE_ENDPOINT}?${query.toString()}`;
}

export async function startTikTokOAuthLogin(
  configOverride?: TikTokAuthConfiguration
): Promise<TikTokAuthStartResult> {
  const config = configOverride ?? getTikTokAuthConfiguration();

  if (!config.isWebOAuthReady) {
    return {
      started: false,
      errorCode: 'OAUTH_NOT_CONFIGURED',
      message:
        'Login resmi dengan TikTok belum dapat dijalankan karena konfigurasi developer SYNTXRR dan backend exchange belum tersedia.',
      missingRequirements: config.missingRequirements,
    };
  }

  let pkce: { verifier: string; challenge: string; state: string };
  try {
    pkce = await createPkcePair();
  } catch {
    return {
      started: false,
      errorCode: 'CRYPTO_UNAVAILABLE',
      message: 'Web Crypto API tidak tersedia untuk membuat PKCE S256.',
      missingRequirements: [],
    };
  }

  savePendingPkce({
    state: pkce.state,
    codeVerifier: pkce.verifier,
    redirectUri: config.redirectUri,
    requestedScopes: config.requestedScopes,
    createdAt: Date.now(),
  });

  const authorizeUrl = buildTikTokAuthorizeUrl({
    clientKey: config.clientKey,
    redirectUri: config.redirectUri,
    scopes: config.requestedScopes,
    state: pkce.state,
    codeChallenge: pkce.challenge,
  });

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    // Buka langsung URL penyedia OAuth TikTok (sesuai aturan iframe AI Studio & PKCE)
    const popup = window.open(authorizeUrl, 'tiktok_oauth_authorize', 'width=540,height=720');
    if (!popup) {
      clearPendingPkce();
      return {
        started: false,
        errorCode: 'POPUP_BLOCKED',
        message: 'Jendela autentikasi TikTok diblokir sistem/browser. Izinkan pembukaan jendela luar lalu coba lagi.',
        missingRequirements: [],
      };
    }
  }

  return {
    started: true,
    authorizeUrl,
    state: pkce.state,
    message: 'Menunggu persetujuan login di halaman resmi TikTok...',
  };
}

export type AuthCodeExchangeFn = (payload: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
}) => Promise<VerifiedTikTokProfileResponse>;

export async function handleTikTokAuthCallbackUrl(
  callbackUrl: string,
  options?: {
    config?: TikTokAuthConfiguration;
    exchangeFn?: AuthCodeExchangeFn;
    nowMs?: number;
  }
): Promise<TikTokAuthCallbackResult> {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    return {
      success: false,
      errorCode: 'MISSING_CODE',
      message: 'URL callback autentikasi TikTok tidak valid.',
    };
  }

  const errorParam = parsed.searchParams.get('error');
  const errorDesc = parsed.searchParams.get('error_description');
  if (errorParam) {
    clearPendingPkce();
    return {
      success: false,
      errorCode: 'PROVIDER_DENIED',
      message: errorDesc || `Otorisasi TikTok dibatalkan atau ditolak (${errorParam}).`,
    };
  }

  const pending = loadPendingPkce();
  if (!pending) {
    return {
      success: false,
      errorCode: 'NO_PENDING_AUTH',
      message: 'Tidak ada sesi login TikTok yang sedang menunggu callback.',
    };
  }

  const now = options?.nowMs ?? Date.now();
  if (now - pending.createdAt > PKCE_TTL_MS) {
    clearPendingPkce();
    return {
      success: false,
      errorCode: 'EXPIRED_AUTH',
      message: 'Sesi login TikTok telah kedaluwarsa. Silakan ulangi login.',
    };
  }

  const returnedState = parsed.searchParams.get('state') || '';
  if (!returnedState || returnedState !== pending.state) {
    clearPendingPkce();
    return {
      success: false,
      errorCode: 'STATE_MISMATCH',
      message: 'Validasi state OAuth PKCE tidak cocok. Autentikasi ditolak demi keamanan.',
    };
  }

  const code = (parsed.searchParams.get('code') || '').trim();
  if (!code) {
    clearPendingPkce();
    return {
      success: false,
      errorCode: 'MISSING_CODE',
      message: 'Callback autentikasi tidak menyertakan authorization code.',
    };
  }

  const config = options?.config ?? getTikTokAuthConfiguration();
  const exchangeFn = options?.exchangeFn;
  if (!exchangeFn && !config.tokenExchangeUrl) {
    clearPendingPkce();
    return {
      success: false,
      errorCode: 'EXCHANGE_ENDPOINT_MISSING',
      message:
        'Authorization code diterima, namun backend pertukaran token (VITE_TIKTOK_AUTH_EXCHANGE_URL) belum dikonfigurasi.',
    };
  }

  try {
    const profileResp = exchangeFn
      ? await exchangeFn({
          code,
          codeVerifier: pending.codeVerifier,
          redirectUri: pending.redirectUri,
          state: returnedState,
        })
      : await postAuthCodeToBackend(config.tokenExchangeUrl, {
          code,
          codeVerifier: pending.codeVerifier,
          redirectUri: pending.redirectUri,
          state: returnedState,
        });

    clearPendingPkce();

    if (profileResp.error) {
      return {
        success: false,
        errorCode: 'EXCHANGE_FAILED',
        message: profileResp.message || `Pertukaran authorization code gagal (${profileResp.error}).`,
      };
    }

    const openId = (profileResp.openId || profileResp.open_id || '').trim();
    if (!openId) {
      return {
        success: false,
        errorCode: 'INVALID_PROFILE',
        message: 'Backend pertukaran token tidak mengembalikan open_id akun TikTok yang terverifikasi.',
      };
    }

    const grantedScopes = parseScopeList(profileResp.grantedScopes ?? profileResp.scope);
    const effectiveScopes = grantedScopes.length > 0 ? grantedScopes : [];
    const hasProfileScope = isScopeGrantingUsername(effectiveScopes);

    const rawUsername = typeof profileResp.username === 'string'
      ? profileResp.username.trim().replace(/^@+/, '')
      : '';

    const displayName = (profileResp.displayName || profileResp.display_name || '').trim() || undefined;
    const avatarUrlRaw = (profileResp.avatarUrl || profileResp.avatar_url || '').trim();
    const avatarUrl = /^https?:\/\//i.test(avatarUrlRaw) ? avatarUrlRaw : undefined;

    return {
      success: true,
      profile: {
        openId,
        // Hanya simpan username apabila scope user.info.profile benar-benar disetujui dan server mengembalikannya
        username: hasProfileScope && rawUsername ? rawUsername : undefined,
        displayName,
        avatarUrl,
        grantedScopes: effectiveScopes,
        authorizedAt: now,
      },
    };
  } catch (err) {
    clearPendingPkce();
    return {
      success: false,
      errorCode: 'EXCHANGE_FAILED',
      message:
        err instanceof Error && err.message
          ? `Gagal memverifikasi otorisasi TikTok melalui backend: ${err.message}`
          : 'Gagal memverifikasi otorisasi TikTok melalui backend.',
    };
  }
}

async function postAuthCodeToBackend(
  exchangeUrl: string,
  payload: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    state: string;
  }
): Promise<VerifiedTikTokProfileResponse> {
  const response = await fetch(exchangeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      code: payload.code,
      code_verifier: payload.codeVerifier,
      redirect_uri: payload.redirectUri,
      state: payload.state,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as VerifiedTikTokProfileResponse;
}

export function applyVerifiedProfileToAccountState(
  current: TikTokAccountState,
  profile: Extract<TikTokAuthCallbackResult, { success: true }>['profile']
): TikTokAccountState {
  return {
    ...current,
    isLinked: true,
    openId: profile.openId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    accountLinkStatus: 'linked',
    lastSuccessfulAuthorization: profile.authorizedAt,
    grantedScopes: profile.grantedScopes,
    linkErrorMessage: undefined,
  };
}

export function maskApiKeyPreview(apiKey?: string): string {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}
