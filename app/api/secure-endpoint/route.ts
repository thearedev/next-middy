import { checkContentType, extractXAppName, validateBody } from '@/app/utils/appMiddlewares';
import { appPipeline } from '@/app/utils/appPipeline';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Zod schema describing the expected JSON request body for this endpoint.
 *
 * Validated by {@link validateBody} before the final handler runs.
 */
const RequestBodySchema = z.object({
    /** Display name of the resource being created. */
    name: z.string().min(1, 'name is required'),
    /** Contact email address — must be a valid email format. */
    email: z.string().email('must be a valid email address'),
});

/**
 * Shape of the typed context object built up by the middleware pipeline for this route.
 *
 * Each property is contributed by one of the middlewares registered via `.use()`:
 *
 * | Property | Source middleware |
 * |---|---|
 * | `appName` | {@link extractXAppName} – extracted from the `x-app-name` request header |
 * | `body` | {@link validateBody} – parsed and validated JSON request body |
 */
interface MyContext extends Record<string, unknown> {
    /** The validated value of the `x-app-name` request header. */
    appName: string;
    /** The validated and type-narrowed request body. */
    body: z.infer<typeof RequestBodySchema>;
}

/**
 * Next.js App Router **POST** route handler for `/api/secure-endpoint`.
 *
 * This handler is assembled through an {@link AppPipeline} that enforces a two-step validation
 * chain before allowing any business logic to execute:
 *
 * ### Pipeline stages
 *
 * 1. **`checkContentType`** – Verifies that the request carries a
 *    `Content-Type: application/json` header. If not, the pipeline is halted with
 *    `HTTP 415 Unsupported Media Type`.
 *
 * 2. **`extractXAppName`** – Reads the custom `x-app-name` header, validates its presence, and
 *    injects it into the typed context as `context.appName`. If the header is absent, the
 *    pipeline is halted with `HTTP 400 Bad Request`.
 *
 * 3. **Final handler** – Runs only when both middlewares succeed. It reads the JSON request
 *    body and returns a success payload that echoes back the `appName` and the received body.
 *
 * ### Required request headers
 *
 * | Header | Required | Description |
 * |---|---|---|
 * | `Content-Type` | ✅ | Must be `application/json` |
 * | `x-app-name` | ✅ | Identifies the calling application |
 *
 * ### Response shape
 *
 * **Success – HTTP 200**
 * ```json
 * {
 *   "success": true,
 *   "message": "[App Router] Request validated for: <appName>",
 *   "payloadReceived": { ...requestBody }
 * }
 * ```
 *
 * **Validation error – HTTP 415** (missing / wrong Content-Type)
 * ```json
 * { "error": "Unsupported Media Type. Expected: application/json" }
 * ```
 *
 * **Validation error – HTTP 400** (missing `x-app-name` header)
 * ```json
 * { "error": "Missing required header: x-app-name" }
 * ```
 *
 * **Unexpected error – HTTP 500**
 * ```json
 * { "error": "<error message>" }
 * ```
 *
 * @example
 * // Example curl request:
 * // curl -X POST http://localhost:3000/api/secure-endpoint \
 * //   -H "Content-Type: application/json" \
 * //   -H "x-app-name: my-service" \
 * //   -d '{"hello":"world"}'
 */
export const POST = appPipeline<MyContext>()
    .use(checkContentType)               // 1. Verify the content-type header
    .use(extractXAppName)                // 2. Extract and validate the x-app-name header
    .use(validateBody(RequestBodySchema)) // 3. Parse and validate the request body
    .run(async (_req, context) => {

        // context.appName and context.body are both present and fully typed.
        const { appName, body } = context;

        return NextResponse.json({
            success: true,
            message: `[App Router] Request validated for: ${appName}`,
            payloadReceived: body,
        });
    });