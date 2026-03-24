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
    throw new Error(`Spotify ${path} failed: ${res.status}`);
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

// ─── Mood search queries ──────────────────────────────────────────────────────

const MOOD_QUERY_SUFFIX: Record<string, string> = {
  happy:   'upbeat feel good',
  neutral: 'chill easy',
  stressed:'calm relaxing acoustic',
  angry:   'calm soothing mellow',
  sad:     'melancholy emotional',
  sleepy:  'slow ambient gentle',
};

const MOOD_GENRE_FALLBACK: Record<string, string[]> = {
  happy:   ['genre:pop upbeat', 'genre:dance feel good', 'happy hits'],
  neutral: ['genre:indie chill', 'lo-fi easy listening', 'genre:pop mellow'],
  stressed:['genre:ambient calm', 'acoustic peaceful', 'piano relax'],
  angry:   ['genre:soul soothing', 'acoustic calm', 'genre:folk gentle'],
  sad:     ['genre:indie sad', 'emotional ballads', 'genre:singer-songwriter melancholy'],
  sleepy:  ['genre:ambient sleep', 'gentle piano classical', 'lo-fi sleep'],
};

// ─── Taste-aware mood recommendations ────────────────────────────────────────

export async function getMoodRecommendations(
  token: string,
  mood: string,
  limit = 20,
): Promise<{ tracks: SpotifyTrack[]; personalized: boolean }> {
  const suffix = MOOD_QUERY_SUFFIX[mood] ?? '';

  let topArtists: TopArtist[] = [];
  let topTracksItems: TopTrack[] = [];

  try {
    const [ar, tr] = await Promise.all([getTopArtists(token), getTopTracks(token)]);
    topArtists     = ar.items ?? [];
    topTracksItems = tr.items ?? [];
  } catch {
    // fall through to genre fallback
  }

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

  const personalized = topArtists.length > 0 || topTracksItems.length > 0;

  if (personalized) {
    const shuffledArtists = [...topArtists].sort(() => Math.random() - 0.5).slice(0, 3);
    const artistQueries   = shuffledArtists.map(a => `artist:"${a.name}" ${suffix}`);

    const allGenres    = topArtists.flatMap(a => a.genres ?? []);
    const uniqueGenres = [...new Set(allGenres)].slice(0, 4);
    const genreQueries = uniqueGenres.map(g => `genre:"${g}" ${suffix}`);

    const shuffledTracks = [...topTracksItems].sort(() => Math.random() - 0.5).slice(0, 2);
    const trackQueries   = shuffledTracks.map(t => `"${t.artists[0]?.name ?? ''}" ${suffix}`);

    const allQueries = [...artistQueries, ...genreQueries, ...trackQueries];
    const perQuery   = Math.ceil(limit / allQueries.length) + 2;

    const results = await Promise.allSettled(
      allQueries.map(q => searchTracks(token, q, perQuery)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') addTracks(r.value?.tracks?.items ?? []);
      if (tracks.length >= limit) break;
    }
  }

  if (tracks.length < limit) {
    const fallbackQueries = MOOD_GENRE_FALLBACK[mood] ?? MOOD_GENRE_FALLBACK['neutral'];
    const needed   = limit - tracks.length;
    const perQuery = Math.ceil(needed / fallbackQueries.length) + 2;

    const results = await Promise.allSettled(
      fallbackQueries.map(q => searchTracks(token, q, perQuery)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') addTracks(r.value?.tracks?.items ?? []);
      if (tracks.length >= limit) break;
    }
  }

  return { tracks, personalized };
}

// ─── Playback ─────────────────────────────────────────────────────────────────

// Opens a single track in the Spotify app via deep link
export function openTrackInSpotify(track: SpotifyTrack) {
  const spotifyUri = track.uri; // e.g. spotify:track:4iV5W9uYEdYUVa79Axb7Rh
  const fallbackUrl = track.external_urls.spotify;
  // Try Spotify app deep link first, fall back to web URL
  return { spotifyUri, fallbackUrl };
}

// Add a single track to Spotify queue (requires user-modify-playback-state scope)
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

// Queue all tracks and open Spotify — best effort, gracefully handles failures
export async function queueAllTracks(
  token: string,
  tracks: SpotifyTrack[],
): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;

  // Queue tracks sequentially with small delay to avoid rate limiting
  for (const track of tracks) {
    const success = await addToQueue(token, track.uri);
    if (success) queued++;
    else failed++;
    // Small delay between queue calls
    await new Promise(r => setTimeout(r, 150));
  }

  return { queued, failed };
}