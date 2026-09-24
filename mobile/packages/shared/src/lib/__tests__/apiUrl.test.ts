// Where the apps find the backend
const load = (os: string, extra: { location?: object; hostUri?: string } = {}) => {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: extra.hostUri ? { hostUri: extra.hostUri } : null } }));
  (globalThis as { location?: object }).location = extra.location;
  return require('../apiUrl').resolveApiUrl as (env?: string) => string;
};

describe('resolveApiUrl', () => {
  afterEach(() => {
    delete (globalThis as { location?: object }).location;
    jest.dontMock('react-native');
    jest.dontMock('expo-constants');
    jest.resetModules();
  });

  test('EXPO_PUBLIC_API_URL wins, without a trailing slash', () => {
    const resolve = load('android', { hostUri: '10.0.0.5:8081' });
    expect(resolve('https://api.mealdirect.in/')).toBe('https://api.mealdirect.in');
  });

  test('in a browser, the backend is on the page’s host', () => {
    const resolve = load('web', { location: { protocol: 'http:', hostname: '10.145.241.195' } });
    expect(resolve(undefined)).toBe('http://10.145.241.195:3000');
  });

  test('in Expo Go, the backend is on the Expo dev server’s host', () => {
    expect(load('android', { hostUri: '192.168.1.20:8082' })(undefined)).toBe('http://192.168.1.20:3000');
    expect(load('ios', { hostUri: 'localhost:8081' })(undefined)).toBe('http://localhost:3000');
  });

  test('otherwise the emulator or simulator address of the host machine', () => {
    expect(load('android')(undefined)).toBe('http://10.0.2.2:3000');
    expect(load('ios')(undefined)).toBe('http://localhost:3000');
  });
});
