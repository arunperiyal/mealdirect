import { useMemo } from 'react';
import { Linking, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { colors, type PaymentOrder, type RazorpaySuccess } from '@mealdirect/shared';
import { buildCheckoutHtml, parseCheckoutMessage } from './checkoutHtml';

interface Props {
  paymentOrder: PaymentOrder | null;
  description: string;
  prefill: { name?: string; email?: string };
  onSuccess: (result: RazorpaySuccess) => void;
  onDismiss: () => void;
  onFailedAttempt: (message: string) => void;
  onError: (message: string) => void;
}

const WEB_SCHEMES = /^(https?|about|data|blob):/i;

// UPI apps (upi://, tez://, phonepe://, ...) must open outside the WebView
const handleNavigation = (request: ShouldStartLoadRequest) => {
  if (WEB_SCHEMES.test(request.url)) return true;
  Linking.openURL(request.url).catch(() => {
    // No app installed for this scheme; Checkout offers other methods
  });
  return false;
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
  const html = useMemo(
    () =>
      paymentOrder
        ? buildCheckoutHtml({ paymentOrder, description, prefill, themeColor: colors.brand })
        : '',
    [paymentOrder, description, prefill]
  );

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = parseCheckoutMessage(event.nativeEvent.data);
    if (!msg) return;
    switch (msg.type) {
      case 'success':
        onSuccess({
          razorpay_order_id: msg.razorpay_order_id,
          razorpay_payment_id: msg.razorpay_payment_id,
          razorpay_signature: msg.razorpay_signature,
        });
        break;
      case 'failed':
        onFailedAttempt(msg.description);
        break;
      case 'dismiss':
        onDismiss();
        break;
      case 'error':
        onError(msg.description);
        break;
    }
  };

  return (
    <Modal
      visible={Boolean(paymentOrder)}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container}>
        {paymentOrder && (
          <View style={styles.container}>
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              onMessage={onMessage}
              onShouldStartLoadWithRequest={handleNavigation}
              setSupportMultipleWindows={false}
              javaScriptEnabled
              domStorageEnabled
              onError={() => onError('Could not load the payment page. Check your connection.')}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});
