import { z } from 'zod';
import { createHttpClient } from '@/app/lib/http-client';

/**
 * Zod schema for validating Payment service environment variables.
 */
const paymentConfigSchema = z.object({
    /** Target base URL for the Payment service. Must be a valid URL string. */
    url: z.url("PAYMENT_SERVICE_URL deve essere un URL valido"),
    /** Secret API key / bearer token for authentication against the Payment service. */
    secret: z.string().min(1, "PAYMENT_SERVICE_SECRET non può essere vuoto"),
});

/**
 * Validated Payment service configuration parsed from runtime environment variables (`PAYMENT_SERVICE_URL`, `PAYMENT_SERVICE_SECRET`).
 */
const paymentConfig = paymentConfigSchema.parse({
    url: process.env.PAYMENT_SERVICE_URL,
    secret: process.env.PAYMENT_SERVICE_SECRET,
});

/**
 * Pre-configured {@link HttpClient} for interacting with the external Payment service.
 *
 * Configured with `paymentConfig.url` and an `Authorization: Bearer <secret>` header.
 */
export const paymentApi = createHttpClient({
    baseUrl: paymentConfig.url,
    defaultHeaders: {
        'Authorization': `Bearer ${paymentConfig.secret}`,
    },
});

/**
 * Fetches payment record details by account/owner name from the Payment service.
 *
 * @param params - Query criteria.
 * @param params.name - The name identifier associated with the target payment record.
 * @returns A promise resolving to the raw payment data payload.
 */
async function getPayment(params: { name: string }) {
    const p = await paymentApi.get(`/payment/${params.name}`)
    return p
}

/**
 * Zod schema for validating CRM service environment variables.
 */
const crmConfigSchema = z.object({
    /** Target base URL for the CRM service. Must be a valid URL string. */
    url: z.url("CRM_SERVICE_URL deve essere un URL valido"),
    /** API key passed in the `X-Api-Key` header for CRM authentication. */
    secret: z.string().min(1, "CRM_API_KEY non può essere vuoto"),
});

/**
 * Validated CRM service configuration parsed from runtime environment variables (`CRM_SERVICE_URL`, `CRM_API_KEY`).
 */
const crmConfig = crmConfigSchema.parse({
    url: process.env.CRM_SERVICE_URL,
    secret: process.env.CRM_API_KEY,
});

/**
 * Pre-configured {@link HttpClient} for interacting with the external CRM service.
 *
 * Configured with `crmConfig.url` and an `X-Api-Key: <secret>` header.
 */
export const crmApi = createHttpClient({
    baseUrl: crmConfig.url,
    defaultHeaders: {
        'X-Api-Key': crmConfig.secret,
    },
});

/**
 * Zod schema for validating Internal microservice environment variables.
 */
const internalConfigSchema = z.object({
    /** Target base URL for internal backend services. Must be a valid URL string. */
    url: z.url("INTERNAL_SERVICE_URL deve essere un URL valido"),
    /** Secret key passed in the `X-Internal-Secret` header for microservice authentication. */
    secret: z.string().min(1, "INTERNAL_SERVICE_SECRET non può essere vuoto"),
});

/**
 * Validated Internal service configuration parsed from runtime environment variables (`INTERNAL_SERVICE_URL`, `INTERNAL_SERVICE_SECRET`).
 */
const internalConfig = internalConfigSchema.parse({
    url: process.env.INTERNAL_SERVICE_URL,
    secret: process.env.INTERNAL_SERVICE_SECRET,
});

/**
 * Pre-configured {@link HttpClient} for interacting with internal microservices.
 *
 * Configured with `internalConfig.url` and an `X-Internal-Secret: <secret>` header.
 */
export const internalApi = createHttpClient({
    baseUrl: internalConfig.url,
    defaultHeaders: {
        'X-Internal-Secret': internalConfig.secret,
    },
});