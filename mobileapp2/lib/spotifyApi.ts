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
  if (res.status === 204) return null;
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

// ─── Now Playing ─────────────────────────────────────────────────────────────

export type NowPlaying = {
  isPlaying:   boolean;
  songTitle:   string;
  artistName:  string;
  albumArt:    string | null;
  progressMs:  number;
  durationMs:  number;
  trackUri:    string;
  trackId:     string;
};

export async function getNowPlaying(token: string): Promise<NowPlaying | null> {
  try {
    const data = await spotifyFetch('/me/player/currently-playing', token);
    if (!data || !data.item) return null;
    const track = data.item;
    return {
      isPlaying:  data.is_playing ?? false,
      songTitle:  track.name ?? '',
      artistName: (track.artists ?? []).map((a: any) => a.name).join(', '),
      albumArt:   track.album?.images?.[0]?.url ?? null,
      progressMs: data.progress_ms ?? 0,
      durationMs: track.duration_ms ?? 0,
      trackUri:   track.uri ?? '',
      trackId:    track.id ?? '',
    };
  } catch {
    return null;
  }
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
type TopTrack  = { id: string; uri: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; external_urls: { spotify: string } };

// ─── Module-level cache for top taste data ────────────────────────────────────
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
    // Returns empty arrays, triggers genre fallback below
  }
  return { artists: cachedArtists, tracks: cachedTracks };
}

// ─── Mood → audio feature targets ────────────────────────────────────────────
// Used to FILTER the user's top tracks by how well they match the mood,
// not to search generically. We score each track's audio features against
// these targets and pick the best-matching ones.
const MOOD_TARGETS: Record<string, { minEnergy?: number; maxEnergy?: number; minValence?: number; maxValence?: number; minTempo?: number; maxTempo?: number }> = {
  happy:   { minEnergy: 0.6,  minValence: 0.6 },
  neutral: { minEnergy: 0.3,  maxEnergy: 0.7,  minValence: 0.3, maxValence: 0.7 },
  stressed:{ maxEnergy: 0.5,  maxValence: 0.5 },  // calm the user down
  angry:   { maxEnergy: 0.5,  minValence: 0.3 },  // soothe, not amplify
  sad:     { maxEnergy: 0.45, maxValence: 0.45 },
  sleepy:  { maxEnergy: 0.35, maxTempo: 100 },
};

// Fallback genre searches used only when the user has no top artists
const MOOD_GENRE_FALLBACK: Record<string, string[]> = {
  happy:   ['pop happy upbeat', 'dance feel good'],
  neutral: ['indie chill pop', 'lo-fi easy listening'],
  stressed:['acoustic piano calm', 'ambient peaceful'],
  angry:   ['soul soothing', 'folk mellow acoustic'],
  sad:     ['indie sad', 'singer-songwriter emotional'],
  sleepy:  ['ambient sleep', 'lo-fi slow piano'],
};

// ─── Recommendation cache ─────────────────────────────────────────────────────
const recCache = new Map<string, { tracks: SpotifyTrack[]; ts: number }>();
const REC_CACHE_TTL_MS = 10 * 60 * 1000;

