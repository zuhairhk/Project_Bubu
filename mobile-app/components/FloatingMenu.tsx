import React from "react";
import { View, Pressable, StyleSheet, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";


const { width } = Dimensions.get("window");

// ---- Sizes ----
const FAB_SIZE = 60;
const ITEM_SIZE = 48;
const RADIUS = 120;

// ---- Menu items ----
const MENU_ITEMS = [
  { route: "/(tabs)" as const, icon: "home", label: "Home", angle: -180 },
  { route: "/(tabs)/biometrics" as const, icon: "pulse", label: "Biometrics", angle: -120 },
  { route: "/(tabs)/commute" as const, icon: "car", label: "Commute", angle: -60 },
  { route: "/(tabs)/playlist" as const, icon: "musical-notes", label: "Playlist", angle: 0 },
];

export default function FloatingMenu() {
  const router = useRouter();
  const open = useSharedValue(0);

  // Toggle menu open/close
  const toggleMenu = () => {
    open.value = open.value ? 0 : 1;
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* ---- Animated menu items ---- */}
      {MENU_ITEMS.map((item, index) => {
        const angleRad = (item.angle * Math.PI) / 180;

        const animatedStyle = useAnimatedStyle(() => ({
          transform: [
            {
              translateX: withSpring(
                open.value ? RADIUS * Math.cos(angleRad) : 0,
                { damping: 10, stiffness: 150, mass: 0.8 }
              ),
            },
            {
              translateY: withSpring(
                open.value ? RADIUS * Math.sin(angleRad) : 0,
                { damping: 10, stiffness: 150, mass: 0.8 }
              ),
            },
            {
              scale: withSpring(open.value ? 1 : 0.9, { damping: 12, stiffness: 150 }),
            },
          ],
          opacity: withDelay(
            index * 50, // stagger effect
            withTiming(open.value ? 1 : 0, { duration: 150 })
          ),
        }));

        return (
          <Animated.View key={index} style={[styles.menuItem, animatedStyle]}>
            <Pressable
  onPress={() => {
    toggleMenu();
    router.push(item.route);
  }}
>
  {({ pressed }) => (
    <LinearGradient
      colors={
        pressed
          ? ['#E6F2FA', '#D8EBF7', '#BCD6E6']
          : ['#F8FCFF', '#E6F2FA', '#C9E0EE']
      }
      style={[
        styles.secondaryButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={item.icon as any} size={22} color="#3A5F7D" />
    </LinearGradient>
  )}
</Pressable>

          </Animated.View>
        );
      })}

      {/* ---- Main FAB ---- */}
      <Animated.View
        style={[
          styles.fab,
          useAnimatedStyle(() => ({
            transform: [{ rotate: `${open.value * 45}deg` }],
          })),
        ]}
      >
        <Pressable onPress={toggleMenu}>
  {({ pressed }) => (
    <LinearGradient
      colors={
        pressed
          ? ['#E6F2FA', '#D8EBF7', '#BCD6E6']
          : ['#F8FCFF', '#E6F2FA', '#C9E0EE']
      }
      style={[
        styles.fabButton,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="add" size={30} color="#3A5F7D" />
    </LinearGradient>
  )}
</Pressable>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    bottom: 30,
    left: width / 2 - FAB_SIZE / 2,
    alignItems: "center",
  },
  fab: {
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: 1,
    borderColor: "#B6D0E3",
    justifyContent: "center",
    alignItems: "center",
  },
  menuItem: {
    position: "absolute",
  },
  secondaryButton: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    borderWidth: 1,
    borderColor: "#B6D0E3",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  pressed: {
    transform: [{ translateY: 2 }],
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
});
