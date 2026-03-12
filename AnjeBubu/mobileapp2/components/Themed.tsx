import {
  Text as RNText,
  View as RNView,
  TextProps,
  ViewProps,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Colors } from '@/constants/Colors';

export function useThemeColors() {
  const scheme = useColorScheme() ?? 'light';
  return Colors[scheme];
}

export function Text({ style, ...rest }: TextProps) {
  const colors = useThemeColors();
  return <RNText style={[{ color: colors.text }, style]} {...rest} />;
}

export function SubText({ style, ...rest }: TextProps) {
  const colors = useThemeColors();
  return <RNText style={[{ color: colors.subtext, fontSize: 13 }, style]} {...rest} />;
}

export function View({ style, ...rest }: ViewProps) {
  const colors = useThemeColors();
  return <RNView style={[{ backgroundColor: colors.background }, style]} {...rest} />;
}

export function Card({ style, ...rest }: ViewProps) {
  const colors = useThemeColors();
  return (
    <RNView
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
      {...rest}
    />
  );
}
