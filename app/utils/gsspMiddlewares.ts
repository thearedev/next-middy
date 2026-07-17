import { GetServerSidePropsContext } from 'next';

interface UserSession {
    id: string;
    email: string;
    role: 'admin' | 'user';
}

/**
 * Middleware: Richiede che l'utente sia autenticato.
 * Se non lo è, effettua un redirect alla pagina di login.
 * Se lo è, estrae e restituisce la sessione utente.
 */
export const requireAuth = async (ctx: GetServerSidePropsContext) => {
    const cookies = ctx.req.cookies;
    const token = cookies['auth-token'];

    if (!token) {
        // Se manca il token, reindirizziamo l'utente al login
        return {
            redirect: {
                destination: `/login?callbackUrl=${encodeURIComponent(ctx.resolvedUrl)}`,
                permanent: false,
            },
        };
    }

    try {
        // Simuliamo la validazione del token e il recupero dell'utente
        const user: UserSession = {
            id: 'usr_abc123',
            email: 'mario.rossi@work.it',
            role: 'admin',
        };

        // Passiamo l'utente autenticato al contesto
        return { currentUser: user };
    } catch (error) {
        // Token non valido, forziamo il logout/login
        return {
            redirect: {
                destination: '/login',
                permanent: false,
            },
        };
    }
};

/**
 * Middleware: Richiede che l'utente abbia un ruolo specifico (es. Admin).
 * Funzione di ordine superiore che accetta parametri di configurazione.
 */
export const requireRole = (allowedRole: 'admin' | 'user') => {
    return async (ctx: GetServerSidePropsContext, accumulated: { currentUser?: UserSession }) => {
        // Notare come possiamo accedere ai dati estratti dal middleware precedente ('accumulated')!
        const user = accumulated.currentUser;

        if (!user || user.role !== allowedRole) {
            // Se non ha i permessi, mostriamo un 404 o un redirect
            return {
                notFound: true, // Mostra la pagina standard 404 di Next.js
            };
        }
    };
};
