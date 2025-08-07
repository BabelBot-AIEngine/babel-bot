import React from "react";
import { Box, Typography, Chip } from "@mui/material";
import {
  HourglassEmpty as PendingIcon,
  Translate as TranslatingIcon,
  Psychology as VerificationIcon,
  Person as ReviewIcon,
  CheckCircle as DoneIcon,
  Error as FailedIcon,
} from "@mui/icons-material";
import { LanguageTaskStatus } from "../../types";

interface TranslationTimelineProps {
  currentStatus: LanguageTaskStatus | string; // Allow both legacy and enhanced statuses
  language: string;
  iterations?: Array<{
    iterationNumber: number;
    llmVerification?: { score?: number; completedAt?: string };
    humanReview?: { score?: number; completedAt?: string };
    llmReverification?: { score?: number; completedAt?: string };
    completedAt?: string;
  }>;
}

// Legacy progression states
const legacyStates: LanguageTaskStatus[] = [
  "pending",
  "translating",
  "llm_verification",
  "human_review",
  "done",
];

// Enhanced progression states (can include iterations)
const enhancedStates: string[] = [
  "pending",
  "translating",
  "translation_complete",
  "llm_verifying",
  "llm_verified",
  "review_ready",
  "review_queued",
  "review_active",
  "review_complete",
  "llm_reverifying",
  "iteration_complete",
  "finalized",
];

// Helper to determine if status is an enhanced status
const isEnhancedStatus = (status: string): boolean => {
  return (
    enhancedStates.includes(status) &&
    !(legacyStates as string[]).includes(status)
  );
};

