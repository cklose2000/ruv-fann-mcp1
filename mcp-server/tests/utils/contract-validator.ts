import { describe, it, expect } from 'vitest';

/**
 * Contract Validation Utilities
 * 
 * These utilities ensure that mock implementations stay in sync with API contracts.
 * They prevent the "hallucination" problem where mocks drift from reality.
 */

export interface ApiContract {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  request?: Record<string, any>;
  response: Record<string, any>;
  errorResponses?: Record<number, Record<string, any>>;
}

export class ContractValidator {
  private contracts: Map<string, ApiContract> = new Map();
  
  /**
   * Register an API contract
   */
  registerContract(contract: ApiContract) {
    this.contracts.set(contract.name, contract);
  }
  
  /**
   * Validate a mock response against a contract
   */
  validateResponse(contractName: string, response: any): ValidationResult {
    const contract = this.contracts.get(contractName);
    if (!contract) {
      return {
        valid: false,
        errors: [`Contract '${contractName}' not found`],
      };
    }
    
    const errors = this.validateObject(response, contract.response, 'response');
    
    return {
      valid: errors.length === 0,
      errors,
      contract,
    };
  }
  
  /**
   * Validate a mock request against a contract
   */
  validateRequest(contractName: string, request: any): ValidationResult {
    const contract = this.contracts.get(contractName);
    if (!contract || !contract.request) {
      return {
        valid: false,
        errors: [`Contract '${contractName}' not found or has no request spec`],
      };
    }
    
    const errors = this.validateObject(request, contract.request, 'request');
    
    return {
      valid: errors.length === 0,
      errors,
      contract,
    };
  }
  
  /**
   * Recursively validate an object against a schema
   */
  private validateObject(obj: any, schema: Record<string, any>, path: string): string[] {
    const errors: string[] = [];
    
    // Check required fields
    for (const [key, spec] of Object.entries(schema)) {
      const isOptional = typeof spec === 'string' && spec.includes('optional');
      const expectedType = this.extractType(spec);
      
      if (!isOptional && !(key in obj)) {
        errors.push(`${path}.${key} is required but missing`);
        continue;
      }
      
      if (key in obj) {
        const actualType = this.getActualType(obj[key]);
        
        if (!this.typesMatch(actualType, expectedType)) {
          errors.push(
            `${path}.${key} type mismatch: expected ${expectedType}, got ${actualType}`
          );
        }
        
        // Recursively validate nested objects
        if (typeof spec === 'object' && typeof obj[key] === 'object') {
          errors.push(...this.validateObject(obj[key], spec, `${path}.${key}`));
        }
      }
    }
    
    return errors;
  }
  
  private extractType(spec: any): string {
    if (typeof spec === 'string') {
      // Extract type from strings like "number (0-1)" or "string (optional)"
      const match = spec.match(/^(\w+)/);
      return match ? match[1] : spec;
    }
    if (typeof spec === 'object') {
      return 'object';
    }
    return typeof spec;
  }
  
  private getActualType(value: any): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
  }
  
  private typesMatch(actual: string, expected: string): boolean {
    // Handle special cases
    if (expected === 'any') return true;
    if (expected === 'array' && actual === 'array') return true;
    if (expected === actual) return true;
    
    // Handle union types (e.g., "string|number")
    if (expected.includes('|')) {
      return expected.split('|').some(t => this.typesMatch(actual, t.trim()));
    }
    
    return false;
  }
  
  /**
   * Generate a mock that complies with a contract
   */
  generateMock(contractName: string): any {
    const contract = this.contracts.get(contractName);
    if (!contract) {
      throw new Error(`Contract '${contractName}' not found`);
    }
    
    return this.generateObjectFromSchema(contract.response);
  }
  
  private generateObjectFromSchema(schema: Record<string, any>): any {
    const result: any = {};
    
    for (const [key, spec] of Object.entries(schema)) {
      const type = this.extractType(spec);
      const isOptional = typeof spec === 'string' && spec.includes('optional');
      
      // Skip optional fields 50% of the time
      if (isOptional && Math.random() > 0.5) {
        continue;
      }
      
      result[key] = this.generateValueForType(type, spec);
    }
    
    return result;
  }
  
  private generateValueForType(type: string, spec: any): any {
    switch (type) {
      case 'string':
        return 'mock-string';
      case 'number':
        // Check for range constraints
        if (typeof spec === 'string' && spec.includes('0-1')) {
          return Math.random();
        }
        return Math.floor(Math.random() * 100);
      case 'boolean':
        return Math.random() > 0.5;
      case 'array':
        return [];
      case 'object':
        if (typeof spec === 'object') {
          return this.generateObjectFromSchema(spec);
        }
        return {};
      default:
        return null;
    }
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  contract?: ApiContract;
}

