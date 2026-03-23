const BASE_URL = 'https://api.spotify.com/v1';

async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${path} failed: ${res.status}`);
  return res.json();
}

export const getTopArtists = (token: string) =>
  spotifyFetch('/me/top/artists?limit=10&time_range=medium_term', token);

export const getTopTracks = (token: string) =>
  spotifyFetch('/me/top/tracks?limit=10&time_range=medium_term', token);

export async function searchTracks(token: string, query: string, limit = 10) {
  const encoded = encodeURIComponent(query);
  return spotifyFetch(`/search?q=${encoded}&type=track&limit=${limit}`, token);
}
