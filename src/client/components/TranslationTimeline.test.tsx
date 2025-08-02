import React from 'react';
import { render, screen } from '@testing-library/react';
import TranslationTimeline from './TranslationTimeline';
import { LanguageTaskStatus } from '../../types';

describe('TranslationTimeline', () => {
  it('should render timeline for completed translation', () => {
    render(
      <TranslationTimeline 
        currentStatus="done" 
        language="French" 
      />
    );
    
    expect(screen.getByText('Translation Status for French')).toBeInTheDocument();
    expect(screen.getByText('Status: Done')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('should render timeline for failed translation', () => {
    render(
      <TranslationTimeline 
        currentStatus="failed" 
        language="German" 
      />
    );
    
    expect(screen.getByText('Translation Status for German')).toBeInTheDocument();
    expect(screen.getByText('Status: Failed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('should render timeline for in-progress translation', () => {
    render(
      <TranslationTimeline 
        currentStatus="llm_verification" 
        language="Italian" 
      />
    );
    
    expect(screen.getByText('Translation Status for Italian')).toBeInTheDocument();
    expect(screen.getByText('Status: LLM Check')).toBeInTheDocument();
    expect(screen.getByText('LLM Check')).toBeInTheDocument();
  });

  it('should render all translation states', () => {
    render(
      <TranslationTimeline 
        currentStatus="human_review" 
        language="Spanish" 
      />
    );
    
    // All states should be present in the timeline
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Translating')).toBeInTheDocument();
    expect(screen.getByText('LLM Check')).toBeInTheDocument();
    expect(screen.getByText('Human Review')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});