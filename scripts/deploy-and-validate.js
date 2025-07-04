#!/usr/bin/env node

/**
 * Deployment and Validation Script for Obsidian-Hexo Integration Plugin v2.0
 * 
 * This script automates the deployment process and validates the new architecture
 * to ensure everything is working correctly before going live.
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class DeploymentValidator {
  constructor() {
    this.results = {
      preChecks: [],
      build: [],
      tests: [],
      migration: [],
      performance: [],
      security: [],
      deployment: []
    };
    this.errors = [];
    this.warnings = [];
  }

  async run() {
    console.log('🚀 Starting Deployment and Validation Process');
    console.log('=' .repeat(50));

    try {
      await this.preDeploymentChecks();
      await this.buildValidation();
      await this.runTests();
      await this.validateMigration();
      await this.performanceValidation();
      await this.securityValidation();
      await this.deploymentReadiness();
      
      this.generateReport();
      
      if (this.errors.length === 0) {
        console.log('✅ All validations passed! Ready for deployment.');
        process.exit(0);
      } else {
        console.log('❌ Validation failed. Please address the errors before deployment.');
        process.exit(1);
      }
    } catch (error) {
      console.error('💥 Deployment validation failed:', error);
      process.exit(1);
    }
  }

  async preDeploymentChecks() {
    console.log('\n📋 Pre-deployment Checks');
    console.log('-'.repeat(30));

    const checks = [
      {
        name: 'Node.js Version',
        test: () => {
          const version = process.version;
          const major = parseInt(version.slice(1).split('.')[0]);
          return major >= 16;
        },
        error: 'Node.js 16+ required'
      },
      {
        name: 'Package Dependencies',
        test: async () => {
          try {
            await fs.access('node_modules');
            return true;
          } catch {
            return false;
          }
        },
        error: 'Dependencies not installed. Run npm install.'
      },
      {
        name: 'TypeScript Configuration',
        test: async () => {
          try {
            await fs.access('tsconfig.json');
            return true;
          } catch {
            return false;
          }
        },
        error: 'tsconfig.json not found'
      },
      {
        name: 'Source Files Present',
        test: async () => {
          const requiredFiles = [
            'src/core/types.ts',
            'src/core/container/DIContainer.ts',
            'src/core/events/EventBus.ts',
            'src/services/file-watcher/FileWatcherService.ts',
            'src/services/synchronization/SynchronizationService.ts',
            'src/HexoIntegrationPluginV2.ts'
          ];

          for (const file of requiredFiles) {
            try {
              await fs.access(file);
            } catch {
              return false;
            }
          }
          return true;
        },
        error: 'Required source files missing'
      },
      {
        name: 'Test Files Present',
        test: async () => {
          try {
            await fs.access('tests/unit/core');
            await fs.access('tests/integration');
            return true;
          } catch {
            return false;
          }
        },
        error: 'Test files missing'
      }
    ];

    for (const check of checks) {
      try {
        const result = await check.test();
        if (result) {
          console.log(`✅ ${check.name}`);
          this.results.preChecks.push({ name: check.name, status: 'pass' });
        } else {
          console.log(`❌ ${check.name}: ${check.error}`);
          this.results.preChecks.push({ name: check.name, status: 'fail', error: check.error });
          this.errors.push(`Pre-check failed: ${check.name}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
        this.results.preChecks.push({ name: check.name, status: 'error', error: error.message });
        this.errors.push(`Pre-check error: ${check.name}`);
      }
    }
  }

  async buildValidation() {
    console.log('\n🔨 Build Validation');
    console.log('-'.repeat(20));

    try {
      console.log('Building TypeScript...');
      execSync('npx tsc -noEmit', { stdio: 'pipe' });
      console.log('✅ TypeScript compilation successful');
      this.results.build.push({ name: 'TypeScript Compilation', status: 'pass' });

      console.log('Building plugin...');
      execSync('npm run build', { stdio: 'pipe' });
      console.log('✅ Plugin build successful');
      this.results.build.push({ name: 'Plugin Build', status: 'pass' });

      // Check output files
      await fs.access('main.js');
      console.log('✅ Output files generated');
      this.results.build.push({ name: 'Output Files', status: 'pass' });

    } catch (error) {
      console.log('❌ Build failed:', error.message);
      this.results.build.push({ name: 'Build Process', status: 'fail', error: error.message });
      this.errors.push('Build validation failed');
    }
  }

  async runTests() {
    console.log('\n🧪 Running Tests');
    console.log('-'.repeat(15));

    const testSuites = [
      {
        name: 'Unit Tests',
        command: 'npm run test -- --testPathPattern=unit',
        required: true
      },
      {
        name: 'Integration Tests',
        command: 'npm run test -- --testPathPattern=integration',
        required: true
      },
      {
        name: 'Performance Tests',
        command: 'npm run test -- --testPathPattern=performance',
        required: false
      }
    ];

    for (const suite of testSuites) {
      try {
        console.log(`Running ${suite.name}...`);
        const output = execSync(suite.command, { 
          stdio: 'pipe', 
          encoding: 'utf8',
          timeout: 60000 // 1 minute timeout
        });

        if (output.includes('PASS') || output.includes('Tests: ')) {
          console.log(`✅ ${suite.name} passed`);
          this.results.tests.push({ name: suite.name, status: 'pass' });
        } else {
          console.log(`⚠️ ${suite.name} completed with warnings`);
          this.results.tests.push({ name: suite.name, status: 'warning' });
          if (suite.required) {
            this.warnings.push(`${suite.name} had warnings`);
          }
        }
      } catch (error) {
        console.log(`❌ ${suite.name} failed:`, error.message);
        this.results.tests.push({ name: suite.name, status: 'fail', error: error.message });
        
        if (suite.required) {
          this.errors.push(`Required test suite failed: ${suite.name}`);
        } else {
          this.warnings.push(`Optional test suite failed: ${suite.name}`);
        }
      }
    }
  }

  async validateMigration() {
    console.log('\n🔄 Migration Validation');
    console.log('-'.repeat(20));

    const migrationChecks = [
      {
        name: 'Migration Utilities Present',
        test: async () => {
          await fs.access('src/migration/MigrationUtilities.ts');
          return true;
        }
      },
      {
        name: 'Backwards Compatibility',
        test: async () => {
          // Check that old service exports still exist
          const indexContent = await fs.readFile('src/services/index.ts', 'utf8');
          return indexContent.includes('FileService') && 
                 indexContent.includes('GitService') &&
                 indexContent.includes('SyncService');
        }
      },
      {
        name: 'Configuration Migration',
        test: async () => {
          // Check configuration manager handles old format
          const configContent = await fs.readFile('src/core/config/ConfigurationManager.ts', 'utf8');
          return configContent.includes('validate') && configContent.includes('merge');
        }
      }
    ];

    for (const check of migrationChecks) {
      try {
        const result = await check.test();
        if (result) {
          console.log(`✅ ${check.name}`);
          this.results.migration.push({ name: check.name, status: 'pass' });
        } else {
          console.log(`❌ ${check.name}`);
          this.results.migration.push({ name: check.name, status: 'fail' });
          this.errors.push(`Migration check failed: ${check.name}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
        this.results.migration.push({ name: check.name, status: 'error', error: error.message });
        this.errors.push(`Migration validation error: ${check.name}`);
      }
    }
  }

  async performanceValidation() {
    console.log('\n⚡ Performance Validation');
    console.log('-'.repeat(25));

    try {
      // Run performance benchmarks if available
      const hasPerfTests = await fs.access('tests/performance').then(() => true).catch(() => false);
      
      if (hasPerfTests) {
        console.log('Running performance benchmarks...');
        const output = execSync('npm run test -- --testPathPattern=performance --verbose', { 
          stdio: 'pipe', 
          encoding: 'utf8',
          timeout: 120000 // 2 minute timeout
        });

        // Parse performance results
        const lines = output.split('\n');
        const performanceMetrics = {};
        
        lines.forEach(line => {
          if (line.includes('ops/sec')) {
            const match = line.match(/(\w+.*?):\s*(\d+\.?\d*)/);
            if (match) {
              performanceMetrics[match[1]] = parseFloat(match[2]);
            }
          }
        });

        // Validate against targets
        const targets = {
          'DI Container Resolution': 100,
          'Event Bus Publishing': 500,
          'Content Processing': 100
        };

        let allTargetsMet = true;
        Object.entries(targets).forEach(([metric, target]) => {
          const actual = performanceMetrics[metric];
          if (actual && actual >= target) {
            console.log(`✅ ${metric}: ${actual} ops/sec (target: ${target})`);
          } else {
            console.log(`⚠️ ${metric}: ${actual || 'N/A'} ops/sec (target: ${target})`);
            allTargetsMet = false;
          }
        });

        if (allTargetsMet) {
          this.results.performance.push({ name: 'Performance Targets', status: 'pass' });
        } else {
          this.results.performance.push({ name: 'Performance Targets', status: 'warning' });
          this.warnings.push('Some performance targets not met');
        }
      } else {
        console.log('⚠️ Performance tests not found, skipping benchmarks');
        this.results.performance.push({ name: 'Performance Tests', status: 'skipped' });
      }

      console.log('✅ Performance validation completed');
    } catch (error) {
      console.log('❌ Performance validation failed:', error.message);
      this.results.performance.push({ name: 'Performance Validation', status: 'fail', error: error.message });
      this.warnings.push('Performance validation failed');
    }
  }

  async securityValidation() {
    console.log('\n🔒 Security Validation');
    console.log('-'.repeat(20));

    const securityChecks = [
      {
        name: 'No Hardcoded Secrets',
        test: async () => {
          const patterns = [/password\s*=\s*["'][^"']+["']/i, /api_key\s*=\s*["'][^"']+["']/i, /token\s*=\s*["'][^"']+["']/i];
          const srcFiles = await this.getAllSourceFiles();
          
          for (const file of srcFiles) {
            const content = await fs.readFile(file, 'utf8');
            for (const pattern of patterns) {
              if (pattern.test(content)) {
                return false;
              }
            }
          }
          return true;
        }
      },
      {
        name: 'Input Validation Present',
        test: async () => {
          const validationFiles = [
            'src/core/config/ConfigurationManager.ts'
          ];
          
          for (const file of validationFiles) {
            const content = await fs.readFile(file, 'utf8');
            if (!content.includes('validate') || !content.includes('throw')) {
              return false;
            }
          }
          return true;
        }
      },
      {
        name: 'Error Handling Secure',
        test: async () => {
          const serviceFiles = await this.getAllSourceFiles();
          const unsafePatterns = [/console\.log\([^)]*error[^)]*\)/i, /throw.*error\.stack/i];
          
          for (const file of serviceFiles) {
            const content = await fs.readFile(file, 'utf8');
            for (const pattern of unsafePatterns) {
              if (pattern.test(content)) {
                return false;
              }
            }
          }
          return true;
        }
      }
    ];

    for (const check of securityChecks) {
      try {
        const result = await check.test();
        if (result) {
          console.log(`✅ ${check.name}`);
          this.results.security.push({ name: check.name, status: 'pass' });
        } else {
          console.log(`❌ ${check.name}`);
          this.results.security.push({ name: check.name, status: 'fail' });
          this.errors.push(`Security check failed: ${check.name}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
        this.results.security.push({ name: check.name, status: 'error', error: error.message });
        this.warnings.push(`Security validation error: ${check.name}`);
      }
    }
  }

  async deploymentReadiness() {
    console.log('\n🚢 Deployment Readiness');
    console.log('-'.repeat(25));

    const readinessChecks = [
      {
        name: 'Manifest File Valid',
        test: async () => {
          const manifest = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
          return manifest.id && manifest.name && manifest.version && manifest.minAppVersion;
        }
      },
      {
        name: 'Documentation Complete',
        test: async () => {
          const docs = [
            'README.md',
            'ARCHITECTURE_DOCUMENTATION.md',
            'MIGRATION_GUIDE.md',
            'SECURITY_REVIEW.md'
          ];
          
          for (const doc of docs) {
            await fs.access(doc);
          }
          return true;
        }
      },
      {
        name: 'Package.json Valid',
        test: async () => {
          const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
          return pkg.name && pkg.version && pkg.scripts && pkg.dependencies;
        }
      },
      {
        name: 'Build Output Ready',
        test: async () => {
          await fs.access('main.js');
          const stat = await fs.stat('main.js');
          return stat.size > 0;
        }
      }
    ];

    for (const check of readinessChecks) {
      try {
        const result = await check.test();
        if (result) {
          console.log(`✅ ${check.name}`);
          this.results.deployment.push({ name: check.name, status: 'pass' });
        } else {
          console.log(`❌ ${check.name}`);
          this.results.deployment.push({ name: check.name, status: 'fail' });
          this.errors.push(`Deployment readiness failed: ${check.name}`);
        }
      } catch (error) {
        console.log(`❌ ${check.name}: ${error.message}`);
        this.results.deployment.push({ name: check.name, status: 'error', error: error.message });
        this.errors.push(`Deployment readiness error: ${check.name}`);
      }
    }
  }

  async getAllSourceFiles() {
    const files = [];
    
    async function walkDir(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          files.push(fullPath);
        }
      }
    }
    
    await walkDir('src');
    return files;
  }

  generateReport() {
    console.log('\n📊 Deployment Validation Report');
    console.log('='.repeat(40));

    const sections = [
      { name: 'Pre-deployment Checks', results: this.results.preChecks },
      { name: 'Build Validation', results: this.results.build },
      { name: 'Test Results', results: this.results.tests },
      { name: 'Migration Validation', results: this.results.migration },
      { name: 'Performance Validation', results: this.results.performance },
      { name: 'Security Validation', results: this.results.security },
      { name: 'Deployment Readiness', results: this.results.deployment }
    ];

    sections.forEach(section => {
      console.log(`\n${section.name}:`);
      section.results.forEach(result => {
        const status = result.status === 'pass' ? '✅' : 
                      result.status === 'warning' ? '⚠️' : 
                      result.status === 'skipped' ? '⏭️' : '❌';
        console.log(`  ${status} ${result.name}`);
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
      });
    });

    console.log('\n📈 Summary:');
    console.log(`  Errors: ${this.errors.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ Errors that must be fixed:');
      this.errors.forEach(error => console.log(`  • ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️ Warnings (recommended to address):');
      this.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    // Write detailed report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      results: this.results,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        totalChecks: Object.values(this.results).flat().length,
        passed: Object.values(this.results).flat().filter(r => r.status === 'pass').length,
        failed: Object.values(this.results).flat().filter(r => r.status === 'fail').length,
        warnings: Object.values(this.results).flat().filter(r => r.status === 'warning').length
      }
    };

    fs.writeFile('deployment-validation-report.json', JSON.stringify(reportData, null, 2))
      .catch(err => console.warn('Could not write detailed report:', err.message));
  }
}

// Run the deployment validation
if (require.main === module) {
  const validator = new DeploymentValidator();
  validator.run().catch(error => {
    console.error('Deployment validation failed:', error);
    process.exit(1);
  });
}

module.exports = DeploymentValidator;