import { StyleSheet, ScrollView, Image, Pressable } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import { useSpotifyAuth } from '@/lib/spotifyAuth';
import { getTopArtists, getTopTracks } from '@/lib/spotifyApi';

export default function PlaylistScreen() {
  // Spotify auth
  const [request, response, promptAsync] = useSpotifyAuth();

  // App state
  const [token, setToken] = useState<string | null>(null);
  const [artists, setArtists] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);

  // Handle response from Spotify login
  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.params.access_token;
      setToken(accessToken);
      fetchSpotifyData(accessToken);
    }
  }, [response]);
  useEffect(() => {
    console.log('Redirect URI used:', AuthSession.makeRedirectUri({ useProxy: true }));
  }, []);

  // Fetch top artists & tracks
  async function fetchSpotifyData(accessToken: string) {
    try {
      const artistsRes = await getTopArtists(accessToken);
      const tracksRes = await getTopTracks(accessToken);

      setArtists(artistsRes.items);
      setTracks(tracksRes.items);
    } catch (e) {
      console.error('Spotify API error:', e);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Spotify</Text>
        <Text style={styles.subtitle}>Top Artists & Tracks</Text>
      </View>

      {/* Connect Button */}
      {!token && (
        <Pressable
          style={styles.connectButton}
          disabled={!request}
          onPress={() => promptAsync()}
        >
          <Text style={styles.connectText}>Connect Spotify</Text>
        </Pressable>
      )}

      {/* Top Artists */}
      {artists.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Artists</Text>
          {artists.map((artist) => (
            <View key={artist.id} style={styles.row}>
              <Image
                source={{ uri: artist.images[0]?.url }}
                style={styles.image}
              />
              <Text style={styles.name}>{artist.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top Tracks */}
      {tracks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Tracks</Text>
          {tracks.map((track) => (
            <View key={track.id} style={styles.row}>
              <Image
                source={{ uri: track.album.images[0]?.url }}
                style={styles.image}
              />
              <View>
                <Text style={styles.name}>{track.name}</Text>
                <Text style={styles.subName}>{track.artists[0]?.name}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 14, opacity: 0.6 },
  connectButton: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#1DB954',
    alignItems: 'center',
  },
  connectText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  section: { paddingHorizontal: 20, marginTop: 30 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  image: { width: 48, height: 48, borderRadius: 8, marginRight: 12 },
  name: { fontSize: 16, fontWeight: '500' },
  subName: { fontSize: 13, opacity: 0.6 },
});
