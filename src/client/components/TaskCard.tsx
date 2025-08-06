import React from "react";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress,
} from "@mui/material";
import {
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import {
  TranslationTask,
  getLanguageStatesForTask,
  hasMultipleLanguageStates,
  LanguageTaskStatus,
} from "../../types";
import { getLanguageDisplayName } from "../../utils/languageUtils";

interface TaskCardProps {
  task: TranslationTask;
  onClick: () => void;
  filteredLanguages?: string[];
  isPartialDisplay?: boolean;
  currentColumnStatus?: LanguageTaskStatus;
}

// Type guard to check if this is an enhanced task
const isEnhancedTask = (task: TranslationTask): boolean => {
  return (task as any).type === "enhanced";
};

// Helper to get available translations from any task type
const getAvailableTranslations = (task: TranslationTask): any[] => {
  // For legacy tasks, return translations from result if available
  if (!isEnhancedTask(task)) {
    return task.result?.translations || [];
  }

  // For enhanced tasks, construct translations from languageSubTasks
  const enhancedTask = task as any;
  const translations: any[] = [];

  if (enhancedTask.languageSubTasks) {
    Object.entries(enhancedTask.languageSubTasks).forEach(
      ([language, subTask]: [string, any]) => {
        // Only show translations that have been translated (not just pending)
        if (subTask.translatedText) {
          translations.push({
            language,
            translatedText: subTask.translatedText,
            status: subTask.status,
            complianceScore: subTask.complianceScore,
          });
        }
      }
    );
  }

  return translations;
};

// Helper functions (moved outside component to avoid hoisting issues)
const mapEnhancedStatusToLegacy = (
  enhancedStatus: string
): LanguageTaskStatus => {
  switch (enhancedStatus) {
    case "pending":
      return "pending";
    case "processing":
      return "translating";
    case "review_pending":
    case "review_active":
      return "human_review";
    case "finalizing":
      return "translating";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
};

const getLanguageStatesForEnhancedTask = (
  enhancedTask: any
): Map<string, LanguageTaskStatus> => {
  const states = new Map<string, LanguageTaskStatus>();
  if (enhancedTask.languageSubTasks) {
    Object.entries(enhancedTask.languageSubTasks).forEach(
      ([lang, subTask]: [string, any]) => {
        states.set(lang, mapSubTaskStatusToLegacy(subTask.status));
      }
    );
  }
  return states;
};

const hasMultipleLanguageStatesEnhanced = (
  enhancedTask: any,
  languages: string[]
): boolean => {
  if (!enhancedTask.languageSubTasks) return false;
  const statuses = new Set(
    languages
      .map((lang) => enhancedTask.languageSubTasks[lang]?.status)
      .filter(Boolean)
  );
  return statuses.size > 1;
};

const mapSubTaskStatusToLegacy = (
  subTaskStatus: string
): LanguageTaskStatus => {
  switch (subTaskStatus) {
    case "pending":
    case "translating":
      return "translating";
    case "translation_complete":
    case "llm_verifying":
    case "llm_verified":
      return "llm_verification";
    case "review_ready":
    case "review_queued":
    case "review_active":
    case "review_complete":
    case "llm_reverifying":
      return "human_review";
    case "iteration_complete":
    case "finalized":
      return "done";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
};

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onClick,
  filteredLanguages,
  isPartialDisplay = false,
  currentColumnStatus,
}) => {
  // Handle different task types
  const displayStatus = currentColumnStatus || task.status;

  // For enhanced tasks, get the most representative status from language sub-tasks
  const getEnhancedDisplayStatus = (): LanguageTaskStatus => {
    const enhancedTask = task as any;
    if (
      !enhancedTask.languageSubTasks ||
      Object.keys(enhancedTask.languageSubTasks).length === 0
    ) {
      return mapEnhancedStatusToLegacy(enhancedTask.status);
    }

    // Get statuses of languages that are displayed (filtered languages or all)
    const relevantLanguages =
      filteredLanguages || enhancedTask.destinationLanguages;
    const languageStatuses = relevantLanguages.map((lang) => {
      const subTask = enhancedTask.languageSubTasks[lang];
      return subTask ? mapSubTaskStatusToLegacy(subTask.status) : "pending";
    });

    // If all languages have the same status, use that
    const uniqueStatuses = [...new Set(languageStatuses)];
    if (uniqueStatuses.length === 1) {
      return uniqueStatuses[0] as LanguageTaskStatus;
    }

    // If mixed statuses, prioritize the most advanced status
    const statusPriority: LanguageTaskStatus[] = [
      "failed",
      "done",
      "human_review",
      "llm_verification",
      "translating",
      "pending",
    ];
    for (const status of statusPriority) {
      if (languageStatuses.includes(status)) {
        return status;
      }
    }

    return "pending";
  };

  const finalDisplayStatus =
    currentColumnStatus ||
    (isEnhancedTask(task) ? getEnhancedDisplayStatus() : task.status);

  const getStatusIcon = () => {
    switch (finalDisplayStatus) {
      case "failed":
        return <ErrorIcon color="error" fontSize="small" />;
      case "translating":
      case "llm_verification":
      case "human_review":
        return <ScheduleIcon color="primary" fontSize="small" />;
      default:
        return <LanguageIcon color="primary" fontSize="small" />;
    }
  };

  const getLanguageStatusColor = (status: LanguageTaskStatus): string => {
    switch (status) {
      case "done":
        return "#4caf50";
      case "failed":
        return "#f44336";
      case "human_review":
        return "#ff9800";
      case "llm_verification":
        return "#2196f3";
      case "translating":
        return "#9c27b0";
      case "pending":
      default:
        return "#757575";
    }
  };

  const displayLanguages = filteredLanguages || task.destinationLanguages;

  // Handle different task types for language states
  const languageStates = isEnhancedTask(task)
    ? getLanguageStatesForEnhancedTask(task as any)
    : getLanguageStatesForTask(task);
  const hasSplitStates = isEnhancedTask(task)
    ? hasMultipleLanguageStatesEnhanced(task as any, displayLanguages)
    : hasMultipleLanguageStates(task);

  // Helper to get progress from enhanced task
  const getTaskProgress = (): number => {
    if (!isEnhancedTask(task)) {
      return task.progress || 0;
    }

    const enhancedTask = task as any;
    if (
      !enhancedTask.languageSubTasks ||
      Object.keys(enhancedTask.languageSubTasks).length === 0
    ) {
      return 0;
    }

    const totalLanguages = Object.keys(enhancedTask.languageSubTasks).length;
    let totalProgress = 0;

    Object.values(enhancedTask.languageSubTasks).forEach((subTask: any) => {
      switch (subTask.status) {
        case "pending":
          totalProgress += 0;
          break;
        case "translating":
          totalProgress += 0.2;
          break;
        case "translation_complete":
          totalProgress += 0.4;
          break;
        case "llm_verifying":
        case "llm_verified":
          totalProgress += 0.5;
          break;
        case "review_ready":
        case "review_queued":
          totalProgress += 0.6;
          break;
        case "review_active":
          totalProgress += 0.7;
          break;
        case "review_complete":
        case "llm_reverifying":
          totalProgress += 0.8;
          break;
        case "iteration_complete":
          totalProgress += 0.9;
          break;
        case "finalized":
          totalProgress += 1.0;
          break;
        case "failed":
          totalProgress += 0;
          break;
        default:
          totalProgress += 0;
      }
    });

    return Math.round((totalProgress / totalLanguages) * 100);
  };

  const getStatusGradient = () => {
    switch (finalDisplayStatus) {
      case "pending":
        return "linear-gradient(135deg, #ef4444 0%, #f87171 100%)";
      case "translating":
        return "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)";
      case "llm_verification":
        return "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)";
      case "human_review":
        return "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)";
      case "done":
        return "linear-gradient(135deg, #10b981 0%, #34d399 100%)";
      case "failed":
        return "linear-gradient(135deg, #ef4444 0%, #f87171 100%)";
      default:
        return "linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)";
    }
  };

  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        background: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        borderRadius: 2.5,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: getStatusGradient(),
        },
        "&:hover": {
          transform: "translateY(-4px) scale(1.02)",
          boxShadow: "0 12px 24px rgba(0, 0, 0, 0.15)",
          background: "rgba(255, 255, 255, 0.95)",
        },
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 1.5,
              background: getStatusGradient(),
              mr: 1.5,
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.12)",
            }}
          >
            {React.cloneElement(getStatusIcon(), {
              sx: { color: "white", fontSize: 16 },
            })}
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              flexGrow: 1,
              fontSize: "0.875rem",
              color: "#1e293b",
            }}
          >
            {task.id.split("_")[1]}
            {isPartialDisplay && (
              <Chip
                label="PARTIAL"
                size="small"
                sx={{
                  ml: 1,
                  height: 16,
                  fontSize: "0.6rem",
                  backgroundColor: "#ff5722",
                  color: "white",
                }}
              />
            )}
          </Typography>
          {isEnhancedTask(task) && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
                mr: 1,
                boxShadow: "0 2px 8px rgba(139, 92, 246, 0.3)",
                animation: "pulse 2s infinite",
              }}
            >
              <AddIcon sx={{ color: "white", fontSize: 14 }} />
            </Box>
          )}
          <Typography
            variant="caption"
            sx={{
              color: "#64748b",
              fontSize: "0.75rem",
              fontWeight: 500,
              opacity: 0.8,
            }}
          >
            Click for details
          </Typography>
        </Box>

        <Typography
          variant="body2"
          sx={{
            mb: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            color: "#374151",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          {task.mediaArticle.title ||
            task.mediaArticle.text.substring(0, 60) + "..."}
        </Typography>
        {getAvailableTranslations(task).length > 0 && isPartialDisplay && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
              <strong>Languages in {finalDisplayStatus}:</strong>{" "}
              {displayLanguages.length}
            </Typography>
            <Box sx={{ mt: 1 }}>
              {getAvailableTranslations(task)
                .filter((translation) =>
                  displayLanguages.includes(translation.language)
                )
                .map((translation, index) => (
                  <Box
                    key={index}
                    sx={{
                      mb: 1,
                      p: 1,
                      backgroundColor: "#f8f9fa",
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" sx={{ display: "block" }}>
                      <strong>
                        {getLanguageDisplayName(translation.language)}:
                      </strong>
                      <Chip
                        label={translation.status || finalDisplayStatus}
                        size="small"
                        sx={{
                          ml: 1,
                          height: 16,
                          fontSize: "0.6rem",
                          backgroundColor: getLanguageStatusColor(
                            translation.status || finalDisplayStatus
                          ),
                          color: "white",
                        }}
                      />
                    </Typography>
                    {translation.complianceScore && (
                      <Typography
                        variant="caption"
                        sx={{ display: "block", color: "text.secondary" }}
                      >
                        Score: {translation.complianceScore}%
                      </Typography>
                    )}
                  </Box>
                ))}
            </Box>
          </Box>
        )}
        {getAvailableTranslations(task).length > 0 && !isPartialDisplay && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
              <strong>Translations:</strong>{" "}
              {getAvailableTranslations(task).length}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {displayLanguages.slice(0, 3).map((lang) => {
            const langStatus = languageStates.get(lang) || finalDisplayStatus;
            const statusColor = getLanguageStatusColor(langStatus);
            return (
              <Chip
                key={lang}
                label={getLanguageDisplayName(lang)}
                size="small"
                variant={isPartialDisplay ? "filled" : "outlined"}
                sx={{
                  fontSize: "0.7rem",
                  ...(isPartialDisplay && {
                    backgroundColor: statusColor,
                    color: "white",
                    "&:hover": {
                      backgroundColor: statusColor,
                      opacity: 0.8,
                    },
                  }),
                }}
              />
            );
          })}
          {displayLanguages.length > 3 && (
            <Chip
              label={`+${displayLanguages.length - 3}`}
              size="small"
              sx={{
                fontSize: "0.7rem",
                fontWeight: 600,
                background: getStatusGradient(),
                color: "white",
              }}
            />
          )}
        </Box>

        {(finalDisplayStatus === "translating" ||
          finalDisplayStatus === "llm_verification" ||
          finalDisplayStatus === "human_review") && (
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: "#64748b", fontWeight: 600 }}
              >
                Progress
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "#1e293b", fontWeight: 700 }}
              >
                {getTaskProgress()}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={getTaskProgress()}
              sx={{
                height: 6,
                borderRadius: 3,
                background: "rgba(0, 0, 0, 0.06)",
                "& .MuiLinearProgress-bar": {
                  background: getStatusGradient(),
                  borderRadius: 3,
                },
              }}
            />
          </Box>
        )}

        {task.error && (
          <Box
            sx={{
              p: 1.5,
              background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
              border: "1px solid #fecaca",
              borderRadius: 1.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: "#dc2626",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ErrorIcon sx={{ fontSize: 14, mr: 0.5 }} />
              Error occurred
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskCard;
