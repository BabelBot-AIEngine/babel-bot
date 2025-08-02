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
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import KanbanBoard from './components/KanbanBoard';
import CreateTaskDialog from './components/CreateTaskDialog';
import { TranslationTask } from '../types';

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
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Translation Task Board
          </Typography>
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
          <Button
            color="inherit"
            startIcon={<RefreshIcon />}
            onClick={() => fetchTasks(true)}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            color="inherit"
            startIcon={<AddIcon />}
            onClick={() => setIsCreateDialogOpen(true)}
          >
            New Task
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        <KanbanBoard tasks={tasks} loading={loading} />
      </Container>

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSubmit={handleCreateTask}
      />
    </Box>
  );
};

export default App;