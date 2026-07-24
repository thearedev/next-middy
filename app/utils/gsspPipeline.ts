import { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

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
 * Type signature for a middleware function compatible with the {@link GsspPipeline}.
 *
 * A middleware function receives the Next.js {@link GetServerSidePropsContext} and accumulated pipeline context,
 * and may return one of three things that the pipeline runner interprets differently:
 *
 * | Return value | Pipeline behaviour |
 * |---|---|
 * | `void` / `undefined` | Continue to the next middleware unchanged. |
 * | Plain `object` (`TOutput`) | Merged into `pipelineContext` via `Object.assign` before the next middleware runs. |
 * | {@link GetServerSidePropsResult} (with `redirect` or `notFound`) | Pipeline is **halted immediately** and this result is returned to Next.js (e.g. redirecting or rendering 404). |
 *
 * Both synchronous and asynchronous middleware functions are supported.
 *
 * @template TContext - The shape of the accumulated context object at the point this middleware
 *   runs. Constrained to {@link ContextSlice} so that `Object.assign` merges are type-safe.
 * @template TOutput - The shape of the *new* properties this middleware contributes to the context
 *   when it succeeds. Defaults to `ContextSlice` (i.e. any plain object). The pipeline will
 *   widen `TContext` to `TContext & TOutput` before passing it to the next middleware.
 *
 * @param context - The incoming {@link GetServerSidePropsContext} object provided by Next.js.
 * @param accumulatedData - The context object accumulated by all previously executed middlewares.
 *
 * @returns One of:
 *   - `Promise<TOutput | GetServerSidePropsResult<any> | void>` for async middleware, or
 *   - `TOutput | GetServerSidePropsResult<any> | void` for synchronous middleware.
 */
type GsspMiddlewareFn<TContext extends ContextSlice, TOutput extends ContextSlice = ContextSlice> = (
    context: GetServerSidePropsContext,
    accumulatedData: TContext
) => Promise<TOutput | GetServerSidePropsResult<any> | void> | TOutput | GetServerSidePropsResult<any> | void;

/**
 * A type-safe, chainable middleware pipeline for Next.js `getServerSideProps` (gSSP).
 *
 * `GsspPipeline` implements a **chain-of-responsibility** pattern where each middleware can
 * inspect or enrich the shared request context, or terminate the pipeline early by returning
 * a `redirect` or `notFound` result. The final `getServerSideProps` handler is only invoked when **all**
 * middlewares complete successfully and no middleware has returned a redirect or notFound result.
 *
 * ### How it works
 * 1. Call `.use(middleware)` one or more times to register middlewares in execution order.
 * 2. Call `.run(handler)` to close the chain and receive a standard `getServerSideProps` function
 *    `(context) => Promise<GetServerSidePropsResult<...>>` that can be exported from a Next.js page.
 * 3. At runtime, each middleware is awaited in sequence. If a middleware returns a `redirect` or `notFound`
 *    object, the chain is **immediately aborted** and that result is returned directly to Next.js. If it returns
 *    a plain object, that object is merged into `pipelineContext`. If it throws, the user is redirected
 *    to `/500`.
 * 4. When the handler completes, any `props` returned by the handler are automatically merged with the
 *    accumulated `pipelineContext` properties so they are passed to the page component as props.
 *
 * ### Generic parameter
 * `TContext` accumulates the shape of the context as middlewares are composed — each call to
 * `.use()` widens the type to `TContext & TNewData`. Use it to get fully-typed access to context
 * properties inside the final handler without extra type assertions.
 *
 * @template TContext - Shape of the shared context object passed between middlewares and the
 *   final handler. Must extend {@link ContextSlice}.
 *
 * @example
 * // pages/dashboard.tsx
 * interface MyContext {
 *   user: User;
 * }
 *
 * export const getServerSideProps = gsspPipeline<MyContext>()
 *   .use(requireAuth)        // returns { redirect: { destination: '/login', permanent: false } } if unauthenticated
 *   .use(fetchUserProfile)   // returns { user: User }
 *   .run(async (context, pipelineContext) => {
 *     // pipelineContext.user is fully typed here
 *     return {
 *       props: {
 *         title: 'Dashboard',
 *       },
 *     };
 *   });
 */
export class GsspPipeline<TContext extends ContextSlice = ContextSlice> {
    /** Ordered list of registered middleware functions. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private middlewares: GsspMiddlewareFn<any, any>[] = [];

    /**
     * Registers a middleware function and appends it to the execution chain.
     *
     * Each call to `.use()` **widens the accumulated context type** by intersecting `TContext`
     * with the `TNewData` type contributed by the new middleware. This means the *next* `.use()`
     * call and the final `.run()` handler both see all properties added by previous middlewares
     * without requiring extra type assertions.
     *
     * Middlewares are executed in the order they are registered. Each middleware
     * receives the Next.js `GetServerSidePropsContext` and the **same mutable `pipelineContext`**
     * that has been progressively enriched by all previous middlewares.
     *
     * The method returns a new `GsspPipeline<TContext & TNewData>` instance to enable fluent
     * method chaining with accumulated types.
     *
     * @template TNewData - The shape of the new context properties contributed by `fn`.
     * @param fn - The {@link GsspMiddlewareFn} to add to the pipeline.
     * @returns A new {@link GsspPipeline} instance typed to `TContext & TNewData` (for chaining).
     *
     * @example
     * pipeline
     *   .use(sessionMiddleware)    // contributes { user: User }
     *   .use(permissionMiddleware) // can now read pipelineContext.user
     *   .use(loggingMiddleware);
     */
    use<TNewData extends ContextSlice>(
        fn: GsspMiddlewareFn<TContext, TNewData>
    ): GsspPipeline<TContext & TNewData> {
        this.middlewares.push(fn);
        return this as unknown as GsspPipeline<TContext & TNewData>;
    }

    /**
     * Closes the middleware chain and returns a standard Next.js `getServerSideProps` function.
     *
     * The returned function has the signature `(context: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<TPageProps & TContext>>`,
     * which is the exact signature expected by the Next.js Pages Router for `getServerSideProps`.
     *
     * **Execution order at runtime:**
     * 1. An empty context object `{}` is initialised and cast to `TContext`.
     * 2. Each registered middleware is awaited in order:
     *    - If a middleware returns a result containing `redirect` or `notFound`, the chain is
     *      **immediately aborted** and that result is returned to Next.js.
     *    - If a middleware returns a plain object, it is merged into `pipelineContext` via `Object.assign`.
     *    - If a middleware throws an unexpected error, a temporary redirect to `/500` is returned.
     * 3. Once all middlewares complete successfully, `handler` is called with `(context, pipelineContext)`.
     * 4. If `handler` returns an object containing `props`, `pipelineContext` is merged into `props`
     *    so that all accumulated context properties are passed to the React page component.
     *
     * @template TPageProps - Shape of the page-specific props returned by the final `handler`.
     * @param handler - The final `getServerSideProps` handler function that receives the Next.js context and fully-enriched `pipelineContext`.
     *   Must return a {@link GetServerSidePropsResult} or `Promise<GetServerSidePropsResult>`.
     *
     * @returns A Next.js-compatible `getServerSideProps` function:
     *   `(context: GetServerSidePropsContext) => Promise<GetServerSidePropsResult<TPageProps & TContext>>`.
     *
     * @example
     * export const getServerSideProps = gsspPipeline<MyContext>()
     *   .use(requireAuth)
     *   .use(fetchUserProfile)
     *   .run(async (context, pipelineContext) => {
     *     return {
     *       props: {
     *         title: 'Dashboard',
     *       },
     *     };
     *   });
     */
    run<TPageProps extends Record<string, any> = {}>(
        handler: (
            context: GetServerSidePropsContext,
            pipelineContext: TContext
        ) => Promise<GetServerSidePropsResult<TPageProps>> | GetServerSidePropsResult<TPageProps>
    ) {
        return async (
            context: GetServerSidePropsContext
        ): Promise<GetServerSidePropsResult<TPageProps & TContext>> => {
            const pipelineContext = {} as TContext;

            for (const middleware of this.middlewares) {
                try {
                    const result = await middleware(context, pipelineContext);

                    // GESTIONE INTERRUZIONE / REDIRECT:
                    // Se il middleware restituisce un oggetto con 'redirect' o 'notFound',
                    // interrompiamo la pipeline e Next.js gestirà il redirect o il 404 a runtime.
                    if (result && typeof result === 'object' && ('redirect' in result || 'notFound' in result)) {
                        return result as Exclude<GetServerSidePropsResult<TPageProps>, { props: unknown }>;
                    }

                    // ARRICCHIMENTO:
                    // Se il middleware restituisce un oggetto di dati, lo fondiamo nel contesto.
                    if (result && typeof result === 'object') {
                        Object.assign(pipelineContext, result);
                    }
                } catch (error) {
                    // Se un middleware crasha imprevistamente sul server, rimandiamo a una pagina di errore generica
                    return {
                        redirect: {
                            destination: '/500',
                            permanent: false,
                        },
                    };
                }
            }

            // Eseguiamo l'handler finale della pagina
            const handlerResult = await handler(context, pipelineContext);

            // Se l'handler della pagina restituisce props, vi uniamo il contesto della pipeline
            if ('props' in handlerResult) {
                const pageProps = await handlerResult.props;
                return {
                    props: {
                        ...pageProps,
                        ...pipelineContext,
                    } as TPageProps & TContext,
                };
            }

            return handlerResult;
        };
    }
}

/**
 * Factory helper that instantiates a new {@link GsspPipeline} with the given context type.
 *
 * Using this helper instead of `new GsspPipeline<TContext>()` keeps `getServerSideProps` declarations concise
 * and reads naturally as a fluent chain:
 *
 * ```ts
 * export const getServerSideProps = gsspPipeline<MyContext>()
 *   .use(someMiddleware)
 *   .run(myHandler);
 * ```
 *
 * @template TContext - The shape of the context object that will be built up by the registered
 *   middlewares and passed to the final handler and page component props. Must extend {@link ContextSlice}.
 *
 * @returns A fresh, empty {@link GsspPipeline} instance typed to `TContext`.
 */
export const gsspPipeline = <TContext extends ContextSlice = ContextSlice>() => new GsspPipeline<TContext>();