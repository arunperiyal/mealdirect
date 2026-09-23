import { Banner } from './States';
import { formatDateTime } from '../lib/dates';
import { changedFieldsLabel } from '../lib/payout';
import type { ChangeRequest } from '../api/types';

// Where a change of details stands: waiting for MealDirect, or turned down with a reason
export function ChangeRequestNotice({ request }: { request: ChangeRequest | null | undefined }) {
  if (!request) return null;
  const what = changedFieldsLabel(request);
  if (request.status === 'pending') {
    return (
      <Banner
        tone="warning"
        message={`Your new ${what} is waiting for MealDirect to approve (sent ${formatDateTime(request.updatedAt)}). Until then, your current details stay in use.`}
      />
    );
  }
  if (request.status === 'rejected') {
    return (
      <Banner
        tone="error"
        message={`MealDirect didn't approve your new ${what}${request.reviewNote ? `: ${request.reviewNote}` : '.'} You can correct it and send it again.`}
      />
    );
  }
  return null;
}
