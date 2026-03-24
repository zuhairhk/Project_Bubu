// CLEAN MODERN HOME (no messy gradients, unified UI)

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
import { useBle, ConnectionStatus } from '@/lib/BleContext';
import { useMood } from '@/lib/MoodContext';

// ─── Minimal theme ─────────────────────────────
const COLORS = {
  bg: '#F7F8FC',
  card: '#FFFFFF',
  text: '#0F172A',
  sub: '#64748B',
  accent: '#7C3AED',
  border: '#E2E8F0',
};

// ─── BLE ─────────────────────────────
const STATUS_CFG: Record<ConnectionStatus, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  disconnected: { color: '#94A3B8', icon: 'bluetooth-outline' },
  scanning:     { color: '#FBBF24', icon: 'search-outline' },
  connecting:   { color: '#60A5FA', icon: 'bluetooth-outline' },
  connected:    { color: '#22C55E', icon: 'bluetooth' },
};

// ─── Transit ─────────────────────────────
const TRANSIT_URL = 'https://7685-141-117-117-240.ngrok-free.app/api/transit/next';
const STORAGE_KEY = 'commute_selected_line';

function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, deviceName, data, connect, disconnect, error } = useBle();
  const { mood } = useMood();

  const ble = STATUS_CFG[status];
  const isConnected = status === 'connected';

  const [nextTrain, setNextTrain] = useState<any>(null);
  const [trainLine, setTrainLine] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    import('@react-native-async-storage/async-storage').then(async (m) => {
      const val = await m.default.getItem(STORAGE_KEY);
      if (val) setTrainLine(val);
    });
  }, []);

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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>Commubu</Text>

          <Pressable onPress={handleBle} style={styles.ble}>
            <Ionicons name={ble.icon} size={16} color={ble.color} />
          </Pressable>
        </View>

        {/* HERO (center focus like your reference) */}
        <View style={styles.hero}>
          <Text style={styles.emoji}>
            {mood ? '😊' : '✨'}
          </Text>

          <Text style={styles.heroText}>
            {mood ?? 'Select mood'}
          </Text>
        </View>

        {/* MAIN CARD */}
        <View style={styles.card}>

          {/* TRAIN */}
          <View style={styles.row}>
            <Text style={styles.label}>Next Train</Text>

            {loading ? (
              <ActivityIndicator />
            ) : nextTrain ? (
              <Text style={styles.value}>
                {nextTrain.mins} min
              </Text>
            ) : (
              <Text style={styles.sub}>—</Text>
            )}
          </View>

          {/* STEPS */}
          <View style={styles.row}>
            <Text style={styles.label}>Steps</Text>
            <Text style={styles.value}>
              {data.steps ?? '--'}
            </Text>
          </View>

          {/* HEART */}
          <View style={styles.row}>
            <Text style={styles.label}>Heart</Text>
            <Text style={styles.value}>
              {data.heartRate ?? '--'}
            </Text>
          </View>

        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  container: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },

  ble: {
    padding: 10,
  },

  hero: {
    alignItems: 'center',
    marginBottom: 30,
  },

  emoji: {
    fontSize: 64,
    marginBottom: 10,
  },

  heroText: {
    fontSize: 18,
    color: COLORS.sub,
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    color: COLORS.sub,
  },

  value: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },

  sub: {
    color: COLORS.sub,
  },
});