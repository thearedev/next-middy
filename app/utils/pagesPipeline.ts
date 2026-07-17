import { NextApiRequest, NextApiResponse } from 'next';

/**
 * The partial context contribution returned by a single middleware.
 *
 * A middleware that enriches the context returns an object whose keys are a
 * *subset* of the accumulated context — not the whole thing.  This generic
 * captures that "partial slice" concept separately from the full accumulated
 * `TContext` that the middleware *receives*.
 */
type ContextSlice = Record<string, unknown>;

/**
 * Type signature for a middleware function compatible with the {@link PagesPipeline}.
 *
 * A middleware function receives the current request, response, and accumulated context
 * object, and may return one of three things that the pipeline runner interprets differently:
 *
 * | Return value | Pipeline behaviour |
 * |---|---|
 * | `void` / `undefined` | Continue to the next middleware unchanged. |
 * | Plain `object` | Merged into `context` via `Object.assign` before the next middleware runs. |
 * | Any value after `res.end()` / `res.json()` etc. | Pipeline is **halted immediately** because `res.writableEnded` becomes `true`. |
 *
 * Both synchronous and asynchronous middleware functions are supported.
 *
 * @template TContext - The shape of the accumulated context object at the point this middleware
 *   runs. Constrained to {@link ContextSlice} so that `Object.assign` merges are type-safe.
 * @template TNext - The shape of the *new* properties this middleware contributes to the context
 *   when it succeeds. Defaults to `ContextSlice` (i.e. any plain object). The pipeline will
 *   widen `TContext` to `TContext & TNext` before passing it to the next middleware.
 *
 * @param req - The incoming {@link NextApiRequest} object provided by the Next.js Pages Router.
 * @param res - The outgoing {@link NextApiResponse} object. Middleware may call `res.json()` /
 *   `res.end()` etc. to terminate the request early; the pipeline detects this via
 *   `res.writableEnded`.
 * @param context - The context object accumulated by all previously executed middlewares.
 *
 * @returns One of:
 *   - `Promise<TNext | void>` for async middleware, or
 *   - `TNext | void` for synchronous middleware.
 */
type PagesMiddlewareFn<TContext extends ContextSlice, TNext extends ContextSlice = ContextSlice> = (
    req: NextApiRequest,
    res: NextApiResponse,
    context: TContext
) => Promise<TNext | void> | TNext | void;

/**
 * A type-safe, chainable middleware pipeline for Next.js Pages Router API handlers.
 *
 * `PagesPipeline` implements a **chain-of-responsibility** pattern where each middleware can
 * inspect or enrich the shared request context, or terminate the pipeline early by writing
 * directly to `res`. The final route handler is only invoked when **all** middlewares complete
 * successfully and no middleware has ended the response.
 *
 * ### How it works
 * 1. Call `.use(middleware)` one or more times to register middlewares in execution order.
 * 2. Call `.run(handler)` to close the chain and receive a standard Pages Router API handler
 *    `(req, res) => Promise<void>` that can be exported directly from an API route file.
 * 3. At runtime, each middleware is awaited in sequence. If it writes to `res` (causing
 *    `res.writableEnded` to become `true`), the chain is **immediately aborted**. If it returns
 *    a plain object, that object is merged into `context`. If it throws, a **500 Internal
 *    Server Error** is returned automatically.
 *
 * ### Generic parameter
 * `TContext` accumulates the shape of the context as middlewares are composed — each call to
 * `.use()` widens the type to `TContext & TNext`.  Use it to get fully-typed access to context
 * properties inside the final handler without extra type assertions.
 *
 * @template TContext - Shape of the shared context object passed between middlewares and the
 *   final handler. Must extend {@link ContextSlice}.
 *
 * @example
 * // pages/api/example.ts
 * interface MyContext {
 *   userId: string;
 * }
 *
 * export default pagesPipeline<MyContext>()
 *   .use(checkSession)       // writes res.status(401) if not authenticated
 *   .use(extractUserId)      // returns { userId } or writes res.status(400)
 *   .run(async (req, res, context) => {
 *     // context.userId is guaranteed to be a string here
 *     res.json({ userId: context.userId });
 *   });
 */
