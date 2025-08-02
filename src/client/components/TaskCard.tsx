import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress,
} from '@mui/material';
import {
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { TranslationTask } from '../../types';

interface TaskCardProps {
  task: TranslationTask;
  onClick: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {

  const getStatusIcon = () => {
    switch (task.status) {
      case 'failed':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'translating':
      case 'llm_verification':
      case 'human_review':
        return <ScheduleIcon color="primary" fontSize="small" />;
      default:
        return <LanguageIcon color="primary" fontSize="small" />;
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

  return (
    <Card
      elevation={0}
      onClick={onClick}
      sx={{
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 2.5,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: getStatusGradient(),
        },
        '&:hover': {
          transform: 'translateY(-4px) scale(1.02)',
          boxShadow: '0 12px 24px rgba(0, 0, 0, 0.15)',
          background: 'rgba(255, 255, 255, 0.95)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 1.5,
              background: getStatusGradient(),
              mr: 1.5,
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.12)',
            }}
          >
            {React.cloneElement(getStatusIcon(), { 
              sx: { color: 'white', fontSize: 16 } 
            })}
          </Box>
          <Typography
            variant="body2"
            sx={{ 
              fontWeight: 700, 
              flexGrow: 1,
              fontSize: '0.875rem',
              color: '#1e293b',
            }}
          >
            #{task.id.split('_')[1]}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: '#64748b',
              fontSize: '0.75rem',
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
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            color: '#374151',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          {task.mediaArticle.title || task.mediaArticle.text.substring(0, 60) + '...'}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {task.destinationLanguages.slice(0, 3).map(lang => (
            <Chip
              key={lang}
              label={lang}
              size="small"
              sx={{ 
                fontSize: '0.7rem',
                fontWeight: 600,
                background: 'linear-gradient(45deg, #f1f5f9 0%, #e2e8f0 100%)',
                color: '#475569',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #e2e8f0 0%, #cbd5e1 100%)',
                },
              }}
            />
          ))}
          {task.destinationLanguages.length > 3 && (
            <Chip
              label={`+${task.destinationLanguages.length - 3}`}
              size="small"
              sx={{ 
                fontSize: '0.7rem',
                fontWeight: 600,
                background: getStatusGradient(),
                color: 'white',
              }}
            />
          )}
        </Box>

        {(task.status === 'translating' || task.status === 'llm_verification' || task.status === 'human_review') && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                Progress
              </Typography>
              <Typography variant="caption" sx={{ color: '#1e293b', fontWeight: 700 }}>
                {task.progress || 0}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={task.progress || 0}
              sx={{ 
                height: 6, 
                borderRadius: 3,
                background: 'rgba(0, 0, 0, 0.06)',
                '& .MuiLinearProgress-bar': {
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
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              border: '1px solid #fecaca',
              borderRadius: 1.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ 
                color: '#dc2626',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
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