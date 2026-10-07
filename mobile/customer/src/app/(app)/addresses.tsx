import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  colors,
  confirmAction,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  LoadingState,
  radius,
  SheetForm,
  spacing,
  TextField,
  useBottomSpace,
  type SavedAddress,
} from '@mealdirect/shared';
import {
  useAddAddressMutation,
  useDeleteAddressMutation,
  useGetAddressesQuery,
  useUpdateAddressMutation,
} from '@/store/serverApi';

const MAX_ADDRESSES = 10;

// Addresses to pick at checkout instead of typing them again
export default function AddressesScreen() {
  const bottomSpace = useBottomSpace(spacing.lg);
  const { data = [], error, isLoading, isFetching, refetch } = useGetAddressesQuery();
  // null: closed; 'new': adding one
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);

  if (isLoading) return <LoadingState />;
  if (error && !data.length) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={data}
        keyExtractor={(a) => a.id}
        contentContainerStyle={[styles.list, { paddingBottom: bottomSpace }]}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />}
        ListEmptyComponent={<EmptyState title="No saved addresses" message="Save one here or when you check out." />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.label}`}
            onPress={() => setEditing(item)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <Text style={font.heading}>{item.label}</Text>
            <Text style={font.body}>{item.address}</Text>
          </Pressable>
        )}
        ListFooterComponent={
          data.length < MAX_ADDRESSES ? (
            <Button title="Add an address" variant="secondary" onPress={() => setEditing('new')} />
          ) : (
            <Text style={font.caption}>You can save up to {MAX_ADDRESSES} addresses.</Text>
          )
        }
      />
      {editing && <AddressSheet saved={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

function AddressSheet({ saved, onClose }: { saved: SavedAddress | null; onClose: () => void }) {
  const [label, setLabel] = useState(saved?.label ?? '');
  const [address, setAddress] = useState(saved?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [add, adding] = useAddAddressMutation();
  const [update, updating] = useUpdateAddressMutation();
  const [remove] = useDeleteAddressMutation();

  const submit = async () => {
    if (!label.trim()) return setError('Name it, e.g. Home');
    if (address.trim().length < 5) return setError('Enter the full address');
    setError(null);
    try {
      const data = { label: label.trim(), address: address.trim() };
      await (saved ? update({ id: saved.id, ...data }) : add(data)).unwrap();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const confirmDelete = () =>
    confirmAction({
      title: `Remove ${saved!.label}?`,
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        try {
          await remove(saved!.id).unwrap();
          onClose();
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });

  return (
    <SheetForm
      visible
      title={saved ? 'Edit address' : 'New address'}
      onClose={onClose}
      onSubmit={submit}
      submitTitle="Save"
      submitting={adding.isLoading || updating.isLoading}
      error={error}
      destructiveTitle={saved ? 'Remove' : undefined}
      onDestructive={saved ? confirmDelete : undefined}
    >
      <TextField label="Name" value={label} onChangeText={setLabel} placeholder="Home, Work…" maxLength={40} />
      <TextField
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Flat, building, street, landmark"
        multiline
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        style={styles.multiline}
      />
    </SheetForm>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: 4 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
