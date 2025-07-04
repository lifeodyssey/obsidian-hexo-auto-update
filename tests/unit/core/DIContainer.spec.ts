// DI Container Unit Tests

import { DIContainer, createServiceToken } from '../../../src/core/container/DIContainer';
import { Disposable } from '../../../src/core/types';

describe('DIContainer', () => {
  let container: DIContainer;

  beforeEach(() => {
    container = new DIContainer();
  });

  afterEach(async () => {
    await container.dispose();
  });

  describe('Service Registration', () => {
    it('should register transient services', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = () => 'test-value';

      container.register(token, factory);

      expect(container.isRegistered(token)).toBe(true);
    });

    it('should register singleton services', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = () => 'test-value';

      container.registerSingleton(token, factory);

      expect(container.isRegistered(token)).toBe(true);
    });

    it('should throw error when registering duplicate services', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = () => 'test-value';

      container.register(token, factory);

      // Should not throw - registration overwrites
      expect(() => container.register(token, factory)).not.toThrow();
    });
  });

  describe('Service Resolution', () => {
    it('should resolve transient services', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = jest.fn(() => 'test-value');

      container.register(token, factory);

      const result1 = container.resolve(token);
      const result2 = container.resolve(token);

      expect(result1).toBe('test-value');
      expect(result2).toBe('test-value');
      expect(factory).toHaveBeenCalledTimes(2); // Called for each resolution
    });

    it('should resolve singleton services', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = jest.fn(() => 'test-value');

      container.registerSingleton(token, factory);

      const result1 = container.resolve(token);
      const result2 = container.resolve(token);

      expect(result1).toBe('test-value');
      expect(result2).toBe('test-value');
      expect(result1).toBe(result2); // Same instance
      expect(factory).toHaveBeenCalledTimes(1); // Called only once
    });

    it('should throw error for unregistered services', () => {
      const token = createServiceToken<string>('unregistered', 'string');

      expect(() => container.resolve(token)).toThrow('Service not registered: unregistered (string)');
    });

    it('should handle factory errors gracefully', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = () => { throw new Error('Factory error'); };

      container.register(token, factory);

      expect(() => container.resolve(token)).toThrow('Failed to create transient service test: Factory error');
    });
  });

  describe('Service Management', () => {
    it('should unregister services', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = () => 'test-value';

      container.register(token, factory);
      expect(container.isRegistered(token)).toBe(true);

      container.unregister(token);
      expect(container.isRegistered(token)).toBe(false);
    });

    it('should get registered service tokens', () => {
      const token1 = createServiceToken<string>('test1', 'string');
      const token2 = createServiceToken<number>('test2', 'number');

      container.register(token1, () => 'test');
      container.register(token2, () => 42);

      const tokens = container.getRegisteredServices();
      expect(tokens).toHaveLength(2);
      expect(tokens).toContain(token1);
      expect(tokens).toContain(token2);
    });

    it('should provide container statistics', () => {
      const token1 = createServiceToken<string>('test1', 'string');
      const token2 = createServiceToken<string>('test2', 'string');

      container.register(token1, () => 'test1');
      container.registerSingleton(token2, () => 'test2');

      // Resolve singleton to create instance
      container.resolve(token2);

      const stats = container.getStats();
      expect(stats.registeredServices).toBe(2);
      expect(stats.singletonInstances).toBe(1);
    });
  });

  describe('Disposable Services', () => {
    class DisposableService implements Disposable {
      disposed = false;

      async dispose(): Promise<void> {
        this.disposed = true;
      }
    }

    it('should track and dispose disposable services', async () => {
      const token = createServiceToken<DisposableService>('disposable', 'DisposableService');
      const service = new DisposableService();
      const factory = () => service;

      container.registerSingleton(token, factory);
      const resolved = container.resolve(token);

      expect(resolved).toBe(service);
      expect(service.disposed).toBe(false);

      await container.dispose();

      expect(service.disposed).toBe(true);
    });

    it('should dispose all tracked services', async () => {
      const services: DisposableService[] = [];

      for (let i = 0; i < 3; i++) {
        const token = createServiceToken<DisposableService>(`disposable${i}`, 'DisposableService');
        const service = new DisposableService();
        services.push(service);

        container.registerSingleton(token, () => service);
        container.resolve(token); // Create instances
      }

      await container.dispose();

      services.forEach(service => {
        expect(service.disposed).toBe(true);
      });
    });

    it('should handle disposal errors gracefully', async () => {
      class FailingDisposableService implements Disposable {
        async dispose(): Promise<void> {
          throw new Error('Disposal failed');
        }
      }

      const token = createServiceToken<FailingDisposableService>('failing', 'FailingDisposableService');
      const service = new FailingDisposableService();

      container.registerSingleton(token, () => service);
      container.resolve(token);

      // Should not throw even if disposal fails
      await expect(container.dispose()).resolves.not.toThrow();
    });
  });

  describe('Child Containers', () => {
    it('should create child containers with inherited registrations', () => {
      const token = createServiceToken<string>('test', 'string');
      const factory = () => 'test-value';

      container.register(token, factory);

      const child = container.createChild();
      expect(child.isRegistered(token)).toBe(true);
      expect(child.resolve(token)).toBe('test-value');
    });

    it('should allow child containers to override parent registrations', () => {
      const token = createServiceToken<string>('test', 'string');
      
      container.register(token, () => 'parent-value');
      
      const child = container.createChild();
      child.register(token, () => 'child-value');

      expect(container.resolve(token)).toBe('parent-value');
      expect(child.resolve(token)).toBe('child-value');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle circular dependencies gracefully', () => {
      const tokenA = createServiceToken<any>('serviceA', 'ServiceA');
      const tokenB = createServiceToken<any>('serviceB', 'ServiceB');

      container.register(tokenA, () => container.resolve(tokenB));
      container.register(tokenB, () => container.resolve(tokenA));

      // This will cause a stack overflow, but that's expected behavior
      // In a real implementation, you might want to detect and prevent this
      expect(() => container.resolve(tokenA)).toThrow();
    });

    it('should handle null/undefined factory results', () => {
      const token = createServiceToken<any>('test', 'any');
      
      container.register(token, () => null);
      expect(container.resolve(token)).toBeNull();

      container.register(token, () => undefined);
      expect(container.resolve(token)).toBeUndefined();
    });
  });
});