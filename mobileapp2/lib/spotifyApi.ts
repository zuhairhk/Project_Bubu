const BASE_URL = 'https://api.spotify.com/v1';

async function spotifyFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Spotify ${path} failed ${res.status}:`, body);
    throw new Error(`${res.status}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ─── Basic endpoints ──────────────────────────────────────────────────────────

export const getTopArtists = (token: string) =>
  spotifyFetch('/me/top/artists?limit=20&time_range=medium_term', token);

export const getTopTracks = (token: string) =>
  spotifyFetch('/me/top/tracks?limit=20&time_range=medium_term', token);

export async function searchTracks(token: string, query: string, limit = 10) {
  const encoded = encodeURIComponent(query);
  return spotifyFetch(`/search?q=${encoded}&type=track&limit=${limit}`, token);
}

export async function getUserProfile(token: string): Promise<{ id: string; display_name: string }> {
  return spotifyFetch('/me', token);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpotifyTrack = {
  id:      string;
  uri:     string;
  name:    string;
  artists: { name: string }[];
  album:   { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
};

type TopArtist = { id: string; name: string; genres: string[] };
type TopTrack  = { id: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; uri: string };

// ─── Module-level cache for top artists/tracks ────────────────────────────────
// Fetched once per token — avoids re-fetching on every mood prediction call.
let cachedToken:   string | null = null;
let cachedArtists: TopArtist[]   = [];
let cachedTracks:  TopTrack[]    = [];

async function getCachedUserTaste(token: string): Promise<{ artists: TopArtist[]; tracks: TopTrack[] }> {
  if (token === cachedToken && cachedArtists.length > 0) {
    return { artists: cachedArtists, tracks: cachedTracks };
  }
  try {
    const [ar, tr] = await Promise.all([getTopArtists(token), getTopTracks(token)]);
    cachedToken   = token;
    cachedArtists = ar.items ?? [];
    cachedTracks  = tr.items ?? [];
  } catch {
    // Fall through — returns empty arrays, triggers genre fallback
  }
  return { artists: cachedArtists, tracks: cachedTracks };
}

// ─── Mood search config ───────────────────────────────────────────────────────

const MOOD_SUFFIX: Record<string, string> = {
  happy:   'upbeat feel good',
  neutral: 'chill easy',
  stressed:'calm relaxing acoustic',
  angry:   'calm soothing mellow',
  sad:     'melancholy emotional',
  sleepy:  'slow ambient gentle',
};

// Only 2 fallback queries per mood — was 3, causing 429s with nothing to show
const MOOD_FALLBACK: Record<string, string[]> = {
  happy:   ['happy pop upbeat', 'feel good dance'],
  neutral: ['indie chill lo-fi', 'pop mellow easy'],
  stressed:['acoustic peaceful calm', 'piano relax ambient'],
  angry:   ['soul soothing calm', 'folk gentle acoustic'],
  sad:     ['indie sad emotional', 'singer-songwriter melancholy'],
  sleepy:  ['ambient sleep gentle', 'lo-fi piano slow'],
};

// ─── Recommendation cache ─────────────────────────────────────────────────────
// Caches the result per mood so repeated calls (e.g. from re-renders) are free.
const recCache = new Map<string, { tracks: SpotifyTrack[]; personalized: boolean; ts: number }>();
const REC_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Taste-aware mood recommendations ────────────────────────────────────────

export async function getMoodRecommendations(
  token: string,
  mood: string,
  limit = 20,
): Promise<{ tracks: SpotifyTrack[]; personalized: boolean }> {

  // Return cached result if fresh
  const cacheKey = `${token.slice(-8)}_${mood}_${limit}`;
  const cached   = recCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < REC_CACHE_TTL_MS) {
    console.log('[Spotify] Using cached recs for', mood);
    return { tracks: cached.tracks, personalized: cached.personalized };
  }

  const suffix = MOOD_SUFFIX[mood] ?? '';
  const { artists: topArtists, tracks: topTracksItems } = await getCachedUserTaste(token);

  const seen   = new Set<string>();
  const tracks: SpotifyTrack[] = [];

  const addTracks = (items: SpotifyTrack[]) => {
    for (const t of items) {
      if (!seen.has(t.id) && tracks.length < limit) {
        seen.add(t.id);
        tracks.push(t);
      }
    }
  };

  const personalized = topArtists.length > 0;

  if (personalized) {
    // Pick 2 artists + 1 genre query — max 3 search calls when personalized
    const pickedArtists = [...topArtists]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);

    const allGenres    = topArtists.flatMap(a => a.genres ?? []);
    const uniqueGenres = [...new Set(allGenres)];
    const pickedGenre  = uniqueGenres[Math.floor(Math.random() * uniqueGenres.length)];

    const queries = [
      ...pickedArtists.map(a => `artist:"${a.name}" ${suffix}`),
      ...(pickedGenre ? [`genre:"${pickedGenre}" ${suffix}`] : []),
    ];

    const perQuery = Math.ceil(limit / queries.length) + 2;

    // Sequential with small gap to avoid burst 429s
    for (const q of queries) {
      if (tracks.length >= limit) break;
      try {
        const res = await searchTracks(token, q, perQuery);
        addTracks(res?.tracks?.items ?? []);
      } catch (e: any) {
        if (e?.message?.includes('429')) {
          console.warn('[Spotify] Rate limited on personalized query — skipping rest');
          break;
        }
      }
      if (tracks.length < limit) await delay(200);
    }
  }

  // Fill remaining slots with fallback genre queries (max 2 calls)
  if (tracks.length < limit) {
    const fallbacks = MOOD_FALLBACK[mood] ?? MOOD_FALLBACK['neutral'];
    const needed    = limit - tracks.length;
    const perQuery  = Math.ceil(needed / fallbacks.length) + 2;

    for (const q of fallbacks) {
      if (tracks.length >= limit) break;
      try {
        const res = await searchTracks(token, q, perQuery);
        addTracks(res?.tracks?.items ?? []);
      } catch (e: any) {
        if (e?.message?.includes('429')) {
          console.warn('[Spotify] Rate limited on fallback query — stopping');
          break;
        }
      }
      if (tracks.length < limit) await delay(200);
    }
  }

  const result = { tracks, personalized };
  recCache.set(cacheKey, { ...result, ts: Date.now() });
  return result;
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

// ─── Playback ─────────────────────────────────────────────────────────────────

export function openTrackInSpotify(track: SpotifyTrack) {
  return { spotifyUri: track.uri, fallbackUrl: track.external_urls.spotify };
}

export async function addToQueue(token: string, trackUri: string): Promise<boolean> {
  try {
    await spotifyFetch(`/me/player/queue?uri=${encodeURIComponent(trackUri)}`, token, {
      method: 'POST',
    });
    return true;
  } catch {
    return false;
  }
}

export async function queueAllTracks(
  token: string,
  tracks: SpotifyTrack[],
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;
  for (const track of tracks) {
    const success = await addToQueue(token, track.uri);
    if (success) queued++;
    else failed++;
    await delay(150);
  }
  return { queued, failed };
}