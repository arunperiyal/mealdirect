import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, font, radius, spacing, TextField, type SavedAddress } from '@mealdirect/shared';

export interface AddressChoice {
  address: string;
  // Set when the user wants a new address saved for next time
  saveAs: string | null;
}

interface Props {
  addresses: SavedAddress[];
  error?: string | null;
  onChange: (choice: AddressChoice) => void;
}

const NEW = 'new';

// Checkout: pick a saved address (the most recently used is picked to begin with) or type a
// new one, and optionally save it
export function AddressPicker({ addresses, error, onChange }: Props) {
  const [selected, setSelected] = useState<string>(addresses[0]?.id ?? NEW);
  const [typed, setTyped] = useState('');
  const [save, setSave] = useState(true);
  const [label, setLabel] = useState(addresses.length ? '' : 'Home');

  const picked = addresses.find((a) => a.id === selected);
  const isNew = !picked;
  // On the address text, not the object: a refetched list must not report a change
  const pickedAddress = picked?.address ?? null;
  useEffect(() => {
    onChange(
      pickedAddress !== null
        ? { address: pickedAddress, saveAs: null }
        : { address: typed, saveAs: save ? label.trim() || 'Home' : null }
    );
  }, [pickedAddress, typed, save, label, onChange]);

  return (
    <View>
      {addresses.length > 0 && <Text style={styles.label}>Deliver to</Text>}
      {addresses.map((a) => (
        <Option key={a.id} selected={a.id === selected} title={a.label} detail={a.address} onPress={() => setSelected(a.id)} />
      ))}
      {addresses.length > 0 && (
        <Option selected={isNew} title="A new address" onPress={() => setSelected(NEW)} />
      )}
      {isNew && (
        <View style={addresses.length > 0 ? styles.newAddress : undefined}>
          <TextField
            label="Delivery address"
            value={typed}
            onChangeText={setTyped}
            error={error}
            placeholder="Flat, building, street, landmark"
            multiline
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            style={styles.multiline}
          />
          <View style={styles.saveRow}>
            <Text style={[font.body, styles.flex]}>Save for next time</Text>
            <Switch
              value={save}
              onValueChange={setSave}
              accessibilityLabel="Save for next time"
              trackColor={{ true: colors.success, false: colors.border }}
            />
          </View>
          {save && (
            <TextField label="Name it" value={label} onChangeText={setLabel} placeholder="Home, Work…" maxLength={40} />
          )}
        </View>
      )}
      {!isNew && error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Option({ selected, title, detail, onPress }: { selected: boolean; title: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]} />
      <View style={styles.flex}>
        <Text style={font.heading}>{title}</Text>
        {detail ? (
          <Text style={font.caption} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  flex: { flex: 1 },
  newAddress: { marginTop: spacing.sm },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  saveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
});
