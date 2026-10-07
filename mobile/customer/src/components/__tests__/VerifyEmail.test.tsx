import { fireEvent, render, screen } from '@testing-library/react-native';
import { VerifyEmail, type User } from '@mealdirect/shared';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const verified = { id: 'u1', email: 'neha@test.com', isVerified: true } as User;

const setup = async (overrides: Partial<Parameters<typeof VerifyEmail>[0]> = {}) => {
  const props = {
    email: 'neha@test.com',
    verify: jest.fn().mockResolvedValue(verified),
    resend: jest.fn().mockResolvedValue(undefined),
    onVerified: jest.fn(),
    onSignOut: jest.fn(),
    ...overrides,
  };
  await render(<VerifyEmail {...props} />);
  return props;
};

describe('VerifyEmail', () => {
  test('says where the code went, checks it, and opens the app once verified', async () => {
    const props = await setup();
    expect(screen.getByText('We sent a 6-digit code to neha@test.com. It works for 15 minutes.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Verify'));
    expect(screen.getByText('Enter the 6-digit code from the email')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Code'), ' 12 34 56 ');
    await fireEvent.press(screen.getByText('Verify'));
    expect(props.verify).toHaveBeenCalledWith('123456');
    expect(props.onVerified).toHaveBeenCalledWith(verified);
  });

  test('a wrong code says why; a new code can be sent; signing out is offered', async () => {
    const props = await setup({ verify: jest.fn().mockRejectedValue({ message: 'That code is wrong or has expired. Ask for a new one.' }) });
    await fireEvent.changeText(screen.getByLabelText('Code'), '000000');
    await fireEvent.press(screen.getByText('Verify'));
    expect(await screen.findByText('That code is wrong or has expired. Ask for a new one.')).toBeTruthy();
    expect(props.onVerified).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Send a new code'));
    expect(props.resend).toHaveBeenCalled();
    expect(await screen.findByText('A new code is on its way to neha@test.com.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Sign out'));
    expect(props.onSignOut).toHaveBeenCalled();
  });
});
