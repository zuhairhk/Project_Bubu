import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  View,
  Text,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBle } from '@/lib/BleContext';

// ─── Design tokens (shared with home + biometrics) ────────────────────────────
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
  indigo:   '#5856D6',
};

const cardShadow = {
  shadowColor:   '#000',
  shadowOpacity: 0.06,
  shadowRadius:  12,
  shadowOffset:  { width: 0, height: 2 },
  elevation:     3,
};

// ─── Constants ────────────────────────────────────────────────────────────────
const API_URL        = 'https://7685-141-117-117-240.ngrok-free.app/api/transit/next';
const STORAGE_KEY    = 'commute_selected_line';
const REFRESH_MS     = 30_000;

const GO_LINES = [
  { id: 'Lakeshore East',  label: 'Lakeshore East',  color: '#FF3B30' },
  { id: 'Lakeshore West',  label: 'Lakeshore West',  color: '#FF3B30' },
  { id: 'Kitchener',       label: 'Kitchener',        color: '#34C759' },
  { id: 'Barrie',          label: 'Barrie',           color: '#007AFF' },
  { id: 'Stouffville',     label: 'Stouffville',      color: '#AF52DE' },
  { id: 'Richmond Hill',   label: 'Richmond Hill',    color: '#32ADE6' },
  { id: 'Milton',          label: 'Milton',           color: '#FF9500' },
];

