import { StyleSheet, Text, View } from 'react-native';
import { font, spacing, TextField } from '@mealdirect/shared';
import type { DishDraft, DishErrors } from '@/lib/dishForm';

// Name, price, description and limits: the same form in "My dishes" and on a menu
export function DishFields({
  draft,
  errors,
  onChange,
}: {
  draft: DishDraft;
  errors: DishErrors;
  onChange: (draft: DishDraft) => void;
}) {
  const set = (field: keyof DishDraft) => (value: string) => onChange({ ...draft, [field]: value });
  return (
    <>
      <TextField label="Name" value={draft.name} onChangeText={set('name')} error={errors.name} />
      <TextField
        label="Price (₹)"
        value={draft.price}
        onChangeText={set('price')}
        error={errors.price}
        keyboardType="decimal-pad"
        placeholder="120"
      />
      <TextField
        label="Description (optional)"
        value={draft.description}
        onChangeText={set('description')}
        placeholder="Rice, sambar, rasam, 2 curries"
        multiline
      />
      <Text style={[font.caption, styles.hint]}>
        Limits per customer, optional. Useful for dishes you make in small batches.
      </Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="Max per order"
            value={draft.maxPerOrder}
            onChangeText={set('maxPerOrder')}
            error={errors.maxPerOrder}
            keyboardType="number-pad"
            placeholder="No limit"
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Max per day"
            value={draft.maxPerDay}
            onChangeText={set('maxPerDay')}
            error={errors.maxPerDay}
            keyboardType="number-pad"
            placeholder="No limit"
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
