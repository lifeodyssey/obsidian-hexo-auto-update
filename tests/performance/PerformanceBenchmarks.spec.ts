// Performance Benchmarks for New Architecture

import { performance } from 'perf_hooks';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, rm } from 'fs/promises';

import { EventBus } from '../../src/core/events';
import { FileWatcherService } from '../../src/services/file-watcher';
import { ContentProcessingService } from '../../src/services/content-processing';
import { DIContainer } from '../../src/core/container';
import { Logger, MemoryTransport, LogLevel } from '../../src/core/logging';

interface BenchmarkResult {
  name: string;
  duration: number;
  operationsPerSecond: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    delta: NodeJS.MemoryUsage;
  };
  additionalMetrics?: Record<string, any>;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  async run(name: string, operation: () => Promise<any>, iterations: number = 1000): Promise<BenchmarkResult> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memoryBefore = process.memoryUsage();
    const startTime = performance.now();

    // Run the operation multiple times
    for (let i = 0; i < iterations; i++) {
      await operation();
    }

    const endTime = performance.now();
    const memoryAfter = process.memoryUsage();

    const duration = endTime - startTime;
    const operationsPerSecond = (iterations / duration) * 1000;

    const result: BenchmarkResult = {
      name,
      duration,
      operationsPerSecond,
      memoryUsage: {
        before: memoryBefore,
        after: memoryAfter,
        delta: {
          rss: memoryAfter.rss - memoryBefore.rss,
          heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
          heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
          external: memoryAfter.external - memoryBefore.external,
          arrayBuffers: memoryAfter.arrayBuffers - memoryBefore.arrayBuffers
        }
      }
    };

    this.results.push(result);
    return result;
  }

  getResults(): BenchmarkResult[] {
    return [...this.results];
  }

  printResults(): void {
    console.log('\n📊 Performance Benchmark Results');
    console.log('================================\n');

    this.results.forEach(result => {
      console.log(`🔧 ${result.name}`);
      console.log(`   Duration: ${result.duration.toFixed(2)}ms`);
      console.log(`   Ops/sec: ${result.operationsPerSecond.toFixed(0)}`);
      console.log(`   Memory Delta: ${(result.memoryUsage.delta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      if (result.additionalMetrics) {
        Object.entries(result.additionalMetrics).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }
      console.log('');
    });
  }

  generateReport(): string {
    const report = [
      '# Performance Benchmark Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      '| Test | Duration (ms) | Ops/sec | Memory Delta (MB) |',
      '|------|---------------|---------|-------------------|'
    ];

    this.results.forEach(result => {
      const memoryDelta = (result.memoryUsage.delta.heapUsed / 1024 / 1024).toFixed(2);
      report.push(
        `| ${result.name} | ${result.duration.toFixed(2)} | ${result.operationsPerSecond.toFixed(0)} | ${memoryDelta} |`
      );
    });

    report.push('', '## Detailed Results', '');

    this.results.forEach(result => {
      report.push(`### ${result.name}`);
      report.push('');
      report.push(`- **Duration**: ${result.duration.toFixed(2)}ms`);
      report.push(`- **Operations per second**: ${result.operationsPerSecond.toFixed(0)}`);
      report.push(`- **Memory usage**:`);
      report.push(`  - Heap Used Delta: ${(result.memoryUsage.delta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      report.push(`  - RSS Delta: ${(result.memoryUsage.delta.rss / 1024 / 1024).toFixed(2)}MB`);
      
      if (result.additionalMetrics) {
        report.push('- **Additional Metrics**:');
        Object.entries(result.additionalMetrics).forEach(([key, value]) => {
          report.push(`  - ${key}: ${value}`);
        });
      }
      report.push('');
    });

    return report.join('\n');
  }
}

describe('Performance Benchmarks', () => {
  let benchmark: PerformanceBenchmark;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'perf-test-'));
    benchmark = new PerformanceBenchmark();
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
    benchmark.printResults();
    
    // Write report to file
    const report = benchmark.generateReport();
    await writeFile(join(tempDir, '..', 'performance-report.md'), report);
  });

  describe('Core Infrastructure Performance', () => {
    it('should benchmark DI Container operations', async () => {
      const result = await benchmark.run('DI Container Resolution', async () => {
        const container = new DIContainer();
        
        // Register services
        for (let i = 0; i < 10; i++) {
          container.register(
            { name: `service${i}`, type: 'TestService' },
            () => ({ id: i })
          );
        }

        // Resolve services
        for (let i = 0; i < 10; i++) {
          container.resolve({ name: `service${i}`, type: 'TestService' });
        }

        await container.dispose();
      }, 100);

      expect(result.operationsPerSecond).toBeGreaterThan(100);
    });

    it('should benchmark Event Bus throughput', async () => {
      const eventBus = new EventBus();
      let eventsReceived = 0;

      eventBus.subscribe('perf.test', {
        handle: async () => { eventsReceived++; }
      });

      const result = await benchmark.run('Event Bus Publishing', async () => {
        await eventBus.publish({
          type: 'perf.test',
          timestamp: new Date(),
          payload: { data: 'test' }
        });
      }, 1000);

      await eventBus.dispose();

      result.additionalMetrics = {
        'Events Received': eventsReceived,
        'Event Processing Rate': `${(eventsReceived / result.duration * 1000).toFixed(0)} events/sec`
      };

      expect(result.operationsPerSecond).toBeGreaterThan(500);
    });

    it('should benchmark Logger performance', async () => {
      const logger = new Logger(LogLevel.INFO);
      const memoryTransport = new MemoryTransport(10000);
      logger.addTransport(memoryTransport);

      const result = await benchmark.run('Logger Operations', async () => {
        logger.info('Performance test message', { 
          iteration: Math.random(),
          timestamp: Date.now()
        });
      }, 1000);

      const logEntries = memoryTransport.getEntries();
      result.additionalMetrics = {
        'Log Entries Created': logEntries.length,
        'Logging Rate': `${(logEntries.length / result.duration * 1000).toFixed(0)} logs/sec`
      };

      await logger.dispose();

      expect(result.operationsPerSecond).toBeGreaterThan(1000);
    });
  });

  describe('Service Performance', () => {
    it('should benchmark Content Processing', async () => {
      const processor = new ContentProcessingService();
      
      const testContent = `---
title: Performance Test Post
date: 2023-01-01
tags: [test, performance]
---

# Performance Test

This is a test post for performance benchmarking.

## Content

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
`;

      const result = await benchmark.run('Content Processing', async () => {
        await processor.process(testContent, {
          validateFrontMatter: true,
          autoAddDate: false,
          requiredFields: ['title']
        });
      }, 500);

      result.additionalMetrics = {
        'Content Size (bytes)': testContent.length,
        'Processing Rate': `${(testContent.length * 500 / result.duration * 1000 / 1024).toFixed(2)} KB/sec`
      };

      await processor.dispose();

      expect(result.operationsPerSecond).toBeGreaterThan(100);
    });

    it('should benchmark File Watcher initialization', async () => {
      const result = await benchmark.run('File Watcher Initialization', async () => {
        const watcher = new FileWatcherService();
        
        // Create and immediately dispose to test initialization overhead
        await watcher.dispose();
      }, 100);

      expect(result.operationsPerSecond).toBeGreaterThan(50);
    });
  });

  describe('Memory Management Performance', () => {
    it('should benchmark service disposal', async () => {
      const result = await benchmark.run('Service Disposal', async () => {
        const services = [
          new ContentProcessingService(),
          new FileWatcherService(),
          new EventBus(),
          new DIContainer()
        ];

        // Dispose all services
        await Promise.all(services.map(service => service.dispose()));
      }, 50);

      expect(result.memoryUsage.delta.heapUsed).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
    });

    it('should benchmark memory usage under load', async () => {
      const eventBus = new EventBus(100); // Limited history
      const events: any[] = [];

      eventBus.subscribe('memory.test', {
        handle: async (event) => {
          events.push(event.payload);
        }
      });

      const result = await benchmark.run('High-Volume Event Processing', async () => {
        // Publish 100 events rapidly
        const promises = [];
        for (let i = 0; i < 100; i++) {
          promises.push(
            eventBus.publish({
              type: 'memory.test',
              timestamp: new Date(),
              payload: { 
                index: i,
                data: 'x'.repeat(1000) // 1KB payload
              }
            })
          );
        }
        await Promise.all(promises);
      }, 10);

      result.additionalMetrics = {
        'Events Processed': events.length,
        'Total Data Processed': `${(events.length * 1000 / 1024).toFixed(2)} KB`,
        'Memory Efficiency': `${(events.length / (result.memoryUsage.delta.heapUsed / 1024 / 1024)).toFixed(2)} events/MB`
      };

      await eventBus.dispose();

      // Should process events efficiently without excessive memory growth
      expect(result.memoryUsage.delta.heapUsed).toBeLessThan(20 * 1024 * 1024); // Less than 20MB
    });
  });

  describe('Scalability Performance', () => {
    it('should benchmark concurrent operations', async () => {
      const processor = new ContentProcessingService();
      const testContent = `---
title: Concurrent Test
---
# Test content`;

      const result = await benchmark.run('Concurrent Content Processing', async () => {
        // Process 20 files concurrently
        const promises = [];
        for (let i = 0; i < 20; i++) {
          promises.push(
            processor.process(testContent, {
              validateFrontMatter: true
            })
          );
        }
        await Promise.all(promises);
      }, 25);

      result.additionalMetrics = {
        'Concurrent Operations': 20,
        'Total Throughput': `${(20 * 25 / result.duration * 1000).toFixed(0)} files/sec`
      };

      await processor.dispose();

      expect(result.operationsPerSecond).toBeGreaterThan(10);
    });

    it('should benchmark large batch operations', async () => {
      const eventBus = new EventBus();
      let processedCount = 0;

      eventBus.subscribe('batch.test', {
        handle: async () => { processedCount++; }
      });

      const result = await benchmark.run('Large Batch Event Processing', async () => {
        // Process 1000 events in a batch
        const promises = [];
        for (let i = 0; i < 1000; i++) {
          promises.push(
            eventBus.publish({
              type: 'batch.test',
              timestamp: new Date(),
              payload: { batchIndex: i }
            })
          );
        }
        await Promise.all(promises);
      }, 5);

      result.additionalMetrics = {
        'Batch Size': 1000,
        'Events Processed': processedCount,
        'Batch Processing Rate': `${(1000 * 5 / result.duration * 1000).toFixed(0)} events/sec`
      };

      await eventBus.dispose();

      expect(result.operationsPerSecond).toBeGreaterThan(1);
      expect(processedCount).toBeGreaterThan(4000); // Should process most events
    });
  });

  describe('Performance Regression Tests', () => {
    it('should verify performance meets targets', () => {
      const results = benchmark.getResults();
      
      // Define performance targets
      const targets = {
        'DI Container Resolution': { minOpsPerSec: 100, maxMemoryMB: 10 },
        'Event Bus Publishing': { minOpsPerSec: 500, maxMemoryMB: 20 },
        'Logger Operations': { minOpsPerSec: 1000, maxMemoryMB: 10 },
        'Content Processing': { minOpsPerSec: 100, maxMemoryMB: 20 }
      };

      results.forEach(result => {
        const target = targets[result.name];
        if (target) {
          const memoryUsageMB = result.memoryUsage.delta.heapUsed / 1024 / 1024;
          
          expect(result.operationsPerSecond).toBeGreaterThanOrEqual(target.minOpsPerSec);
          expect(memoryUsageMB).toBeLessThanOrEqual(target.maxMemoryMB);
        }
      });
    });
  });
});