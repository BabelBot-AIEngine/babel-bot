import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Chip,
  LinearProgress,
  IconButton,
  Divider,
  Button,
} from '@mui/material';
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
} from '@mui/icons-material';
import { TranslationTask } from '../../types';

interface TaskDetailsModalProps {
  task: TranslationTask | null;
  open: boolean;
  onClose: () => void;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ task, open, onClose }) => {
  if (!task) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusIcon = () => {
    switch (task.status) {
      case 'pending':
        return <PendingIcon />;
      case 'translating':
        return <TranslatingIcon />;
      case 'llm_verification':
        return <VerificationIcon />;
      case 'human_review':
        return <ReviewIcon />;
      case 'done':
        return <DoneIcon />;
      case 'failed':
        return <FailedIcon />;
      default:
        return <LanguageIcon />;
    }
  };

  const getStatusGradient = () => {
    switch (task.status) {
      case 'pending':
        return 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)';
      case 'translating':
        return 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)';
      case 'llm_verification':
        return 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)';
      case 'human_review':
        return 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)';
      case 'done':
        return 'linear-gradient(135deg, #10b981 0%, #34d399 100%)';
      case 'failed':
        return 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)';
      default:
        return 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)';
    }
  };

  const getStatusColor = () => {
    switch (task.status) {
      case 'pending':
        return '#ef4444';
      case 'translating':
        return '#f59e0b';
      case 'llm_verification':
        return '#3b82f6';
      case 'human_review':
        return '#8b5cf6';
      case 'done':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusTitle = () => {
    switch (task.status) {
      case 'pending':
        return 'Pending';
      case 'translating':
        return 'Translating';
      case 'llm_verification':
        return 'LLM Verification';
      case 'human_review':
        return 'Human Review';
      case 'done':
        return 'Done';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          maxHeight: '90vh',
        }
      }}
      BackdropProps={{
        sx: {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
        }
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background: getStatusGradient(),
          color: 'white',
          p: 3,
          borderRadius: '12px 12px 0 0',
          position: 'relative',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 2,
              background: 'rgba(255, 255, 255, 0.2)',
              mr: 2,
              backdropFilter: 'blur(10px)',
            }}
          >
            {React.cloneElement(getStatusIcon(), { 
              sx: { color: 'white', fontSize: 24 } 
            })}
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              Task #{task.id.split('_')[1]}
            </Typography>
            <Chip
              label={getStatusTitle()}
              size="small"
              sx={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                fontWeight: 600,
                backdropFilter: 'blur(10px)',
              }}
            />
          </Box>
          <IconButton
            onClick={onClose}
            sx={{
              color: 'white',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.2)',
              },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        
        {task.mediaArticle.title && (
          <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 500 }}>
            {task.mediaArticle.title}
          </Typography>
        )}
      </Box>

      <DialogContent sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          
          {/* Progress Section */}
          {(task.status === 'translating' || task.status === 'llm_verification' || task.status === 'human_review') && (
            <Box
              sx={{
                p: 3,
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '1px solid #e2e8f0',
                borderRadius: 2,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600 }}>
                  Progress
                </Typography>
                <Typography variant="h6" sx={{ color: getStatusColor(), fontWeight: 700 }}>
                  {task.progress || 0}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={task.progress || 0}
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  background: 'rgba(0, 0, 0, 0.06)',
                  '& .MuiLinearProgress-bar': {
                    background: getStatusGradient(),
                    borderRadius: 4,
                  },
                }}
              />
            </Box>
          )}

          {/* Error Section */}
          {task.error && (
            <Box
              sx={{
                p: 3,
                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                border: '1px solid #fecaca',
                borderRadius: 2,
              }}
            >
              <Typography
                variant="h6"
                sx={{ 
                  color: '#dc2626',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <ErrorIcon sx={{ fontSize: 20, mr: 1 }} />
                Error Details
              </Typography>
              <Typography variant="body2" sx={{ color: '#7f1d1d' }}>
                {task.error}
              </Typography>
            </Box>
          )}

          {/* Languages Section */}
          <Box>
            <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 2 }}>
              Destination Languages
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {task.destinationLanguages.map(lang => (
                <Chip
                  key={lang}
                  label={lang}
                  sx={{ 
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    background: getStatusGradient(),
                    color: 'white',
                    '&:hover': {
                      transform: 'scale(1.05)',
                    },
                    transition: 'transform 0.2s ease',
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Timestamps Section */}
          <Box>
            <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 2 }}>
              Timeline
            </Typography>
            <Box sx={{ display: 'flex', gap: 4 }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, mb: 0.5 }}>
                  Created
                </Typography>
                <Typography variant="body1" sx={{ color: '#1e293b', fontWeight: 500 }}>
                  {formatDate(task.createdAt)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600, mb: 0.5 }}>
                  Last Updated
                </Typography>
                <Typography variant="body1" sx={{ color: '#1e293b', fontWeight: 500 }}>
                  {formatDate(task.updatedAt)}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Divider sx={{ background: 'rgba(0, 0, 0, 0.06)' }} />

          {/* Article Content Section */}
          <Box>
            <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 2 }}>
              Article Content
            </Typography>
            <Box
              sx={{
                p: 3,
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
              <Typography 
                variant="body1" 
                sx={{ 
                  color: '#374151',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {task.mediaArticle.text}
              </Typography>
            </Box>
          </Box>

          {/* Results Section */}
          {task.result && task.status === 'done' && (
            <Box
              sx={{
                p: 3,
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '1px solid #bbf7d0',
                borderRadius: 2,
              }}
            >
              <Typography
                variant="h6"
                sx={{ 
                  color: '#16a34a',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 20, mr: 1 }} />
                Translation Complete
              </Typography>
              <Typography variant="body2" sx={{ color: '#15803d' }}>
                Successfully completed {task.result.translations.length} translation(s)
              </Typography>
            </Box>
          )}
        </Box>
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
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: `0 6px 16px ${getStatusColor()}50`,
            },
            transition: 'all 0.2s ease',
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TaskDetailsModal;