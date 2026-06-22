'use client';

import { useEffect, useRef, useCallback } from 'react';
import { DEFAULT_BLOCKLY_WORKSPACE } from '@/lib/blockly/compile';
import { buildToolbox } from '@/lib/blockly/toolbox';

const LS_BLOCKLY_KEY = 'strat-sim:blockly:v1';

export interface BlocklyBuilderProps {
  /** Called with the serialised workspace JSON whenever the workspace changes. */
  onChange: (json: object) => void;
}

/**
 * Mounts a Blockly workspace for visual strategy editing.
 *
 * Dynamically imports the `blockly` package to avoid SSR issues.
 * The parent should render this via `next/dynamic` with `{ ssr: false }`.
 */
export default function BlocklyBuilder({ onChange }: BlocklyBuilderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaceRef = useRef<any>(null);

  const loadSaved = useCallback((): object => {
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

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    void (async () => {
      // Dynamic import keeps Blockly out of the SSR bundle
      const Blockly = await import('blockly');
      const { defineBlocks } = await import('@/lib/blockly/blocks');

      if (disposed || !containerRef.current) return;

      defineBlocks(Blockly);

      const workspace = Blockly.inject(containerRef.current, {
        toolbox: buildToolbox(),
        scrollbars: true,
        trashcan: true,
        theme: Blockly.Themes?.Dark ?? undefined,
      });

      workspaceRef.current = workspace;

      // Load persisted or default workspace
      const saved = loadSaved();
      try {
        Blockly.serialization.workspaces.load(saved, workspace);
      } catch {
        // If saved state is malformed, load the default
        try {
          Blockly.serialization.workspaces.load(
            DEFAULT_BLOCKLY_WORKSPACE,
            workspace,
          );
        } catch {
          // If even default fails, start empty
        }
      }

      // Emit initial state
      const initial = Blockly.serialization.workspaces.save(workspace);
      onChange(initial);

      // Listen for changes
      workspace.addChangeListener(() => {
        const json = Blockly.serialization.workspaces.save(workspace);
        // Persist to localStorage
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
    };
  }, [loadSaved, onChange]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '520px' }}
      className="rounded-xl border border-gray-700 bg-gray-900"
    />
  );
}
