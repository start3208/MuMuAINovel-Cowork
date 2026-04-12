import { createContext, useContext } from 'react';
import type { ProjectExportData, WorkspaceSummary } from './types';

export interface WorkspaceContextValue {
  workspaceName: string;
  summary: WorkspaceSummary;
  data: ProjectExportData;
  reload: () => Promise<void>;
  saveData: (nextData: ProjectExportData) => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error('useWorkspaceContext must be used inside WorkspaceContext');
  }
  return value;
}
