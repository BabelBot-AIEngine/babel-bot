import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon, Translate as TranslateIcon } from '@mui/icons-material';
import KanbanBoard from './components/KanbanBoard';
import CreateTaskDialog from './components/CreateTaskDialog';
import { TranslationTask } from '../types';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6366f1',
      light: '#818cf8',
      dark: '#4f46e5',
    },
    secondary: {
      main: '#ec4899',
      light: '#f472b6',
      dark: '#db2777',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px 0 rgba(0, 0, 0, 0.15)',
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
  const [tasks, setTasks] = useState<TranslationTask[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(15000);
  const [isPolling, setIsPolling] = useState(false);

  const fetchTasks = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks(true);
    setIsPolling(true);
    const interval = setInterval(() => fetchTasks(false), pollingInterval);
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [pollingInterval]);

  const handleCreateTask = async (taskData: {
    mediaArticle: { text: string; title?: string };
    editorialGuidelines: Record<string, any>;
    destinationLanguages: string[];
  }) => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        fetchTasks(true);
      }
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box 
        sx={{ 
          flexGrow: 1, 
          minHeight: '100vh', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <AppBar 
          position="static" 
          elevation={0}
          sx={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Toolbar sx={{ py: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
              <TranslateIcon sx={{ mr: 2, fontSize: 32, color: 'white' }} />
              <Typography 
                variant="h6" 
                component="div" 
                sx={{ 
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '1.5rem',
                  background: 'linear-gradient(45deg, #ffffff 30%, #e0e7ff 90%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Translation Hub
              </Typography>
            </Box>
            <FormControl size="small" sx={{ mr: 2, minWidth: 120 }}>
              <InputLabel sx={{ color: 'white' }}>Poll Rate</InputLabel>
              <Select
                value={pollingInterval}
                onChange={(e) => setPollingInterval(Number(e.target.value))}
                label="Poll Rate"
                sx={{ 
                  color: 'white',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.23)',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.87)',
                  },
                  '& .MuiSvgIcon-root': {
                    color: 'white',
                  },
                }}
              >
                <MenuItem value={5000}>5s</MenuItem>
                <MenuItem value={15000}>15s</MenuItem>
                <MenuItem value={30000}>30s</MenuItem>
                <MenuItem value={60000}>60s</MenuItem>
                <MenuItem value={300000}>5min</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={fetchTasks}
                disabled={loading}
                sx={{
                  color: 'white',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    background: 'rgba(255, 255, 255, 0.2)',
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
                  background: 'linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)',
                  color: 'white',
                  fontWeight: 600,
                  px: 3,
                  '&:hover': {
                    background: 'linear-gradient(45deg, #4f46e5 30%, #7c3aed 90%)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                New Task
              </Button>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: 4 }}>
          <KanbanBoard tasks={tasks} loading={loading} />
        </Container>

        <CreateTaskDialog
          open={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onSubmit={handleCreateTask}
        />
      </Box>
    </ThemeProvider>
  );
};

export default App;