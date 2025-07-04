// Content Processing Service Implementation

import { 
  FrontMatter, 
  ProcessingOptions, 
  ValidationResult, 
  ValidationError,
  Disposable 
} from '../../core/types';
import { IContentProcessor, IFrontMatterProcessor } from '../../core/tokens';
import { globalLogger } from '../../core/logging';

export class ContentProcessingService implements IContentProcessor, IFrontMatterProcessor, Disposable {
  private isDisposed = false;

  constructor() {}

  /**
   * Process content with front-matter processing
   * @param content Raw content
   * @param options Processing options
   * @returns Processed content
   */
  async process(content: string, options: ProcessingOptions): Promise<string> {
    if (this.isDisposed) {
      throw new Error('ContentProcessingService is disposed');
    }

    try {
      // Extract front-matter
      const frontMatter = await this.extract(content);
      
      // Update front-matter based on options
      const updatedFrontMatter = await this.updateFrontMatter(frontMatter, options);
      
      // Reassemble content
      const processedContent = await this.reassemble(updatedFrontMatter, content);
      
      // Validate if requested
      if (options.validateFrontMatter) {
        const validationResult = await this.validate(processedContent);
        if (!validationResult.isValid) {
          throw new Error(`Content validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
        }
      }

      return processedContent;
    } catch (error) {
      globalLogger.error('Error processing content', error);
      throw error;
    }
  }

  /**
   * Validate content and front-matter
   * @param content Content to validate
   * @returns Validation result
   */
  async validate(content: string): Promise<ValidationResult> {
    if (this.isDisposed) {
      throw new Error('ContentProcessingService is disposed');
    }

    const errors: ValidationError[] = [];

    try {
      // Extract front-matter for validation
      const frontMatter = await this.extract(content);
      
      // Check for required fields (this would come from config)
      const requiredFields = ['title']; // Default required fields
      
      for (const field of requiredFields) {
        if (!frontMatter[field] || frontMatter[field] === '') {
          errors.push({
            field,
            message: `Required field '${field}' is missing or empty`
          });
        }
      }

      // Validate date format if present
      if (frontMatter.date) {
        if (!this.isValidDate(frontMatter.date)) {
          errors.push({
            field: 'date',
            message: 'Invalid date format'
          });
        }
      }

      // Validate tags array if present
      if (frontMatter.tags && !Array.isArray(frontMatter.tags)) {
        errors.push({
          field: 'tags',
          message: 'Tags must be an array'
        });
      }

      // Validate categories array if present
      if (frontMatter.categories && !Array.isArray(frontMatter.categories)) {
        errors.push({
          field: 'categories',
          message: 'Categories must be an array'
        });
      }

    } catch (error) {
      errors.push({
        field: 'frontmatter',
        message: `Error parsing front-matter: ${error.message}`
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract front-matter from content
   * @param content Content to extract from
   * @returns Extracted front-matter
   */
  async extract(content: string): Promise<FrontMatter> {
    if (this.isDisposed) {
      throw new Error('ContentProcessingService is disposed');
    }

    try {
      const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      
      if (!frontMatterMatch) {
        // No front-matter found, return empty object
        return {};
      }

      const frontMatterText = frontMatterMatch[1];
      const frontMatter = this.parseYaml(frontMatterText);
      
      return frontMatter;
    } catch (error) {
      globalLogger.error('Error extracting front-matter', error);
      throw new Error(`Failed to extract front-matter: ${error.message}`);
    }
  }

  /**
   * Create content with updated front-matter
   * @param content Original content
   * @param updates Front-matter updates
   * @returns Updated content
   */
  async updateContent(content: string, updates: Partial<FrontMatter>): Promise<string> {
    if (this.isDisposed) {
      throw new Error('ContentProcessingService is disposed');
    }

    try {
      const currentFrontMatter = await this.extract(content);
      const mergedFrontMatter = { ...currentFrontMatter, ...updates };
      return await this.reassemble(mergedFrontMatter, content);
    } catch (error) {
      globalLogger.error('Error updating content', error);
      throw error;
    }
  }

  /**
   * Strip front-matter from content
   * @param content Content to strip
   * @returns Content without front-matter
   */
  async stripFrontMatter(content: string): Promise<string> {
    const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    
    if (!frontMatterMatch) {
      return content;
    }

    return content.substring(frontMatterMatch[0].length);
  }

  /**
   * Get content body without front-matter
   * @param content Full content
   * @returns Content body
   */
  async getContentBody(content: string): Promise<string> {
    return await this.stripFrontMatter(content);
  }

  /**
   * Check if content has front-matter
   * @param content Content to check
   * @returns True if has front-matter
   */
  hasFrontMatter(content: string): boolean {
    return /^---\s*\n[\s\S]*?\n---\s*\n/.test(content);
  }

  /**
   * Dispose the service
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
  }

  /**
   * Update front-matter based on processing options
   * @param frontMatter Current front-matter
   * @param options Processing options
   * @returns Updated front-matter
   */
  private async updateFrontMatter(frontMatter: FrontMatter, options: ProcessingOptions): Promise<FrontMatter> {
    const updated = { ...frontMatter };

    // Auto-add date if enabled and not present
    if (options.autoAddDate && !updated.date) {
      const dateFormat = options.dateFormat || 'YYYY-MM-DD HH:mm:ss';
      updated.date = this.formatDate(new Date(), dateFormat);
    }

    // Ensure required fields are present
    if (options.requiredFields) {
      for (const field of options.requiredFields) {
        if (!updated[field]) {
          // Set default values for required fields
          switch (field) {
            case 'title':
              updated.title = 'Untitled';
              break;
            case 'tags':
              updated.tags = [];
              break;
            case 'categories':
              updated.categories = [];
              break;
            default:
              updated[field] = '';
          }
        }
      }
    }

    return updated;
  }

  /**
   * Reassemble content with updated front-matter
   * @param frontMatter Updated front-matter
   * @param originalContent Original content
   * @returns Reassembled content
   */
  private async reassemble(frontMatter: FrontMatter, originalContent: string): Promise<string> {
    const contentBody = await this.stripFrontMatter(originalContent);
    
    if (Object.keys(frontMatter).length === 0) {
      // No front-matter to add
      return contentBody;
    }

    const frontMatterYaml = this.stringifyYaml(frontMatter);
    return `---\n${frontMatterYaml}\n---\n${contentBody}`;
  }

  /**
   * Parse YAML front-matter
   * @param yamlText YAML text to parse
   * @returns Parsed object
   */
  private parseYaml(yamlText: string): FrontMatter {
    // Simple YAML parser - for production, consider using a proper YAML library
    const lines = yamlText.split('\n').filter(line => line.trim());
    const result: FrontMatter = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle arrays (simple format: [item1, item2, item3])
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        result[key] = arrayContent.split(',').map(item => item.trim().replace(/['"]/g, ''));
      } else if (value.toLowerCase() === 'true') {
        result[key] = true;
      } else if (value.toLowerCase() === 'false') {
        result[key] = false;
      } else if (!isNaN(Number(value))) {
        result[key] = Number(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Convert object to YAML string
   * @param obj Object to stringify
   * @returns YAML string
   */
  private stringifyYaml(obj: FrontMatter): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.map(item => `"${item}"`).join(', ')}]`);
      } else if (typeof value === 'string') {
        lines.push(`${key}: "${value}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format date according to specified format
   * @param date Date to format
   * @param format Date format string
   * @returns Formatted date string
   */
  private formatDate(date: Date, format: string): string {
    // Simple date formatter - for production, consider using a proper date library
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * Validate if a value is a valid date
   * @param value Value to validate
   * @returns True if valid date
   */
  private isValidDate(value: any): boolean {
    if (!value) return false;
    
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
}

/**
 * Content processing service builder
 */
export class ContentProcessingServiceBuilder {
  private options: Partial<ProcessingOptions> = {};

  /**
   * Set auto-add date option
   * @param autoAdd Whether to auto-add date
   * @returns Builder instance
   */
  withAutoAddDate(autoAdd: boolean): ContentProcessingServiceBuilder {
    this.options.autoAddDate = autoAdd;
    return this;
  }

  /**
   * Set date format
   * @param format Date format string
   * @returns Builder instance
   */
  withDateFormat(format: string): ContentProcessingServiceBuilder {
    this.options.dateFormat = format;
    return this;
  }

  /**
   * Set required fields
   * @param fields Required field names
   * @returns Builder instance
   */
  withRequiredFields(fields: string[]): ContentProcessingServiceBuilder {
    this.options.requiredFields = fields;
    return this;
  }

  /**
   * Enable validation
   * @param validate Whether to validate
   * @returns Builder instance
   */
  withValidation(validate: boolean): ContentProcessingServiceBuilder {
    this.options.validateFrontMatter = validate;
    return this;
  }

  /**
   * Build content processing service
   * @returns Content processing service instance
   */
  build(): ContentProcessingService {
    return new ContentProcessingService();
  }
}

/**
 * Create content processing service
 * @returns Content processing service instance
 */
export function createContentProcessingService(): ContentProcessingService {
  return new ContentProcessingService();
}

/**
 * Create content processing service builder
 * @returns Content processing service builder
 */
export function contentProcessingServiceBuilder(): ContentProcessingServiceBuilder {
  return new ContentProcessingServiceBuilder();
}