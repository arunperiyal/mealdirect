// Errors reach screens either as RTK Query errors ({ message }) or thunk rejections (string)
export const errorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.') => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
};
