import { GetServerSidePropsContext } from 'next';

/**
 * Interface representing an authenticated user session object.
 *
 * Injected into the {@link GsspPipeline} context by {@link requireAuth}.
 */
export interface UserSession {
    /** Unique identifier for the authenticated user (e.g. `usr_abc123`). */
    id: string;
    /** Primary email address of the authenticated user. */
    email: string;
    /** Role assigned to the user, used for authorization checks by {@link requireRole}. */
    role: 'admin' | 'user';
}

/**
 * Middleware that enforces user authentication for `getServerSideProps` pages.
 *
 * Inspects incoming request cookies for the presence of an `auth-token`.
 * - If missing or invalid, short-circuits the pipeline with a Next.js temporary `redirect` to `/login`
 *   with the `callbackUrl` parameter set to `ctx.resolvedUrl`.
 * - If valid, returns `{ currentUser: UserSession }`, which the {@link GsspPipeline} runner merges
 *   into the accumulated context and passes down to subsequent middlewares and the page handler.
 *
 * @param ctx - The Next.js {@link GetServerSidePropsContext} object.
 *
 * @returns An object `{ currentUser: UserSession }` when authenticated, or a `redirect` descriptor
 *   object when unauthenticated or token validation fails.
 *
 * @example
 * export const getServerSideProps = gsspPipeline<{ currentUser: UserSession }>()
 *   .use(requireAuth)
 *   .run(async (ctx, pipelineContext) => {
 *     return { props: { email: pipelineContext.currentUser.email } };
 *   });
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
 * Higher-order middleware factory that enforces role-based access control (RBAC) in `getServerSideProps`.
 *
 * Expects `accumulated.currentUser` to have been populated by a preceding middleware (such as {@link requireAuth}).
 * Checks whether `currentUser.role` matches `allowedRole`.
 * - If authorized, returns `void` allowing the pipeline to proceed.
 * - If missing or unauthorized, returns `{ notFound: true }` so Next.js renders the standard 404 page.
 *
 * @param allowedRole - The required role allowed to access the page (`'admin'` or `'user'`).
 *
 * @returns A {@link GsspMiddlewareFn} function that verifies the user's role against `allowedRole`.
 *
 * @example
 * export const getServerSideProps = gsspPipeline<{ currentUser: UserSession }>()
 *   .use(requireAuth)
 *   .use(requireRole('admin'))
 *   .run(async (ctx, pipelineContext) => {
 *     // Only admins reach this point
 *     return { props: { adminData: 'secret' } };
 *   });
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

