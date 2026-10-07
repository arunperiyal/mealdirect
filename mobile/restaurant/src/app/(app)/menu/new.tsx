import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { addDays, Chip, errorMessage, font, FormScreen, localDateString, spacing, TextField } from '@mealdirect/shared';
import { closesAfterOpens, dayLabel, dayPhrase, isValidTime, shiftDate, type OrderingDay } from '@/lib/time';
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
  // Each time is on the menu's day or the day before, so ordering can run overnight
  const [opensDay, setOpensDay] = useState<OrderingDay>(0);
  const [closesDay, setClosesDay] = useState<OrderingDay>(0);
  const [errors, setErrors] = useState<{ start?: string | null; end?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createMenu, { isLoading }] = useCreateMenuMutation();

  const onSubmit = async () => {
    const next = {
      start: start && !isValidTime(start) ? 'Use 24-hour time, like 08:00' : null,
      end:
        end && !isValidTime(end)
          ? 'Use 24-hour time, like 21:30'
          : start && end && isValidTime(start) && !closesAfterOpens(start.trim(), opensDay, end.trim(), closesDay)
            ? 'Must be after it opens. For overnight ordering, open it the day before.'
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
        ...(start && end
          ? {
              orderingStartTime: start.trim(),
              orderingOpensDay: opensDay,
              orderingEndTime: end.trim(),
              orderingClosesDay: closesDay,
            }
          : {}),
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

      <Text style={[font.heading, styles.label]}>When can customers order? (optional)</Text>
      <Text style={[font.caption, styles.hint]}>
        24-hour times. Ordering can run overnight: open it the day before, e.g. from 20:00 the day before until
        06:00. Leave both empty to take orders any time before the day ends.
      </Text>
      <WindowEnd
        label="Opens"
        placeholder="20:00"
        value={start}
        onChangeText={setStart}
        error={errors.start}
        day={opensDay}
        onDay={setOpensDay}
        menuDate={chosen}
      />
      <WindowEnd
        label="Closes"
        placeholder="11:30"
        value={end}
        onChangeText={setEnd}
        error={errors.end}
        day={closesDay}
        onDay={setClosesDay}
        menuDate={chosen}
      />
      {isValidTime(start) && isValidTime(end) && closesAfterOpens(start.trim(), opensDay, end.trim(), closesDay) ? (
        <Text style={[font.body, styles.summary]}>
          Orders open {dayPhrase(shiftDate(chosen, opensDay))} at {start.trim()} and close{' '}
          {dayPhrase(shiftDate(chosen, closesDay))} at {end.trim()}.
        </Text>
      ) : null}
      <Text style={font.caption}>You’ll add dishes next. Customers see the menu once you publish it.</Text>
    </FormScreen>
  );
}

// A time, and whether it's on the menu's day or the day before
function WindowEnd({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  day,
  onDay,
  menuDate,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  day: OrderingDay;
  onDay: (d: OrderingDay) => void;
  menuDate: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.time}>
        <TextField
          label={label}
          value={value}
          onChangeText={onChangeText}
          error={error}
          placeholder={placeholder}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      </View>
      <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel={`${label} on`}>
        {([-1, 0] as const).map((d) => (
          <Chip
            key={d}
            label={`${dayLabel(shiftDate(menuDate, d))}${d === -1 ? ' (day before)' : ''}`}
            selected={day === d}
            onPress={() => onDay(d)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  hint: { marginTop: -spacing.xs, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  time: { width: 110 },
  days: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: 26 },
  summary: { marginBottom: spacing.md },
});
