/**
 * Configuration options for initialising an HTTP client instance via {@link createHttpClient}.
 */
type ClientConfig = {
    /** Target base URL for all HTTP requests initiated by this client (e.g. `https://api.example.com`). */
    baseUrl: string;
    /** Optional key-value header dictionary appended to every outbound request. */
    defaultHeaders?: Record<string, string>;
};

/**
 * Interface representing the specialized HTTP client object returned by {@link createHttpClient}.
 */
export interface HttpClient {
    /**
     * Executes an HTTP GET request to the specified resource path.
     *
     * @param path - Relative endpoint path (e.g. `/users/123`).
     * @param config - Optional additional request configuration (headers, signal, etc.).
     * @returns A promise resolving to the parsed JSON response payload.
     */
    get: (path: string, config?: RequestInit) => Promise<unknown>;

    /**
     * Executes an HTTP POST request to the specified resource path with a JSON payload.
     *
     * @param path - Relative endpoint path (e.g. `/users`).
     * @param body - The JavaScript object or value to be JSON-serialized into the request body.
     * @param config - Optional additional request configuration.
     * @returns A promise resolving to the parsed JSON response payload.
     */
    post: (path: string, body: unknown, config?: RequestInit) => Promise<unknown>;

    /**
     * Executes an HTTP PUT request to update a resource at the specified path with a JSON payload.
     *
     * @param path - Relative endpoint path (e.g. `/users/123`).
     * @param body - The JavaScript object or value to be JSON-serialized into the request body.
     * @param config - Optional additional request configuration.
     * @returns A promise resolving to the parsed JSON response payload.
     */
    put: (path: string, body: unknown, config?: RequestInit) => Promise<unknown>;

    /**
     * Executes an HTTP DELETE request to remove a resource at the specified path.
     *
     * @param path - Relative endpoint path (e.g. `/users/123`).
     * @param config - Optional additional request configuration.
     * @returns A promise resolving to the parsed JSON response payload.
     */
    delete: (path: string, config?: RequestInit) => Promise<unknown>;
}

/**
 * Creates and returns a light, re-usable HTTP client bound to a fixed base URL and default headers.
 *
 * Automatically handles:
 * - Prepending the `baseUrl` to every request path.
 * - Injecting `Content-Type: application/json` and any custom default headers.
 * - Parsing incoming JSON response bodies.
 * - Handling `204 No Content` responses gracefully by returning an empty object `{}`.
 * - Throwing descriptive error instances when HTTP responses report non-2xx status codes.
 *
 * @param config - The {@link ClientConfig} containing `baseUrl` and optional `defaultHeaders`.
 * @returns An object providing {@link HttpClient} methods (`get`, `post`, `put`, `delete`).
 *
 * @example
 * const apiClient = createHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   defaultHeaders: { Authorization: 'Bearer token' },
 * });
 *
 * const user = await apiClient.get('/users/42');
 */
export function createHttpClient({ baseUrl, defaultHeaders = {} }: ClientConfig): HttpClient {
    /**
     * Core request dispatcher executing standard fetch requests against the configured base URL.
     *
     * @param path - Target endpoint path relative to `baseUrl`.
     * @param config - Standard Fetch API {@link RequestInit} options.
     * @returns A promise resolving to the parsed JSON response payload or empty object for 204 status.
     * @throws {Error} If the HTTP response status code indicates an error (not in 200–299 range).
     */
    async function request(path: string, config: RequestInit = {}): Promise<unknown> {
        const url = `${baseUrl}${path}`;

        const headers = {
            'Content-Type': 'application/json',
            ...defaultHeaders,
            ...config.headers,
        };

        const response = await fetch(url, { ...config, headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(`[HTTP ${response.status}] su ${url}: ${errorData?.message || response.statusText}`);
        }

        if (response.status === 204) return {} as unknown;
        return response.json() as Promise<unknown>;
    }

    return {
        get: (path: string, config?: RequestInit) =>
            request(path, { ...config, method: 'GET' }),

        post: (path: string, body: unknown, config?: RequestInit) =>
            request(path, { ...config, method: 'POST', body: JSON.stringify(body) }),

        put: (path: string, body: unknown, config?: RequestInit) =>
            request(path, { ...config, method: 'PUT', body: JSON.stringify(body) }),

        delete: (path: string, config?: RequestInit) =>
            request(path, { ...config, method: 'DELETE' }),
    };
}