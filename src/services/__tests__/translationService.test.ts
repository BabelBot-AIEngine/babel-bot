import { TranslationService } from '../translationService';
import { AnthropicReviewResponse, ParsedReviewResult, EditorialGuidelines } from '../../types';

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    service = new TranslationService();
    process.env.DEMO_MODE = 'false';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.DEEPL_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseReviewResponse', () => {
    it('should correctly parse a well-formatted Anthropic review response', () => {
      const mockReviewText = `1. The tone is professional and appropriate for the target audience
2. The writing style maintains consistency with financial journalism standards
3. Technical terminology is used accurately and appropriately
4. The content adheres to the specified editorial guidelines

editorialComplianceScore: 92`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result).toEqual({
        notes: [
          'The tone is professional and appropriate for the target audience',
          'The writing style maintains consistency with financial journalism standards',
          'Technical terminology is used accurately and appropriately',
          'The content adheres to the specified editorial guidelines'
        ],
        score: 92
      });
    });

    it('should handle response with mixed formatting', () => {
      const mockReviewText = `Here are my observations:

1. Good overall tone alignment with guidelines
2. Style needs minor improvements in formal register
3. Target audience considerations are well addressed

Some additional notes here.

editorialComplianceScore: 78`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result).toEqual({
        notes: [
          'Good overall tone alignment with guidelines',
          'Style needs minor improvements in formal register',
          'Target audience considerations are well addressed',
          'Some additional notes here.'
        ],
        score: 78
      });
    });

    it('should handle response with decimal score', () => {
      const mockReviewText = `1. Excellent adherence to guidelines
editorialComplianceScore: 95.5`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result).toEqual({
        notes: ['Excellent adherence to guidelines'],
        score: 95.5
      });
    });

    it('should use default score when score is missing', () => {
      const mockReviewText = `1. Good translation quality
2. Maintains original meaning well`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result).toEqual({
        notes: [
          'Good translation quality',
          'Maintains original meaning well'
        ],
        score: 50
      });
    });

    it('should handle edge case scores and clamp to valid range', () => {
      const mockReviewText = `1. Test note
editorialComplianceScore: 150`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result.score).toBe(100);
    });

    it('should handle zero score correctly', () => {
      const mockReviewText = `1. Major issues found
editorialComplianceScore: 0`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result.score).toBe(1); // Minimum score is 1
    });

    it('should provide default notes when no valid notes are found', () => {
      const mockReviewText = `editorialComplianceScore: 85`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result).toEqual({
        notes: ['Review completed successfully'],
        score: 85
      });
    });
  });

  describe('buildReviewPrompt', () => {
    it('should build a complete prompt with all guidelines', () => {
      const text = 'Sample translated text';
      const guidelines: EditorialGuidelines = {
        tone: 'Professional and authoritative',
        style: 'Clear and concise',
        targetAudience: 'Financial professionals',
        restrictions: ['No colloquialisms', 'Avoid technical jargon'],
        requirements: ['Use active voice', 'Include data sources']
      };

      const prompt = (service as any).buildReviewPrompt(text, guidelines);

      expect(prompt).toContain('Sample translated text');
      expect(prompt).toContain('Professional and authoritative');
      expect(prompt).toContain('Clear and concise');
      expect(prompt).toContain('Financial professionals');
      expect(prompt).toContain('No colloquialisms, Avoid technical jargon');
      expect(prompt).toContain('Use active voice, Include data sources');
      expect(prompt).toContain('editorialComplianceScore');
    });

    it('should handle partial guidelines gracefully', () => {
      const text = 'Sample text';
      const guidelines: EditorialGuidelines = {
        tone: 'Casual'
      };

      const prompt = (service as any).buildReviewPrompt(text, guidelines);

      expect(prompt).toContain('Sample text');
      expect(prompt).toContain('Casual');
      expect(prompt).not.toContain('undefined');
    });
  });

  describe('type safety', () => {
    it('should ensure AnthropicReviewResponse matches expected structure', () => {
      const mockResponse: AnthropicReviewResponse = {
        content: [{
          type: 'text',
          text: 'Mock review response'
        }],
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      };

      expect(mockResponse.content[0].type).toBe('text');
      expect(mockResponse.content[0].text).toBe('Mock review response');
      expect(mockResponse.role).toBe('assistant');
      expect(typeof mockResponse.usage.input_tokens).toBe('number');
      expect(typeof mockResponse.usage.output_tokens).toBe('number');
    });

    it('should ensure ParsedReviewResult has correct structure', () => {
      const mockResult: ParsedReviewResult = {
        notes: ['Test note 1', 'Test note 2'],
        score: 85
      };

      expect(Array.isArray(mockResult.notes)).toBe(true);
      expect(typeof mockResult.score).toBe('number');
      expect(mockResult.notes.every(note => typeof note === 'string')).toBe(true);
    });
  });

  describe('real-world response examples', () => {
    it('should handle typical Financial Times style review', () => {
      const mockReviewText = `1. The translation maintains the authoritative tone expected in financial journalism
2. Technical financial terms are accurately translated and contextually appropriate
3. The formal register is consistent throughout the piece
4. Market terminology follows FT style guidelines correctly
5. The piece maintains objectivity without editorial bias

editorialComplianceScore: 88`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result.notes).toHaveLength(5);
      expect(result.score).toBe(88);
      expect(result.notes[0]).toContain('authoritative tone');
      expect(result.notes[4]).toContain('objectivity');
    });

    it('should handle Monzo style review with casual tone', () => {
      const mockReviewText = `1. The friendly, approachable tone aligns well with Monzo's brand voice
2. Complex financial concepts are explained in simple, accessible language  
3. The conversational style feels natural and engaging
4. Technical jargon is appropriately simplified for general audience
5. Maintains transparency and trustworthiness throughout

editorialComplianceScore: 91`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result.notes).toHaveLength(5);
      expect(result.score).toBe(91);
      expect(result.notes[0]).toContain('friendly, approachable');
      expect(result.notes[2]).toContain('conversational style');
    });

    it('should handle response with issues found', () => {
      const mockReviewText = `1. The tone is overly casual for the intended professional audience
2. Several technical terms are incorrectly translated
3. The style lacks consistency in formal register
4. Some cultural references may not translate effectively
5. Minor grammar issues affect readability

editorialComplianceScore: 62`;

      const result = (service as any).parseReviewResponse(mockReviewText);

      expect(result.notes).toHaveLength(5);
      expect(result.score).toBe(62);
      expect(result.notes[0]).toContain('overly casual');
      expect(result.notes[1]).toContain('incorrectly translated');
    });
  });
});