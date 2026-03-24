// CLEAN MODERN HOME (matches your reference UI)

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { View, Text } from '@/components/Themed';
import { useBle } from '@/lib/BleContext';
import { useMood } from '@/lib/MoodContext';

const COLORS = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  text: '#0F172A',
  sub: '#64748B',
  accent: '#7C3AED',
  border: '#E2E8F0',
};

// ─── Utils ─────────────────────────────
const TRANSIT_URL = 'https://7685-141-117-117-240.ngrok-free.app/api/transit/next';
const STORAGE_KEY = 'commute_selected_line';

function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

// ─── Card Wrapper ──────────────────────
function Card({ children }: any) {
  return <View style={styles.card}>{children}</View>;
}

// ─── Progress Bar ──────────────────────
function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${value}%` }]} />
    </View>
  );
}

// ─── Main ──────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, deviceName, data, connect, disconnect, error } = useBle();
  const { mood } = useMood();

  const [nextTrain, setNextTrain] = useState<any>(null);
  const [trainLine, setTrainLine] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isConnected = status === 'connected';

  // Load saved line
  useEffect(() => {
    import('@react-native-async-storage/async-storage').then(async (m) => {
      const val = await m.default.getItem(STORAGE_KEY);
      if (val) setTrainLine(val);
    });
  }, []);

  // Fetch train
  const fetchTrain = useCallback(async () => {
    if (!trainLine) return;
    setLoading(true);
    try {
      const res = await fetch(TRANSIT_URL);
      const json = await res.json();

      const dep = json.departures?.find((d: any) =>
        d.line.toLowerCase().includes(trainLine.toLowerCase())
      );

      if (dep) {
        setNextTrain({
          dest: dep.destination,
          mins: minutesUntil(dep.time),
        });
      }
    } catch {}
    setLoading(false);
  }, [trainLine]);

  useEffect(() => {
    fetchTrain();
  }, [fetchTrain]);

  const handleBle = () => {
    if (error) return Alert.alert('BLE Error', error);
    isConnected ? disconnect() : connect();
  };

  const steps = data.steps ?? 0;
  const heart = data.heartRate ?? null;
  const stepPercent = Math.min((steps / 10000) * 100, 100);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>Home</Text>

          <Pressable onPress={handleBle}>
            <Ionicons
              name="bluetooth"
              size={18}
              color={isConnected ? '#22C55E' : '#94A3B8'}
            />
          </Pressable>
        </View>

        {/* MOOD */}
        <View style={styles.moodSection}>
          <Text style={styles.emoji}>
            {mood ? '😊' : '✨'}
          </Text>
          <Text style={styles.moodText}>
            {mood ?? 'No mood selected'}
          </Text>
          <Text style={styles.subText}>
            Character coming soon
          </Text>
        </View>

        {/* NEXT TRAIN */}
        <Card>
          <Text style={styles.cardLabel}>Next Train</Text>

          {loading ? (
            <ActivityIndicator />
          ) : nextTrain ? (
            <>
              <Text style={styles.bigValue}>
                {nextTrain.mins} min
              </Text>
              <Text style={styles.subText}>
                {nextTrain.dest}
              </Text>
            </>
          ) : (
            <Text style={styles.subText}>No data</Text>
          )}
        </Card>

        {/* STEPS */}
        <Card>
          <Text style={styles.cardLabel}>Steps</Text>

          <Text style={styles.bigValue}>
            {steps.toLocaleString()} / 10,000
          </Text>

          <ProgressBar value={stepPercent} />
        </Card>

        {/* HEART */}
        <Card>
          <Text style={styles.cardLabel}>Heart Rate</Text>

          <Text style={styles.bigValue}>
            {heart ?? '--'}
          </Text>

          <Text style={styles.subText}>
            {heart ? 'bpm' : 'No data detected'}
          </Text>
        </Card>

      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  container: {
    padding: 20,
    gap: 18,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },

  moodSection: {
    alignItems: 'center',
    marginBottom: 10,
  },

  emoji: {
    fontSize: 60,
  },

  moodText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },

  subText: {
    fontSize: 13,
    color: COLORS.sub,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  cardLabel: {
    fontSize: 13,
    color: COLORS.sub,
    marginBottom: 6,
  },

  bigValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },

  progressTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
  },
});