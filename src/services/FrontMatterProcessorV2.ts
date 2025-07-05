import matter from 'gray-matter';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Robust front-matter processor using gray-matter
 * Addresses Issue #2 - Missing date field in posts
 */

export interface FrontMatterData {
    title?: string;
    date?: string | Date;
    tags?: string[];
    categories?: string[];
    description?: string;
    author?: string;
    slug?: string;
    excerpt?: string;
    draft?: boolean;
    [key: string]: string | string[] | Date | boolean | number | undefined;
}

export interface ProcessingOptions {
    autoAddDate?: boolean;
    dateFormat?: 'ISO' | 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm:ss' | 'custom';
    customDateFormat?: string;
    autoGenerateTitle?: boolean;
    autoGenerateSlug?: boolean;
    requiredFields?: string[];
    defaultValues?: Partial<FrontMatterData>;
    preserveExisting?: boolean;
}

export interface ProcessingResult {
    success: boolean;
    modified: boolean;
    originalContent: string;
    processedContent: string;
    frontMatter: FrontMatterData;
    changes: string[];
    warnings: string[];
    errors: string[];
}

export class FrontMatterProcessorV2 {
    private defaultOptions: ProcessingOptions = {
        autoAddDate: true,
        dateFormat: 'YYYY-MM-DD HH:mm:ss',
        autoGenerateTitle: true,
        autoGenerateSlug: false,
        requiredFields: ['title', 'date'],
        preserveExisting: true,
        defaultValues: {
            draft: false
        }
    };

    constructor(private options: ProcessingOptions = {}) {
        this.options = { ...this.defaultOptions, ...options };
    }

