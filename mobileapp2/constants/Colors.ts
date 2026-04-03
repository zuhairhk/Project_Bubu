// Commubu design token palette
const palette = {
  blue100: '#EBF4FF',
  blue200: '#C9E0F5',
  blue300: '#A8CCF0',
  blue500: '#4D96FF',
  blue700: '#2563EB',
  teal400: '#38BDF8',
  slate50:  '#F0F0D8',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate600: '#475569',
  slate800: '#1E293B',
  slate900: '#0F172A',
  green400: '#4ADE80',
  red400:   '#F87171',
  amber400: '#FBBF24',
  purple400: '#C084FC',
};

export const Colors = {
  light: {
    text:           '#604848',
    subtext:        palette.slate400,
    background:     '#F0F0D8',
    card:           '#d5e09c',
    cardBorder:     palette.slate200,
    tint:           palette.blue500,
    accent:         palette.teal400,
    tabIconDefault: palette.slate300,
    tabIconSelected:palette.blue500,
    separator:      palette.slate200,
  },
  dark: {
    text:           '#F8FAFC',
    subtext:        palette.slate400,
    background:     palette.slate900,
    card:           palette.slate800,
    cardBorder:     '#334155',
    tint:           palette.blue300,
    accent:         palette.teal400,
    tabIconDefault: '#475569',
    tabIconSelected:palette.blue300,
    separator:      '#334155',
  },
};

export default Colors;
