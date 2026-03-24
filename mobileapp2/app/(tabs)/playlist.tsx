import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { View, Text, SubText, Card, useThemeColors } from '@/components/Themed';
import { useMood } from '@/lib/MoodContext';
import { useBle } from '@/lib/BleContext';
import { useSpotifyAuth } from '@/lib/spotifyAuth';
import {
  getTopArtists,
  getTopTracks,
  getMoodRecommendations,
  queueAllTracks,
  SpotifyTrack,
} from '@/lib/spotifyApi';

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL     = 'https://ac00-173-35-246-197.ngrok-free.app';
const PREDICT_URL     = `${BACKEND_URL}/api/ml/predict`;
const AUTO_PREDICT_MS = 60_000;

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊', neutral: '😐', stressed: '😤', angry: '😠', sad: '😢', sleepy: '😴',
};

const MOOD_COLORS: Record<string, readonly [string, string, string]> = {
  happy:   ['#FFF7C2', '#FFE680', '#FFD23F'],
  neutral: ['#F1F5F9', '#E2E8F0', '#CBD5E1'],
  stressed:['#FFD6D6', '#FFB3B3', '#FF8A8A'],
  angry:   ['#FFB3B3', '#FF7A7A', '#E63946'],
  sad:     ['#D6E4FF', '#BBD0FF', '#9AA9FF'],
  sleepy:  ['#E6DFFF', '#CFC4FF', '#B8A9FF'],
};

const MOOD_LABELS = ['happy', 'neutral', 'stressed', 'angry', 'sad', 'sleepy'] as const;
type Mood = typeof MOOD_LABELS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

type Artist = { id: string; name: string; genres: string[]; images: { url: string }[] };
type Track  = { id: string; uri: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; external_urls: { spotify: string } };

// ─── Row components ───────────────────────────────────────────────────────────

function ArtistRow({ artist, index }: { artist: Artist; index: number }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.listRow, { borderBottomColor: colors.separator }]}>
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
        <SubText numberOfLines={1}>{(artist.genres ?? []).slice(0, 2).join(', ') || 'Artist'}</SubText>
      </View>
    </View>
  );
}

function TrackRow({
  track,
  index,
  onPress,
}: {
  track: Track;
  index: number;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        { borderBottomColor: colors.separator },
        pressed && { backgroundColor: colors.card },
      ]}
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
      <Ionicons name="play-circle-outline" size={22} color="#1DB954" style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

