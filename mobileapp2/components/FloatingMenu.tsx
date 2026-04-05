
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, Dimensions, Text } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useBle } from '@/lib/BleContext';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const FAB_SIZE  = 58;
const ITEM_SIZE = 50;
const RADIUS    = 110;

const MENU_ITEMS = [
  { route: '/(tabs)'            as const, icon: 'home-outline',          label: 'Home',     angle: -180 },
  { route: '/(tabs)/biometrics' as const, icon: 'pulse-outline',         label: 'Health',   angle: -120 },
  { route: '/(tabs)/commute'    as const, icon: 'car-outline',            label: 'Commute',  angle: -60  },
  { route: '/(tabs)/playlist'   as const, icon: 'musical-notes-outline',  label: 'Playlist', angle: 0    },
] as const;

function BleStatusDot() {
  const { status } = useBle();
  const color =
    status === 'connected' ? '#4ADE80' :
    status === 'scanning' || status === 'connecting' ? '#FBBF24' :
    '#FFF8E9';
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

export default function FloatingMenu() {
  const router   = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const openProgress = useSharedValue(0);

  useEffect(() => {
    openProgress.value = withTiming(open ? 1 : 0, { duration: 350 });
  }, [open]);

  const toggle = () => setOpen(o => !o);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Menu items — always rendered, animated in/out */}
      {MENU_ITEMS.map((item, index) => {
        const rad = (item.angle * Math.PI) / 180;
        const x = RADIUS * Math.cos(rad);
        const y = RADIUS * Math.sin(rad);
        const isActive = pathname === item.route || (item.route === '/(tabs)' && pathname === '/');

        const animatedStyle = useAnimatedStyle(() => ({
          transform: [
            { translateX: openProgress.value * x },
            { translateY: openProgress.value * y },
            { scale: openProgress.value },
          ],
          opacity: openProgress.value,
        }));

        return (
          <Animated.View
            key={index}
            style={[styles.menuItem, animatedStyle]}
            pointerEvents={open ? 'auto' : 'none'}
          >
            <Pressable
              onPress={() => { toggle(); router.push(item.route); }}
              style={styles.menuPressable}
            >
              {({ pressed }) => (
                <LinearGradient
                  colors={isActive
                    ? ['#FFF8E9', '#E5F0AE', '#B7D7A8']
                    : pressed
                    ? ['#FFF8E9', '#E5F0AE', '#D9E69A']
                    : ['#FFF8E9', '#FEFFE9', '#E5F0AE']}
                  style={[
                    styles.itemBtn,
                    isActive && styles.itemBtnActive,
                    pressed && styles.pressed,
                    styles.itemBtnShadow
                  ]}
                >
                  <Ionicons name={item.icon as any} size={20} color={isActive ? '#A3C47C' : '#468849'} />
                  <Text style={[styles.itemLabel, { color: isActive ? '#A3C47C' : '#604848' }]}>{item.label}</Text>
                </LinearGradient>
              )}
            </Pressable>
          </Animated.View>
        );
      })}

      {/* Main FAB */}
      <View style={styles.fab}>
        <Pressable onPress={toggle}>
          {({ pressed }) => (
            <LinearGradient
              colors={pressed ? ['#fff2d7ff', '#eef7bfff', '#d9e69aff'] : ['#FFF8E9', '#feffe9ff', '#E5F0AE']}
              style={[styles.fabBtn, pressed && styles.pressed]}
            >
              <Ionicons name={open ? 'close' : 'add'} size={28} color="#604848" />
              <BleStatusDot />
            </LinearGradient>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position:   'absolute',
    bottom:     32,
    left:       width / 2 - FAB_SIZE / 2,
    alignItems: 'center',
    zIndex:     100,
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
    width:          FAB_SIZE,
    height:         FAB_SIZE,
    borderRadius:   FAB_SIZE / 2,
    borderWidth:    1,
    borderColor:    '#604848',
    justifyContent: 'center',
    alignItems:     'center',
  },
  statusDot: {
    position:     'absolute',
    top:          8,
    right:        8,
    width:        8,
    height:       8,
    borderRadius: 4,
    borderWidth:  1.5,
    borderColor:  '#FFF8E9',
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
    borderWidth:    0.5,
    borderColor:    '#604848',
    alignItems:     'center',
    justifyContent: 'center',
  },
  itemBtnActive: { borderColor: '#B7D7A8' },
  itemBtnShadow: {
    shadowColor:   '#604848',
    shadowOpacity: 0.22,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 8 },
    elevation:     10,
  },
  itemLabel: {
    fontSize:   7,
    fontWeight: '600',
    marginTop:  1,
  },
  pressed: { opacity: 1 },
});