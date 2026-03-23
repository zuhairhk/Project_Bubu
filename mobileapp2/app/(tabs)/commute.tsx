import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { View, Text, SubText, Card, useThemeColors } from '@/components/Themed';
import { useBle } from '@/lib/BleContext';

const API_URL = 'https://7685-141-117-117-240.ngrok-free.app/api/transit/next';
const STORAGE_KEY = 'commute_selected_line';
const REFRESH_INTERVAL = 30_000;

const GO_LINES = [
  { id: 'Lakeshore East',  label: 'Lakeshore East',  color: '#FF5C5C' },
  { id: 'Lakeshore West',  label: 'Lakeshore West',  color: '#FF5C5C' },
  { id: 'Kitchener',       label: 'Kitchener',        color: '#34D399' },
  { id: 'Barrie',          label: 'Barrie',           color: '#60A5FA' },
  { id: 'Stouffville',     label: 'Stouffville',      color: '#A78BFA' },
  { id: 'Richmond Hill',   label: 'Richmond Hill',    color: '#38BDF8' },
  { id: 'Milton',          label: 'Milton',           color: '#FBBF24' },
];

const COLORS = {
  bg:         '#0D0F14',
  surface:    '#161A23',
  surfaceAlt: '#1C2130',
  border:     '#252B3B',
  borderSoft: '#1E2433',
  textPrimary:'#F0F4FF',
  textSec:    '#6B7A99',
  textTert:   '#3D4A66',
  urgent:     '#FF5C5C',
  warn:       '#FF9F40',
  caution:    '#FFCC57',
  safe:       '#34D399',
};

