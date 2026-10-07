import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  Banner,
  Button,
  colors,
  confirmAction,
  EmptyState,
  errorMessage,
  ErrorState,
  font,
  formatTime,
  LoadingState,
  radius,
  SheetForm,
  spacing,
  TextField,
  useDebounced,
  type AutoAcceptRule,
  type Restaurant,
} from '@mealdirect/shared';
import {
  useAddRuleMutation,
  useDeleteRuleMutation,
  useGetRulesQuery,
  useSearchRestaurantsQuery,
  useUpdateRuleMutation,
} from '@/store/serverApi';
import { normalizeTime, validateWindow } from '@/lib/autoAccept';

const MAX_RULES = 10;
const windowLabel = (r: Pick<AutoAcceptRule, 'startTime' | 'endTime'>) => `${formatTime(r.startTime)} – ${formatTime(r.endTime)}`;

// Standing orders: a restaurant's deliveries due in a time window come to this rider
export default function AutoAcceptScreen() {
  const { data = [], error, isLoading, isFetching, refetch } = useGetRulesQuery();
  const [adding, setAdding] = useState(false);
  const [update] = useUpdateRuleMutation();
  const [remove] = useDeleteRuleMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  if (error && !data.length) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const run = async (action: Promise<unknown>) => {
    setActionError(null);
    try {
      await action;
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={data}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={font.body}>
              Take a restaurant&apos;s deliveries due at the times you choose, without accepting each one. They come to
              you as soon as the restaurant accepts them, and show under Deliveries.
            </Text>
            <Text style={font.caption}>
              You still get at most 3 deliveries at a time, and none while you hold cash from an earlier day. If two
              riders cover the same order, the one with fewer deliveries gets it. An order you give back won&apos;t come
              back to you.
            </Text>
            {actionError && <Banner tone="error" message={actionError} />}
          </View>
        }
        ListEmptyComponent={<EmptyState title="No auto-accept rules" message="Add one for a restaurant you deliver for often." />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={font.heading}>{item.restaurant?.name ?? 'Restaurant'}</Text>
              <Text style={font.body}>Deliveries due {windowLabel(item)}</Text>
              {!item.enabled && <Text style={font.caption}>Paused</Text>}
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  confirmAction({
                    title: 'Remove this rule?',
                    message: `${item.restaurant?.name ?? 'Restaurant'}, ${windowLabel(item)}. Deliveries you already have stay yours.`,
                    confirmText: 'Remove',
                    destructive: true,
                    onConfirm: () => run(remove(item.id).unwrap()),
                  })
                }
              >
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
            <Switch
              value={item.enabled}
              onValueChange={(enabled) => run(update({ id: item.id, enabled }).unwrap())}
              accessibilityLabel={`Auto-accept ${item.restaurant?.name ?? ''} ${windowLabel(item)}`}
              trackColor={{ true: colors.success, false: colors.border }}
            />
          </View>
        )}
        ListFooterComponent={
          data.length < MAX_RULES ? (
            <Button title="Add a rule" onPress={() => setAdding(true)} />
          ) : (
            <Text style={font.caption}>You can have up to {MAX_RULES} rules.</Text>
          )
        }
      />
      {adding && <RuleSheet onClose={() => setAdding(false)} />}
    </View>
  );
}

function RuleSheet({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const { data: restaurants = [], isFetching } = useSearchRestaurantsQuery(debounced);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('14:00');
  const [error, setError] = useState<string | null>(null);
  const [add, { isLoading }] = useAddRuleMutation();

  const submit = async () => {
    if (!restaurant) return setError('Choose a restaurant');
    const startTime = normalizeTime(start);
    const endTime = normalizeTime(end);
    const problem = validateWindow(startTime, endTime);
    if (problem) return setError(problem);
    setError(null);
    try {
      await add({ restaurantId: restaurant.id, startTime, endTime }).unwrap();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <SheetForm visible title="New auto-accept rule" onClose={onClose} onSubmit={submit} submitTitle="Save rule" submitting={isLoading} error={error}>
      <Text style={styles.label}>Restaurant</Text>
      {restaurant ? (
        <Pressable accessibilityRole="button" onPress={() => setRestaurant(null)} style={[styles.choice, styles.choiceSelected]}>
          <Text style={font.heading}>{restaurant.name}</Text>
          <Text style={font.caption}>{restaurant.city ? `${restaurant.city} · ` : ''}Tap to change</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search restaurants"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search restaurants"
            autoCorrect={false}
            style={styles.search}
          />
          {restaurants.slice(0, 6).map((r) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => setRestaurant(r)} style={styles.choice}>
              <Text style={font.body}>{r.name}</Text>
              {r.city ? <Text style={font.caption}>{r.city}</Text> : null}
            </Pressable>
          ))}
          {!isFetching && restaurants.length === 0 && <Text style={[font.caption, styles.gap]}>No restaurants that deliver match.</Text>}
        </>
      )}
      <Text style={[styles.label, styles.gap]}>Deliveries due between</Text>
      <View style={styles.times}>
        <TextField label="From" value={start} onChangeText={setStart} placeholder="12:00" style={styles.time} autoCorrect={false} />
        <TextField label="Until" value={end} onChangeText={setEnd} placeholder="14:00" style={styles.time} autoCorrect={false} />
      </View>
      <Text style={[font.caption, styles.gap]}>
        24-hour times, every day. An order due at the &quot;until&quot; time isn&apos;t included. For a window past midnight, add two rules.
      </Text>
    </SheetForm>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  intro: { gap: spacing.sm, marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  remove: { color: colors.danger, fontWeight: '500', marginTop: spacing.sm },
  label: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: spacing.sm },
  gap: { marginTop: spacing.sm },
  search: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  choice: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm },
  choiceSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  times: { flexDirection: 'row', gap: spacing.md },
  time: { minWidth: 110 },
});
