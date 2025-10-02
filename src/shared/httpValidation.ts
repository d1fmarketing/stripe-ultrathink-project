import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { z, ZodSchema } from 'zod';
import { createErrorResponse } from './responses.js';

export interface ValidationOptions<
  Body = unknown,
  Query = Record<string, string | undefined>,
  Path = Record<string, string | undefined>,
  Response = unknown
> {
  bodySchema?: ZodSchema<Body>;
  querySchema?: ZodSchema<Query>;
  pathSchema?: ZodSchema<Path>;
  responseSchema?: ZodSchema<Response>;
  parseJsonBody?: boolean;
  ensureJsonResponse?: boolean;
}

type ValidatedEvent<Body, Query, Path> = APIGatewayProxyEvent & {
  validatedBody?: Body;
  validatedQuery?: Query;
  validatedPath?: Path;
};

const baseEventSchema = z.object({
  headers: z.record(z.string(), z.any()).optional().default({}),
  body: z.string().optional().nullable(),
  queryStringParameters: z.record(z.string(), z.string()).optional().nullable(),
  pathParameters: z.record(z.string(), z.string()).optional().nullable(),
  httpMethod: z.string().optional(),
  isBase64Encoded: z.boolean().optional().default(false)
}).passthrough();

const baseResponseSchema = z.object({
  statusCode: z.number(),
  headers: z.record(z.string(), z.any()).optional(),
  body: z.string().optional().default(''),
  isBase64Encoded: z.boolean().optional()
}).passthrough();

function decodeBody(event: APIGatewayProxyEvent): string | null {
  if (!event.body) {
    return null;
  }

  if (event.isBase64Encoded) {
    try {
      return Buffer.from(event.body, 'base64').toString('utf-8');
    } catch (error) {
      console.error('Failed to decode base64 body', error);
      throw new Error('INVALID_BASE64_BODY');
    }
  }

  return event.body;
}

export function withRequestResponseValidation<
  Body = unknown,
  Query = Record<string, string | undefined>,
  Path = Record<string, string | undefined>,
  Response = unknown
>(
  handler: (
    event: ValidatedEvent<Body, Query, Path>,
    context: Context
  ) => Promise<APIGatewayProxyResult>,
  options: ValidationOptions<Body, Query, Path, Response> = {}
) {
  return async (
    event: APIGatewayProxyEvent,
    context: Context
  ): Promise<APIGatewayProxyResult> => {
    const parsedEvent = baseEventSchema.safeParse(event);
    if (!parsedEvent.success) {
      console.warn('Request structure validation failed', parsedEvent.error.flatten());
      return createErrorResponse(400, 'Invalid request structure', {
        issues: parsedEvent.error.issues
      });
    }

    let workingEvent: ValidatedEvent<Body, Query, Path> = {
      ...(event as ValidatedEvent<Body, Query, Path>),
      ...parsedEvent.data
    };

    if (options.querySchema) {
      const queryParse = options.querySchema.safeParse(workingEvent.queryStringParameters || {});
      if (!queryParse.success) {
        console.warn('Query validation failed', queryParse.error.flatten());
        return createErrorResponse(400, 'Invalid query parameters', {
          issues: queryParse.error.issues
        });
      }
      workingEvent = { ...workingEvent, validatedQuery: queryParse.data };
    }

    if (options.pathSchema) {
      const pathParse = options.pathSchema.safeParse(workingEvent.pathParameters || {});
      if (!pathParse.success) {
        console.warn('Path validation failed', pathParse.error.flatten());
        return createErrorResponse(400, 'Invalid path parameters', {
          issues: pathParse.error.issues
        });
      }
      workingEvent = { ...workingEvent, validatedPath: pathParse.data };
    }

    const method = (workingEvent.httpMethod || '').toUpperCase();

    if (options.bodySchema && method !== 'OPTIONS') {
      let rawBody: string | null = null;
      try {
        rawBody = decodeBody(workingEvent);
      } catch (error) {
        if ((error as Error).message === 'INVALID_BASE64_BODY') {
          return createErrorResponse(400, 'Invalid request body encoding');
        }
        throw error;
      }

      if (rawBody === null) {
        return createErrorResponse(400, 'Request body is required');
      }

      let parsedBody: unknown = rawBody;
      const shouldParseJson = options.parseJsonBody ?? true;
      if (shouldParseJson) {
        try {
          parsedBody = rawBody.length ? JSON.parse(rawBody) : {};
        } catch (error) {
          console.warn('JSON body parsing failed', error);
          return createErrorResponse(400, 'Invalid JSON body');
        }
      }

      const bodyParse = options.bodySchema.safeParse(parsedBody);
      if (!bodyParse.success) {
        console.warn('Body validation failed', bodyParse.error.flatten());
        return createErrorResponse(400, 'Invalid request body', {
          issues: bodyParse.error.issues
        });
      }

      workingEvent = { ...workingEvent, validatedBody: bodyParse.data };
    }

    const response = await handler(workingEvent, context);

    const parsedResponse = baseResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      console.error('Response structure validation failed', parsedResponse.error.flatten());
      return createErrorResponse(500, 'Invalid response structure', {
        issues: parsedResponse.error.issues
      });
    }

    let finalResponse: APIGatewayProxyResult = {
      ...(response as APIGatewayProxyResult),
      ...parsedResponse.data
    };

    if (options.responseSchema && finalResponse.body) {
      const ensureJson = options.ensureJsonResponse ?? true;
      let parsedBody: unknown;

      if (!finalResponse.body.length) {
        parsedBody = {};
      } else if (ensureJson) {
        try {
          parsedBody = JSON.parse(finalResponse.body);
        } catch (error) {
          console.error('Response body JSON parsing failed', error);
          return createErrorResponse(500, 'Invalid JSON response body');
        }
      } else {
        parsedBody = finalResponse.body;
      }

      const bodyValidation = options.responseSchema.safeParse(parsedBody);
      if (!bodyValidation.success) {
        console.error('Response body validation failed', bodyValidation.error.flatten());
        return createErrorResponse(500, 'Response validation failed', {
          issues: bodyValidation.error.issues
        });
      }

      if (ensureJson) {
        finalResponse = {
          ...finalResponse,
          body: JSON.stringify(bodyValidation.data)
        };
      }
    }

    return finalResponse;
  };
}
