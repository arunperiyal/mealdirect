import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, errorMessage, font, spacing, TextField } from '@mealdirect/shared';
import { FormScreen } from '@/components/FormScreen';
import { useRestaurant } from '@/lib/useRestaurant';
import { validateMoney } from '@/lib/validation';
import { useUpdateDeliverySettingsMutation } from '@/store/serverApi';

export default function DeliveryScreen() {
  const restaurant = useRestaurant();
  const [update, { isLoading }] = useUpdateDeliverySettingsMutation();
  const [delivery, setDelivery] = useState(restaurant.deliveryEnabled);
  const [pickup, setPickup] = useState(restaurant.pickupEnabled);
  const [fee, setFee] = useState(String(Number(restaurant.defaultDeliveryFee ?? 0)));
  const [minimum, setMinimum] = useState(String(Number(restaurant.minOrderForDelivery ?? 0)));
  const [errors, setErrors] = useState<{ fee?: string | null; minimum?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const onSubmit = async () => {
    const next = { fee: validateMoney(fee, 'Delivery fee'), minimum: validateMoney(minimum, 'Minimum order') };
    setErrors(next);
    if (next.fee || next.minimum) return;
    if (!delivery && !pickup) {
      setError('Turn on delivery or pickup, or customers can’t order.');
      return;
    }
    setError(null);
    try {
      await update({
        id: restaurant.id,
        deliveryEnabled: delivery,
        pickupEnabled: pickup,
        defaultDeliveryFee: Number(fee || 0),
        minOrderForDelivery: Number(minimum || 0),
      }).unwrap();
      setSaved('Saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const toggle = (setter: (v: boolean) => void) => (v: boolean) => {
    setSaved(null);
    setter(v);
  };

  return (
    <FormScreen submitTitle="Save" onSubmit={onSubmit} submitting={isLoading} error={error} success={saved}>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={font.body}>Delivery</Text>
          <Text style={font.caption}>You deliver to the customer’s address</Text>
        </View>
        <Switch value={delivery} onValueChange={toggle(setDelivery)} trackColor={{ true: colors.success, false: colors.border }} />
      </View>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={font.body}>Pickup</Text>
          <Text style={font.caption}>Customers collect from your restaurant</Text>
        </View>
        <Switch value={pickup} onValueChange={toggle(setPickup)} trackColor={{ true: colors.success, false: colors.border }} />
      </View>
      {delivery && (
        <>
          <TextField label="Delivery fee (₹)" value={fee} onChangeText={setFee} error={errors.fee} keyboardType="decimal-pad" />
          <TextField
            label="Minimum order for delivery (₹)"
            value={minimum}
            onChangeText={setMinimum}
            error={errors.minimum}
            keyboardType="decimal-pad"
          />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
});
