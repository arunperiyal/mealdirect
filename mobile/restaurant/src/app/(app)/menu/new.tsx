import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { addDays, Chip, errorMessage, font, localDateString, spacing, TextField } from '@mealdirect/shared';
import { FormScreen } from '@/components/FormScreen';
import { dayLabel, isBefore, isValidTime } from '@/lib/time';
import { useRestaurant } from '@/lib/useRestaurant';
import { useCreateMenuMutation, useGetMenusQuery } from '@/store/serverApi';

const DAYS_AHEAD = 7;

export default function NewMenuScreen() {
  const restaurant = useRestaurant();
  const params = useLocalSearchParams<{ date?: string }>();
  const dates = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => localDateString(addDays(new Date(), i))),
    []
  );

  // One menu per day: dates that already have one can't be picked
  const { data: existing = [] } = useGetMenusQuery({
    restaurantId: restaurant.id,
    from: dates[0],
    to: dates[dates.length - 1],
  });
  const taken = new Set(existing.map((m) => m.date));
  const firstFree = dates.find((d) => !taken.has(d)) ?? dates[0];

  const [date, setDate] = useState(params.date && dates.includes(params.date) ? params.date : null);
  const chosen = date ?? firstFree;
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [errors, setErrors] = useState<{ start?: string | null; end?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createMenu, { isLoading }] = useCreateMenuMutation();

  const onSubmit = async () => {
    const next = {
      start: start && !isValidTime(start) ? 'Use 24-hour time, like 08:00' : null,
      end:
        end && !isValidTime(end)
          ? 'Use 24-hour time, like 21:30'
          : start && end && !isBefore(start, end)
            ? 'Must be after the start time'
            : null,
    };
    if (!next.end && Boolean(start) !== Boolean(end)) next.end = 'Set both times, or leave both empty';
    setErrors(next);
    if (next.start || next.end) return;
    if (taken.has(chosen)) {
      setFormError(`${dayLabel(chosen)} already has a menu.`);
      return;
    }

    setFormError(null);
    try {
      const menu = await createMenu({
        restaurantId: restaurant.id,
        date: chosen,
        ...(start && end ? { orderingStartTime: start.trim(), orderingEndTime: end.trim() } : {}),
      }).unwrap();
      router.replace({ pathname: '/menu/[id]', params: { id: menu.id } });
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Create menu" onSubmit={onSubmit} submitting={isLoading} error={formError}>
      <Text style={[font.heading, styles.label]}>Which day?</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {dates.map((d) => (
          <Chip
            key={d}
            label={taken.has(d) ? `${dayLabel(d)} ✓` : dayLabel(d)}
            selected={chosen === d}
            disabled={taken.has(d)}
            onPress={() => setDate(d)}
          />
        ))}
      </View>

      <Text style={[font.heading, styles.label]}>Ordering window (optional)</Text>
      <Text style={[font.caption, styles.hint]}>When customers can place orders for this menu. 24-hour time.</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <TextField
            label="Opens"
            value={start}
            onChangeText={setStart}
            error={errors.start}
            placeholder="08:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Closes"
            value={end}
            onChangeText={setEnd}
            error={errors.end}
            placeholder="11:30"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
      </View>
      <Text style={font.caption}>You’ll add dishes next. Customers see the menu once you publish it.</Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  hint: { marginTop: -spacing.xs, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
