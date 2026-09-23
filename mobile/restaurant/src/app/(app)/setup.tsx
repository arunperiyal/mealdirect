import { useState } from 'react';
import { Text } from 'react-native';
import {
  errorMessage,
  font,
  FormScreen,
  hasPayoutErrors,
  normalizePayout,
  PayoutFields,
  payoutForm,
  spacing,
  TextField,
  validateEmail,
  validatePayout,
  type PayoutErrors,
  type PayoutField,
} from '@mealdirect/shared';
import { validatePhone, validateRestaurantName } from '@/lib/validation';
import { useAppSelector } from '@/store';
import { useCreateRestaurantMutation } from '@/store/serverApi';

type Field = 'name' | 'email' | 'phone' | 'description' | 'address' | 'city' | 'zipCode';

export default function SetupScreen() {
  const user = useAppSelector((s) => s.auth.user);
  const [createRestaurant, { isLoading }] = useCreateRestaurantMutation();
  const [form, setForm] = useState<Record<Field, string>>({
    name: '',
    email: user?.email ?? '',
    phone: '',
    description: '',
    address: '',
    city: '',
    zipCode: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [payout, setPayout] = useState(payoutForm());
  const [payoutErrors, setPayoutErrors] = useState<PayoutErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const onSubmit = async () => {
    const next = {
      name: validateRestaurantName(form.name),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      address: form.address.trim() ? null : 'Enter the address customers pick up from',
      city: form.city.trim() ? null : 'Enter the city',
    };
    const nextPayout = validatePayout(payout);
    setErrors(next);
    setPayoutErrors(nextPayout);
    if (Object.values(next).some(Boolean) || hasPayoutErrors(nextPayout)) return;

    setFormError(null);
    try {
      // The layout moves on to the approval screen once this exists
      await createRestaurant({
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.replace(/\s/g, '') } : {}),
        description: form.description.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        zipCode: form.zipCode.trim(),
        ...normalizePayout(payout),
      }).unwrap();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  return (
    <FormScreen submitTitle="Submit for review" onSubmit={onSubmit} submitting={isLoading} error={formError}>
      <Text style={[font.caption, { marginBottom: spacing.lg }]}>
        Customers see these details. Our team reviews every new restaurant, usually within a day.
      </Text>
      <TextField label="Restaurant name" value={form.name} onChangeText={set('name')} error={errors.name} />
      <TextField
        label="Business email"
        value={form.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        label="Phone (optional)"
        value={form.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        placeholder="98765 43210"
      />
      <TextField
        label="Short description (optional)"
        value={form.description}
        onChangeText={set('description')}
        placeholder="Home-style South Indian meals"
        multiline
      />
      <TextField label="Address" value={form.address} onChangeText={set('address')} error={errors.address} multiline />
      <TextField label="City" value={form.city} onChangeText={set('city')} error={errors.city} />
      <TextField label="PIN code (optional)" value={form.zipCode} onChangeText={set('zipCode')} keyboardType="number-pad" />

      <Text style={[font.heading, { marginTop: spacing.lg }]}>Payout details</Text>
      <Text style={[font.caption, { marginBottom: spacing.md }]}>
        Customers paying by UPI at the door pay this UPI ID, and MealDirect sends your earnings to this bank account.
        Only you and MealDirect see these.
      </Text>
      <PayoutFields
        form={payout}
        errors={payoutErrors}
        onChange={(field: PayoutField, value: string) => setPayout((p) => ({ ...p, [field]: value }))}
        upiPlaceholder="kitchen@okbank"
      />
    </FormScreen>
  );
}
