import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
        <LinearGradient
          colors={colors ?? ['#F8FCFF', '#E6F2FA', '#C9E0EE']}
          start={[0, 0]} end={[0, 1]}
          style={[styles.button, disabled && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={[styles.label, disabled && styles.labelDisabled]}>{title}</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 18,
    borderRadius:    999,
    borderWidth:     1.5,
    borderColor:     'rgba(255,255,255,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
    elevation:       4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.12,
    shadowRadius:    14,
  },
  pressed:       { opacity: 0.8 },
  disabled:      { opacity: 0.5 },
  label: {
    fontSize:   15,
    fontWeight: '600',
    color:      '#334155',
    fontFamily: '429Font',
    textAlign:  'center',
  },
  labelDisabled: { color: '#94A3B8' },
});