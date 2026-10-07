import { fireEvent, render, screen } from '@testing-library/react-native';
import { DeleteAccount } from '@mealdirect/shared';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('DeleteAccount', () => {
  test('asks for the password, then deletes and signs out', async () => {
    const deleteAccount = jest.fn().mockResolvedValue(undefined);
    const onDeleted = jest.fn();
    await render(<DeleteAccount deleteAccount={deleteAccount} onDeleted={onDeleted} />);

    await fireEvent.press(screen.getByText('Delete account'));
    await fireEvent.press(screen.getAllByText('Delete account').at(-1)!);
    expect(screen.getByText('Enter your password to confirm')).toBeTruthy();
    expect(deleteAccount).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'TestPass123!');
    await fireEvent.press(screen.getAllByText('Delete account').at(-1)!);
    expect(deleteAccount).toHaveBeenCalledWith('TestPass123!');
    expect(onDeleted).toHaveBeenCalled();
  });

  test('shows why the server refused, and stays signed in', async () => {
    const deleteAccount = jest.fn().mockRejectedValue(new Error('Wait until your orders are delivered or cancelled'));
    const onDeleted = jest.fn();
    await render(<DeleteAccount deleteAccount={deleteAccount} onDeleted={onDeleted} />);

    await fireEvent.press(screen.getByText('Delete account'));
    await fireEvent.changeText(screen.getByLabelText('Password'), 'TestPass123!');
    await fireEvent.press(screen.getAllByText('Delete account').at(-1)!);
    expect(await screen.findByText('Wait until your orders are delivered or cancelled')).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
