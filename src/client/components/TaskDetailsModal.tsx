import React, { useState } from 'react';
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
  ExpandMore as ExpandMoreIcon,
  Article as ArticleIcon,
  Gavel as GuidelinesIcon,
  Score as ScoreIcon,
  ContentCopy as CopyIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import { TranslationTask, LanguageTaskStatus, getLanguageStatesForTask } from '../../types';
import { getLanguageDisplayName } from '../../utils/languageUtils';
import TranslationTimeline from './TranslationTimeline';

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
      {value === index && (
        <Box sx={{ py: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ task, open, onClose }) => {
  const [tabValue, setTabValue] = useState(0);

  if (!task) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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

  const getComplianceRating = (score?: number) => {
    if (!score) return 0;
    return score / 20; // Convert 0-100 to 0-5 scale
  };

  const getComplianceColor = (score?: number) => {
    if (!score) return '#9ca3af';
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getGuideDisplayName = (guide?: string) => {
    if (!guide) return 'No specific guide';
    
    // Convert guide type to display name with filename indication
    const guideMap: Record<string, string> = {
      'financialtimes': 'Financial Times (financialtimes.txt)',
      'monzo': 'Monzo (monzo.txt)', 
      'prolific': 'Prolific (prolific.txt)',
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
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          maxHeight: '95vh',
          minHeight: '80vh',
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
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Created {formatDate(task.createdAt)}
              </Typography>
            </Box>
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

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', background: 'rgba(248, 250, 252, 0.8)' }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 3,
            '& .MuiTab-root': {
              fontWeight: 600,
              textTransform: 'none',
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
          {task.result && (
            <Tab 
              label={`Translations (${task.result.translations.length})`}
              icon={<TranslatingIcon />} 
              iconPosition="start"
              sx={{ minHeight: 60 }}
            />
          )}
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0, minHeight: '400px' }}>
        {/* Overview Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ px: 4 }}>
            <Grid container spacing={4}>
              {/* Progress Section */}
              {(task.status === 'translating' || task.status === 'llm_verification' || task.status === 'human_review') && (
                <Grid item xs={12}>
                  <Card
                    sx={{
                      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                    }}
                  >
                    <CardContent>
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
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Error Section */}
              {task.error && (
                <Grid item xs={12}>
                  <Card
                    sx={{
                      background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                      border: '1px solid #fecaca',
                      borderRadius: 2,
                    }}
                  >
                    <CardContent>
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
                      <Typography variant="body1" sx={{ color: '#7f1d1d' }}>
                        {task.error}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* Languages and Timeline */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 2 }}>
                      Target Languages
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {task.destinationLanguages.map(lang => {
                        const languageStates = getLanguageStatesForTask(task);
                        const langStatus = languageStates.get(lang) || 'pending';
                        const isFailedLang = langStatus === 'failed';
                        
                        const getLanguageStatusGradient = (status: LanguageTaskStatus) => {
                          switch (status) {
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
                          <Box key={lang} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                            <Chip
                              label={getLanguageDisplayName(lang)}
                              sx={{ 
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                background: getLanguageStatusGradient(langStatus),
                                color: 'white',
                                border: isFailedLang ? '2px solid #dc2626' : 'none',
                                '&:hover': {
                                  transform: 'scale(1.05)',
                                },
                                transition: 'transform 0.2s ease',
                              }}
                            />
                            <Typography variant="caption" sx={{ 
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: isFailedLang ? '#dc2626' : '#64748b',
                              textTransform: 'uppercase',
                              textAlign: 'center'
                            }}>
                              {langStatus.replace('_', ' ')}
                            </Typography>
                            {isFailedLang && (
                              <Box sx={{ 
                                width: 6, 
                                height: 6, 
                                borderRadius: '50%', 
                                backgroundColor: '#dc2626',
                                animation: 'pulse 2s infinite'
                              }} />
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 2 }}>
                      Timeline
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                  </CardContent>
                </Card>
              </Grid>

              {/* Original Article */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600 }}>
                        Original Article
                      </Typography>
                      <IconButton
                        onClick={() => copyToClipboard(task.mediaArticle.text)}
                        sx={{
                          background: 'rgba(99, 102, 241, 0.1)',
                          '&:hover': {
                            background: 'rgba(99, 102, 241, 0.2)',
                          },
                        }}
                      >
                        <CopyIcon sx={{ color: '#6366f1' }} />
                      </IconButton>
                    </Box>
                    <Box
                      sx={{
                        p: 3,
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        maxHeight: 400,
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
                <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 3 }}>
                  Editorial Guide Used
                </Typography>
                
                <Box
                  sx={{
                    p: 3,
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    border: '1px solid #fbbf24',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <GuidelinesIcon sx={{ color: '#d97706', fontSize: 24 }} />
                  <Box>
                    <Typography variant="subtitle1" sx={{ color: '#92400e', fontWeight: 600, mb: 0.5 }}>
                      Guide Source
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#78350f', fontWeight: 500 }}>
                      {getGuideDisplayName(task.guide)}
                    </Typography>
                    {task.guide && (
                      <Typography variant="caption" sx={{ color: '#a16207', mt: 0.5, display: 'block' }}>
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
                <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 3 }}>
                  Editorial Guidelines Applied
                </Typography>
                
                <Grid container spacing={3}>
                  {task.editorialGuidelines.tone && (
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{
                          p: 3,
                          background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
                          border: '1px solid #c4b5fd',
                          borderRadius: 2,
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ color: '#6b46c1', fontWeight: 600, mb: 1 }}>
                          Tone
                        </Typography>
                        <Typography variant="body1" sx={{ color: '#4c1d95' }}>
                          {task.editorialGuidelines.tone}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {task.editorialGuidelines.style && (
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{
                          p: 3,
                          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                          border: '1px solid #93c5fd',
                          borderRadius: 2,
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ color: '#1d4ed8', fontWeight: 600, mb: 1 }}>
                          Style
                        </Typography>
                        <Typography variant="body1" sx={{ color: '#1e3a8a' }}>
                          {task.editorialGuidelines.style}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {task.editorialGuidelines.targetAudience && (
                    <Grid item xs={12} md={4}>
                      <Box
                        sx={{
                          p: 3,
                          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                          border: '1px solid #6ee7b7',
                          borderRadius: 2,
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ color: '#047857', fontWeight: 600, mb: 1 }}>
                          Target Audience
                        </Typography>
                        <Typography variant="body1" sx={{ color: '#064e3b' }}>
                          {task.editorialGuidelines.targetAudience}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {(!task.editorialGuidelines.tone && !task.editorialGuidelines.style && !task.editorialGuidelines.targetAudience) && (
                    <Grid item xs={12}>
                      <Box
                        sx={{
                          p: 4,
                          background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                          border: '1px solid #e5e7eb',
                          borderRadius: 2,
                          textAlign: 'center',
                        }}
                      >
                        <Typography variant="body1" sx={{ color: '#6b7280', fontStyle: 'italic' }}>
                          No specific editorial guidelines were provided for this translation task.
                        </Typography>
                        {task.guide && (
                          <Typography variant="body2" sx={{ color: '#9ca3af', mt: 1 }}>
                            However, the translation followed the {task.guide} editorial guide standards.
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
        {task.result && (
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ px: 4 }}>
              <Typography variant="h6" sx={{ color: '#1e293b', fontWeight: 600, mb: 3 }}>
                Translation Results
              </Typography>
              
              {/* Translation Status Summary */}
              <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ color: '#1e293b', fontWeight: 600, mb: 2 }}>
                    Status Overview
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {task.result.translations.map((translation, index) => {
                      const translationStatus = (translation.status || 'done') as LanguageTaskStatus;
                      const isFailedTranslation = translationStatus === 'failed';
                      
                      return (
                        <Box key={index} sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 1,
                          p: 1.5,
                          background: isFailedTranslation 
                            ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
                            : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                          border: `1px solid ${isFailedTranslation ? '#fecaca' : '#bbf7d0'}`,
                          borderRadius: 2
                        }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                            {getLanguageDisplayName(translation.language)}:
                          </Typography>
                          <Chip
                            label={translationStatus.replace('_', ' ').toUpperCase()}
                            size="small"
                            sx={{
                              backgroundColor: isFailedTranslation ? '#ef4444' : '#10b981',
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '0.7rem'
                            }}
                          />
                          {translation.complianceScore && (
                            <Typography variant="caption" sx={{ 
                              color: isFailedTranslation ? '#dc2626' : '#059669',
                              fontWeight: 600 
                            }}>
                              ({translation.complianceScore}%)
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                  
                  {/* Quick stats */}
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e2e8f0' }}>
                    <Box sx={{ display: 'flex', gap: 4 }}>
                      <Typography variant="body2" sx={{ color: '#059669', fontWeight: 600 }}>
                        ✓ Successful: {task.result.translations.filter(t => t.status !== 'failed').length}
                      </Typography>
                      {task.result.translations.some(t => t.status === 'failed') && (
                        <Typography variant="body2" sx={{ color: '#dc2626', fontWeight: 600 }}>
                          ✗ Failed: {task.result.translations.filter(t => t.status === 'failed').length}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {task.result.translations.map((translation, index) => {
                  const translationStatus = (translation.status || 'done') as LanguageTaskStatus;
                  const isFailedTranslation = translationStatus === 'failed';
                  
                  return (
                    <Card 
                      key={index} 
                      sx={{ 
                        overflow: 'visible',
                        border: isFailedTranslation ? '2px solid #ef4444' : '1px solid #e2e8f0',
                        background: isFailedTranslation 
                          ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' 
                          : 'white'
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Chip
                              label={getLanguageDisplayName(translation.language)}
                              sx={{
                                background: isFailedTranslation 
                                  ? 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
                                  : getStatusGradient(),
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                              }}
                            />
                            {isFailedTranslation && (
                              <Chip
                                label="FAILED"
                                size="small"
                                sx={{
                                  backgroundColor: '#dc2626',
                                  color: 'white',
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  animation: 'pulse 2s infinite'
                                }}
                              />
                            )}
                            {translation.complianceScore && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <ScoreIcon sx={{ color: getComplianceColor(translation.complianceScore), fontSize: 20 }} />
                                <Typography variant="body2" sx={{ fontWeight: 600, color: getComplianceColor(translation.complianceScore) }}>
                                  Compliance: {translation.complianceScore}%
                                </Typography>
                                <Rating
                                  value={getComplianceRating(translation.complianceScore)}
                                  readOnly
                                  size="small"
                                  sx={{
                                    '& .MuiRating-iconFilled': {
                                      color: getComplianceColor(translation.complianceScore),
                                    },
                                  }}
                                />
                              </Box>
                            )}
                          </Box>
                          <IconButton
                            onClick={() => copyToClipboard(translation.translatedText)}
                            sx={{
                              background: 'rgba(99, 102, 241, 0.1)',
                              '&:hover': {
                                background: 'rgba(99, 102, 241, 0.2)',
                              },
                            }}
                          >
                            <CopyIcon sx={{ color: '#6366f1' }} />
                          </IconButton>
                        </Box>

                        {/* Translation Timeline */}
                        <TranslationTimeline 
                          currentStatus={translationStatus}
                          language={getLanguageDisplayName(translation.language)}
                        />
                        
                        {/* Alert box for failed translations */}
                        {isFailedTranslation && (
                          <Box sx={{
                            p: 2,
                            mt: 2,
                            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                            border: '1px solid #f87171',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                          }}>
                            <ErrorIcon sx={{ color: '#dc2626', fontSize: 20 }} />
                            <Typography variant="body2" sx={{ color: '#7f1d1d', fontWeight: 600 }}>
                              This translation failed during processing. Please check the review notes below for details.
                            </Typography>
                          </Box>
                        )}

                        <Box
                        sx={{
                          p: 3,
                          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                          border: '1px solid #e2e8f0',
                          borderRadius: 2,
                          mb: 2,
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
                          {translation.translatedText}
                        </Typography>
                      </Box>

                      {translation.reviewNotes && translation.reviewNotes.length > 0 && (
                        <Accordion sx={{ boxShadow: 'none', border: '1px solid #e2e8f0' }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              Review Notes ({translation.reviewNotes.length})
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {translation.reviewNotes.map((note, noteIndex) => (
                                <Typography key={noteIndex} variant="body2" sx={{ color: '#64748b' }}>
                                  • {note}
                                </Typography>
                              ))}
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>

              {task.result.processedAt && (
                <Box sx={{ mt: 3, p: 2, background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ color: '#16a34a', fontWeight: 600, textAlign: 'center' }}>
                    ✓ Processing completed on {formatDate(task.result.processedAt)}
                  </Typography>
                </Box>
              )}
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