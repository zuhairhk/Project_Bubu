const BASE_URL = 'https://api.spotify.com/v1';

export async function getTopArtists(token: string) {
  const res = await fetch(
    `${BASE_URL}/me/top/artists?limit=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) throw new Error('Failed to fetch top artists');
  return res.json();
}

export async function getTopTracks(token: string) {
  const res = await fetch(
    `${BASE_URL}/me/top/tracks?limit=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) throw new Error('Failed to fetch top tracks');
  return res.json();
}
