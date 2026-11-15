import winston from "winston";
declare global {
    namespace Express {
        interface Request {
            db: any;
            drizzleDb: any;
            logger: winston.Logger;
            user: any;
        }
    }
}
export declare const app: import("express-serve-static-core").Express;
export declare function ensureRuntimeReady(): Promise<void>;
export default app;
