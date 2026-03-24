import React from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  View,
  Text,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBle } from '@/lib/BleContext';

const STEP_GOAL = 10_000;

// ─── Same tokens as home screen ──────────────────────────────────────────────
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
  teal:     '#32ADE6',
};

const cardShadow = {
  shadowColor:   '#000',
  shadowOpacity: 0.06,
  shadowRadius:  12,
  shadowOffset:  { width: 0, height: 2 },
  elevation:     3,
};

// ─── Heart rate card ──────────────────────────────────────────────────────────
function HeartCard({ bpm, connected }: { bpm: number | null; connected: boolean }) {
  const status = !connected
    ? 'Connect device to measure'
    : bpm == null ? 'Waiting for signal...'
    : bpm > 100   ? 'Elevated'
    : bpm < 60    ? 'Resting'
    : 'Normal range';

  const color = bpm == null ? C.textTert : bpm > 100 ? C.orange : bpm < 60 ? C.blue : C.red;
  const barPct = bpm != null ? Math.min(((bpm - 40) / 160) * 100, 100) : 0;

  return (
    <View style={[S.card, S.hrCard]}>
      <View style={S.cardTopRow}>
        <Text style={S.cardLabel}>Heart Rate</Text>
        <View style={[S.iconChip, { backgroundColor: C.red + '15' }]}>
          <Ionicons name="heart-outline" size={14} color={C.red} />
        </View>
      </View>

      <View style={S.hrValueRow}>
        <Text style={[S.hrBig, { color: bpm != null ? C.text : C.textTert }]}>
          {bpm ?? '--'}
        </Text>
        {bpm != null && <Text style={S.hrUnit}>bpm</Text>}
      </View>

      <Text style={[S.hrStatus, { color }]}>{status}</Text>

      <View style={S.progressTrack}>
        <View style={[S.progressFill, {
          width: `${barPct}%` as any,
          backgroundColor: color,
          opacity: bpm != null ? 1 : 0,
        }]} />
      </View>

      {/* HR zones */}
      <View style={S.hrZones}>
        {[
          { label: 'Rest',   range: '< 60',    col: C.blue   },
          { label: 'Normal', range: '60–100',  col: C.green  },
          { label: 'High',   range: '> 100',   col: C.orange },
        ].map(z => (
          <View key={z.label} style={S.hrZone}>
            <View style={[S.hrZoneDot, { backgroundColor: z.col }]} />
            <Text style={S.hrZoneLabel}>{z.label}</Text>
            <Text style={S.hrZoneRange}>{z.range}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Steps card ───────────────────────────────────────────────────────────────
function StepsCard({ steps }: { steps: number }) {
  const pct      = Math.min((steps / STEP_GOAL) * 100, 100);
  const remaining = Math.max(STEP_GOAL - steps, 0);
  const color    = pct >= 100 ? C.green : C.blue;

  return (
    <View style={S.card}>
      <View style={S.cardTopRow}>
        <Text style={S.cardLabel}>Steps</Text>
        <View style={[S.iconChip, { backgroundColor: C.blue + '15' }]}>
          <Ionicons name="footsteps-outline" size={14} color={C.blue} />
        </View>
      </View>

      <Text style={S.cardBigValue}>{steps.toLocaleString()}</Text>
      <Text style={S.cardSub}>of {STEP_GOAL.toLocaleString()} daily goal</Text>

      <View style={S.progressTrack}>
        <View style={[S.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>

      <View style={S.stepsFooter}>
        <Text style={[S.pctText, { color }]}>{Math.round(pct)}% complete</Text>
        {remaining > 0 && (
          <Text style={S.remainText}>{remaining.toLocaleString()} to go</Text>
        )}
        {remaining === 0 && (
          <Text style={[S.remainText, { color: C.green, fontWeight: '600' }]}>Goal reached!</Text>
        )}
      </View>
    </View>
  );
}

// ─── 2-col metric card ────────────────────────────────────────────────────────
function MiniCard({
  label, value, unit, color, icon,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[S.card, S.miniCard]}>
      <View style={S.cardTopRow}>
        <Text style={S.cardLabel}>{label}</Text>
        <View style={[S.iconChip, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
      </View>
      <Text style={[S.miniValue, { color: value != null ? C.text : C.textTert }]}>
        {value ?? '--'}
      </Text>
      {unit && value != null && <Text style={S.miniUnit}>{unit}</Text>}
      {value == null && <Text style={S.cardSub}>No data</Text>}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BiometricsScreen() {
  const insets = useSafeAreaInsets();
  const { status, data, connect } = useBle();
  const { heartRate, steps, calories, distance } = data;
  const isConnected = status === 'connected';

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.scroll}
      >
        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.title}>Biometrics</Text>
            <Text style={S.subtitle}>Your health snapshot</Text>
          </View>
          {!isConnected && (
            <Pressable onPress={connect} style={S.connectBtn}>
              <Ionicons name="bluetooth-outline" size={14} color={C.blue} />
              <Text style={S.connectText}>Connect</Text>
            </Pressable>
          )}
        </View>

        {/* Heart rate */}
        <HeartCard bpm={heartRate} connected={isConnected} />

        {/* Steps */}
        <StepsCard steps={steps ?? 0} />

        {/* 2-col row */}
        <View style={S.row}>
          <View style={{ flex: 1 }}>
            <MiniCard
              label="Calories"
              value={calories}
              unit="kcal"
              color={C.orange}
              icon="flame-outline"
            />
          </View>
          <View style={{ flex: 1 }}>
            <MiniCard
              label="Distance"
              value={distance != null ? distance.toFixed(2) : null}
              unit="km"
              color={C.indigo}
              icon="location-outline"
            />
          </View>
        </View>

        {/* Sleep placeholder */}
        <View style={S.card}>
          <View style={S.cardTopRow}>
            <Text style={S.cardLabel}>Sleep</Text>
            <View style={[S.iconChip, { backgroundColor: C.teal + '15' }]}>
              <Ionicons name="moon-outline" size={14} color={C.teal} />
            </View>
          </View>
          <Text style={[S.cardBigValue, { color: C.textTert }]}>--</Text>
          <Text style={S.cardSub}>Sleep tracking coming soon</Text>
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
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  title:       { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subtitle:    { fontSize: 13, color: C.textTert, marginTop: 2 },
  connectBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, ...cardShadow },
  connectText: { fontSize: 13, fontWeight: '600', color: C.blue },

  // Base card
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    ...cardShadow,
  },
  cardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel:   { fontSize: 13, color: C.textTert, fontWeight: '500' },
  cardBigValue:{ fontSize: 36, fontWeight: '700', color: C.text, letterSpacing: -1, marginBottom: 4 },
  cardSub:     { fontSize: 12, color: C.textTert, marginBottom: 4 },
  iconChip:    { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Progress
  progressTrack: { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden', marginVertical: 10 },
  progressFill:  { height: '100%', borderRadius: 3 },

  // Heart card
  hrCard:       { marginBottom: 12 },
  hrValueRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  hrBig:        { fontSize: 52, fontWeight: '700', letterSpacing: -2 },
  hrUnit:       { fontSize: 18, fontWeight: '500', color: C.textTert, marginBottom: 6 },
  hrStatus:     { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  hrZones:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  hrZone:       { alignItems: 'center', gap: 3 },
  hrZoneDot:    { width: 8, height: 8, borderRadius: 4 },
  hrZoneLabel:  { fontSize: 11, fontWeight: '600', color: C.textSec },
  hrZoneRange:  { fontSize: 10, color: C.textTert },

  // Steps
  stepsFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pctText:     { fontSize: 12, fontWeight: '700' },
  remainText:  { fontSize: 12, color: C.textTert },

  // Mini cards
  row:       { flexDirection: 'row', gap: 12, marginBottom: 0 },
  miniCard:  { marginBottom: 12 },
  miniValue: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, marginBottom: 2 },
  miniUnit:  { fontSize: 13, color: C.textTert, fontWeight: '500' },
});