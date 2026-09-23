import type { PaymentOrder } from '@mealdirect/shared';

export interface CheckoutOptions {
  paymentOrder: PaymentOrder;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  themeColor: string;
}

// Messages posted from the WebView back to React Native
export type CheckoutMessage =
  | {
      type: 'success';
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }
  | { type: 'failed'; description: string }
  | { type: 'dismiss' }
  | { type: 'error'; description: string };

// JSON is not safe inside <script>: "</script>" or "<!--" in a value would break out
const toScriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export const buildCheckoutHtml = ({
  paymentOrder,
  description,
  prefill,
  themeColor,
}: CheckoutOptions) => {
  const options = {
    key: paymentOrder.keyId,
    amount: paymentOrder.amount,
    currency: paymentOrder.currency,
    order_id: paymentOrder.razorpayOrderId,
    name: 'MealDirect',
    description,
    prefill,
    theme: { color: themeColor },
    retry: { enabled: true },
    // Without this Razorpay hides UPI apps (GPay, PhonePe, ...) inside an Android WebView
    webview_intent: true,
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#fff;font-family:sans-serif}</style>
</head>
<body>
<script>
  function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function loadFailed() { post({ type: 'error', description: 'Could not load the payment page. Check your connection.' }); }
</script>
<script src="https://checkout.razorpay.com/v1/checkout.js" onerror="loadFailed()"></script>
<script>
  (function () {
    if (typeof Razorpay === 'undefined') { loadFailed(); return; }
    var options = ${toScriptJson(options)};
    options.handler = function (res) {
      post({
        type: 'success',
        razorpay_order_id: res.razorpay_order_id,
        razorpay_payment_id: res.razorpay_payment_id,
        razorpay_signature: res.razorpay_signature
      });
    };
    options.modal = { ondismiss: function () { post({ type: 'dismiss' }); } };
    var rzp = new Razorpay(options);
    // Checkout stays open after a failure so the customer can retry
    rzp.on('payment.failed', function (res) {
      post({ type: 'failed', description: (res.error && res.error.description) || 'Payment failed' });
    });
    rzp.open();
  })();
</script>
</body>
</html>`;
};

// Turn a link Checkout opens for a UPI app into one the phone can open. Android
// "intent://" links carry the real scheme in their #Intent fragment, e.g.
// intent://pay?pa=x#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end
export const toAppUrl = (url: string) => {
  if (!url.startsWith('intent://')) return url;
  const [target, fragment = ''] = url.slice('intent://'.length).split('#Intent;');
  const scheme = /(?:^|;)scheme=([^;]+)/.exec(fragment)?.[1];
  return scheme ? `${scheme}://${target}` : null;
};

export const parseCheckoutMessage = (data: string): CheckoutMessage | null => {
  try {
    const msg = JSON.parse(data);
    if (msg && typeof msg.type === 'string') return msg as CheckoutMessage;
  } catch {
    // Ignore anything that isn't one of our messages
  }
  return null;
};