export class PagesPipeline<TContext extends ContextSlice = ContextSlice> {
    /** Ordered list of registered middleware functions. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private middlewares: PagesMiddlewareFn<any, any>[] = [];

    /**
     * Registers a middleware function and appends it to the execution chain.
     *
     * Each call to `.use()` **widens the accumulated context type** by intersecting `TContext`
     * with the `TNext` type contributed by the new middleware.  This means the *next* `.use()`
     * call and the final `.run()` handler both see all properties added by previous middlewares
     * without requiring extra type assertions.
     *
     * Middlewares are executed in the order they are registered. Each middleware
     * receives the same `req`/`res` objects and the **same mutable `context`** that has
     * been progressively enriched by all previous middlewares.
     *
     * The method returns a new `PagesPipeline<TContext & TNext>` instance to enable fluent
     * method chaining with accumulated types.
     *
     * @template TNext - The shape of the new context properties contributed by `fn`.
     * @param fn - The {@link PagesMiddlewareFn} to add to the pipeline.
     * @returns A new {@link PagesPipeline} instance typed to `TContext & TNext` (for chaining).
     *
     * @example
     * pipeline
     *   .use(sessionMiddleware)    // contributes { userId: string }
     *   .use(rateLimitMiddleware)  // can now read context.userId
     *   .use(loggingMiddleware);
     */
    use<TNext extends ContextSlice>(
        fn: PagesMiddlewareFn<TContext, TNext>
    ): PagesPipeline<TContext & TNext> {
        this.middlewares.push(fn);
        return this as unknown as PagesPipeline<TContext & TNext>;
    }

    /**
     * Closes the middleware chain and returns a standard Next.js Pages Router API handler.
     *
     * The returned function has the signature `(req: NextApiRequest, res: NextApiResponse) => Promise<void>`,
     * which is the exact type expected by the Pages Router when exporting the default handler
     * from an API route file.
     *
     * **Execution order at runtime:**
     * 1. An empty context object `{}` is initialised and cast to `TContext`.
     * 2. Each registered middleware is awaited in order:
     *    - If a middleware writes to `res` (i.e. `res.writableEnded` becomes `true`), the loop
     *      is **immediately aborted** and the function returns without calling the final handler.
     *    - If a middleware returns a plain object, it is merged into `context` via
     *      `Object.assign`.
     *    - If a middleware throws, a **500 Internal Server Error** JSON response is sent and
     *      the function returns early.
     * 3. Once all middlewares succeed, the `handler` is called with `(req, res, context)` and
     *    is responsible for writing the final response.
     *
     * @param handler - The final API handler that receives the fully-enriched `context`.
     *   Must write a response via `res` and return `Promise<void>` or `void`.
     *
     * @returns A Next.js-compatible Pages Router handler:
     *   `(req: NextApiRequest, res: NextApiResponse) => Promise<void>`.
     *
     * @example
     * export default pagesPipeline<MyContext>()
     *   .use(checkSession)
     *   .use(extractUserId)
     *   .run(async (req, res, context) => {
     *     res.json({ userId: context.userId });
     *   });
     */
    run(
        handler: (
            req: NextApiRequest,
            res: NextApiResponse,
            context: TContext
        ) => Promise<void> | void
    ): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
        return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
            const context = {} as TContext;

            for (const middleware of this.middlewares) {
                try {
                    const result = await middleware(req, res, context);

                    // FLOW HALT:
                    // If the middleware has already sent a response (e.g. res.status(401).json(...))
                    // the stream is closed; abort the pipeline immediately.
                    if (res.writableEnded) {
                        return;
                    }

                    // CONTEXT ENRICHMENT:
                    // If the middleware returns a plain object, merge it into the context
                    // so that subsequent middlewares and the final handler can read it.
                    if (result !== null && typeof result === 'object') {
                        Object.assign(context, result);
                    }
                } catch (error: unknown) {
                    const message =
                        error instanceof Error ? error.message : 'Internal Server Error';
                    if (!res.writableEnded) {
                        res.status(500).json({ error: message });
                    }
                    return;
                }
            }

            // Execute the final handler with the fully-enriched context.
            return handler(req, res, context);
        };
    }
}

/**
 * Factory helper that instantiates a new {@link PagesPipeline} with the given context type.
 *
 * Using this helper instead of `new PagesPipeline<TContext>()` keeps API route files concise
 * and reads naturally as a fluent chain:
 *
 * ```ts
 * export default pagesPipeline<MyContext>()
 *   .use(someMiddleware)
 *   .run(myHandler);
 * ```
 *
 * @template TContext - The shape of the context object that will be built up by the registered
 *   middlewares and passed to the final handler. Must extend {@link ContextSlice}.
 *
 * @returns A fresh, empty {@link PagesPipeline} instance typed to `TContext`.
 */
export const pagesPipeline = <TContext extends ContextSlice = ContextSlice>() =>
    new PagesPipeline<TContext>();
