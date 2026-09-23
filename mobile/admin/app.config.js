// Build settings that depend on the EAS build profile. app.json stays the base.
module.exports = ({ config }) => {
  // Store builds must talk to the deployed HTTPS API, never a laptop on the LAN
  if (process.env.EAS_BUILD_PROFILE === 'production' && !process.env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
    throw new Error('Production builds need EXPO_PUBLIC_API_URL set to the https:// address of the deployed API');
  }

  // Test builds may use a plain-HTTP dev server; Android blocks cleartext by default
  const allowHttp = process.env.ALLOW_HTTP_API === 'true';

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(allowHttp ? [['expo-build-properties', { android: { usesCleartextTraffic: true } }]] : []),
    ],
  };
};
