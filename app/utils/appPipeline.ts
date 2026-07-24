import { NextResponse } from 'next/server';

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
 * Type signature for the route segment context provided by the Next.js App Router for dynamic routes (e.g. `[id]`).
 *
 * In Next.js 15+, `params` is passed as a `Promise` that resolves to the route parameters object,
 * whereas in Next.js 13/14 `params` is a plain object. This type accommodates both.
 */
export type RouteSegmentContext = {
    /**
     * Route parameters for the current request, which may be a Promise (Next.js 15+) or a plain object (Next.js 13/14).
     */
    params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
};

/**
 * Type signature for a middleware function compatible with the {@link AppPipeline}.
 *
 * A middleware function receives the incoming Web standard `Request` object and the accumulated
 * context object, and may return one of three things that the pipeline runner interprets differently:
 *
 * | Return value | Pipeline behaviour |
 * |---|---|
 * | `void` / `undefined` | Continue to the next middleware unchanged. |
 * | Plain `object` | Merged into `context` via `Object.assign` before the next middleware runs. |
 * | {@link Response} | Pipeline is **halted immediately** and this response is returned directly (e.g. HTTP 401, 403, 302). |
 *
 * Both synchronous and asynchronous middleware functions are supported.
 *
 * @template TContext - The shape of the accumulated context object at the point this middleware
 *   runs. Constrained to {@link ContextSlice} so that `Object.assign` merges are type-safe.
 * @template TNext - The shape of the *new* properties this middleware contributes to the context
 *   when it succeeds. Defaults to `ContextSlice` (i.e. any plain object). The pipeline will
 *   widen `TContext` to `TContext & TNext` before passing it to the next middleware.
 *
 * @param req - The incoming Web API {@link Request} object provided by the Next.js App Router.
 * @param context - The context object accumulated by all previously executed middlewares (including resolved route parameters).
 *
 * @returns One of:
 *   - `Promise<TNext | Response | void>` for async middleware, or
 *   - `TNext | Response | void` for synchronous middleware.
 */
type AppMiddlewareFn<TContext extends ContextSlice, TNext extends ContextSlice = ContextSlice> = (
    req: Request,
    context: TContext
) => Promise<TNext | Response | void> | TNext | Response | void;

/**
 * Helper function to determine whether an error is a Next.js native control-flow exception
 * (e.g., produced by `redirect()` or `notFound()`).
 *
 * Next.js relies on special thrown objects containing a `digest` property starting with
 * `'NEXT_REDIRECT'` or `'NEXT_NOT_FOUND'` to control navigation. These errors must be rethrown
 * so that Next.js can handle the redirect or 404 response properly rather than converting
 * them into generic HTTP 500 responses.
 *
 * @param error - The caught error or thrown value to evaluate.
 * @returns `true` if `error` is a Next.js redirect or notFound internal exception; otherwise `false`.
 */
function isNextInternalError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null && 'digest' in error) {
        const digest = (error as { digest?: string }).digest;
        return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'));
    }
    return false;
}

/**
 * A type-safe, chainable middleware pipeline for Next.js App Router Route Handlers.
 *
 * `AppPipeline` implements a **chain-of-responsibility** pattern where each middleware can
 * inspect or enrich the shared request context, or terminate the pipeline early by returning
 * a Web standard {@link Response} directly. The final route handler is only invoked when **all**
 * middlewares complete successfully and no middleware has returned a response.
 *
 * ### How it works
 * 1. Call `.use(middleware)` one or more times to register middlewares in execution order.
 * 2. Call `.run(handler)` to close the chain and receive a standard App Router Route Handler
 *    `(req, routeSegmentContext) => Promise<Response>` that can be exported directly from a route file.
 * 3. At runtime, dynamic route `params` are resolved (supporting both sync and async `params` in Next.js 15+)
 *    and injected into `context.params`.
 * 4. Each middleware is awaited in sequence. If a middleware returns a {@link Response}, the chain is
 *    **immediately aborted** and that response is returned. If it returns a plain object, that object is
 *    merged into `context`. If it throws a Next.js internal exception (`redirect()` / `notFound()`), it is
 *    rethrown; for all other uncaught errors, a **500 Internal Server Error** JSON response is returned automatically.
 *
 * ### Generic parameter
 * `TContext` accumulates the shape of the context as middlewares are composed — each call to
 * `.use()` widens the type to `TContext & TNext`. Use it to get fully-typed access to context
 * properties inside the final handler without extra type assertions.
 *
 * @template TContext - Shape of the shared context object passed between middlewares and the
 *   final handler. Must extend {@link ContextSlice}.
 *
 * @example
 * // app/api/example/route.ts
 * interface MyContext {
 *   userId: string;
 * }
 *
 * export const GET = appPipeline<MyContext>()
 *   .use(checkSession)       // returns NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) if invalid
 *   .use(extractUserId)      // returns { userId: string }
 *   .run(async (req, context) => {
 *     // context.userId is guaranteed to be a string here
 *     return NextResponse.json({ userId: context.userId });
 *   });
 */
