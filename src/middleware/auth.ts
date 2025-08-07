import { Request, Response, NextFunction } from "express";
import { clerkClient } from "@clerk/clerk-sdk-node";

// Extend Request type to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        emailAddress: string;
        isAuthorized: boolean;
      };
    }
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Local development bypass
    const isLocalDev =
      process.env.NODE_ENV === "development" || !process.env.VERCEL;
    if (isLocalDev) {
      console.log(
        "[AUTH] 🏠 Local development mode - bypassing authentication"
      );
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized: Missing or invalid authorization header",
        code: "MISSING_AUTH_TOKEN",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    try {
      // Verify the JWT token with Clerk
      const verifiedToken = await clerkClient.verifyToken(token);

      if (!verifiedToken) {
        return res.status(401).json({
          error: "Unauthorized: Invalid token",
          code: "INVALID_TOKEN",
        });
      }

      // Get user details from Clerk
      const user = await clerkClient.users.getUser(verifiedToken.sub);

      if (!user) {
        return res.status(401).json({
          error: "Unauthorized: User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // Check if user has a verified @prolific.com email
      const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId
      );

      if (
        !primaryEmail ||
        !primaryEmail.emailAddress.endsWith("@prolific.com")
      ) {
        return res.status(403).json({
          error:
            "Forbidden: Access restricted to @prolific.com email addresses",
          code: "INVALID_DOMAIN",
          currentEmail: primaryEmail?.emailAddress || "unknown",
        });
      }

      // Add user info to request for use in route handlers
      req.user = {
        id: user.id,
        emailAddress: primaryEmail.emailAddress,
        isAuthorized: true,
      };

      next();
    } catch (clerkError) {
      console.error("Clerk verification error:", clerkError);
      return res.status(401).json({
        error: "Unauthorized: Token verification failed",
        code: "TOKEN_VERIFICATION_FAILED",
      });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      error: "Internal server error during authentication",
      code: "AUTH_MIDDLEWARE_ERROR",
    });
  }
};