// ─── Audio features fetch ─────────────────────────────────────────────────────
async function getAudioFeatures(token: string, trackIds: string[]): Promise<Map<string, any>> {
  if (trackIds.length === 0) return new Map();
  try {
    const ids = trackIds.slice(0, 100).join(',');
    const data = await spotifyFetch(`/audio-features?ids=${ids}`, token);
    const map = new Map<string, any>();
    for (const f of (data?.audio_features ?? [])) {
      if (f?.id) map.set(f.id, f);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ─── Score how well a track's audio features match the mood ──────────────────
function moodScore(features: any, mood: string): number {
  if (!features) return 0;
  const target = MOOD_TARGETS[mood];
  if (!target) return 1;
  let score = 1;
  const { energy, valence, tempo } = features;
  if (target.minEnergy !== undefined && energy < target.minEnergy) score -= (target.minEnergy - energy);
  if (target.maxEnergy !== undefined && energy > target.maxEnergy) score -= (energy - target.maxEnergy);
  if (target.minValence !== undefined && valence < target.minValence) score -= (target.minValence - valence);
  if (target.maxValence !== undefined && valence > target.maxValence) score -= (valence - target.maxValence);
  if (target.minTempo !== undefined && tempo < target.minTempo) score -= (target.minTempo - tempo) / 200;
  if (target.maxTempo !== undefined && tempo > target.maxTempo) score -= (tempo - target.maxTempo) / 200;
  return Math.max(0, score);
}

// ─── Main recommendation function ────────────────────────────────────────────
/**
 * Strategy:
 * 1. Fetch user's top artists and top tracks
 * 2. For each top artist, search for their tracks (just the artist name, no mood keywords)
 * 3. Fetch audio features for all candidate tracks
 * 4. Score + sort by how well the audio features match the target mood
 * 5. Fill remaining slots from user's actual top tracks that match the mood
 * 6. Only fall back to genre search if the user has no top artists at all
 */
export async function getMoodRecommendations(
  token: string,
  mood: string,
  limit = 20,
): Promise<{ tracks: SpotifyTrack[]; personalized: boolean }> {

  const cacheKey = `${token.slice(-8)}_${mood}_${limit}`;
  const cached   = recCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < REC_CACHE_TTL_MS) {
    console.log('[Spotify] Cache hit for', mood);
    return { tracks: cached.tracks, personalized: true };
  }

  const { artists: topArtists, tracks: topTracks } = await getCachedUserTaste(token);
  const personalized = topArtists.length > 0;

  const seen   = new Set<string>();
  const candidates: SpotifyTrack[] = [];

  const addTracks = (items: SpotifyTrack[]) => {
    for (const t of items) {
      if (t?.id && !seen.has(t.id)) {
        seen.add(t.id);
        candidates.push(t);
      }
    }
  };

  if (personalized) {
    // Search by artist name only — clean, targeted, no random keyword noise
    const shuffledArtists = [...topArtists].sort(() => Math.random() - 0.5).slice(0, 6);
    for (const artist of shuffledArtists) {
      try {
        const res = await searchTracks(token, `artist:"${artist.name}"`, 10);
        addTracks(res?.tracks?.items ?? []);
      } catch (e: any) {
        if (e?.message?.includes('429')) { console.warn('[Spotify] Rate limited'); break; }
      }
      if (candidates.length >= limit * 3) break; // Enough candidates to score
      await delay(150);
    }

    // Also include the user's own top tracks as candidates
    addTracks(topTracks as SpotifyTrack[]);
  }

  // Fall back to genre search if no taste data
  if (candidates.length < limit) {
    const fallbacks = MOOD_GENRE_FALLBACK[mood] ?? MOOD_GENRE_FALLBACK['neutral'];
    for (const q of fallbacks) {
      if (candidates.length >= limit * 2) break;
      try {
        const res = await searchTracks(token, q, 10);
        addTracks(res?.tracks?.items ?? []);
      } catch (e: any) {
        if (e?.message?.includes('429')) break;
      }
      await delay(150);
    }
  }

  // Fetch audio features for all candidates and score them
  const candidateIds = candidates.map(t => t.id);
  const featuresMap  = await getAudioFeatures(token, candidateIds);

  const scored = candidates
    .map(t => ({ track: t, score: moodScore(featuresMap.get(t.id), mood) }))
    .sort((a, b) => b.score - a.score);

  // Take top scoring tracks up to limit, shuffle slightly within score tiers
  // so the list doesn't feel identical every time
  const topScored = scored.slice(0, limit * 2);
  const tierSize  = Math.ceil(topScored.length / 4);
  const shuffled: SpotifyTrack[] = [];
  for (let i = 0; i < topScored.length; i += tierSize) {
    const tier = topScored.slice(i, i + tierSize).sort(() => Math.random() - 0.5);
    shuffled.push(...tier.map(s => s.track));
  }

  const result = shuffled.slice(0, limit);
  recCache.set(cacheKey, { tracks: result, ts: Date.now() });
  return { tracks: result, personalized };
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
    await spotifyFetch(`/me/player/queue?uri=${encodeURIComponent(trackUri)}`, token, { method: 'POST' });
    return true;
  } catch { return false; }
}

export async function queueAllTracks(
  token: string,
  tracks: SpotifyTrack[],
): Promise<{ queued: number; failed: number }> {
  let queued = 0, failed = 0;
  for (const track of tracks) {
    const success = await addToQueue(token, track.uri);
    if (success) queued++; else failed++;
    await delay(150);
  }
  return { queued, failed };
}