    /**
     * Process a markdown file and ensure proper front-matter
     * @param filePath Path to the markdown file
     * @param options Processing options (overrides instance options)
     * @returns Processing result
     */
    async processFile(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult> {
        const effectiveOptions = { ...this.options, ...options };
        
        try {
            // Read file content
            const originalContent = await fs.readFile(filePath, 'utf8');
            
            // Process content
            const result = await this.processContent(originalContent, filePath, effectiveOptions);
            
            // Write back if modified
            if (result.modified && result.success) {
                await fs.writeFile(filePath, result.processedContent, 'utf8');
                console.log(`Updated front-matter for: ${path.basename(filePath)}`);
            }
            
            return result;
            
        } catch (error) {
            console.error(`Failed to process file ${filePath}:`, error);
            return {
                success: false,
                modified: false,
                originalContent: '',
                processedContent: '',
                frontMatter: {},
                changes: [],
                warnings: [],
                errors: [error.message]
            };
        }
    }

    /**
     * Process markdown content and ensure proper front-matter
     * @param content Markdown content
     * @param filePath File path (for context)
     * @param options Processing options
     * @returns Processing result
     */
    async processContent(
        content: string, 
        filePath?: string, 
        options?: ProcessingOptions
    ): Promise<ProcessingResult> {
        const effectiveOptions = { ...this.options, ...options };
        const changes: string[] = [];
        const warnings: string[] = [];
        const errors: string[] = [];

        try {
            // Parse existing front-matter
            const parsed = matter(content);
            let frontMatter: FrontMatterData = { ...parsed.data };
            let modified = false;

            // Process front-matter fields
            const processing = await this.processFrontMatterFields(
                frontMatter, 
                filePath, 
                effectiveOptions
            );
            
            frontMatter = processing.frontMatter;
            changes.push(...processing.changes);
            warnings.push(...processing.warnings);
            modified = processing.modified;

            // Validate required fields
            const validation = this.validateRequiredFields(frontMatter, effectiveOptions);
            warnings.push(...validation.warnings);
            errors.push(...validation.errors);

            // Reconstruct content if modified
            let processedContent = content;
            if (modified) {
                processedContent = matter.stringify(parsed.content, frontMatter);
            }

            return {
                success: errors.length === 0,
                modified,
                originalContent: content,
                processedContent,
                frontMatter,
                changes,
                warnings,
                errors
            };

        } catch (error) {
            console.error('Front-matter processing failed:', error);
            return {
                success: false,
                modified: false,
                originalContent: content,
                processedContent: content,
                frontMatter: {},
                changes,
                warnings,
                errors: [...errors, error.message]
            };
        }
    }

    /**
     * Process individual front-matter fields
     */
    private async processFrontMatterFields(
        frontMatter: FrontMatterData, 
        filePath?: string, 
        options?: ProcessingOptions
    ): Promise<{
        frontMatter: FrontMatterData;
        changes: string[];
        warnings: string[];
        modified: boolean;
    }> {
        const changes: string[] = [];
        const warnings: string[] = [];
        let modified = false;

        // Add date if missing
        if (options?.autoAddDate && !frontMatter.date) {
            frontMatter.date = this.generateDate(options.dateFormat, options.customDateFormat);
            changes.push('Added missing date field');
            modified = true;
        }

        // Generate title if missing
        if (options?.autoGenerateTitle && !frontMatter.title && filePath) {
            frontMatter.title = this.generateTitleFromPath(filePath);
            changes.push('Generated title from filename');
            modified = true;
        }

        // Generate slug if requested
        if (options?.autoGenerateSlug && !frontMatter.slug && frontMatter.title) {
            frontMatter.slug = this.generateSlug(frontMatter.title);
            changes.push('Generated slug from title');
            modified = true;
        }

        // Apply default values for missing fields
        if (options?.defaultValues) {
            for (const [key, value] of Object.entries(options.defaultValues)) {
                if (frontMatter[key] === undefined) {
                    frontMatter[key] = value;
                    changes.push(`Added default value for ${key}`);
                    modified = true;
                }
            }
        }

        // Clean up and normalize data
        const cleanupResult = this.cleanupFrontMatter(frontMatter);
        if (cleanupResult.modified) {
            frontMatter = cleanupResult.frontMatter;
            changes.push(...cleanupResult.changes);
            warnings.push(...cleanupResult.warnings);
            modified = true;
        }

        return {
            frontMatter,
            changes,
            warnings,
            modified
        };
    }

    /**
     * Generate date in specified format
     */
    private generateDate(format?: string, customFormat?: string): string {
        const now = new Date();

        switch (format) {
            case 'ISO':
                return now.toISOString();
            case 'YYYY-MM-DD':
                return now.toISOString().split('T')[0];
            case 'YYYY-MM-DD HH:mm:ss':
                return now.toISOString().replace('T', ' ').substring(0, 19);
            case 'custom':
                if (customFormat) {
                    // Basic custom format support
                    return this.formatDateCustom(now, customFormat);
                }
                return now.toISOString().replace('T', ' ').substring(0, 19);
            default:
                return now.toISOString().replace('T', ' ').substring(0, 19);
        }
    }

    /**
     * Basic custom date formatting
     */
    private formatDateCustom(date: Date, format: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', String(year))
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hour)
            .replace('mm', minute)
            .replace('ss', second);
    }

