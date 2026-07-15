import { NextResponse } from 'next/server';

/**
 * Type signature for a middleware function compatible with the {@link AppPipeline}.
 *
 * A middleware function receives the current request and the accumulated context object, and
 * may return one of three things that the pipeline runner interprets differently:
 *
 * | Return value | Pipeline behaviour |
 * |---|---|
 * | `void` / `undefined` | Continue to the next middleware unchanged. |
 * | Plain `object` | Merged into `context` via `Object.assign` before the next middleware runs. |
 * | `Response` / `NextResponse` | Pipeline is **halted immediately** and the response is sent to the client. |
 *
 * Both synchronous and asynchronous middleware functions are supported.
 *
 * @template TContext - The shape of the accumulated context object at the point this middleware
 *   runs. Constrained to `Record<string, any>` so that `Object.assign` merges are type-safe.
 *
 * @param req - The incoming {@link Request} object provided by the Next.js App Router.
 * @param context - The context object accumulated by all previously executed middlewares.
 *
 * @returns One of:
 *   - `Promise<TContext | Response | void>` for async middleware, or
 *   - `TContext | Response | void` for synchronous middleware.
 */
type AppMiddlewareFn<TContext extends Record<string, any>> = (
    req: Request,
    context: TContext
) => Promise<TContext | Response | void> | TContext | Response | void;

/**
 * A type-safe, chainable middleware pipeline for Next.js App Router route handlers.
 *
 * `AppPipeline` implements a **chain-of-responsibility** pattern where each middleware can
 * inspect or enrich the shared request context, or terminate the pipeline early by returning
 * a `Response`. The final route handler is only invoked when **all** middlewares complete
 * successfully.
 *
 * ### How it works
 * 1. Call `.use(middleware)` one or more times to register middlewares in execution order.
 * 2. Call `.run(handler)` to close the chain and receive a standard App Router route handler
 *    `(req: Request) => Promise<Response>` that can be exported directly from a route file.
 * 3. At runtime, each middleware is awaited in sequence. If it returns a `Response` the chain
 *    is aborted and that response is sent to the client. If it returns a plain object that
 *    object is merged into `context`. If it throws, a **500 Internal Server Error** is
 *    returned automatically.
 *
 * ### Generic parameter
 * `TContext` accumulates the shape of the context as middlewares are composed.  Use it to
 * get fully-typed access to context properties inside the final handler.
 *
 * @template TContext - Shape of the shared context object passed between middlewares and the
 *   final handler. Must extend `Record<string, any>`.
 *
 * @example
 * // app/api/example/route.ts
 * interface MyContext {
 *   appName: string;
 * }
 *
 * export const POST = appPipeline<MyContext>()
 *   .use(checkContentType)   // returns void or Response
 *   .use(extractXAppName)    // returns { appName } or Response
 *   .run(async (req, context) => {
 *     // context.appName is guaranteed to be a string here
 *     const body = await req.json();
 *     return NextResponse.json({ success: true, appName: context.appName, body });
 *   });
 */
export class AppPipeline<TContext extends Record<string, any>> {
    /** Ordered list of registered middleware functions. */
    private middlewares: AppMiddlewareFn<TContext>[] = [];

    /**
     * Registers a middleware function and appends it to the execution chain.
     *
     * Middlewares are executed in the order they are registered. Each middleware
     * receives the same `req` object and the **same mutable `context`** that has
     * been progressively enriched by all previous middlewares.
     *
     * The method returns `this` (the same `AppPipeline` instance) to enable fluent
     * method chaining.
     *
     * @param fn - The {@link AppMiddlewareFn} to add to the pipeline.
     * @returns The current {@link AppPipeline} instance (for chaining).
     *
     * @example
     * pipeline
     *   .use(authMiddleware)
     *   .use(rateLimitMiddleware)
     *   .use(loggingMiddleware);
     */
    use(
        fn: AppMiddlewareFn<TContext>
    ): AppPipeline<TContext> {
        this.middlewares.push(fn);
        return this as any;
    }

    /**
     * Closes the middleware chain and returns a standard Next.js App Router route handler.
     *
     * The returned function has the signature `(req: Request) => Promise<Response>`, which
     * is the exact type expected by the App Router when exporting named HTTP-method handlers
     * (`GET`, `POST`, etc.) from a route file.
     *
     * **Execution order at runtime:**
     * 1. An empty context object `{}` is initialised and cast to `TContext`.
     * 2. Each registered middleware is awaited in order:
     *    - If a middleware returns a `Response` / `NextResponse`, the loop is **immediately
     *      aborted** and that response is returned to the caller.
     *    - If a middleware returns a plain object, it is merged into `context` via
     *      `Object.assign`.
     *    - If a middleware throws, a **500 Internal Server Error** JSON response is returned.
     * 3. Once all middlewares succeed, the `handler` is called with `(req, context)` and its
     *    return value is forwarded to the client.
     *
     * @param handler - The final route handler that receives the fully-enriched `context`.
     *   Must return a `Promise<Response>` or a synchronous `Response`.
     *
     * @returns A Next.js-compatible route handler: `(req: Request) => Promise<Response>`.
     *
     * @example
     * export const POST = appPipeline<MyContext>()
     *   .use(checkContentType)
     *   .use(extractXAppName)
     *   .run(async (req, context) => {
     *     const body = await req.json();
     *     return NextResponse.json({ appName: context.appName, body });
     *   });
     */
    run(
        handler: (
            req: Request,
            context: TContext
        ) => Promise<Response> | Response
    ) {
        // Restituiamo la firma standard dell'App Router: (request) => Promise<Response>
        return async (req: Request): Promise<Response> => {
            const context = {} as TContext;

            for (const middleware of this.middlewares) {
                try {
                    const result = await middleware(req, context);

                    // GESTIONE DEL BLOCCO FLUSSO:
                    // Se il middleware restituisce una Response, significa che c'è stato un errore.
                    // Interrompiamo immediatamente la catena e ritorniamo la risposta al client.
                    if (result instanceof Response) {
                        return result;
                    }

                    // ARRICCHIMENTO DEL FLUSSO:
                    // Se il middleware restituisce un oggetto valido, lo inseriamo nel contesto.
                    if (result && typeof result === 'object') {
                        Object.assign(context, result);
                    }
                } catch (error: any) {
                    return NextResponse.json(
                        { error: error.message || 'Internal Server Error nel Middleware' },
                        { status: 500 }
                    );
                }
            }

            // Eseguiamo l'handler finale passando il contesto arricchito
            return handler(req, context);
        };
    }
}

/**
 * Factory helper that instantiates a new {@link AppPipeline} with the given context type.
 *
 * Using this helper instead of `new AppPipeline<TContext>()` keeps route files concise and
 * reads naturally as a fluent chain:
 *
 * ```ts
 * export const POST = appPipeline<MyContext>()
 *   .use(someMiddleware)
 *   .run(myHandler);
 * ```
 *
 * @template TContext - The shape of the context object that will be built up by the registered
 *   middlewares and passed to the final handler. Must extend `Record<string, any>`.
 *
 * @returns A fresh, empty {@link AppPipeline} instance typed to `TContext`.
 */
export const appPipeline = <TContext extends Record<string, any>>() => new AppPipeline<TContext>();