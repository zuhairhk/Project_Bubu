import React from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  NativeModules,
  View,
  Text,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBle } from '@/lib/BleContext';

const STEP_GOAL = 10_000;

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

// ─── Not-connected overlay card ───────────────────────────────────────────────
function DisconnectedCard({ onConnect }: { onConnect: () => void }) {
  return (
    <View style={[DC.card, cardShadow]}>
      <View style={DC.iconWrap}>
        <Ionicons name="bluetooth-outline" size={28} color={C.blue} />
      </View>
      <Text style={DC.title}>Device Not Connected</Text>
      <Text style={DC.body}>Connect your Commubu to see live biometric data.</Text>
      <Pressable onPress={onConnect} style={DC.btn}>
        <Text style={DC.btnText}>Connect Device</Text>
      </Pressable>
    </View>
  );
}

const DC = StyleSheet.create({
  card:     { backgroundColor: C.card, borderRadius: 20, alignItems: 'center', padding: 28, marginBottom: 12, gap: 10 },
  iconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.blue + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:    { fontSize: 16, fontWeight: '700', color: C.text },
  body:     { fontSize: 13, color: C.textTert, textAlign: 'center', lineHeight: 18 },
  btn:      { marginTop: 4, backgroundColor: C.blue, borderRadius: 22, paddingHorizontal: 28, paddingVertical: 10 },
  btnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── Heart rate card ──────────────────────────────────────────────────────────
function HeartCard({ bpm, connected }: { bpm: number | null; connected: boolean }) {
  const statusLabel = !connected
    ? 'Connect device to measure'
    : bpm == null ? 'Waiting for signal…'
    : bpm > 100   ? 'Elevated'
    : bpm < 60    ? 'Resting'
    : 'Normal range';

  const color  = !connected || bpm == null ? C.textTert : bpm > 100 ? C.orange : bpm < 60 ? C.blue : C.red;
  const barPct = bpm != null ? Math.min(((bpm - 40) / 160) * 100, 100) : 0;

  return (
    <View style={[S.card, cardShadow]}>
      <View style={S.cardTopRow}>
        <Text style={S.cardLabel}>Heart Rate</Text>
        <View style={[S.iconChip, { backgroundColor: C.red + '15' }]}>
          <Ionicons name="heart-outline" size={14} color={C.red} />
        </View>
      </View>

      <View style={S.hrValueRow}>
        <Text style={[S.hrBig, { color: connected && bpm != null ? C.text : C.textTert }]}>
          {connected && bpm != null ? bpm : '--'}
        </Text>
        {connected && bpm != null && <Text style={S.hrUnit}>bpm</Text>}
      </View>

      <Text style={[S.hrStatus, { color }]}>{statusLabel}</Text>

      <View style={S.progressTrack}>
        <View style={[S.progressFill, {
          width: `${barPct}%` as any,
          backgroundColor: color,
          opacity: connected && bpm != null ? 1 : 0,
        }]} />
      </View>

      <View style={S.hrZones}>
        {[
          { label: 'Rest',   range: '< 60',   col: C.blue   },
          { label: 'Normal', range: '60–100', col: C.green  },
          { label: 'High',   range: '> 100',  col: C.orange },
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
function StepsCard({ steps, connected }: { steps: number | null; connected: boolean }) {
  const safeSteps = steps ?? 0;
  const pct       = Math.min((safeSteps / STEP_GOAL) * 100, 100);
  const remaining = Math.max(STEP_GOAL - safeSteps, 0);
  const color     = pct >= 100 ? C.green : C.blue;

  return (
    <View style={[S.card, cardShadow]}>
      <View style={S.cardTopRow}>
        <Text style={S.cardLabel}>Steps</Text>
        <View style={[S.iconChip, { backgroundColor: C.blue + '15' }]}>
          <Ionicons name="footsteps-outline" size={14} color={C.blue} />
        </View>
      </View>

      {connected ? (
        <>
          <Text style={S.cardBigValue}>{safeSteps.toLocaleString()}</Text>
          <Text style={S.cardSub}>of {STEP_GOAL.toLocaleString()} daily goal</Text>
          <View style={S.progressTrack}>
            <View style={[S.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
          </View>
          <View style={S.stepsFooter}>
            <Text style={[S.pctText, { color }]}>{Math.round(pct)}% complete</Text>
            {remaining > 0
              ? <Text style={S.remainText}>{remaining.toLocaleString()} to go</Text>
              : <Text style={[S.remainText, { color: C.green, fontWeight: '600' }]}>Goal reached!</Text>
            }
          </View>
        </>
      ) : (
        <>
          <Text style={[S.cardBigValue, { color: C.textTert }]}>--</Text>
          <Text style={S.cardSub}>Device not connected</Text>
        </>
      )}
    </View>
  );
}

// ─── Battery card ─────────────────────────────────────────────────────────────
function BatteryCard({ percent, voltage, connected }: {
  percent: number | null; voltage: number | null; connected: boolean;
}) {
  const color = !connected || percent == null ? C.textTert : percent > 20 ? C.green : C.red;
  const pct   = percent ?? 0;

  return (
    <View style={[S.card, cardShadow]}>
      <View style={S.cardTopRow}>
        <Text style={S.cardLabel}>Device Battery</Text>
        <View style={[S.iconChip, { backgroundColor: color + '18' }]}>
          <Ionicons
            name={!connected || percent == null ? 'battery-dead-outline' : percent > 20 ? 'battery-half-outline' : 'battery-dead-outline'}
            size={14}
            color={color}
          />
        </View>
      </View>

      {connected && percent != null ? (
        <>
          <View style={S.battRow}>
            <Text style={[S.cardBigValue, { color }]}>{percent}%</Text>
            {voltage != null && (
              <Text style={S.battVolt}>{voltage.toFixed(2)} V</Text>
            )}
          </View>
          <View style={S.progressTrack}>
            <View style={[S.progressFill, { width: `${pct}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={[S.cardSub, { marginBottom: 0 }]}>
            {percent > 20 ? 'Battery OK' : 'Charge soon'}
          </Text>
        </>
      ) : (
        <>
          <Text style={[S.cardBigValue, { color: C.textTert }]}>--</Text>
          <Text style={S.cardSub}>Device not connected</Text>
        </>
      )}
    </View>
  );
}

// ─── BLE debug card ───────────────────────────────────────────────────────────
function BleDebugCard({ status, error, data }: {
  status: string; error: string | null; data: any;
}) {
  const nativeOk = !!NativeModules.BleClientManager;
  const rows: { label: string; value: string; ok?: boolean }[] = [
    { label: 'Native BLE module', value: nativeOk ? 'loaded ✓' : 'MISSING — use dev build, not Expo Go', ok: nativeOk },
    { label: 'Status',            value: status },
    { label: 'Error',             value: error ?? 'none', ok: !error },
    { label: 'HR',                value: data.heartRate != null ? `${data.heartRate} bpm` : 'null' },
    { label: 'Steps',             value: data.steps     != null ? String(data.steps)      : 'null' },
    { label: 'Battery',           value: data.batteryPercent != null ? `${data.batteryPercent}%` : 'null' },
  ];
  return (
    <View style={[DBG.card, cardShadow]}>
      <Text style={DBG.heading}>BLE Debug</Text>
      {rows.map(r => (
        <View key={r.label} style={DBG.row}>
          <Text style={DBG.label}>{r.label}</Text>
          <Text style={[DBG.value, r.ok === false && { color: '#FF3B30' }, r.ok === true && { color: '#34C759' }]}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const DBG = StyleSheet.create({
  card:    { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16, marginBottom: 12 },
  heading: { fontSize: 12, fontWeight: '700', color: '#8E8E93', letterSpacing: 1, marginBottom: 10 },
  row:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3A3A3C' },
  label:   { fontSize: 12, color: '#8E8E93', flex: 1 },
  value:   { fontSize: 12, color: '#FFFFFF', fontWeight: '600', flex: 2, textAlign: 'right' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BiometricsScreen() {
  const insets = useSafeAreaInsets();
  const { status, data, connect, error } = useBle();
  const { heartRate, steps, batteryPercent, batteryVoltage } = data;
  const isConnected = status === 'connected';

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

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
          {isConnected && (
            <View style={S.connectedBadge}>
              <View style={S.connectedDot} />
              <Text style={S.connectedText}>Live</Text>
            </View>
          )}
        </View>

        {/* Disconnected prompt */}
        {!isConnected && status === 'disconnected' && (
          <DisconnectedCard onConnect={connect} />
        )}

        {/* Scanning / connecting indicator */}
        {(status === 'scanning' || status === 'connecting') && (
          <View style={[S.card, cardShadow, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Ionicons name="bluetooth-outline" size={18} color={C.blue} />
            <Text style={{ fontSize: 14, color: C.blue, fontWeight: '500' }}>
              {status === 'scanning' ? 'Scanning for Commubu…' : 'Connecting…'}
            </Text>
          </View>
        )}

        {/* Heart rate */}
        <HeartCard bpm={heartRate} connected={isConnected} />

        {/* Steps */}
        <StepsCard steps={steps} connected={isConnected} />

        {/* Battery */}
        <BatteryCard percent={batteryPercent} voltage={batteryVoltage} connected={isConnected} />

        {/* Sleep placeholder */}
        <View style={[S.card, cardShadow]}>
          <View style={S.cardTopRow}>
            <Text style={S.cardLabel}>Sleep</Text>
            <View style={[S.iconChip, { backgroundColor: C.teal + '15' }]}>
              <Ionicons name="moon-outline" size={14} color={C.teal} />
            </View>
          </View>
          <Text style={[S.cardBigValue, { color: C.textTert }]}>--</Text>
          <Text style={S.cardSub}>Sleep tracking coming soon</Text>
        </View>

        {/* ── BLE debug panel ── remove once connection is confirmed working */}
        <BleDebugCard status={status} error={error} data={data} />

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  title:          { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subtitle:       { fontSize: 13, color: C.textTert, marginTop: 2 },
  connectBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, ...cardShadow },
  connectText:    { fontSize: 13, fontWeight: '600', color: C.blue },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.green + '15', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  connectedDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  connectedText:  { fontSize: 12, fontWeight: '700', color: C.green },

  card:        { backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 12 },
  cardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel:   { fontSize: 13, color: C.textTert, fontWeight: '500' },
  cardBigValue:{ fontSize: 36, fontWeight: '700', color: C.text, letterSpacing: -1, marginBottom: 4 },
  cardSub:     { fontSize: 12, color: C.textTert, marginBottom: 4 },
  iconChip:    { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  progressTrack: { height: 6, backgroundColor: '#E5E5EA', borderRadius: 3, overflow: 'hidden', marginVertical: 10 },
  progressFill:  { height: '100%', borderRadius: 3 },

  hrValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  hrBig:      { fontSize: 52, fontWeight: '700', letterSpacing: -2 },
  hrUnit:     { fontSize: 18, fontWeight: '500', color: C.textTert, marginBottom: 6 },
  hrStatus:   { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  hrZones:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  hrZone:     { alignItems: 'center', gap: 3 },
  hrZoneDot:  { width: 8, height: 8, borderRadius: 4 },
  hrZoneLabel:{ fontSize: 11, fontWeight: '600', color: C.textSec as any },
  hrZoneRange:{ fontSize: 10, color: C.textTert },

  stepsFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pctText:     { fontSize: 12, fontWeight: '700' },
  remainText:  { fontSize: 12, color: C.textTert },

  battRow:   { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  battVolt:  { fontSize: 14, color: C.textTert, fontWeight: '500', marginBottom: 4 },
});