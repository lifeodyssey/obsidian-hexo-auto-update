// New Architecture Integration Tests

import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';

import { DIContainer } from '../../src/core/container';
import { ConfigurationManager } from '../../src/core/config';
import { EventBus } from '../../src/core/events';
import { Logger, ConsoleTransport, MemoryTransport, LogLevel } from '../../src/core/logging';
import { FileWatcherService } from '../../src/services/file-watcher';
import { ContentProcessingService } from '../../src/services/content-processing';
import { GitOperationsService, gitOperationsServiceBuilder } from '../../src/services/git-operations';
import { SynchronizationService, synchronizationServiceBuilder } from '../../src/services/synchronization';
import { HexoConfig } from '../../src/core/types';
import { TOKENS } from '../../src/core/tokens';

describe('New Architecture Integration', () => {
  let tempDir: string;
  let container: DIContainer;
  let eventBus: EventBus;
  let logger: Logger;
  let memoryTransport: MemoryTransport;
  let configManager: ConfigurationManager;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), 'hexo-integration-test-'));

    // Set up container
    container = new DIContainer();

    // Set up event bus
    eventBus = new EventBus();
    container.registerSingleton(TOKENS.EventBus, () => eventBus);

    // Set up logger with memory transport for testing
    logger = new Logger(LogLevel.DEBUG);
    memoryTransport = new MemoryTransport();
    logger.addTransport(memoryTransport);
    logger.addTransport(new ConsoleTransport(false)); // No colors for tests
    container.registerSingleton(TOKENS.Logger, () => logger);

    // Set up configuration
    const configPath = join(tempDir, 'hexo-integration.json');
    configManager = new ConfigurationManager(configPath);
    container.registerSingleton(TOKENS.ConfigurationManager, () => configManager);
  });

  afterEach(async () => {
    // Clean up
    await container.dispose();
    await eventBus.dispose();
    await logger.dispose();
    
    // Remove temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  describe('Service Integration', () => {
    it('should initialize all services successfully', async () => {
      const config: HexoConfig = {
        paths: {
          source: tempDir,
          posts: 'posts',
          output: 'public',
          vault: tempDir
        },
        sync: {
          watchMode: false,
          batchSize: 10,
          debounceMs: 100,
          retryAttempts: 2,
          retryDelayMs: 100
        },
        git: {
          commitMessageTemplate: 'Update: {{count}} files',
          autoCommit: true,
          autoPush: false,
          branchName: 'main'
        },
        frontMatter: {
          autoAddDate: true,
          dateFormat: 'YYYY-MM-DD',
          requiredFields: ['title']
        }
      };

      await configManager.save(config);

      // Initialize services
      const fileWatcher = new FileWatcherService();
      container.registerSingleton(TOKENS.FileWatcherService, () => fileWatcher);

      const contentProcessor = new ContentProcessingService();
      container.registerSingleton(TOKENS.ContentProcessor, () => contentProcessor);

      // Note: Skip git operations in test as we don't have a real git repo
      // const gitOperations = gitOperationsServiceBuilder()
      //   .withRepoPath(tempDir)
      //   .withEventBus(eventBus)
      //   .withLogger(logger)
      //   .build();

      // Verify services are registered
      expect(container.isRegistered(TOKENS.EventBus)).toBe(true);
      expect(container.isRegistered(TOKENS.Logger)).toBe(true);
      expect(container.isRegistered(TOKENS.ConfigurationManager)).toBe(true);
      expect(container.isRegistered(TOKENS.FileWatcherService)).toBe(true);
      expect(container.isRegistered(TOKENS.ContentProcessor)).toBe(true);

      // Verify services can be resolved
      const resolvedEventBus = container.resolve(TOKENS.EventBus);
      const resolvedLogger = container.resolve(TOKENS.Logger);
      const resolvedConfig = container.resolve(TOKENS.ConfigurationManager);

      expect(resolvedEventBus).toBe(eventBus);
      expect(resolvedLogger).toBe(logger);
      expect(resolvedConfig).toBe(configManager);
    });

    it('should handle configuration changes across services', async () => {
      const initialConfig: HexoConfig = {
        paths: { source: tempDir, posts: 'posts', output: 'public', vault: tempDir },
        sync: { watchMode: false, batchSize: 5, debounceMs: 100, retryAttempts: 2, retryDelayMs: 100 },
        git: { commitMessageTemplate: 'Update: {{count}} files', autoCommit: true, autoPush: false, branchName: 'main' },
        frontMatter: { autoAddDate: true, dateFormat: 'YYYY-MM-DD', requiredFields: ['title'] }
      };

      await configManager.save(initialConfig);

      // Set up event tracking
      const configChangeEvents: any[] = [];
      eventBus.subscribe('config.changed', {
        handle: async (event) => {
          configChangeEvents.push(event.payload);
        }
      });

      // Update configuration
      const updatedConfig = {
        ...initialConfig,
        sync: { ...initialConfig.sync, batchSize: 20 }
      };

      await configManager.save(updatedConfig);

      // Publish config change event
      await eventBus.publish({
        type: 'config.changed',
        timestamp: new Date(),
        payload: { batchSize: 20 }
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(configChangeEvents).toHaveLength(1);
      expect(configChangeEvents[0].batchSize).toBe(20);
    });
  });

  describe('Content Processing Integration', () => {
    it('should process markdown content with front-matter', async () => {
      const contentProcessor = new ContentProcessingService();

      const markdownContent = `---
title: Test Post
---

# Hello World

This is a test post.`;

      const processedContent = await contentProcessor.process(markdownContent, {
        validateFrontMatter: true,
        autoAddDate: true,
        dateFormat: 'YYYY-MM-DD',
        requiredFields: ['title']
      });

      expect(processedContent).toContain('title: Test Post');
      expect(processedContent).toContain('# Hello World');

      // Verify front-matter extraction
      const frontMatter = await contentProcessor.extract(processedContent);
      expect(frontMatter.title).toBe('Test Post');

      await contentProcessor.dispose();
    });

    it('should validate content and report errors', async () => {
      const contentProcessor = new ContentProcessingService();

      const invalidContent = `---
tags: not-an-array
---

# Invalid Post`;

      const validationResult = await contentProcessor.validate(invalidContent);

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'title',
            message: expect.stringContaining('missing')
          })
        ])
      );

      await contentProcessor.dispose();
    });
  });

  describe('File Watching Integration', () => {
    it('should watch files and emit events', async (done) => {
      const fileWatcher = new FileWatcherService(50); // Short debounce for tests
      const postsDir = join(tempDir, 'posts');

      // Create posts directory
      await writeFile(join(tempDir, '.gitkeep'), ''); // Ensure directory exists

      const events: any[] = [];
      const subscription = fileWatcher.watch(tempDir, {
        extensions: ['.md'],
        recursive: true
      }).subscribe({
        next: (event) => {
          events.push(event);
          if (events.length >= 1) {
            subscription.unsubscribe();
            
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('created');
            expect(events[0].path).toContain('test-post.md');
            
            fileWatcher.dispose().then(() => done());
          }
        },
        error: (error) => {
          fileWatcher.dispose().then(() => done(error));
        }
      });

      // Wait a bit then create a file
      setTimeout(async () => {
        await writeFile(join(tempDir, 'test-post.md'), '# Test Post');
      }, 100);
    }, 10000);

    it('should handle multiple file changes in batch', async (done) => {
      const fileWatcher = new FileWatcherService(100);
      
      const events: any[] = [];
      const subscription = fileWatcher.watch(tempDir, {
        extensions: ['.md']
      }).subscribe({
        next: (event) => {
          events.push(event);
        },
        complete: () => {
          expect(events.length).toBeGreaterThan(0);
          fileWatcher.dispose().then(() => done());
        }
      });

      // Create multiple files quickly
      setTimeout(async () => {
        await Promise.all([
          writeFile(join(tempDir, 'post1.md'), '# Post 1'),
          writeFile(join(tempDir, 'post2.md'), '# Post 2'),
          writeFile(join(tempDir, 'post3.md'), '# Post 3')
        ]);

        // Stop watching after a delay
        setTimeout(() => {
          subscription.unsubscribe();
          fileWatcher.dispose().then(() => done());
        }, 300);
      }, 50);
    }, 10000);
  });

  describe('Event Flow Integration', () => {
    it('should coordinate events between services', async () => {
      const events: string[] = [];

      // Track different event types
      const eventTypes = [
        'sync.started',
        'sync.batch.started',
        'sync.batch.completed',
        'sync.completed',
        'file.created',
        'content.processed'
      ];

      eventTypes.forEach(eventType => {
        eventBus.subscribe(eventType, {
          handle: async (event) => {
            events.push(eventType);
            logger.info(`Event received: ${eventType}`, { payload: event.payload });
          }
        });
      });

      // Simulate a workflow
      await eventBus.publish({
        type: 'sync.started',
        timestamp: new Date(),
        payload: { watchMode: true }
      });

      await eventBus.publish({
        type: 'file.created',
        timestamp: new Date(),
        payload: { path: '/test/post.md' }
      });

      await eventBus.publish({
        type: 'content.processed',
        timestamp: new Date(),
        payload: { file: '/test/post.md' }
      });

      await eventBus.publish({
        type: 'sync.completed',
        timestamp: new Date(),
        payload: { processedFiles: 1 }
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(events).toContain('sync.started');
      expect(events).toContain('file.created');
      expect(events).toContain('content.processed');
      expect(events).toContain('sync.completed');

      // Verify logging
      const logEntries = memoryTransport.getEntries();
      expect(logEntries.length).toBeGreaterThan(0);
      expect(logEntries.some(entry => entry.message.includes('Event received'))).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors gracefully across services', async () => {
      const errorEvents: any[] = [];
      
      eventBus.subscribe('system.error', {
        handle: async (event) => {
          errorEvents.push(event.payload);
        }
      });

      // Create a failing handler
      eventBus.subscribe('test.failing', {
        handle: async () => {
          throw new Error('Simulated service failure');
        }
      });

      // Publish event that will cause error
      await eventBus.publish({
        type: 'test.failing',
        timestamp: new Date(),
        payload: {}
      });

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error).toBe('Simulated service failure');

      // Verify error was logged
      const errorLogs = memoryTransport.getEntriesByLevel(LogLevel.ERROR);
      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Integration', () => {
    it('should handle high-volume events efficiently', async () => {
      const startTime = Date.now();
      const eventCount = 1000;
      const receivedEvents: any[] = [];

      eventBus.subscribe('performance.test', {
        handle: async (event) => {
          receivedEvents.push(event);
        }
      });

      // Publish many events
      const publishPromises = [];
      for (let i = 0; i < eventCount; i++) {
        publishPromises.push(
          eventBus.publish({
            type: 'performance.test',
            timestamp: new Date(),
            payload: { index: i }
          })
        );
      }

      await Promise.all(publishPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(receivedEvents).toHaveLength(eventCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      logger.info('Performance test completed', {
        eventCount,
        duration,
        eventsPerSecond: eventCount / (duration / 1000)
      });
    });

    it('should manage memory usage effectively', async () => {
      // Test memory management by creating and disposing many services
      const services: any[] = [];

      for (let i = 0; i < 100; i++) {
        const contentProcessor = new ContentProcessingService();
        services.push(contentProcessor);
      }

      // Dispose all services
      await Promise.all(services.map(service => service.dispose()));

      // Verify memory transport doesn't grow excessively
      const logEntries = memoryTransport.getEntries();
      expect(logEntries.length).toBeLessThan(1000); // Reasonable upper bound

      logger.info('Memory test completed', {
        serviceCount: services.length,
        logEntries: logEntries.length
      });
    });
  });
});