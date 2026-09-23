import { buildCheckoutHtml, parseCheckoutMessage, toAppUrl } from '../checkoutHtml';

const paymentOrder = {
  paymentId: 'p1',
  orderId: 'o1',
  razorpayOrderId: 'order_abc',
  amount: 21000,
  currency: 'INR',
  keyId: 'rzp_test_key',
};

describe('buildCheckoutHtml', () => {
  test('embeds the Razorpay order options', () => {
    const html = buildCheckoutHtml({
      paymentOrder,
      description: 'Order #1',
      prefill: { email: 'a@b.co' },
      themeColor: '#E23744',
    });
    expect(html).toContain('https://checkout.razorpay.com/v1/checkout.js');
    expect(html).toContain('"order_id":"order_abc"');
    expect(html).toContain('"amount":21000');
    expect(html).toContain('"key":"rzp_test_key"');
    // UPI apps only appear in an Android WebView with this flag
    expect(html).toContain('"webview_intent":true');
  });

  test('user-controlled strings cannot break out of the script tag', () => {
    const html = buildCheckoutHtml({
      paymentOrder,
      description: '</script><script>alert(1)</script>',
      prefill: { name: 'Eve <!-- \u2028' },
      themeColor: '#E23744',
    });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('\u2028');
    expect(html).toContain('\\u003c/script\\u003e');
  });
});

describe('toAppUrl', () => {
  test('passes UPI and app links through', () => {
    expect(toAppUrl('upi://pay?pa=merchant@bank&am=10')).toBe('upi://pay?pa=merchant@bank&am=10');
    expect(toAppUrl('tez://upi/pay?pa=x')).toBe('tez://upi/pay?pa=x');
  });

  test('converts Android intent links to the scheme they carry', () => {
    expect(
      toAppUrl('intent://pay?pa=merchant@bank&am=10#Intent;scheme=upi;package=com.phonepe.app;end')
    ).toBe('upi://pay?pa=merchant@bank&am=10');
    expect(toAppUrl('intent://pay#Intent;package=com.example;end')).toBeNull();
  });
});

describe('parseCheckoutMessage', () => {
  test('parses our messages and ignores anything else', () => {
    expect(parseCheckoutMessage('{"type":"dismiss"}')).toEqual({ type: 'dismiss' });
    expect(parseCheckoutMessage('not json')).toBeNull();
    expect(parseCheckoutMessage('{"foo":1}')).toBeNull();
  });
});
