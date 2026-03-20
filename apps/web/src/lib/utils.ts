import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetchApi<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const { useAuthStore } = await import('@/store/auth.store');
  const token = useAuthStore.getState().accessToken;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Try token refresh
    const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refreshRes.ok) {
      const { data } = await refreshRes.json();
      useAuthStore.getState().setAccessToken(data.accessToken);
      // Retry original request
      return fetchApi(url, options);
    } else {
      useAuthStore.getState().logout();
      throw new Error('Session expired');
    }
  }

  const json = await res.json();
  if (!json.success && !res.ok) throw new Error(json.error || 'Request failed');
  return json;
}
