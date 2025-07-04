// Event Bus Unit Tests

import { EventBus, EventTypes } from '../../../src/core/events/EventBus';
import { Event, EventHandler } from '../../../src/core/types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await eventBus.dispose();
  });

  describe('Event Subscription', () => {
    it('should subscribe to events', () => {
      const handler: EventHandler = {
        handle: jest.fn()
      };

      eventBus.subscribe('test.event', handler);

      expect(eventBus.getSubscriberCount('test.event')).toBe(1);
      expect(eventBus.getSubscribedEventTypes()).toContain('test.event');
    });

    it('should allow multiple subscribers for same event', () => {
      const handler1: EventHandler = { handle: jest.fn() };
      const handler2: EventHandler = { handle: jest.fn() };

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      expect(eventBus.getSubscriberCount('test.event')).toBe(2);
    });

    it('should unsubscribe from events', () => {
      const handler: EventHandler = { handle: jest.fn() };

      eventBus.subscribe('test.event', handler);
      expect(eventBus.getSubscriberCount('test.event')).toBe(1);

      eventBus.unsubscribe('test.event', handler);
      expect(eventBus.getSubscriberCount('test.event')).toBe(0);
    });

    it('should clean up empty handler arrays after unsubscribe', () => {
      const handler: EventHandler = { handle: jest.fn() };

      eventBus.subscribe('test.event', handler);
      eventBus.unsubscribe('test.event', handler);

      expect(eventBus.getSubscribedEventTypes()).not.toContain('test.event');
    });
  });

  describe('Event Publishing', () => {
    it('should publish events to all subscribers', async () => {
      const handler1: EventHandler = { handle: jest.fn() };
      const handler2: EventHandler = { handle: jest.fn() };

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      const event: Event = {
        type: 'test.event',
        timestamp: new Date(),
        payload: { data: 'test' }
      };

      await eventBus.publish(event);

      expect(handler1.handle).toHaveBeenCalledWith(event);
      expect(handler2.handle).toHaveBeenCalledWith(event);
    });

    it('should handle events with no subscribers', async () => {
      const event: Event = {
        type: 'unsubscribed.event',
        timestamp: new Date(),
        payload: {}
      };

      // Should not throw
      await expect(eventBus.publish(event)).resolves.not.toThrow();
    });

    it('should publish events synchronously', () => {
      const handler: EventHandler = { handle: jest.fn() };
      eventBus.subscribe('test.event', handler);

      const event: Event = {
        type: 'test.event',
        timestamp: new Date(),
        payload: {}
      };

      eventBus.publishSync(event);

      // Should be called immediately (though async execution may be deferred)
      expect(handler.handle).toHaveBeenCalledWith(event);
    });

    it('should handle handler errors gracefully', async () => {
      const failingHandler: EventHandler = {
        handle: jest.fn().mockRejectedValue(new Error('Handler failed'))
      };
      const workingHandler: EventHandler = { handle: jest.fn() };

      eventBus.subscribe('test.event', failingHandler);
      eventBus.subscribe('test.event', workingHandler);

      const event: Event = {
        type: 'test.event',
        timestamp: new Date(),
        payload: {}
      };

      // Should not throw even if one handler fails
      await expect(eventBus.publish(event)).resolves.not.toThrow();

      expect(failingHandler.handle).toHaveBeenCalled();
      expect(workingHandler.handle).toHaveBeenCalled();
    });
  });

  describe('Event History', () => {
    it('should maintain event history', async () => {
      const events: Event[] = [
        { type: 'event1', timestamp: new Date(), payload: {} },
        { type: 'event2', timestamp: new Date(), payload: {} },
        { type: 'event1', timestamp: new Date(), payload: {} }
      ];

      for (const event of events) {
        await eventBus.publish(event);
      }

      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(3);
      expect(history.map(e => e.type)).toEqual(['event1', 'event2', 'event1']);
    });

    it('should filter history by event type', async () => {
      const events: Event[] = [
        { type: 'event1', timestamp: new Date(), payload: {} },
        { type: 'event2', timestamp: new Date(), payload: {} },
        { type: 'event1', timestamp: new Date(), payload: {} }
      ];

      for (const event of events) {
        await eventBus.publish(event);
      }

      const filtered = eventBus.getEventHistory('event1');
      expect(filtered).toHaveLength(2);
      expect(filtered.every(e => e.type === 'event1')).toBe(true);
    });

    it('should limit history size', async () => {
      const maxHistorySize = 5;
      const busWithLimitedHistory = new EventBus(maxHistorySize);

      // Publish more events than the limit
      for (let i = 0; i < 10; i++) {
        await busWithLimitedHistory.publish({
          type: `event${i}`,
          timestamp: new Date(),
          payload: {}
        });
      }

      const history = busWithLimitedHistory.getEventHistory();
      expect(history).toHaveLength(maxHistorySize);

      await busWithLimitedHistory.dispose();
    });

    it('should clear history', async () => {
      await eventBus.publish({
        type: 'test.event',
        timestamp: new Date(),
        payload: {}
      });

      expect(eventBus.getEventHistory()).toHaveLength(1);

      eventBus.clearHistory();
      expect(eventBus.getEventHistory()).toHaveLength(0);
    });
  });

  describe('Typed Event Handling', () => {
    it('should create typed publisher', async () => {
      const publisher = eventBus.createPublisher<{ message: string }>('test.typed');
      const handler: EventHandler<{ message: string }> = { handle: jest.fn() };

      eventBus.subscribe('test.typed', handler);

      await publisher({ message: 'Hello, World!' });

      expect(handler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test.typed',
          payload: { message: 'Hello, World!' }
        })
      );
    });

    it('should create typed subscriber with unsubscribe function', async () => {
      const handlerFn = jest.fn();
      const unsubscribe = eventBus.createSubscriber<{ data: string }>('test.typed', handlerFn);

      const publisher = eventBus.createPublisher<{ data: string }>('test.typed');
      await publisher({ data: 'test' });

      expect(handlerFn).toHaveBeenCalledWith({ data: 'test' });

      // Unsubscribe and verify no more events are received
      unsubscribe();

      await publisher({ data: 'test2' });
      expect(handlerFn).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe('Event Waiting', () => {
    it('should wait for specific events', async () => {
      const eventPromise = eventBus.waitForEvent<{ result: string }>('async.event');

      // Publish the event after a delay
      setTimeout(() => {
        eventBus.publishSync({
          type: 'async.event',
          timestamp: new Date(),
          payload: { result: 'success' }
        });
      }, 10);

      const event = await eventPromise;
      expect(event.type).toBe('async.event');
      expect(event.payload.result).toBe('success');
    });

    it('should timeout when waiting for events', async () => {
      const eventPromise = eventBus.waitForEvent('never.happens', 100);

      await expect(eventPromise).rejects.toThrow('Timeout waiting for event: never.happens');
    });

    it('should resolve immediately if event is published before timeout', async () => {
      const startTime = Date.now();
      
      const eventPromise = eventBus.waitForEvent('immediate.event', 1000);

      // Publish immediately
      eventBus.publishSync({
        type: 'immediate.event',
        timestamp: new Date(),
        payload: {}
      });

      const event = await eventPromise;
      const elapsed = Date.now() - startTime;

      expect(event.type).toBe('immediate.event');
      expect(elapsed).toBeLessThan(100); // Should resolve quickly
    });
  });

  describe('System Events', () => {
    it('should emit error events when handlers fail', async () => {
      const errorHandler: EventHandler = { handle: jest.fn() };
      eventBus.subscribe(EventTypes.SYSTEM_ERROR, errorHandler);

      const failingHandler: EventHandler = {
        handle: jest.fn().mockRejectedValue(new Error('Test error'))
      };
      eventBus.subscribe('test.event', failingHandler);

      await eventBus.publish({
        type: 'test.event',
        timestamp: new Date(),
        payload: {}
      });

      // Should emit system error event
      expect(errorHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventTypes.SYSTEM_ERROR,
          payload: expect.objectContaining({
            error: 'Test error'
          })
        })
      );
    });
  });

  describe('Disposal', () => {
    it('should prevent operations after disposal', async () => {
      await eventBus.dispose();

      expect(() => eventBus.subscribe('test', { handle: jest.fn() })).toThrow('EventBus is disposed');
      await expect(eventBus.publish({ type: 'test', timestamp: new Date(), payload: {} }))
        .rejects.toThrow('EventBus is disposed');
    });

    it('should clean up resources on disposal', async () => {
      const handler: EventHandler = { handle: jest.fn() };
      eventBus.subscribe('test.event', handler);

      await eventBus.publish({ type: 'test.event', timestamp: new Date(), payload: {} });
      expect(eventBus.getEventHistory()).toHaveLength(1);

      await eventBus.dispose();

      expect(eventBus.getSubscribedEventTypes()).toHaveLength(0);
      expect(eventBus.getEventHistory()).toHaveLength(0);
    });
  });
});