interface Departure {
  line: string; destination: string; time: string; platform: string; status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function parseTime(iso: string) { return new Date(iso); }
function minutesUntil(target: Date, now: Date) {
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
function fmtDep(iso: string) {
  return parseTime(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function urgColor(mins: number) {
  if (mins <= 3)  return C.red;
  if (mins <= 8)  return C.orange;
  if (mins <= 15) return '#FFCC00';
  return C.green;
}
function urgLabel(mins: number) {
  if (mins < 0)   return 'Departed';
  if (mins === 0) return 'Now';
  if (mins <= 3)  return 'Run!';
  if (mins <= 8)  return 'Hurry';
  if (mins <= 15) return 'Soon';
  return 'On time';
}

// ─── Line picker modal ────────────────────────────────────────────────────────
function LinePicker({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string | null;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={P.overlay}>
        <View style={P.sheet}>
          <View style={P.handle} />
          <Text style={P.title}>Select GO Line</Text>
          <Text style={P.sub}>Departures from Union Station</Text>
          {GO_LINES.map(line => {
            const active = selected === line.id;
            return (
              <TouchableOpacity
                key={line.id}
                onPress={() => { onSelect(line.id); onClose(); }}
                activeOpacity={0.7}
                style={[P.option, active && { backgroundColor: line.color + '10' }]}
              >
                <View style={[P.lineBar, { backgroundColor: line.color }]} />
                <Text style={[P.optionText, active && { color: line.color, fontWeight: '700' }]}>
                  {line.label}
                </Text>
                {active && <Ionicons name="checkmark" size={16} color={line.color} />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={onClose} style={P.cancel}>
            <Text style={P.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const P = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: C.sep, alignSelf: 'center', marginBottom: 20 },
  title:      { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 4 },
  sub:        { fontSize: 13, color: C.textTert, textAlign: 'center', marginBottom: 20 },
  option:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6, backgroundColor: C.bg },
  lineBar:    { width: 4, height: 20, borderRadius: 2, marginRight: 14 },
  optionText: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  cancel:     { marginTop: 8, paddingVertical: 16, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: C.blue },
});

// ─── Next train card ──────────────────────────────────────────────────────────
function NextTrainCard({ dep, now, lineColor }: { dep: Departure; now: Date; lineColor: string }) {
  const mins    = minutesUntil(parseTime(dep.time), now);
  const uc      = urgColor(mins);
  const ul      = urgLabel(mins);
  const proceed = dep.status.toLowerCase().includes('proceed');

  return (
    <View style={[NT.card, { ...cardShadow }]}>
      {/* Colour accent bar */}
      <View style={[NT.bar, { backgroundColor: lineColor }]} />

      <View style={NT.inner}>
        {/* Line tag + urgency */}
        <View style={NT.topRow}>
          <View style={NT.lineTag}>
            <View style={[NT.dot, { backgroundColor: lineColor }]} />
            <Text style={[NT.lineText, { color: lineColor }]}>{dep.line.toUpperCase()}</Text>
          </View>
          <View style={[NT.urgBadge, { backgroundColor: uc + '15' }]}>
            <Text style={[NT.urgText, { color: uc }]}>{ul}</Text>
          </View>
        </View>

        {/* Destination */}
        <Text style={NT.dest}>{dep.destination}</Text>

        {/* Countdown row */}
        <View style={NT.countRow}>
          <View>
            <Text style={[NT.countNum, { color: uc }]}>{mins < 0 ? '—' : mins}</Text>
            <Text style={NT.countLabel}>minutes away</Text>
          </View>
          <View style={NT.metaCol}>
            <View style={NT.chip}>
              <Ionicons name="time-outline" size={12} color={C.textTert} />
              <Text style={NT.chipText}>{fmtDep(dep.time)}</Text>
            </View>
            {dep.platform && dep.platform !== '-' && (
              <View style={[NT.chip, { backgroundColor: lineColor + '12' }]}>
                <Ionicons name="location-outline" size={12} color={lineColor} />
                <Text style={[NT.chipText, { color: lineColor, fontWeight: '700' }]}>
                  Platform {dep.platform}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Status */}
        <View style={NT.statusRow}>
          <View style={[NT.statusDot, { backgroundColor: proceed ? C.green : C.orange }]} />
          <Text style={[NT.statusText, { color: proceed ? C.green : C.orange }]}>{dep.status}</Text>
        </View>
      </View>
    </View>
  );
}

const NT = StyleSheet.create({
  card:       { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  bar:        { height: 4, width: '100%' },
  inner:      { padding: 18 },
  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  lineTag:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  lineText:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  urgBadge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  urgText:    { fontSize: 12, fontWeight: '700' },
  dest:       { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginBottom: 16 },
  countRow:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 },
  countNum:   { fontSize: 64, fontWeight: '800', lineHeight: 68, letterSpacing: -3 },
  countLabel: { fontSize: 12, color: C.textTert, marginBottom: 8 },
  metaCol:    { alignItems: 'flex-end', gap: 8 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText:   { fontSize: 12, fontWeight: '600', color: C.textTert },
  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep, paddingTop: 14 },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '500' },
});

// ─── Upcoming row ─────────────────────────────────────────────────────────────
function UpcomingRow({ dep, now, lineColor, isLast }: {
  dep: Departure; now: Date; lineColor: string; isLast: boolean;
}) {
  const mins = minutesUntil(parseTime(dep.time), now);
  const uc   = urgColor(mins);
  return (
    <View style={[UP.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sep }]}>
      <View style={UP.timeline}>
        <View style={[UP.tDot, { backgroundColor: lineColor }]} />
        {!isLast && <View style={[UP.tLine, { backgroundColor: lineColor + '30' }]} />}
      </View>
      <View style={UP.info}>
        <Text style={UP.dest}>{dep.destination}</Text>
        <Text style={UP.line}>{dep.line}</Text>
      </View>
      <View style={UP.right}>
        <Text style={UP.time}>{fmtDep(dep.time)}</Text>
        <Text style={[UP.mins, { color: uc }]}>{mins < 0 ? 'Gone' : `${mins}m`}</Text>
      </View>
      {dep.platform && dep.platform !== '-' && (
        <View style={[UP.platBadge, { backgroundColor: lineColor + '15' }]}>
          <Text style={[UP.platText, { color: lineColor }]}>{dep.platform}</Text>
        </View>
      )}
    </View>
  );
}

const UP = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  timeline: { width: 18, alignItems: 'center', marginRight: 14, alignSelf: 'stretch' },
  tDot:     { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  tLine:    { flex: 1, width: 2, marginTop: 4 },
  info:     { flex: 1 },
  dest:     { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2 },
  line:     { fontSize: 12, color: C.textTert },
  right:    { alignItems: 'flex-end', marginRight: 10 },
  time:     { fontSize: 14, fontWeight: '600', color: C.text },
  mins:     { fontSize: 12, fontWeight: '600', marginTop: 2 },
  platBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  platText: { fontSize: 11, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommuteScreen() {
  const insets = useSafeAreaInsets();
  const now    = useClock();
  const { data, status } = useBle();
  const { steps, distance } = data;

  const [selectedLine,  setSelectedLine]  = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [departures,    setDepartures]    = useState<Departure[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const [fetchError,    setFetchError]    = useState<string | null>(null);

  const lineInfo  = GO_LINES.find(l => l.id === selectedLine);
  const lineColor = lineInfo?.color ?? C.blue;
  const nextTrain = departures[0] ?? null;
  const upcoming  = departures.slice(1);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => { if (val) setSelectedLine(val); });
  }, []);

  const handleSelectLine = useCallback((id: string) => {
    setSelectedLine(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const fetchDepartures = useCallback(async () => {
    if (!selectedLine) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res  = await fetch(API_URL, { headers: { 'ngrok-skip-browser-warning': '1' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const all: Departure[] = json.departures ?? [];
      const filtered = all
        .filter(d => d.line.toLowerCase().includes(selectedLine.toLowerCase()))
        .filter(d => minutesUntil(parseTime(d.time), new Date()) > -2)
        .slice(0, 5);
      setDepartures(filtered);
      setLastUpdated(new Date());
    } catch (e: any) {
      setFetchError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [selectedLine]);

  useEffect(() => {
    fetchDepartures();
    const id = setInterval(fetchDepartures, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchDepartures]);

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <LinePicker
        visible={pickerVisible}
        selected={selectedLine}
        onSelect={handleSelectLine}
        onClose={() => setPickerVisible(false)}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.scroll}>

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.title}>Commute</Text>
            <Text style={S.subtitle}>Union Station</Text>
          </View>
          <TouchableOpacity onPress={fetchDepartures} disabled={loading} style={S.refreshBtn}>
            {loading
              ? <ActivityIndicator size="small" color={C.blue} />
              : <Ionicons name="refresh-outline" size={18} color={C.blue} />
            }
          </TouchableOpacity>
        </View>

        {/* Clock card */}
        <View style={[S.clockCard, cardShadow]}>
          <Text style={S.clockTime}>{fmtTime(now)}</Text>
          <Text style={S.clockDate}>{fmtDate(now)}</Text>
        </View>

        {/* Line selector */}
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.8}
          style={[S.lineSelector, cardShadow]}
        >
          <View style={[S.lineSelectorBar, { backgroundColor: lineColor }]} />
          <View style={S.lineSelectorContent}>
            <Text style={S.lineSelectorLabel}>YOUR GO LINE</Text>
            <Text style={[S.lineSelectorValue, { color: lineInfo ? lineColor : C.textTert }]}>
              {lineInfo ? lineInfo.label : 'Select a line'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={C.textTert} />
        </TouchableOpacity>

        {/* Departures */}
        {selectedLine && (
          <>
            <View style={S.sectionRow}>
              <Text style={S.sectionLabel}>NEXT DEPARTURE</Text>
              {lastUpdated && (
                <Text style={S.updatedText}>Updated {fmtTime(lastUpdated)}</Text>
              )}
            </View>

            {fetchError ? (
              <View style={[S.stateCard, cardShadow]}>
                <View style={[S.stateIcon, { backgroundColor: C.red + '15' }]}>
                  <Ionicons name="warning-outline" size={22} color={C.red} />
                </View>
                <Text style={[S.stateTitle, { color: C.red }]}>Connection Error</Text>
                <Text style={S.stateBody}>{fetchError}</Text>
                <TouchableOpacity onPress={fetchDepartures} style={[S.retryBtn, { backgroundColor: lineColor }]}>
                  <Text style={S.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : loading && departures.length === 0 ? (
              <View style={[S.stateCard, cardShadow]}>
                <ActivityIndicator size="large" color={lineColor} />
                <Text style={S.stateBody}>Fetching departures…</Text>
              </View>
            ) : nextTrain ? (
              <NextTrainCard dep={nextTrain} now={now} lineColor={lineColor} />
            ) : (
              <View style={[S.stateCard, cardShadow]}>
                <View style={[S.stateIcon, { backgroundColor: C.bg }]}>
                  <Ionicons name="moon-outline" size={22} color={C.textTert} />
                </View>
                <Text style={S.stateTitle}>No Departures</Text>
                <Text style={S.stateBody}>No upcoming trains for {selectedLine}</Text>
              </View>
            )}

            {upcoming.length > 0 && (
              <>
                <Text style={[S.sectionLabel, { marginTop: 20, marginBottom: 10 }]}>COMING UP</Text>
                <View style={[S.listCard, cardShadow]}>
                  {upcoming.map((dep, i) => (
                    <UpcomingRow
                      key={dep.time + dep.destination}
                      dep={dep}
                      now={now}
                      lineColor={lineColor}
                      isLast={i === upcoming.length - 1}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* Activity */}
        <Text style={[S.sectionLabel, { marginTop: 24, marginBottom: 10 }]}>TODAY'S ACTIVITY</Text>
        <View style={[S.listCard, cardShadow]}>
          <View style={S.actRow}>
            <View style={[S.actIcon, { backgroundColor: C.blue + '15' }]}>
              <Ionicons name="footsteps-outline" size={18} color={C.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.actLabel}>Steps Today</Text>
              <Text style={S.actValue}>
                {status === 'connected' && steps != null ? steps.toLocaleString() : '—'}
              </Text>
            </View>
          </View>
          <View style={S.separator} />
          <View style={S.actRow}>
            <View style={[S.actIcon, { backgroundColor: C.indigo + '15' }]}>
              <Ionicons name="location-outline" size={18} color={C.indigo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.actLabel}>Distance</Text>
              <Text style={S.actValue}>
                {status === 'connected' && distance != null ? `${distance.toFixed(2)} km` : '—'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  title:       { fontSize: 24, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  subtitle:    { fontSize: 13, color: C.textTert, marginTop: 2 },
  refreshBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...cardShadow },

  clockCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  clockTime: { fontSize: 52, fontWeight: '700', color: C.text, letterSpacing: -2 },
  clockDate: { fontSize: 13, color: C.textTert, marginTop: 4 },

  lineSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    paddingRight: 16,
  },
  lineSelectorBar:     { width: 5, alignSelf: 'stretch' },
  lineSelectorContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  lineSelectorLabel:   { fontSize: 10, fontWeight: '700', color: C.textTert, letterSpacing: 1, marginBottom: 3 },
  lineSelectorValue:   { fontSize: 16, fontWeight: '700' },

  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textTert, letterSpacing: 1 },
  updatedText:  { fontSize: 11, color: C.textTert },

  stateCard:  { backgroundColor: C.card, borderRadius: 20, alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, marginBottom: 12, gap: 10 },
  stateIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  stateBody:  { fontSize: 13, color: C.textTert, textAlign: 'center', lineHeight: 18 },
  retryBtn:   { paddingHorizontal: 28, paddingVertical: 10, borderRadius: 22, marginTop: 4 },
  retryText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  listCard:  { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', marginBottom: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.sep, marginHorizontal: 16 },
  actRow:    { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  actIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actLabel:  { fontSize: 12, color: C.textTert, marginBottom: 2 },
  actValue:  { fontSize: 18, fontWeight: '700', color: C.text },
});