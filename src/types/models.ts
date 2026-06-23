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
  /** Set when this document is the generated output of a COTAnalysis. Gates "Export". */
  analysis_id: string | null;
  /**
   * For analyzed-output docs, the source Document the analysis was produced from.
   * Lets the UI redirect "history" views from the generated doc to the canonical
   * source doc (which actually owns the analyses list). Null on source docs and
   * on outputs whose source has been deleted.
   */
  source_document_id: string | null;
  /** Prefill values for the Analyze form's report-header fields (from chain/document + current user). */
  suggested_header?: COTHeaderFields;
  created_at: string;
  updated_at: string;
}

/** Operator-editable COT report-header fields. */
export interface COTHeaderFields {
  tax_id: string;
  tract_number: string;
  record_owner: string;
  address: string;
  acres: string;
  title_agent: string;
  legal_description: string;
  /** Read-only context from the chain (not edited on the form). */
  county?: string;
  state?: string;
  county_state?: string;
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

export type AnalysisStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
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

/** A named party on an instrument (grantor or grantee). Mirrors backend `PartyDict`. */
export interface Party {
  name: string;
}

/** Recording-stamp metadata on a parsed instrument. */
export interface RecordingInfo {
  reception_number: string;
  book: string;
  page: string;
}

// Mirrors backend pipeline output; keep in sync with apps/analysis/services/instrument_format.py.
export interface ParsedInstrument {
  instrument_type: string;
  instrument_date: string;
  recording_date: string;
  recording_info: RecordingInfo;
  grantors: Party[];
  grantees: Party[];
  legal_description: string;
  subject_premises_relationship: "subject_premises" | "subject_premises_and_more" | "not_subject_premises" | "unknown";
  encumbrances_created: string[];
  encumbrances_released: string[];
  comments: string;
  start_page: number;
  end_page: number;
  notes: string[];
}

export interface PageStatus {
  page: number;
  status: "success" | "failed" | "unknown";
  error?: string;
}

export interface ParsedDocument {
  document_id: string;
  filename: string;
  total_pages: number;
  instruments: ParsedInstrument[];
  page_statuses: PageStatus[];
  notes: AnalysisNote[];
  usage: { input_tokens: number; output_tokens: number };
  error: string;
}

export interface AnalysisNote {
  source: "instrument" | "page" | "chain";
  page: number;
  text: string;
}

export interface ChainEventEntry {
  type: string;
  instrument: { index: number; instrument_type: string; instrument_date: string; start_page: number };
  description?: string;
}

export interface OpenQuestion {
  id: string;
  type: string;
  related_instrument_indexes: number[];
  question: string;
}

export interface ResolvedQuestion {
  id: string;
  resolution: string;
  reasoning: string;
}

export interface ChainEvents {
  events: ChainEventEntry[];
  open_questions: OpenQuestion[];
  resolved_questions: ResolvedQuestion[];
}

export type RevisionKind = "full_run" | "revision";

export interface RevisionRef {
  id: string;
  created_at: string;
  revision_instructions: string;
  status: AnalysisStatus;
}

export interface ReanalyzeInstrumentEdit {
  index: number;
  instrument: ParsedInstrument;
}

export interface ReanalyzePayload {
  instrument_edits?: ReanalyzeInstrumentEdit[];
  pages_to_rescan?: number[];
  user_instructions?: string;
  provider?: string;
  model?: string;
  output_format?: OutputFormat;
}

export interface COTAnalysis {
  id: string;
  document: string | null;
  document_name: string | null;
  /** True when the source Document was deleted after this analysis ran. */
  document_deleted: boolean;
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
  // pipeline_version is empty on rows from before the structured pipeline.
  pipeline_version: string;
  parsed_documents: ParsedDocument[] | null;
  chain_events: ChainEvents | null;
  narrative: string;
  notes: AnalysisNote[] | null;
  failed_pages_count: number;
  parent_analysis: string | null;
  revision_instructions: string;
  revision_kind: RevisionKind;
  revisions: RevisionRef[];
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
