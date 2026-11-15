import type { NextFunction, Request, Response } from "express";
export interface UserSession {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isAdmin: boolean;
    isActive: boolean;
    mfaVerified: boolean;
}
export declare function isTestMode(): boolean;
export declare function createTestJwt(subject: string, role?: string, isAdmin?: boolean): Promise<string>;
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): void;
export declare function requireAdminMfa(req: Request, res: Response, next: NextFunction): void;
export declare function checkAdminAvailability(req: Request, res: Response, next: NextFunction): void;
export declare function getCurrentUser(req: Request): UserSession | null;
