/**
 * Error severity levels for different types of errors
 */
export enum ErrorSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

/**
 * Interface for centralized error handling service
 */
export interface ErrorService {
    /**
     * Log an informational message
     * @param message The message to log
     * @param context Additional context about where the message originated
     */
    logInfo(message: string, context: string): void;
    
    /**
     * Log a warning message
     * @param message The message to log
     * @param context Additional context about where the warning originated
     */
    logWarning(message: string, context: string): void;
    
    /**
     * Log an error with appropriate severity and context
     * @param error The error object or message
     * @param context Additional context about where the error occurred
     * @param severity The severity level of the error
     */
    logError(error: Error | string, context: string, severity?: ErrorSeverity): void;
    
    /**
     * Log and notify the user about an error
     * @param error The error object or message
     * @param context Additional context about where the error occurred
     * @param severity The severity level of the error
     */
    handleError(error: Error | string, context: string, severity?: ErrorSeverity): void;
    
    /**
     * Handle an error with recovery logic
     * @param error The error object or message
     * @param context Additional context about where the error occurred
     * @param recovery Optional function to attempt recovery
     * @returns Result of recovery attempt if provided
     */
    handleErrorWithRecovery<T>(
        error: Error | string, 
        context: string, 
        recovery?: () => Promise<T>
    ): Promise<T | null>;
    
    /**
     * Get the error log for debugging
     */
    getErrorLog(): Array<{
        timestamp: Date,
        error: string,
        context: string,
        severity: ErrorSeverity
    }>;
} 
