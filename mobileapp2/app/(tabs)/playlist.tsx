import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet, ScrollView, Image, Pressable, ActivityIndicator,
  Linking, Alert, View, Text, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMood } from '@/lib/MoodContext';
import { useBle } from '@/lib/BleContext';
import { MOOD_CHAR_UUID } from '@/lib/BleContext';
import { useSpotifyAuth } from '@/lib/spotifyAuth';
import {
  getTopArtists, getTopTracks, getMoodRecommendations,
  getNowPlaying, queueAllTracks,
  NowPlaying, SpotifyTrack,
} from '@/lib/spotifyApi';
import {
  SONG_CHAR_UUID, ARTIST_CHAR_UUID,
  TRANSIT_LINE_CHAR_UUID, TRANSIT_TIME_CHAR_UUID,
  TIME_CHAR_UUID,
} from '@/lib/BleContext';
import { useNowPlaying } from '@/lib/NowPlayingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#fff8e9ff',
  card:     '#e5f0aeff',
  text:     '#604848',
  textSec:  '#604848',
  textTert: '#696561ff',
  sep:      '#C6C6C8',
  blue:     '#468849',
  green:    '#34C759',
  orange:   '#FF9500',
  red:      '#468849',
  purple:   '#AF52DE',
  indigo:   '#468849',
  spotify:  '#00b765ff',
};
const cardShadow = {
  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 }, elevation: 3,
};
const MOOD_COLOR: Record<string, string> = {
  happy:    '#efc302ff', neutral:  '#ff8c9bff', stressed: '#ff7f30ff',
  angry:    '#ff3041ff', sad:      '#255bffff', sleepy:   '#8d3bf0ff',
};
const MOOD_LABEL: Record<string, string> = {
  happy: 'Happy', neutral: 'Neutral', stressed: 'Stressed',
  angry: 'Angry', sad: 'Sad', sleepy: 'Sleepy',
};

const BACKEND_URL  = 'https://c3db-2607-fea8-fd90-7a41-8efa-38bb-2d75-67ba.ngrok-free.app';
const PREDICT_URL  = `${BACKEND_URL}/api/ml/predict`;
const PREDICT_MS   = 5 * 60 * 1000;
const STORAGE_KEY  = 'commute_selected_line';

const MOOD_LABELS = ['happy', 'neutral', 'stressed', 'angry', 'sad', 'sleepy'] as const;
type Mood = typeof MOOD_LABELS[number];

