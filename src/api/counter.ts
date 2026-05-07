// Tiny client for the finished-games counter backend. URLs are derived from
// Vite's BASE_URL so the same code works at /krummikrub/ in prod and / in dev.
// Calls swallow errors — the counter is a nice-to-have, not load-bearing.

const API_URL = `${import.meta.env.BASE_URL}api/count`;

export async function fetchGameCount(): Promise<number | null> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { count: number };
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}

export async function incrementGameCount(): Promise<number | null> {
  try {
    const res = await fetch(API_URL, { method: 'POST', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { count: number };
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}
