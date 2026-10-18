export const USER_TOKEN_STORAGE_KEY = 'growing_math_user_token';

export const getUserAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem(USER_TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};
