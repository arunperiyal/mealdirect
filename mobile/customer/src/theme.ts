import { BRAND_COLOR } from './config';

export const colors = {
  brand: BRAND_COLOR,
  brandSoft: '#FDECEE',
  text: '#1C1C1C',
  textMuted: '#696969',
  border: '#E8E8E8',
  background: '#F7F7F7',
  surface: '#FFFFFF',
  success: '#1E8E3E',
  successSoft: '#E6F4EA',
  warning: '#B06000',
  warningSoft: '#FEF3E0',
  danger: '#C5221F',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const radius = { sm: 6, md: 10, lg: 16 };

export const font = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
};
