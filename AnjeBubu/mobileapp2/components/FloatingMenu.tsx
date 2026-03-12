import React from 'react';
import { View, Pressable, StyleSheet, Dimensions, Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useBle } from '@/lib/BleContext';

const { width } = Dimensions.get('window');

const FAB_SIZE  = 58;
const ITEM_SIZE = 50;
const RADIUS    = 110;

const MENU_ITEMS = [
  { route: '/(tabs)'            as const, icon: 'home-outline',         label: 'Home',       angle: -180 },
  { route: '/(tabs)/biometrics' as const, icon: 'pulse-outline',        label: 'Health',     angle: -120 },
  { route: '/(tabs)/commute'    as const, icon: 'car-outline',           label: 'Commute',    angle: -60  },
  { route: '/(tabs)/playlist'   as const, icon: 'musical-notes-outline', label: 'Playlist',   angle: 0    },
] as const;

// ── Status dot ────────────────────────────────────────────────────────────────
function BleStatusDot() {
  const { status } = useBle();
  const color = status === 'connected' ? '#4ADE80' : status === 'scanning' || status === 'connecting' ? '#FBBF24' : '#CBD5E1';
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

export default function FloatingMenu() {
  const router   = useRouter();
  const pathname = usePathname();
  const open     = useSharedValue(0);

  const toggle = () => { open.value = open.value ? 0 : 1; };

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${withTiming(open.value * 45, { duration: 200 })}deg` }],
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      {MENU_ITEMS.map((item, index) => {
        const rad = (item.angle * Math.PI) / 180;
        const isActive = pathname === item.route || (item.route === '/(tabs)' && pathname === '/');

        const itemStyle = useAnimatedStyle(() => ({
          transform: [
            { translateX: withSpring(open.value ? RADIUS * Math.cos(rad) : 0, { damping: 12, stiffness: 180 }) },
            { translateY: withSpring(open.value ? RADIUS * Math.sin(rad) : 0, { damping: 12, stiffness: 180 }) },
            { scale:      withSpring(open.value ? 1 : 0.6,                    { damping: 14, stiffness: 180 }) },
          ],
          opacity: withDelay(index * 40, withTiming(open.value ? 1 : 0, { duration: 120 })),
          pointerEvents: open.value ? 'auto' : 'none',
        }));

        return (
          <Animated.View key={index} style={[styles.menuItem, itemStyle]}>
            <Pressable
              onPress={() => { toggle(); router.push(item.route); }}
              style={styles.menuPressable}
            >
              {({ pressed }) => (
                <LinearGradient
                  colors={isActive
                    ? ['#DBEAFE', '#BFDBFE', '#93C5FD']
                    : pressed
                    ? ['#E6F2FA', '#D8EBF7', '#BCD6E6']
                    : ['#F8FCFF', '#E6F2FA', '#C9E0EE']}
                  style={[styles.itemBtn, isActive && styles.itemBtnActive, pressed && styles.pressed]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={isActive ? '#2563EB' : '#3A5F7D'}
                  />
                  <Text style={[styles.itemLabel, isActive && { color: '#2563EB' }]}>
                    {item.label}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>
          </Animated.View>
        );
      })}

      {/* Main FAB */}
      <Animated.View style={[styles.fab, fabStyle]}>
        <Pressable onPress={toggle}>
          {({ pressed }) => (
            <LinearGradient
              colors={pressed ? ['#E6F2FA', '#D8EBF7', '#BCD6E6'] : ['#F8FCFF', '#E6F2FA', '#C9E0EE']}
              style={[styles.fabBtn, pressed && styles.pressed]}
            >
              <Ionicons name="add" size={28} color="#3A5F7D" />
              <BleStatusDot />
            </LinearGradient>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom:   32,
    left:     width / 2 - FAB_SIZE / 2,
    alignItems: 'center',
    zIndex:   100,
  },
  fab: {
    zIndex:        10,
    shadowColor:   '#000',
    shadowOpacity: 0.15,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 6 },
    elevation:     8,
  },
  fabBtn: {
    width:           FAB_SIZE,
    height:          FAB_SIZE,
    borderRadius:    FAB_SIZE / 2,
    borderWidth:     1,
    borderColor:     '#B6D0E3',
    justifyContent:  'center',
    alignItems:      'center',
  },
  statusDot: {
    position:     'absolute',
    top:          8,
    right:        8,
    width:        8,
    height:       8,
    borderRadius: 4,
    borderWidth:  1.5,
    borderColor:  '#fff',
  },
  menuItem: {
    position: 'absolute',
    zIndex:   9,
  },
  menuPressable: { overflow: 'visible' },
  itemBtn: {
    width:          ITEM_SIZE,
    height:         ITEM_SIZE,
    borderRadius:   ITEM_SIZE / 2,
    borderWidth:    1,
    borderColor:    '#B6D0E3',
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOpacity:  0.10,
    shadowRadius:   8,
    shadowOffset:   { width: 0, height: 4 },
    elevation:      4,
  },
  itemBtnActive: {
    borderColor: '#93C5FD',
  },
  itemLabel: {
    fontSize:   7,
    fontWeight: '600',
    color:      '#3A5F7D',
    marginTop:  1,
  },
  pressed: {
    opacity: 0.85,
  },
});
