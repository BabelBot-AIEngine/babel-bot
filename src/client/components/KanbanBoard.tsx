import React, { useState } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Fade,
  Slide,
} from '@mui/material';
import { 
  HourglassEmpty as PendingIcon,
  Translate as TranslatingIcon,
  Psychology as VerificationIcon,
  Person as ReviewIcon,
  CheckCircle as DoneIcon,
  Error as FailedIcon,
} from '@mui/icons-material';
import TaskCard from './TaskCard';
import TaskDetailsModal from './TaskDetailsModal';
import { TranslationTask } from '../../types';

interface KanbanBoardProps {
  tasks: TranslationTask[];
  loading: boolean;
}

const statusColumns = [
  { 
    status: 'pending', 
    title: 'Pending', 
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
    icon: PendingIcon,
  },
  { 
    status: 'translating', 
    title: 'Translating', 
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    icon: TranslatingIcon,
  },
  { 
    status: 'llm_verification', 
    title: 'LLM Verification', 
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
    icon: VerificationIcon,
  },
  { 
    status: 'human_review', 
    title: 'Human Review', 
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
    icon: ReviewIcon,
  },
  { 
    status: 'done', 
    title: 'Done', 
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    icon: DoneIcon,
  },
  { 
    status: 'failed', 
    title: 'Failed', 
    color: '#6b7280',
    gradient: 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)',
    icon: FailedIcon,
  },
];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, loading }) => {
  const [selectedTask, setSelectedTask] = useState<TranslationTask | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const handleTaskClick = (task: TranslationTask) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  return (
    <Box>
      {loading && (
        <LinearProgress 
          sx={{ 
            mb: 3, 
            borderRadius: 2,
            height: 6,
            background: 'rgba(255, 255, 255, 0.2)',
            '& .MuiLinearProgress-bar': {
              background: 'linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)',
              borderRadius: 2,
            }
          }} 
        />
      )}
      
      <Grid container spacing={3}>
        {statusColumns.map((column, index) => {
          const columnTasks = getTasksByStatus(column.status);
          const IconComponent = column.icon;
          return (
            <Grid item xs={12} md={2} key={column.status}>
              <Slide direction="up" in={true} timeout={300 + index * 100}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    minHeight: '700px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      mb: 3,
                      pb: 2,
                      borderBottom: '2px solid rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        background: column.gradient,
                        mr: 2,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      }}
                    >
                      <IconComponent sx={{ color: 'white', fontSize: 20 }} />
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography
                        variant="h6"
                        sx={{
                          color: '#1e293b',
                          fontWeight: 700,
                          fontSize: '1rem',
                          mb: 0.5,
                        }}
                      >
                        {column.title}
                      </Typography>
                      <Chip
                        label={`${columnTasks.length} tasks`}
                        size="small"
                        sx={{
                          background: column.gradient,
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          height: 24,
                          '& .MuiChip-label': {
                            px: 1.5,
                          },
                        }}
                      />
                    </Box>
                  </Box>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {columnTasks.map((task, taskIndex) => (
                      <Fade in={true} timeout={500 + taskIndex * 100} key={task.id}>
                        <div>
                          <TaskCard task={task} onClick={() => handleTaskClick(task)} />
                        </div>
                      </Fade>
                    ))}
                    {columnTasks.length === 0 && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 120,
                          color: '#64748b',
                          fontSize: '0.875rem',
                          fontStyle: 'italic',
                        }}
                      >
                        No tasks in this column
                      </Box>
                    )}
                  </Box>
                </Paper>
              </Slide>
            </Grid>
          );
        })}
      </Grid>
      
      <TaskDetailsModal
        task={selectedTask}
        open={isModalOpen}
        onClose={handleCloseModal}
      />
    </Box>
  );
};

export default KanbanBoard;