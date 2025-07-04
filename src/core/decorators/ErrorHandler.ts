import { ErrorServiceImpl } from '../../services/ErrorService';
import { ErrorSeverity } from '../interfaces/ErrorService';

/**
 * Decorator factory for handling errors in service methods
 * @param context The context in which the method is executing
 * @param severity The severity level of potential errors
 * @param errorType Optional custom error type to throw
 */
export function handleError(
    context: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    errorType?: new (message: string, cause?: Error) => Error
) {
    return function (
        target: any,
        propertyKey: string,
        descriptor?: PropertyDescriptor
    ) {
        if (!descriptor) {
            // Handle case where descriptor is not provided (newer TypeScript versions)
            descriptor = Object.getOwnPropertyDescriptor(target, propertyKey) || 
                        Object.getOwnPropertyDescriptor(target.constructor.prototype, propertyKey);
        }
        if (!descriptor || !descriptor.value) {
            console.warn(`@handleError decorator: could not find method ${propertyKey} on ${target.constructor.name}`);
            return descriptor;
        }
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args: any[]) {
            try {
                return await originalMethod.call(this, ...args);
            } catch (error) {
                const errorService = ErrorServiceImpl.getInstance();
                errorService.handleError(error, `${context} - ${propertyKey}`, severity);
                
                // Rethrow with custom error type if provided
                if (errorType) {
                    const cause = error instanceof Error ? error : undefined;
                    throw new errorType(
                        `Error in ${context} - ${propertyKey}`,
                        cause
                    );
                }
                
                // Otherwise rethrow the original error
                throw error;
            }
        };
        
        return descriptor;
    };
}

/**
 * Decorator factory for handling errors with recovery in service methods
 * @param context The context in which the method is executing
 */
export function handleErrorWithRecovery(context: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor?: PropertyDescriptor
    ) {
        if (!descriptor) {
            // Handle case where descriptor is not provided (newer TypeScript versions)
            descriptor = Object.getOwnPropertyDescriptor(target, propertyKey) || 
                        Object.getOwnPropertyDescriptor(target.constructor.prototype, propertyKey);
        }
        if (!descriptor || !descriptor.value) {
            console.warn(`@handleErrorWithRecovery decorator: could not find method ${propertyKey} on ${target.constructor.name}`);
            return descriptor;
        }
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args: any[]) {
            try {
                return await originalMethod.call(this, ...args);
            } catch (error) {
                const errorService = ErrorServiceImpl.getInstance();
                
                // Default recovery function returns null
                const recovery = async () => {
                    // If the class has a recoveryFor method, use it
                    if (typeof this[`recoveryFor${propertyKey}`] === 'function') {
                        return await this[`recoveryFor${propertyKey}`].call(this, ...args);
                    }
                    return null;
                };
                
                return await errorService.handleErrorWithRecovery(
                    error, 
                    `${context} - ${propertyKey}`,
                    recovery
                );
            }
        };
        
        return descriptor;
    };
} 
