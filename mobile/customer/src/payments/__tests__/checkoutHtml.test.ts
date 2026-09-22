import { buildCheckoutHtml, parseCheckoutMessage } from '../checkoutHtml';

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

describe('parseCheckoutMessage', () => {
  test('parses our messages and ignores anything else', () => {
    expect(parseCheckoutMessage('{"type":"dismiss"}')).toEqual({ type: 'dismiss' });
    expect(parseCheckoutMessage('not json')).toBeNull();
    expect(parseCheckoutMessage('{"foo":1}')).toBeNull();
  });
});
