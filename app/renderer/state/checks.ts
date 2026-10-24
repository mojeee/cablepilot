// The electrical rule check for the open project: computed from the project object, cached there
// (shared/checks.ts is incremental per page), so every component that asks gets the same result.
import { useMemo } from 'react';
import { runChecks, type CheckResult } from '@shared/checks';
import { pick } from '@shared/drawingText';
import type { TextCtx } from '@shared/checkText';
import { useEditor } from './editor';

export function useChecks(): CheckResult {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  return useMemo(() => runChecks(project, lib), [project, lib]);
}

/** Page names for the texts of findings: "08 Alarm relays". */
export function usePageNames(): TextCtx {
  const project = useEditor((s) => s.history.present);
  return useMemo(() => ({
    pageName: (id: string) => {
      const i = project.pages.findIndex((p) => p.id === id);
      return i < 0 ? '?' : `${String(i + 1).padStart(2, '0')} ${pick(project.pages[i].title, project.settings.drawingLanguage)}`.trim();
    },
  }), [project]);
}
