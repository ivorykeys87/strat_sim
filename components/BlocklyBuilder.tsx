'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { DEFAULT_BLOCKLY_WORKSPACE } from '@/lib/blockly/compile';
import { buildToolbox } from '@/lib/blockly/toolbox';
import {
  listSaved,
  getSaved,
  saveAs,
  overwrite,
  rename,
  remove,
  exportAll,
  importAll,
} from '@/lib/blockly/savedStrategies';
import type { SavedStrategy } from '@/lib/blockly/savedStrategies';
import {
  buildShareUrl,
  encodeWorkspaceToHash,
  decodeWorkspaceFromHash,
  extractHashPayload,
} from '@/lib/blockly/shareLink';

const LS_BLOCKLY_KEY = 'strat-sim:blockly:v1';

// Match the MAX_HASH_LENGTH defined in shareLink.ts so we can show the right
// error message before attempting clipboard.writeText.
const MAX_HASH_LENGTH = 7000;

export interface BlocklyBuilderProps {
  /** Called with the serialised workspace JSON whenever the workspace changes. */
  onChange: (json: object) => void;
}

// ---------------------------------------------------------------------------
// Shared Tailwind classes (match app/page.tsx style)
// ---------------------------------------------------------------------------

const btnBase =
  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed';
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700`;
const btnSecondary = `${btnBase} bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600`;
const btnDanger = `${btnBase} bg-gray-700 text-red-400 hover:bg-red-700 hover:text-white border border-gray-600`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Mounts a Blockly workspace for visual strategy editing, with named save
 * slots, export/import, and shareable URL support.
 *
 * Dynamically imports the `blockly` package to avoid SSR issues.
 * The parent should render this via `next/dynamic` with `{ ssr: false }`.
 */
export default function BlocklyBuilder({ onChange }: BlocklyBuilderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BlocklyRef = useRef<any>(null);

  // The most-recent serialised workspace JSON, kept in sync via the change
  // listener so toolbar buttons always operate on the current state.
  const currentJsonRef = useRef<object | null>(null);

  // Saved-strategy list (re-read from localStorage on certain operations).
  const [savedList, setSavedList] = useState<SavedStrategy[]>([]);
  // The id of the currently "active" named strategy (null = unsaved / default).
  const [activeId, setActiveId] = useState<string | null>(null);
  // Toast / inline feedback messages.
  const [toast, setToast] = useState<string | null>(null);
  // Whether the workspace was loaded from a share link (show inline banner).
  const [loadedFromShare, setLoadedFromShare] = useState(false);

  // File-input ref for the hidden import <input>.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Toast helpers ──────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string, durationMs = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), durationMs);
  }, []);

  // ── Refresh saved list ─────────────────────────────────────────────────────

  const refreshList = useCallback(() => {
    setSavedList(listSaved());
  }, []);

  // ── Load a workspace JSON into the live Blockly editor ────────────────────

  const loadJsonIntoWorkspace = useCallback(
    (json: object) => {
      const Blockly = BlocklyRef.current;
      const workspace = workspaceRef.current;
      if (!Blockly || !workspace) return;
      try {
        Blockly.serialization.workspaces.load(json, workspace);
      } catch {
        try {
          Blockly.serialization.workspaces.load(DEFAULT_BLOCKLY_WORKSPACE, workspace);
        } catch {
          // ignore
        }
      }
      // Emit the newly loaded state
      const serialised = Blockly.serialization.workspaces.save(workspace) as object;
      currentJsonRef.current = serialised;
      // Also write to autosave key so subsequent edits persist normally
      try {
        localStorage.setItem(LS_BLOCKLY_KEY, JSON.stringify(serialised));
      } catch {
        // ignore quota errors
      }
      onChange(serialised);
    },
    [onChange],
  );

  // ── localStorage autosave read ────────────────────────────────────────────

  const loadAutosaved = useCallback((): object => {
    try {
      const raw = localStorage.getItem(LS_BLOCKLY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as object;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_BLOCKLY_WORKSPACE as object;
  }, []);

  // ── Mount effect ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    void (async () => {
      // Dynamic import keeps Blockly out of the SSR bundle
      const Blockly = await import('blockly');
      const { defineBlocks } = await import('@/lib/blockly/blocks');

      if (disposed || !containerRef.current) return;

      BlocklyRef.current = Blockly;
      defineBlocks(Blockly);

      const workspace = Blockly.inject(containerRef.current, {
        toolbox: buildToolbox(),
        scrollbars: true,
        trashcan: true,
        theme: Blockly.Themes?.Dark ?? undefined,
      });

      workspaceRef.current = workspace;

      // ── 1. Try loading from URL hash ──────────────────────────────────────
      let loadedViaHash = false;
      const hashPayload = extractHashPayload();
      if (hashPayload) {
        const decoded = await decodeWorkspaceFromHash(hashPayload);
        if (decoded !== null) {
          try {
            Blockly.serialization.workspaces.load(decoded, workspace);
            loadedViaHash = true;
            setLoadedFromShare(true);
            // Clear the hash so page refreshes don't re-apply it
            history.replaceState(null, '', location.pathname + location.search);
          } catch {
            // Malformed workspace in hash — fall through to autosave
          }
        }
      }

      // ── 2. Fall back to autosaved / default workspace ─────────────────────
      if (!loadedViaHash) {
        const saved = loadAutosaved();
        try {
          Blockly.serialization.workspaces.load(saved, workspace);
        } catch {
          try {
            Blockly.serialization.workspaces.load(DEFAULT_BLOCKLY_WORKSPACE, workspace);
          } catch {
            // start empty
          }
        }
      }

      // Emit initial state
      const initial = Blockly.serialization.workspaces.save(workspace) as object;
      currentJsonRef.current = initial;
      // Persist hash-loaded state to autosave key so subsequent edits persist
      if (loadedViaHash) {
        try {
          localStorage.setItem(LS_BLOCKLY_KEY, JSON.stringify(initial));
        } catch {
          // ignore
        }
      }
      onChange(initial);

      // Populate the saved-strategy list for the toolbar
      setSavedList(listSaved());

      // Listen for changes
      workspace.addChangeListener(() => {
        const json = Blockly.serialization.workspaces.save(workspace) as object;
        currentJsonRef.current = json;
        // Autosave to localStorage
        try {
          localStorage.setItem(LS_BLOCKLY_KEY, JSON.stringify(json));
        } catch {
          // ignore quota errors
        }
        onChange(json);
      });
    })();

    return () => {
      disposed = true;
      if (workspaceRef.current) {
        workspaceRef.current.dispose();
        workspaceRef.current = null;
      }
      BlocklyRef.current = null;
    };
  }, [loadAutosaved, onChange]);

  // ── Toolbar handlers ───────────────────────────────────────────────────────

  const handleSelectSaved = useCallback(
    (id: string) => {
      if (!id) {
        setActiveId(null);
        return;
      }
      const item = getSaved(id);
      if (!item) return;
      loadJsonIntoWorkspace(item.json);
      setActiveId(id);
      setLoadedFromShare(false);
    },
    [loadJsonIntoWorkspace],
  );

  const handleSaveAs = useCallback(() => {
    const name = prompt('Strategy name:');
    if (name === null) return; // cancelled
    const json = currentJsonRef.current;
    if (!json) return;
    const item = saveAs(name, json);
    refreshList();
    setActiveId(item.id);
    setLoadedFromShare(false);
    showToast(`Saved as "${item.name}"`);
  }, [refreshList, showToast]);

  const handleSave = useCallback(() => {
    if (!activeId) return;
    const json = currentJsonRef.current;
    if (!json) return;
    overwrite(activeId, json);
    refreshList();
    showToast('Strategy saved');
  }, [activeId, refreshList, showToast]);

  const handleRename = useCallback(() => {
    if (!activeId) return;
    const current = getSaved(activeId);
    const name = prompt('New name:', current?.name ?? '');
    if (name === null) return; // cancelled
    rename(activeId, name);
    refreshList();
    showToast('Renamed');
  }, [activeId, refreshList, showToast]);

  const handleDelete = useCallback(() => {
    if (!activeId) return;
    const item = getSaved(activeId);
    if (!confirm(`Delete "${item?.name ?? 'this strategy'}"?`)) return;
    remove(activeId);
    setActiveId(null);
    refreshList();
    showToast('Deleted');
  }, [activeId, refreshList, showToast]);

  const handleExport = useCallback(() => {
    const data = exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'strat-sim-strategies.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target?.result as string) as unknown;
          importAll(parsed, 'merge');
          refreshList();
          showToast('Imported successfully');
        } catch {
          showToast('Import failed — invalid JSON file');
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be re-imported if needed
      e.target.value = '';
    },
    [refreshList, showToast],
  );

  const handleCopyShareLink = useCallback(async () => {
    const json = currentJsonRef.current;
    if (!json) return;

    try {
      const encoded = await encodeWorkspaceToHash(json);
      if (encoded.length > MAX_HASH_LENGTH) {
        showToast(
          'Strategy too large to share via URL — use Export JSON instead.',
          6000,
        );
        return;
      }
      const url = await buildShareUrl(json);
      await navigator.clipboard.writeText(url);
      showToast('Link copied!');
    } catch (err) {
      if (err instanceof Error && err.message.includes('too large')) {
        showToast(
          'Strategy too large to share via URL — use Export JSON instead.',
          6000,
        );
      } else {
        showToast('Could not copy — check clipboard permissions', 4000);
      }
    }
  }, [showToast]);

  const handleSaveFromShareBanner = useCallback(() => {
    const name = prompt('Save this shared strategy as:');
    if (name === null) return;
    const json = currentJsonRef.current;
    if (!json) return;
    const item = saveAs(name, json);
    refreshList();
    setActiveId(item.id);
    setLoadedFromShare(false);
    showToast(`Saved as "${item.name}"`);
  }, [refreshList, showToast]);

  // Active item (for deciding which buttons to show)
  const activeItem = activeId ? (savedList.find((s) => s.id === activeId) ?? null) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">
      {/* ── "Loaded from share link" banner ── */}
      {loadedFromShare && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/50 bg-indigo-950/60 px-4 py-2 text-sm text-indigo-200">
          <span>📎 Loaded from share link.</span>
          <button onClick={handleSaveFromShareBanner} className={btnPrimary}>
            Save as…
          </button>
          <button
            onClick={() => setLoadedFromShare(false)}
            className="ml-auto text-gray-400 hover:text-white text-xs"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-100 shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3">
        {/* Saved strategies dropdown */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <label
            htmlFor="blockly-saved-select"
            className="text-xs uppercase tracking-widest text-gray-400 shrink-0"
          >
            Saved
          </label>
          <select
            id="blockly-saved-select"
            className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 flex-1"
            value={activeId ?? ''}
            onChange={(e) => handleSelectSaved(e.target.value)}
          >
            <option value="">— unsaved —</option>
            {savedList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Save (overwrite) — only shown when a slot is active */}
        {activeItem && (
          <button onClick={handleSave} className={btnPrimary} title="Overwrite current slot">
            Save
          </button>
        )}

        {/* Save as… — always shown */}
        <button onClick={handleSaveAs} className={btnSecondary} title="Save as a new named slot">
          Save as…
        </button>

        {/* Rename / Delete — only shown when a slot is active */}
        {activeItem && (
          <>
            <button onClick={handleRename} className={btnSecondary} title="Rename this strategy">
              Rename
            </button>
            <button onClick={handleDelete} className={btnDanger} title="Delete this strategy">
              Delete
            </button>
          </>
        )}

        {/* Visual separator */}
        <span className="hidden sm:block h-5 w-px bg-gray-700" aria-hidden />

        {/* Export / Import */}
        <button
          onClick={handleExport}
          className={btnSecondary}
          title="Export all saved strategies to a JSON file"
        >
          Export JSON
        </button>
        <button
          onClick={handleImportClick}
          className={btnSecondary}
          title="Import strategies from a JSON file (merge)"
        >
          Import JSON
        </button>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />

        {/* Share link */}
        <button
          onClick={() => void handleCopyShareLink()}
          className={btnSecondary}
          title="Copy a shareable URL for the current workspace"
        >
          Copy share link
        </button>
      </div>

      {/* ── Blockly canvas (size unchanged) ── */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '520px' }}
        className="rounded-xl border border-gray-700 bg-gray-900"
      />
    </div>
  );
}
