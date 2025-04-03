import { Notice } from "obsidian";
import { ErrorService, ErrorSeverity } from "../core/interfaces/ErrorService";

/**
 * Implementation of ErrorService that handles centralized error management
 */
export class ErrorServiceImpl implements ErrorService {
    private static instance: ErrorServiceImpl;
    private errorLog: Array<{
        timestamp: Date,
        error: string,
        context: string,
        severity: ErrorSeverity
    }> = [];
    
    /**
     * Get singleton instance
     */
    public static getInstance(): ErrorServiceImpl {
        if (!ErrorServiceImpl.instance) {
            ErrorServiceImpl.instance = new ErrorServiceImpl();
        }
        return ErrorServiceImpl.instance;
    }
    
    /**
     * Formats an error object or message into a string
     */
    private formatError(error: Error | string): string {
        if (typeof error === 'string') {
            return error;
        }
        return `${error.message} ${error.stack ? `\n${error.stack}` : ''}`;
    }

    /**
     * Log an informational message
     * @param message The message to log
     * @param context Additional context about where the message originated
     */
    public logInfo(message: string, context: string): void {
        console.info(`[${context}] ${message}`);
        
        // Store in log
        this.addToLog(message, context, ErrorSeverity.INFO);
    }
    
    /**
     * Log a warning message
     * @param message The message to log
     * @param context Additional context about where the warning originated
     */
    public logWarning(message: string, context: string): void {
        console.warn(`[${context}] ${message}`);
        
        // Store in log
        this.addToLog(message, context, ErrorSeverity.WARNING);
    }

    /**
     * Add an entry to the error log
     */
    private addToLog(
        error: string, 
        context: string, 
        severity: ErrorSeverity
    ): void {
        // Store in error log
        this.errorLog.push({
            timestamp: new Date(),
            error,
            context,
            severity
        });
        
        // Limit log size to prevent memory issues
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }
    }

    /**
     * Log an error with appropriate severity and context
     * @param error The error object or message
     * @param context Additional context about where the error occurred
     * @param severity The severity level of the error
     */
    public logError(
        error: Error | string, 
        context: string, 
        severity: ErrorSeverity = ErrorSeverity.ERROR
    ): void {
        const errorMessage = this.formatError(error);
        
        // Log to console with appropriate level
        switch (severity) {
            case ErrorSeverity.INFO:
                console.info(`[${context}] ${errorMessage}`);
                break;
            case ErrorSeverity.WARNING:
                console.warn(`[${context}] ${errorMessage}`);
                break;
            case ErrorSeverity.ERROR:
                console.error(`[${context}] ${errorMessage}`);
                break;
            case ErrorSeverity.CRITICAL:
                console.error(`[CRITICAL] [${context}] ${errorMessage}`);
                break;
        }
        
        // Store in error log
        this.addToLog(errorMessage, context, severity);
    }
    
    /**
     * Log and notify the user about an error
     * @param error The error object or message
     * @param context Additional context about where the error occurred
     * @param severity The severity level of the error
     */
    public handleError(
        error: Error | string, 
        context: string, 
        severity: ErrorSeverity = ErrorSeverity.ERROR
    ): void {
        // Log the error
        this.logError(error, context, severity);
        
        // Format user-friendly message
        const message = typeof error === 'string' ? error : error.message;
        
        // Show notification based on severity
        const duration = 
            severity === ErrorSeverity.CRITICAL ? 10000 : 
            severity === ErrorSeverity.ERROR ? 5000 : 
            severity === ErrorSeverity.WARNING ? 3000 : 2000;
            
        new Notice(`${severity.toUpperCase()}: ${context}: ${message}`, duration);
    }
    
    /**
     * Handle an error with recovery logic
     * @param error The error object or message
     * @param context Additional context about where the error occurred
     * @param recovery Optional function to attempt recovery
     * @returns Result of recovery attempt if provided
     */
    public async handleErrorWithRecovery<T>(
        error: Error | string, 
        context: string, 
        recovery?: () => Promise<T>
    ): Promise<T | null> {
        // First log the error
        this.handleError(error, context);
        
        // Attempt recovery if provided
        if (recovery) {
            try {
                const result = await recovery();
                this.logInfo("Recovery successful", context);
                return result;
            } catch (recoveryError) {
                this.handleError(
                    recoveryError, 
                    `${context} (recovery attempt)`, 
                    ErrorSeverity.ERROR
                );
            }
        }
        
        return null;
    }
    
    /**
     * Get the error log for debugging
     */
    public getErrorLog() {
        return [...this.errorLog];
    }
} 
