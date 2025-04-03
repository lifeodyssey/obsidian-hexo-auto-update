# Tests for Obsidian-Hexo Integration Plugin

This directory contains tests for the Obsidian-Hexo Integration Plugin.

## Structure

- `mocks/`: Mock implementations of external dependencies
  - `obsidian.ts`: Mocks for Obsidian API
  - `electron.ts`: Mocks for Electron API
- `unit/`: Unit tests for individual components
  - `FileService.spec.ts`: Tests for file system operations
  - `GitHandler.spec.ts`: Tests for Git functionality
  - `SettingsManager.spec.ts`: Tests for settings management
  - `SymlinkHandler.spec.ts`: Tests for symlink functionality
  - `SyncService.spec.ts`: Tests for synchronization service
  - `HexoIntegrationPlugin.spec.ts`: Tests for the main plugin
- `integration/`: Integration tests for component interactions
  - `serviceIntegration.spec.ts`: Tests for interactions between services

## Current Status

- ✅ `FileService` tests: Fully implemented
- ✅ `GitHandler` tests: Fully implemented
- ✅ `SettingsManager` tests: Fully implemented
- ✅ `SymlinkHandler` tests: Fully implemented
- ✅ `SyncService` tests: Fully implemented 
- ✅ `HexoIntegrationPlugin` tests: Fully implemented
- ✅ Integration tests: Basic service interactions covered

## Testing Approach

The testing approach follows best practices for unit and integration testing:

### Unit Tests

Unit tests focus on individual components and follow these principles:
- Isolation of the component under test using dependency mocking
- Testing of all public methods and key behaviors
- Coverage of error handling and edge cases
- Clear test organization by method or feature

### Integration Tests

Integration tests verify that components work together correctly:
- Testing of interactions between services
- Verification of correct data flow between components
- Testing of error propagation between components
- Focus on realistic usage scenarios

## Mocking Strategy

We implement proper mocking strategies to isolate components:

1. **Direct Dependencies**: Using Jest's mocking capabilities to mock direct dependencies
   - Example: `jest.mock('obsidian')` to mock Obsidian API

2. **Interface-Based Mocking**: Creating mock implementations of interfaces
   - Example: Creating mock implementations of `FileService`, `GitService`, etc.

3. **Global Objects**: Mocking global objects when needed
   - Example: Mocking `setInterval` and `clearInterval` for timer-based functionality

4. **Contextual Mocking**: Providing different mock behaviors based on test context
   - Example: Mocking file system differently based on OS

## Running Tests

To run the tests:

```bash
npm test
```

To run tests with a specific pattern:

```bash
npm test -- -t "GitHandler"
```

To run tests with coverage report:

```bash
npm test -- --coverage
```

## Coverage Goals

The current jest.config.ts includes coverage thresholds:
- 40% for branches, functions, lines, and statements as a minimum

Goals for future improvements:
- Reach 80% coverage for critical components
- Ensure error handling paths are tested
- Cover platform-specific behaviors

## Best Practices

When maintaining or adding tests, follow these guidelines:

1. **Test Naming**: Use descriptive names that explain what's being tested
   - Example: `should commit and push changes when changes are detected`

2. **AAA Pattern**: Follow Arrange-Act-Assert pattern in test cases
   - Arrange: Set up test data and mocks
   - Act: Call the method being tested
   - Assert: Verify the results

3. **Focused Assertions**: Make specific assertions that verify expected behavior
   - Example: Assert that specific methods are called with specific parameters

4. **Isolation**: Ensure tests are isolated and don't depend on each other
   - Reset mocks between tests
   - Don't share state between tests

## Mock Usage

The mocks directory contains implementations for external dependencies:

- `obsidian.ts`: Provides mock implementations of Obsidian's API classes like `App`, `Plugin`, `Notice`, etc.
- `electron.ts`: Provides mock implementations of Electron's `dialog`, `app`, and `shell` APIs.

## Known Issues

1. The `SymlinkHandler`
