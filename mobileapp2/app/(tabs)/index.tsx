import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { View, Text } from '@/components/Themed';
import { useBle, ConnectionStatus } from '@/lib/BleContext';
import { useMood } from '@/lib/MoodContext';

const { width } = Dimensions.get('window');

const N = {
  red:    '#E4000F',
  blue:   '#009AC7',
  yellow: '#FFD700',
  green:  '#00A650',
  white:  '#FFFFFF',
  ink:    '#1A1A2E',
  grey:   '#F0F0F0',
};

const MOOD_CONFIG: Record<string, {
  color: string; bg: string; label: string; feeling: string;
}> = {
  happy:   { color: '#E4000F', bg: '#FFF5CC', label: 'HAPPY',    feeling: 'Feeling great today!'     },
  neutral: { color: '#009AC7', bg: '#E8F4F8', label: 'NEUTRAL',  feeling: 'Just cruising along'      },
  stressed:{ color: '#FF6B35', bg: '#FFF0E8', label: 'STRESSED', feeling: 'Running on fumes...'      },
  angry:   { color: '#E4000F', bg: '#FFE8E8', label: 'ANGRY',    feeling: 'Watch out!'               },
  sad:     { color: '#5B6CF6', bg: '#EEF0FF', label: 'SAD',      feeling: 'Need a moment...'         },
  sleepy:  { color: '#9B59B6', bg: '#F5EEF8', label: 'SLEEPY',   feeling: 'Zzz... commuting'         },
};

const STATUS_CONFIG: Record<ConnectionStatus, {
  label: string; color: string; icon: keyof typeof Ionicons.glyphMap;
}> = {
  disconnected: { label: 'Disconnected',  color: '#94A3B8', icon: 'bluetooth-outline' },
  scanning:     { label: 'Scanning...',   color: '#FFD700', icon: 'search-outline'    },
  connecting:   { label: 'Connecting...', color: '#009AC7', icon: 'bluetooth-outline' },
  connected:    { label: 'Connected',     color: '#00A650', icon: 'bluetooth'         },
};

// ─── Character component ──────────────────────────────────────────────────────
function MoodCharacter({ mood }: { mood: string }) {
  const cfg   = MOOD_CONFIG[mood] ?? MOOD_CONFIG['neutral'];
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const eyeScale = blink ? 0.15 : 1;

  const armRotLeft  = mood === 'happy' ? '-35deg' : mood === 'angry' ? '-65deg' : mood === 'stressed' ? '-20deg' : '15deg';
  const armRotRight = mood === 'happy' ? '35deg'  : mood === 'angry' ? '65deg'  : mood === 'stressed' ? '20deg'  : '-15deg';

  return (
    <View style={[styles.charWrapper, { backgroundColor: cfg.bg }]}>
      <View style={styles.charBody}>
        {/* Head */}
        <View style={[styles.head, { backgroundColor: '#FFDBB5', borderColor: cfg.color }]}>
          {/* Hair */}
          <View style={[styles.hair, { backgroundColor: cfg.color }]} />
          {/* Eyes */}
          <View style={styles.eyeRow}>
            <View style={[styles.eye, { backgroundColor: cfg.color, transform: [{ scaleY: eyeScale }] }]} />
            <View style={[styles.eye, { backgroundColor: cfg.color, transform: [{ scaleY: eyeScale }] }]} />
          </View>
          {/* Mouth */}
          <View style={[
            styles.mouth,
            { borderColor: cfg.color },
            mood === 'happy'   && styles.mouthSmile,
            mood === 'sad'     && styles.mouthFrown,
            mood === 'angry'   && styles.mouthAngry,
            mood === 'stressed'&& styles.mouthWavy,
            mood === 'neutral' && styles.mouthFlat,
            mood === 'sleepy'  && styles.mouthFlat,
          ]} />
          {/* Extras */}
          {mood === 'happy' && <View style={[styles.sparkA, { backgroundColor: cfg.color }]} />}
          {mood === 'happy' && <View style={[styles.sparkB, { backgroundColor: '#FFD700' }]} />}
          {mood === 'sleepy' && <Text style={[styles.zzz, { color: cfg.color }]}>Zzz</Text>}
          {mood === 'stressed' && <View style={[styles.sweat, { backgroundColor: '#009AC7' }]} />}
        </View>

        {/* Neck */}
        <View style={[styles.neck, { backgroundColor: '#FFDBB5' }]} />

        {/* Torso */}
        <View style={[styles.torso, { backgroundColor: cfg.color }]}>
          <View style={[styles.torsoStripe, { backgroundColor: 'rgba(0,0,0,0.15)' }]} />
        </View>

        {/* Arms */}
        <View style={[styles.armL, { backgroundColor: cfg.color, transform: [{ rotate: armRotLeft }] }]} />
        <View style={[styles.armR, { backgroundColor: cfg.color, transform: [{ rotate: armRotRight }] }]} />

        {/* Legs */}
        <View style={styles.legRow}>
          <View style={[styles.leg, { backgroundColor: N.ink }]} />
          <View style={{ width: 10 }} />
          <View style={[styles.leg, { backgroundColor: N.ink }]} />
        </View>

        {/* Feet */}
        <View style={styles.footRow}>
          <View style={[styles.foot, { backgroundColor: N.ink }]} />
          <View style={{ width: 14 }} />
          <View style={[styles.foot, { backgroundColor: N.ink }]} />
        </View>
      </View>

      {/* Badge */}
      <View style={[styles.moodBadge, { backgroundColor: cfg.color }]}>
        <Text style={styles.moodBadgeText}>{cfg.label}</Text>
      </View>
    </View>
  );
}