    /**
     * Generate title from file path
     */
    private generateTitleFromPath(filePath: string): string {
        const basename = path.basename(filePath, path.extname(filePath));
        
        // Remove date prefix if present (YYYY-MM-DD-title format)
        const withoutDate = basename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
        
        // Convert kebab-case and snake_case to title case
        return withoutDate
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase())
            .trim();
    }

    /**
     * Generate URL-friendly slug
     */
    private generateSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Clean up and normalize front-matter data
     */
    private cleanupFrontMatter(frontMatter: FrontMatterData): {
        frontMatter: FrontMatterData;
        changes: string[];
        warnings: string[];
        modified: boolean;
    } {
        const changes: string[] = [];
        const warnings: string[] = [];
        let modified = false;

        // Ensure tags is an array
        if (frontMatter.tags && !Array.isArray(frontMatter.tags)) {
            if (typeof frontMatter.tags === 'string') {
                frontMatter.tags = (frontMatter.tags as string).split(',').map((tag: string) => tag.trim());
                changes.push('Converted tags string to array');
                modified = true;
            } else {
                warnings.push('Tags field is not a string or array');
            }
        }

        // Ensure categories is an array
        if (frontMatter.categories && !Array.isArray(frontMatter.categories)) {
            if (typeof frontMatter.categories === 'string') {
                frontMatter.categories = (frontMatter.categories as string).split(',').map((cat: string) => cat.trim());
                changes.push('Converted categories string to array');
                modified = true;
            } else {
                warnings.push('Categories field is not a string or array');
            }
        }

        // Normalize date field
        if (frontMatter.date) {
            const dateStr = frontMatter.date.toString();
            try {
                const parsedDate = new Date(dateStr);
                if (isNaN(parsedDate.getTime())) {
                    warnings.push('Date field contains invalid date');
                } else {
                    // Ensure consistent date format
                    const normalizedDate = parsedDate.toISOString().replace('T', ' ').substring(0, 19);
                    if (dateStr !== normalizedDate) {
                        frontMatter.date = normalizedDate;
                        changes.push('Normalized date format');
                        modified = true;
                    }
                }
            } catch (error) {
                warnings.push('Failed to parse date field');
            }
        }

        return {
            frontMatter,
            changes,
            warnings,
            modified
        };
    }

    /**
     * Validate required fields
     */
    private validateRequiredFields(
        frontMatter: FrontMatterData, 
        options?: ProcessingOptions
    ): {
        warnings: string[];
        errors: string[];
    } {
        const warnings: string[] = [];
        const errors: string[] = [];
        const requiredFields = options?.requiredFields || [];

        for (const field of requiredFields) {
            if (!frontMatter[field] || frontMatter[field] === '') {
                errors.push(`Required field '${field}' is missing or empty`);
            }
        }

        return { warnings, errors };
    }

    /**
     * Batch process multiple files
     * @param filePaths Array of file paths to process
     * @param options Processing options
     * @returns Array of processing results
     */
    async processFiles(
        filePaths: string[], 
        options?: ProcessingOptions
    ): Promise<ProcessingResult[]> {
        const results: ProcessingResult[] = [];
        
        for (const filePath of filePaths) {
            try {
                const result = await this.processFile(filePath, options);
                results.push(result);
            } catch (error) {
                console.error(`Failed to process ${filePath}:`, error);
                results.push({
                    success: false,
                    modified: false,
                    originalContent: '',
                    processedContent: '',
                    frontMatter: {},
                    changes: [],
                    warnings: [],
                    errors: [error.message]
                });
            }
        }
        
        return results;
    }

    /**
     * Get summary of processing results
     * @param results Array of processing results
     * @returns Summary statistics
     */
    getSummary(results: ProcessingResult[]): {
        total: number;
        successful: number;
        modified: number;
        errors: number;
        warnings: number;
        changes: number;
    } {
        return {
            total: results.length,
            successful: results.filter(r => r.success).length,
            modified: results.filter(r => r.modified).length,
            errors: results.reduce((sum, r) => sum + r.errors.length, 0),
            warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
            changes: results.reduce((sum, r) => sum + r.changes.length, 0)
        };
    }
}

/**
 * Utility function to create a processor with Hexo-specific defaults
 */
export function createHexoFrontMatterProcessor(options?: ProcessingOptions): FrontMatterProcessorV2 {
    const hexoDefaults: ProcessingOptions = {
        autoAddDate: true,
        dateFormat: 'YYYY-MM-DD HH:mm:ss',
        autoGenerateTitle: true,
        autoGenerateSlug: false,
        requiredFields: ['title', 'date'],
        defaultValues: {
            draft: false,
            author: 'Hexo Blog'
        }
    };

    return new FrontMatterProcessorV2({ ...hexoDefaults, ...options });
}

/**
 * Utility function to quickly process a single file
 */
export async function quickProcessFile(
    filePath: string, 
    options?: ProcessingOptions
): Promise<ProcessingResult> {
    const processor = createHexoFrontMatterProcessor(options);
    return await processor.processFile(filePath);
}