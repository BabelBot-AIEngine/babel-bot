import React, { useState } from 'react';
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
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (taskData: {
    mediaArticle: { text: string; title?: string };
    editorialGuidelines: Record<string, any>;
    destinationLanguages: string[];
  }) => void;
}

const availableLanguages = [
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Polish',
  'Russian',
  'Japanese',
  'Chinese',
  'Korean',
  'Arabic',
];

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

  const handleLanguageChange = (event: SelectChangeEvent<string[]>) => {
    setSelectedLanguages(event.target.value as string[]);
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
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Create New Translation Task</DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Article Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            variant="outlined"
          />

          <TextField
            label="Article Text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            rows={6}
            fullWidth
            variant="outlined"
            required
            error={!text.trim()}
            helperText={!text.trim() ? 'Article text is required' : ''}
          />

          <Typography variant="h6" sx={{ mt: 2 }}>
            Editorial Guidelines (optional)
          </Typography>

          <TextField
            label="Tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            fullWidth
            variant="outlined"
            placeholder="e.g., Professional, Casual, Formal"
          />

          <TextField
            label="Style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            fullWidth
            variant="outlined"
            placeholder="e.g., Journalistic, Academic, Marketing"
          />

          <TextField
            label="Target Audience"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            fullWidth
            variant="outlined"
            placeholder="e.g., General public, Technical experts"
          />

          <FormControl fullWidth required error={selectedLanguages.length === 0}>
            <InputLabel>Destination Languages</InputLabel>
            <Select
              multiple
              value={selectedLanguages}
              onChange={handleLanguageChange}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {availableLanguages.map((language) => (
                <MenuItem key={language} value={language}>
                  {language}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!text.trim() || selectedLanguages.length === 0}
        >
          Create Task
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateTaskDialog;