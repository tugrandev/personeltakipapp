export interface AppUser {
  id: string;
  full_name: string;
  username: string;
  role: 'admin' | 'staff';
  device_id?: string | null;
}

const SESSION_KEY = 'pt_current_user';

export function getSessionUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function setSessionUser(user: AppUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSessionUser() {
  localStorage.removeItem(SESSION_KEY);
}