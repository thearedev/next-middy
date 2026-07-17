import { requireAuth, requireRole } from '@/app/utils/gsspMiddlewares';
import { gsspPipeline } from '@/app/utils/gsspPipeline';
import { InferGetServerSidePropsType } from 'next';


// 1. Definiamo la pipeline per gSSP
export const getServerSideProps = gsspPipeline()
    .use(requireAuth)             // Estrae l'utente o reindirizza a /login
    .use(requireRole('admin'))    // Controlla che l'utente sia admin o restituisce un 404
    .run(async (ctx, context) => {

        // Qui siamo sicuri al 100% che l'utente è autenticato ed è un Admin.
        // Possiamo fare altre operazioni specifiche della pagina se necessario
        const dashboardData = {
            stats: [12, 19, 3, 5],
        };

        return {
            props: {
                dashboardData,
            },
        };
    });

// 2. Il Componente della Pagina riceve sia i dati del controller che della pipeline!
export default function AdminDashboard({
    currentUser, // Arriva automaticamente dal middleware 'requireAuth'
    dashboardData, // Arriva dall'handler di gSSP qui sopra
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
    return (
        <main style={{ padding: '2rem' }}>
            <h1>Dashboard Amministratore</h1>
            <p>Benvenuto, {currentUser!.email} (ID: {currentUser!.id})</p>
            <div>
                <h3>Dati Statistici:</h3>
                <pre>{JSON.stringify(dashboardData.stats)}</pre>
            </div>
        </main>
    );
}