import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import {
  Banner,
  Button,
  colors,
  font,
  formatINR,
  radius,
  SHEET_MAX_WIDTH,
  spacing,
  TextField,
  upiPayUrl,
  type Collection,
} from '@mealdirect/shared';

type Step = 'choose' | 'upi' | 'not_paid';

interface Props {
  visible: boolean;
  amount: number;
  reference: string; // short order number shown in the customer's UPI app
  // The restaurant's UPI ID; null when it hasn't added one
  upi: { id: string; name: string } | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (collection: Collection, note?: string) => void;
}

// How the customer paid at the door: cash, UPI to the restaurant (QR), or not at all
export function PaymentSheet({ visible, amount, reference, upi, submitting, error, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('choose');
  const [note, setNote] = useState('');

  const close = () => {
    setStep('choose');
    setNote('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.header}>
            <Text style={font.heading}>
              {step === 'upi' ? 'Pay by UPI' : step === 'not_paid' ? 'Customer didn’t pay' : `Collect ${formatINR(amount)}`}
            </Text>
            <Pressable onPress={step === 'choose' ? close : () => setStep('choose')} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>{step === 'choose' ? 'Cancel' : 'Back'}</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {error && <Banner tone="error" message={error} />}

            {step === 'choose' && (
              <View style={styles.gap}>
                <Text style={font.caption}>How did the customer pay?</Text>
                <Button title={`Cash received · ${formatINR(amount)}`} onPress={() => onSubmit('cash')} loading={submitting} />
                <Button
                  title="Customer pays by UPI"
                  variant="secondary"
                  onPress={() => setStep('upi')}
                  disabled={!upi || submitting}
                />
                {!upi && (
                  <Text style={font.caption}>This restaurant hasn’t added a UPI ID yet, so collect cash.</Text>
                )}
                <Button title="Not paid" variant="danger" onPress={() => setStep('not_paid')} disabled={submitting} />
              </View>
            )}

            {step === 'upi' && upi && (
              <View style={[styles.gap, styles.center]}>
                <Text style={styles.amount}>{formatINR(amount)}</Text>
                <View style={styles.qr} accessibilityLabel={`UPI QR code to pay ${formatINR(amount)} to ${upi.name}`}>
                  <QRCode value={upiPayUrl(upi, amount, reference)} size={220} />
                </View>
                <Text style={[font.body, styles.centerText]}>
                  Ask the customer to scan this with any UPI app and pay {upi.name}.
                </Text>
                <Text style={[font.caption, styles.centerText]}>{upi.id}</Text>
                <Text style={[font.caption, styles.centerText]}>
                  Check their screen shows the payment succeeded before you tap below.
                </Text>
                <Button title="Customer has paid" onPress={() => onSubmit('upi')} loading={submitting} style={styles.full} />
              </View>
            )}

            {step === 'not_paid' && (
              <View style={styles.gap}>
                <Text style={font.body}>
                  The order is marked delivered but unpaid. The customer can’t order again until MealDirect sorts it out.
                </Text>
                <TextField
                  label="What happened? (optional)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Customer said they'd pay later"
                  multiline
                />
                <Button
                  title="Mark as not paid"
                  variant="danger"
                  onPress={() => onSubmit('not_paid', note.trim() || undefined)}
                  loading={submitting}
                />
              </View>
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
    maxHeight: '90%',
    // Wide browser windows: keep the sheet the width of the app's column
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  link: { color: colors.brand, fontSize: 16, fontWeight: '600' },
  gap: { gap: spacing.md },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  amount: { fontSize: 32, fontWeight: '800', color: colors.text },
  // White quiet zone around the code so phones scan it reliably
  qr: { padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  full: { alignSelf: 'stretch' },
});
