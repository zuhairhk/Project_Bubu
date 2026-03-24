import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  StatusBar,
  View,
  Text,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useBle, ConnectionStatus } from '@/lib/BleContext';
import { useMood } from '@/lib/MoodContext';

const { width } = Dimensions.get('window');

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#F2F2F7',   // iOS system grouped background
  card:     '#FFFFFF',
  text:     '#000000',
  textSec:  '#3C3C43',
  textTert: '#8E8E93',
  sep:      '#C6C6C8',
  blue:     '#007AFF',
  green:    '#34C759',
  orange:   '#FF9500',
  red:      '#FF3B30',
  purple:   '#AF52DE',
  indigo:   '#5856D6',
};

const MOOD_COLOR: Record<string, string> = {
  happy:   '#FF9500',
  neutral: '#007AFF',
  stressed:'#FF3B30',
  angry:   '#FF3B30',
  sad:     '#5856D6',
  sleepy:  '#AF52DE',
};

const MOOD_LABEL: Record<string, string> = {
  happy:   'Happy',
  neutral: 'Neutral',
  stressed:'Stressed',
  angry:   'Angry',
  sad:     'Sad',
  sleepy:  'Sleepy',
};

// ─── Transit ─────────────────────────────────────────────────────────────────
const TRANSIT_URL = 'https://7685-141-117-117-240.ngrok-free.app/api/transit/next';
const STORAGE_KEY = 'commute_selected_line';

function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

function trainColor(mins: number) {
  if (mins <= 3)  return C.red;
  if (mins <= 8)  return C.orange;
  return C.green;
}

