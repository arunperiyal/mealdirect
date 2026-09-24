import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

// "Are you sure?" before an action. Alert.alert with buttons shows nothing in a browser
// (react-native-web doesn't implement it), so the web apps use the browser's own dialog.
export const confirmAction = ({
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmOptions) => {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
};
