import { NextResponse } from 'next/server';

/**
 * Middleware: Controlla che il Content-Type sia JSON.
 */
export const checkContentType = (req: Request) => {
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        return NextResponse.json(
            { error: 'Unsupported Media Type. Richiesto: application/json' },
            { status: 415 }
        );
    }
};

/**
 * Middleware: Estrae e valida l'header personalizzato.
 * Ritorna il dato utile se valido, altrimenti una risposta di errore.
 */
export const extractXAppName = (req: Request) => {
    const appName = req.headers.get('x-app-name');

    if (!appName) {
        return NextResponse.json(
            { error: 'Missing required header: x-app-name' },
            { status: 400 }
        );
    }

    // Restituiamo il dato validato a runtime per il contesto
    return { appName };
};
