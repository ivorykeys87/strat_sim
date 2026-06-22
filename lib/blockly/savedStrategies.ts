/**
 * savedStrategies.ts
 *
 * Pure helpers for named Blockly workspace slots persisted to localStorage
 * under the key `strat-sim:blockly:saved:v1`.
 *
 * Shape:
 *   { version: 1, items: SavedStrategy[] }
 *
 * All functions are SSR-safe (guard `typeof window`) and tolerate quota /
 * malformed JSON by returning sane defaults.
 *
 * NOTE: This module intentionally has no React or Next.js dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedStrategy {
  id: string;
  name: string;
  json: object;
  updatedAt: number; // Unix ms timestamp
}

interface StoredData {
  version: 1;
  items: SavedStrategy[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LS_SAVED_KEY = 'strat-sim:blockly:saved:v1';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (very old browsers)
  return (
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Date.now().toString(36)
  );
}

function readStore(): StoredData {
  if (typeof window === 'undefined') return { version: 1, items: [] };
  try {
    const raw = localStorage.getItem(LS_SAVED_KEY);
    if (!raw) return { version: 1, items: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).version !== 1 ||
      !Array.isArray((parsed as Record<string, unknown>).items)
    ) {
      return { version: 1, items: [] };
    }
    const { items } = parsed as { version: 1; items: unknown[] };
    const valid = items.filter(isValidItem);
    return { version: 1, items: valid };
  } catch {
    return { version: 1, items: [] };
  }
}

function isValidItem(x: unknown): x is SavedStrategy {
  if (typeof x !== 'object' || x === null) return false;
  const item = x as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.updatedAt === 'number' &&
    typeof item.json === 'object' &&
    item.json !== null
  );
}

function writeStore(data: StoredData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_SAVED_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota / private-browsing errors
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all saved strategies, newest first.
 */
export function listSaved(): SavedStrategy[] {
  const { items } = readStore();
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Returns a single saved strategy by id, or undefined if not found.
 */
export function getSaved(id: string): SavedStrategy | undefined {
  const { items } = readStore();
  return items.find((item) => item.id === id);
}

/**
 * Creates a new saved strategy slot with a generated id.
 * Returns the newly created item.
 */
export function saveAs(name: string, json: object): SavedStrategy {
  const store = readStore();
  const item: SavedStrategy = {
    id: generateId(),
    name: name.trim() || 'Untitled',
    json,
    updatedAt: Date.now(),
  };
  store.items.push(item);
  writeStore(store);
  return item;
}

/**
 * Overwrites the JSON of an existing saved strategy (updates updatedAt).
 * No-op if the id does not exist.
 */
export function overwrite(id: string, json: object): void {
  const store = readStore();
  const idx = store.items.findIndex((item) => item.id === id);
  if (idx === -1) return;
  store.items[idx] = { ...store.items[idx], json, updatedAt: Date.now() };
  writeStore(store);
}

/**
 * Renames an existing saved strategy.
 * No-op if the id does not exist.
 */
export function rename(id: string, name: string): void {
  const store = readStore();
  const idx = store.items.findIndex((item) => item.id === id);
  if (idx === -1) return;
  store.items[idx] = {
    ...store.items[idx],
    name: name.trim() || 'Untitled',
    updatedAt: Date.now(),
  };
  writeStore(store);
}

/**
 * Deletes a saved strategy by id.
 * No-op if the id does not exist.
 */
export function remove(id: string): void {
  const store = readStore();
  store.items = store.items.filter((item) => item.id !== id);
  writeStore(store);
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

/**
 * Returns the full store as a plain object suitable for JSON serialisation.
 * SSR-safe: returns an empty store when called on the server.
 */
export function exportAll(): StoredData {
  return readStore();
}

/**
 * Imports strategies from a plain StoredData object.
 *
 * - `'replace'` — discards all existing strategies and replaces them.
 * - `'merge'`   — appends imported strategies; if an id already exists the
 *                 imported item wins (overwrites the existing one).
 */
export function importAll(data: unknown, mode: 'merge' | 'replace'): void {
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).items)
  ) {
    return; // Silently ignore malformed input
  }
  const incoming = ((data as Record<string, unknown>).items as unknown[]).filter(isValidItem);

  if (mode === 'replace') {
    writeStore({ version: 1, items: incoming });
    return;
  }

  // merge: existing items kept unless an incoming item has the same id
  const store = readStore();
  const existingIds = new Set(store.items.map((i) => i.id));
  for (const item of incoming) {
    if (existingIds.has(item.id)) {
      // Overwrite existing entry
      const idx = store.items.findIndex((i) => i.id === item.id);
      if (idx !== -1) store.items[idx] = item;
    } else {
      store.items.push(item);
    }
  }
  writeStore(store);
}
