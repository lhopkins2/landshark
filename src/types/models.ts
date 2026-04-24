export interface DocumentFolder {
  id: string;
  name: string;
  description: string;
  document_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  chain_of_title: string | null;
  chain_of_title_address?: string;
  folder: string | null;
  folder_name: string | null;
  file: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  tract_number: string;
  last_record_holder: string;
  description: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  download_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface FormTemplate {
  id: string;
  name: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  description: string;
  custom_prompt: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type AIProvider = "anthropic" | "openai" | "gemini";

export interface UserAnalysisSettings {
  id: string;
  default_provider: AIProvider;
  default_model: string;
  anthropic_api_key_display: string;
  openai_api_key_display: string;
  gemini_api_key_display: string;
  updated_at: string;
}

type AnalysisStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type AnalysisOrder = "chronological" | "reverse_chronological";

export type OutputFormat = "pdf" | "docx";

type AnalysisProgressStep =
  | "queued"
  | "extracting_text"
  | "building_prompt"
  | "calling_ai"
  | "generating_document"
  | "complete"
  | "failed";

export interface COTAnalysis {
  id: string;
  document: string | null;
  document_name: string | null;
  form_template: string | null;
  form_template_name: string | null;
  analysis_order: AnalysisOrder;
  output_format: OutputFormat;
  status: AnalysisStatus;
  ai_provider: string;
  ai_model: string;
  result_text: string;
  error_message: string;
  generated_document: string | null;
  generated_document_name: string | null;
  generated_document_url: string | null;
  progress_step: AnalysisProgressStep;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = "admin" | "operator";

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_verified: boolean;
  is_developer: boolean;
  role: UserRole | null;
  organization_id: string | null;
  organization_name: string | null;
  has_api_key_access: boolean;
}

export interface OrgMember {
  id: string;
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  has_api_key_access: boolean;
  is_active: boolean;
  is_developer: boolean;
  created_at: string;
}

export interface COTAnalysisDebug extends COTAnalysis {
  prompt_text: string;
}
