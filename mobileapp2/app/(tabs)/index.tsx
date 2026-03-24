import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { View, Text } from '@/components/Themed';
import { useBle, ConnectionStatus } from '@/lib/BleContext';
import { useMood } from '@/lib/MoodContext';

const { width } = Dimensions.get('window');

// ─── Mood palette — each mood owns a full gradient identity ──────────────────
const MOOD_THEME: Record<string, {
  grad:    readonly [string, string, string];
  accent:  string;
  label:   string;
  sub:     string;
  tip:     string;
}> = {
  happy: {
    grad:   ['#FF6B6B', '#FF8E53', '#FFC371'],
    accent: '#FFF0C0',
    label:  'Happy',
    sub:    'Feeling great today',
    tip:    'Keep that energy going on your commute!',
  },
  neutral: {
    grad:   ['#4776E6', '#5B7FFF', '#8E54E9'],
    accent: '#C8D8FF',
    label:  'Neutral',
    sub:    'Just cruising along',
    tip:    'A calm commute is a productive one.',
  },
  stressed: {
    grad:   ['#F7971E', '#FF5F6D', '#FFC371'],
    accent: '#FFE0C0',
    label:  'Stressed',
    sub:    'Running on fumes',
    tip:    'Box breathe: 4s in · 4s hold · 4s out',
  },
  angry: {
    grad:   ['#C0392B', '#E74C3C', '#F39C12'],
    accent: '#FFD0C0',
    label:  'Angry',
    sub:    'Watch out!',
    tip:    'Your stop is coming. Almost there.',
  },
  sad: {
    grad:   ['#2193B0', '#6DD5ED', '#8E54E9'],
    accent: '#D0E8FF',
    label:  'Sad',
    sub:    'Need a moment',
    tip:    "It's okay not to be okay. Music helps.",
  },
  sleepy: {
    grad:   ['#5C258D', '#9B59B6', '#4FACFE'],
    accent: '#E0D0FF',
    label:  'Sleepy',
    sub:    'Zzz... commuting',
    tip:    'Lean back, let the train do the work.',
  },
};

const DEFAULT_MOOD = 'neutral';

// ─── BLE status ───────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ConnectionStatus, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  disconnected: { color: 'rgba(255,255,255,0.45)', icon: 'bluetooth-outline' },
  scanning:     { color: '#FFD700',                icon: 'search-outline'    },
  connecting:   { color: '#87CEFA',                icon: 'bluetooth-outline' },
  connected:    { color: '#7FFF9B',                icon: 'bluetooth'         },
};

