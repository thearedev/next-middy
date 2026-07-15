import { NextResponse } from 'next/server';

/**
 * Tipo per una funzione middleware dell'App Router.
 * Può restituire:
 * - Un nuovo oggetto (che verrà fuso nel contesto)
 * - `void` (se fa solo controlli e tutto è okay)
 * - Un'istanza di `Response` / `NextResponse` (per bloccare il flusso ed emettere un errore)
 */
type AppMiddlewareFn<TContext extends Record<string, any>> = (
    req: Request,
    context: TContext
) => Promise<TContext | Response | void> | TContext | Response | void;

export class AppPipeline<TContext extends Record<string, any>> {
    private middlewares: AppMiddlewareFn<TContext>[] = [];

    /**
     * Registra un middleware nella catena e aggiorna i tipi del contesto.
     */
    use(
        fn: AppMiddlewareFn<TContext>
    ): AppPipeline<TContext> {
        this.middlewares.push(fn);
        return this as any;
    }

    /**
     * Chiude la catena e restituisce un Route Handler standard dell'App Router.
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

// Helper factory
export const appPipeline = <TContext extends Record<string, any>>() => new AppPipeline<TContext>();