type Artist = { id: string; name: string; genres: string[]; images: { url: string }[] };
type Track  = {
  id: string; uri: string; name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ progressMs, durationMs }: { progressMs: number; durationMs: number }) {
  const pct = durationMs > 0 ? Math.min((progressMs / durationMs) * 100, 100) : 0;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  return (
    <View style={PB.wrap}>
      <View style={PB.track}>
        <View style={[PB.fill, { width: `${pct}%` as any }]} />
      </View>
      <View style={PB.times}>
        <Text style={PB.time}>{fmt(progressMs)}</Text>
        <Text style={PB.time}>{fmt(durationMs)}</Text>
      </View>
    </View>
  );
}
const PB = StyleSheet.create({
  wrap:  { marginTop: 10 },
  track: { height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, overflow: 'hidden' },
  fill:  { height: '100%', backgroundColor: C.spotify, borderRadius: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time:  { fontSize: 10, color: C.textTert, fontWeight: '500' },
});

// ─── Now Playing card ─────────────────────────────────────────────────────────
function NowPlayingCard({ np, onOpen }: { np: NowPlaying; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} style={[NPC.card, cardShadow]}>
      <View style={NPC.topRow}>
        <View style={[NPC.badge, { backgroundColor: np.isPlaying ? C.spotify + '15' : C.textTert + '15' }]}>
          <View style={[NPC.dot, { backgroundColor: np.isPlaying ? C.spotify : C.textTert }]} />
          <Text style={[NPC.badgeText, { color: np.isPlaying ? C.spotify : C.textTert }]}>
            {np.isPlaying ? 'Now Playing' : 'Paused'}
          </Text>
        </View>
        <Ionicons name="open-outline" size={14} color={C.textTert} />
      </View>
      <View style={NPC.body}>
        {np.albumArt
          ? <Image source={{ uri: np.albumArt }} style={NPC.art} />
          : <View style={[NPC.art, NPC.artFallback]}><Ionicons name="musical-note" size={28} color={C.textTert} /></View>
        }
        <View style={NPC.meta}>
          <Text style={NPC.song} numberOfLines={2}>{np.songTitle}</Text>
          <Text style={NPC.artist} numberOfLines={1}>{np.artistName}</Text>
          <ProgressBar progressMs={np.progressMs} durationMs={np.durationMs} />
        </View>
      </View>
    </Pressable>
  );
}
const NPC = StyleSheet.create({
  card:       { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 16 },
  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  dot:        { width: 6, height: 6, borderRadius: 3 },
  badgeText:  { fontSize: 11, fontWeight: '700' },
  body:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art:        { width: 72, height: 72, borderRadius: 12 },
  artFallback:{ backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  meta:       { flex: 1 },
  song:       { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginBottom: 4 },
  artist:     { fontSize: 13, color: C.textTert, marginBottom: 2 },
});

// ─── Artist / Track rows ──────────────────────────────────────────────────────
function ArtistRow({ artist, index }: { artist: Artist; index: number }) {
  return (
    <View style={[R.row, index !== 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep }]}>
      <Text style={R.rank}>#{index + 1}</Text>
      {artist.images[0]?.url
        ? <Image source={{ uri: artist.images[0].url }} style={R.thumb} />
        : <View style={[R.thumb, R.fallback]}><Ionicons name="person" size={20} color={C.textTert} /></View>}
      <View style={R.meta}>
        <Text style={R.primary}>{artist.name}</Text>
        <Text style={R.secondary} numberOfLines={1}>{(artist.genres ?? []).slice(0, 2).join(', ') || 'Artist'}</Text>
      </View>
    </View>
  );
}
function TrackRow({ track, index, onPress }: { track: Track; index: number; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [R.row, index !== 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep }, pressed && { backgroundColor: C.bg }]}
    >
      <Text style={R.rank}>#{index + 1}</Text>
      {track.album.images[0]?.url
        ? <Image source={{ uri: track.album.images[0].url }} style={R.thumb} />
        : <View style={[R.thumb, R.fallback]}><Ionicons name="musical-note" size={20} color={C.textTert} /></View>}
      <View style={R.meta}>
        <Text style={R.primary} numberOfLines={1}>{track.name}</Text>
        <Text style={R.secondary} numberOfLines={1}>{track.artists[0]?.name}</Text>
      </View>
      <Ionicons name="play-circle-outline" size={24} color={C.spotify} />
    </Pressable>
  );
}
const R = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  rank:    { width: 28, fontSize: 12, color: C.textTert, fontWeight: '600' },
  thumb:   { width: 46, height: 46, borderRadius: 8, marginRight: 12 },
  fallback:{ alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  meta:    { flex: 1 },
  primary: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  secondary:{ fontSize: 12, color: C.textTert },
});

