// Event Bus Implementation for Event-Driven Architecture

import { 
  Event, 
  EventHandler, 
  Disposable 
} from '../types';
import { IEventBus } from '../tokens';

export class EventBus implements IEventBus, Disposable {
  private handlers = new Map<string, EventHandler[]>();
  private eventHistory: Event[] = [];
  private maxHistorySize: number;
  private isDisposed = false;

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Subscribe to an event type
   * @param eventType Event type to subscribe to
   * @param handler Event handler function
   */
  subscribe<T>(eventType: string, handler: EventHandler<T>): void {
    if (this.isDisposed) {
      throw new Error('EventBus is disposed');
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    
    this.handlers.get(eventType)!.push(handler);
  }

  /**
   * Unsubscribe from an event type
   * @param eventType Event type to unsubscribe from
   * @param handler Event handler to remove
   */
  unsubscribe<T>(eventType: string, handler: EventHandler<T>): void {
    if (this.isDisposed) {
      return;
    }

    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        
        // Clean up empty handler arrays
        if (handlers.length === 0) {
          this.handlers.delete(eventType);
        }
      }
    }
  }

  /**
   * Publish an event to all subscribers
   * @param event Event to publish
   */
  async publish(event: Event): Promise<void> {
    if (this.isDisposed) {
      throw new Error('EventBus is disposed');
    }

    // Add to history
    this.addToHistory(event);

    const handlers = this.handlers.get(event.type) || [];
    const promises = handlers.map(handler => 
      this.safeExecute(handler, event)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Publish an event synchronously (fire and forget)
   * @param event Event to publish
   */
  publishSync(event: Event): void {
    if (this.isDisposed) {
      throw new Error('EventBus is disposed');
    }

    // Add to history
    this.addToHistory(event);

    const handlers = this.handlers.get(event.type) || [];
    handlers.forEach(handler => {
      // Execute without waiting
      this.safeExecute(handler, event).catch(error => {
        console.error(`Error in event handler for ${event.type}:`, error);
      });
    });
  }

  /**
   * Get all event types that have subscribers
   * @returns Array of event types
   */
  getSubscribedEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get number of subscribers for an event type
   * @param eventType Event type
   * @returns Number of subscribers
   */
  getSubscriberCount(eventType: string): number {
    return this.handlers.get(eventType)?.length || 0;
  }

  /**
   * Get event history
   * @param eventType Optional event type filter
   * @param limit Optional limit on number of events
   * @returns Array of events
   */
  getEventHistory(eventType?: string, limit?: number): Event[] {
    let events = this.eventHistory;
    
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }
    
    if (limit && limit > 0) {
      events = events.slice(-limit);
    }
    
    return [...events]; // Return copy to prevent modification
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Create a typed event publisher
   * @param eventType Event type
   * @returns Event publisher function
   */
  createPublisher<T>(eventType: string): (payload: T) => Promise<void> {
    return async (payload: T) => {
      const event: Event<T> = {
        type: eventType,
        timestamp: new Date(),
        payload
      };
      await this.publish(event);
    };
  }

  /**
   * Create a typed event subscriber
   * @param eventType Event type
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  createSubscriber<T>(
    eventType: string, 
    handler: (payload: T) => Promise<void>
  ): () => void {
    const eventHandler: EventHandler<T> = {
      handle: async (event: Event<T>) => {
        await handler(event.payload);
      }
    };
    
    this.subscribe(eventType, eventHandler);
    
    return () => {
      this.unsubscribe(eventType, eventHandler);
    };
  }

  /**
   * Wait for a specific event to occur
   * @param eventType Event type to wait for
   * @param timeout Optional timeout in milliseconds
   * @returns Promise resolving to the event
   */
  waitForEvent<T>(eventType: string, timeout?: number): Promise<Event<T>> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout;
      
      const handler: EventHandler<T> = {
        handle: async (event: Event<T>) => {
          this.unsubscribe(eventType, handler);
          
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          
          resolve(event);
        }
      };
      
      this.subscribe(eventType, handler);
      
      if (timeout && timeout > 0) {
        timeoutHandle = setTimeout(() => {
          this.unsubscribe(eventType, handler);
          reject(new Error(`Timeout waiting for event: ${eventType}`));
        }, timeout);
      }
    });
  }

  /**
   * Dispose the event bus and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.handlers.clear();
    this.eventHistory = [];
  }

  /**
   * Add event to history with size management
   * @param event Event to add
   */
  private addToHistory(event: Event): void {
    this.eventHistory.push(event);
    
    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Safely execute an event handler
   * @param handler Event handler
   * @param event Event to handle
   */
  private async safeExecute<T>(handler: EventHandler<T>, event: Event<T>): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      console.error(`Error in event handler for ${event.type}:`, error);
      
      // Emit error event
      const errorEvent: Event = {
        type: 'system.error',
        timestamp: new Date(),
        payload: {
          originalEvent: event,
          error: error.message,
          stack: error.stack
        }
      };
      
      // Avoid recursive error handling
      if (event.type !== 'system.error') {
        this.publishSync(errorEvent);
      }
    }
  }
}

/**
 * Predefined event types
 */
export const EventTypes = {
  // System events
  SYSTEM_ERROR: 'system.error',
  SYSTEM_WARNING: 'system.warning',
  SYSTEM_INFO: 'system.info',
  
  // File system events
  FILE_CREATED: 'file.created',
  FILE_MODIFIED: 'file.modified',
  FILE_DELETED: 'file.deleted',
  FILE_MOVED: 'file.moved',
  
  // Sync events
  SYNC_STARTED: 'sync.started',
  SYNC_STOPPED: 'sync.stopped',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed',
  SYNC_BATCH_STARTED: 'sync.batch.started',
  SYNC_BATCH_COMPLETED: 'sync.batch.completed',
  SYNC_BATCH_FAILED: 'sync.batch.failed',
  
  // Git events
  GIT_COMMIT: 'git.commit',
  GIT_PUSH: 'git.push',
  GIT_PULL: 'git.pull',
  GIT_ERROR: 'git.error',
  
  // Configuration events
  CONFIG_LOADED: 'config.loaded',
  CONFIG_SAVED: 'config.saved',
  CONFIG_CHANGED: 'config.changed',
  CONFIG_ERROR: 'config.error',
  
  // Plugin events
  PLUGIN_LOADED: 'plugin.loaded',
  PLUGIN_UNLOADED: 'plugin.unloaded',
  PLUGIN_ERROR: 'plugin.error'
} as const;

/**
 * Global event bus instance
 */
export const globalEventBus = new EventBus();