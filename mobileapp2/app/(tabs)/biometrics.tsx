import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { View, Text, SubText, Card, useThemeColors } from '@/components/Themed';
import { useBle } from '@/lib/BleContext';

const STEP_GOAL = 10_000;

// ─── Heart rate pulse animation ───────────────────────────────────────────────
function HeartPulse({ bpm }: { bpm: number | null }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!bpm) return;
    const interval = 60_000 / bpm; // ms per beat
    const pulse = Animated.sequence([
      Animated.timing(scale, { toValue: 1.2, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.0, duration: 180, useNativeDriver: true }),
    ]);
    const loop = Animated.loop(pulse, { iterations: -1 });
    loop.start();
    const timer = setInterval(() => {
      // Re-sync on interval change (bpm change)
    }, interval);
    return () => { loop.stop(); clearInterval(timer); };
  }, [bpm]);

  return (
    <Animated.Text style={[styles.heartEmoji, { transform: [{ scale }] }]}>
      ❤️
    </Animated.Text>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({
  emoji, label, value, unit, color, big,
}: {
  emoji: string; label: string; value: string | number | null; unit?: string; color: string; big?: boolean;
}) {
  const colors = useThemeColors();
  const display = value !== null ? String(value) : '--';
  return (
    <Card style={[styles.metricCard, big && styles.bigCard]}>
      <LinearGradient
        colors={[color + '22', color + '08']}
        style={StyleSheet.absoluteFill}
        start={[0, 0]} end={[1, 1]}
      />
      <Text style={[styles.metricEmoji, big && styles.bigEmoji]}>{emoji}</Text>
      <Text style={[styles.metricValue, big && styles.bigValue, { color: colors.text }]}>
        {display}
        {value !== null && unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <SubText style={styles.metricLabel}>{label}</SubText>
    </Card>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <View style={styles.progressTrack}>
      <MotiView
        from={{ width: '0%' as any }}
        animate={{ width: `${pct}%` as any }}
        transition={{ type: 'timing', duration: 800 }}
        style={[styles.progressFill, { backgroundColor: color }]}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function BiometricsScreen() {
  const insets = useSafeAreaInsets();
  const { status, data, connect } = useBle();
  const { heartRate, steps, calories, distance } = data;
  const colors = useThemeColors();
  const isConnected = status === 'connected';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Biometrics</Text>
          <SubText>Your Health Stats</SubText>
        </View>

        {/* Connection notice */}
        {!isConnected && (
          <Pressable onPress={connect} style={[styles.noticeBanner, { borderColor: colors.cardBorder }]}>
            <Ionicons name="bluetooth-outline" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
            <SubText>Not connected — tap to connect your device</SubText>
          </Pressable>
        )}

        {/* Heart rate — big card */}
        <View style={styles.bigCardWrapper}>
          <Card style={styles.hrCard}>
            <LinearGradient
              colors={['#FFF1F2', '#FFE4E6']}
              style={StyleSheet.absoluteFill}
              start={[0, 0]} end={[1, 1]}
            />
            <HeartPulse bpm={heartRate} />
            <Text style={styles.hrValue}>
              {heartRate !== null ? heartRate : '--'}
              {heartRate !== null && <Text style={styles.hrUnit}> bpm</Text>}
            </Text>
            <SubText style={styles.hrLabel}>Heart Rate</SubText>
            {!isConnected && <SubText style={styles.waitingText}>Waiting for device…</SubText>}
          </Card>
        </View>

        {/* 2-column grid */}
        <View style={styles.row}>
          <View style={styles.halfCell}>
            <MetricCard emoji="👣" label="Steps" value={steps} color="#4D96FF" />
          </View>
          <View style={styles.halfCell}>
            <MetricCard emoji="🔥" label="Calories" value={calories} unit="kcal" color="#F97316" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfCell}>
            <MetricCard emoji="📍" label="Distance" value={distance !== null ? distance.toFixed(2) : null} unit="km" color="#8B5CF6" />
          </View>
          <View style={styles.halfCell}>
            <MetricCard emoji="😴" label="Sleep" value={null} unit="h" color="#06B6D4" />
          </View>
        </View>

        {/* Step goal progress */}
        <Card style={styles.goalCard}>
          <View style={[styles.goalHeader, { backgroundColor: 'transparent' }]}>
            <Text style={styles.goalTitle}>Daily Step Goal</Text>
            <Text style={styles.goalPct}>
              {steps !== null ? Math.round((steps / STEP_GOAL) * 100) : 0}%
            </Text>
          </View>
          <ProgressBar value={steps ?? 0} max={STEP_GOAL} color="#4D96FF" />
          <SubText style={styles.goalSub}>
            {steps !== null ? steps.toLocaleString() : '0'} / {STEP_GOAL.toLocaleString()} steps
          </SubText>
        </Card>

        {/* Spacer for floating menu */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  scroll:      { paddingHorizontal: 16, paddingBottom: 16 },
  header:      { alignItems: 'center', marginBottom: 16 },
  title:       { fontSize: 28, fontWeight: 'bold', fontFamily: '429Font', marginBottom: 2 },
  noticeBanner:{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  bigCardWrapper: { marginBottom: 12 },
  hrCard:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, overflow: 'hidden' },
  heartEmoji:  { fontSize: 40, marginBottom: 8 },
  bigEmoji:    { fontSize: 44 },
  hrValue:     { fontSize: 48, fontWeight: '700', letterSpacing: -1 },
  hrUnit:      { fontSize: 20, fontWeight: '400', color: '#94A3B8' },
  hrLabel:     { marginTop: 4 },
  waitingText: { marginTop: 6, fontStyle: 'italic' },
  row:         { flexDirection: 'row', gap: 12, marginBottom: 12 },
  halfCell:    { flex: 1 },
  metricCard:  { alignItems: 'center', paddingVertical: 20, overflow: 'hidden' },
  bigCard:     { paddingVertical: 28 },
  metricEmoji: { fontSize: 28, marginBottom: 6 },
  bigValue:    { fontSize: 32 },
  metricValue: { fontSize: 24, fontWeight: '700' },
  unit:        { fontSize: 14, fontWeight: '400', color: '#94A3B8' },
  metricLabel: { marginTop: 2 },
  progressTrack: { height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden', marginVertical: 10 },
  progressFill:  { height: '100%', borderRadius: 5 },
  goalCard:    { padding: 16, marginBottom: 12 },
  goalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  goalTitle:   { fontSize: 15, fontWeight: '600' },
  goalPct:     { fontSize: 15, fontWeight: '700', color: '#4D96FF' },
  goalSub:     { textAlign: 'right' },
});
