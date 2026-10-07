import { ReactNode, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { toApiError } from '../api/client';
import { statementPeriods, validatePeriod } from '../lib/statements';
import { font, spacing } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { Banner } from './States';
import { TextField } from './TextField';

interface Props {
  // What's in the statement, e.g. "Orders you placed..."
  description: string;
  download: (period: { from: string; to: string }) => Promise<void>;
  children?: ReactNode; // extra choices, e.g. which restaurant
}

// Pick a period and download its orders as a CSV file
export function StatementForm({ description, download, children }: Props) {
  const periods = useMemo(() => statementPeriods(), []);
  const [key, setKey] = useState(periods[0].key);
  const [from, setFrom] = useState(periods[0].from);
  const [to, setTo] = useState(periods[0].to);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (k: string) => {
    setKey(k);
    const period = periods.find((p) => p.key === k);
    if (period) {
      setFrom(period.from);
      setTo(period.to);
    }
  };

  const submit = async () => {
    const problem = validatePeriod(from.trim(), to.trim());
    setError(problem);
    setDone(null);
    if (problem) return;
    setBusy(true);
    try {
      await download({ from: from.trim(), to: to.trim() });
      setDone(`Statement for ${from.trim()} to ${to.trim()} is ready.`);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={[font.body, styles.gap]}>{description}</Text>
      {error && <Banner tone="error" message={error} />}
      {done && <Banner tone="success" message={done} />}
      {children}
      <View style={[styles.chips, styles.gap]} accessibilityRole="radiogroup">
        {periods.map((p) => (
          <Chip key={p.key} label={p.label} selected={key === p.key} onPress={() => choose(p.key)} />
        ))}
        <Chip label="Choose dates" selected={key === 'custom'} onPress={() => setKey('custom')} />
      </View>
      {key === 'custom' ? (
        <View style={styles.dates}>
          <TextField label="From" value={from} onChangeText={setFrom} placeholder="2026-09-01" style={styles.date} autoCorrect={false} />
          <TextField label="To" value={to} onChangeText={setTo} placeholder="2026-09-30" style={styles.date} autoCorrect={false} />
        </View>
      ) : (
        <Text style={[font.caption, styles.gap]}>
          {from} to {to}
        </Text>
      )}
      <Text style={[font.caption, styles.gap]}>A CSV file, which opens in Excel, Google Sheets or Numbers. Up to a year at a time.</Text>
      <Button title="Download statement" onPress={submit} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dates: { flexDirection: 'row', gap: spacing.md },
  date: { minWidth: 130 },
});