const stateConfig = {
  // Legacy statuses
  pending: {
    label: "Pending",
    icon: PendingIcon,
    color: "#ef4444",
    bgColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  translating: {
    label: "Translating",
    icon: TranslatingIcon,
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fed7aa",
  },
  llm_verification: {
    label: "LLM Check",
    icon: VerificationIcon,
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  human_review: {
    label: "Human Review",
    icon: ReviewIcon,
    color: "#8b5cf6",
    bgColor: "#faf5ff",
    borderColor: "#ddd6fe",
  },
  done: {
    label: "Done",
    icon: DoneIcon,
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  failed: {
    label: "Failed",
    icon: FailedIcon,
    color: "#ef4444",
    bgColor: "#fef2f2",
    borderColor: "#fecaca",
  },

  // Enhanced task statuses
  processing: {
    label: "Processing",
    icon: TranslatingIcon,
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fed7aa",
  },
  translation_complete: {
    label: "Translation Done",
    icon: TranslatingIcon,
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  llm_verifying: {
    label: "LLM Verifying",
    icon: VerificationIcon,
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  llm_verified: {
    label: "LLM Verified",
    icon: VerificationIcon,
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  review_ready: {
    label: "Review Ready",
    icon: ReviewIcon,
    color: "#6b7280",
    bgColor: "#f9fafb",
    borderColor: "#d1d5db",
  },
  review_queued: {
    label: "Review Queued",
    icon: ReviewIcon,
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fed7aa",
  },
  review_active: {
    label: "Review Active",
    icon: ReviewIcon,
    color: "#8b5cf6",
    bgColor: "#faf5ff",
    borderColor: "#ddd6fe",
  },
  review_complete: {
    label: "Review Complete",
    icon: ReviewIcon,
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  llm_reverifying: {
    label: "Re-verifying",
    icon: VerificationIcon,
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  iteration_complete: {
    label: "Iteration Done",
    icon: DoneIcon,
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  finalized: {
    label: "Finalized",
    icon: DoneIcon,
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
};

const TranslationTimeline: React.FC<TranslationTimelineProps> = ({
  currentStatus,
  language,
  iterations,
}) => {
  const isFailed = currentStatus === "failed";
  const isEnhanced = isEnhancedStatus(currentStatus);

  // For enhanced statuses, render a compact iterative timeline when iterations are provided
  if (isEnhanced || !stateConfig[currentStatus]) {
    const config = stateConfig[currentStatus] || {
      label: currentStatus
        .replace("_", " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      icon: TranslatingIcon,
      color: "#6b7280",
      bgColor: "#f9fafb",
      borderColor: "#d1d5db",
    };

    const IconComponent = config.icon;

    return (
      <Box sx={{ my: 2 }}>
        <Typography
          variant="caption"
          sx={{ display: "block", mb: 1, fontWeight: 600, color: "#64748b" }}
        >
          Translation Status for {language}
        </Typography>

        {iterations && iterations.length > 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 2,
              background: "#f8fafc",
              border: `1px solid #e2e8f0`,
              borderRadius: 2,
            }}
          >
            {iterations.map((it, idx) => (
              <Box
                key={idx}
                sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
              >
                {/* Iteration Badge */}
                <Chip
                  label={`Iteration ${it.iterationNumber}`}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    background: "#e0e7ff",
                    color: "#3730a3",
                  }}
                />

                {/* Steps in this iteration */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {/* LLM Verify */}
                  <Chip
                    icon={<VerificationIcon sx={{ fontSize: 16 }} />}
                    label={it.llmVerification ? "LLM Check ✓" : "LLM Check"}
                    size="small"
                    sx={{
                      background: it.llmVerification ? "#dcfce7" : "#eff6ff",
                      color: it.llmVerification ? "#065f46" : "#1d4ed8",
                      border: `1px solid ${
                        it.llmVerification ? "#bbf7d0" : "#bfdbfe"
                      }`,
                    }}
                  />
                  {/* Human Review */}
                  <Chip
                    icon={<ReviewIcon sx={{ fontSize: 16 }} />}
                    label={it.humanReview ? "Human Review ✓" : "Human Review"}
                    size="small"
                    sx={{
                      background: it.humanReview ? "#ede9fe" : "#faf5ff",
                      color: "#6b21a8",
                      border: "1px solid #ddd6fe",
                    }}
                  />
                  {/* Re-verify */}
                  <Chip
                    icon={<VerificationIcon sx={{ fontSize: 16 }} />}
                    label={it.llmReverification ? "Re-check ✓" : "Re-check"}
                    size="small"
                    sx={{
                      background: it.llmReverification ? "#dcfce7" : "#eff6ff",
                      color: it.llmReverification ? "#065f46" : "#1d4ed8",
                      border: `1px solid ${
                        it.llmReverification ? "#bbf7d0" : "#bfdbfe"
                      }`,
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              p: 2,
              background: config.bgColor,
              border: `1px solid ${config.borderColor}`,
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: config.color,
                color: "white",
              }}
            >
              <IconComponent fontSize="small" />
            </Box>
            <Box>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: config.color }}
              >
                {config.label}
              </Typography>
              {currentStatus.includes("iteration") && (
                <Typography variant="caption" sx={{ color: "#6b7280" }}>
                  Review cycle complete
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  // Legacy timeline logic for standard statuses
  const getCurrentStateIndex = () => {
    if (currentStatus === "failed") {
      return -1; // Special case for failed
    }
    return (legacyStates as string[]).indexOf(currentStatus);
  };

  const currentIndex = getCurrentStateIndex();

  return (
    <Box sx={{ my: 2 }}>
      <Typography
        variant="caption"
        sx={{ display: "block", mb: 1, fontWeight: 600, color: "#64748b" }}
      >
        Translation Status for {language}
      </Typography>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 2,
          background: isFailed ? "#fef2f2" : "#f8fafc",
          border: `1px solid ${isFailed ? "#fecaca" : "#e2e8f0"}`,
          borderRadius: 2,
          overflow: "auto",
        }}
      >
        {/* Show progression through normal states */}
        {legacyStates.map((state, index) => {
          const config = stateConfig[state];
          const IconComponent = config.icon;
          const isCompleted = !isFailed && index < currentIndex;
          const isCurrent = !isFailed && index === currentIndex;
          const isUpcoming = !isFailed && index > currentIndex;

          return (
            <React.Fragment key={state}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                {/* State Icon */}
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isCompleted
                      ? config.color
                      : isCurrent
                      ? config.color
                      : isUpcoming
                      ? "#e5e7eb"
                      : "#e5e7eb",
                    border: `2px solid ${
                      isCompleted || isCurrent ? config.color : "#d1d5db"
                    }`,
                    transition: "all 0.3s ease",
                  }}
                >
                  <IconComponent
                    sx={{
                      fontSize: 16,
                      color: isCompleted || isCurrent ? "white" : "#9ca3af",
                    }}
                  />
                </Box>

                {/* State Label */}
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: isCompleted || isCurrent ? 600 : 400,
                    color: isCompleted || isCurrent ? config.color : "#9ca3af",
                    textAlign: "center",
                    minWidth: "60px",
                  }}
                >
                  {config.label}
                </Typography>
              </Box>

              {/* Connector Line */}
              {index < legacyStates.length - 1 && (
                <Box
                  sx={{
                    width: 24,
                    height: 2,
                    background: isCompleted ? config.color : "#e5e7eb",
                    borderRadius: 1,
                    transition: "all 0.3s ease",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Show failed status if applicable */}
        {isFailed && (
          <>
            <Box
              sx={{
                width: 24,
                height: 2,
                background: "#ef4444",
                borderRadius: 1,
              }}
            />
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#ef4444",
                  border: "2px solid #ef4444",
                }}
              >
                <FailedIcon sx={{ fontSize: 16, color: "white" }} />
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "#ef4444",
                  textAlign: "center",
                  minWidth: "60px",
                }}
              >
                Failed
              </Typography>
            </Box>
          </>
        )}
      </Box>

      {/* Status chip for quick reference */}
      <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
        <Chip
          label={`Status: ${stateConfig[currentStatus].label}`}
          size="small"
          sx={{
            backgroundColor: stateConfig[currentStatus].color,
            color: "white",
            fontWeight: 600,
            fontSize: "0.75rem",
          }}
        />
      </Box>
    </Box>
  );
};

export default TranslationTimeline;