// ─── Mood chip ────────────────────────────────────────────────────────────────
function MoodChip({ mood, active, onPress }: { mood: Mood; active: boolean; onPress: () => void }) {
  const col = MOOD_COLOR[mood] ?? C.blue;
  return (
    <Pressable onPress={onPress} style={[MC.chip, active && { backgroundColor: col + '15', borderColor: col, borderWidth: 1.5 }]}>
      <Text style={[MC.text, active && { color: col, fontWeight: '700' }]}>{MOOD_LABEL[mood]}</Text>
    </Pressable>
  );
}
const MC = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.sep },
  text: { fontSize: 13, color: C.textSec, fontWeight: '500' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PlaylistScreen() {
  const insets = useSafeAreaInsets();
  const { setMood: setGlobalMood } = useMood();
  const { data: bleData, status: bleStatus, writeChar } = useBle();

  const [request, response, promptAsync, getToken] = useSpotifyAuth();
  const [token,      setToken]     = useState<string | null>(null);
  const [artists,    setArtists]   = useState<Artist[]>([]);
  const [topTracks,  setTopTracks] = useState<Track[]>([]);
  const [loading,    setLoading]   = useState(false);

  const [activeMood,      setActiveMood]     = useState<Mood | null>(null);
  const [moodSource,      setMoodSource]     = useState<'auto' | 'manual' | null>(null);
  const [predictionConf,  setPredictionConf] = useState(0);
  const [predicting,      setPredicting]     = useState(false);
  const [predictError,    setPredictError]   = useState<string | null>(null);

  const [tab,          setTab]          = useState<'charts' | 'vibes'>('charts');
  const [recTracks,    setRecTracks]    = useState<Track[]>([]);
  const [recLoading,   setRecLoading]   = useState(false);
  const [queuingTracks,setQueuingTracks]= useState(false);

  // Track whether recs have been loaded for the current mood
  // so we only fetch once per mood when the tab is opened
  const loadedRecsMoodRef = useRef<Mood | null>(null);

  const { nowPlaying, setToken: setNowPlayingToken } = useNowPlaying();
  const [lastSentSong,   setLastSentSong]   = useState<string>('');

  const predictTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Spotify auth ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function handleAuth() {
      if (response?.type !== 'success') return;
      setLoading(true);
      try {
        const result = await getToken();
        if (result?.access_token) {
          setToken(result.access_token);
          setNowPlayingToken(result.access_token);
          const [ar, tr] = await Promise.all([getTopArtists(result.access_token), getTopTracks(result.access_token)]);
          setArtists(ar.items ?? []);
          setTopTracks(tr.items ?? []);
        }
      } catch (e) { console.error('Spotify auth error:', e); }
      finally { setLoading(false); }
    }
    handleAuth();
  }, [response]);

  // ── Push song info to ESP32 ──────────────────────────────────────────────
  useEffect(() => {
    if (bleStatus !== 'connected' || !nowPlaying) return;
    const songKey = `${nowPlaying.songTitle}|${nowPlaying.artistName}`;
    if (songKey === lastSentSong) return;
    setLastSentSong(songKey);
    writeChar(SONG_CHAR_UUID,   nowPlaying.songTitle);
    writeChar(ARTIST_CHAR_UUID, nowPlaying.artistName);
    const now  = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    writeChar(TIME_CHAR_UUID, hhmm);
  }, [nowPlaying, bleStatus, writeChar, lastSentSong]);

  // ── Push transit info to ESP32 ───────────────────────────────────────────
  useEffect(() => {
    if (bleStatus !== 'connected') return;
    async function pushTransitToDevice() {
      const line = await AsyncStorage.getItem('commute_selected_line');
      if (!line) return;
      writeChar(TRANSIT_LINE_CHAR_UUID, line);
      try {
        const res = await fetch(
          'https://c3db-2607-fea8-fd90-7a41-8efa-38bb-2d75-67ba.ngrok-free.app/api/transit/next',
          { headers: { 'ngrok-skip-browser-warning': '1' } }
        );
        if (!res.ok) return;
        const json = await res.json();
        const now = new Date();
        const minutesUntil = (iso: string) =>
          Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
        const next = (json.departures ?? [])
          .filter((d: any) => d.line?.toLowerCase().includes(line.toLowerCase()))
          .filter((d: any) => minutesUntil(d.time) >= 0)
          .sort((a: any, b: any) => minutesUntil(a.time) - minutesUntil(b.time))[0];
        if (next?.time) {
          const dep = new Date(next.time);
          const hhmm = `${String(dep.getHours()).padStart(2, '0')}:${String(dep.getMinutes()).padStart(2, '0')}`;
          writeChar(TRANSIT_TIME_CHAR_UUID, hhmm);
        }
      } catch (e) { console.warn('[Transit push] fetch failed:', e); }
    }
    pushTransitToDevice();
    const id = setInterval(pushTransitToDevice, 30_000);
    return () => clearInterval(id);
  }, [bleStatus, writeChar]);

  useEffect(() => {
    if (bleStatus !== 'connected' || !activeMood) return;
    writeChar(MOOD_CHAR_UUID, activeMood);
  }, [activeMood, bleStatus, writeChar]);

  useEffect(() => {
    if (bleStatus !== 'connected' || !activeMood) return;
    const id = setTimeout(() => writeChar(MOOD_CHAR_UUID, activeMood), 1000);
    return () => clearTimeout(id);
  }, [bleStatus]);

  // ── Load recs — only called explicitly, never automatically ──────────────
  const loadRecs = useCallback(async (tk: string, mood: Mood) => {
    // Skip if we already have recs for this exact mood
    if (loadedRecsMoodRef.current === mood && recTracks.length > 0) return;
    loadedRecsMoodRef.current = mood;
    setRecLoading(true);
    try {
      const r = await getMoodRecommendations(tk, mood, 20);
      setRecTracks(r.tracks as Track[]);
    } catch (e) { console.error('Recs error:', e); }
    finally { setRecLoading(false); }
  }, [recTracks.length]);

  // ── Mood prediction — updates mood state only, never touches recs ─────────
  const predictMood = useCallback(async () => {
    if (bleStatus !== 'connected' || !bleData.heartRate) return;
    setPredicting(true);
    setPredictError(null);
    try {
      const res = await fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({
          user_id: 'dev_user',
          heart_rate: bleData.heartRate,
          steps_last_minute: bleData.steps ?? 0,
          current_track: nowPlaying ? `${nowPlaying.songTitle} by ${nowPlaying.artistName}` : null,
          location_variance: 0.00003,
          timestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const mood = json.mood as Mood;
      setPredictionConf(json.confidence ?? 0);
      // Only update mood state — do NOT trigger loadRecs here
      if (moodSource !== 'manual') {
        setActiveMood(mood);
        setGlobalMood(mood);
        setMoodSource('auto');
        // Invalidate cached recs if mood changed so next tab open refetches
        if (loadedRecsMoodRef.current !== mood) {
          loadedRecsMoodRef.current = null;
          setRecTracks([]);
        }
      }
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      if (msg.includes('404')) setPredictError('Mood server unreachable — update BACKEND_URL.');
      else if (msg.includes('429')) setPredictError('Rate limited — will retry later.');
      else console.warn('[Predict]', msg);
    } finally { setPredicting(false); }
  }, [bleStatus, bleData.heartRate, bleData.steps, nowPlaying, moodSource, setGlobalMood]);

  useEffect(() => {
    predictMood();
    predictTimerRef.current = setInterval(predictMood, PREDICT_MS);
    return () => { if (predictTimerRef.current) clearInterval(predictTimerRef.current); };
  }, [predictMood]);

  // ── Tab switch — load recs only when user opens the Vibes tab ─────────────
  const handleTabPress = useCallback((newTab: 'charts' | 'vibes') => {
    setTab(newTab);
    if (newTab === 'vibes' && token && activeMood) {
      loadRecs(token, activeMood);
    }
  }, [token, activeMood, loadRecs]);

  // ── Manual mood override ──────────────────────────────────────────────────
  const handleManualMood = useCallback((mood: Mood) => {
    setActiveMood(mood);
    setGlobalMood(mood);
    setMoodSource('manual');
    // Invalidate so next Vibes tab open refetches for the new mood
    loadedRecsMoodRef.current = null;
    setRecTracks([]);
    // If already on Vibes tab, load immediately
    if (tab === 'vibes' && token) {
      loadRecs(token, mood);
    }
  }, [token, tab, setGlobalMood, loadRecs]);

  const handleTrackPress = useCallback((track: Track) => {
    Linking.openURL(track.uri).catch(() => Linking.openURL(track.external_urls.spotify));
  }, []);

  const handleNowPlayingOpen = useCallback(() => {
    if (!nowPlaying) return;
    Linking.openURL(nowPlaying.trackUri).catch(() => {});
  }, [nowPlaying]);

  const handleQueueAll = useCallback(async () => {
    if (!token || recTracks.length === 0) return;
    Linking.openURL(recTracks[0].uri).catch(() => Linking.openURL(recTracks[0].external_urls.spotify));
    if (recTracks.length > 1) {
      setQueuingTracks(true);
      try {
        const result = await queueAllTracks(token, recTracks.slice(1) as SpotifyTrack[]);
        if (result.queued > 0) Alert.alert('Added to Queue', `Queued ${result.queued} more tracks.`, [{ text: 'OK' }]);
      } catch (e) { console.error('Queue error:', e); }
      finally { setQueuingTracks(false); }
    }
  }, [token, recTracks]);

  const moodColor = activeMood ? (MOOD_COLOR[activeMood] ?? C.blue) : C.textTert;
  const moodLabel = activeMood ? (MOOD_LABEL[activeMood] ?? activeMood) : 'Not detected';

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.title}>Playlist</Text>
            <Text style={S.subtitle}>Mood-powered music</Text>
          </View>
          {token && (
            <Pressable
              onPress={() => {
                setToken(null); setNowPlayingToken(null);
                setArtists([]); setTopTracks([]); setRecTracks([]);
                loadedRecsMoodRef.current = null;
              }}
              style={S.reloginBtn}
            >
              <Ionicons name="refresh-outline" size={14} color={C.blue} />
              <Text style={S.reloginText}>Re-login</Text>
            </Pressable>
          )}
        </View>

        {/* Now Playing */}
        {token && nowPlaying && (
          <NowPlayingCard np={nowPlaying} onOpen={handleNowPlayingOpen} />
        )}

        {/* Mood card */}
        <View style={[S.moodCard, cardShadow]}>
          <View style={S.moodCardLeft}>
            <Text style={S.moodCardMeta}>
              {moodSource === 'manual' ? 'MANUALLY SET' : bleStatus === 'connected' ? 'DETECTED MOOD' : 'NO DEVICE'}
            </Text>
            <Text style={[S.moodCardValue, { color: moodColor }]}>{moodLabel}</Text>
            <Text style={S.moodCardSub}>
              {moodSource === 'auto'     ? `${Math.round(predictionConf * 100)}% confidence`
               : moodSource === 'manual' ? 'Override active'
               : bleStatus === 'connected' ? 'Waiting for reading…'
               : 'Connect device or override below'}
            </Text>
            {predictError && <Text style={S.predictError}>{predictError}</Text>}
            {predicting && !predictError && (
              <View style={S.predictingRow}>
                <ActivityIndicator size="small" color={C.blue} />
                <Text style={S.predictingText}>Analysing…</Text>
              </View>
            )}
          </View>
          <View style={[S.moodColorDot, { backgroundColor: moodColor + '20' }]}>
            <View style={[S.moodColorDotInner, { backgroundColor: moodColor }]} />
          </View>
        </View>

        {/* Override chips */}
        <Text style={S.sectionLabel}>OVERRIDE MOOD</Text>
        <View style={S.chipsRow}>
          {MOOD_LABELS.map(m => (
            <MoodChip key={m} mood={m} active={activeMood === m && moodSource === 'manual'} onPress={() => handleManualMood(m)} />
          ))}
        </View>

        {/* Spotify section */}
        {!token ? (
          <View style={[S.connectCard, cardShadow]}>
            <View style={[S.spotifyIconBox, { backgroundColor: C.spotify + '15' }]}>
              <Ionicons name="musical-notes" size={32} color={C.spotify} />
            </View>
            <Text style={S.connectTitle}>Connect Spotify</Text>
            <Text style={S.connectSub}>Login to see what you're playing and get mood-based recommendations</Text>
            <Pressable disabled={!request} onPress={() => promptAsync?.()}
              style={({ pressed }) => [S.connectBtn, pressed && { opacity: 0.8 }]}>
              <Text style={S.connectBtnText}>Login with Spotify</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <ActivityIndicator color={C.spotify} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={S.tabBar}>
              {(['charts', 'vibes'] as const).map(t => (
                <Pressable key={t} onPress={() => handleTabPress(t)}
                  style={[S.tabBtn, tab === t && { backgroundColor: C.card, ...cardShadow }]}>
                  <Text style={[S.tabText, tab === t && { color: C.text, fontWeight: '600' }]}>
                    {t === 'charts' ? 'Top Charts' : activeMood ? `${MOOD_LABEL[activeMood]} Vibes` : 'Vibes'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === 'charts' ? (
              <>
                <Text style={S.sectionLabel}>TOP ARTISTS</Text>
                <View style={[S.listCard, cardShadow]}>
                  {artists.length === 0 ? <Text style={S.emptyText}>No data yet</Text>
                    : artists.map((a, i) => <ArtistRow key={a.id} artist={a} index={i} />)}
                </View>
                <Text style={[S.sectionLabel, { marginTop: 20 }]}>TOP TRACKS</Text>
                <View style={[S.listCard, cardShadow]}>
                  {topTracks.length === 0 ? <Text style={S.emptyText}>No data yet</Text>
                    : topTracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} onPress={() => handleTrackPress(t)} />)}
                </View>
              </>
            ) : (
              <>
                <View style={S.vibesHeader}>
                  <View>
                    <Text style={S.sectionLabel}>{activeMood ? `FOR YOUR ${activeMood.toUpperCase()} MOOD` : 'RECOMMENDED'}</Text>
                    {artists.length > 0 && activeMood && (
                      <Text style={S.vibesBase}>Based on your listening history</Text>
                    )}
                  </View>
                  {recTracks.length > 0 && (
                    <Pressable onPress={handleQueueAll} disabled={queuingTracks}
                      style={({ pressed }) => [S.playAllBtn, (pressed || queuingTracks) && { opacity: 0.7 }]}>
                      {queuingTracks ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="play" size={13} color="#fff" />}
                      <Text style={S.playAllText}>{queuingTracks ? 'Queuing…' : 'Play All'}</Text>
                    </Pressable>
                  )}
                </View>
                {recLoading ? (
                  <ActivityIndicator color={C.spotify} style={{ marginTop: 40 }} />
                ) : recTracks.length > 0 ? (
                  <>
                    <Text style={S.tapHint}>Tap a track to open · Play All to queue everything</Text>
                    <View style={[S.listCard, cardShadow]}>
                      {recTracks.map((t, i) => <TrackRow key={t.id} track={t} index={i} onPress={() => handleTrackPress(t)} />)}
                    </View>
                  </>
                ) : (
                  <View style={[S.emptyCard, cardShadow]}>
                    <Ionicons name="musical-notes-outline" size={32} color={C.textTert} />
                    <Text style={S.emptyCardText}>
                      {activeMood ? `Tap the tab above to load your ${MOOD_LABEL[activeMood].toLowerCase()} picks` : 'Select a mood to see recommendations'}
                    </Text>
                  </View>
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

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  title:  { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: C.textTert, marginTop: 2 },
  reloginBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, ...cardShadow },
  reloginText: { fontSize: 12, fontWeight: '600', color: C.blue },

  moodCard:          { backgroundColor: C.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  moodCardLeft:      { flex: 1 },
  moodCardMeta:      { fontSize: 10, fontWeight: '700', color: C.textTert, letterSpacing: 1, marginBottom: 4 },
  moodCardValue:     { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  moodCardSub:       { fontSize: 12, color: C.textTert },
  predictingRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  predictingText:    { fontSize: 12, color: C.blue },
  predictError:      { fontSize: 11, color: C.orange, marginTop: 6, lineHeight: 16 },
  moodColorDot:      { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginLeft: 16 },
  moodColorDotInner: { width: 24, height: 24, borderRadius: 12 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textTert, letterSpacing: 1, marginBottom: 10 },
  chipsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },

  connectCard:    { backgroundColor: C.card, borderRadius: 20, padding: 28, alignItems: 'center', marginTop: 8 },
  spotifyIconBox: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  connectTitle:   { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 6 },
  connectSub:     { fontSize: 13, color: C.textTert, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  connectBtn:     { backgroundColor: C.spotify, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  tabBar:  { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 },
  tabBtn:  { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabText: { fontSize: 13, fontWeight: '500', color: C.textTert },

  vibesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  vibesBase:   { fontSize: 11, color: C.textTert, marginTop: 2 },
  playAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.spotify, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  playAllText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tapHint:     { fontSize: 11, color: C.textTert, textAlign: 'center', marginBottom: 10 },

  listCard:      { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', marginBottom: 4 },
  emptyText:     { padding: 20, textAlign: 'center', fontSize: 14, color: C.textTert },
  emptyCard:     { backgroundColor: C.card, borderRadius: 20, padding: 36, alignItems: 'center', gap: 12 },
  emptyCardText: { fontSize: 14, color: C.textTert, textAlign: 'center' },
});