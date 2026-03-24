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
  if (!res.ok) throw new Error(`Spotify ${path} failed: ${res.status}`);
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

// ─── Mood query modifiers ─────────────────────────────────────────────────────
// These are appended to artist/track names to bias search toward a mood vibe.
// For stressed/angry we COUNTER the mood (calming music to decompress).

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

  // Step 1: Try to get user's top artists and tracks
  let topArtists: TopArtist[] = [];
  let topTracksItems: TopTrack[] = [];

  try {
    const [ar, tr] = await Promise.all([
      getTopArtists(token),
      getTopTracks(token),
    ]);
    topArtists     = ar.items ?? [];
    topTracksItems = tr.items ?? [];
  } catch {
    // Fall through to genre-based fallback
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
    // Step 2a: Search using user's favourite artists + mood suffix
    // Pick 3 random top artists so playlist varies each time
    const shuffledArtists = [...topArtists].sort(() => Math.random() - 0.5).slice(0, 3);
    const artistQueries   = shuffledArtists.map(a => `artist:"${a.name}" ${suffix}`);

    // Step 2b: Search using genres from user's top artists
    const allGenres = topArtists.flatMap(a => a.genres ?? []);
    const uniqueGenres = [...new Set(allGenres)].slice(0, 4);
    const genreQueries = uniqueGenres.map(g => `genre:"${g}" ${suffix}`);

    // Step 2c: Search similar to user's top tracks
    const shuffledTracks  = [...topTracksItems].sort(() => Math.random() - 0.5).slice(0, 2);
    const trackQueries    = shuffledTracks.map(
      t => `"${t.artists[0]?.name ?? ''}" ${suffix}`,
    );

    // Run all queries in parallel, 6-8 tracks each
    const allQueries = [...artistQueries, ...genreQueries, ...trackQueries];
    const perQuery   = Math.ceil(limit / allQueries.length) + 2;

    const results = await Promise.allSettled(
      allQueries.map(q => searchTracks(token, q, perQuery)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        addTracks(r.value?.tracks?.items ?? []);
      }
      if (tracks.length >= limit) break;
    }
  }

  // Step 3: If not enough tracks (no top data or sparse results), use genre fallback
  if (tracks.length < limit) {
    const fallbackQueries = MOOD_GENRE_FALLBACK[mood] ?? MOOD_GENRE_FALLBACK['neutral'];
    const needed = limit - tracks.length;
    const perQuery = Math.ceil(needed / fallbackQueries.length) + 2;

    const results = await Promise.allSettled(
      fallbackQueries.map(q => searchTracks(token, q, perQuery)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        addTracks(r.value?.tracks?.items ?? []);
      }
      if (tracks.length >= limit) break;
    }
  }

  return { tracks, personalized };
}

// ─── Playlist creation ────────────────────────────────────────────────────────

export async function createPlaylist(
  token: string,
  userId: string,
  name: string,
  description = '',
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return spotifyFetch(`/users/${userId}/playlists`, token, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
}

export async function addTracksToPlaylist(
  token: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  await spotifyFetch(`/playlists/${playlistId}/tracks`, token, {
    method: 'POST',
    body: JSON.stringify({ uris }),
  });
}

// ─── Full generate flow ───────────────────────────────────────────────────────

export async function generateMoodPlaylist(
  token: string,
  mood: string,
  moodEmoji: string,
): Promise<{ playlistUrl: string; trackCount: number; personalized: boolean }> {
  const [profile, recResult] = await Promise.all([
    getUserProfile(token),
    getMoodRecommendations(token, mood, 20),
  ]);

  const { tracks, personalized } = recResult;
  if (tracks.length === 0) throw new Error('No tracks found for this mood');

  const date = new Date().toLocaleDateString('en-CA');
  const tag  = personalized ? 'For You' : 'Vibes';
  const name = `${moodEmoji} ${mood.charAt(0).toUpperCase() + mood.slice(1)} ${tag} — ${date}`;
  const desc = personalized
    ? `Personalised for your ${mood} mood by Commubu on ${date}, based on your Spotify taste`
    : `Auto-generated by Commubu for your ${mood} mood on ${date}`;

  const playlist = await createPlaylist(token, profile.id, name, desc);
  await addTracksToPlaylist(token, playlist.id, tracks.map(t => t.uri));

  return {
    playlistUrl: playlist.external_urls.spotify,
    trackCount:  tracks.length,
    personalized,
  };
}