import { formatTime, type KitchenGroup, type OrderStatus } from '@mealdirect/shared';

// Kitchen stages: "accepted" includes preparing, since "Mark all ready" moves both
export const kitchenCounts = (counts: Partial<Record<OrderStatus, number>>) => ({
  new: counts.pending ?? 0,
  accepted: (counts.confirmed ?? 0) + (counts.preparing ?? 0),
  ready: counts.ready ?? 0,
  done: (counts.out_for_delivery ?? 0) + (counts.delivered ?? 0) + (counts.picked_up ?? 0),
});

export const countsSummary = (c: ReturnType<typeof kitchenCounts>) =>
  [c.new && `${c.new} new`, c.accepted && `${c.accepted} accepted`, c.ready && `${c.ready} ready`, c.done && `${c.done} done`]
    .filter(Boolean)
    .join(' · ');

export const groupTitle = (group: Pick<KitchenGroup, 'kind' | 'slot'>) => {
  if (group.kind === 'pickup') return 'Pickup';
  if (group.kind === 'slot' && group.slot) {
    return `Delivery ${formatTime(group.slot.startTime)}–${formatTime(group.slot.endTime)}`;
  }
  return 'Delivery (no time chosen)';
};

const plural = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

export const bulkResultMessage = (
  action: 'accept' | 'ready',
  { updated, skipped }: { updated: number; skipped: number },
  title: string
) => {
  const done =
    updated === 0
      ? `${title}: nothing to ${action === 'accept' ? 'accept' : 'mark ready'}.`
      : `${title}: ${plural(updated)} ${action === 'accept' ? 'accepted' : 'marked ready'}.`;
  return skipped > 0 ? `${done} ${plural(skipped)} still waiting for online payment.` : done;
};