// ─── Step ring ────────────────────────────────────────────────────────────────
function StepRing({ pct, steps }: { pct: number; steps: number }) {
  const size  = 100;
  const sw    = 8;
  const r     = (size - sw) / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * Math.min(pct / 100, 1);

  // Pure SVG-like with View arcs approximated via border trick
  // We use a segmented bar instead — cleaner in RN
  const filled = Math.round((pct / 100) * 20);

  return (
    <View style={ringStyles.wrap}>
      <View style={ringStyles.dotsRow}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={[
              ringStyles.dot,
              { backgroundColor: i < filled ? C.blue : '#E5E5EA' },
            ]}
          />
        ))}
      </View>
      <View style={ringStyles.center}>
        <Text style={ringStyles.num}>{steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps}</Text>
        <Text style={ringStyles.label}>steps</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  wrap:    { alignItems: 'center' },
  dotsRow: { flexDirection: 'row', flexWrap: 'wrap', width: 120, gap: 4, justifyContent: 'center' },
  dot:     { width: 10, height: 10, borderRadius: 5 },
  center:  { marginTop: 8, alignItems: 'center' },
  num:     { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  label:   { fontSize: 12, color: C.textTert, fontWeight: '500' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, deviceName, data, connect, disconnect, error } = useBle();
  const { mood } = useMood();

  const [nextTrain, setNextTrain]     = useState<{ dest: string; mins: number; line: string } | null>(null);
  const [trainLine, setTrainLine]     = useState<string | null>(null);
  const [trainLoading, setTrainLoading] = useState(false);

  const isConnected = status === 'connected';
  const steps       = data.steps    ?? 0;
  const heartRate   = data.heartRate ?? null;
  const stepPct     = Math.min((steps / 10000) * 100, 100);

  const activeMood   = mood ?? null;
  const moodColor    = activeMood ? (MOOD_COLOR[activeMood] ?? C.blue) : C.textTert;
  const moodLabel    = activeMood ? (MOOD_LABEL[activeMood] ?? activeMood) : 'Not detected';

  // Load saved transit line
  useEffect(() => {
    import('@react-native-async-storage/async-storage').then(async m => {
      const val = await m.default.getItem(STORAGE_KEY);
      if (val) setTrainLine(val);
    });
  }, []);

  // Fetch next departure
  const fetchTrain = useCallback(async () => {
    if (!trainLine) return;
    setTrainLoading(true);
    try {
      const res  = await fetch(TRANSIT_URL, { headers: { 'ngrok-skip-browser-warning': '1' } });
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      const dep  = (json.departures ?? [])
        .filter((d: any) => d.line?.toLowerCase().includes(trainLine.toLowerCase()))
        .filter((d: any) => minutesUntil(d.time) >= 0)
        .sort((a: any, b: any) => minutesUntil(a.time) - minutesUntil(b.time))[0];
      setNextTrain(dep ? { dest: dep.destination, mins: minutesUntil(dep.time), line: dep.line } : null);
    } catch {
      setNextTrain(null);
    } finally {
      setTrainLoading(false);
    }
  }, [trainLine]);

  useEffect(() => {
    fetchTrain();
    const id = setInterval(fetchTrain, 30_000);
    return () => clearInterval(id);
  }, [fetchTrain]);

  const handleBle = () => {
    if (error) { Alert.alert('BLE Error', error, [{ text: 'OK' }]); return; }
    isConnected ? disconnect() : connect();
  };

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        contentContainerStyle={S.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={S.header}>
          <View>
            <Text style={S.greeting}>Good morning</Text>
            <Text style={S.subtitle}>Here's your commute snapshot</Text>
          </View>
          <Pressable onPress={handleBle} hitSlop={12} style={S.bleBtn}>
            {(status === 'scanning' || status === 'connecting') ? (
              <ActivityIndicator size="small" color={C.blue} />
            ) : (
              <Ionicons
                name={isConnected ? 'bluetooth' : 'bluetooth-outline'}
                size={16}
                color={isConnected ? C.green : C.textTert}
              />
            )}
            <Text style={[S.bleText, { color: isConnected ? C.green : C.textTert }]}>
              {isConnected ? (deviceName ?? 'Connected') : status === 'disconnected' ? 'Connect' : status === 'scanning' ? 'Scanning' : 'Connecting'}
            </Text>
          </Pressable>
        </View>

        {/* ── Mood hero card ── */}
        <View style={S.moodCard}>
          <View style={S.moodCardLeft}>
            <Text style={S.moodCardLabel}>Current Mood</Text>
            <Text style={[S.moodCardValue, { color: moodColor }]}>{moodLabel}</Text>
            <Text style={S.moodCardNote}>
              {activeMood
                ? 'Override in Playlist tab'
                : 'Detected from device or set manually'}
            </Text>
          </View>
          <View style={[S.moodEmojiBubble, { backgroundColor: moodColor + '18' }]}>
            <Text style={S.moodEmojiText}>
              {activeMood === 'happy'   ? '( ^‿^ )' :
               activeMood === 'sad'    ? '( ; _ ; )' :
               activeMood === 'angry'  ? '( >_< )' :
               activeMood === 'stressed'? '( ⊙﹏⊙ )' :
               activeMood === 'sleepy' ? '( -_-) z' :
               '( ·_· )'}
            </Text>
            <Text style={[S.moodEmojiNote, { color: moodColor }]}>placeholder art</Text>
          </View>
        </View>

        {/* ── 2-col row: Steps + Heart Rate ── */}
        <View style={S.row}>
          {/* Steps */}
          <View style={[S.card, S.cardHalf]}>
            <View style={S.cardTopRow}>
              <Text style={S.cardLabel}>Steps</Text>
              <View style={[S.iconChip, { backgroundColor: C.blue + '15' }]}>
                <Ionicons name="footsteps-outline" size={14} color={C.blue} />
              </View>
            </View>
            <Text style={S.cardValue}>{steps.toLocaleString()}</Text>
            <Text style={S.cardSub}>of 10,000 goal</Text>
            <View style={S.progressTrack}>
              <View style={[S.progressFill, {
                width: `${stepPct}%` as any,
                backgroundColor: stepPct >= 100 ? C.green : C.blue,
              }]} />
            </View>
            <Text style={[S.progressPct, { color: stepPct >= 100 ? C.green : C.blue }]}>
              {Math.round(stepPct)}%
            </Text>
          </View>

          {/* Heart rate */}
          <View style={[S.card, S.cardHalf]}>
            <View style={S.cardTopRow}>
              <Text style={S.cardLabel}>Heart Rate</Text>
              <View style={[S.iconChip, { backgroundColor: C.red + '15' }]}>
                <Ionicons name="heart-outline" size={14} color={C.red} />
              </View>
            </View>
            <View style={S.hrRow}>
              <Text style={[S.cardValue, { color: heartRate ? C.text : C.textTert }]}>
                {heartRate ?? '--'}
              </Text>
              {heartRate && <Text style={S.hrUnit}>bpm</Text>}
            </View>
            <Text style={S.cardSub}>
              {heartRate
                ? heartRate > 100 ? 'Elevated' : heartRate < 60 ? 'Resting' : 'Normal'
                : 'No signal yet'}
            </Text>
            {heartRate && (
              <View style={S.hrBar}>
                <View style={[S.hrFill, {
                  width: `${Math.min(((heartRate - 40) / 160) * 100, 100)}%` as any,
                  backgroundColor: heartRate > 100 ? C.orange : heartRate < 60 ? C.blue : C.green,
                }]} />
              </View>
            )}
          </View>
        </View>

        {/* ── Next train ── */}
        <View style={S.card}>
          <View style={S.cardTopRow}>
            <Text style={S.cardLabel}>Next Train</Text>
            <View style={[S.iconChip, { backgroundColor: C.indigo + '15' }]}>
              <Ionicons name="train-outline" size={14} color={C.indigo} />
            </View>
          </View>

          {!trainLine ? (
            <View style={S.trainEmpty}>
              <Text style={S.trainEmptyText}>Select a GO line in the Commute tab</Text>
            </View>
          ) : trainLoading ? (
            <ActivityIndicator color={C.indigo} style={{ marginTop: 12 }} />
          ) : nextTrain ? (
            <View style={S.trainRow}>
              <View style={{ flex: 1 }}>
                <Text style={S.trainDest} numberOfLines={1}>{nextTrain.dest}</Text>
                <Text style={S.trainLineName}>{nextTrain.line}</Text>
              </View>
              <View style={[S.trainMinsBadge, { backgroundColor: trainColor(nextTrain.mins) + '15' }]}>
                <Text style={[S.trainMinsNum, { color: trainColor(nextTrain.mins) }]}>
                  {nextTrain.mins}
                </Text>
                <Text style={[S.trainMinsUnit, { color: trainColor(nextTrain.mins) }]}>min</Text>
              </View>
            </View>
          ) : (
            <Text style={S.trainEmptyText}>No upcoming departures</Text>
          )}
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  // Header
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  greeting: { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: C.textTert, marginTop: 2 },
  bleBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  bleText:  { fontSize: 12, fontWeight: '600' },

  // Mood card
  moodCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  moodCardLeft:  { flex: 1 },
  moodCardLabel: { fontSize: 12, color: C.textTert, fontWeight: '500', marginBottom: 4 },
  moodCardValue: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  moodCardNote:  { fontSize: 12, color: C.textTert },
  moodEmojiBubble: { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 16 },
  moodEmojiText:   { fontSize: 13, color: C.textSec, fontWeight: '600', textAlign: 'center' },
  moodEmojiNote:   { fontSize: 9, marginTop: 4, fontWeight: '500', opacity: 0.7 },

  // Cards
  row:      { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardHalf:    { flex: 1, marginBottom: 0 },
  cardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel:   { fontSize: 13, color: C.textTert, fontWeight: '500' },
  cardValue:   { fontSize: 32, fontWeight: '700', color: C.text, letterSpacing: -1, marginBottom: 2 },
  cardSub:     { fontSize: 12, color: C.textTert, marginBottom: 10 },
  iconChip:    { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Progress
  progressTrack: { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressPct:   { fontSize: 11, fontWeight: '700' },

  // HR
  hrRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  hrUnit: { fontSize: 14, color: C.textTert, fontWeight: '500', marginBottom: 2 },
  hrBar:  { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  hrFill: { height: '100%', borderRadius: 3 },

  // Train
  trainRow:       { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  trainDest:      { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  trainLineName:  { fontSize: 13, color: C.textTert, marginTop: 2 },
  trainMinsBadge: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8, minWidth: 68 },
  trainMinsNum:   { fontSize: 30, fontWeight: '800', lineHeight: 34, letterSpacing: -1 },
  trainMinsUnit:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  trainEmpty:     { marginTop: 8, paddingVertical: 4 },
  trainEmptyText: { fontSize: 14, color: C.textTert },
});