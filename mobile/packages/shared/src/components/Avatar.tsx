import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  name: string;
  // avatarUrl from the API (relative to it), or null
  url: string | null | undefined;
  // The API's address, which avatarUrl is relative to
  baseUrl: string;
  size?: number;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

// A profile picture, or the person's initials without one (or if it fails to load)
export function Avatar({ name, url, baseUrl, size = 40 }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const box = { width: size, height: size, borderRadius: size / 2 };
  const showImage = url && failed !== url;

  return (
    <View style={[styles.circle, box]} accessibilityLabel={`${name}'s profile picture`}>
      {showImage ? (
        <Image source={{ uri: `${baseUrl}${url}` }} style={box} onError={() => setFailed(url)} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initialsOf(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: colors.brand, fontWeight: '700' },
});
