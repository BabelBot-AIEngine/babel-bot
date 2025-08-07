import React, { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Chip,
  LinearProgress,
  IconButton,
  Divider,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent,
  Rating,
  Tabs,
  Tab,
  Grid,
} from "@mui/material";
import {
  Close as CloseIcon,
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as PendingIcon,
  Translate as TranslatingIcon,
  Psychology as VerificationIcon,
  Person as ReviewIcon,
  CheckCircle as DoneIcon,
  Error as FailedIcon,
  ExpandMore as ExpandMoreIcon,
  Article as ArticleIcon,
  Gavel as GuidelinesIcon,
  Score as ScoreIcon,
  ContentCopy as CopyIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  AutoAwesome as EnhancedIcon,
  Webhook as WebhookIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  TranslationTask,
  LanguageTaskStatus,
  getLanguageStatesForTask,
} from "../../types";
import { getLanguageDisplayName } from "../../utils/languageUtils";
import TranslationTimeline from "./TranslationTimeline";

interface TaskDetailsModalProps {
  task: TranslationTask | null;
  open: boolean;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`modal-tabpanel-${index}`}
      aria-labelledby={`modal-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
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

  const computeComplianceScore = (subTask: any): number | undefined => {
    if (!subTask?.iterations || subTask.iterations.length === 0)
      return undefined;
    const latest: any = subTask.iterations[subTask.iterations.length - 1];
    // Prefer combinedScore, then llmReverification, then llmVerification
    if (typeof latest.combinedScore === "number")
      return Math.round(latest.combinedScore * 20);
    if (
      latest.llmReverification &&
      typeof latest.llmReverification.score === "number"
    ) {
      return Math.round(latest.llmReverification.score * 20);
    }
    if (
      latest.llmVerification &&
      typeof latest.llmVerification.score === "number"
    ) {
      return Math.round(latest.llmVerification.score * 20);
    }
    return undefined;
  };

  const collectReviewNotes = (subTask: any): string[] | undefined => {
    if (!subTask?.iterations) return undefined;
    const notes: string[] = [];
    for (const it of subTask.iterations) {
      if (it.llmVerification?.feedback) notes.push(it.llmVerification.feedback);
      if (it.humanReview?.feedback) notes.push(it.humanReview.feedback);
      if (it.llmReverification?.feedback)
        notes.push(it.llmReverification.feedback);
    }
    return notes.length > 0 ? notes : undefined;
  };

  if (enhancedTask.languageSubTasks) {
    Object.entries(enhancedTask.languageSubTasks).forEach(
      ([language, subTask]: [string, any]) => {
        if (subTask.translatedText) {
          translations.push({
            language,
            translatedText: subTask.translatedText,
            status: subTask.status,
            complianceScore: computeComplianceScore(subTask),
            reviewNotes: collectReviewNotes(subTask),
            iterations: subTask.iterations || [],
          });
        }
      }
    );
  }

  return translations;
};

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  task,
  open,
  onClose,
}) => {
  const { getToken } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [retriggerCooldown, setRetriggerCooldown] = useState(0);

  if (!task) return null;

  // Calculate time since last webhook
  // Helper to get progress from any task type
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

  const getTimeSinceLastWebhook = (): number => {
    if (!isEnhancedTask(task)) return 0;
    const enhancedTask = task as any;
    if (
      !enhancedTask.webhookDeliveryLog ||
      enhancedTask.webhookDeliveryLog.length === 0
    )
      return Infinity;

    const lastWebhook =
      enhancedTask.webhookDeliveryLog[
        enhancedTask.webhookDeliveryLog.length - 1
      ];
    const lastAttemptTime = new Date(
      lastWebhook.lastAttemptAt || lastWebhook.createdAt
    ).getTime();
    return Date.now() - lastAttemptTime;
  };

  const retriggerWebhook = async () => {
    if (!isEnhancedTask(task)) return;

    try {
      const token = await getToken();
      if (!token) {
        console.error("No authentication token available");
        return;
      }

      const response = await fetch(
        `/api/tasks/enhanced/${task.id}/retrigger-webhook`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        // Start 10-minute cooldown
        setRetriggerCooldown(600); // 10 minutes in seconds
        const interval = setInterval(() => {
          setRetriggerCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (response.status === 401 || response.status === 403) {
        console.error("Authentication/authorization error:", response.status);
        // Could show a toast notification here
      } else {
        console.error("Failed to retrigger webhook:", response.status);
      }
    } catch (error) {
      console.error("Error retriggering webhook:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Helper to get display status (handles enhanced tasks)
  const getDisplayStatus = () => {
    if (!isEnhancedTask(task)) {
      return task.status;
    }

    const enhancedTask = task as any;
    switch (enhancedTask.status) {
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

  const getStatusIcon = () => {
    const displayStatus = getDisplayStatus();
    switch (displayStatus) {
      case "pending":
        return <PendingIcon />;
      case "translating":
        return <TranslatingIcon />;
      case "llm_verification":
        return <VerificationIcon />;
      case "human_review":
        return <ReviewIcon />;
      case "done":
        return <DoneIcon />;
      case "failed":
        return <FailedIcon />;
      default:
        return <LanguageIcon />;
    }
  };

  const getStatusGradient = () => {
    const displayStatus = getDisplayStatus();
    switch (displayStatus) {
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

  const getStatusColor = () => {
    const displayStatus = getDisplayStatus();
    switch (displayStatus) {
      case "pending":
        return "#ef4444";
      case "translating":
        return "#f59e0b";
      case "llm_verification":
        return "#3b82f6";
      case "human_review":
        return "#8b5cf6";
      case "done":
        return "#10b981";
      case "failed":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusTitle = () => {
    const displayStatus = getDisplayStatus();
    switch (displayStatus) {
      case "pending":
        return "Pending";
      case "translating":
        return "Translating";
      case "llm_verification":
        return "LLM Verification";
      case "human_review":
        return "Human Review";
      case "done":
        return "Done";
      case "failed":
        return "Failed";
      default:
        return "Unknown";
    }
  };

  const getComplianceRating = (score?: number) => {
    if (!score) return 0;
    return score / 20; // Convert 0-100 to 0-5 scale
  };

  const getComplianceColor = (score?: number) => {
    if (!score) return "#9ca3af";
    if (score >= 80) return "#10b981";
    if (score >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const getGuideDisplayName = (guide?: string) => {
    if (!guide) return "No specific guide";

    // Convert guide type to display name with filename indication
    const guideMap: Record<string, string> = {
      financialtimes: "Financial Times (financialtimes.txt)",
      monzo: "Monzo (monzo.txt)",
      prolific: "Prolific (prolific.txt)",
    };

    return guideMap[guide] || `${guide} (${guide}.txt)`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          maxHeight: "95vh",
          minHeight: "80vh",
        },
      }}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(4px)",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background: getStatusGradient(),
          color: "white",
          p: 3,
          borderRadius: "12px 12px 0 0",
          position: "relative",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 2,
              background: "rgba(255, 255, 255, 0.2)",
              mr: 2,
              backdropFilter: "blur(10px)",
            }}
          >
            {React.cloneElement(getStatusIcon(), {
              sx: { color: "white", fontSize: 24 },
            })}
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              Task #{task.id.split("_")[1]}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Chip
                label={getStatusTitle()}
                size="small"
                sx={{
                  background: "rgba(255, 255, 255, 0.2)",
                  color: "white",
                  fontWeight: 600,
                  backdropFilter: "blur(10px)",
                }}
              />
              {isEnhancedTask(task) && (
                <Chip
                  icon={<EnhancedIcon sx={{ fontSize: 16 }} />}
                  label="ENHANCED"
                  size="small"
                  sx={{
                    background:
                      "linear-gradient(45deg, #FF6B6B, #4ECDC4, #45B7D1, #96CEB4, #FFEAA7, #DDA0DD)",
                    backgroundSize: "300% 300%",
                    animation:
                      "gradientShift 3s ease infinite, glow 2s ease-in-out infinite alternate",
                    color: "white",
                    fontWeight: 700,
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    boxShadow: "0 0 20px rgba(255, 255, 255, 0.5)",
                    "@keyframes gradientShift": {
                      "0%": { backgroundPosition: "0% 50%" },
                      "50%": { backgroundPosition: "100% 50%" },
                      "100%": { backgroundPosition: "0% 50%" },
                    },
                    "@keyframes glow": {
                      from: { boxShadow: "0 0 20px rgba(255, 255, 255, 0.5)" },
                      to: {
                        boxShadow:
                          "0 0 30px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.3)",
                      },
                    },
                  }}
                />
              )}
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Created {formatDate(task.createdAt)}
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={onClose}
            sx={{
              color: "white",
              background: "rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(10px)",
              "&:hover": {
                background: "rgba(255, 255, 255, 0.2)",
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        {task.mediaArticle?.title && (
          <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 500 }}>
            {task.mediaArticle?.title}
          </Typography>
        )}
      </Box>

      {/* Tabs */}
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          background: "rgba(248, 250, 252, 0.8)",
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 3,
            "& .MuiTab-root": {
              fontWeight: 600,
              textTransform: "none",
            },
          }}
        >
          <Tab
            label="Overview"
            icon={<ArticleIcon />}
            iconPosition="start"
            sx={{ minHeight: 60 }}
          />
          <Tab
            label="Editorial Guidelines"
            icon={<GuidelinesIcon />}
            iconPosition="start"
            sx={{ minHeight: 60 }}
          />
          {getAvailableTranslations(task).length > 0 && (
            <Tab
              label={`Translations (${getAvailableTranslations(task).length})`}
              icon={<TranslatingIcon />}
              iconPosition="start"
              sx={{ minHeight: 60 }}
            />
          )}
          {isEnhancedTask(task) && (
            <Tab
              label="Enhanced Details"
              icon={<WebhookIcon />}
              iconPosition="start"
              sx={{ minHeight: 60 }}
            />
          )}
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0, minHeight: "400px" }}>
        {/* Overview Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 4 }}>
            <Grid container spacing={4}>
              {/* Progress Section */}
              {(getDisplayStatus() === "translating" ||
                getDisplayStatus() === "llm_verification" ||
                getDisplayStatus() === "human_review") && (
                <Grid item xs={12}>
                  <Card
                    sx={{
                      background:
                        "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                      border: "1px solid #e2e8f0",
                      borderRadius: 2,
                    }}
                  >
                    <CardContent>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 2,
                        }}
                      >
                        <Typography
                          variant="h6"
                          sx={{ color: "#1e293b", fontWeight: 600 }}
                        >
                          Progress
                        </Typography>
                        <Typography
                          variant="h6"
                          sx={{ color: getStatusColor(), fontWeight: 700 }}
                        >
                          {getTaskProgress()}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={getTaskProgress()}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          background: "rgba(0, 0, 0, 0.06)",
                          "& .MuiLinearProgress-bar": {
                            background: getStatusGradient(),
                            borderRadius: 4,
                          },
                        }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Error Section */}
              {(isEnhancedTask(task) ? (task as any).error : task.error) && (
                <Grid item xs={12}>
                  <Card
                    sx={{
                      background:
                        "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
                      border: "1px solid #fecaca",
                      borderRadius: 2,
                    }}
                  >
                    <CardContent>
                      <Typography
                        variant="h6"
                        sx={{
                          color: "#dc2626",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          mb: 1,
                        }}
                      >
                        <ErrorIcon sx={{ fontSize: 20, mr: 1 }} />
                        Error Details
                      </Typography>
                      <Typography variant="body1" sx={{ color: "#7f1d1d" }}>
                        {isEnhancedTask(task)
                          ? (task as any).error
                          : task.error}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Languages and Timeline */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography
                      variant="h6"
                      sx={{ color: "#1e293b", fontWeight: 600, mb: 2 }}
                    >
                      Target Languages
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                      {task.destinationLanguages.map((lang) => {
                        const languageStates = getLanguageStatesForTask(task);
                        const langStatus =
                          languageStates.get(lang) || "pending";
                        const isFailedLang = langStatus === "failed";

                        const getLanguageStatusGradient = (
                          status: LanguageTaskStatus
                        ) => {
                          switch (status) {
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
                          <Box
                            key={lang}
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            <Chip
                              label={getLanguageDisplayName(lang)}
                              sx={{
                                fontSize: "0.875rem",
                                fontWeight: 600,
                                background:
                                  getLanguageStatusGradient(langStatus),
                                color: "white",
                                border: isFailedLang
                                  ? "2px solid #dc2626"
                                  : "none",
                                "&:hover": {
                                  transform: "scale(1.05)",
                                },
                                transition: "transform 0.2s ease",
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: isFailedLang ? "#dc2626" : "#64748b",
                                textTransform: "uppercase",
                                textAlign: "center",
                              }}
                            >
                              {langStatus.replace("_", " ")}
                            </Typography>
                            {isFailedLang && (
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  backgroundColor: "#dc2626",
                                  animation: "pulse 2s infinite",
                                }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography
                      variant="h6"
                      sx={{ color: "#1e293b", fontWeight: 600, mb: 2 }}
                    >
                      Timeline
                    </Typography>
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ color: "#64748b", fontWeight: 600, mb: 0.5 }}
                        >
                          Created
                        </Typography>
                        <Typography
                          variant="body1"
                          sx={{ color: "#1e293b", fontWeight: 500 }}
                        >
                          {formatDate(task.createdAt)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ color: "#64748b", fontWeight: 600, mb: 0.5 }}
                        >
                          Last Updated
                        </Typography>
                        <Typography
                          variant="body1"
                          sx={{ color: "#1e293b", fontWeight: 500 }}
                        >
                          {formatDate(task.updatedAt)}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {/* Original Article */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ color: "#1e293b", fontWeight: 600 }}
                      >
                        Original Article
                      </Typography>
                      <IconButton
                        onClick={() =>
                          task.mediaArticle?.text &&
                          copyToClipboard(task.mediaArticle.text)
                        }
                        sx={{
                          background: "rgba(99, 102, 241, 0.1)",
                          "&:hover": {
                            background: "rgba(99, 102, 241, 0.2)",
                          },
                        }}
                      >
                        <CopyIcon sx={{ color: "#6366f1" }} />
                      </IconButton>
                    </Box>
                    <Box
                      sx={{
                        p: 3,
                        background:
                          "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                        border: "1px solid #e2e8f0",
                        borderRadius: 2,
                        maxHeight: 400,
                        overflow: "auto",
                      }}
                    >
                      <Typography
                        variant="body1"
                        sx={{
                          color: "#374151",
                          lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {task.mediaArticle?.text ||
                          "No article content available"}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>
        </TabPanel>

        {/* Editorial Guidelines Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 4 }}>
            {/* Guide Information */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography
                  variant="h6"
                  sx={{ color: "#1e293b", fontWeight: 600, mb: 3 }}
                >
                  Editorial Guide Used
                </Typography>

                <Box
                  sx={{
                    p: 3,
                    background:
                      "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                    border: "1px solid #fbbf24",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <GuidelinesIcon sx={{ color: "#d97706", fontSize: 24 }} />
                  <Box>
                    <Typography
                      variant="subtitle1"
                      sx={{ color: "#92400e", fontWeight: 600, mb: 0.5 }}
                    >
                      Guide Source
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{ color: "#78350f", fontWeight: 500 }}
                    >
                      {getGuideDisplayName(task.guide)}
                    </Typography>
                    {task.guide && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#a16207", mt: 0.5, display: "block" }}
                      >
                        Editorial guidelines from {task.guide} style guide
                      </Typography>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* Editorial Guidelines */}
            <Card>
              <CardContent>
                <Typography
                  variant="h6"
                  sx={{ color: "#1e293b", fontWeight: 600, mb: 3 }}
                >
                  Editorial Guidelines Applied
                </Typography>

                <Grid container spacing={3}>
                  {task.editorialGuidelines?.tone && (
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{
                          p: 3,
                          background:
                            "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
                          border: "1px solid #c4b5fd",
                          borderRadius: 2,
                        }}
                      >
                        <Typography
                          variant="subtitle1"
                          sx={{ color: "#6b46c1", fontWeight: 600, mb: 1 }}
                        >
                          Tone
                        </Typography>
                        <Typography variant="body1" sx={{ color: "#4c1d95" }}>
                          {task.editorialGuidelines?.tone}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {task.editorialGuidelines?.style && (
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{
                          p: 3,
                          background:
                            "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
                          border: "1px solid #93c5fd",
                          borderRadius: 2,
                        }}
                      >
                        <Typography
                          variant="subtitle1"
                          sx={{ color: "#1d4ed8", fontWeight: 600, mb: 1 }}
                        >
                          Style
                        </Typography>
                        <Typography variant="body1" sx={{ color: "#1e3a8a" }}>
                          {task.editorialGuidelines?.style}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {task.editorialGuidelines?.targetAudience && (
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{
                          p: 3,
                          background:
                            "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                          border: "1px solid #6ee7b7",
                          borderRadius: 2,
                        }}
                      >
                        <Typography
                          variant="subtitle1"
                          sx={{ color: "#047857", fontWeight: 600, mb: 1 }}
                        >
                          Target Audience
                        </Typography>
                        <Typography variant="body1" sx={{ color: "#064e3b" }}>
                          {task.editorialGuidelines?.targetAudience}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {!task.editorialGuidelines?.tone &&
                    !task.editorialGuidelines?.style &&
                    !task.editorialGuidelines?.targetAudience && (
                      <Grid item xs={12}>
                        <Box
                          sx={{
                            p: 4,
                            background:
                              "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
                            border: "1px solid #e5e7eb",
                            borderRadius: 2,
                            textAlign: "center",
                          }}
                        >
                          <Typography
                            variant="body1"
                            sx={{ color: "#6b7280", fontStyle: "italic" }}
                          >
                            No specific editorial guidelines were provided for
                            this translation task.
                          </Typography>
                          {task.guide && (
                            <Typography
                              variant="body2"
                              sx={{ color: "#9ca3af", mt: 1 }}
                            >
                              However, the translation followed the {task.guide}{" "}
                              editorial guide standards.
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    )}
                </Grid>
              </CardContent>
            </Card>
          </Box>
        </TabPanel>

        {/* Translations Tab */}
        {getAvailableTranslations(task).length > 0 && (
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ px: 4 }}>
              <Typography
                variant="h6"
                sx={{ color: "#1e293b", fontWeight: 600, mb: 3 }}
              >
                Translation Results
              </Typography>

              {/* Translation Status Summary */}
              <Card
                sx={{
                  mb: 3,
                  background:
                    "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                  border: "1px solid #e2e8f0",
                }}
              >
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    sx={{ color: "#1e293b", fontWeight: 600, mb: 2 }}
                  >
                    Status Overview
                  </Typography>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {getAvailableTranslations(task).map(
                      (translation, index) => {
                        const translationStatus = (translation.status ||
                          "done") as LanguageTaskStatus;
                        const isFailedTranslation =
                          translationStatus === "failed";

                        return (
                          <Box
                            key={index}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              p: 1.5,
                              background: isFailedTranslation
                                ? "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                                : "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                              border: `1px solid ${
                                isFailedTranslation ? "#fecaca" : "#bbf7d0"
                              }`,
                              borderRadius: 2,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, color: "#1e293b" }}
                            >
                              {getLanguageDisplayName(translation.language)}:
                            </Typography>
                            <Chip
                              label={translationStatus
                                .replace("_", " ")
                                .toUpperCase()}
                              size="small"
                              sx={{
                                backgroundColor: isFailedTranslation
                                  ? "#ef4444"
                                  : "#10b981",
                                color: "white",
                                fontWeight: 600,
                                fontSize: "0.7rem",
                              }}
                            />
                            {translation.complianceScore && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: isFailedTranslation
                                    ? "#dc2626"
                                    : "#059669",
                                  fontWeight: 600,
                                }}
                              >
                                ({translation.complianceScore}%)
                              </Typography>
                            )}
                          </Box>
                        );
                      }
                    )}
                  </Box>

                  {/* Quick stats */}
                  <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid #e2e8f0" }}>
                    <Box sx={{ display: "flex", gap: 4 }}>
                      <Typography
                        variant="body2"
                        sx={{ color: "#059669", fontWeight: 600 }}
                      >
                        ✓ Successful:{" "}
                        {
                          getAvailableTranslations(task).filter(
                            (t) => t.status !== "failed"
                          ).length
                        }
                      </Typography>
                      {getAvailableTranslations(task).some(
                        (t) => t.status === "failed"
                      ) && (
                        <Typography
                          variant="body2"
                          sx={{ color: "#dc2626", fontWeight: 600 }}
                        >
                          ✗ Failed:{" "}
                          {
                            getAvailableTranslations(task).filter(
                              (t) => t.status === "failed"
                            ).length
                          }
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {getAvailableTranslations(task).map((translation, index) => {
                  const translationStatus = (translation.status ||
                    "done") as LanguageTaskStatus;
                  const isFailedTranslation = translationStatus === "failed";

                  return (
                    <Card
                      key={index}
                      sx={{
                        overflow: "visible",
                        border: isFailedTranslation
                          ? "2px solid #ef4444"
                          : "1px solid #e2e8f0",
                        background: isFailedTranslation
                          ? "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                          : "white",
                      }}
                    >
                      <CardContent>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 2,
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            <Chip
                              label={getLanguageDisplayName(
                                translation.language
                              )}
                              sx={{
                                background: isFailedTranslation
                                  ? "linear-gradient(135deg, #ef4444 0%, #f87171 100%)"
                                  : getStatusGradient(),
                                color: "white",
                                fontWeight: 600,
                                fontSize: "0.875rem",
                              }}
                            />
                            {isFailedTranslation && (
                              <Chip
                                label="FAILED"
                                size="small"
                                sx={{
                                  backgroundColor: "#dc2626",
                                  color: "white",
                                  fontWeight: 700,
                                  fontSize: "0.75rem",
                                  animation: "pulse 2s infinite",
                                }}
                              />
                            )}
                            {translation.complianceScore && (
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <ScoreIcon
                                  sx={{
                                    color: getComplianceColor(
                                      translation.complianceScore
                                    ),
                                    fontSize: 20,
                                  }}
                                />
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 600,
                                    color: getComplianceColor(
                                      translation.complianceScore
                                    ),
                                  }}
                                >
                                  Compliance: {translation.complianceScore}%
                                </Typography>
                                <Rating
                                  value={getComplianceRating(
                                    translation.complianceScore
                                  )}
                                  readOnly
                                  size="small"
                                  sx={{
                                    "& .MuiRating-iconFilled": {
                                      color: getComplianceColor(
                                        translation.complianceScore
                                      ),
                                    },
                                  }}
                                />
                              </Box>
                            )}
                          </Box>
                          <IconButton
                            onClick={() =>
                              copyToClipboard(translation.translatedText)
                            }
                            sx={{
                              background: "rgba(99, 102, 241, 0.1)",
                              "&:hover": {
                                background: "rgba(99, 102, 241, 0.2)",
                              },
                            }}
                          >
                            <CopyIcon sx={{ color: "#6366f1" }} />
                          </IconButton>
                        </Box>

                        {/* Translation Timeline */}
                        <TranslationTimeline
                          currentStatus={translationStatus}
                          language={getLanguageDisplayName(
                            translation.language
                          )}
                          iterations={translation.iterations}
                        />

                        {/* Alert box for failed translations */}
                        {isFailedTranslation && (
                          <Box
                            sx={{
                              p: 2,
                              mt: 2,
                              background:
                                "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
                              border: "1px solid #f87171",
                              borderRadius: 2,
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <ErrorIcon
                              sx={{ color: "#dc2626", fontSize: 20 }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ color: "#7f1d1d", fontWeight: 600 }}
                            >
                              This translation failed during processing. Please
                              check the review notes below for details.
                            </Typography>
                          </Box>
                        )}

                        <Box
                          sx={{
                            p: 3,
                            background:
                              "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                            border: "1px solid #e2e8f0",
                            borderRadius: 2,
                            mb: 2,
                          }}
                        >
                          <Typography
                            variant="body1"
                            sx={{
                              color: "#374151",
                              lineHeight: 1.7,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {translation.translatedText}
                          </Typography>
                        </Box>

                        {translation.reviewNotes &&
                          translation.reviewNotes.length > 0 && (
                            <Accordion
                              sx={{
                                boxShadow: "none",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography
                                  variant="subtitle2"
                                  sx={{ fontWeight: 600 }}
                                >
                                  Review Notes ({translation.reviewNotes.length}
                                  )
                                </Typography>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                  }}
                                >
                                  {translation.reviewNotes.map(
                                    (note, noteIndex) => (
                                      <Typography
                                        key={noteIndex}
                                        variant="body2"
                                        sx={{ color: "#64748b" }}
                                      >
                                        • {note}
                                      </Typography>
                                    )
                                  )}
                                </Box>
                              </AccordionDetails>
                            </Accordion>
                          )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>

              {task.result?.processedAt && (
                <Box
                  sx={{
                    mt: 3,
                    p: 2,
                    background:
                      "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#16a34a",
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    ✓ Processing completed on{" "}
                    {formatDate(task.result.processedAt)}
                  </Typography>
                </Box>
              )}
            </Box>
          </TabPanel>
        )}

        {/* Enhanced Details Tab */}
        {isEnhancedTask(task) && (
          <TabPanel
            value={tabValue}
            index={getAvailableTranslations(task).length > 0 ? 3 : 2}
          >
            <Box sx={{ px: 4 }}>
              <Typography
                variant="h6"
                sx={{ color: "#1e293b", fontWeight: 600, mb: 3 }}
              >
                Enhanced Task Details
              </Typography>

              <Grid container spacing={4}>
                {/* Enhanced Settings */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography
                        variant="h6"
                        sx={{ color: "#1e293b", fontWeight: 600, mb: 2 }}
                      >
                        Enhanced Configuration
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{ color: "#64748b", fontWeight: 600 }}
                          >
                            Max Review Iterations
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{ color: "#1e293b", fontWeight: 500 }}
                          >
                            {(task as any).maxReviewIterations || 3}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{ color: "#64748b", fontWeight: 600 }}
                          >
                            Confidence Threshold
                          </Typography>
                          <Typography
                            variant="body1"
                            sx={{ color: "#1e293b", fontWeight: 500 }}
                          >
                            {(task as any).confidenceThreshold || 4.5}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Language Sub-Tasks */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography
                        variant="h6"
                        sx={{ color: "#1e293b", fontWeight: 600, mb: 2 }}
                      >
                        Language Sub-Tasks
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                      >
                        {task.destinationLanguages.map((lang) => {
                          const subTask = (task as any).languageSubTasks?.[
                            lang
                          ];
                          return (
                            <Box
                              key={lang}
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                p: 1,
                                background: "#f8fafc",
                                borderRadius: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600 }}
                              >
                                {getLanguageDisplayName(lang)}
                              </Typography>
                              <Chip
                                label={subTask?.status || "pending"}
                                size="small"
                                sx={{
                                  backgroundColor: "#6366f1",
                                  color: "white",
                                  fontSize: "0.7rem",
                                }}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Webhook Audit Trail */}
                <Grid item xs={12}>
                  <Card>
                    <CardContent>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 3,
                        }}
                      >
                        <Typography
                          variant="h6"
                          sx={{ color: "#1e293b", fontWeight: 600 }}
                        >
                          Webhook Audit Trail
                        </Typography>
                        <Typography variant="body2" sx={{ color: "#64748b" }}>
                          {(task as any).webhookDeliveryLog?.length || 0}{" "}
                          webhook attempts
                        </Typography>
                      </Box>

                      {(task as any).webhookDeliveryLog &&
                      (task as any).webhookDeliveryLog.length > 0 ? (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          {(task as any).webhookDeliveryLog.map(
                            (webhook: any, index: number) => (
                              <Box
                                key={index}
                                sx={{
                                  p: 3,
                                  background:
                                    webhook.status === "success"
                                      ? "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)"
                                      : webhook.status === "failed"
                                      ? "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)"
                                      : "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                                  border: `1px solid ${
                                    webhook.status === "success"
                                      ? "#bbf7d0"
                                      : webhook.status === "failed"
                                      ? "#fecaca"
                                      : "#fbbf24"
                                  }`,
                                  borderRadius: 2,
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    mb: 2,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 2,
                                    }}
                                  >
                                    <Chip
                                      label={webhook.eventType}
                                      size="small"
                                      sx={{
                                        backgroundColor: "#6366f1",
                                        color: "white",
                                        fontWeight: 600,
                                      }}
                                    />
                                    <Chip
                                      label={webhook.status.toUpperCase()}
                                      size="small"
                                      sx={{
                                        backgroundColor:
                                          webhook.status === "success"
                                            ? "#10b981"
                                            : webhook.status === "failed"
                                            ? "#ef4444"
                                            : "#f59e0b",
                                        color: "white",
                                        fontWeight: 600,
                                      }}
                                    />
                                  </Box>
                                  <Typography
                                    variant="caption"
                                    sx={{ color: "#64748b" }}
                                  >
                                    Attempt #{webhook.attempt}
                                  </Typography>
                                </Box>

                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                  }}
                                >
                                  <Typography
                                    variant="body2"
                                    sx={{ color: "#374151" }}
                                  >
                                    <strong>URL:</strong> {webhook.url}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    sx={{ color: "#374151" }}
                                  >
                                    <strong>Created:</strong>{" "}
                                    {formatDate(webhook.createdAt)}
                                  </Typography>
                                  {webhook.lastAttemptAt && (
                                    <Typography
                                      variant="body2"
                                      sx={{ color: "#374151" }}
                                    >
                                      <strong>Last Attempt:</strong>{" "}
                                      {formatDate(webhook.lastAttemptAt)}
                                    </Typography>
                                  )}
                                  {webhook.qstashMessageId && (
                                    <Typography
                                      variant="body2"
                                      sx={{ color: "#374151" }}
                                    >
                                      <strong>QStash Message ID:</strong>{" "}
                                      {webhook.qstashMessageId}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            )
                          )}
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            p: 4,
                            background:
                              "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
                            border: "1px solid #e5e7eb",
                            borderRadius: 2,
                            textAlign: "center",
                          }}
                        >
                          <WebhookIcon
                            sx={{ fontSize: 48, color: "#9ca3af", mb: 2 }}
                          />
                          <Typography
                            variant="body1"
                            sx={{ color: "#6b7280", fontStyle: "italic" }}
                          >
                            No webhook attempts recorded yet.
                          </Typography>
                        </Box>
                      )}

                      {/* Re-trigger Webhook Button */}
                      <Box
                        sx={{ mt: 4, pt: 3, borderTop: "1px solid #e2e8f0" }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 2,
                          }}
                        >
                          <Box>
                            <Typography
                              variant="subtitle1"
                              sx={{ color: "#1e293b", fontWeight: 600 }}
                            >
                              Re-trigger Last Webhook
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ color: "#64748b" }}
                            >
                              {retriggerCooldown > 0
                                ? `Available in ${Math.floor(
                                    retriggerCooldown / 60
                                  )}:${(retriggerCooldown % 60)
                                    .toString()
                                    .padStart(2, "0")}`
                                : getTimeSinceLastWebhook() < 600000 // 10 minutes
                                ? `Available in ${Math.ceil(
                                    (600000 - getTimeSinceLastWebhook()) / 60000
                                  )} minutes`
                                : "Ready to trigger"}
                            </Typography>
                          </Box>
                          <Button
                            variant="contained"
                            startIcon={<RefreshIcon />}
                            disabled={
                              getDisplayStatus() === "done" ||
                              retriggerCooldown > 0 ||
                              getTimeSinceLastWebhook() < 600000
                            }
                            onClick={retriggerWebhook}
                            sx={{
                              background:
                                "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
                              "&:disabled": {
                                background: "#e5e7eb",
                                color: "#9ca3af",
                              },
                            }}
                          >
                            Re-trigger
                          </Button>
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{ color: "#9ca3af", fontStyle: "italic" }}
                        >
                          Button is disabled if task is completed or less than
                          10 minutes have passed since the last webhook.
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </TabPanel>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 4, pt: 0 }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            background: getStatusGradient(),
            borderRadius: 2,
            px: 4,
            py: 1,
            fontWeight: 600,
            boxShadow: `0 4px 12px ${getStatusColor()}40`,
            "&:hover": {
              transform: "translateY(-1px)",
              boxShadow: `0 6px 16px ${getStatusColor()}50`,
            },
            transition: "all 0.2s ease",
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskDetailsModal;
