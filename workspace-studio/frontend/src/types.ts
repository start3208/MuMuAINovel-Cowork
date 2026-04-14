export interface WorkspaceSummary {
  name: string;
  path: string;
  container_path?: string;
  project_title: string | null;
  source_project_id?: string | null;
  version: string;
  valid: boolean;
  warnings: string[];
  statistics: Record<string, number>;
  updated_at: string;
}

export interface WorkspaceListResponse {
  total: number;
  items: WorkspaceSummary[];
}

export interface BackupManifest {
  backup_id: string;
  source_type: string;
  project_id: string;
  project_title: string;
  workspace_name?: string | null;
  reason: string;
  created_at: string;
  payload_path: string;
  statistics: Record<string, any>;
}

export interface BackupListResponse {
  total: number;
  items: BackupManifest[];
}

export interface MumuProject {
  id: string;
  title: string;
  status: string;
  chapter_count?: number | null;
  current_words?: number;
  updated_at: string;
}

export interface MumuProjectListResponse {
  total: number;
  items: MumuProject[];
}

export interface ImportValidationResult {
  valid: boolean;
  version: string;
  project_name?: string | null;
  statistics: Record<string, number>;
  errors: string[];
  warnings: string[];
}

export interface SyncResult {
  backup_path: string;
  result: {
    success: boolean;
    project_id?: string | null;
    message: string;
    statistics: Record<string, number>;
    warnings: string[];
  };
}

export interface ProjectExportData {
  version: string;
  export_time: string;
  source_project_id?: string | null;
  project: Record<string, any>;
  chapters: Array<Record<string, any>>;
  characters: Array<Record<string, any>>;
  outlines: Array<Record<string, any>>;
  relationships: Array<Record<string, any>>;
  organizations: Array<Record<string, any>>;
  organization_members: Array<Record<string, any>>;
  writing_styles: Array<Record<string, any>>;
  generation_history: Array<Record<string, any>>;
  careers: Array<Record<string, any>>;
  character_careers: Array<Record<string, any>>;
  story_memories: Array<Record<string, any>>;
  plot_analysis: Array<Record<string, any>>;
  foreshadows: Array<Record<string, any>>;
  project_default_style?: Record<string, any> | null;
}

export interface WorkspaceCharacter {
  id?: string;
  name: string;
  age?: string;
  gender?: string;
  is_organization?: boolean;
  role_type?: string;
  personality?: string;
  background?: string;
  appearance?: string;
  relationships?: string;
  traits?: string[] | string;
  organization_type?: string;
  organization_purpose?: string;
  organization_members?: string;
  avatar_url?: string;
  main_career_id?: string;
  main_career_stage?: number;
  sub_careers?: string;
  power_level?: number;
  location?: string;
  motto?: string;
  color?: string;
  created_at?: string;
}

export interface StoryMemoryRecord {
  id?: string | null;
  chapter_title?: string | null;
  chapter_id?: string | null;
  memory_type: string;
  title?: string | null;
  content: string;
  full_context?: string | null;
  related_characters?: string[] | null;
  related_locations?: string[] | null;
  tags?: string[] | null;
  importance_score?: number;
  story_timeline?: number;
  chapter_position?: number;
  text_length?: number;
  is_foreshadow?: number;
  foreshadow_strength?: number | null;
  created_at?: string | null;
}

export interface RemoteMemoryListResponse {
  success: boolean;
  memories: StoryMemoryRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface RemoteMemorySearchHit {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
  distance: number;
}

export interface RemoteMemorySearchResponse {
  success: boolean;
  query: string;
  memories: RemoteMemorySearchHit[];
  total: number;
}

export interface WorkspaceMemoryDiffItem {
  id: string;
  title: string;
  memory_type: string;
  changed_fields: string[];
  local: StoryMemoryRecord;
  remote: StoryMemoryRecord;
}

export interface WorkspaceMemoryDiffResponse {
  project_id: string;
  summary: {
    local_total: number;
    remote_total: number;
    local_missing_id: number;
    remote_missing_id: number;
    local_only: number;
    remote_only: number;
    changed: number;
  };
  local_missing_id: StoryMemoryRecord[];
  remote_missing_id: StoryMemoryRecord[];
  local_only: StoryMemoryRecord[];
  remote_only: StoryMemoryRecord[];
  changed: WorkspaceMemoryDiffItem[];
}
