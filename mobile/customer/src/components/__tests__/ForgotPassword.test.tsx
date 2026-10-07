import { fireEvent, render, screen } from '@testing-library/react-native';
import { ForgotPassword } from '@mealdirect/shared';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const setup = async (overrides: Partial<Parameters<typeof ForgotPassword>[0]> = {}) => {
  const props = {
    requestCode: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn().mockResolvedValue(undefined),
    onBack: jest.fn(),
    ...overrides,
  };
  await render(<ForgotPassword {...props} />);
  return props;
};

describe('ForgotPassword', () => {
  test('emails a code, then sets the new password and signs in with it', async () => {
    const props = await setup();
    await fireEvent.press(screen.getByText('Email me a code'));
    expect(screen.getByText('Enter your email')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Email'), ' priya@test.com ');
    await fireEvent.press(screen.getByText('Email me a code'));
    expect(props.requestCode).toHaveBeenCalledWith('priya@test.com');
    expect(await screen.findByText(/we've emailed it a 6-digit code/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Code'), '12a3-456');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    await fireEvent.press(screen.getByText('Set new password'));
    expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('New password'), 'BrandNew123!');
    await fireEvent.press(screen.getByText('Set new password'));
    expect(props.resetPassword).toHaveBeenCalledWith({ email: 'priya@test.com', code: '123456', password: 'BrandNew123!' });
    expect(props.signIn).toHaveBeenCalledWith('priya@test.com', 'BrandNew123!');
  });

  test("shows why the code didn't work, and goes back to sign in", async () => {
    const props = await setup({
      resetPassword: jest.fn().mockRejectedValue({ message: 'That code is wrong or has expired. Ask for a new one.' }),
    });
    await fireEvent.changeText(screen.getByLabelText('Email'), 'priya@test.com');
    await fireEvent.press(screen.getByText('Email me a code'));
    await fireEvent.changeText(screen.getByLabelText('Code'), '000000');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'BrandNew123!');
    await fireEvent.press(screen.getByText('Set new password'));
    expect(await screen.findByText('That code is wrong or has expired. Ask for a new one.')).toBeTruthy();
    expect(props.signIn).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Back to sign in'));
    expect(props.onBack).toHaveBeenCalled();
  });

  test('staff passwords need 12 characters', async () => {
    const props = await setup({ minPasswordLength: 12 });
    await fireEvent.changeText(screen.getByLabelText('Email'), 'admin@test.com');
    await fireEvent.press(screen.getByText('Email me a code'));
    await fireEvent.changeText(screen.getByLabelText('Code'), '123456');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'Only10chars');
    await fireEvent.press(screen.getByText('Set new password'));
    expect(screen.getByText('Password must be at least 12 characters')).toBeTruthy();
    expect(props.resetPassword).not.toHaveBeenCalled();
  });
});
