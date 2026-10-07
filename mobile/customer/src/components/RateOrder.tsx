import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  canRate,
  errorMessage,
  font,
  OrderRatingView,
  spacing,
  starLabel,
  Stars,
  TextField,
  type Order,
} from '@mealdirect/shared';
import { useRateOrderMutation } from '@/store/serverApi';

// After an order arrives: rate the food and (when a rider brought it) the delivery.
// Shows the rating once given, with "Edit" while the rating window is open.
export function RateOrder({ order }: { order: Order }) {
  const rating = order.rating ?? null;
  const open = canRate(order);
  const [editing, setEditing] = useState(false);

  if (!rating && !open) return null;

  if (rating && !editing) {
    return (
      <Card title="Your rating">
        <OrderRatingView rating={rating} />
        {open && <Button title="Edit rating" variant="secondary" onPress={() => setEditing(true)} style={styles.gap} />}
      </Card>
    );
  }
  return <RatingForm order={order} onDone={() => setEditing(false)} />;
}

function RatingForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const hasRider = Boolean(order.riderId ?? order.rider);
  const [food, setFood] = useState(order.rating?.foodRating ?? 0);
  const [foodComment, setFoodComment] = useState(order.rating?.foodComment ?? '');
  const [delivery, setDelivery] = useState(order.rating?.deliveryRating ?? 0);
  const [deliveryComment, setDeliveryComment] = useState(order.rating?.deliveryComment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [rate, { isLoading }] = useRateOrderMutation();

  const submit = async () => {
    if (!food) {
      setError('Choose how many stars for the food');
      return;
    }
    setError(null);
    try {
      await rate({
        id: order.id,
        restaurantId: order.restaurantId,
        foodRating: food,
        foodComment: foodComment.trim() || null,
        ...(hasRider && delivery ? { deliveryRating: delivery, deliveryComment: deliveryComment.trim() || null } : {}),
      }).unwrap();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card title={order.rating ? 'Edit your rating' : 'How was it?'}>
      {error && <Banner tone="error" message={error} />}
      <View style={styles.part}>
        <Text style={font.heading}>Food</Text>
        <View style={styles.stars}>
          <Stars value={food} onChange={setFood} size={32} label="Food" />
          {food ? <Text style={font.caption}>{starLabel(food)}</Text> : null}
        </View>
        <TextField
          label="Comment for the restaurant (optional)"
          value={foodComment}
          onChangeText={setFoodComment}
          maxLength={500}
          multiline
        />
      </View>
      {hasRider && (
        <View style={styles.part}>
          <Text style={font.heading}>Delivery</Text>
          <View style={styles.stars}>
            <Stars value={delivery} onChange={setDelivery} size={32} label="Delivery" />
            {delivery ? <Text style={font.caption}>{starLabel(delivery)}</Text> : null}
          </View>
          {delivery ? (
            <TextField
              label="Comment for your delivery partner (optional)"
              value={deliveryComment}
              onChangeText={setDeliveryComment}
              maxLength={500}
              multiline
            />
          ) : null}
        </View>
      )}
      <Text style={[font.caption, styles.note]}>
        The restaurant sees your rating. Others see your food stars and comment with your first name.
      </Text>
      <Button title="Submit rating" onPress={submit} loading={isLoading} />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.md },
  part: { gap: spacing.sm, marginBottom: spacing.sm },
  stars: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  note: { marginBottom: spacing.md },
});