/**
 * Pre-defined contracts for ruv-FANN MCP Server
 */
export const ruvFannContracts: ApiContract[] = [
  {
    name: 'predict-pattern',
    endpoint: '/predict',
    method: 'POST',
    request: {
      tool: 'string',
      params: 'object',
      context: 'object (optional)',
    },
    response: {
      successProbability: 'number (0-1)',
      confidence: 'number (0-1)',
      warnings: 'array',
      suggestions: 'array',
      estimatedCost: 'number (optional)',
      estimatedDuration: 'number (optional)',
      explanation: 'string',
    },
  },
  {
    name: 'bq-query-execution',
    endpoint: '/execute/bq-query',
    method: 'POST',
    request: {
      tool: 'string',
      params: {
        query: 'string',
        projectId: 'string (optional)',
        location: 'string (optional)',
      },
    },
    response: {
      success: 'boolean',
      data: {
        rows: 'array',
        schema: 'object',
        totalRows: 'number',
      },
      metadata: {
        duration: 'number',
        bytesProcessed: 'number',
        cost: 'number',
        cacheHit: 'boolean',
      },
    },
    errorResponses: {
      400: {
        success: 'boolean',
        error: {
          code: 'string',
          message: 'string',
          details: 'object',
        },
      },
      403: {
        success: 'boolean',
        error: {
          code: 'string',
          message: 'string',
        },
      },
    },
  },
];

/**
 * Test helper for validating mocks in tests
 */
export function expectMockToMatchContract(
  mock: any,
  contractName: string,
  validator?: ContractValidator
): void {
  const v = validator || new ContractValidator();
  
  // Register default contracts if not already registered
  ruvFannContracts.forEach(c => v.registerContract(c));
  
  const result = v.validateResponse(contractName, mock);
  
  if (!result.valid) {
    throw new Error(
      `Mock does not match contract '${contractName}':\n` +
      result.errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

/**
 * Example usage in tests
 */
describe('Contract Validator Example', () => {
  it('should validate mock responses against contracts', () => {
    const validator = new ContractValidator();
    ruvFannContracts.forEach(c => validator.registerContract(c));
    
    // Valid mock
    const validMock = {
      successProbability: 0.8,
      confidence: 0.9,
      warnings: [],
      suggestions: ['Add WHERE clause'],
      explanation: 'Based on historical patterns',
    };
    
    const result = validator.validateResponse('predict-pattern', validMock);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    
    // Invalid mock (missing required field)
    const invalidMock = {
      successProbability: 0.8,
      // confidence is missing!
      warnings: [],
      suggestions: [],
    };
    
    const invalidResult = validator.validateResponse('predict-pattern', invalidMock);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors).toContain('response.confidence is required but missing');
  });
  
  it('should generate compliant mocks', () => {
    const validator = new ContractValidator();
    ruvFannContracts.forEach(c => validator.registerContract(c));
    
    const mock = validator.generateMock('predict-pattern');
    
    // Generated mock should be valid
    const result = validator.validateResponse('predict-pattern', mock);
    expect(result.valid).toBe(true);
    
    // Check specific constraints
    expect(mock.successProbability).toBeWithinRange(0, 1);
    expect(mock.confidence).toBeWithinRange(0, 1);
  });
});