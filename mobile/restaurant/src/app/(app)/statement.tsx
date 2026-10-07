import { ScrollView, StyleSheet } from 'react-native';
import {
  downloadStatement,
  spacing,
  StatementForm,
  useBottomSpace,
} from '@mealdirect/shared';
import { api } from '@/api';
import { useRestaurant } from '@/lib/useRestaurant';

// Orders over a period as a CSV file
export default function StatementScreen() {
  const bottomSpace = useBottomSpace(spacing.lg);
  const restaurant = useRestaurant();
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}>
      <StatementForm
        description={`Every order ${restaurant.name} received in the period: the customer, items, amounts, how it was paid and who collected it.`}
        download={(period) => downloadStatement(api, { ...period, restaurantId: restaurant.id })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
});
