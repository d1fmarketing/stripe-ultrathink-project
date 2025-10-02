import { createErrorResponse } from './responses.js';
import { z, AnyZodObject, ZodError } from 'zod';

const DISPUTE_ID_REGEX = /^(dp_|du_)[a-zA-Z0-9]{24,}$/;
const MERCHANT_ID_REGEX = /^acct_[a-zA-Z0-9]{16,}$/;

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

const sanitizeIfString = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  return value;
};

const optionalString = (fieldName: string, options?: { maxLength?: number }) =>
  z.preprocess(
    value => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (typeof value === 'string') {
        const sanitized = sanitizeString(value);
        return sanitized === '' ? undefined : sanitized;
      }

      return value;
    },
    (() => {
      let schema = z
        .string({ invalid_type_error: `${fieldName} must be a string` })
        .trim();

      if (options?.maxLength) {
        schema = schema.max(options.maxLength, {
          message: `${fieldName} must be at most ${options.maxLength} characters`
        });
      }

      return schema.optional();
    })()
  );

const optionalInteger = (
  fieldName: string,
  { min, max }: { min?: number; max?: number }
) =>
  z.preprocess(
    value => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      if (typeof value === 'number') {
        return value;
      }

      if (typeof value === 'string') {
        const sanitized = sanitizeString(value);
        if (sanitized === '') {
          return undefined;
        }

        const num = Number(sanitized);
        return Number.isNaN(num) ? sanitized : num;
      }

      return value;
    },
    (() => {
      let schema = z.number({ invalid_type_error: `${fieldName} must be a number` });

      if (min !== undefined) {
        schema = schema.min(min, {
          message: `${fieldName} must be at least ${min}`
        });
      }

      if (max !== undefined) {
        schema = schema.max(max, {
          message: `${fieldName} must be at most ${max}`
        });
      }

      return schema
        .refine(value => Number.isFinite(value), {
          message: `${fieldName} must be a finite number`
        })
        .refine(value => Number.isInteger(value), {
          message: `${fieldName} must be an integer`
        })
        .optional();
    })()
  );

const optionalBoolean = (fieldName: string) =>
  z.preprocess(
    value => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }

      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const sanitized = sanitizeString(value).toLowerCase();
        if (sanitized === 'true') return true;
        if (sanitized === 'false') return false;
      }

      return value;
    },
    z.boolean({ invalid_type_error: `${fieldName} must be a boolean` }).optional()
  );

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
  disputeId: z
    .object({
      id: z.preprocess(
        sanitizeIfString,
        z
          .string({
            required_error: 'Dispute ID is required',
            invalid_type_error: 'Dispute ID must be a string'
          })
          .trim()
          .min(1, { message: 'Dispute ID is required' })
          .regex(DISPUTE_ID_REGEX, { message: 'Invalid dispute ID format' })
      )
    })
    .strict(),

  merchantId: z
    .object({
      merchant: z
        .preprocess(
          value => {
            if (value === undefined || value === null) {
              return undefined;
            }

            if (typeof value === 'string') {
              const sanitized = sanitizeString(value);
              return sanitized === '' ? undefined : sanitized;
            }

            return value;
          },
          z
            .string({ invalid_type_error: 'Merchant ID must be a string' })
            .trim()
            .regex(MERCHANT_ID_REGEX, {
              message: 'Invalid merchant ID format'
            })
            .optional()
        )
    })
    .strict(),

  pagination: z
    .object({
      limit: optionalInteger('limit', { min: 1, max: 100 }),
      offset: optionalInteger('offset', { min: 0 })
    })
    .strict(),

  disputeStatus: z
    .object({
      status: z
        .preprocess(
          value => {
            if (value === undefined || value === null || value === '') {
              return undefined;
            }

            if (typeof value === 'string') {
              const sanitized = sanitizeString(value);
              return sanitized === '' ? undefined : sanitized;
            }

            return value;
          },
          z
            .string({ invalid_type_error: 'Dispute status must be a string' })
            .refine(
              value =>
                [
                  'needs_response',
                  'warning_needs_response',
                  'warning_under_review',
                  'under_review',
                  'won',
                  'lost'
                ].includes(value),
              {
                message:
                  "Dispute status must be one of: needs_response, warning_needs_response, warning_under_review, under_review, won, lost"
              }
            )
            .optional()
        )
    })
    .strict(),

  authCredentials: z
    .object({
      email: z.preprocess(
        sanitizeIfString,
        z
          .string({
            required_error: 'Email is required',
            invalid_type_error: 'Email must be a string'
          })
          .trim()
          .email({ message: 'Invalid email format' })
      ),
      password: z.preprocess(
        sanitizeIfString,
        z
          .string({
            required_error: 'Password is required',
            invalid_type_error: 'Password must be a string'
          })
          .min(8, { message: 'Password must be at least 8 characters' })
          .max(128, { message: 'Password must be at most 128 characters' })
      )
    })
    .strict(),

  webhookEvent: z
    .object({
      type: z.preprocess(
        sanitizeIfString,
        z
          .string({
            required_error: 'Event type is required',
            invalid_type_error: 'Event type must be a string'
          })
          .trim()
          .regex(/^[a-z]+\.[a-z]+(\.[a-z]+)?$/, {
            message: 'Invalid webhook event type format'
          })
      )
    })
    .strict(),

  forceFlag: z
    .object({
      force: optionalBoolean('force')
    })
    .strict(),

  retryMetadata: z
    .object({
      reason: optionalString('Reason', { maxLength: 500 })
    })
    .strict()
};

const decodeBody = (event: any): any => {
  if (!event.body) {
    return {};
  }

  let bodyContent = event.body;

  if (event.isBase64Encoded && typeof bodyContent === 'string') {
    try {
      bodyContent = Buffer.from(bodyContent, 'base64').toString('utf-8');
    } catch (error) {
      return {
        __parseError: 'Invalid base64-encoded body'
      };
    }
  }

  if (typeof bodyContent === 'string') {
    if (bodyContent.trim() === '') {
      return {};
    }

    try {
      return JSON.parse(bodyContent);
    } catch (error) {
      return {
        __parseError: 'Body must be valid JSON'
      };
    }
  }

  if (typeof bodyContent === 'object') {
    return bodyContent;
  }

  return {
    __parseError: 'Unsupported body format'
  };
};

const formatZodErrors = (error: ZodError) => {
  const flattened = error.flatten();
  const errors: Record<string, string> = {};

  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[field] = messages[0];
    }
  }

  if (flattened.formErrors.length > 0) {
    errors._form = flattened.formErrors.join(' ');
  }

  return errors;
};

/**
 * Validation middleware for API handlers using Zod schemas
 */
export async function validationMiddleware(
  event: any,
  schema: AnyZodObject
): Promise<any> {
  const bodyData = decodeBody(event);

  if (bodyData.__parseError) {
    return createErrorResponse(400, 'Validation failed', {
      errors: { body: bodyData.__parseError }
    });
  }

  const input = {
    ...(event.queryStringParameters || {}),
    ...(event.pathParameters || {}),
    ...bodyData
  };

  const result = schema.strict().safeParse(input);

  if (!result.success) {
    return createErrorResponse(400, 'Validation failed', {
      errors: formatZodErrors(result.error)
    });
  }

  event.validatedInput = result.data;
  return null;
}
