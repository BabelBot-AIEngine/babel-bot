import { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { WebhookVerificationService } from "../../src/services/webhookVerification";
import { ProlificWebhookHandler } from "../../src/services/prolificWebhookHandler";
import { BabelWebhookHandler } from "../../src/services/babelWebhookHandler";
import { WebhookRequest, WebhookSource } from "../../src/types/webhooks";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
      message: "Only POST requests are accepted",
    });
  }

  try {
    // Parse request headers and body
    const headers = req.headers as Record<string, string>;
    const body = req.body;

    // Detect webhook source
    const source = WebhookVerificationService.detectWebhookSource(headers);

    if (source === "unknown") {
      console.log("Unknown webhook source:", { headers: Object.keys(headers) });
      return res.status(400).json({
        error: "Bad Request",
        message: "Unable to identify webhook source",
      });
    }

    console.log("Webhook received:", {
      source,
      userAgent: headers["user-agent"],
      contentType: headers["content-type"],
      timestamp: new Date().toISOString(),
    });

    // Process webhook based on source
    if (source === "prolific") {
      await handleProlificWebhook(req, res, headers, body);
    } else if (source === "babel") {
      await handleBabelWebhook(req, res, headers, body);
    }
  } catch (error) {
    console.error("Webhook processing error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to process webhook",
    });
  }
}

async function handleProlificWebhook(
  req: VercelRequest,
  res: VercelResponse,
  headers: Record<string, string>,
  body: any
): Promise<void> {
  const signature = headers["x-prolific-request-signature"];
  const timestamp = headers["x-prolific-request-timestamp"];
  const secret = process.env.PROLIFIC_WEBHOOK_SECRET;

  if (!secret) {
    console.error(
      "PROLIFIC_WEBHOOK_SECRET environment variable not configured"
    );
    res.status(500).json({
      error: "Configuration Error",
      message: "Webhook secret not configured",
    });
    return;
  }

  if (!signature || !timestamp) {
    console.error("Missing required Prolific webhook headers:", {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
    });
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing required headers",
    });
    return;
  }

  // Verify webhook signature
  const rawBody = JSON.stringify(body);
  const verification = WebhookVerificationService.verifyProlificWebhook(
    rawBody,
    signature,
    timestamp,
    secret
  );

  if (!verification.isValid) {
    console.error("Prolific webhook verification failed:", verification.error);
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid signature",
    });
    return;
  }

  // Validate payload structure
  if (!ProlificWebhookHandler.validatePayload(body)) {
    console.error("Invalid Prolific webhook payload structure:", body);
    res.status(400).json({
      error: "Bad Request",
      message: "Invalid payload structure",
    });
    return;
  }

  // Respond immediately after validation
  res.status(200).json({
    success: true,
    message: "Webhook received and will be processed",
  });

  // Process the webhook asynchronously using waitUntil
  waitUntil(
    (async () => {
      try {
        await ProlificWebhookHandler.handleWebhook(body);
        console.log("Prolific webhook processed successfully:", {
          event: body.event_type,
          studyId: body.study?.id,
          status: body.study?.status,
        });
      } catch (error) {
        console.error("Prolific webhook handler error:", {
          error: error instanceof Error ? error.message : "Unknown error",
          studyId: body.study?.id,
        });
        // Note: We've already responded to the webhook sender, so this error
        // doesn't affect the webhook delivery status
      }
    })()
  );
}

