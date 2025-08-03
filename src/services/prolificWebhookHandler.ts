import { ProlificWebhookPayload } from '../types/webhooks';

export class ProlificWebhookHandler {
  static async handleWebhook(payload: ProlificWebhookPayload): Promise<void> {
    console.log('Processing Prolific webhook:', {
      event: payload.event_type,
      studyId: payload.study.id,
      status: payload.study.status,
      timestamp: payload.timestamp
    });

    switch (payload.study.status) {
      case 'AWAITING_REVIEW':
        await this.handleAwaitingReview(payload);
        break;
      case 'COMPLETED':
        await this.handleStudyCompleted(payload);
        break;
      case 'ACTIVE':
        await this.handleStudyActive(payload);
        break;
      case 'DRAFT':
        await this.handleStudyDraft(payload);
        break;
      case 'SCHEDULED':
        await this.handleStudyScheduled(payload);
        break;
      default:
        console.log(`Unhandled study status: ${payload.study.status}`);
    }
  }

  private static async handleAwaitingReview(payload: ProlificWebhookPayload): Promise<void> {
    console.log(`Study ${payload.study.id} is awaiting review - triggering next processing step`);
    
    // TODO: Implement logic to:
    // 1. Retrieve study data from Prolific
    // 2. Process participant responses
    // 3. Trigger next step in translation workflow
    // 4. Send internal webhook to update task status
  }

  private static async handleStudyCompleted(payload: ProlificWebhookPayload): Promise<void> {
    console.log(`Study ${payload.study.id} completed - retrieving study data`);
    
    // TODO: Implement logic to:
    // 1. Retrieve final study data and participant responses
    // 2. Process human review results
    // 3. Update translation task status to 'done'
    // 4. Send internal webhook with completion data
  }

  private static async handleStudyActive(payload: ProlificWebhookPayload): Promise<void> {
    console.log(`Study ${payload.study.id} is now active`);
    
    // TODO: Implement logic to:
    // 1. Update internal task status
    // 2. Monitor study progress
    // 3. Send status update webhook
  }

  private static async handleStudyDraft(payload: ProlificWebhookPayload): Promise<void> {
    console.log(`Study ${payload.study.id} is in draft status`);
    
    // TODO: Implement logic to handle draft status if needed
  }

  private static async handleStudyScheduled(payload: ProlificWebhookPayload): Promise<void> {
    console.log(`Study ${payload.study.id} is scheduled`);
    
    // TODO: Implement logic to:
    // 1. Update internal task status
    // 2. Prepare for study activation
    // 3. Send status update webhook
  }

  static validatePayload(payload: any): payload is ProlificWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    if (payload.event_type !== 'study.status.change') {
      return false;
    }

    if (!payload.study || typeof payload.study !== 'object') {
      return false;
    }

    if (!payload.study.id || typeof payload.study.id !== 'string') {
      return false;
    }

    const validStatuses = ['AWAITING_REVIEW', 'COMPLETED', 'ACTIVE', 'DRAFT', 'SCHEDULED'];
    if (!validStatuses.includes(payload.study.status)) {
      return false;
    }

    if (!payload.timestamp || typeof payload.timestamp !== 'string') {
      return false;
    }

    return true;
  }
}