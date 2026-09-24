import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Chip,
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
  type Dish,
} from '@mealdirect/shared';
import { DishFields } from '@/components/DishFields';
import { checkDishDraft, dishDraft, dishSummary, emptyDishDraft, type DishErrors } from '@/lib/dishForm';
import { useRestaurant } from '@/lib/useRestaurant';
import {
  useCreateDishMutation,
  useGetDishesQuery,
  useImportDishesMutation,
  useRemoveDishMutation,
  useRestoreDishMutation,
  useUpdateDishMutation,
} from '@/store/serverApi';

// The restaurant's own dish list: add a dish once, then pick it when building each day's menu
export default function DishesScreen() {
  const restaurant = useRestaurant();
  const [showRemoved, setShowRemoved] = useState(false);
  const { data, error, isLoading, isFetching, refetch } = useGetDishesQuery({
    restaurantId: restaurant.id,
    archived: showRemoved,
  });
  const [importDishes, { isLoading: importing }] = useImportDishesMutation();
  const [editing, setEditing] = useState<Dish | 'new' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const runImport = async () => {
    try {
      const { imported } = await importDishes(restaurant.id).unwrap();
      setNotice({
        tone: 'success',
        message: imported
          ? `Added ${imported} ${imported === 1 ? 'dish' : 'dishes'} from your menus.`
          : 'Every dish on your menus is already here.',
      });
    } catch (e) {
      setNotice({ tone: 'error', message: errorMessage(e) });
    }
  };

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <View style={styles.flex}>
      <FlatList
        data={data ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={font.caption}>
              Add a dish once, then pick it when you build each day’s menu. Changing a dish here applies to menus you
              make afterwards; menus already made keep their own copy.
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              <Chip label="My dishes" selected={!showRemoved} onPress={() => setShowRemoved(false)} />
              <Chip label="Removed" selected={showRemoved} onPress={() => setShowRemoved(true)} />
            </View>
            {notice && <Banner tone={notice.tone} message={notice.message} />}
          </View>
        }
        ListEmptyComponent={
          showRemoved ? (
            <EmptyState title="No removed dishes" />
          ) : (
            <View style={styles.empty}>
              <EmptyState title="No dishes yet" message="Add your dishes here, or copy them from menus you’ve made." />
              <Button title="Add dishes from my menus" variant="secondary" onPress={runImport} loading={importing} />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            onPress={() => {
              setNotice(null);
              setEditing(item);
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <Text style={font.heading}>{item.name}</Text>
            <Text style={font.caption}>{dishSummary(item)}</Text>
            {item.description ? (
              <Text style={font.caption} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      {!showRemoved && (
        <View style={styles.footer}>
          <Button
            title="Add dish"
            onPress={() => {
              setNotice(null);
              setEditing('new');
            }}
          />
        </View>
      )}
      {editing && (
        <DishSheet
          restaurantId={restaurant.id}
          dish={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            setNotice({ tone: 'success', message });
          }}
        />
      )}
    </View>
  );
}

function DishSheet({
  restaurantId,
  dish,
  onClose,
  onDone,
}: {
  restaurantId: string;
  dish: Dish | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [form, setForm] = useState(() => (dish ? dishDraft(dish) : emptyDishDraft));
  const [errors, setErrors] = useState<DishErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [createDish, creating] = useCreateDishMutation();
  const [updateDish, updating] = useUpdateDishMutation();
  const [removeDish] = useRemoveDishMutation();
  const [restoreDish, restoring] = useRestoreDishMutation();

  const submit = async () => {
    const { errors: next, values } = checkDishDraft(form);
    setErrors(next);
    if (!values) return;
    setError(null);
    try {
      if (dish) await updateDish({ id: dish.id, ...values }).unwrap();
      else await createDish({ restaurantId, ...values }).unwrap();
      onDone(dish ? `Saved ${values.name}.` : `Added ${values.name}.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = () =>
    confirmAction({
      title: `Remove ${dish!.name}?`,
      message: 'It won’t be offered for new menus. Menus that already have it keep it, and you can bring it back later.',
      confirmText: 'Remove',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeDish(dish!.id).unwrap();
          onDone(`Removed ${dish!.name}.`);
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    });

  const restore = async () => {
    try {
      await restoreDish(dish!.id).unwrap();
      onDone(`${dish!.name} is back in My dishes.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (dish?.archived) {
    return (
      <SheetForm
        visible
        title={dish.name}
        onClose={onClose}
        onSubmit={restore}
        submitTitle="Bring back"
        submitting={restoring.isLoading}
        error={error}
      >
        <Text style={font.body}>{dishSummary(dish)}</Text>
        <Text style={[font.caption, styles.gap]}>Removed dishes aren’t offered when you build a menu.</Text>
      </SheetForm>
    );
  }

  return (
    <SheetForm
      visible
      title={dish ? 'Edit dish' : 'Add dish'}
      onClose={onClose}
      onSubmit={submit}
      submitTitle={dish ? 'Save dish' : 'Add dish'}
      submitting={creating.isLoading || updating.isLoading}
      error={error}
      destructiveTitle={dish ? 'Remove dish' : undefined}
      onDestructive={dish ? remove : undefined}
    >
      <DishFields draft={form} errors={errors} onChange={setForm} />
    </SheetForm>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: 100, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm },
  empty: { gap: spacing.md },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, gap: 4 },
  footer: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  gap: { marginTop: spacing.sm },
});
