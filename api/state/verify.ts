import { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { WebhookVerificationService } from "../../src/services/webhookVerification";
import { BabelWebhookHandler } from "../../src/services/babelWebhookHandler";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
      message: "Only POST requests are accepted",
    });
  }

  try {
    const headers = req.headers as Record<string, string>;
    const body = req.body;

    const isLocalDev =
      process.env.NODE_ENV === "development" || !process.env.VERCEL;
    const signature = headers["x-babel-request-signature"];
    const timestamp = headers["x-babel-request-timestamp"];
    const secret = process.env.BABEL_WEBHOOK_SECRET;

    if (!secret && !isLocalDev) {
      res
        .status(500)
        .json({
          error: "Configuration Error",
          message: "Webhook secret not configured",
        });
      return;
    }

    if ((!signature || !timestamp) && !isLocalDev) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Missing required headers" });
      return;
    }

    if (!isLocalDev) {
      const rawBody = JSON.stringify(body);
      const verification = WebhookVerificationService.verifyBabelWebhook(
        rawBody,
        signature!,
        timestamp!,
        secret!
      );
      if (!verification.isValid) {
        res
          .status(401)
          .json({
            error: "Unauthorized",
            message: verification.error || "Invalid signature",
          });
        return;
      }
    }

    if (!BabelWebhookHandler.validatePayload(body)) {
      res
        .status(400)
        .json({ error: "Bad Request", message: "Invalid payload structure" });
      return;
    }

    res
      .status(200)
      .json({ success: true, message: "Verification state started" });

    waitUntil(
      (async () => {
        try {
          await BabelWebhookHandler.handleWebhook(body);
        } catch {}
      })()
    );
  } catch {
    return res
      .status(500)
      .json({
        error: "Internal Server Error",
        message: "Failed to process state",
      });
  }
}
