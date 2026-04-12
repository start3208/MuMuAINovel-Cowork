export interface WorkspaceSummary {
  name: string;
  path: string;
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
