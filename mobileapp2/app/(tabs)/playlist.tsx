import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { View, Text, SubText, Card, useThemeColors } from '@/components/Themed';
import { useSpotifyAuth } from '@/lib/spotifyAuth';
import { getTopArtists, getTopTracks } from '@/lib/spotifyApi';

type Artist = { id: string; name: string; genres: string[]; images: { url: string }[] };
type Track  = { id: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] } };

function ArtistRow({ artist, index }: { artist: Artist; index: number }) {
  const colors = useThemeColors();
  return (
    <MotiView
      from={{ opacity: 0, translateX: -20 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', duration: 400, delay: index * 60 }}
      style={[styles.listRow, { borderBottomColor: colors.separator }]}
    >
      <Text style={styles.rankText}>#{index + 1}</Text>
      {artist.images[0]?.url ? (
        <Image source={{ uri: artist.images[0].url }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="person" size={22} color="#94A3B8" />
        </View>
      )}
      <View style={styles.listMeta}>
        <Text style={styles.listPrimary}>{artist.name}</Text>
        <SubText numberOfLines={1}>{artist.genres.slice(0, 2).join(', ') || 'Artist'}</SubText>
      </View>
    </MotiView>
  );
}

function TrackRow({ track, index }: { track: Track; index: number }) {
  const colors = useThemeColors();
  return (
    <MotiView
      from={{ opacity: 0, translateX: -20 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', duration: 400, delay: index * 60 }}
      style={[styles.listRow, { borderBottomColor: colors.separator }]}
    >
      <Text style={styles.rankText}>#{index + 1}</Text>
      {track.album.images[0]?.url ? (
        <Image source={{ uri: track.album.images[0].url }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="musical-note" size={22} color="#94A3B8" />
        </View>
      )}
      <View style={styles.listMeta}>
        <Text style={styles.listPrimary} numberOfLines={1}>{track.name}</Text>
        <SubText numberOfLines={1}>{track.artists[0]?.name}</SubText>
      </View>
    </MotiView>
  );
}

export default function PlaylistScreen() {
  const insets = useSafeAreaInsets();
  const [request, response, promptAsync] = useSpotifyAuth();
  const [token,   setToken]   = useState<string | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [tracks,  setTracks]  = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState<'artists' | 'tracks'>('artists');
  const colors = useThemeColors();

  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.params.access_token;
      setToken(accessToken);
      loadData(accessToken);
    }
  }, [response]);

  async function loadData(tk: string) {
    setLoading(true);
    try {
      const [ar, tr] = await Promise.all([getTopArtists(tk), getTopTracks(tk)]);
      setArtists(ar.items);
      setTracks(tr.items);
    } catch (e) {
      console.error('Spotify error:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Playlist</Text>
          <SubText>Your Spotify Top Charts</SubText>
        </View>

        {!token ? (
          /* ── Not connected ── */
          <Card style={styles.connectCard}>
            <LinearGradient
              colors={['#1DB954' + '22', '#1DB954' + '08']}
              style={StyleSheet.absoluteFill}
              start={[0, 0]} end={[1, 1]}
            />
            <Ionicons name="musical-notes" size={48} color="#1DB954" style={{ marginBottom: 16 }} />
            <Text style={styles.connectTitle}>Connect Spotify</Text>
            <SubText style={{ textAlign: 'center', marginBottom: 20 }}>
              See your top artists and tracks from the past 6 months
            </SubText>
            <Pressable
              disabled={!request}
              onPress={() => promptAsync()}
              style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.connectBtnText}>Login with Spotify</Text>
            </Pressable>
          </Card>
        ) : loading ? (
          <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Tab switcher */}
            <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              {(['artists', 'tracks'] as const).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                    {t === 'artists' ? 'Top Artists' : 'Top Tracks'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* List */}
            <Card style={styles.listCard}>
              {tab === 'artists'
                ? artists.map((a, i) => <ArtistRow key={a.id} artist={a} index={i} />)
                : tracks.map((t, i)  => <TrackRow  key={t.id} track={t}   index={i} />)
              }
            </Card>
          </>
        )}

        {/* Spacer for floating menu */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  scroll:        { paddingHorizontal: 16 },
  header:        { alignItems: 'center', marginBottom: 16 },
  title:         { fontSize: 28, fontWeight: 'bold', fontFamily: '429Font', marginBottom: 2 },
  connectCard:   { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, marginTop: 20, overflow: 'hidden' },
  connectTitle:  { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  connectBtn:    { backgroundColor: '#1DB954', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  connectBtnText:{ color: '#fff', fontWeight: '700', fontSize: 16 },
  tabBar:        { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  tabBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive:  { backgroundColor: '#1DB954' },
  tabLabel:      { fontWeight: '600', fontSize: 14 },
  tabLabelActive:{ color: '#fff' },
  listCard:      { overflow: 'hidden' },
  listRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rankText:      { width: 28, fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  thumb:         { width: 46, height: 46, borderRadius: 8, marginRight: 12 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' },
  listMeta:      { flex: 1 },
  listPrimary:   { fontSize: 15, fontWeight: '600', marginBottom: 2 },
});
