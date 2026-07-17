import { checkContentType, extractXAppName } from '@/app/utils/pageMiddlewares';
import { pagesPipeline } from '@/app/utils/pagesPipeline';

/**
 * Shape of the typed context object built up by the middleware pipeline for this route.
 *
 * Each property is contributed by one of the middlewares registered via `.use()`:
 *
 * | Property  | Source middleware |
 * |---|---|
 * | `appName` | {@link extractXAppName} – extracted from the `x-app-name` request header |
 */
interface MyContext extends Record<string, unknown> {
    /** The validated value of the `x-app-name` request header. */
    appName: string;
}

/**
 * Next.js Pages Router **default** API handler for `/api/secure-endpoint-pages`.
 *
 * This handler is assembled through a {@link PagesPipeline} that enforces a two-step validation
 * chain before allowing any business logic to execute:
 *
 * ### Pipeline stages
 *
 * 1. **`checkContentType`** – Verifies that the request carries a
 *    `Content-Type: application/json` header. If not, the pipeline is halted with
 *    `HTTP 415 Unsupported Media Type`.
 *
 * 2. **`extractXAppName`** – Reads the custom `x-app-name` header, validates its presence, and
 *    injects it into the typed context as `context.appName`. If the header is absent or is
 *    an array value, the pipeline is halted with `HTTP 400 Bad Request`.
 *
 * 3. **Final handler** – Runs only when both middlewares succeed. It reads the raw request
 *    body and returns a success payload that echoes back the `appName` and the received body.
 *
 * ### Required request headers
 *
 * | Header | Required | Description |
 * |---|---|---|
 * | `Content-Type` | ✅ | Must be `application/json` |
 * | `x-app-name` | ✅ | Identifies the calling application |
 *
 * ### Response shape
 *
 * **Success – HTTP 200**
 * ```json
 * {
 *   "success": true,
 *   "message": "Richiesta validata a runtime per il client: <appName>",
 *   "payloadReceived": { ...requestBody }
 * }
 * ```
 *
 * **Validation error – HTTP 415** (missing / wrong Content-Type)
 * ```json
 * { "error": "Unsupported Media Type. Richiesto: application/json" }
 * ```
 *
 * **Validation error – HTTP 400** (missing or array-valued `x-app-name` header)
 * ```json
 * { "error": "Missing or invalid required header: x-app-name" }
 * ```
 *
 * **Unexpected error – HTTP 500**
 * ```json
 * { "error": "<error message>" }
 * ```
 *
 * @example
 * // Example curl request:
 * // curl -X POST http://localhost:3000/api/secure-endpoint-pages \
 * //   -H "Content-Type: application/json" \
 * //   -H "x-app-name: my-service" \
 * //   -d '{"hello":"world"}'
 */
export default pagesPipeline<MyContext>()
    .use(checkContentType) // 1. Verify the content-type header
    .use(extractXAppName)  // 2. Extract and validate the x-app-name header
    .run(async (req, res, context) => {

        // context.appName is present and fully typed here.
        const { appName } = context;
        const body = req.body;

        res.status(200).json({
            success: true,
            message: `Richiesta validata a runtime per il client: ${appName}`,
            payloadReceived: body,
        });
    });
