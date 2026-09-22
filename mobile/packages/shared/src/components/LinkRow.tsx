import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';

export function LinkRow({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
    >
      <View style={styles.text}>
        <Text style={font.body}>{title}</Text>
        {detail ? (
          <Text style={font.caption} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  text: { flex: 1, gap: 2 },
  chevron: { fontSize: 24, color: colors.textMuted, paddingLeft: spacing.sm },
});
