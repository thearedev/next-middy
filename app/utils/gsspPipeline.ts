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
 * Tipo per un middleware di getServerSideProps.
 * Può restituire:
 * - Un nuovo oggetto (i dati estratti che diventeranno props)
 * - `void` (se fa solo controlli senza estrarre dati)
 * - Un risultato parziale di gSSP (es. un redirect o un notFound: true)
 */
type GsspMiddlewareFn<TContext extends ContextSlice, TOutput extends ContextSlice = ContextSlice> = (
    context: GetServerSidePropsContext,
    accumulatedData: TContext
) => Promise<TOutput | GetServerSidePropsResult<any> | void> | TOutput | GetServerSidePropsResult<any> | void;

export class GsspPipeline<TContext extends Record<string, any> = {}> {
    private middlewares: GsspMiddlewareFn<any, any>[] = [];

    /**
     * Registra un middleware nella catena di gSSP.
     */
    use<TNewData extends ContextSlice>(
        fn: GsspMiddlewareFn<TContext, TNewData>
    ): GsspPipeline<TContext & TNewData> {
        this.middlewares.push(fn);
        return this as unknown as GsspPipeline<TContext & TNewData>;
    }

    /**
     * Chiude la catena e restituisce una funzione getServerSideProps standard.
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

// Helper factory
export const gsspPipeline = <TContext extends ContextSlice = ContextSlice>() => new GsspPipeline<TContext>();