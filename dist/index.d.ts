import winston from "winston";
declare global {
    namespace Express {
        interface Request {
            db: any;
            logger: winston.Logger;
            user: any;
        }
    }
}
//# sourceMappingURL=index.d.ts.map