// ─── Device card ──────────────────────────────────────────────────────────────
function DeviceCard() {
  const { status, deviceName, data, connect, disconnect, error } = useBle();
  const cfg  = STATUS_CONFIG[status];
  const busy = status === 'scanning' || status === 'connecting';

  return (
    <Pressable
      onPress={() => {
        if (error) { Alert.alert('BLE Error', error, [{ text: 'OK' }]); return; }
        if (status === 'connected') disconnect(); else connect();
      }}
      style={[styles.deviceCard, status === 'connected' && { borderColor: N.green }]}
    >
      <View style={styles.deviceLeft}>
        <View style={[styles.deviceIcon, { backgroundColor: cfg.color + '22' }]}>
          {busy
            ? <ActivityIndicator size="small" color={cfg.color} />
            : <Ionicons name={cfg.icon} size={16} color={cfg.color} />
          }
        </View>
        <View>
          <Text style={styles.deviceSmall}>COMMUBU DEVICE</Text>
          <Text style={[styles.deviceName, { color: cfg.color }]}>
            {status === 'connected' ? (deviceName ?? 'Connected') : cfg.label}
          </Text>
        </View>
      </View>

      {status === 'connected' ? (
        <View style={styles.bioRow}>
          <View style={styles.bioChip}>
            <Text style={styles.bioHeart}>♥</Text>
            <Text style={styles.bioNum}>{data.heartRate ?? '--'}</Text>
            <Text style={styles.bioUnit}>bpm</Text>
          </View>
          <View style={[styles.bioChip, { marginLeft: 8 }]}>
            <Text style={styles.bioStep}>↑</Text>
            <Text style={styles.bioNum}>{data.steps ?? '--'}</Text>
            <Text style={styles.bioUnit}>steps</Text>
          </View>
        </View>
      ) : (
        <View style={styles.tapBox}>
          <Text style={styles.tapText}>TAP TO {status === 'disconnected' ? 'CONNECT' : 'CANCEL'}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { status, deviceCustomName } = useBle();
  const { mood } = useMood();

  const activeMood = mood ?? 'neutral';
  const cfg = MOOD_CONFIG[activeMood] ?? MOOD_CONFIG['neutral'];

  const tips: Record<string, string> = {
    happy:   'Keep that energy! Share the good vibes with fellow commuters.',
    neutral: 'A calm commute is a productive commute. You got this.',
    stressed:'Try box breathing: 4s in → 4s hold → 4s out. Repeat.',
    angry:   'Step back, breathe. Your stop is coming — almost there.',
    sad:     "It's okay not to be okay. Your music has your back today.",
    sleepy:  'Grab a window seat, lean back. The train does the work.',
  };

  return (
    <View style={[styles.root, { backgroundColor: cfg.bg, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appName}>COMMUBU</Text>
            <Text style={styles.appSub}>
              {deviceCustomName ? `Hi, ${deviceCustomName}` : 'Your commute companion'}
            </Text>
          </View>
          <View style={[styles.connPill, { backgroundColor: status === 'connected' ? N.green : '#94A3B8' }]}>
            <Ionicons
              name={status === 'connected' ? 'bluetooth' : 'bluetooth-outline'}
              size={11}
              color={N.white}
            />
            <Text style={styles.connPillText}>
              {status === 'connected' ? 'LIVE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* ── Mood heading ── */}
        <View style={styles.moodHeading}>
          <Text style={[styles.moodBig, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.moodSub}>{cfg.feeling}</Text>
          {mood == null && (
            <Text style={styles.moodHint}>
              {status === 'connected'
                ? 'Detecting mood from device...'
                : 'Override mood from Playlist tab'}
            </Text>
          )}
        </View>

        {/* ── Character ── */}
        <MoodCharacter mood={activeMood} />

        {/* ── Device card ── */}
        <DeviceCard />

        {/* ── Tip ── */}
        <View style={[styles.tipCard, { borderLeftColor: cfg.color }]}>
          <Text style={styles.tipLabel}>COMMUBU TIP</Text>
          <Text style={styles.tipText}>{tips[activeMood]}</Text>
        </View>

        {/* ── Override nudge ── */}
        <View style={styles.nudge}>
          <Ionicons name="musical-notes-outline" size={13} color="#94A3B8" />
          <Text style={styles.nudgeText}>
            Tap Playlist tab to override mood and control your music
          </Text>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  // Top bar
  topBar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  appName:      { fontSize: 22, fontWeight: '900', fontFamily: '429Font', color: N.ink, letterSpacing: 2 },
  appSub:       { fontSize: 11, color: '#64748B', fontWeight: '500' },
  connPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  connPillText: { fontSize: 10, fontWeight: '800', color: N.white, letterSpacing: 1 },

  // Mood heading
  moodHeading: { alignItems: 'center', marginBottom: 8 },
  moodBig:     { fontSize: 40, fontWeight: '900', fontFamily: '429Font', letterSpacing: 4 },
  moodSub:     { fontSize: 14, color: '#64748B', fontWeight: '600', marginTop: 2 },
  moodHint:    { fontSize: 11, color: '#94A3B8', marginTop: 6, textAlign: 'center' },

  // Character
  charWrapper: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: N.ink,
    width: width - 40,
    marginBottom: 20,
    position: 'relative',
  },
  charBody:  { alignItems: 'center' },
  head: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  hair:    { position: 'absolute', top: -4, width: 72, height: 26, borderTopLeftRadius: 36, borderTopRightRadius: 36 },
  eyeRow:  { flexDirection: 'row', gap: 18, marginTop: 8 },
  eye:     { width: 10, height: 12, borderRadius: 5 },
  mouth:   { width: 26, height: 9, borderRadius: 5, borderWidth: 2.5, marginTop: 8, backgroundColor: 'transparent' },
  mouthSmile: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderTopWidth: 0 },
  mouthFrown: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomWidth: 0, marginTop: 12 },
  mouthAngry: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomWidth: 0, marginTop: 11 },
  mouthWavy:  { width: 26, height: 6, borderRadius: 2, marginTop: 10 },
  mouthFlat:  { height: 3, borderRadius: 2, borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, marginTop: 10 },
  sparkA: { position: 'absolute', top: 6, right: -6, width: 7, height: 7, borderRadius: 4 },
  sparkB: { position: 'absolute', top: 18, right: -12, width: 5, height: 5, borderRadius: 3 },
  sweat:  { position: 'absolute', top: 6, right: -10, width: 8, height: 13, borderRadius: 5 },
  zzz:    { position: 'absolute', top: -10, right: -24, fontSize: 13, fontWeight: '900' },
  neck:   { width: 22, height: 10 },
  torso:  { width: 58, height: 54, borderRadius: 8, borderWidth: 3, borderColor: N.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  torsoStripe: { width: '100%', height: 10 },
  armL: { position: 'absolute', top: 106, left: 50, width: 15, height: 46, borderRadius: 8, borderWidth: 2, borderColor: N.ink },
  armR: { position: 'absolute', top: 106, right: 50, width: 15, height: 46, borderRadius: 8, borderWidth: 2, borderColor: N.ink },
  legRow: { flexDirection: 'row', marginTop: 4 },
  leg:    { width: 20, height: 38, borderRadius: 5, borderWidth: 2, borderColor: N.ink },
  footRow:{ flexDirection: 'row' },
  foot:   { width: 24, height: 13, borderRadius: 7, borderWidth: 2, borderColor: N.ink },
  moodBadge: {
    position: 'absolute', bottom: -14,
    paddingHorizontal: 18, paddingVertical: 5,
    borderRadius: 20, borderWidth: 2.5, borderColor: N.ink,
  },
  moodBadgeText: { fontSize: 11, fontWeight: '900', color: N.white, letterSpacing: 1.5 },

  // Device card
  deviceCard:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: N.white, borderRadius: 16, borderWidth: 2.5, borderColor: N.ink, padding: 14, marginBottom: 14 },
  deviceLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon:  { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deviceSmall: { fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 1 },
  deviceName:  { fontSize: 13, fontWeight: '700', marginTop: 1 },
  bioRow:      { flexDirection: 'row' },
  bioChip:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, gap: 3 },
  bioHeart:    { fontSize: 10, color: '#E4000F' },
  bioStep:     { fontSize: 10, color: '#009AC7' },
  bioNum:      { fontSize: 15, fontWeight: '800', color: N.ink },
  bioUnit:     { fontSize: 9, color: '#94A3B8', fontWeight: '600' },
  tapBox:      { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  tapText:     { fontSize: 9, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },

  // Tip
  tipCard:  { backgroundColor: N.white, borderRadius: 16, borderWidth: 2.5, borderColor: N.ink, padding: 16, borderLeftWidth: 6, marginBottom: 14 },
  tipLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, marginBottom: 5 },
  tipText:  { fontSize: 13, color: N.ink, fontWeight: '500', lineHeight: 20 },

  // Nudge
  nudge:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nudgeText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', flex: 1 },
});