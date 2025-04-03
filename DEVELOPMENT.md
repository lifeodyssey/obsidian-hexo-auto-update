# Development Guide for Obsidian-Hexo Integration Plugin

This document provides information for developers who want to contribute to the Obsidian-Hexo Integration Plugin.

## Project Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. For development with live reloading:
   ```bash
   npm run dev
   ```

## Testing

The project uses Jest for testing. Tests are located in the `/tests` directory.

### Running Tests

```bash
npm test
```

### Test Structure

- **Unit Tests**: Located in `/tests/unit/`
- **Mock Files**: Located in `/tests/mocks/` - these provide mocks for external dependencies like Obsidian and Electron

### Test Status

Currently, we have:

- ✅ Full unit tests for the `SettingsManager` and `GitHandler` components
- 🚧 Placeholder tests for `SymlinkHandler` and `HexoIntegrationPlugin` that need implementation
  
### Testing Challenges

Testing Obsidian plugins presents unique challenges because:

1. The Obsidian API isn't available in the test environment
2. Some components interact with the file system and external services
3. Features like symlinks and git operations are platform-dependent

We use Jest's mocking capabilities to address these challenges. See the mock implementations in `tests/mocks/` for examples.

### Implementing Missing Tests

Priority areas for test implementation:

1. **SymlinkHandler Tests**: The `SymlinkHandler` component handles OS-specific symlink creation. Tests need to mock OS detection and file system operations.

2. **HexoIntegrationPlugin Tests**: The main plugin class requires mocking of the Obsidian API, settings, and timers for testing auto-sync functionality.

### Testing Best Practices

When implementing tests, follow these guidelines:

1. **Mocking External Dependencies**: Always mock external modules at the top of test files
   ```typescript
   jest.mock('module-name', () => ({
     // mock implementation
   }));
   ```

2. **Test Organization**: Follow the pattern of "Setup, Execute, Verify"
   ```typescript
   it('should do something', () => {
     // Setup
     const mockData = {...};
     
     // Execute
     const result = functionUnderTest();
     
     // Verify
     expect(result).toBe(expectedValue);
   });
   ```

3. **Coverage Targets**: Aim for at least 70% coverage for new code

## Code Style

This project uses ESLint for code style enforcement. Run the linter with:

```bash
npm run lint
```

## Build Process

The build process uses esbuild, configured in `esbuild.config.mjs`.

## Release Process

[Add information about release process here]

## Directory Structure

```
├── src/                  # Source code
│   ├── git/              # Git handling functionality
│   ├── settings/         # Plugin settings components
│   ├── symlink/          # Symlink handling functionality
│   └── ...
├── tests/                # Test files
│   ├── mocks/            # Mock implementations for testing
│   ├── unit/             # Unit tests
│   └── ...
├── dist/                 # Compiled output
└── ...
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for your changes
5. Run the tests: `npm test`
6. Submit a pull request 
