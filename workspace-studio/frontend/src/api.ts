import axios from 'axios';
import type {
  ImportValidationResult,
  MumuProjectListResponse,
  ProjectExportData,
  SyncResult,
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
  exportWorkspace: (projectId: string, workspaceName?: string) =>
    api.post<any, WorkspaceSummary>('/mumu/export-workspace', {
      project_id: projectId,
      workspace_name: workspaceName || null,
    }),
  getWorkspaces: () => api.get<any, WorkspaceListResponse>('/workspaces'),
  getWorkspaceSummary: (name: string) => api.get<any, WorkspaceSummary>(`/workspaces/${encodeURIComponent(name)}`),
  getWorkspaceData: (name: string) => api.get<any, ProjectExportData>(`/workspaces/${encodeURIComponent(name)}/data`),
  saveWorkspaceData: (name: string, data: ProjectExportData) =>
    api.put<any, WorkspaceSummary>(`/workspaces/${encodeURIComponent(name)}/data`, { data }),
  validateWorkspace: (name: string) =>
    api.post<any, ImportValidationResult>(`/workspaces/${encodeURIComponent(name)}/validate`),
  syncWorkspace: (name: string, targetProjectId?: string) =>
    api.post<any, SyncResult>(`/workspaces/${encodeURIComponent(name)}/sync`, {
      target_project_id: targetProjectId || null,
    }),
  deleteWorkspace: (name: string) => api.delete<any, { message: string }>(`/workspaces/${encodeURIComponent(name)}`),
};
