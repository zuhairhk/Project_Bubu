import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MotiText, MotiView } from 'moti';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { View, Text, SubText, useThemeColors } from '@/components/Themed';
import WiiButton from '@/components/WiiButton';
import { useBle, ConnectionStatus } from '@/lib/BleContext';

// ─── Mood config ─────────────────────────────────────────────────────────────
const MOOD_COLORS: Record<string, readonly [string, string, string]> = {
  happy:   ['#FFF7C2', '#FFE680', '#FFD23F'],
  neutral: ['#F1F5F9', '#E2E8F0', '#CBD5E1'],
  stressed:['#FFD6D6', '#FFB3B3', '#FF8A8A'],
  angry:   ['#FFB3B3', '#FF7A7A', '#E63946'],
  sad:     ['#D6E4FF', '#BBD0FF', '#9AA9FF'],
  sleepy:  ['#E6DFFF', '#CFC4FF', '#B8A9FF'],
};

const MOOD_EMOJIS: Record<string, string> = {
  happy: '😊', neutral: '😐', stressed: '😤', angry: '😠', sad: '😢', sleepy: '😴',
};

const API_MOOD_MAP: Record<string, string> = {
  happy: 'happy', neutral: 'neutral', stressed: 'stressed',
  sad: 'sad', angry: 'stressed', sleepy: 'neutral',
};

const MOODS = ['happy', 'neutral', 'stressed', 'angry', 'sad', 'sleepy'];
const BACKEND_URL = 'https://f58f-2607-fea8-fd90-7a41-edf8-3fb3-76cc-68c1.ngrok-free.app/api/health';

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  disconnected: { label: 'Disconnected', color: '#94A3B8', icon: 'bluetooth-outline' },
  scanning:     { label: 'Scanning…',    color: '#FBBF24', icon: 'search-outline' },
  connecting:   { label: 'Connecting…',  color: '#60A5FA', icon: 'bluetooth-outline' },
  connected:    { label: 'Connected',    color: '#4ADE80', icon: 'bluetooth' },
};

function BleStatusBadge() {
  const { status, deviceName, connect, disconnect, error } = useBle();
  const cfg = STATUS_CONFIG[status];
  const colors = useThemeColors();
  const busy = status === 'scanning' || status === 'connecting';

  const handlePress = () => {
    if (error) {
      Alert.alert('BLE Error', error, [{ text: 'OK' }]);
      return;
    }
    if (status === 'connected') disconnect();
    else connect();
  };

  return (
    <Pressable onPress={handlePress} style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {busy
        ? <ActivityIndicator size="small" color={cfg.color} style={{ marginRight: 6 }} />
        : <Ionicons name={cfg.icon} size={14} color={cfg.color} style={{ marginRight: 4 }} />
      }
      <Text style={[styles.badgeText, { color: cfg.color }]}>
        {status === 'connected' ? (deviceName ?? cfg.label) : cfg.label}
      </Text>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, sendMood, data } = useBle();
  const [lastMood, setLastMood] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleMood = useCallback(async (mood: string) => {
    setSending(true);
    setLastMood(mood);
    try {
      // Post to backend (non-blocking, best-effort)
      fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heart_rate: data.heartRate ?? 70,
          steps:      data.steps    ?? 0,
          mood:       API_MOOD_MAP[mood],
          timestamp:  new Date().toISOString(),
        }),
      }).catch(() => {});

      // Send to ESP32
      await sendMood(mood);
    } finally {
      setSending(false);
    }
  }, [sendMood, data]);

  const title = 'Welcome back!';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      {/* BLE status badge */}
      <View style={styles.headerRow}>
        <BleStatusBadge />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Wavy title */}
        <View style={styles.titleRow}>
          {title.split('').map((char, i) => (
            <MotiText
              key={i}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 500, delay: i * 40 }}
              style={styles.title}
            >
              {char === ' ' ? '\u00A0' : char}
            </MotiText>
          ))}
        </View>

        {/* Lottie animation */}
        <LottieView
          source={require('@/assets/animations/test.json')}
          autoPlay
          loop={false}
          speed={0.8}
          style={styles.lottie}
        />

        {/* Mood prompt */}
        <MotiText
          style={styles.moodPrompt}
          from={{ opacity: 0, translateY: -8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 350 }}
        >
          How are you feeling today?
        </MotiText>

        {/* Last mood sent */}
        {lastMood && (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={styles.sentBadge}
          >
            <Text style={styles.sentText}>
              {MOOD_EMOJIS[lastMood]}  Sent <Text style={styles.sentMood}>{lastMood}</Text>
              {status === 'connected' ? ' to device' : ' (device offline)'}
            </Text>
          </MotiView>
        )}

        {/* Mood grid */}
        <View style={styles.grid}>
          {MOODS.map((mood) => (
            <View key={mood} style={styles.gridCell}>
              <WiiButton
                title={`${MOOD_EMOJIS[mood]}  ${mood.charAt(0).toUpperCase() + mood.slice(1)}`}
                colors={MOOD_COLORS[mood]}
                onPress={() => handleMood(mood)}
                disabled={sending}
              />
            </View>
          ))}
        </View>

        {/* Connect hint when disconnected */}
        {status === 'disconnected' && (
          <SubText style={styles.hint}>
            Tap the badge above to connect your Commubu device
          </SubText>
        )}

        {/* Spacer for floating menu */}
        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 4 },
  badge:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  scroll:    { alignItems: 'center', paddingTop: 8 },
  titleRow:  { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 4 },
  title:     { fontSize: 30, fontWeight: 'bold', fontFamily: '429Font' },
  lottie:    { width: 180, height: 180, marginBottom: 8 },
  moodPrompt:{ fontSize: 17, fontWeight: '600', color: '#475569', fontFamily: '429Font', marginBottom: 12 },
  sentBadge: { backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: '#BBF7D0' },
  sentText:  { fontSize: 13, color: '#166534' },
  sentMood:  { fontWeight: '700' },
  grid:      { width: '100%', paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, overflow: 'visible' },
  gridCell:  { width: '31%', overflow: 'visible', marginBottom: 4 },
  hint:      { textAlign: 'center', marginTop: 16, paddingHorizontal: 32 },
});
