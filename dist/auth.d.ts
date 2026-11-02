export interface UserSession {
    id: string;
    email: string;
    name: string;
    role: string;
    isAdmin: boolean;
    mfaVerified: boolean;
}
export declare function generateSessionToken(): string;
export declare function authenticateUser(userId: string, dbClient: any): Promise<UserSession | null>;
export declare function hasPermission(userId: string, permissionCode: string, dbClient: any): Promise<boolean>;
export declare function requireAuth(req: any, res: any, next: any): any;
export declare function requireAdmin(req: any, res: any, next: any): any;
export declare function checkAdminAvailability(req: any, res: any, next: any): any;
export declare function getCurrentUser(req: any): UserSession | null;
export declare function checkSingleAdminPrincipal(dbClient: any): Promise<{
    count: number;
    adminEmails: string[];
    hasAvailableAdmin: boolean;
}>;
export declare function setRLSContext(userId: string, role: string, dbClient: any): Promise<void>;
export declare function clearRLSContext(dbClient: any): Promise<void>;
//# sourceMappingURL=auth.d.ts.map