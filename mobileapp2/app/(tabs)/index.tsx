import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  StatusBar,
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBle } from '@/lib/BleContext';
import { useMood } from '@/lib/MoodContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#F2F2F7',
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
  happy:    '#FF9500',
  neutral:  '#007AFF',
  stressed: '#FF3B30',
  angry:    '#FF3B30',
  sad:      '#5856D6',
  sleepy:   '#AF52DE',
};

const MOOD_LABEL: Record<string, string> = {
  happy:    'Happy',
  neutral:  'Neutral',
  stressed: 'Stressed',
  angry:    'Angry',
  sad:      'Sad',
  sleepy:   'Sleepy',
};

// ─── Transit ──────────────────────────────────────────────────────────────────
const TRANSIT_URL = 'https://ffed-141-117-117-125.ngrok-free.app/api/transit/next';
const STORAGE_KEY = 'commute_selected_line';

function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}
function trainColor(mins: number) {
  if (mins <= 3) return C.red;
  if (mins <= 8) return C.orange;
  return C.green;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, deviceName, data, connect, disconnect, error, clearError } = useBle();
  const { mood } = useMood();

  const [nextTrain,    setNextTrain]    = useState<{ dest: string; mins: number; line: string } | null>(null);
  const [trainLine,    setTrainLine]    = useState<string | null>(null);
  const [trainLoading, setTrainLoading] = useState(false);

  const isConnected = status === 'connected';

  // Only show live data when connected
  const steps     = isConnected ? (data.steps     ?? 0)    : 0;
  const heartRate = isConnected ? (data.heartRate  ?? null) : null;
  const battery   = isConnected ? (data.batteryPercent ?? null) : null;
  const stepPct   = Math.min((steps / 10000) * 100, 100);

  const activeMood = mood ?? null;
  const moodColor  = activeMood ? (MOOD_COLOR[activeMood] ?? C.blue) : C.textTert;
  const moodLabel  = activeMood ? (MOOD_LABEL[activeMood] ?? activeMood) : 'Not detected';

  // Re-read transit line every time this tab is focused so changes from the Commute tab are picked up
  useFocusEffect(
    useCallback(() => {
      import('@react-native-async-storage/async-storage').then(async m => {
        const val = await m.default.getItem(STORAGE_KEY);
        setTrainLine(val ?? null);
      });
    }, [])
  );

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
    if (isConnected) { disconnect(); return; }
    if (error) {
      Alert.alert('BLE Error', error, [{ text: 'Retry', onPress: () => { clearError(); connect(); } }, { text: 'Cancel' }]);
      return;
    }
    connect();
  };

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

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
              {isConnected
                ? (deviceName ?? 'Connected')
                : status === 'scanning'   ? 'Scanning…'
                : status === 'connecting' ? 'Connecting…'
                : 'Connect'}
            </Text>
          </Pressable>
        </View>

        {/* ── Not connected banner ── */}
        {!isConnected && status === 'disconnected' && (
          <Pressable onPress={connect} style={S.banner}>
            <Ionicons name="bluetooth-outline" size={16} color={C.blue} />
            <Text style={S.bannerText}>Tap to connect your Commubu device</Text>
            <Ionicons name="chevron-forward" size={14} color={C.blue} />
          </Pressable>
        )}

        {/* ── Mood hero card ── */}
        <View style={S.moodCard}>
          <View style={S.moodCardLeft}>
            <Text style={S.moodCardLabel}>Current Mood</Text>
            <Text style={[S.moodCardValue, { color: moodColor }]}>{moodLabel}</Text>
            <Text style={S.moodCardNote}>
              {activeMood ? 'Override in Playlist tab' : 'Detected from device or set manually'}
            </Text>
          </View>
          <View style={[S.moodEmojiBubble, { backgroundColor: moodColor + '18' }]}>
            <Text style={S.moodEmojiText}>
              {activeMood === 'happy'    ? '( ^‿^ )'   :
               activeMood === 'sad'     ? '( ; _ ; )' :
               activeMood === 'angry'   ? '( >_< )'   :
               activeMood === 'stressed'? '( ⊙﹏⊙ )'  :
               activeMood === 'sleepy'  ? '( -_-) z'  :
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
            {isConnected ? (
              <>
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
              </>
            ) : (
              <>
                <Text style={[S.cardValue, { color: C.textTert }]}>--</Text>
                <Text style={S.cardSub}>Device not connected</Text>
              </>
            )}
          </View>

          {/* Heart Rate */}
          <View style={[S.card, S.cardHalf]}>
            <View style={S.cardTopRow}>
              <Text style={S.cardLabel}>Heart Rate</Text>
              <View style={[S.iconChip, { backgroundColor: C.red + '15' }]}>
                <Ionicons name="heart-outline" size={14} color={C.red} />
              </View>
            </View>
            {isConnected ? (
              <>
                <View style={S.hrRow}>
                  <Text style={[S.cardValue, { color: heartRate ? C.text : C.textTert }]}>
                    {heartRate ?? '--'}
                  </Text>
                  {heartRate && <Text style={S.hrUnit}>bpm</Text>}
                </View>
                <Text style={S.cardSub}>
                  {heartRate
                    ? heartRate > 100 ? 'Elevated' : heartRate < 60 ? 'Resting' : 'Normal'
                    : 'Waiting for signal…'}
                </Text>
                {heartRate && (
                  <View style={S.hrBar}>
                    <View style={[S.hrFill, {
                      width: `${Math.min(((heartRate - 40) / 160) * 100, 100)}%` as any,
                      backgroundColor: heartRate > 100 ? C.orange : heartRate < 60 ? C.blue : C.green,
                    }]} />
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={[S.cardValue, { color: C.textTert }]}>--</Text>
                <Text style={S.cardSub}>Device not connected</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Battery strip (only when connected) ── */}
        {isConnected && battery !== null && (
          <View style={[S.card, S.batteryRow]}>
            <Ionicons
              name={battery > 20 ? 'battery-half-outline' : 'battery-dead-outline'}
              size={18}
              color={battery > 20 ? C.green : C.red}
            />
            <Text style={S.batteryLabel}>Device battery</Text>
            <View style={S.batteryTrack}>
              <View style={[S.batteryFill, {
                width: `${battery}%` as any,
                backgroundColor: battery > 20 ? C.green : C.red,
              }]} />
            </View>
            <Text style={[S.batteryPct, { color: battery > 20 ? C.green : C.red }]}>
              {battery}%
            </Text>
          </View>
        )}

        {/* ── Next train ── */}
        <View style={S.card}>
          <View style={S.cardTopRow}>
            <View>
              <Text style={S.cardLabel}>Next Train</Text>
              {trainLine && (
                <Text style={{ fontSize: 11, color: C.indigo, fontWeight: '600', marginTop: 1 }}>
                  {trainLine}
                </Text>
              )}
            </View>
            <View style={[S.iconChip, { backgroundColor: C.indigo + '15' }]}>
              <Ionicons name="train-outline" size={14} color={C.indigo} />
            </View>
          </View>

          {!trainLine ? (
            <Text style={S.trainEmptyText}>Select a GO line in the Commute tab</Text>
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

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  greeting: { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: C.textTert, marginTop: 2 },
  bleBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  bleText:  { fontSize: 12, fontWeight: '600' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.blue + '10', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500', color: C.blue },

  moodCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  moodCardLeft:    { flex: 1 },
  moodCardLabel:   { fontSize: 12, color: C.textTert, fontWeight: '500', marginBottom: 4 },
  moodCardValue:   { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  moodCardNote:    { fontSize: 12, color: C.textTert },
  moodEmojiBubble: { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 16 },
  moodEmojiText:   { fontSize: 13, color: C.textSec, fontWeight: '600', textAlign: 'center' },
  moodEmojiNote:   { fontSize: 9, marginTop: 4, fontWeight: '500', opacity: 0.7 },

  row:      { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardHalf:   { flex: 1, marginBottom: 0 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel:  { fontSize: 13, color: C.textTert, fontWeight: '500' },
  cardValue:  { fontSize: 32, fontWeight: '700', color: C.text, letterSpacing: -1, marginBottom: 2 },
  cardSub:    { fontSize: 12, color: C.textTert, marginBottom: 10 },
  iconChip:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  progressTrack: { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressPct:   { fontSize: 11, fontWeight: '700' },

  hrRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  hrUnit: { fontSize: 14, color: C.textTert, fontWeight: '500', marginBottom: 2 },
  hrBar:  { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  hrFill: { height: '100%', borderRadius: 3 },

  batteryRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  batteryLabel: { fontSize: 13, color: C.textTert, fontWeight: '500' },
  batteryTrack: { flex: 1, height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden' },
  batteryFill:  { height: '100%', borderRadius: 3 },
  batteryPct:   { fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  trainRow:       { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  trainDest:      { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  trainLineName:  { fontSize: 13, color: C.textTert, marginTop: 2 },
  trainMinsBadge: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8, minWidth: 68 },
  trainMinsNum:   { fontSize: 30, fontWeight: '800', lineHeight: 34, letterSpacing: -1 },
  trainMinsUnit:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  trainEmptyText: { fontSize: 14, color: C.textTert, marginTop: 4 },
});