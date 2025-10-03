import { createErrorResponse } from './responses.js';

// Input validation rules
export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'disputeId' | 'merchantId' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  sanitize?: boolean;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

/**
 * Sanitize string input to prevent XSS and injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove any HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Remove any script tags more aggressively
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Escape special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // Trim whitespace
  return sanitized.trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate Stripe dispute ID format
 */
export function isValidDisputeId(id: string): boolean {
  // Stripe dispute IDs start with 'dp_' or 'du_'
  return /^(dp_|du_)[a-zA-Z0-9]{24,}$/.test(id);
}

/**
 * Validate Stripe account ID format
 */
export function isValidMerchantId(id: string): boolean {
  // Stripe account IDs start with 'acct_'
  return /^acct_[a-zA-Z0-9]{16,}$/.test(id);
}

/**
 * Validate a single value against a rule
 */
export function validateValue(value: any, rule: ValidationRule): { valid: boolean; error?: string } {
  // Check required
  if (rule.required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: 'Field is required' };
  }
  
  // If not required and empty, skip other validations
  if (!rule.required && (value === undefined || value === null || value === '')) {
    return { valid: true };
  }
  
  // Type validation
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: 'Must be a string' };
      }
      if (rule.minLength && value.length < rule.minLength) {
        return { valid: false, error: `Must be at least ${rule.minLength} characters` };
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        return { valid: false, error: `Must be at most ${rule.maxLength} characters` };
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return { valid: false, error: 'Invalid format' };
      }
      if (rule.enum && !rule.enum.includes(value)) {
        return { valid: false, error: `Must be one of: ${rule.enum.join(', ')}` };
      }
      break;
      
    case 'number':
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: 'Must be a number' };
      }
      if (rule.min !== undefined && num < rule.min) {
        return { valid: false, error: `Must be at least ${rule.min}` };
      }
      if (rule.max !== undefined && num > rule.max) {
        return { valid: false, error: `Must be at most ${rule.max}` };
      }
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return { valid: false, error: 'Must be a boolean' };
      }
      break;
      
    case 'email':
      if (!isValidEmail(value)) {
        return { valid: false, error: 'Invalid email format' };
      }
      break;
      
    case 'url':
      if (!isValidUrl(value)) {
        return { valid: false, error: 'Invalid URL format' };
      }
      break;
      
    case 'disputeId':
      if (!isValidDisputeId(value)) {
        return { valid: false, error: 'Invalid dispute ID format' };
      }
      break;
      
    case 'merchantId':
      if (!isValidMerchantId(value)) {
        return { valid: false, error: 'Invalid merchant ID format' };
      }
      break;
      
    case 'array':
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Must be an array' };
      }
      if (rule.minLength && value.length < rule.minLength) {
        return { valid: false, error: `Array must have at least ${rule.minLength} items` };
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        return { valid: false, error: `Array must have at most ${rule.maxLength} items` };
      }
      break;
  }
  
  return { valid: true };
}

/**
 * Validate input data against a schema
 */
export function validateInput(data: any, schema: ValidationSchema): { 
  valid: boolean; 
  errors: { [key: string]: string }; 
  sanitized: any 
} {
  const errors: { [key: string]: string } = {};
  const sanitized: any = {};
  
  // Validate each field in the schema
  for (const [field, rule] of Object.entries(schema)) {
    const value = data[field];
    const result = validateValue(value, rule);
    
    if (!result.valid) {
      errors[field] = result.error!;
    } else if (value !== undefined && value !== null) {
      // Sanitize if requested and it's a string
      if (rule.sanitize && rule.type === 'string') {
        sanitized[field] = sanitizeString(value);
      } else {
        sanitized[field] = value;
      }
    }
  }
  
  // Check for unexpected fields (potential injection attempts)
  const schemaKeys = Object.keys(schema);
  const dataKeys = Object.keys(data);
  const unexpectedKeys = dataKeys.filter(key => !schemaKeys.includes(key));
  
  if (unexpectedKeys.length > 0) {
    console.warn('Unexpected fields in input:', unexpectedKeys);
    // Don't include unexpected fields in sanitized output
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized
  };
}

/**
 * Validation middleware for API handlers
 */
export async function validationMiddleware(
  event: any,
  schema: ValidationSchema
): Promise<any> {
  // Combine all input sources
  const input = {
    ...event.queryStringParameters,
    ...event.pathParameters,
    ...(event.body ? JSON.parse(event.body) : {})
  };
  
  // Validate input
  const validation = validateInput(input, schema);
  
  if (!validation.valid) {
    return createErrorResponse(400, 'Validation failed', {
      errors: validation.errors
    });
  }
  
  // Attach sanitized input to event for handler to use
  event.validatedInput = validation.sanitized;
  
  return null; // Continue to handler
}

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
  disputeId: {
    id: { type: 'disputeId' as const, required: true }
  },
  
  merchantId: {
    merchant: { type: 'merchantId' as const, required: false, sanitize: true }
  },
  
  pagination: {
    limit: { type: 'number' as const, min: 1, max: 100, required: false },
    cursor: { type: 'string' as const, required: false, sanitize: true }
  },
  
  disputeStatus: {
    status: {
      type: 'string' as const,
      enum: ['needs_response', 'warning_needs_response', 'warning_under_review', 'under_review', 'won', 'lost'],
      required: false
    }
  },
  
  authCredentials: {
    email: { type: 'email' as const, required: true, sanitize: true },
    password: { type: 'string' as const, required: true, minLength: 8, maxLength: 128 }
  },
  
  webhookEvent: {
    type: { type: 'string' as const, required: true, pattern: /^[a-z]+\.[a-z]+(\.[a-z]+)?$/ }
  }
};