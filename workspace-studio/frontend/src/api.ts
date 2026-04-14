import axios from 'axios';
import type {
  BackupListResponse,
  ImportValidationResult,
  MumuProjectListResponse,
  ProjectExportData,
  RemoteMemoryListResponse,
  RemoteMemorySearchResponse,
  SyncResult,
  WorkspaceMemoryDiffResponse,
  WorkspaceListResponse,
  WorkspaceSummary,
} from './types';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const detail = error?.response?.data?.detail;
    if (detail) {
      return Promise.reject(typeof detail === 'string' ? new Error(detail) : new Error(JSON.stringify(detail)));
    }
    return Promise.reject(error);
  },
);

export const studioApi = {
  getMumuProjects: () => api.get<any, MumuProjectListResponse>('/mumu/projects'),
  exportWorkspace: (projectId: string, workspaceName?: string, overwritePromptFiles = false) =>
    api.post<any, WorkspaceSummary>('/mumu/export-workspace', {
      project_id: projectId,
      workspace_name: workspaceName || null,
      overwrite_prompt_files: overwritePromptFiles,
      confirmed: true,
    }),
  getWorkspaces: () => api.get<any, WorkspaceListResponse>('/workspaces'),
  getWorkspaceSummary: (name: string) => api.get<any, WorkspaceSummary>(`/workspaces/${encodeURIComponent(name)}`),
  getWorkspaceData: (name: string) => api.get<any, ProjectExportData>(`/workspaces/${encodeURIComponent(name)}/data`),
  saveWorkspaceData: (name: string, data: ProjectExportData) =>
    api.put<any, WorkspaceSummary>(`/workspaces/${encodeURIComponent(name)}/data`, { data }),
  validateWorkspace: (name: string) =>
    api.post<any, ImportValidationResult>(`/workspaces/${encodeURIComponent(name)}/validate`),
  getRemoteWorkspaceMemories: (name: string, page = 1, pageSize = 50, memoryType?: string) =>
    api.get<any, RemoteMemoryListResponse>(`/workspaces/${encodeURIComponent(name)}/memories/remote`, {
      params: {
        page,
        page_size: pageSize,
        memory_type: memoryType || undefined,
      },
    }),
  searchWorkspaceMemories: (
    name: string,
    payload: { query: string; memory_types?: string[]; limit?: number; min_importance?: number },
  ) => api.post<any, RemoteMemorySearchResponse>(`/workspaces/${encodeURIComponent(name)}/memories/search`, payload),
  getWorkspaceMemoryDiff: (name: string) =>
    api.get<any, WorkspaceMemoryDiffResponse>(`/workspaces/${encodeURIComponent(name)}/memories/diff`),
  rebuildRemoteWorkspaceMemoryIndex: (name: string) =>
    api.post<any, { success: boolean; project_id: string; rebuilt_count: number }>(
      `/workspaces/${encodeURIComponent(name)}/memories/reindex-remote`,
    ),
  syncWorkspace: (name: string, targetProjectId?: string) =>
    api.post<any, SyncResult>(`/workspaces/${encodeURIComponent(name)}/sync`, {
      target_project_id: targetProjectId || null,
      confirmed: true,
    }),
  deleteWorkspace: (name: string) =>
    api.post<any, { message: string }>(`/workspaces/${encodeURIComponent(name)}/delete`, { confirmed: true }),
  getBackups: (sourceType?: string, projectId?: string) =>
    api.get<any, BackupListResponse>('/backups', {
      params: {
        source_type: sourceType || undefined,
        project_id: projectId || undefined,
      },
    }),
  importBackupToWorkspace: (backupId: string, workspaceName?: string) =>
    api.post<any, WorkspaceSummary>('/backups/import-to-workspace', {
      backup_id: backupId,
      workspace_name: workspaceName || null,
      confirmed: true,
    }),
  cleanupBackups: (keepLatest = 5) =>
    api.post<any, { success: boolean; removed: number; keep_latest: number }>('/backups/cleanup', {
      confirmed: true,
      keep_latest: keepLatest,
    }),
};