async function handleBabelWebhook(
  req: VercelRequest,
  res: VercelResponse,
  headers: Record<string, string>,
  body: any
): Promise<void> {
  console.log("[WEBHOOK-ENDPOINT] 📨 Received Babel webhook");
  console.log("[WEBHOOK-ENDPOINT] Headers:", Object.keys(headers));
  console.log("[WEBHOOK-ENDPOINT] Body:", JSON.stringify(body, null, 2));

  const signature = headers["x-babel-request-signature"];
  const timestamp = headers["x-babel-request-timestamp"];
  const secret = process.env.BABEL_WEBHOOK_SECRET;

  console.log("[WEBHOOK-ENDPOINT] 🔍 Validating webhook headers");
  console.log("[WEBHOOK-ENDPOINT] Has signature:", !!signature);
  console.log("[WEBHOOK-ENDPOINT] Has timestamp:", !!timestamp);
  console.log("[WEBHOOK-ENDPOINT] Has secret:", !!secret);

  // Local development bypass
  const isLocalDev =
    process.env.NODE_ENV === "development" || !process.env.VERCEL;
  if (isLocalDev) {
    console.log(
      "[WEBHOOK-ENDPOINT] 🏠 Local development mode - bypassing webhook authentication"
    );
  }

  if (!secret && !isLocalDev) {
    console.error(
      "[WEBHOOK-ENDPOINT] ❌ BABEL_WEBHOOK_SECRET environment variable not configured"
    );
    res.status(500).json({
      error: "Configuration Error",
      message: "Webhook secret not configured",
    });
    return;
  }

  if ((!signature || !timestamp) && !isLocalDev) {
    console.error(
      "[WEBHOOK-ENDPOINT] ❌ Missing required Babel webhook headers:",
      {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
      }
    );
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing required headers",
    });
    return;
  }

  // Verify webhook signature (skip in local development)
  if (!isLocalDev) {
    console.log("[WEBHOOK-ENDPOINT] 🔐 Verifying webhook signature");
    const rawBody = JSON.stringify(body);
    const verification = WebhookVerificationService.verifyBabelWebhook(
      rawBody,
      signature!,
      timestamp!,
      secret!
    );

    if (!verification.isValid) {
      console.error(
        "[WEBHOOK-ENDPOINT] ❌ Babel webhook verification failed:",
        verification.error
      );
      res.status(401).json({
        error: "Unauthorized",
        message: verification.error || "Invalid signature",
      });
      return;
    }
    console.log("[WEBHOOK-ENDPOINT] ✅ Webhook signature verified");
  } else {
    console.log(
      "[WEBHOOK-ENDPOINT] 🏠 Skipping webhook signature verification (local dev)"
    );
  }

  // Validate payload structure
  console.log("[WEBHOOK-ENDPOINT] 🔍 Validating payload structure");
  if (!BabelWebhookHandler.validatePayload(body)) {
    console.error(
      "[WEBHOOK-ENDPOINT] ❌ Invalid Babel webhook payload structure:",
      body
    );
    res.status(400).json({
      error: "Bad Request",
      message: "Invalid payload structure",
    });
    return;
  }
  console.log("[WEBHOOK-ENDPOINT] ✅ Payload structure validated");

  // If this is already a granular path (/api/webhooks/:state/:taskId/...), process directly
  const requestPath = (req.url || "").split("?")[0];
  const granularMatch = requestPath.match(
    /^\/api\/webhooks\/([a-z_]+)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/
  );

  // Respond immediately to acknowledge receipt
  console.log("[WEBHOOK-ENDPOINT] 📤 Sending immediate 200 OK response");
  res.status(200).json({
    success: true,
    message: "Webhook received and processing started",
  });

  // Process the webhook asynchronously after responding using waitUntil
  console.log(
    "[WEBHOOK-ENDPOINT] 🚀 Starting async webhook processing with waitUntil"
  );

  waitUntil(
    (async () => {
      try {
        const disableSelfForward =
          (
            process.env.BABEL_WEBHOOK_DISABLE_SELF_FORWARD || "false"
          ).toLowerCase() === "true";

        if (granularMatch || disableSelfForward) {
          // Already granular; process payload
          await BabelWebhookHandler.handleWebhook(body);
        } else {
          // Forward to granular path to break perceived self-loop
          await forwardToGranularPath(body);
        }
        console.log(
          "[WEBHOOK-ENDPOINT] ✅ Async webhook processing completed successfully"
        );
      } catch (error) {
        console.error(
          "[WEBHOOK-ENDPOINT] ❌ Async webhook processing failed:",
          error
        );
        // Don't re-throw - webhook processing failure shouldn't affect response
        // The graceful degradation we implemented will handle QStash quota issues
      }
    })()
  );
}

async function forwardToGranularPath(body: any): Promise<void> {
  const event: string | undefined = body?.event;
  if (!event) return;
  let state: string | undefined;
  switch (event) {
    // translate state
    case "task.created":
    case "language_subtask.created":
    case "subtask.translation.started":
      state = "translate";
      break;
    // verify state
    case "subtask.translation.completed":
    case "subtask.llm_verification.started":
      state = "verify";
      break;
    case "subtask.llm_verification.completed": {
      const needsHumanReview = !!body?.data?.needsHumanReview;
      state = needsHumanReview ? "review" : "finalize";
      break;
    }
    case "subtask.llm_reverification.started":
      state = "verify";
      break;
    case "subtask.llm_reverification.completed": {
      const needsAnotherIteration = !!body?.data?.needsAnotherIteration;
      state = needsAnotherIteration ? "review" : "finalize";
      break;
    }
    // review state
    case "review_batch.created":
    case "prolific_study.created":
    case "prolific_study.published":
    case "prolific_results.received":
    case "subtask.iteration.continuing":
      state = "review";
      break;
    // finalize state
    case "subtask.finalized":
    case "task.completed":
      state = "finalize";
      break;
    default:
      state = undefined;
  }
  if (!state) {
    // Fallback to direct handler for unknown events
    await BabelWebhookHandler.handleWebhook(body);
    return;
  }

  // Build absolute URL
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `${process.env.BASE_URL || "http://localhost:3000"}`;
  const taskId = encodeURIComponent(body?.taskId || "unknown");
  const lang = body?.data?.language
    ? `/${encodeURIComponent(body.data.language)}`
    : "";
  const iter = body?.data?.currentIteration
    ? `/${encodeURIComponent(body.data.currentIteration)}`
    : "";
  const url = `${baseUrl}/api/webhooks/${state}/${taskId}${lang}${iter}`;

  // Re-sign the body for internal hop
  const secret = process.env.BABEL_WEBHOOK_SECRET!;
  const rawBody = JSON.stringify(body);
  const timestamp = (
    body?.timestamp ?? Math.floor(Date.now() / 1000)
  ).toString();
  const signature = WebhookVerificationService.generateBabelSignature(
    rawBody,
    timestamp,
    secret
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Babel-Request-Signature": signature,
    "X-Babel-Request-Timestamp": timestamp,
    "User-Agent": "BabelBot-Webhook-Forwarder/1.0",
  };

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: rawBody,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `[WEBHOOK-ENDPOINT] State forward failed ${response.status}: ${text}`
    );
    // Fallback to direct handler
    await BabelWebhookHandler.handleWebhook(body);
  }
}
