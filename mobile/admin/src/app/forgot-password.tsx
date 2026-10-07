import { router } from 'expo-router';
import { ForgotPassword } from '@mealdirect/shared';
import { authApi } from '@/api';
import { useAppDispatch } from '@/store';
import { login } from '@/store/authSlice';

// Forgot password: a code by email, then a new password; signs in with it
export default function ForgotPasswordScreen() {
  const dispatch = useAppDispatch();
  return (
    <ForgotPassword
      brand="MealDirect Admin"
      requestCode={authApi.requestPasswordReset}
      resetPassword={authApi.confirmPasswordReset}
      signIn={async (email, password) => {
        await dispatch(login({ email, password })).unwrap();
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      minPasswordLength={12}
    />
  );
}
