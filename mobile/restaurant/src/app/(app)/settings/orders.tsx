import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Chip, colors, errorMessage, font, spacing } from '@mealdirect/shared';
import { FormScreen } from '@/components/FormScreen';
import { useRestaurant } from '@/lib/useRestaurant';
import { useUpdateOrderSettingsMutation } from '@/store/serverApi';

// Minutes before a delivery time starts; null turns auto-ready off
const AUTO_READY_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Off', value: null },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
];

export default function OrderHandlingScreen() {
  const restaurant = useRestaurant();
  const [update, { isLoading }] = useUpdateOrderSettingsMutation();
  const [autoAccept, setAutoAccept] = useState(restaurant.autoAcceptOrders);
  const [autoReady, setAutoReady] = useState<number | null>(restaurant.autoReadyMinutes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // A value saved elsewhere (not in the list) still shows as selected
  const options = AUTO_READY_OPTIONS.some((o) => o.value === autoReady)
    ? AUTO_READY_OPTIONS
    : [...AUTO_READY_OPTIONS, { label: `${autoReady} min`, value: autoReady }];

  const onSubmit = async () => {
    setError(null);
    try {
      await update({ id: restaurant.id, autoAcceptOrders: autoAccept, autoReadyMinutes: autoReady }).unwrap();
      setSaved('Saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Save" onSubmit={onSubmit} submitting={isLoading} error={error} success={saved}>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={font.body}>Accept orders automatically</Text>
          <Text style={font.caption}>
            New pay-on-delivery orders are accepted without a tap. Useful for messes and busy kitchens.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Accept orders automatically"
          value={autoAccept}
          onValueChange={(v) => {
            setSaved(null);
            setAutoAccept(v);
          }}
          trackColor={{ true: colors.success, false: colors.border }}
        />
      </View>

      <Text style={font.body}>Mark ready automatically</Text>
      <Text style={[font.caption, styles.hint]}>
        Accepted delivery orders become ready this long before their delivery time starts.
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {options.map((o) => (
          <Chip
            key={o.label}
            label={o.label}
            selected={o.value === autoReady}
            onPress={() => {
              setSaved(null);
              setAutoReady(o.value);
            }}
          />
        ))}
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  hint: { marginTop: spacing.xs, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
