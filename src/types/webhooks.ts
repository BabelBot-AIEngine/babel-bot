export interface ProlificWebhookPayload {
  event_type: "study.status.change";
  study: {
    id: string;
    status: "AWAITING_REVIEW" | "COMPLETED" | "ACTIVE" | "DRAFT" | "SCHEDULED";
    name?: string;
    description?: string;
    total_available_places?: number;
    places_taken?: number;
    completion_code?: string;
    completion_option?: string;
    reward?: number;
    currency?: string;
    average_reward_per_hour?: number;
    estimated_completion_time?: number;
    maximum_allowed_time?: number;
    created_date_time?: string;
    published_date_time?: string;
    completed_date_time?: string;
  };
  timestamp: string;
}

export interface BabelWebhookPayload {
  event: string;
  taskId: string;
  timestamp: number;
  data: any;
  _retryCount?: number;
  _originalAttemptTime?: number;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
}

export interface WebhookDeliveryOptions {
  maxRetries?: number;
  backoffDelays?: number[];
  timeout?: number;
}

export interface QStashWebhookPayload extends BabelWebhookPayload {
  _babelSignature: string;
  _babelTimestamp: number;
}

export type WebhookSource = "prolific" | "babel" | "unknown";

export interface WebhookRequest {
  headers: Record<string, string>;
  body: any;
  source: WebhookSource;
}