interface Departure {
  line: string;
  destination: string;
  time: string;
  platform: string;
  status: string;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(d: Date) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
function parseTime(iso: string): Date { return new Date(iso); }
function minutesUntil(target: Date, now: Date): number {
  return Math.round((target.getTime() - now.getTime()) / 60000);
}
function formatDepartureTime(iso: string): string {
  return parseTime(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function urgencyColor(mins: number): string {
  if (mins <= 3)  return COLORS.urgent;
  if (mins <= 8)  return COLORS.warn;
  if (mins <= 15) return COLORS.caution;
  return COLORS.safe;
}
function urgencyLabel(mins: number): string {
  if (mins < 0)   return 'Departed';
  if (mins === 0) return 'Now';
  if (mins <= 3)  return 'Run!';
  if (mins <= 8)  return 'Hurry';
  if (mins <= 15) return 'Soon';
  return 'On time';
}

function LinePickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string | null;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>Select GO Line</Text>
          <SubText style={pickerStyles.subtitle}>Departures from Union Station</SubText>
          {GO_LINES.map((line) => {
            const active = selected === line.id;
            return (
              <TouchableOpacity
                key={line.id}
                style={[pickerStyles.option, active && { backgroundColor: line.color + '15', borderColor: line.color + '60' }]}
                onPress={() => { onSelect(line.id); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[pickerStyles.lineBar, { backgroundColor: line.color }]} />
                <Text style={[pickerStyles.optionText, active && { color: line.color }]}>{line.label}</Text>
                {active && <View style={[pickerStyles.activeDot, { backgroundColor: line.color }]} />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={pickerStyles.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={pickerStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet:      { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: COLORS.border },
  handle:     { width: 36, height: 3, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 24 },
  title:      { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 4 },
  subtitle:   { fontSize: 13, color: COLORS.textSec, textAlign: 'center', marginBottom: 20 },
  option:     { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, backgroundColor: COLORS.surfaceAlt },
  lineBar:    { width: 3, height: 18, borderRadius: 2, marginRight: 12 },
  optionText: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.textPrimary },
  activeDot:  { width: 7, height: 7, borderRadius: 4 },
  cancel:     { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  cancelText: { color: COLORS.textSec, fontWeight: '600', fontSize: 15 },
});

function NextTrainCard({ departure, now, lineColor }: { departure: Departure; now: Date; lineColor: string }) {
  const mins = minutesUntil(parseTime(departure.time), now);
  const urgColor = urgencyColor(mins);
  const isProceed = departure.status.toLowerCase().includes('proceed');

  return (
    <View style={nextStyles.card}>
      <View style={[nextStyles.accentBar, { backgroundColor: lineColor }]} />
      <View style={nextStyles.inner}>
        <View style={nextStyles.headerRow}>
          <View style={nextStyles.lineTag}>
            <View style={[nextStyles.lineTagDot, { backgroundColor: lineColor }]} />
            <Text style={nextStyles.lineTagText}>{departure.line.toUpperCase()}</Text>
          </View>
          <View style={[nextStyles.urgBadge, { backgroundColor: urgColor + '18', borderColor: urgColor + '40' }]}>
            <View style={[nextStyles.urgDot, { backgroundColor: urgColor }]} />
            <Text style={[nextStyles.urgText, { color: urgColor }]}>{urgencyLabel(mins)}</Text>
          </View>
        </View>
        <Text style={nextStyles.destination}>{departure.destination}</Text>
        <View style={nextStyles.divider} />
        <View style={nextStyles.countRow}>
          <View>
            <Text style={[nextStyles.countNum, { color: urgColor }]}>{mins < 0 ? '—' : mins}</Text>
            <Text style={nextStyles.countLabel}>minutes away</Text>
          </View>
          <View style={nextStyles.metaCol}>
            <View style={nextStyles.metaChip}>
              <Ionicons name="time-outline" size={12} color={COLORS.textSec} />
              <Text style={nextStyles.metaText}>{formatDepartureTime(departure.time)}</Text>
            </View>
            {departure.platform && departure.platform !== '-' && (
              <View style={[nextStyles.metaChip, { backgroundColor: lineColor + '18', borderColor: lineColor + '35' }]}>
                <Ionicons name="location-outline" size={12} color={lineColor} />
                <Text style={[nextStyles.metaText, { color: lineColor, fontWeight: '700' }]}>
                  Platform {departure.platform}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={[nextStyles.statusRow, { borderColor: COLORS.borderSoft }]}>
          <View style={[nextStyles.statusDot, { backgroundColor: isProceed ? COLORS.safe : COLORS.warn }]} />
          <Text style={[nextStyles.statusText, { color: isProceed ? COLORS.safe : COLORS.warn }]}>
            {departure.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

const nextStyles = StyleSheet.create({
  card:        { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 12 },
  accentBar:   { height: 3, width: '100%' },
  inner:       { padding: 18 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  lineTag:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineTagDot:  { width: 6, height: 6, borderRadius: 3 },
  lineTagText: { fontSize: 11, fontWeight: '700', color: COLORS.textSec, letterSpacing: 0.8 },
  urgBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  urgDot:      { width: 6, height: 6, borderRadius: 3 },
  urgText:     { fontSize: 12, fontWeight: '700' },
  destination: { fontSize: 26, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16, letterSpacing: -0.5 },
  divider:     { height: 1, backgroundColor: COLORS.borderSoft, marginBottom: 16 },
  countRow:    { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 },
  countNum:    { fontSize: 64, fontWeight: '800', lineHeight: 68, letterSpacing: -3 },
  countLabel:  { fontSize: 13, color: COLORS.textSec, fontWeight: '500', marginBottom: 6 },
  metaCol:     { alignItems: 'flex-end', gap: 8 },
  metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  metaText:    { fontSize: 12, fontWeight: '600', color: COLORS.textSec },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 14 },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  statusText:  { fontSize: 13, fontWeight: '500' },
});

function UpcomingRow({ departure, now, lineColor, isLast }: { departure: Departure; now: Date; lineColor: string; isLast: boolean }) {
  const mins = minutesUntil(parseTime(departure.time), now);
  const urgColor = urgencyColor(mins);
  return (
    <View style={[upStyles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft }]}>
      <View style={upStyles.timelineCol}>
        <View style={[upStyles.dot, { backgroundColor: lineColor }]} />
        {!isLast && <View style={[upStyles.line, { backgroundColor: lineColor + '25' }]} />}
      </View>
      <View style={upStyles.info}>
        <Text style={upStyles.dest}>{departure.destination}</Text>
        <Text style={upStyles.subLine}>{departure.line}</Text>
      </View>
      <View style={upStyles.right}>
        <Text style={upStyles.time}>{formatDepartureTime(departure.time)}</Text>
        <Text style={[upStyles.mins, { color: urgColor }]}>{mins < 0 ? 'Gone' : `${mins}m`}</Text>
      </View>
      {departure.platform && departure.platform !== '-' && (
        <View style={[upStyles.platBadge, { backgroundColor: lineColor + '15' }]}>
          <Text style={[upStyles.platText, { color: lineColor }]}>{departure.platform}</Text>
        </View>
      )}
    </View>
  );
}

const upStyles = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  timelineCol: { width: 18, alignItems: 'center', marginRight: 14, alignSelf: 'stretch' },
  dot:         { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  line:        { flex: 1, width: 2, marginTop: 4 },
  info:        { flex: 1 },
  dest:        { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 },
  subLine:     { fontSize: 12, color: COLORS.textSec },
  right:       { alignItems: 'flex-end', marginRight: 10 },
  time:        { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  mins:        { fontSize: 12, fontWeight: '600', marginTop: 2 },
  platBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  platText:    { fontSize: 11, fontWeight: '700' },
});

function StatRow({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={statStyles.row}>
      <View style={[statStyles.iconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={statStyles.textCol}>
        <Text style={statStyles.label}>{label}</Text>
        <Text style={statStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  textCol: { flex: 1 },
  label:   { fontSize: 12, color: COLORS.textSec, marginBottom: 3 },
  value:   { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
});

export default function CommuteScreen() {
  const insets = useSafeAreaInsets();
  const now = useClock();
  const { data, status } = useBle();
  const { steps, distance } = data;

  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lineInfo = GO_LINES.find((l) => l.id === selectedLine);
  const lineColor = lineInfo?.color ?? COLORS.safe;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => { if (val) setSelectedLine(val); });
  }, []);

  const handleSelectLine = useCallback((id: string) => {
    setSelectedLine(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const fetchDepartures = useCallback(async () => {
    if (!selectedLine) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL, { headers: { 'ngrok-skip-browser-warning': '1' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const all: Departure[] = json.departures ?? [];
      const filtered = all
        .filter((d) => d.line.toLowerCase().includes(selectedLine.toLowerCase()))
        .filter((d) => minutesUntil(parseTime(d.time), new Date()) > -2)
        .slice(0, 5);
      setDepartures(filtered);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [selectedLine]);

  useEffect(() => {
    fetchDepartures();
    const id = setInterval(fetchDepartures, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchDepartures]);

  const nextTrain = departures[0] ?? null;
  const upcoming = departures.slice(1);

  return (
    <View style={[S.root, { backgroundColor: COLORS.bg }]}>
      <LinePickerModal visible={pickerVisible} selected={selectedLine} onSelect={handleSelectLine} onClose={() => setPickerVisible(false)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[S.scroll, { paddingTop: insets.top + 16 }]}>

        <View style={S.header}>
          <Text style={S.title}>Commute</Text>
          <Text style={S.subtitle}>Union Station</Text>
        </View>

        <View style={S.clockCard}>
          <Text style={S.clockTime}>{formatTime(now)}</Text>
          <Text style={S.clockDate}>{formatDate(now)}</Text>
        </View>

        <TouchableOpacity onPress={() => setPickerVisible(true)} activeOpacity={0.8} style={[S.lineSelector, lineInfo && { borderColor: lineColor + '50' }]}>
          <View style={[S.lineSelectorBar, { backgroundColor: lineColor }]} />
          <View style={S.lineSelectorContent}>
            <Text style={S.lineSelectorLabel}>YOUR GO LINE</Text>
            <Text style={[S.lineSelectorValue, lineInfo && { color: lineColor }]}>
              {lineInfo ? lineInfo.label : 'Select a line'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={lineInfo ? lineColor : COLORS.textSec} />
        </TouchableOpacity>

        {selectedLine && (
          <>
            <View style={S.sectionRow}>
              <Text style={S.sectionLabel}>NEXT DEPARTURE</Text>
              <TouchableOpacity onPress={fetchDepartures} disabled={loading} style={S.refreshBtn} activeOpacity={0.7}>
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.textSec} />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={14} color={COLORS.textSec} />
                    {lastUpdated && <Text style={S.refreshTime}>{formatTime(lastUpdated)}</Text>}
                  </>
                )}
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={S.stateCard}>
                <View style={[S.stateIconBox, { backgroundColor: COLORS.urgent + '15' }]}>
                  <Ionicons name="warning-outline" size={22} color={COLORS.urgent} />
                </View>
                <Text style={[S.stateTitle, { color: COLORS.urgent }]}>Connection Error</Text>
                <Text style={S.stateBody}>{error}</Text>
                <TouchableOpacity onPress={fetchDepartures} style={[S.retryBtn, { backgroundColor: lineColor }]} activeOpacity={0.8}>
                  <Text style={S.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : loading && departures.length === 0 ? (
              <View style={S.stateCard}>
                <ActivityIndicator size="large" color={lineColor} />
                <Text style={S.stateBody}>Fetching departures…</Text>
              </View>
            ) : nextTrain ? (
              <NextTrainCard departure={nextTrain} now={now} lineColor={lineColor} />
            ) : (
              <View style={S.stateCard}>
                <View style={[S.stateIconBox, { backgroundColor: COLORS.surfaceAlt }]}>
                  <Ionicons name="moon-outline" size={22} color={COLORS.textSec} />
                </View>
                <Text style={S.stateTitle}>No Departures</Text>
                <Text style={S.stateBody}>No upcoming trains found for {selectedLine}</Text>
              </View>
            )}

            {upcoming.length > 0 && (
              <>
                <Text style={[S.sectionLabel, { marginTop: 20, marginBottom: 10 }]}>COMING UP</Text>
                <View style={S.card}>
                  {upcoming.map((dep, i) => (
                    <UpcomingRow key={dep.time + dep.destination} departure={dep} now={now} lineColor={lineColor} isLast={i === upcoming.length - 1} />
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Text style={[S.sectionLabel, { marginTop: 24, marginBottom: 10 }]}>TODAY'S ACTIVITY</Text>
        <View style={S.card}>
          <StatRow icon="footsteps-outline" label="Steps Today" value={status === 'connected' && steps !== null ? steps.toLocaleString() : '— device offline'} color="#60A5FA" />
          <View style={{ height: 1, backgroundColor: COLORS.borderSoft, marginHorizontal: 18 }} />
          <StatRow icon="location-outline" label="Distance" value={status === 'connected' && distance !== null ? `${distance.toFixed(2)} km` : '—'} color="#A78BFA" />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root:                { flex: 1 },
  scroll:              { paddingHorizontal: 18, paddingBottom: 18 },
  header:              { alignItems: 'center', marginBottom: 24 },
  title:               { fontSize: 30, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -1, fontFamily: '429Font' },
  subtitle:            { fontSize: 13, color: COLORS.textSec, marginTop: 2, fontWeight: '500' },
  clockCard:           { alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 28, marginBottom: 14 },
  clockTime:           { fontSize: 54, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -2 },
  clockDate:           { fontSize: 14, color: COLORS.textSec, marginTop: 4, fontWeight: '400' },
  lineSelector:        { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 22, paddingRight: 16 },
  lineSelectorBar:     { width: 4, alignSelf: 'stretch' },
  lineSelectorContent: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  lineSelectorLabel:   { fontSize: 10, fontWeight: '700', color: COLORS.textTert, letterSpacing: 1, marginBottom: 3 },
  lineSelectorValue:   { fontSize: 16, fontWeight: '700', color: COLORS.textSec },
  sectionRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel:        { fontSize: 11, fontWeight: '700', color: COLORS.textTert, letterSpacing: 1 },
  refreshBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5 },
  refreshTime:         { fontSize: 11, color: COLORS.textSec },
  card:                { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 4 },
  stateCard:           { backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, marginBottom: 12, gap: 10 },
  stateIconBox:        { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle:          { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  stateBody:           { fontSize: 13, color: COLORS.textSec, textAlign: 'center', lineHeight: 18 },
  retryBtn:            { paddingHorizontal: 28, paddingVertical: 11, borderRadius: 22, marginTop: 4 },
  retryText:           { color: '#fff', fontWeight: '700', fontSize: 14 },
});