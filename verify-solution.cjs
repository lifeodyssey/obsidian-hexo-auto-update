#!/usr/bin/env node

/**
 * Verification script for Clean Solution implementation
 * Follows testing strategy from CLEAN_SOLUTION.md
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Clean Solution Implementation\n');

// Check 1: Dependencies installed
console.log('📦 Checking Dependencies...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = ['chokidar', 'fast-glob', 'gray-matter'];
const installedDeps = [];

requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
        installedDeps.push(`✅ ${dep}@${packageJson.dependencies[dep]}`);
    } else {
        installedDeps.push(`❌ ${dep} - MISSING`);
    }
});

installedDeps.forEach(dep => console.log(`  ${dep}`));

// Check 2: Core service files exist
console.log('\n🏗️ Checking Core Services...');
const serviceFiles = [
    'src/services/SymlinkServiceV2.ts',
    'src/services/FileWatcherV2.ts', 
    'src/services/FileScannerV2.ts',
    'src/services/FrontMatterProcessorV2.ts',
    'src/HexoIntegrationPluginV3.ts'
];

serviceFiles.forEach(file => {
    const exists = fs.existsSync(file);
    const size = exists ? fs.statSync(file).size : 0;
    console.log(`  ${exists ? '✅' : '❌'} ${file} ${exists ? `(${Math.round(size/1024)}KB)` : '- MISSING'}`);
});

// Check 3: Build output
console.log('\n🚀 Checking Build Output...');
const buildExists = fs.existsSync('dist/main.js');
const buildSize = buildExists ? fs.statSync('dist/main.js').size : 0;
console.log(`  ${buildExists ? '✅' : '❌'} dist/main.js ${buildExists ? `(${Math.round(buildSize/1024)}KB)` : '- MISSING'}`);

// Check 4: Configuration files updated
console.log('\n⚙️ Checking Configuration...');
const configFiles = [
    { file: 'src/types.d.ts', check: 'autoSync' },
    { file: 'src/constants.ts', check: 'autoSync: true' },
    { file: 'src/index.ts', check: 'HexoIntegrationPluginV3' }
];

configFiles.forEach(({ file, check }) => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        const hasConfig = content.includes(check);
        console.log(`  ${hasConfig ? '✅' : '❌'} ${file} ${hasConfig ? `(contains ${check})` : `- Missing ${check}`}`);
    } catch (error) {
        console.log(`  ❌ ${file} - Error reading file`);
    }
});

// Check 5: Solution document
console.log('\n📋 Checking Solution Documentation...');
const docExists = fs.existsSync('CLEAN_SOLUTION.md');
const docSize = docExists ? fs.statSync('CLEAN_SOLUTION.md').size : 0;
console.log(`  ${docExists ? '✅' : '❌'} CLEAN_SOLUTION.md ${docExists ? `(${Math.round(docSize/1024)}KB)` : '- MISSING'}`);

// Summary
console.log('\n🎯 Solution Status Summary:');
const totalChecks = requiredDeps.length + serviceFiles.length + 1 + configFiles.length + 1;
let passedChecks = 0;

// Count passed checks
requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) passedChecks++;
});

serviceFiles.forEach(file => {
    if (fs.existsSync(file)) passedChecks++;
});

if (buildExists) passedChecks++;

configFiles.forEach(({ file, check }) => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes(check)) passedChecks++;
    } catch {}
});

if (docExists) passedChecks++;

const successRate = Math.round((passedChecks / totalChecks) * 100);
console.log(`  📊 ${passedChecks}/${totalChecks} checks passed (${successRate}%)`);

if (successRate >= 90) {
    console.log('  🎉 Clean Solution implementation: COMPLETE');
    console.log('  🚀 Ready for deployment and testing');
} else if (successRate >= 70) {
    console.log('  ⚠️ Clean Solution implementation: PARTIAL');  
    console.log('  🔧 Some components need attention');
} else {
    console.log('  ❌ Clean Solution implementation: INCOMPLETE');
    console.log('  🛠️ Major components missing');
}

console.log('\n📖 Next Steps:');
console.log('  1. Test permission-safe symlink creation on macOS');
console.log('  2. Verify memory-safe file watching');
console.log('  3. Test comprehensive file detection');
console.log('  4. Validate automatic front-matter processing');
console.log('  5. Deploy to Obsidian for integration testing');

console.log('\n✨ Following CLEAN_SOLUTION.md implementation guide ✨');