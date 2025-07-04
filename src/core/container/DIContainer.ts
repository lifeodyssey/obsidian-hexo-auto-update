// Dependency Injection Container Implementation

import { 
  ServiceContainer, 
  ServiceToken, 
  ServiceFactory, 
  ServiceRegistration, 
  Disposable 
} from '../types';

export class DIContainer implements ServiceContainer {
  private services = new Map<ServiceToken<any>, ServiceRegistration<any>>();
  private singletons = new Map<ServiceToken<any>, any>();
  private disposables = new Set<Disposable>();

  /**
   * Register a transient service
   * @param token Service token
   * @param factory Service factory function
   */
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.services.set(token, { factory, lifecycle: 'transient' });
  }

  /**
   * Register a singleton service
   * @param token Service token
   * @param factory Service factory function
   */
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.services.set(token, { factory, lifecycle: 'singleton' });
  }

  /**
   * Resolve a service by its token
   * @param token Service token
   * @returns Service instance
   */
  resolve<T>(token: ServiceToken<T>): T {
    const registration = this.services.get(token);
    if (!registration) {
      throw new Error(`Service not registered: ${token.name} (${token.type})`);
    }

    if (registration.lifecycle === 'singleton') {
      if (!this.singletons.has(token)) {
        try {
          const instance = registration.factory();
          this.singletons.set(token, instance);
          
          // Track disposable services
          if (this.isDisposable(instance)) {
            this.disposables.add(instance);
          }
        } catch (error) {
          throw new Error(`Failed to create singleton service ${token.name}: ${error.message}`);
        }
      }
      return this.singletons.get(token);
    }

    try {
      const instance = registration.factory();
      
      // Track disposable services even for transient ones
      if (this.isDisposable(instance)) {
        this.disposables.add(instance);
      }
      
      return instance;
    } catch (error) {
      throw new Error(`Failed to create transient service ${token.name}: ${error.message}`);
    }
  }

  /**
   * Check if a service is registered
   * @param token Service token
   * @returns True if registered
   */
  isRegistered<T>(token: ServiceToken<T>): boolean {
    return this.services.has(token);
  }

  /**
   * Get all registered service tokens
   * @returns Array of service tokens
   */
  getRegisteredServices(): ServiceToken<any>[] {
    return Array.from(this.services.keys());
  }

  /**
   * Unregister a service
   * @param token Service token
   */
  unregister<T>(token: ServiceToken<T>): void {
    // Dispose singleton if it exists
    if (this.singletons.has(token)) {
      const instance = this.singletons.get(token);
      if (this.isDisposable(instance)) {
        this.disposables.delete(instance);
        // Note: Don't await here to keep the method synchronous
        // The dispose() method will handle async cleanup
      }
      this.singletons.delete(token);
    }

    this.services.delete(token);
  }

  /**
   * Clear all registrations and dispose resources
   */
  async dispose(): Promise<void> {
    const disposalPromises: Promise<void>[] = [];

    // Dispose all disposable services
    for (const disposable of this.disposables) {
      try {
        disposalPromises.push(disposable.dispose());
      } catch (error) {
        console.error('Error disposing service:', error);
      }
    }

    // Wait for all disposals to complete
    await Promise.allSettled(disposalPromises);

    // Clear all collections
    this.disposables.clear();
    this.singletons.clear();
    this.services.clear();
  }

  /**
   * Get container statistics
   * @returns Container statistics
   */
  getStats(): {
    registeredServices: number;
    singletonInstances: number;
    disposableServices: number;
  } {
    return {
      registeredServices: this.services.size,
      singletonInstances: this.singletons.size,
      disposableServices: this.disposables.size
    };
  }

  /**
   * Create a child container with inherited registrations
   * @returns New child container
   */
  createChild(): DIContainer {
    const child = new DIContainer();
    
    // Copy all registrations to child
    for (const [token, registration] of this.services) {
      child.services.set(token, registration);
    }
    
    return child;
  }

  /**
   * Check if an object implements the Disposable interface
   * @param obj Object to check
   * @returns True if disposable
   */
  private isDisposable(obj: any): obj is Disposable {
    return obj && typeof obj.dispose === 'function';
  }
}

/**
 * Global container instance
 */
export const globalContainer = new DIContainer();

/**
 * Helper function to create service tokens
 * @param name Service name
 * @param type Service type
 * @returns Service token
 */
export function createServiceToken<T>(name: string, type: string): ServiceToken<T> {
  return {
    name,
    type
  };
}

/**
 * Decorator for injectable services
 * @param token Service token
 * @param lifecycle Service lifecycle
 */
export function Injectable<T>(token: ServiceToken<T>, lifecycle: 'singleton' | 'transient' = 'singleton') {
  return function(constructor: new (...args: any[]) => T) {
    // Register the service with the global container
    const factory = () => new constructor();
    
    if (lifecycle === 'singleton') {
      globalContainer.registerSingleton(token, factory);
    } else {
      globalContainer.register(token, factory);
    }
    
    return constructor;
  };
}

/**
 * Decorator for injecting dependencies into class constructors
 * @param tokens Service tokens to inject
 */
export function Inject(...tokens: ServiceToken<any>[]) {
  return function(constructor: new (...args: any[]) => any) {
    // Store injection metadata
    (constructor as any).__inject__ = tokens;
    return constructor;
  };
}

/**
 * Factory function to create instances with dependency injection
 * @param constructor Constructor function
 * @param container Container to use for resolution
 * @returns Instance with injected dependencies
 */
export function createWithInjection<T>(
  constructor: new (...args: any[]) => T,
  container: ServiceContainer = globalContainer
): T {
  const tokens = (constructor as any).__inject__;
  
  if (!tokens) {
    return new constructor();
  }
  
  const dependencies = tokens.map((token: ServiceToken<any>) => container.resolve(token));
  return new constructor(...dependencies);
}