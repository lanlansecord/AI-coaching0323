import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

const GUEST_COOKIE_NAME = 'guest_id';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function getOrCreateGuestId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_COOKIE_NAME);

  if (existing?.value) {
    return existing.value;
  }

  const guestId = uuidv4();
  cookieStore.set(GUEST_COOKIE_NAME, guestId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });

  return guestId;
}

export async function getGuestId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_COOKIE_NAME)?.value;
}
