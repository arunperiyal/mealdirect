import { ScrollView, StyleSheet } from 'react-native';
import { downloadStatement, spacing, StatementForm } from '@mealdirect/shared';
import { api } from '@/api';

// Orders over a period as a CSV file
export default function StatementScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <StatementForm
        description={'Every order you delivered in the period, with how the customer paid, and the cash you collected.'}
        download={(period) => downloadStatement(api, period)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
});
