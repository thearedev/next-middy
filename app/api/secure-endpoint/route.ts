import { checkContentType, extractXAppName } from '@/app/utils/appMiddlewares';
import { appPipeline } from '@/app/utils/appPipeline';
import { NextResponse } from 'next/server';

// Definiamo l'interfaccia del contesto che vogliamo usare nel nostro handler
interface MyContext {
    appName: string;
}

// Esportiamo la funzione POST avvolta nella nostra pipeline
export const POST = appPipeline<MyContext>()
    .use(checkContentType) // 1. Verifica il content-type
    .use(extractXAppName)  // 2. Estrae e valida l'app-name
    .run(async (req, context) => {

        // --- SICUREZZA TOTALE ---
        // context.appName è presente e tipizzato come stringa.
        const { appName } = context;

        // Nell'App Router, il parsing del body è asincrono e nativo:
        const body = await req.json();

        return NextResponse.json({
            success: true,
            message: `[App Router] Richiesta validata per: ${appName}`,
            payloadReceived: body,
        });
    });