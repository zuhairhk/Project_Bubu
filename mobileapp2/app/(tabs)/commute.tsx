import React, { useEffect, useState } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { View, Text, SubText, Card, useThemeColors } from '@/components/Themed';
import { useBle } from '@/lib/BleContext';

// ─── Live clock ───────────────────────────────────────────────────────────────
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

// ─── Stat row ─────────────────────────────────────────────────────────────────
function StatRow({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.statRow, { borderBottomColor: colors.separator }]}>
      <View style={[styles.iconCircle, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.statText}>
        <SubText>{label}</SubText>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CommuteScreen() {
  const insets = useSafeAreaInsets();
  const now = useClock();
  const { data, status } = useBle();
  const { steps, distance } = data;
  const colors = useThemeColors();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Commute</Text>
          <SubText>Real-time Transit Info</SubText>
        </View>

        {/* Live clock card */}
        <Card style={styles.clockCard}>
          <LinearGradient
            colors={['#EFF6FF', '#DBEAFE']}
            style={StyleSheet.absoluteFill}
            start={[0, 0]} end={[1, 1]}
          />
          <Text style={styles.clockTime}>{formatTime(now)}</Text>
          <SubText style={styles.clockDate}>{formatDate(now)}</SubText>
        </Card>

        {/* Map placeholder */}
        <Card style={styles.mapCard}>
          <LinearGradient
            colors={['#F1F5F9', '#E2E8F0']}
            style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
          />
          <Ionicons name="map-outline" size={40} color="#94A3B8" style={{ marginBottom: 8 }} />
          <SubText style={{ textAlign: 'center' }}>
            Live transit map coming soon
          </SubText>
          <SubText style={{ textAlign: 'center', marginTop: 4, fontSize: 11 }}>
            Requires location permission + transit API key
          </SubText>
        </Card>

        {/* Activity from BLE */}
        <Text style={styles.sectionTitle}>Today's Activity</Text>
        <Card style={styles.statsCard}>
          <StatRow
            icon="footsteps-outline"
            label="Steps Today"
            value={status === 'connected' && steps !== null ? steps.toLocaleString() : '-- (device offline)'}
            color="#4D96FF"
          />
          <StatRow
            icon="location-outline"
            label="Distance"
            value={status === 'connected' && distance !== null ? `${distance.toFixed(2)} km` : '--'}
            color="#8B5CF6"
          />
        </Card>

        {/* Transit info placeholders */}
        <Text style={styles.sectionTitle}>Transit Information</Text>
        <Card style={styles.statsCard}>
          <StatRow icon="train-outline"     label="Next Departure"   value="-- set up transit API"  color="#F97316" />
          <StatRow icon="walk-outline"      label="Time to Station"  value="-- min"                 color="#10B981" />
          <StatRow icon="navigate-outline"  label="Current Location" value="-- enable location"     color="#06B6D4" />
        </Card>

        {/* Spacer for floating menu */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  scroll:       { paddingHorizontal: 16, paddingBottom: 16 },
  header:       { alignItems: 'center', marginBottom: 16 },
  title:        { fontSize: 28, fontWeight: 'bold', fontFamily: '429Font', marginBottom: 2 },
  clockCard:    { alignItems: 'center', paddingVertical: 28, marginBottom: 14, overflow: 'hidden' },
  clockTime:    { fontSize: 52, fontWeight: '700', letterSpacing: -2 },
  clockDate:    { marginTop: 4, fontSize: 14 },
  mapCard:      { height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10, marginTop: 4 },
  statsCard:    { marginBottom: 14 },
  statRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  iconCircle:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  statText:     { flex: 1 },
  statValue:    { fontSize: 15, fontWeight: '600', marginTop: 2 },
});
