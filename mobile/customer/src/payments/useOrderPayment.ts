import { useCallback, useState } from 'react';
import type { PaymentOrder, RazorpaySuccess } from '@/api/types';
import { errorMessage } from '@/lib/errors';
import { useCreatePaymentOrderMutation, useVerifyPaymentMutation } from '@/store/serverApi';

export type PaymentPhase = 'idle' | 'starting' | 'checkout' | 'verifying' | 'paid';

// Drives one online payment: create the Razorpay order, show Checkout, verify on our server
export function useOrderPayment(orderId: string) {
  const [createPaymentOrder] = useCreatePaymentOrderMutation();
  const [verifyPayment] = useVerifyPaymentMutation();
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setPhase('starting');
    try {
      const result = await createPaymentOrder(orderId).unwrap();
      setPaymentOrder(result);
      setPhase('checkout');
    } catch (e) {
      setError(errorMessage(e));
      setPhase('idle');
    }
  }, [createPaymentOrder, orderId]);

  const onSuccess = useCallback(
    async (result: RazorpaySuccess) => {
      setPaymentOrder(null);
      setError(null);
      setPhase('verifying');
      try {
        await verifyPayment({ ...result, orderId }).unwrap();
        setPhase('paid');
      } catch {
        // Razorpay's webhook will still record a genuine payment on the server
        setError(
          "We couldn't confirm your payment yet. If money was deducted, this order will update within a few minutes."
        );
        setPhase('idle');
      }
    },
    [verifyPayment, orderId]
  );

  const close = useCallback((message: string | null) => {
    setPaymentOrder(null);
    setError(message);
    setPhase('idle');
  }, []);

  return {
    phase,
    error,
    start,
    clearError: () => setError(null),
    checkoutProps: {
      paymentOrder,
      onSuccess,
      onDismiss: () => close(null),
      // Checkout stays open for a retry; just remember the reason
      onFailedAttempt: (message: string) => setError(message),
      onError: (message: string) => close(message),
    },
  };
}