export class AppPipeline<TContext extends ContextSlice = ContextSlice> {
    /** Ordered list of registered middleware functions. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private middlewares: AppMiddlewareFn<any, any>[] = [];

    /**
     * Registers a middleware function and appends it to the execution chain.
     *
     * Each call to `.use()` **widens the accumulated context type** by intersecting `TContext`
     * with the `TNext` type contributed by the new middleware. This means the *next* `.use()`
     * call and the final `.run()` handler both see all properties added by previous middlewares
     * without requiring extra type assertions.
     *
     * Middlewares are executed in the order they are registered. Each middleware
     * receives the same `req` object and the **same mutable `context`** that has
     * been progressively enriched by all previous middlewares.
     *
     * The method returns a new `AppPipeline<TContext & TNext>` instance to enable fluent
     * method chaining with accumulated types.
     *
     * @template TNext - The shape of the new context properties contributed by `fn`.
     * @param fn - The {@link AppMiddlewareFn} to add to the pipeline.
     * @returns A new {@link AppPipeline} instance typed to `TContext & TNext` (for chaining).
     *
     * @example
     * pipeline
     *   .use(sessionMiddleware)    // contributes { userId: string }
     *   .use(rateLimitMiddleware)  // can now read context.userId
     *   .use(loggingMiddleware);
     */
    use<TNext extends ContextSlice>(
        fn: AppMiddlewareFn<TContext, TNext>
    ): AppPipeline<TContext & TNext> {
        this.middlewares.push(fn);
        return this as unknown as AppPipeline<TContext & TNext>;
    }

    /**
     * Closes the middleware chain and returns a standard Next.js App Router Route Handler.
     *
     * The returned function has the signature `(req: Request, routeSegmentContext?: RouteSegmentContext) => Promise<Response>`,
     * which is the exact signature expected by the App Router when exporting HTTP method handlers
     * (`GET`, `POST`, `PUT`, `DELETE`, etc.) from a `route.ts` file.
     *
     * **Execution order at runtime:**
     * 1. An empty context object `{}` is initialised and cast to `TContext`.
     * 2. If `routeSegmentContext.params` is provided, it is resolved (handling both promises and plain objects)
     *    and assigned into `context.params`.
     * 3. Each registered middleware is awaited in order:
     *    - If a middleware returns a {@link Response} (e.g. via `NextResponse.json(...)`), the chain
     *      is **immediately aborted** and that response is returned directly.
     *    - If a middleware returns a plain object, it is merged into `context` via `Object.assign`.
     *    - If a middleware throws a Next.js internal exception (`redirect()` or `notFound()`), it is rethrown.
     *    - For any other uncaught error in a middleware, a **500 Internal Server Error** JSON response is returned early.
     * 4. Once all middlewares complete successfully, `handler` is called with `(req, context)` to generate the final response.
     * 5. If `handler` throws a Next.js internal exception, it is rethrown; otherwise, uncaught errors result in a **500 Internal Server Error** JSON response.
     *
     * @param handler - The final Route Handler function that receives the request and fully-enriched `context`.
     *   Must return a {@link Response} or `Promise<Response>`.
     *
     * @returns A Next.js-compatible App Router Route Handler:
     *   `(req: Request, routeSegmentContext?: RouteSegmentContext) => Promise<Response>`.
     *
     * @example
     * export const GET = appPipeline<MyContext>()
     *   .use(checkSession)
     *   .use(extractUserId)
     *   .run(async (req, context) => {
     *     return NextResponse.json({ userId: context.userId });
     *   });
     */
    run(
        handler: (
            req: Request,
            context: TContext
        ) => Promise<Response> | Response
    ): (req: Request, routeSegmentContext?: RouteSegmentContext) => Promise<Response> {
        return async (req: Request, routeSegmentContext?: RouteSegmentContext): Promise<Response> => {
            // Inizializziamo il contesto e inseriamo i params della rotta se presenti
            const context = {} as TContext;

            if (routeSegmentContext?.params) {
                // Risolviamo i params sia che siano una Promise (Next.js 15+) sia che siano un oggetto (Next.js 13/14)
                const resolvedParams = await Promise.resolve(routeSegmentContext.params);
                Object.assign(context, { params: resolvedParams });
            }

            // 1. Esecuzione Middleware
            for (const middleware of this.middlewares) {
                try {
                    const result = await middleware(req, context);

                    // FLOW HALT: Il middleware ha restituito una Response (es. 401, 403, 302)
                    if (result instanceof Response) {
                        return result;
                    }

                    // CONTEXT ENRICHMENT: Arricchimento del contesto
                    if (result !== null && typeof result === 'object') {
                        Object.assign(context, result);
                    }
                } catch (error: unknown) {
                    // EDGE CASE 2: Lasciamo passare i redirect() and notFound() di Next.js
                    if (isNextInternalError(error)) {
                        throw error;
                    }

                    const message =
                        error instanceof Error ? error.message : 'Internal Server Error';
                    return NextResponse.json({ error: message }, { status: 500 });
                }
            }

            // 2. Esecuzione Handler Finale
            try {
                return await handler(req, context);
            } catch (error: unknown) {
                // EDGE CASE 2: Lasciamo passare i redirect() e notFound() di Next.js
                if (isNextInternalError(error)) {
                    throw error;
                }

                const message =
                    error instanceof Error ? error.message : 'Internal Server Error';
                return NextResponse.json({ error: message }, { status: 500 });
            }
        };
    }
}

/**
 * Factory helper that instantiates a new {@link AppPipeline} with the given context type.
 *
 * Using this helper instead of `new AppPipeline<TContext>()` keeps Route Handler files concise
 * and reads naturally as a fluent chain:
 *
 * ```ts
 * export const GET = appPipeline<MyContext>()
 *   .use(someMiddleware)
 *   .run(myHandler);
 * ```
 *
 * @template TContext - The shape of the context object that will be built up by the registered
 *   middlewares and passed to the final handler. Must extend {@link ContextSlice}.
 *
 * @returns A fresh, empty {@link AppPipeline} instance typed to `TContext`.
 */
export const appPipeline = <TContext extends ContextSlice = Record<string, never>>() =>
    new AppPipeline<TContext>();