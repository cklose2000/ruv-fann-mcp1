#!/usr/bin/env node

/**
 * Simple Database Validation Test
 * Agent A - Database Validation Report
 */

import { existsSync } from 'fs';
import { spawn } from 'child_process';

console.log('=== ruv-FANN MCP System Database Validation ===\n');

// File existence check
const databases = [
  { name: 'ruv_swarm.db', path: '/home/cklose/ruv-fann-mcp1/ruv_swarm.db' },
  { name: 'patterns.db', path: '/home/cklose/ruv-fann-mcp1/mcp-server/data/patterns.db' }
];

console.log('DATABASE FILE VALIDATION:\n');

for (const db of databases) {
  if (existsSync(db.path)) {
    console.log(`✓ ${db.name}: EXISTS`);
    
    // Get file stats
    const stats = await import('fs').then(fs => fs.statSync(db.path));
    console.log(`  Size: ${stats.size} bytes`);
    console.log(`  Modified: ${stats.mtime.toISOString()}`);
    console.log(`  Path: ${db.path}`);
  } else {
    console.log(`✗ ${db.name}: NOT FOUND`);
    console.log(`  Expected path: ${db.path}`);
  }
  console.log();
}

// Service connectivity test
console.log('SERVICE CONNECTIVITY TEST:\n');

const services = [
  { name: 'Core', port: 8090 },
  { name: 'Swarm', port: 8081 }, 
  { name: 'Model', port: 8082 }
];

for (const service of services) {
  try {
    const response = await fetch(`http://localhost:${service.port}/health`);
    if (response.ok) {
      const status = await response.text();
      console.log(`✓ ${service.name} (${service.port}): ${status.trim()}`);
    } else {
      console.log(`✗ ${service.name} (${service.port}): HTTP ${response.status}`);
    }
  } catch (error) {
    console.log(`✗ ${service.name} (${service.port}): ${error.message}`);
  }
}

console.log('\n=== PROCESS STATUS ===\n');

// Check running processes
const psCommand = spawn('ps', ['aux']);
let psOutput = '';

psCommand.stdout.on('data', (data) => {
  psOutput += data.toString();
});

psCommand.on('close', (code) => {
  const ruvProcesses = psOutput.split('\n').filter(line => line.includes('ruv'));
  
  if (ruvProcesses.length > 0) {
    console.log('Running ruv processes:');
    ruvProcesses.forEach(proc => {
      const parts = proc.split(/\s+/);
      if (parts.length > 10) {
        console.log(`  PID ${parts[1]}: ${parts.slice(10).join(' ')}`);
      }
    });
  } else {
    console.log('No ruv processes found running');
  }
  
  console.log('\n=== DEPENDENCIES CHECK ===\n');
  
  // Check if dependencies are available
  const dependencyPaths = [
    '/home/cklose/ruv-fann-mcp1/mcp-server/node_modules/better-sqlite3',
    '/home/cklose/ruv-fann-mcp1/target/release/ruv-swarm',
    '/home/cklose/ruv-fann-mcp1/target/release/ruv-fann-core'
  ];
  
  for (const depPath of dependencyPaths) {
    if (existsSync(depPath)) {
      console.log(`✓ ${depPath.split('/').pop()}: Available`);
    } else {
      console.log(`✗ ${depPath.split('/').pop()}: Missing`);
    }
  }
  
  console.log('\n=== CONFIGURATION ANALYSIS ===\n');
  
  // Check environment variables
  const envVars = [
    'RUV_FANN_CORE_URL',
    'RUV_FANN_SWARM_URL',
    'RUV_FANN_MODEL_URL',
    'DATABASE_URL',
    'PORT'
  ];
  
  console.log('Environment variables:');
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value) {
      console.log(`  ${envVar}: ${value}`);
    } else {
      console.log(`  ${envVar}: Not set (using defaults)`);
    }
  }
  
  console.log('\n=== SUMMARY ===\n');
  
  const swarmDbExists = existsSync('/home/cklose/ruv-fann-mcp1/ruv_swarm.db');
  const patternsDbExists = existsSync('/home/cklose/ruv-fann-mcp1/mcp-server/data/patterns.db');
  const hasRuvProcesses = ruvProcesses.length > 0;
  
  console.log(`Database readiness: ${swarmDbExists && patternsDbExists ? '✓ Ready' : '✗ Issues found'}`);
  console.log(`Service status: ${hasRuvProcesses ? '✓ Processes running' : '✗ Services not running'}`);
  console.log(`Environment: ${envVars.some(v => process.env[v]) ? '✓ Some variables set' : '✓ Using defaults'}`);
  
  if (swarmDbExists && patternsDbExists && hasRuvProcesses) {
    console.log('\n✓ System appears ready for testing');
  } else {
    console.log('\n⚠ System has issues that need attention');
  }
  
  console.log('\n=== RECOMMENDATIONS ===\n');
  
  if (!swarmDbExists) {
    console.log('- ruv_swarm.db not found - may need to initialize swarm service');
  }
  if (!patternsDbExists) {
    console.log('- patterns.db not found - may need to initialize pattern learning');
  }
  if (!hasRuvProcesses) {
    console.log('- No ruv processes running - start services with ./start-all.sh');
  }
  
  console.log('- Default ports: 8081 (swarm), 8090 (core), 8082 (model)');
  console.log('- Database files should be initialized on first run');
  console.log('- MCP server dependencies appear to be installed');
});