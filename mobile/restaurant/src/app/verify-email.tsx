import { VerifyEmail } from '@mealdirect/shared';
import { authApi } from '@/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout, userUpdated } from '@/store/authSlice';

// After sign-up: the code emailed to the new account
export default function VerifyEmailScreen() {
  const dispatch = useAppDispatch();
  const email = useAppSelector((s) => s.auth.user?.email ?? '');
  return (
    <VerifyEmail
      brand="MealDirect Partner"
      email={email}
      verify={authApi.verifyEmail}
      resend={authApi.resendVerification}
      onVerified={(user) => dispatch(userUpdated(user))}
      onSignOut={() => dispatch(logout())}
    />
  );
}
