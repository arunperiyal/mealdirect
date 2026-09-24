// Behaviour that differs in the browser: confirmations and where the session is kept
const asWeb = () => {
  jest.resetModules();
  // Only what confirm.ts and tokens.ts use
  jest.doMock('react-native', () => ({ Platform: { OS: 'web' }, Alert: { alert: jest.fn() } }));
  // A browser build gets expo-secure-store's empty web module; nothing may call it
  jest.doMock('expo-secure-store', () => ({}));
};

describe('in the browser', () => {
  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('expo-secure-store');
    jest.resetModules();
  });

  test('confirmAction uses the browser dialog and runs the action only when accepted', () => {
    asWeb();
    const { confirmAction } = require('../confirm');
    const onConfirm = jest.fn();
    const dialog = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (globalThis as { confirm?: unknown }).confirm = dialog;

    confirmAction({ title: 'Sign out?', message: 'Your cart will be cleared.', confirmText: 'Sign out', onConfirm });
    expect(dialog).toHaveBeenCalledWith('Sign out?\n\nYour cart will be cleared.');
    expect(onConfirm).not.toHaveBeenCalled();

    confirmAction({ title: 'Sign out?', confirmText: 'Sign out', onConfirm });
    expect(dialog).toHaveBeenLastCalledWith('Sign out?');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('the session lives in localStorage and signing out clears it', async () => {
    asWeb();
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const session = require('../../api/tokens');
    await session.saveTokens({ accessToken: 'a1', refreshToken: 'r1' });
    await session.saveUser({ id: 'u1' });
    expect(await session.getAccessToken()).toBe('a1');
    expect(await session.getUser()).toEqual({ id: 'u1' });

    await session.clearSession();
    expect(store.size).toBe(0);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe('on phones', () => {
  test('confirmAction shows a native alert with cancel and the action', () => {
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { confirmAction } = require('../confirm');
    const onConfirm = jest.fn();
    confirmAction({ title: 'Remove dish?', confirmText: 'Remove', cancelText: 'Keep', destructive: true, onConfirm });
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe('Remove dish?');
    expect(buttons).toEqual([
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onConfirm },
    ]);
    alert.mockRestore();
  });
});
