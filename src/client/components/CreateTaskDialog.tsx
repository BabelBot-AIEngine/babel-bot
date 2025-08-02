import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Box,
  Typography,
  SelectChangeEvent,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { fetchAvailableLanguages, getLanguageDisplayName } from '../../utils/languageUtils';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (taskData: {
    mediaArticle: { text: string; title?: string };
    editorialGuidelines: Record<string, any>;
    destinationLanguages: string[];
  }) => void;
}

const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [tone, setTone] = useState('');
  const [style, setStyle] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<Array<{ code: string; name: string }>>([]);
  const [languagesLoading, setLanguagesLoading] = useState(false);
  const [languagesError, setLanguagesError] = useState<string | null>(null);

  useEffect(() => {
    const loadLanguages = async () => {
      if (open && availableLanguages.length === 0 && !languagesLoading) {
        setLanguagesLoading(true);
        setLanguagesError(null);
        try {
          const languages = await fetchAvailableLanguages();
          setAvailableLanguages(languages);
        } catch (error) {
          console.error('Failed to load languages:', error);
          setLanguagesError(error instanceof Error ? error.message : 'Failed to load languages');
        } finally {
          setLanguagesLoading(false);
        }
      }
    };

    loadLanguages();
  }, [open, availableLanguages.length, languagesLoading]);

  const handleLanguageChange = (event: SelectChangeEvent<string[]>) => {
    setSelectedLanguages(event.target.value as string[]);
  };

  const retryLoadLanguages = async () => {
    setAvailableLanguages([]);
    setLanguagesError(null);
    setLanguagesLoading(true);
    try {
      const languages = await fetchAvailableLanguages();
      setAvailableLanguages(languages);
    } catch (error) {
      console.error('Failed to load languages:', error);
      setLanguagesError(error instanceof Error ? error.message : 'Failed to load languages');
    } finally {
      setLanguagesLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!text.trim() || selectedLanguages.length === 0) {
      return;
    }

    onSubmit({
      mediaArticle: {
        text: text.trim(),
        title: title.trim() || undefined,
      },
      editorialGuidelines: {
        tone: tone.trim() || undefined,
        style: style.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
      },
      destinationLanguages: selectedLanguages,
    });

    // Reset form
    setTitle('');
    setText('');
    setTone('');
    setStyle('');
    setTargetAudience('');
    setSelectedLanguages([]);
  };

  const handleClose = () => {
    setTitle('');
    setText('');
    setTone('');
    setStyle('');
    setTargetAudience('');
    setSelectedLanguages([]);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }
      }}
      BackdropProps={{
        sx: {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
        }
      }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: 'white',
          p: 3,
          borderRadius: '12px 12px 0 0',
        }}
      >
        <Typography 
          variant="h5" 
          sx={{ 
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <AddIcon sx={{ mr: 2, fontSize: 28 }} />
          Create New Translation Task
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
          Transform your content across languages with AI-powered precision
        </Typography>
      </Box>
      
      <DialogContent sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Article Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            variant="outlined"
            placeholder="Enter an optional title for your article"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                background: 'rgba(255, 255, 255, 0.8)',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.9)',
                },
                '&.Mui-focused': {
                  background: 'rgba(255, 255, 255, 1)',
                },
              },
            }}
          />

          <TextField
            label="Article Content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            rows={6}
            fullWidth
            variant="outlined"
            required
            error={!text.trim()}
            helperText={!text.trim() ? 'Article content is required' : `${text.length} characters`}
            placeholder="Paste or type your article content here..."
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                background: 'rgba(255, 255, 255, 0.8)',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.9)',
                },
                '&.Mui-focused': {
                  background: 'rgba(255, 255, 255, 1)',
                },
              },
            }}
          />

          <Box
            sx={{
              p: 3,
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              border: '1px solid #e2e8f0',
              borderRadius: 2,
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, color: '#1e293b', fontWeight: 600 }}>
              Editorial Guidelines
            </Typography>
            <Typography variant="body2" sx={{ mb: 3, color: '#64748b' }}>
              Define the tone and style to ensure consistent translations
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label="Tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                fullWidth
                variant="outlined"
                placeholder="Professional, Casual, Formal, Friendly..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    background: 'white',
                  },
                }}
              />

              <TextField
                label="Style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                fullWidth
                variant="outlined"
                placeholder="Journalistic, Academic, Marketing, Technical..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    background: 'white',
                  },
                }}
              />

              <TextField
                label="Target Audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                fullWidth
                variant="outlined"
                placeholder="General public, Technical experts, Students..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    background: 'white',
                  },
                }}
              />
            </Box>
          </Box>

          <FormControl 
            fullWidth 
            required 
            error={selectedLanguages.length === 0}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                background: 'rgba(255, 255, 255, 0.8)',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.9)',
                },
                '&.Mui-focused': {
                  background: 'rgba(255, 255, 255, 1)',
                },
              },
            }}
          >
            <InputLabel>Destination Languages *</InputLabel>
            <Select
              multiple
              value={selectedLanguages}
              onChange={handleLanguageChange}
              disabled={languagesLoading || !!languagesError}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip 
                      key={value} 
                      label={getLanguageDisplayName(value)} 
                      size="small"
                      sx={{
                        background: 'linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)',
                        color: 'white',
                        fontWeight: 600,
                      }}
                    />
                  ))}
                </Box>
              )}
            >
              {languagesLoading ? (
                <MenuItem disabled>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2">Loading languages from DeepL...</Typography>
                  </Box>
                </MenuItem>
              ) : languagesError ? (
                <MenuItem disabled>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1 }}>
                    <Typography variant="body2" color="error">
                      Failed to load languages
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {languagesError}
                    </Typography>
                    <Button
                      size="small"
                      onClick={retryLoadLanguages}
                      variant="outlined"
                      sx={{ mt: 1 }}
                    >
                      Retry
                    </Button>
                  </Box>
                </MenuItem>
              ) : availableLanguages.length === 0 ? (
                <MenuItem disabled>
                  <Typography variant="body2" color="text.secondary">
                    No languages available
                  </Typography>
                </MenuItem>
              ) : (
                availableLanguages.map((language) => (
                  <MenuItem key={language.code} value={language.code}>
                    {language.name}
                  </MenuItem>
                ))
              )}
            </Select>
            {selectedLanguages.length === 0 && (
              <Typography variant="caption" sx={{ color: '#ef4444', mt: 1 }}>
                Please select at least one destination language
              </Typography>
            )}
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 4, pt: 0 }}>
        <Button 
          onClick={handleClose}
          sx={{
            borderRadius: 2,
            px: 3,
            py: 1,
            color: '#64748b',
            '&:hover': {
              background: 'rgba(100, 116, 139, 0.04)',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!text.trim() || selectedLanguages.length === 0 || languagesLoading || !!languagesError || availableLanguages.length === 0}
          sx={{
            background: 'linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)',
            borderRadius: 2,
            px: 4,
            py: 1,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
            '&:hover': {
              background: 'linear-gradient(45deg, #4f46e5 30%, #7c3aed 90%)',
              transform: 'translateY(-1px)',
              boxShadow: '0 6px 16px rgba(99, 102, 241, 0.5)',
            },
            '&:disabled': {
              background: 'rgba(148, 163, 184, 0.3)',
              color: 'rgba(148, 163, 184, 0.7)',
              boxShadow: 'none',
            },
            transition: 'all 0.2s ease',
          }}
        >
          Create Task
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateTaskDialog;