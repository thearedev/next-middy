import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Middleware: Controlla che il Content-Type sia JSON.
 */
export const checkContentType = (req: NextApiRequest, res: NextApiResponse) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
        res.status(415).json({ error: 'Unsupported Media Type. Required: application/json' });
        return
    }
};

/**
 * Middleware: Estrae e convalida un header personalizzato.
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