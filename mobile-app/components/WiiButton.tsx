import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

type WiiButtonProps = {
  title: string;
  onPress?: () => void;
  colors?: string[];
};

export default function WiiButton({ title, onPress, colors }: WiiButtonProps) {
  return (
    <Pressable onPress={onPress} style={{ overflow: 'visible' }}>
      {({ pressed }) => (
        <MotiView
          animate={{
            translateY: pressed ? 2 : 0,       // move down slightly
            shadowOpacity: pressed ? 0.04 : 0.12,
            shadowRadius: pressed ? 6 : 16,
          }}
          transition={{ type: 'spring', damping: 14 }}
          style={styles.shadowWrapper}
        >
          <LinearGradient
            colors={colors ?? ['#F8FCFF', '#E6F2FA', '#C9E0EE']}
            start={[0.0, 0.0]}
            end={[0.0, 1.0]}
            style={styles.button}
          >
            {/* Wrap text separately to avoid scaling blur */}
            <View style={styles.textWrapper}>
              <Text style={styles.text}>{title}</Text>
            </View>
          </LinearGradient>
        </MotiView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    overflow: 'visible', // ensure shadow is not clipped
  },
  button: {
    paddingVertical: 20,
    borderRadius: 999, // ultra pill / bubbly
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    fontFamily: '429Font',
  },
});