// ─── Commute next train fetcher ───────────────────────────────────────────────
const TRANSIT_URL = 'https://7685-141-117-117-240.ngrok-free.app/api/transit/next';
const STORAGE_KEY = 'commute_selected_line';

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, deviceName, data, connect, disconnect, error } = useBle();
  const { mood } = useMood();

  const activeMood  = (mood ?? DEFAULT_MOOD) as string;
  const theme       = MOOD_THEME[activeMood] ?? MOOD_THEME[DEFAULT_MOOD];
  const bleStatus   = STATUS_CFG[status];
  const isConnected = status === 'connected';

  // Next train state
  const [nextTrain, setNextTrain]   = useState<{ dest: string; mins: number; line: string } | null>(null);
  const [trainLine, setTrainLine]   = useState<string | null>(null);
  const [trainLoading, setTrainLoading] = useState(false);

  // Load saved line + fetch departure
  useEffect(() => {
    let mounted = true;

    async function loadLine() {
      try {
        // Dynamic import to avoid SSR issues
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && mounted) setTrainLine(saved);
      } catch {}
    }
    loadLine();
    return () => { mounted = false; };
  }, []);

  const fetchTrain = useCallback(async () => {
    if (!trainLine) return;
    setTrainLoading(true);
    try {
      const res  = await fetch(TRANSIT_URL, { headers: { 'ngrok-skip-browser-warning': '1' } });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      const deps: any[] = (json.departures ?? [])
        .filter((d: any) => d.line?.toLowerCase().includes(trainLine.toLowerCase()))
        .filter((d: any) => minutesUntil(d.time) > -1)
        .slice(0, 1);

      if (deps.length > 0) {
        setNextTrain({ dest: deps[0].destination, mins: minutesUntil(deps[0].time), line: deps[0].line });
      }
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
    if (isConnected) disconnect(); else connect();
  };

  // Steps display
  const steps    = isConnected && data.steps    != null ? data.steps    : null;
  const heartRate= isConnected && data.heartRate != null ? data.heartRate : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ════════════════════════════════════════
            HERO — full-bleed gradient section
        ════════════════════════════════════════ */}
        <LinearGradient
          colors={theme.grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 16 }]}
        >
          {/* Top row: app name + BLE pill */}
          <View style={styles.heroTop}>
            <Text style={styles.heroAppName}>COMMUBU</Text>
            <Pressable onPress={handleBle} style={styles.blePill} hitSlop={12}>
              {status === 'scanning' || status === 'connecting'
                ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 5 }} />
                : <Ionicons name={bleStatus.icon} size={13} color={bleStatus.color} style={{ marginRight: 4 }} />
              }
              <Text style={[styles.blePillText, { color: bleStatus.color }]}>
                {isConnected ? (deviceName ?? 'Connected') : status === 'disconnected' ? 'Connect device' : status === 'scanning' ? 'Scanning...' : 'Connecting...'}
              </Text>
            </Pressable>
          </View>

          {/* Character placeholder */}
          <View style={styles.charPlaceholder}>
            <Text style={styles.charAscii}>( ^_^ )</Text>
            <Text style={styles.charNote}>Character art coming soon</Text>
          </View>

          {/* Mood identity */}
          <View style={styles.heroMood}>
            <Text style={styles.heroMoodLabel}>{theme.label}</Text>
            <Text style={styles.heroMoodSub}>{theme.sub}</Text>
          </View>

          {/* Inline stats row — steps + HR */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{steps != null ? steps.toLocaleString() : '--'}</Text>
              <Text style={styles.heroStatLabel}>STEPS</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{heartRate != null ? heartRate : '--'}</Text>
              <Text style={styles.heroStatLabel}>BPM</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{mood ? theme.label : '--'}</Text>
              <Text style={styles.heroStatLabel}>MOOD</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ════════════════════════════════════════
            BODY — white section, flows from hero
        ════════════════════════════════════════ */}
        <View style={styles.body}>

          {/* ── Next train ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NEXT TRAIN</Text>
            {!trainLine ? (
              <View style={styles.trainEmpty}>
                <Ionicons name="train-outline" size={28} color="#CBD5E1" />
                <Text style={styles.trainEmptyText}>Select a GO line in the Commute tab</Text>
              </View>
            ) : trainLoading ? (
              <View style={styles.trainEmpty}>
                <ActivityIndicator color="#CBD5E1" />
              </View>
            ) : nextTrain ? (
              <View style={styles.trainRow}>
                <View style={styles.trainLeft}>
                  <Text style={styles.trainDest} numberOfLines={1}>{nextTrain.dest}</Text>
                  <Text style={styles.trainLine}>{nextTrain.line}</Text>
                </View>
                <View style={[
                  styles.trainMins,
                  { backgroundColor: nextTrain.mins <= 3 ? '#FEE2E2' : nextTrain.mins <= 8 ? '#FEF3C7' : '#F0FDF4' },
                ]}>
                  <Text style={[
                    styles.trainMinsNum,
                    { color: nextTrain.mins <= 3 ? '#DC2626' : nextTrain.mins <= 8 ? '#D97706' : '#16A34A' },
                  ]}>
                    {nextTrain.mins}
                  </Text>
                  <Text style={[
                    styles.trainMinsUnit,
                    { color: nextTrain.mins <= 3 ? '#DC2626' : nextTrain.mins <= 8 ? '#D97706' : '#16A34A' },
                  ]}>min</Text>
                </View>
              </View>
            ) : (
              <View style={styles.trainEmpty}>
                <Text style={styles.trainEmptyText}>No upcoming departures found</Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ── Mood tip ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TODAY'S TIP</Text>
            <Text style={styles.tipText}>{theme.tip}</Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ── Override nudge ── */}
          <Pressable style={styles.nudgeRow}>
            <View style={[styles.nudgeIconBox, { backgroundColor: theme.grad[0] + '18' }]}>
              <Ionicons name="musical-notes-outline" size={16} color={theme.grad[0]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nudgeTitle}>Override your mood</Text>
              <Text style={styles.nudgeSub}>Go to Playlist tab to manually set your vibe</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
          </Pressable>

        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#FFFFFF' },
  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Hero ──
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroAppName: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: '429Font',
    color: '#FFFFFF',
    letterSpacing: 3,
    opacity: 0.95,
  },
  blePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  blePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Character placeholder
  charPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  charAscii: {
    fontSize: 52,
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 4,
  },
  charNote: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
    letterSpacing: 0.5,
  },

  // Mood
  heroMood: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroMoodLabel: {
    fontSize: 38,
    fontWeight: '900',
    fontFamily: '429Font',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  heroMoodSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginTop: 4,
  },

  // Stats row
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  heroStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // ── Body ──
  body: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    paddingTop: 28,
    paddingHorizontal: 24,
    flex: 1,
  },

  section:      { paddingVertical: 6 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 20,
  },

  // Train
  trainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trainLeft:     { flex: 1, marginRight: 16 },
  trainDest:     { fontSize: 20, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  trainLine:     { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  trainMins: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 72,
  },
  trainMinsNum:  { fontSize: 28, fontWeight: '900', lineHeight: 32 },
  trainMinsUnit: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  trainEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  trainEmptyText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },

  // Tip
  tipText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
    lineHeight: 23,
  },

  // Override nudge
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  nudgeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  nudgeSub:   { fontSize: 12, color: '#94A3B8', marginTop: 1 },
});