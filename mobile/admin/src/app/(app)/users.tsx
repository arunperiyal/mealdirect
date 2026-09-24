import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Banner,
  Chip,
  colors,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatDateTime,
  LoadingState,
  radius,
  SheetForm,
  spacing,
  TextField,
  useDebounced,
  validateEmail,
  type AdminUser,
  type ManagedRole,
} from '@mealdirect/shared';
import { useChangeUserEmailMutation, useGetUsersQuery } from '@/store/serverApi';

const ROLES: { role: ManagedRole | undefined; label: string }[] = [
  { role: undefined, label: 'All' },
  { role: 'customer', label: 'Customers' },
  { role: 'restaurant_admin', label: 'Partners' },
  { role: 'delivery_partner', label: 'Riders' },
];

const ROLE_LABELS: Record<ManagedRole, string> = {
  customer: 'Customer',
  restaurant_admin: 'Restaurant partner',
  delivery_partner: 'Rider',
};

const fullName = (u: Pick<AdminUser, 'firstName' | 'lastName'>) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || 'No name';

export default function UsersScreen() {
  const [role, setRole] = useState<ManagedRole | undefined>(undefined);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const { data, error, isLoading, isFetching, refetch } = useGetUsersQuery({ role, search: debounced || undefined });
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <View style={styles.flex}>
      <View style={styles.controls}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {ROLES.map((r) => (
            <Chip key={r.label} label={r.label} selected={role === r.role} onPress={() => setRole(r.role)} />
          ))}
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or phone"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search users"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={styles.search}
        />
        {done && <Banner tone="success" message={done} />}
      </View>

      {isLoading ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          style={isFetching ? styles.dimmed : undefined}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState title={debounced ? 'No matches' : 'No users yet'} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Change email for ${fullName(item)}`}
              onPress={() => {
                setDone(null);
                setEditing(item);
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
            >
              <Text style={font.heading} numberOfLines={1}>
                {fullName(item)}
              </Text>
              <Text style={font.body} numberOfLines={1}>
                {item.email}
              </Text>
              <Text style={font.caption}>
                {[ROLE_LABELS[item.role], item.phone, `joined ${formatDateTime(item.createdAt)}`].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          )}
        />
      )}

      {editing && (
        <EmailSheet
          user={editing}
          onClose={() => setEditing(null)}
          onChanged={(user) => {
            setEditing(null);
            setDone(`${fullName(user)} now signs in with ${user.email}.`);
          }}
        />
      )}
    </View>
  );
}

function EmailSheet({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  onClose: () => void;
  onChanged: (user: AdminUser) => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [change, { isLoading }] = useChangeUserEmailMutation();

  const submit = async () => {
    const problem = validateEmail(email);
    setFieldError(problem);
    if (problem) return;
    setError(null);
    try {
      onChanged(await change({ id: user.id, email: email.trim() }).unwrap());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <SheetForm
      visible
      title={`Change email for ${fullName(user)}`}
      onClose={onClose}
      onSubmit={submit}
      submitTitle="Change email"
      submitting={isLoading}
      error={error}
    >
      <Text style={[font.caption, styles.hint]}>
        They sign in with the new email from now on. Their password stays the same, and they stay signed in on
        their phone. Make sure the request really comes from them.
      </Text>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldError}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
    </SheetForm>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  search: {
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  list: { padding: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  dimmed: { opacity: 0.6 },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: 4 },
  hint: { marginBottom: spacing.md },
});
