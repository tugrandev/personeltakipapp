export interface AppUser {
  id: string;
  full_name: string;
  username: string;
  role: 'admin' | 'staff' | string;
  device_id?: string | null;
}

const SESSION_KEY = 'pt_session_user';

export function setSessionUser(user: AppUser, remember: boolean = true) {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(user);

  if (remember) {
    localStorage.setItem(SESSION_KEY, serialized);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, serialized);
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getSessionUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function clearSessionUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}