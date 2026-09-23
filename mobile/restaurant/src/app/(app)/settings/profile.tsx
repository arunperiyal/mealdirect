import { useState } from 'react';
import { Text } from 'react-native';
import { errorMessage, font, FormScreen, spacing, TextField } from '@mealdirect/shared';
import { useRestaurant } from '@/lib/useRestaurant';
import { validatePhone, validateRestaurantName } from '@/lib/validation';
import { useUpdateRestaurantMutation } from '@/store/serverApi';

type Field = 'name' | 'phone' | 'description' | 'address' | 'city' | 'zipCode';

export default function ProfileScreen() {
  const restaurant = useRestaurant();
  const [update, { isLoading }] = useUpdateRestaurantMutation();
  const [form, setForm] = useState<Record<Field, string>>({
    name: restaurant.name,
    phone: restaurant.phone ?? '',
    description: restaurant.description ?? '',
    address: restaurant.address ?? '',
    city: restaurant.city ?? '',
    zipCode: restaurant.zipCode ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = (field: Field) => (value: string) => {
    setSaved(null);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const onSubmit = async () => {
    const next = { name: validateRestaurantName(form.name), phone: validatePhone(form.phone) };
    setErrors(next);
    if (next.name || next.phone) return;
    setError(null);
    try {
      await update({
        id: restaurant.id,
        name: form.name.trim(),
        ...(form.phone.trim() ? { phone: form.phone.replace(/\s/g, '') } : {}),
        description: form.description.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        zipCode: form.zipCode.trim(),
      }).unwrap();
      setSaved('Saved');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Save details" onSubmit={onSubmit} submitting={isLoading} error={error} success={saved}>
      <TextField label="Restaurant name" value={form.name} onChangeText={set('name')} error={errors.name} />
      <TextField label="Phone" value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" />
      <TextField label="Description" value={form.description} onChangeText={set('description')} multiline />
      <TextField label="Address" value={form.address} onChangeText={set('address')} multiline />
      <TextField label="City" value={form.city} onChangeText={set('city')} />
      <TextField label="PIN code" value={form.zipCode} onChangeText={set('zipCode')} keyboardType="number-pad" />
      <Text style={[font.caption, { marginTop: spacing.sm }]}>
        Business email: {restaurant.email}. Contact support to change it.
      </Text>
    </FormScreen>
  );
}
