// Circuit Breaker Unit Tests

import { CircuitBreaker, CircuitState, createCircuitBreaker } from '../../../src/core/resilience/CircuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeMs: 1000,
      halfOpenMaxCalls: 2,
      monitoringTimeWindowMs: 5000
    });
  });

  afterEach(async () => {
    await circuitBreaker.dispose();
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should have zero failures initially', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalExecutions).toBe(0);
    });
  });

  describe('Successful Operations', () => {
    it('should execute successful operations in CLOSED state', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track successful executions', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);

      const stats = circuitBreaker.getStats();
      expect(stats.totalExecutions).toBe(2);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(0);
    });

    it('should reset failure count on success', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOperation = jest.fn().mockResolvedValue('success');

      // Cause some failures (but not enough to open circuit)
      try { await circuitBreaker.execute(failingOperation); } catch {}
      try { await circuitBreaker.execute(failingOperation); } catch {}

      expect(circuitBreaker.getStats().failureCount).toBe(2);

      // Success should reset failure count
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });

  describe('Failed Operations', () => {
    it('should track failed operations', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test failure'));

      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        expect(error.message).toBe('Test failure');
      }

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.totalFailures).toBe(1);
      expect(stats.totalExecutions).toBe(1);
    });

    it('should open circuit after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Cause failures up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(circuitBreaker.isHealthy()).toBe(false);
    });

    it('should reject operations when circuit is OPEN', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(operation); } catch {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Should reject without calling operation
      operation.mockClear();
      
      await expect(circuitBreaker.execute(operation))
        .rejects.toThrow('Circuit breaker is OPEN - operation rejected');
      
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('State Transitions', () => {
    it('should transition from OPEN to HALF_OPEN after recovery time', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(operation); } catch {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Fast-forward time by mocking Date.now
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 2000); // 2 seconds later

      const successOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successOperation);

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should transition from HALF_OPEN to CLOSED on sufficient successes', async () => {
      // Open the circuit first
      const failOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(failOperation); } catch {}
      }

      // Simulate recovery time passing
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 2000);

      const successOperation = jest.fn().mockResolvedValue('success');

      // Execute successful operations in HALF_OPEN state
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      Date.now = originalNow;
    });

    it('should transition from HALF_OPEN to OPEN on failure', async () => {
      // Open the circuit first
      const failOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(failOperation); } catch {}
      }

      // Simulate recovery time passing
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 2000);

      // One success to enter HALF_OPEN
      const successOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Failure should immediately open circuit
      try {
        await circuitBreaker.execute(failOperation);
      } catch {}

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      Date.now = originalNow;
    });

    it('should limit calls in HALF_OPEN state', async () => {
      // Open the circuit
      const failOperation = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(failOperation); } catch {}
      }

      // Simulate recovery time passing
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 2000);

      const successOperation = jest.fn().mockResolvedValue('success');

      // First call should work (enters HALF_OPEN)
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second call should work
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      Date.now = originalNow;
    });
  });

  describe('Manual Control', () => {
    it('should reset circuit breaker state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(operation); } catch {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it('should force circuit to OPEN state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      circuitBreaker.forceOpen();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should force circuit to CLOSED state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(operation); } catch {}
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.forceClosed();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should calculate failure rate', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      // 2 successes, 1 failure = 33.33% failure rate
      await circuitBreaker.execute(successOp);
      await circuitBreaker.execute(successOp);
      try { await circuitBreaker.execute(failOp); } catch {}

      const failureRate = circuitBreaker.getFailureRate();
      expect(failureRate).toBeCloseTo(33.33, 1);
    });

    it('should return 0 failure rate with no executions', () => {
      expect(circuitBreaker.getFailureRate()).toBe(0);
    });

    it('should provide comprehensive statistics', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      await circuitBreaker.execute(successOp);
      try { await circuitBreaker.execute(failOp); } catch {}

      const stats = circuitBreaker.getStats();
      expect(stats.totalExecutions).toBe(2);
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.totalFailures).toBe(1);
      expect(stats.failureCount).toBe(1);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Factory Functions', () => {
    it('should create circuit breaker with default config', () => {
      const cb = createCircuitBreaker();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      cb.dispose();
    });

    it('should create circuit breaker with builder pattern', () => {
      const { circuitBreakerBuilder } = require('../../../src/core/resilience/CircuitBreaker');
      
      const cb = circuitBreakerBuilder()
        .withFailureThreshold(5)
        .withRecoveryTime(2000)
        .withHalfOpenMaxCalls(3)
        .build();

      expect(cb.getState()).toBe(CircuitState.CLOSED);
      cb.dispose();
    });
  });

  describe('Disposal', () => {
    it('should clean up resources on disposal', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getStats().totalExecutions).toBe(1);

      await circuitBreaker.dispose();

      // Should throw error when trying to use disposed circuit breaker
      await expect(circuitBreaker.execute(operation))
        .rejects.toThrow('Circuit breaker is disposed');
    });
  });
});