import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Banner,
  Button,
  Card,
  colors,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  formatINR,
  LoadingState,
  SheetForm,
  spacing,
  StatTile,
  TextField,
} from '@mealdirect/shared';
import { useAddSettlementMutation, useGetRiderCashQuery } from '@/store/serverApi';

type Kind = 'payment' | 'write_off';

export default function RiderCashScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, isLoading, isFetching, refetch } = useGetRiderCashQuery(id);
  const [addSettlement, { isLoading: saving }] = useAddSettlementMutation();
  const [kind, setKind] = useState<Kind | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  if (!data) return <ErrorState message={errorMessage(error, 'Rider not found')} onRetry={refetch} />;

  const { rider, cash, orders, settlements } = data;
  const name = [rider.firstName, rider.lastName].filter(Boolean).join(' ') || rider.email;

  const open = (k: Kind) => {
    setKind(k);
    setAmount(cash.balance ? String(cash.balance) : '');
    setNote('');
    setSheetError(null);
  };

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setSheetError('Enter an amount greater than zero');
    if (value > cash.balance) return setSheetError(`${name} owes ${formatINR(cash.balance)}; that’s the most you can record`);
    if (kind === 'write_off' && !note.trim()) return setSheetError('Say why this is written off');
    setSheetError(null);
    try {
      const after = await addSettlement({ riderId: rider.id, kind: kind!, amount: value, note: note.trim() || undefined }).unwrap();
      setDone(
        `${kind === 'payment' ? 'Recorded' : 'Wrote off'} ${formatINR(value)}. ${
          after.balance > 0 ? `${name} still owes ${formatINR(after.balance)}.` : `${name} is fully settled.`
        }`
      );
      setKind(null);
    } catch (e) {
      setSheetError(errorMessage(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.brand} />}
      >
        {done && <Banner tone="success" message={done} />}
        {cash.overdue > 0 && (
          <Banner tone="error" message={`${formatINR(cash.overdue)} is from before today, so ${name} can’t accept deliveries.`} />
        )}

        <View style={styles.tiles}>
          <StatTile label="Cash held" value={formatINR(cash.balance)} highlight={cash.overdue > 0} />
          <StatTile label="Settled so far" value={formatINR(cash.settled)} />
        </View>
        <Text style={[font.caption, styles.gapBottom]}>
          Today: {formatINR(cash.cashToday)} cash, {formatINR(cash.upiToday)} UPI (UPI goes straight to MealDirect).
          {rider.phone ? ` Phone ${rider.phone}.` : ''}
        </Text>

        <Button title="Record cash received" onPress={() => open('payment')} disabled={cash.balance <= 0} />
        <Button
          title="Write off an amount"
          variant="secondary"
          onPress={() => open('write_off')}
          disabled={cash.balance <= 0}
          style={styles.gap}
        />

        <Card title="Settlements" style={styles.section}>
          {settlements.length === 0 && <Text style={font.caption}>None yet.</Text>}
          {settlements.map((s) => (
            <View key={s.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={font.body}>{s.kind === 'payment' ? 'Cash received' : 'Written off'}</Text>
                <Text style={font.caption}>
                  {formatDateTime(s.createdAt)}
                  {s.recordedBy ? ` · by ${[s.recordedBy.firstName, s.recordedBy.lastName].filter(Boolean).join(' ')}` : ''}
                  {s.note ? ` · ${s.note}` : ''}
                </Text>
              </View>
              <Text style={font.body}>{formatINR(s.amount)}</Text>
            </View>
          ))}
        </Card>

        <Card title="Cash collected (latest 50)">
          {orders.length === 0 && <Text style={font.caption}>No cash collected yet.</Text>}
          {orders.map((o) => (
            <View key={o.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={font.body}>{o.restaurant?.name ?? 'Restaurant'}</Text>
                <Text style={font.caption}>{formatDateTime(o.collectedAt)}</Text>
              </View>
              <Text style={font.body}>{formatINR(o.total)}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>

      <SheetForm
        visible={kind !== null}
        title={kind === 'payment' ? 'Cash received from rider' : 'Write off an amount'}
        onClose={() => setKind(null)}
        onSubmit={submit}
        submitTitle={kind === 'payment' ? 'Record' : 'Write off'}
        submitting={saving}
        error={sheetError}
      >
        <Text style={[font.caption, styles.gapBottom]}>
          {name} owes {formatINR(cash.balance)}.{' '}
          {kind === 'write_off'
            ? 'Writing off reduces what they owe without money changing hands, e.g. change given to a customer.'
            : 'Record the amount they actually handed over; anything less stays owed.'}
        </Text>
        <TextField label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <TextField
          label={kind === 'write_off' ? 'Reason' : 'Note (optional)'}
          value={note}
          onChangeText={setNote}
          multiline
        />
      </SheetForm>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  tiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  gap: { marginTop: spacing.md },
  gapBottom: { marginBottom: spacing.md },
  section: { marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  flex: { flex: 1 },
});
