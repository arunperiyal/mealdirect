import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, colors, font, radius, spacing } from '@mealdirect/shared';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitTitle: string;
  submitting?: boolean;
  error?: string | null;
  children: ReactNode;
  destructiveTitle?: string;
  onDestructive?: () => void;
}

// Bottom sheet with a small form, used for menu items and delivery slots
export function SheetForm({
  visible,
  title,
  onClose,
  onSubmit,
  submitTitle,
  submitting,
  error,
  children,
  destructiveTitle,
  onDestructive,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.header}>
            <Text style={font.heading}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {error && <Banner tone="error" message={error} />}
            {children}
            <Button title={submitTitle} onPress={onSubmit} loading={submitting} style={styles.submit} />
            {destructiveTitle && onDestructive && (
              <Button title={destructiveTitle} variant="danger" onPress={onDestructive} style={styles.submit} />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  close: { color: colors.brand, fontSize: 16, fontWeight: '600' },
  submit: { marginTop: spacing.sm },
});
