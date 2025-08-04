import React, { useState, useEffect } from "react";
import {
  Container,
  Typography,
  Box,
  AppBar,
  Toolbar,
  Button,
  Dialog,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Paper,
} from "@mui/material";
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Translate as TranslateIcon,
  Login as LoginIcon,
  Block as BlockIcon,
  ExitToApp as SignOutIcon,
} from "@mui/icons-material";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
  useAuth,
  SignOutButton,
} from "@clerk/clerk-react";
import KanbanBoard from "./components/KanbanBoard";
import CreateTaskDialog from "./components/CreateTaskDialog";
import { TranslationTask } from "../types";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#6366f1",
      light: "#818cf8",
      dark: "#4f46e5",
    },
    secondary: {
      main: "#ec4899",
      light: "#f472b6",
      dark: "#db2777",
    },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
    text: {
      primary: "#1e293b",
      secondary: "#64748b",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 600,
      fontSize: "1.25rem",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 500,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 12px 0 rgba(0, 0, 0, 0.15)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
});

const App: React.FC = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [tasks, setTasks] = useState<TranslationTask[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(5000);
  const [isPolling, setIsPolling] = useState(false);

  // Check if user has authorized email domain
  const isAuthorizedUser = user?.emailAddresses?.some((emailAddress) =>
    emailAddress.emailAddress.endsWith("@prolific.com")
  );

  const fetchTasks = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        console.error("No authentication token available");
        return;
      }

      const response = await fetch("/api/tasks", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      } else if (response.status === 401 || response.status === 403) {
        // Handle authentication/authorization errors
        console.error("Authentication/authorization error:", response.status);
        // Could show a toast notification here
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch tasks if user is authorized
    if (isAuthorizedUser) {
      fetchTasks(true);
      setIsPolling(true);
      const interval = setInterval(() => fetchTasks(false), pollingInterval);
      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    }
  }, [pollingInterval, isAuthorizedUser]);

  const handleCreateTask = async (taskData: {
    mediaArticle: { text: string; title?: string };
    editorialGuidelines: Record<string, any>;
    destinationLanguages: string[];
    useEnhancedProcessing?: boolean;
  }) => {
    try {
      const token = await getToken();
      if (!token) {
        console.error("No authentication token available");
        return;
      }

      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        fetchTasks(true);
      } else if (response.status === 401 || response.status === 403) {
        // Handle authentication/authorization errors
        console.error("Authentication/authorization error:", response.status);
        // Could show a toast notification here
      }
    } catch (error) {
      console.error("Error creating task:", error);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          flexGrow: 1,
          minHeight: "100vh",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        {/* Show unauthorized access page for non-@prolific.com users */}
        <SignedIn>
          {!isAuthorizedUser && (
            <Container maxWidth="md" sx={{ py: 8 }}>
              <Paper
                elevation={8}
                sx={{
                  p: 6,
                  textAlign: "center",
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(20px)",
                  borderRadius: 4,
                  border: "2px solid #f87171",
                }}
              >
                <BlockIcon sx={{ fontSize: 64, color: "#dc2626", mb: 2 }} />
                <Typography
                  variant="h3"
                  component="h1"
                  gutterBottom
                  sx={{ fontWeight: 700, color: "#dc2626" }}
                >
                  Access Denied
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
                  This application is restricted to Prolific team members only.
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mb: 4 }}
                >
                  You must sign in with a <strong>@prolific.com</strong> email
                  address to access this application.
                  {user?.emailAddresses?.[0] && (
                    <>
                      <br />
                      <br />
                      Currently signed in as:{" "}
                      <strong>{user.emailAddresses[0].emailAddress}</strong>
                    </>
                  )}
                </Typography>
                <SignOutButton>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<SignOutIcon />}
                    sx={{
                      background:
                        "linear-gradient(45deg, #dc2626 30%, #b91c1c 90%)",
                      color: "white",
                      fontWeight: 600,
                      px: 4,
                      py: 1.5,
                      fontSize: "1.1rem",
                      "&:hover": {
                        background:
                          "linear-gradient(45deg, #b91c1c 30%, #991b1b 90%)",
                        transform: "translateY(-2px)",
                      },
                    }}
                  >
                    Sign Out & Try Again
                  </Button>
                </SignOutButton>
              </Paper>
            </Container>
          )}
        </SignedIn>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            background: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <Toolbar sx={{ py: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
              <TranslateIcon sx={{ mr: 2, fontSize: 32, color: "white" }} />
              <Typography
                variant="h6"
                component="div"
                sx={{
                  color: "white",
                  fontWeight: 700,
                  fontSize: "1.5rem",
                  background:
                    "linear-gradient(45deg, #ffffff 30%, #e0e7ff 90%)",
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Translation Hub
              </Typography>
            </Box>
            <FormControl size="small" sx={{ mr: 2, minWidth: 120 }}>
              <InputLabel sx={{ color: "white" }}>Poll Rate</InputLabel>
              <Select
                value={pollingInterval}
                onChange={(e) => setPollingInterval(Number(e.target.value))}
                label="Poll Rate"
                sx={{
                  color: "white",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(255, 255, 255, 0.23)",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(255, 255, 255, 0.87)",
                  },
                  "& .MuiSvgIcon-root": {
                    color: "white",
                  },
                }}
              >
                <MenuItem value={1000}>1s</MenuItem>
                <MenuItem value={5000}>5s</MenuItem>
                <MenuItem value={15000}>15s</MenuItem>
                <MenuItem value={30000}>30s</MenuItem>
                <MenuItem value={60000}>60s</MenuItem>
                <MenuItem value={300000}>5min</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <SignedOut>
                <SignInButton mode="modal">
                  <Button
                    variant="outlined"
                    startIcon={<LoginIcon />}
                    sx={{
                      color: "white",
                      borderColor: "rgba(255, 255, 255, 0.3)",
                      background: "rgba(255, 255, 255, 0.1)",
                      backdropFilter: "blur(10px)",
                      "&:hover": {
                        borderColor: "rgba(255, 255, 255, 0.5)",
                        background: "rgba(255, 255, 255, 0.2)",
                      },
                    }}
                  >
                    Sign In
                  </Button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                {isAuthorizedUser ? (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<RefreshIcon />}
                      onClick={() => fetchTasks(true)}
                      disabled={loading}
                      sx={{
                        color: "white",
                        borderColor: "rgba(255, 255, 255, 0.3)",
                        background: "rgba(255, 255, 255, 0.1)",
                        backdropFilter: "blur(10px)",
                        "&:hover": {
                          borderColor: "rgba(255, 255, 255, 0.5)",
                          background: "rgba(255, 255, 255, 0.2)",
                        },
                      }}
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => setIsCreateDialogOpen(true)}
                      sx={{
                        background:
                          "linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)",
                        color: "white",
                        fontWeight: 600,
                        px: 3,
                        "&:hover": {
                          background:
                            "linear-gradient(45deg, #4f46e5 30%, #7c3aed 90%)",
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      New Task
                    </Button>
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "w-10 h-10",
                        },
                      }}
                    />
                  </>
                ) : (
                  // Show sign-out option for unauthorized users
                  <SignOutButton>
                    <Button
                      variant="outlined"
                      startIcon={<SignOutIcon />}
                      sx={{
                        color: "white",
                        borderColor: "rgba(255, 255, 255, 0.3)",
                        background: "rgba(255, 255, 255, 0.1)",
                        backdropFilter: "blur(10px)",
                        "&:hover": {
                          borderColor: "rgba(255, 255, 255, 0.5)",
                          background: "rgba(255, 255, 255, 0.2)",
                        },
                      }}
                    >
                      Sign Out
                    </Button>
                  </SignOutButton>
                )}
              </SignedIn>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Main app content - only for authorized users */}
        <SignedIn>
          {isAuthorizedUser && (
            <>
              <Container maxWidth="xl" sx={{ py: 4 }}>
                <KanbanBoard tasks={tasks} loading={loading} />
              </Container>

              <CreateTaskDialog
                open={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onSubmit={handleCreateTask}
              />
            </>
          )}
        </SignedIn>

        <SignedOut>
          <Container maxWidth="md" sx={{ py: 8 }}>
            <Paper
              elevation={8}
              sx={{
                p: 6,
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(20px)",
                borderRadius: 4,
              }}
            >
              <TranslateIcon
                sx={{ fontSize: 64, color: "primary.main", mb: 2 }}
              />
              <Typography
                variant="h3"
                component="h1"
                gutterBottom
                sx={{ fontWeight: 700 }}
              >
                Welcome to Translation Hub
              </Typography>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                Manage and track your translation tasks with editorial
                guidelines
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Sign in to access your translation dashboard, create new tasks,
                and track progress across multiple languages.
              </Typography>
              <SignInButton mode="modal">
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<LoginIcon />}
                  sx={{
                    background:
                      "linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)",
                    color: "white",
                    fontWeight: 600,
                    px: 4,
                    py: 1.5,
                    fontSize: "1.1rem",
                    "&:hover": {
                      background:
                        "linear-gradient(45deg, #4f46e5 30%, #7c3aed 90%)",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  Get Started
                </Button>
              </SignInButton>
            </Paper>
          </Container>
        </SignedOut>
      </Box>
    </ThemeProvider>
  );
};

export default App;
