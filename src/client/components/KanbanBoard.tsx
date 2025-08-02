import React from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  LinearProgress,
  Chip,
} from '@mui/material';
import TaskCard from './TaskCard';
import { TranslationTask, hasMultipleLanguageStates, getLanguageStatesForTask } from '../../types';

interface KanbanBoardProps {
  tasks: TranslationTask[];
  loading: boolean;
}

const statusColumns = [
  { status: 'pending', title: 'Pending', color: '#f44336' },
  { status: 'translating', title: 'Translating', color: '#ff9800' },
  { status: 'llm_verification', title: 'LLM Verification', color: '#2196f3' },
  { status: 'human_review', title: 'Human Review', color: '#9c27b0' },
  { status: 'done', title: 'Done', color: '#4caf50' },
  { status: 'failed', title: 'Failed', color: '#607d8b' },
];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, loading }) => {
  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const getLanguageCountByStatus = (status: string) => {
    let count = 0;
    tasks.forEach(task => {
      if (hasMultipleLanguageStates(task)) {
        const languageStates = getLanguageStatesForTask(task);
        languageStates.forEach(langStatus => {
          if (langStatus === status) count++;
        });
      }
    });
    return count;
  };

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      
      <Grid container spacing={2}>
        {statusColumns.map(column => {
          const columnTasks = getTasksByStatus(column.status);
          const splitLanguageCount = getLanguageCountByStatus(column.status);
          return (
            <Grid item xs={12} md={2} key={column.status}>
              <Paper
                elevation={2}
                sx={{
                  p: 2,
                  minHeight: '600px',
                  backgroundColor: '#fafafa',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      color: column.color,
                      fontWeight: 'bold',
                    }}
                  >
                    {column.title}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Chip
                      label={columnTasks.length}
                      size="small"
                      sx={{
                        backgroundColor: column.color,
                        color: 'white',
                      }}
                    />
                    {splitLanguageCount > 0 && (
                      <Chip
                        label={`+${splitLanguageCount}`}
                        size="small"
                        sx={{
                          backgroundColor: '#ff5722',
                          color: 'white',
                          fontSize: '0.7rem',
                        }}
                      />
                    )}
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {columnTasks.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default KanbanBoard;