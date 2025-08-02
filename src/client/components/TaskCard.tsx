import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress,
  IconButton,
  Collapse,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { TranslationTask, getLanguageStatesForTask, hasMultipleLanguageStates, LanguageTaskStatus } from '../../types';

interface TaskCardProps {
  task: TranslationTask;
}

const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

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

  const getLanguageStatusColor = (status: LanguageTaskStatus): string => {
    switch (status) {
      case 'done':
        return '#4caf50';
      case 'failed':
        return '#f44336';
      case 'human_review':
        return '#ff9800';
      case 'llm_verification':
        return '#2196f3';
      case 'translating':
        return '#9c27b0';
      case 'pending':
      default:
        return '#757575';
    }
  };

  const languageStates = getLanguageStatesForTask(task);
  const hasSplitStates = hasMultipleLanguageStates(task);

  return (
    <Card
      elevation={1}
      sx={{
        transition: 'all 0.2s',
        '&:hover': {
          elevation: 3,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getStatusIcon()}
          <Typography
            variant="body2"
            sx={{ ml: 1, fontWeight: 'bold', flexGrow: 1 }}
          >
            {task.id.split('_')[1]}
            {hasSplitStates && (
              <Chip
                label="SPLIT"
                size="small"
                sx={{
                  ml: 1,
                  height: 16,
                  fontSize: '0.6rem',
                  backgroundColor: '#ff5722',
                  color: 'white',
                }}
              />
            )}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        <Typography
          variant="body2"
          sx={{
            mb: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {task.mediaArticle.title || task.mediaArticle.text.substring(0, 50) + '...'}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {task.destinationLanguages.map(lang => {
            const langStatus = languageStates.get(lang) || 'pending';
            const statusColor = getLanguageStatusColor(langStatus);
            return (
              <Chip
                key={lang}
                label={lang}
                size="small"
                variant={hasSplitStates ? "filled" : "outlined"}
                sx={{ 
                  fontSize: '0.7rem',
                  ...(hasSplitStates && {
                    backgroundColor: statusColor,
                    color: 'white',
                    '&:hover': {
                      backgroundColor: statusColor,
                      opacity: 0.8,
                    }
                  })
                }}
              />
            );
          })}
        </Box>

        {(task.status === 'translating' || task.status === 'llm_verification' || task.status === 'human_review') && (
          <Box sx={{ mb: 1 }}>
            <LinearProgress
              variant="determinate"
              value={task.progress || 0}
              sx={{ height: 4, borderRadius: 2 }}
            />
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
              {task.progress || 0}%
            </Typography>
          </Box>
        )}

        {task.error && (
          <Typography
            variant="caption"
            color="error"
            sx={{ display: 'block', mb: 1 }}
          >
            Error: {task.error}
          </Typography>
        )}

        <Collapse in={expanded}>
          <Divider sx={{ my: 1 }} />
          
          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            <strong>Created:</strong> {formatDate(task.createdAt)}
          </Typography>
          
          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            <strong>Updated:</strong> {formatDate(task.updatedAt)}
          </Typography>

          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            <strong>Article Text:</strong>
          </Typography>
          <Typography
            variant="body2"
            sx={{
              p: 1,
              backgroundColor: '#f5f5f5',
              borderRadius: 1,
              fontSize: '0.75rem',
              maxHeight: 100,
              overflow: 'auto',
            }}
          >
            {task.mediaArticle.text}
          </Typography>

          {task.result && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                <strong>Translations:</strong> {task.result.translations.length}
              </Typography>
              {hasSplitStates && (
                <Box sx={{ mt: 1 }}>
                  {task.result.translations.map((translation, index) => (
                    <Box key={index} sx={{ mb: 1, p: 1, backgroundColor: '#f8f9fa', borderRadius: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        <strong>{translation.language}:</strong>
                        <Chip
                          label={translation.status || 'done'}
                          size="small"
                          sx={{
                            ml: 1,
                            height: 16,
                            fontSize: '0.6rem',
                            backgroundColor: getLanguageStatusColor(translation.status || 'done'),
                            color: 'white',
                          }}
                        />
                      </Typography>
                      {translation.complianceScore && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                          Score: {translation.complianceScore}%
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default TaskCard;