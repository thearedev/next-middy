import { NextResponse } from 'next/server';

/**
 * Middleware that enforces the `Content-Type: application/json` header on incoming requests.
 *
 * This middleware acts as a guard at the entry of the pipeline. It reads the `Content-Type`
 * header and short-circuits the pipeline with an HTTP **415 Unsupported Media Type** response
 * if the header is absent or does not contain `application/json`.
 *
 * @param req - The incoming {@link Request} object provided by the Next.js App Router.
 *
 * @returns `void` when the content-type is valid (pipeline continues normally), or a
 *   {@link NextResponse} with status **415** when the content-type is missing or unsupported
 *   (pipeline is immediately halted and the error is returned to the client).
 *
 * @example
 * // Used inside an AppPipeline chain:
 * export const POST = appPipeline<MyContext>()
 *   .use(checkContentType)
 *   .run(handler);
 *
 * // A request without the correct header will receive:
 * // HTTP 415 – { "error": "Unsupported Media Type. Expected: application/json" }
 */
export const checkContentType = (req: Request) => {
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        return NextResponse.json(
            { error: 'Unsupported Media Type. Expected: application/json' },
            { status: 415 }
        );
    }
};

/**
 * Middleware that extracts and validates the custom `x-app-name` request header.
 *
 * This middleware reads the `x-app-name` header that callers are required to send with every
 * request. If the header is present and non-empty the validated value is returned as a plain
 * object (`{ appName: string }`), which the {@link AppPipeline} runner will **merge into the
 * shared request context**, making `context.appName` available to every subsequent middleware
 * and to the final route handler.
 *
 * If the header is missing the pipeline is short-circuited with an HTTP **400 Bad Request**
 * response.
 *
 * @param req - The incoming {@link Request} object provided by the Next.js App Router.
 *
 * @returns An object `{ appName: string }` that is merged into the pipeline context when the
 *   header is valid, or a {@link NextResponse} with status **400** when the header is absent
 *   (pipeline is immediately halted and the error is returned to the client).
 *
 * @example
 * // Used inside an AppPipeline chain:
 * export const POST = appPipeline<MyContext>()
 *   .use(checkContentType)
 *   .use(extractXAppName) // context.appName is now available after this step
 *   .run(async (req, context) => {
 *     console.log(context.appName); // e.g. "my-service"
 *   });
 *
 * // A request without the header will receive:
 * // HTTP 400 – { "error": "Missing required header: x-app-name" }
 */
export const extractXAppName = (req: Request) => {
    const appName = req.headers.get('x-app-name');

    if (!appName) {
        return NextResponse.json(
            { error: 'Missing required header: x-app-name' },
            { status: 400 }
        );
    }

    // Return the validated value to be merged into the pipeline context.
    return { appName };
};
