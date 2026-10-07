import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { spacing, useBottomSpace } from '@mealdirect/shared';

// A phone with on-screen navigation buttons: 48 points under the app's content
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 48, left: 0 }),
}));

function Probe({ extra }: { extra?: number }) {
  return <Text>{useBottomSpace(extra)}</Text>;
}

describe('useBottomSpace', () => {
  test('pads above the system navigation, plus the screen’s own spacing', async () => {
    await render(<Probe />);
    expect(screen.getByText(String(48 + spacing.lg))).toBeTruthy();
  });

  test('takes the spacing a screen already uses', async () => {
    await render(<Probe extra={spacing.xl * 2} />);
    expect(screen.getByText(String(48 + spacing.xl * 2))).toBeTruthy();
  });
});
