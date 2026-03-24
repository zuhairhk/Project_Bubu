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
  // 204 No Content — return empty object
  if (res.status === 204) return {};
  return res.json();
}

// ─── Existing ────────────────────────────────────────────────────────────────

export const getTopArtists = (token: string) =>
  spotifyFetch('/me/top/artists?limit=10&time_range=medium_term', token);

export const getTopTracks = (token: string) =>
  spotifyFetch('/me/top/tracks?limit=10&time_range=medium_term', token);

export async function searchTracks(token: string, query: string, limit = 10) {
  const encoded = encodeURIComponent(query);
  return spotifyFetch(`/search?q=${encoded}&type=track&limit=${limit}`, token);
}

// ─── User profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(token: string): Promise<{ id: string; display_name: string }> {
  return spotifyFetch('/me', token);
}

// ─── Mood-based recommendations ──────────────────────────────────────────────

// Audio feature targets per mood — tuned to match your ML training profiles
const MOOD_SEEDS: Record<string, {
  seed_genres: string[];
  target_energy: number;
  target_valence: number;
  target_tempo: number;
  min_energy?: number;
  max_energy?: number;
  min_valence?: number;
  max_valence?: number;
}> = {
  happy: {
    seed_genres:    ['pop', 'dance', 'happy'],
    target_energy:  0.80,
    target_valence: 0.90,
    target_tempo:   120,
    min_energy:     0.60,
    min_valence:    0.70,
  },
  neutral: {
    seed_genres:    ['indie', 'chill', 'pop'],
    target_energy:  0.45,
    target_valence: 0.50,
    target_tempo:   100,
    min_energy:     0.30,
    max_energy:     0.65,
    min_valence:    0.35,
    max_valence:    0.65,
  },
  stressed: {
    seed_genres:    ['ambient', 'chill', 'study'],
    target_energy:  0.30,
    target_valence: 0.55,
    target_tempo:   80,
    max_energy:     0.50,
    min_valence:    0.40,
  },
  angry: {
    seed_genres:    ['chill', 'acoustic', 'soul'],
    target_energy:  0.35,
    target_valence: 0.60,
    target_tempo:   85,
    max_energy:     0.55,
    min_valence:    0.45,
  },
  sad: {
    seed_genres:    ['sad', 'indie', 'singer-songwriter'],
    target_energy:  0.25,
    target_valence: 0.25,
    target_tempo:   75,
    max_energy:     0.45,
    max_valence:    0.45,
  },
  sleepy: {
    seed_genres:    ['sleep', 'ambient', 'classical'],
    target_energy:  0.10,
    target_valence: 0.35,
    target_tempo:   65,
    max_energy:     0.25,
  },
};

export async function getMoodRecommendations(
  token: string,
  mood: string,
  limit = 20,
): Promise<{ tracks: SpotifyTrack[] }> {
  const seeds = MOOD_SEEDS[mood] ?? MOOD_SEEDS['neutral'];

  const params = new URLSearchParams({
    limit:          String(limit),
    seed_genres:    seeds.seed_genres.slice(0, 5).join(','),
    target_energy:  String(seeds.target_energy),
    target_valence: String(seeds.target_valence),
    target_tempo:   String(seeds.target_tempo),
  });

  if (seeds.min_energy  !== undefined) params.set('min_energy',  String(seeds.min_energy));
  if (seeds.max_energy  !== undefined) params.set('max_energy',  String(seeds.max_energy));
  if (seeds.min_valence !== undefined) params.set('min_valence', String(seeds.min_valence));
  if (seeds.max_valence !== undefined) params.set('max_valence', String(seeds.max_valence));

  const result = await spotifyFetch(`/recommendations?${params.toString()}`, token);
  return { tracks: result.tracks ?? [] };
}

// ─── Playlist creation ───────────────────────────────────────────────────────

export async function createPlaylist(
  token: string,
  userId: string,
  name: string,
  description = '',
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return spotifyFetch(`/users/${userId}/playlists`, token, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description,
      public: false,
    }),
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

// ─── Full flow: generate mood playlist and return Spotify URL ─────────────────

export async function generateMoodPlaylist(
  token: string,
  mood: string,
  moodEmoji: string,
): Promise<{ playlistUrl: string; trackCount: number }> {
  const [profile, recResult] = await Promise.all([
    getUserProfile(token),
    getMoodRecommendations(token, mood, 20),
  ]);

  const tracks = recResult.tracks;
  if (tracks.length === 0) throw new Error('No recommendations returned from Spotify');

  const date  = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const name  = `${moodEmoji} ${mood.charAt(0).toUpperCase() + mood.slice(1)} Vibes — ${date}`;
  const desc  = `Auto-generated by Commubu based on your ${mood} mood on ${date}`;

  const playlist = await createPlaylist(token, profile.id, name, desc);
  const uris     = tracks.map((t: SpotifyTrack) => t.uri);
  await addTracksToPlaylist(token, playlist.id, uris);

  return {
    playlistUrl: playlist.external_urls.spotify,
    trackCount:  tracks.length,
  };
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