import React, { useState, useEffect } from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
  useAuth,
  SignOutButton,
} from "@clerk/clerk-react";
import {
  Plus,
  RefreshCw,
  Languages,
  LogIn,
  Shield,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useTheme } from "@/components/ThemeProvider";
import KanbanBoard from "./components/KanbanBoard";
import CreateTaskDialog from "./components/CreateTaskDialog";
import { TranslationTask } from "../types";

function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')}
      className="h-8 w-8 p-0"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

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
    <ThemeProvider defaultTheme="light" storageKey="vibe-kanban-theme">
      <div className="min-h-screen bg-gradient-to-br from-primary/20 via-secondary/20 to-primary/30 dark:from-primary/10 dark:via-secondary/10 dark:to-primary/20">
        {/* Show unauthorized access page for non-@prolific.com users */}
        <SignedIn>
          {!isAuthorizedUser && (
            <div className="container mx-auto max-w-2xl py-16 px-4">
              <Card className="p-8 text-center bg-background/95 backdrop-blur-sm border-2 border-destructive/50">
                <CardContent className="space-y-6 p-0">
                  <Shield className="mx-auto h-16 w-16 text-destructive" />
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-destructive">
                      Access Denied
                    </h1>
                    <p className="text-lg text-muted-foreground">
                      This application is restricted to Prolific team members only.
                    </p>
                  </div>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
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
                    </p>
                    <SignOutButton>
                      <Button 
                        size="lg" 
                        variant="destructive"
                        className="text-lg px-8 py-3"
                      >
                        <LogOut className="mr-2 h-5 w-5" />
                        Sign Out & Try Again
                      </Button>
                    </SignOutButton>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </SignedIn>
        {/* Navigation Header */}
        <header className="bg-background/10 backdrop-blur-md border-b border-border/20">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo and Title */}
              <div className="flex items-center space-x-3">
                <Languages className="h-8 w-8 text-primary" />
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Translation Hub
                </h1>
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-4">
                {/* Poll Rate Selector */}
                <div className="flex items-center space-x-2">
                  <Select value={pollingInterval.toString()} onValueChange={(value) => setPollingInterval(Number(value))}>
                    <SelectTrigger className="w-24 bg-background/20 border-border/30 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1s</SelectItem>
                      <SelectItem value="5000">5s</SelectItem>
                      <SelectItem value="15000">15s</SelectItem>
                      <SelectItem value="30000">30s</SelectItem>
                      <SelectItem value="60000">60s</SelectItem>
                      <SelectItem value="300000">5min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Theme Toggle */}
                <ThemeToggle />

                {/* Auth Controls */}
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button variant="outline" className="bg-background/20 border-border/30 hover:bg-background/30">
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign In
                    </Button>
                  </SignInButton>
                </SignedOut>

                <SignedIn>
                  {isAuthorizedUser ? (
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => fetchTasks(true)}
                        disabled={loading}
                        className="bg-background/20 border-border/30 hover:bg-background/30"
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button 
                        onClick={() => setIsCreateDialogOpen(true)}
                        className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Task
                      </Button>
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: "w-8 h-8",
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <SignOutButton>
                      <Button variant="outline" className="bg-background/20 border-border/30 hover:bg-background/30">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </Button>
                    </SignOutButton>
                  )}
                </SignedIn>
              </div>
            </div>
          </div>
        </header>

        {/* Main app content - only for authorized users */}
        <SignedIn>
          {isAuthorizedUser && (
            <>
              <main className="container mx-auto py-8 px-4 max-w-7xl">
                <KanbanBoard tasks={tasks} loading={loading} />
              </main>

              <CreateTaskDialog
                open={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onSubmit={handleCreateTask}
              />
            </>
          )}
        </SignedIn>

        {/* Welcome page for signed out users */}
        <SignedOut>
          <div className="container mx-auto max-w-2xl py-16 px-4">
            <Card className="p-8 text-center bg-background/95 backdrop-blur-sm">
              <CardContent className="space-y-6 p-0">
                <Languages className="mx-auto h-16 w-16 text-primary" />
                <div className="space-y-4">
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Welcome to Translation Hub
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    Manage and track your translation tasks with editorial guidelines
                  </p>
                  <p className="text-muted-foreground">
                    Sign in to access your translation dashboard, create new tasks,
                    and track progress across multiple languages.
                  </p>
                </div>
                <SignInButton mode="modal">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-lg px-8 py-3"
                  >
                    <LogIn className="mr-2 h-5 w-5" />
                    Get Started
                  </Button>
                </SignInButton>
              </CardContent>
            </Card>
          </div>
        </SignedOut>
      </div>
    </ThemeProvider>
  );
};

export default App;
