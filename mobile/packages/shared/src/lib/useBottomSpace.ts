import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme';

/**
 * Bottom padding for a scrolling screen outside the tab bar. The apps draw edge to edge,
 * so without the inset the last rows sit under Android's navigation buttons or the
 * iPhone home indicator, even scrolled to the end. Tab screens don't need it: the tab bar
 * already sits above them.
 */
export const useBottomSpace = (extra: number = spacing.lg) => useSafeAreaInsets().bottom + extra;
