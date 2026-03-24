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
  generateMoodPlaylist,
  SpotifyTrack,
} from '@/lib/spotifyApi';

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL          = 'https://ac00-173-35-246-197.ngrok-free.app';
const PREDICT_URL          = `${BACKEND_URL}/api/ml/predict`;
const AUTO_PREDICT_MS      = 60_000;

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
type Track  = { id: string; uri: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] } };

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

function TrackRow({ track, index }: { track: Track; index: number }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.listRow, { borderBottomColor: colors.separator }]}>
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
    </View>
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
  const [generatingPlaylist, setGeneratingPlaylist] = useState(false);
  const [playlistUrl, setPlaylistUrl]             = useState<string | null>(null);
  const [wasPersonalized, setWasPersonalized]     = useState(false);

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
    setPlaylistUrl(null);
    try {
      const result = await getMoodRecommendations(tk, mood, 20);
      setRecommendedTracks(result.tracks);
    } catch (e) {
      console.error('Recommendations error:', e);
    } finally {
      setRecLoading(false);
    }
  }, []);

  // ── Auto mood prediction from BLE ──────────────────────────────────────────

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

      // Only apply if user hasn't manually overridden
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

  // Load recs when token first arrives and mood is already set
  useEffect(() => {
    if (token && activeMood) loadRecommendations(token, activeMood);
  }, [token]);

  // ── Manual mood override ───────────────────────────────────────────────────

  const handleManualMood = useCallback((mood: Mood) => {
    setActiveMood(mood);
    setGlobalMood(mood);
    setMoodSource('manual');
    setPlaylistUrl(null);
    if (token) loadRecommendations(token, mood);
  }, [token, setGlobalMood, loadRecommendations]);

  // ── Generate playlist ──────────────────────────────────────────────────────

  const handleGeneratePlaylist = useCallback(async () => {
    if (!token || !activeMood) return;
    setGeneratingPlaylist(true);
    try {
      const result = await generateMoodPlaylist(token, activeMood, MOOD_EMOJIS[activeMood]);
      setPlaylistUrl(result.playlistUrl);
      setWasPersonalized(result.personalized);
      Alert.alert(
        'Playlist Created! 🎉',
        result.personalized
          ? `Added ${result.trackCount} tracks based on your Spotify taste + ${activeMood} mood.`
          : `Added ${result.trackCount} tracks for your ${activeMood} mood.`,
        [
          { text: 'Open in Spotify', onPress: () => Linking.openURL(result.playlistUrl) },
          { text: 'Later', style: 'cancel' },
        ],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to create playlist');
    } finally {
      setGeneratingPlaylist(false);
    }
  }, [token, activeMood]);

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

        {/* ── Mood card ── */}
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

        {/* ── Spotify section ── */}
        {!token ? (
          <Card style={styles.connectCard}>
            <LinearGradient colors={['#1DB95422', '#1DB95408']} style={StyleSheet.absoluteFill} start={[0,0]} end={[1,1]} />
            <Ionicons name="musical-notes" size={48} color="#1DB954" style={{ marginBottom: 16 }} />
            <Text style={styles.connectTitle}>Connect Spotify</Text>
            <SubText style={{ textAlign: 'center', marginBottom: 20 }}>
              Login to generate personalised playlists based on your taste and mood
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
            {/* Generate button + open link */}
            {activeMood && (
              <View style={{ marginBottom: 12, gap: 8 }}>
                <Pressable
                  onPress={handleGeneratePlaylist}
                  disabled={generatingPlaylist}
                  style={({ pressed }) => [
                    styles.generateBtn,
                    (pressed || generatingPlaylist) && { opacity: 0.75 },
                  ]}
                >
                  {generatingPlaylist
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  }
                  <Text style={styles.generateBtnText}>
                    {generatingPlaylist
                      ? 'Creating playlist…'
                      : `Create ${MOOD_EMOJIS[activeMood]} ${activeMood} playlist`}
                  </Text>
                </Pressable>

                {/* Personalization hint */}
                {!generatingPlaylist && !playlistUrl && (
                  <SubText style={{ textAlign: 'center', fontSize: 11 }}>
                    {artists.length > 0
                      ? `Based on your top artists like ${artists.slice(0, 2).map(a => a.name).join(', ')}`
                      : 'Connect Spotify to personalise based on your taste'}
                  </SubText>
                )}

                {playlistUrl && (
                  <View style={styles.playlistCreatedRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#1DB954" />
                    <Text style={styles.playlistCreatedText}>
                      {wasPersonalized ? 'Personalised for you' : 'Generated for your mood'}
                    </Text>
                    <Pressable
                      onPress={() => Linking.openURL(playlistUrl)}
                      style={({ pressed }) => [styles.openSpotifyBtn, pressed && { opacity: 0.8 }]}
                    >
                      <Ionicons name="open-outline" size={14} color="#1DB954" />
                      <Text style={styles.openSpotifyText}>Open in Spotify</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

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
                    : topTracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} />)}
                </Card>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>
                  {activeMood
                    ? `RECOMMENDED FOR ${activeMood.toUpperCase()}`
                    : 'RECOMMENDED TRACKS'}
                </Text>
                {artists.length > 0 && activeMood && (
                  <SubText style={{ marginBottom: 8, fontSize: 11 }}>
                    Picking from artists like {artists.slice(0, 3).map(a => a.name).join(', ')}
                  </SubText>
                )}
                {recLoading ? (
                  <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 40 }} />
                ) : recommendedTracks.length > 0 ? (
                  <Card style={styles.listCard}>
                    {recommendedTracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} />)}
                  </Card>
                ) : (
                  <Card style={{ padding: 24, alignItems: 'center' }}>
                    <SubText>
                      {activeMood
                        ? 'Tap "Create playlist" to generate tracks'
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

  generateBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1DB954', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20 },
  generateBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  playlistCreatedRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  playlistCreatedText: { fontSize: 12, color: '#1DB954', fontWeight: '600', flex: 1 },
  openSpotifyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1DB954', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  openSpotifyText:     { color: '#1DB954', fontWeight: '600', fontSize: 12 },

  tabBar:         { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  tabBtn:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive:   { backgroundColor: '#1DB954' },
  tabLabel:       { fontWeight: '600', fontSize: 14 },
  tabLabelActive: { color: '#fff' },

  sectionLabel:     { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 8 },
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