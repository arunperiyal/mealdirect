import { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

// On a wide browser window, keep the app in a centered column instead of stretching
// phone layouts edge to edge. Phones render the app as is.
export function WebFrame({ children, maxWidth }: { children: ReactNode; maxWidth: number }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.page}>
      <View style={[styles.column, { maxWidth }]}>{children}</View>
    </View>
  );
}

// Sheets open in a full-window overlay; keep them the width of the column
export const SHEET_MAX_WIDTH = 640;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.border, alignItems: 'center' },
  column: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
    // A hairline edge where the column meets the page
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});

// Tab bar options for the browser: react-native-web renders the tab label taller than
// the 10px box the tab bar gives it, cutting it off, so set its line height and give
// the bar room. Phones keep the defaults.
export const webTabBarOptions =
  Platform.OS === 'web'
    ? { tabBarLabelStyle: { fontSize: 11, lineHeight: 14 }, tabBarStyle: { height: 56 } }
    : {};
