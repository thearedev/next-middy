import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Middleware that enforces the `Content-Type: application/json` header on Pages Router API requests.
 *
 * Checks the incoming `Content-Type` header from `req.headers['content-type']`.
 * - If missing or does not contain `application/json`, writes an HTTP **415 Unsupported Media Type** JSON response
 *   and sets `res.writableEnded` to `true`. This causes the {@link PagesPipeline} runner to **immediately halt** execution
 *   and abort subsequent middlewares and the final handler.
 * - If valid, returns `void` allowing the pipeline to proceed to the next step.
 *
 * @param req - The incoming {@link NextApiRequest} object provided by Next.js Pages Router.
 * @param res - The outgoing {@link NextApiResponse} object used to send error responses early.
 *
 * @returns `void` when content-type is valid (pipeline continues normally).
 *
 * @example
 * export default pagesPipeline<MyContext>()
 *   .use(checkContentType)
 *   .run(handler);
 *
 * // A request without application/json header receives:
 * // HTTP 415 – { "error": "Unsupported Media Type. Required: application/json" }
 */
export const checkContentType = (req: NextApiRequest, res: NextApiResponse) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
        res.status(415).json({ error: 'Unsupported Media Type. Required: application/json' });
        return
    }
};

/**
 * Middleware that extracts and validates the custom `x-app-name` header on Pages Router API requests.
 *
 * Reads the `x-app-name` header from `req.headers['x-app-name']`.
 * - If missing or an array (duplicate headers), writes an HTTP **400 Bad Request** JSON response, ending the response stream.
 * - If present as a single string, returns `{ appName: string }`, which the {@link PagesPipeline} runner
 *   merges into the shared `context` object passed down to subsequent middlewares and the final handler.
 *
 * @param req - The incoming {@link NextApiRequest} object provided by Next.js Pages Router.
 * @param res - The outgoing {@link NextApiResponse} object used to send error responses early.
 *
 * @returns An object `{ appName: string }` merged into the pipeline context when valid, or `void` after writing HTTP 400.
 *
 * @example
 * export default pagesPipeline<MyContext>()
 *   .use(checkContentType)
 *   .use(extractXAppName) // context.appName is now available after this step
 *   .run(async (req, res, context) => {
 *     res.json({ appName: context.appName });
 *   });
 *
 * // A request without the x-app-name header receives:
 * // HTTP 400 – { "error": "Missing or invalid required header: x-app-name" }
 */
export const extractXAppName = (req: NextApiRequest, res: NextApiResponse) => {
    const appName = req.headers['x-app-name'];

    if (!appName || Array.isArray(appName)) {
        res.status(400).json({ error: 'Missing or invalid required header: x-app-name' });
        return
    }

    // Restituiamo il dato validato a runtime.
    return { appName };
};

