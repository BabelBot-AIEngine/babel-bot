export interface CompletionCode {
  code: string;
  code_type: string;
  actions: CompletionAction[];
}

export interface CompletionAction {
  action: "MANUALLY_REVIEW" | "AUTOMATICALLY_APPROVE" | "AUTOMATICALLY_REJECT";
}

export interface SubmissionsConfig {
  rejection_categories?: string[];
  max_submissions_per_participant?: number;
}

export interface CreateStudyRequest {
  internal_name: string;
  name: string;
  description: string;
  completion_codes: CompletionCode[];
  external_study_url: string;
  total_available_places: number;
  reward: number;
  device_compatibility: ("desktop" | "mobile" | "tablet")[];
  estimated_completion_time: number;
  maximum_allowed_time: number;
  study_type: "SINGLE" | "MULTI";
  publish_at: string | null;
  submissions_config?: SubmissionsConfig;
  workspace_id?: string;
  prolific_id_option?: "required" | "not_required" | "question";
  peripheral_requirements?: string[];
  selected_location?: string[];
  completion_option?: "code" | "url";
  quota_requirements?: any[];
  project?: string;
  filter_set_id?: string;
}

export interface Study {
  id: string;
  name: string;
  internal_name: string;
  description: string;
  external_study_url: string;
  total_available_places: number;
  reward: number;
  status: "UNPUBLISHED" | "ACTIVE" | "PAUSED" | "COMPLETED";
  completion_codes: CompletionCode[];
  device_compatibility: string[];
  estimated_completion_time: number;
  maximum_allowed_time: number;
  study_type: string;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  participant: string;
  study: string;
  status:
    | "RESERVED"
    | "ACTIVE"
    | "AWAITING_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "RETURNED"
    | "TIMED_OUT";
  reward: number;
  time_taken: number;
  completed_at: string | null;
  started_at: string;
  created_at: string;
  updated_at: string;
}

export interface StudyTransitionRequest {
  action: "PUBLISH" | "PAUSE" | "STOP";
}

export interface CreateDatasetRequest {
  workspace_id: string;
  name: string;
}

export interface Dataset {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetStatus {
  status: "UNINITIALISED" | "PROCESSING" | "READY" | "ERROR";
}

export interface TaskDetails {
  task_name: string;
  task_introduction: string;
  task_steps: string;
}

export interface CreateBatchRequest {
  workspace_id: string;
  name: string;
  dataset_id: string;
  task_details: TaskDetails;
}

export interface Batch {
  id: string;
  workspace_id: string;
  name: string;
  dataset_id: string;
  task_details: TaskDetails;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UploadUrlResponse {
  upload_url: string;
  download_url: string;
}

export interface InstructionOption {
  label: string;
  value: string;
  heading?: string;
}

export interface Instruction {
  type: "free_text" | "multiple_choice" | "multiple_choice_with_free_text";
  description: string;
  options?: InstructionOption[];
  answer_limit?: number;
}

export interface CreateBatchInstructionsRequest {
  instructions: Instruction[];
}

export interface BatchInstructions {
  id: string;
  batch_id: string;
  instructions: Instruction[];
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceRequest {
  title: string;
}

export interface Workspace {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
