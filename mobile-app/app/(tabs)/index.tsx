import { StyleSheet } from 'react-native';
import { View } from '@/components/Themed';
import { MotiText } from 'moti';
import WiiButton from '@/components/WiiButton';
import LottieView from 'lottie-react-native';
import { useCallback } from 'react';

export const options = {
  headerShown: false,
};

/* 🎨 Mood → Gradient colors */
const MOOD_COLORS: Record<string, string[]> = {
  happy: ['#FFF7C2', '#FFE680', '#FFD23F'],
  neutral: ['#F1F5F9', '#E2E8F0', '#CBD5E1'],
  stressed: ['#FFD6D6', '#FFB3B3', '#FF8A8A'],
  angry: ['#FFB3B3', '#FF7A7A', '#E63946'],
  sad: ['#D6E4FF', '#BBD0FF', '#9AA9FF'],
  sleepy: ['#E6DFFF', '#CFC4FF', '#B8A9FF'],
};

/* API-supported moods only */
const API_MOOD_MAP: Record<string, string> = {
  happy: 'happy',
  neutral: 'neutral',
  stressed: 'stressed',
  sad: 'sad',
  angry: 'stressed',
  sleepy: 'neutral',
};

const MOODS = ['happy', 'neutral', 'stressed', 'angry', 'sad', 'sleepy'];

export default function TabOneScreen() {
  const title = 'Welcome back!';

  const postMood = useCallback(async (mood: string) => {
    try {
      await fetch(
        'https://f58f-2607-fea8-fd90-7a41-edf8-3fb3-76cc-68c1.ngrok-free.app/api/health',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            heart_rate: 70, // placeholder
            steps: 0,       // placeholder
            mood: API_MOOD_MAP[mood],
            timestamp: new Date().toISOString(),
          }),
        }
      );

      console.log(`Mood submitted: ${mood}`);
    } catch (error) {
      console.error('Failed to submit mood:', error);
    }
  }, []);

  return (
    <View style={styles.container}>
      {/* 🌊 Wavy title */}
      <View style={styles.topSection}>
        <View style={styles.row}>
          {title.split('').map((char, index) => (
            <MotiText
              key={index}
              from={{ opacity: 0 }}
              animate={{ opacity: 1, translateY: [0, -8, 0] }}
              transition={{
                type: 'timing',
                duration: 600,
                delay: index * 50,
              }}
              style={styles.title}
            >
              {char}
            </MotiText>
          ))}
        </View>
      </View>

      {/* 🎞️ Lottie animation */}
      <LottieView
        source={require('@/assets/animations/test.json')}
        autoPlay
        loop={false}
        speed={0.8}
        style={styles.lottie}
      />

      {/* 🫧 Mood grid header */}
      <MotiText
        style={styles.moodHeader}
        from={{ opacity: 0, translateY: -10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 500, delay: 400 }}
      >
        How are you feeling today?
      </MotiText>

      {/* 🫧 Mood grid (3 × 2) */}
      <View style={styles.moodGrid}>
        {MOODS.map((mood) => (
          <View key={mood} style={styles.moodButton}>
            <WiiButton
              title={mood.charAt(0).toUpperCase() + mood.slice(1)}
              colors={MOOD_COLORS[mood]}
              onPress={() => postMood(mood)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/* 🎨 Styles */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 90,
  },
  topSection: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: '429Font',
  },
  lottie: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  moodHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 24,
    color: '#444',
    fontFamily: '429Font',
    textAlign: 'center',
  },
  moodGrid: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
    overflow: 'visible',
  },
  moodButton: {
    width: '30%', // 3 columns
    overflow: 'visible',
    marginBottom: 12,
  },
});
