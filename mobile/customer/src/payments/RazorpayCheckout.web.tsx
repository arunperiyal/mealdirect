import { useEffect, useRef } from 'react';
import { colors, type PaymentOrder, type RazorpaySuccess } from '@mealdirect/shared';
import { checkoutOptions } from './checkoutHtml';

// The web app loads Razorpay Checkout into the page itself; the phone apps use a
// WebView instead (RazorpayCheckout.tsx). Same props, so the order screen doesn't care.
interface Props {
  paymentOrder: PaymentOrder | null;
  description: string;
  prefill: { name?: string; email?: string };
  onSuccess: (result: RazorpaySuccess) => void;
  onDismiss: () => void;
  onFailedAttempt: (message: string) => void;
  onError: (message: string) => void;
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (res: { error?: { description?: string } }) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

let loading: Promise<RazorpayConstructor> | null = null;

// Load checkout.js once per page
const loadRazorpay = () => {
  const existing = (globalThis as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const loaded = (globalThis as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error('Razorpay did not load'));
    };
    script.onerror = () => {
      loading = null; // try again next time
      reject(new Error('Razorpay did not load'));
    };
    document.body.appendChild(script);
  });
  return loading;
};

export function RazorpayCheckout({
  paymentOrder,
  description,
  prefill,
  onSuccess,
  onDismiss,
  onFailedAttempt,
  onError,
}: Props) {
  // The order screen re-renders as it polls, passing new objects each time. Keep the
  // latest props in a ref and open Checkout once per payment order.
  const latest = useRef({ description, prefill, onSuccess, onDismiss, onFailedAttempt, onError });
  useEffect(() => {
    latest.current = { description, prefill, onSuccess, onDismiss, onFailedAttempt, onError };
  });

  useEffect(() => {
    if (!paymentOrder) return;
    let cancelled = false;
    loadRazorpay()
      .then((Razorpay) => {
        if (cancelled) return;
        const rzp = new Razorpay({
          ...checkoutOptions(
            {
              paymentOrder,
              description: latest.current.description,
              prefill: latest.current.prefill,
              themeColor: colors.brand,
            },
            { inWebView: false }
          ),
          handler: (res: RazorpaySuccess) =>
            latest.current.onSuccess({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
            }),
          modal: { ondismiss: () => latest.current.onDismiss() },
        });
        // Checkout stays open after a failure so the customer can retry
        rzp.on('payment.failed', (res) =>
          latest.current.onFailedAttempt(res.error?.description || 'Payment failed')
        );
        rzp.open();
      })
      .catch(() => {
        if (!cancelled) latest.current.onError('Could not load the payment page. Check your connection.');
      });
    return () => {
      cancelled = true;
    };
  }, [paymentOrder]);

  // Checkout draws its own overlay on the page
  return null;
}
