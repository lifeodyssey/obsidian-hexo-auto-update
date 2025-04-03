# Tests for Obsidian-Hexo Integration Plugin

This directory contains tests for the Obsidian-Hexo Integration Plugin.

## Structure

- `mocks/`: Mock implementations of external dependencies
  - `obsidian.ts`: Mocks for Obsidian API
  - `electron.ts`: Mocks for Electron API
- `unit/`: Unit tests for individual components
  - `GitHandler.spec.ts`: Tests for Git functionality
  - `SettingsManager.spec.ts`: Tests for settings management
  - `SymlinkHandler.spec.ts`: Placeholder tests for symlink functionality
  - `HexoIntegrationPlugin.spec.ts`: Placeholder tests for the main plugin

## Current Status

- ✅ `GitHandler` tests: Fully implemented
- ✅ `SettingsManager` tests: Fully implemented
- 🚧 `SymlinkHandler` tests: Placeholder only (needs implementation)
- 🚧 `HexoIntegrationPlugin` tests: Placeholder only (needs implementation)

## Test Implementation Plan

### 1. SymlinkHandler Tests

The `SymlinkHandler` tests need to properly mock:
- OS detection via `os.platform()`
- File system operations via `fs` module
- The `symlink-dir` module

Initial attempts encountered issues with mocking these dependencies correctly. The plan is to:
1. Improve mock implementations for these modules
2. Use Jest's manual mocking capabilities to provide better control
3. Implement tests for all the key methods

### 2. HexoIntegrationPlugin Tests

The main plugin class tests need to properly mock:
- Obsidian API
- The timer functionality for auto-sync
- Dependency injection for GitHandler and SymlinkHandler

### 3. Integration Tests

Once unit tests are complete, we'll add integration tests that verify how components work together.

## Mock Usage

The mocks directory contains implementations for external dependencies:

- `obsidian.ts`: Provides mock implementations of Obsidian's API classes like `App`, `Plugin`, `Notice`, etc.
- `electron.ts`: Provides mock implementations of Electron's `dialog`, `app`, and `shell` APIs.

## Running Tests

To run the tests:

```bash
npm test
```

To run tests with a specific pattern:

```bash
npm test -- -t "GitHandler"
```

## Contributing Tests

When implementing the missing tests, please follow the patterns established in the existing tests:

1. Mock dependencies at the top of the file
2. Use descriptive test names that explain what's being tested
3. Organize tests into `describe` blocks by method or feature
4. Follow the "Setup, Execute, Verify" pattern in test cases

## Known Issues

1. The `SymlinkHandler` tests have been challenging due to the difficulty of properly mocking OS-specific behavior and the symlink-dir module.
2. Testing the main plugin class is complex due to its interactions with the Obsidian API and interval timers. 
