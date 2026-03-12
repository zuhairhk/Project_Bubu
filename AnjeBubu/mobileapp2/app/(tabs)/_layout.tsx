import { Tabs } from 'expo-router';
import FloatingMenu from '@/components/FloatingMenu';
import { View } from 'react-native';

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      {/* Hide the native tab bar — navigation is via the floating radial menu */}
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="index"       options={{ title: 'Home' }} />
        <Tabs.Screen name="biometrics"  options={{ title: 'Biometrics' }} />
        <Tabs.Screen name="commute"     options={{ title: 'Commute' }} />
        <Tabs.Screen name="playlist"    options={{ title: 'Playlist' }} />
      </Tabs>

      {/* Floating radial menu rendered on top of every tab */}
      <FloatingMenu />
    </View>
  );
}
