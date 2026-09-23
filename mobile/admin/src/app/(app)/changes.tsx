import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  LoadingState,
  maskAccount,
  SheetForm,
  spacing,
  TextField,
  type AdminChangeRequest,
} from '@mealdirect/shared';
import { useGetChangeRequestsQuery, useReviewChangeMutation } from '@/store/serverApi';

const LABELS: Record<string, string> = {
  upiId: 'UPI ID',
  bankAccountName: 'Account holder',
  bankAccountNumber: 'Account number',
  bankIFSC: 'IFSC',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
};

const KIND = { payout: 'Payout details', personal: 'Personal details' } as const;

// Account numbers show only their last digits, as elsewhere in the admin app
const shown = (field: string, value: string | null | undefined) =>
  (field === 'bankAccountNumber' ? maskAccount(value) : value) || '—';

export default function ChangesScreen() {
  const { data, error, isLoading, isFetching, refetch } = useGetChangeRequestsQuery();
  const [review, { isLoading: saving }] = useReviewChangeMutation();
  const [rejecting, setRejecting] = useState<AdminChangeRequest | null>(null);
  const [note, setNote] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const approve = async (r: AdminChangeRequest) => {
    try {
      await review({ id: r.id, decision: 'approve' }).unwrap();
      setDone({ tone: 'success', message: r.subject ? `Approved. The new details for ${r.subject.name} are in use.` : 'Approved.' });
    } catch (e) {
      setDone({ tone: 'error', message: errorMessage(e) });
    }
  };

  const reject = async () => {
    if (!note.trim()) {
      setSheetError('Say what’s wrong. They see this note.');
      return;
    }
    setSheetError(null);
    try {
      await review({ id: rejecting!.id, decision: 'reject', note: note.trim() }).unwrap();
      setDone({ tone: 'success', message: 'Rejected. Their current details stay in use, and they see your note.' });
      setRejecting(null);
    } catch (e) {
      setSheetError(errorMessage(e));
    }
  };

  return (
    <>
      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />}
        ListHeaderComponent={
          <>
            {done && <Banner tone={done.tone} message={done.message} />}
            <Text style={[font.caption, styles.intro]}>
              Changes from approved restaurants and riders. Their current details stay in use until you approve.
              Check a new bank account or UPI ID belongs to them before approving.
            </Text>
          </>
        }
        ListEmptyComponent={<EmptyState title="Nothing to review" message="Changes show up here when they’re sent." />}
        renderItem={({ item }) => (
          <ChangeCard
            request={item}
            busy={saving}
            onApprove={() => approve(item)}
            onReject={() => {
              setNote('');
              setSheetError(null);
              setRejecting(item);
            }}
          />
        )}
      />
      <SheetForm
        visible={rejecting !== null}
        title="Reject this change?"
        onClose={() => setRejecting(null)}
        onSubmit={reject}
        submitTitle="Reject"
        submitting={saving}
        error={sheetError}
      >
        <TextField
          label="What should they fix?"
          value={note}
          onChangeText={setNote}
          placeholder="The account name doesn’t match the restaurant"
          multiline
        />
      </SheetForm>
    </>
  );
}

function ChangeCard({
  request,
  busy,
  onApprove,
  onReject,
}: {
  request: AdminChangeRequest;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const who = request.subjectType === 'restaurant' ? 'Restaurant' : 'Rider';
  return (
    <Card title={`${request.subject?.name ?? 'Deleted'} · ${KIND[request.kind]}`}>
      <Text style={font.caption}>
        {who}
        {request.subject?.phone ? ` · ${request.subject.phone}` : ''} · sent {formatDateTime(request.updatedAt)}
      </Text>
      <View style={styles.rows}>
        {Object.entries(request.changes).map(([field, value]) => (
          <View
            key={field}
            style={styles.row}
            accessible
            accessibilityLabel={`${LABELS[field] ?? field}: from ${shown(field, request.current?.[field])} to ${shown(field, value)}`}
          >
            <Text style={font.caption}>{LABELS[field] ?? field}</Text>
            <Text style={[font.body, styles.old]}>{shown(field, request.current?.[field])}</Text>
            <Text style={font.heading}>{shown(field, value)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button title="Approve" onPress={onApprove} disabled={busy} style={styles.flex} />
        <Button title="Reject" variant="danger" onPress={onReject} disabled={busy} style={styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  intro: { marginBottom: spacing.md },
  rows: { gap: spacing.md, marginTop: spacing.md },
  row: { gap: 2 },
  // The value being replaced
  old: { color: colors.textMuted, textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  flex: { flex: 1 },
});
