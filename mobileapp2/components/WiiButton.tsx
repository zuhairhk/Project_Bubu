import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

type Props = {
  title:    string;
  onPress?: () => void;
  colors?:  readonly [string, string, string];
  disabled?: boolean;
};

export default function WiiButton({ title, onPress, colors, disabled }: Props) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ overflow: 'visible' }}>
      {({ pressed }) => (
        <MotiView
          animate={{
            translateY:    pressed ? 2 : 0,
            shadowOpacity: pressed ? 0.04 : 0.12,
            shadowRadius:  pressed ? 4 : 14,
          }}
          transition={{ type: 'spring', damping: 14 }}
          style={styles.shadow}
        >
          <LinearGradient
            colors={colors ?? ['#F8FCFF', '#E6F2FA', '#C9E0EE']}
            start={[0, 0]} end={[0, 1]}
            style={[styles.button, disabled && styles.disabled]}
          >
            <Text style={[styles.label, disabled && styles.labelDisabled]}>{title}</Text>
          </LinearGradient>
        </MotiView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius:  14,
    overflow:      'visible',
    elevation:     4,
  },
  button: {
    paddingVertical: 18,
    borderRadius:    999,
    borderWidth:     1.5,
    borderColor:     'rgba(255,255,255,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  disabled: { opacity: 0.5 },
  label: {
    fontSize:    15,
    fontWeight:  '600',
    color:       '#334155',
    fontFamily:  '429Font',
    textAlign:   'center',
  },
  labelDisabled: { color: '#94A3B8' },
});