function MoodChip({ mood, active, onPress }: { mood: Mood; active: boolean; onPress: () => void }) {
  const bg = MOOD_COLORS[mood];
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.moodChip,
        active && { borderColor: bg[2], borderWidth: 2, backgroundColor: bg[0] },
      ]}
    >
      <Text style={[styles.moodChipText, active && { fontWeight: '700', color: '#334155' }]}>
        {MOOD_EMOJIS[mood]} {mood}
      </Text>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlaylistScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { setMood: setGlobalMood } = useMood();
  const { data: bleData, status: bleStatus } = useBle();

  const [request, response, promptAsync, getToken] = useSpotifyAuth();
  const [token, setToken]         = useState<string | null>(null);
  const [artists, setArtists]     = useState<Artist[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [loading, setLoading]     = useState(false);

  const [activeMood, setActiveMood]         = useState<Mood | null>(null);
  const [moodSource, setMoodSource]         = useState<'auto' | 'manual' | null>(null);
  const [predictionConf, setPredictionConf] = useState<number>(0);
  const [predicting, setPredicting]         = useState(false);

  const [tab, setTab]                             = useState<'charts' | 'vibes'>('charts');
  const [recommendedTracks, setRecommendedTracks] = useState<Track[]>([]);
  const [recLoading, setRecLoading]               = useState(false);
  const [queuingTracks, setQueuingTracks]         = useState(false);

  const predictTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Spotify login ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function handleAuth() {
      if (response?.type !== 'success') return;
      setLoading(true);
      try {
        const result = await getToken();
        if (result?.access_token) {
          setToken(result.access_token);
          const [ar, tr] = await Promise.all([
            getTopArtists(result.access_token),
            getTopTracks(result.access_token),
          ]);
          setArtists(ar.items ?? []);
          setTopTracks(tr.items ?? []);
        }
      } catch (e) {
        console.error('Spotify auth error:', e);
      } finally {
        setLoading(false);
      }
    }
    handleAuth();
  }, [response]);

  // ── Recommendations ────────────────────────────────────────────────────────

  const loadRecommendations = useCallback(async (tk: string, mood: Mood) => {
    setRecLoading(true);
    try {
      const result = await getMoodRecommendations(tk, mood, 20);
      setRecommendedTracks(result.tracks as Track[]);
    } catch (e) {
      console.error('Recommendations error:', e);
    } finally {
      setRecLoading(false);
    }
  }, []);

  // ── Auto mood prediction ───────────────────────────────────────────────────

  const predictMood = useCallback(async () => {
    if (bleStatus !== 'connected' || !bleData.heartRate) return;
    setPredicting(true);
    try {
      const res = await fetch(PREDICT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:           'dev_user',
          heart_rate:        bleData.heartRate ?? 70,
          steps_last_minute: bleData.steps ?? 0,
          location_variance: 0.00003,
          timestamp:         new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`Predict failed: ${res.status}`);
      const data = await res.json();
      const mood = data.mood as Mood;
      setPredictionConf(data.confidence ?? 0);

      if (moodSource !== 'manual') {
        setActiveMood(mood);
        setGlobalMood(mood);
        setMoodSource('auto');
        if (token) loadRecommendations(token, mood);
      }
    } catch (e) {
      console.error('Mood prediction error:', e);
    } finally {
      setPredicting(false);
    }
  }, [bleStatus, bleData, moodSource, token, setGlobalMood, loadRecommendations]);

  useEffect(() => {
    predictMood();
    predictTimerRef.current = setInterval(predictMood, AUTO_PREDICT_MS);
    return () => { if (predictTimerRef.current) clearInterval(predictTimerRef.current); };
  }, [predictMood]);

  useEffect(() => {
    if (token && activeMood) loadRecommendations(token, activeMood);
  }, [token]);

  // ── Manual mood override ───────────────────────────────────────────────────

  const handleManualMood = useCallback((mood: Mood) => {
    setActiveMood(mood);
    setGlobalMood(mood);
    setMoodSource('manual');
    if (token) loadRecommendations(token, mood);
  }, [token, setGlobalMood, loadRecommendations]);

  // ── Open single track in Spotify ──────────────────────────────────────────

  const handleTrackPress = useCallback((track: Track) => {
    // Try Spotify app deep link first, fall back to web
    Linking.openURL(track.uri).catch(() => {
      Linking.openURL(track.external_urls.spotify);
    });
  }, []);

  // ── Queue all tracks ──────────────────────────────────────────────────────

  const handleQueueAll = useCallback(async () => {
    if (!token || recommendedTracks.length === 0) return;

    // First open Spotify with the first track so something starts playing
    const firstTrack = recommendedTracks[0];
    Linking.openURL(firstTrack.uri).catch(() => {
      Linking.openURL(firstTrack.external_urls.spotify);
    });

    // Then queue the rest in the background
    if (recommendedTracks.length > 1) {
      setQueuingTracks(true);
      try {
        const rest = recommendedTracks.slice(1);
        const result = await queueAllTracks(token, rest as SpotifyTrack[]);
        console.log(`Queued ${result.queued} tracks, ${result.failed} failed`);
        if (result.queued > 0) {
          Alert.alert(
            '🎵 Added to Queue',
            `Opened first track and queued ${result.queued} more in Spotify.`,
            [{ text: 'OK' }],
          );
        }
      } catch (e) {
        console.error('Queue error:', e);
      } finally {
        setQueuingTracks(false);
      }
    }
  }, [token, recommendedTracks]);

  // ── Logout ─────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    setToken(null);
    setArtists([]);
    setTopTracks([]);
    setRecommendedTracks([]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const moodBg: readonly [string, string, string] = activeMood
    ? MOOD_COLORS[activeMood]
    : ['#F1F5F9', '#E2E8F0', '#CBD5E1'];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        <View style={styles.header}>
          <Text style={styles.title}>Playlist</Text>
          <SubText>Mood-powered music</SubText>
        </View>

        {/* Mood card */}
        <Card style={styles.moodCard}>
          <LinearGradient colors={[moodBg[0], moodBg[1]]} style={StyleSheet.absoluteFill} start={[0,0]} end={[1,1]} />

          <View style={styles.moodCardTop}>
            <Text style={styles.moodCardLabel}>
              {moodSource === 'manual' ? 'YOUR MOOD' : 'DETECTED MOOD'}
            </Text>
            <View style={[styles.blePill, bleStatus !== 'connected' && { backgroundColor: '#F1F5F9' }]}>
              {bleStatus === 'connected' && <View style={styles.bleDot} />}
              <Text style={[styles.blePillText, bleStatus !== 'connected' && { color: '#94A3B8' }]}>
                {bleStatus === 'connected' ? 'Live BLE' : 'No device'}
              </Text>
            </View>
          </View>

          {predicting && (
            <View style={styles.detectingRow}>
              <ActivityIndicator size="small" color="#64748B" />
              <SubText style={{ marginLeft: 6 }}>Analysing biometrics…</SubText>
            </View>
          )}

          {activeMood ? (
            <View style={styles.moodDisplay}>
              <Text style={styles.moodBigEmoji}>{MOOD_EMOJIS[activeMood]}</Text>
              <View>
                <Text style={styles.moodBigLabel}>
                  {activeMood.charAt(0).toUpperCase() + activeMood.slice(1)}
                </Text>
                <SubText style={{ color: '#64748B' }}>
                  {moodSource === 'auto'
                    ? `${Math.round(predictionConf * 100)}% confidence`
                    : 'Manually set'}
                </SubText>
              </View>
            </View>
          ) : (
            <SubText style={{ marginVertical: 12 }}>
              {bleStatus === 'connected'
                ? 'Waiting for first BLE reading…'
                : 'Connect your device or pick a mood below'}
            </SubText>
          )}

          <Text style={[styles.moodCardLabel, { marginTop: 14, marginBottom: 8 }]}>OVERRIDE MOOD</Text>
          <View style={styles.moodChipsRow}>
            {MOOD_LABELS.map(m => (
              <MoodChip
                key={m}
                mood={m}
                active={activeMood === m && moodSource === 'manual'}
                onPress={() => handleManualMood(m)}
              />
            ))}
          </View>
        </Card>

        {/* Spotify section */}
        {!token ? (
          <Card style={styles.connectCard}>
            <LinearGradient colors={['#1DB95422', '#1DB95408']} style={StyleSheet.absoluteFill} start={[0,0]} end={[1,1]} />
            <Ionicons name="musical-notes" size={48} color="#1DB954" style={{ marginBottom: 16 }} />
            <Text style={styles.connectTitle}>Connect Spotify</Text>
            <SubText style={{ textAlign: 'center', marginBottom: 20 }}>
              Login to get personalised mood-based music recommendations
            </SubText>
            <Pressable
              disabled={!request}
              onPress={() => promptAsync?.()}
              style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.connectBtnText}>Login with Spotify</Text>
            </Pressable>
          </Card>
        ) : loading ? (
          <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Re-login */}
            <Pressable onPress={handleLogout} style={styles.reloginBtn}>
              <Ionicons name="refresh-outline" size={13} color="#94A3B8" />
              <SubText style={{ fontSize: 11, marginLeft: 4 }}>Re-login to Spotify</SubText>
            </Pressable>

            {/* Tabs */}
            <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              {(['charts', 'vibes'] as const).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                    {t === 'charts' ? 'Top Charts' : `${activeMood ? MOOD_EMOJIS[activeMood] + ' ' : ''}Vibes`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === 'charts' ? (
              <>
                <Text style={styles.sectionLabel}>TOP ARTISTS</Text>
                <Card style={styles.listCard}>
                  {artists.length === 0
                    ? <SubText style={{ padding: 16, textAlign: 'center' }}>No data yet</SubText>
                    : artists.map((a, i) => <ArtistRow key={a.id} artist={a} index={i} />)}
                </Card>
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>TOP TRACKS</Text>
                <Card style={styles.listCard}>
                  {topTracks.length === 0
                    ? <SubText style={{ padding: 16, textAlign: 'center' }}>No data yet</SubText>
                    : topTracks.map((t, i) => (
                        <TrackRow
                          key={t.id}
                          track={t}
                          index={i}
                          onPress={() => handleTrackPress(t)}
                        />
                      ))}
                </Card>
              </>
            ) : (
              <>
                {/* Vibes header with Play All button */}
                <View style={styles.vibesHeader}>
                  <View>
                    <Text style={styles.sectionLabel}>
                      {activeMood ? `FOR YOUR ${activeMood.toUpperCase()} MOOD` : 'RECOMMENDED'}
                    </Text>
                    {artists.length > 0 && activeMood && (
                      <SubText style={{ fontSize: 11 }}>
                        Based on {artists.slice(0, 2).map(a => a.name).join(', ')}
                      </SubText>
                    )}
                  </View>
                  {recommendedTracks.length > 0 && (
                    <Pressable
                      onPress={handleQueueAll}
                      disabled={queuingTracks}
                      style={({ pressed }) => [
                        styles.playAllBtn,
                        (pressed || queuingTracks) && { opacity: 0.7 },
                      ]}
                    >
                      {queuingTracks
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="play" size={14} color="#fff" />
                      }
                      <Text style={styles.playAllText}>
                        {queuingTracks ? 'Queuing…' : 'Play All'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {recLoading ? (
                  <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 40 }} />
                ) : recommendedTracks.length > 0 ? (
                  <>
                    <SubText style={{ marginBottom: 8, fontSize: 11, textAlign: 'center' }}>
                      Tap a track to open in Spotify · Tap Play All to queue everything
                    </SubText>
                    <Card style={styles.listCard}>
                      {recommendedTracks.map((t, i) => (
                        <TrackRow
                          key={t.id}
                          track={t}
                          index={i}
                          onPress={() => handleTrackPress(t)}
                        />
                      ))}
                    </Card>
                  </>
                ) : (
                  <Card style={{ padding: 24, alignItems: 'center' }}>
                    <SubText>
                      {activeMood
                        ? 'Loading recommendations…'
                        : 'Select a mood to see recommendations'}
                    </SubText>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1 },
  scroll:         { paddingHorizontal: 16 },
  header:         { alignItems: 'center', marginBottom: 16 },
  title:          { fontSize: 28, fontWeight: 'bold', fontFamily: '429Font', marginBottom: 2 },

  moodCard:       { padding: 16, marginBottom: 16, overflow: 'hidden' },
  moodCardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  moodCardLabel:  { fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 0.8 },
  detectingRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  moodDisplay:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  moodBigEmoji:   { fontSize: 52 },
  moodBigLabel:   { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  moodChipsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodChip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  moodChipText:   { fontSize: 13, color: '#475569' },
  blePill:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  bleDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  blePillText:    { fontSize: 11, fontWeight: '600', color: '#16A34A' },

  reloginBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, padding: 6 },

  tabBar:         { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  tabBtn:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive:   { backgroundColor: '#1DB954' },
  tabLabel:       { fontWeight: '600', fontSize: 14 },
  tabLabelActive: { color: '#fff' },

  vibesHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  playAllBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1DB954', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  playAllText:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  sectionLabel:     { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 4 },
  listCard:         { overflow: 'hidden', marginBottom: 4 },
  listRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rankText:         { width: 28, fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  thumb:            { width: 46, height: 46, borderRadius: 8, marginRight: 12 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E2E8F0' },
  listMeta:         { flex: 1 },
  listPrimary:      { fontSize: 15, fontWeight: '600', marginBottom: 2 },

  connectCard:    { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, marginTop: 20, overflow: 'hidden' },
  connectTitle:   { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  connectBtn:     { backgroundColor: '#1DB954', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});