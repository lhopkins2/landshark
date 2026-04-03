export const CLIENT_TYPES = {
  law_firm: "Law Firm",
  lender: "Lender",
  real_estate_agency: "Real Estate Agency",
  individual: "Individual",
  other: "Other",
} as const;

export const PROJECT_STATUSES = {
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
} as const;

export const CHAIN_STATUSES = {
  pending: "Pending",
  in_progress: "In Progress",
  complete: "Complete",
} as const;

export const ANALYSIS_ORDERS = {
  chronological: "Chronological Order",
  reverse_chronological: "Reverse Chronological Order",
} as const;

export const AI_PROVIDERS = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  gemini: "Google (Gemini)",
} as const;

export const AI_MODELS: Record<string, Record<string, string>> = {
  anthropic: {
    "claude-sonnet-4-20250514": "Claude Sonnet 4",
    "claude-opus-4-20250514": "Claude Opus 4",
    "claude-haiku-4-20250414": "Claude Haiku 4",
  },
  openai: {
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "o3-mini": "o3 Mini",
  },
  gemini: {
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
  },
} as const;

export const ANALYSIS_STATUSES = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export const PROGRESS_STEPS = {
  queued: { label: "Queued", description: "Waiting to start..." },
  extracting_text: { label: "Extracting Text", description: "Parsing your document..." },
  building_prompt: { label: "Building Prompt", description: "Constructing AI instructions..." },
  calling_ai: { label: "Calling AI", description: "Waiting for AI response..." },
  generating_document: { label: "Generating Document", description: "Creating output file..." },
  complete: { label: "Complete", description: "Analysis finished!" },
  failed: { label: "Failed", description: "Something went wrong." },
  cancelled: { label: "Cancelled", description: "Analysis was cancelled." },
} as const;

export const PROGRESS_STEP_ORDER = [
  "extracting_text",
  "building_prompt",
  "calling_ai",
  "generating_document",
  "complete",
] as const;

