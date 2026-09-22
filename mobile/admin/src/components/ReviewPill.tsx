import { StyleSheet, Text, View } from 'react-native';
import { colors, type VerificationStatus } from '@mealdirect/shared';

const tones: Record<VerificationStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Waiting for review', bg: colors.warningSoft, fg: colors.warning },
  verified: { label: 'Live', bg: colors.successSoft, fg: colors.success },
  rejected: { label: 'Rejected', bg: colors.background, fg: colors.danger },
};

export function ReviewPill({ status }: { status: VerificationStatus }) {
  const tone = tones[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '700' },
});
