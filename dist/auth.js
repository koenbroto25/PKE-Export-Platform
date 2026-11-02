"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSessionToken = generateSessionToken;
exports.authenticateUser = authenticateUser;
exports.hasPermission = hasPermission;
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
exports.checkAdminAvailability = checkAdminAvailability;
exports.getCurrentUser = getCurrentUser;
exports.checkSingleAdminPrincipal = checkSingleAdminPrincipal;
exports.setRLSContext = setRLSContext;
exports.clearRLSContext = clearRLSContext;
// In-memory session store (replace with Redis or Neon session table in production)
const sessions = new Map;
// Generate a simple session token
function generateSessionToken() {
    return Buffer.from(String(Date.now()) + Math.random()).toString("base64");
}
// Authenticate user by ID (typically from JWT or session cookie)
async function authenticateUser(userId, dbClient) {
    try {
        const { rows } = await dbClient.query(`SELECT u.id, u.email, u.name, u.role, u.mfa_enabled, u.is_active,
        CASE WHEN u.role = 'admin' THEN 1 ELSE 0 END as is_admin
       FROM users u WHERE u.id = $1::uuid AND u.is_active = true`, [BigInt(Number(userId))]);
        if (rows.length === 0) {
            return null;
        }
        const user = rows[0];
        const session = {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            isAdmin: user.is_admin === 1,
            mfaVerified: user.mfa_enabled,
        };
        // Store session in memory
        sessions.set(session.id, session);
        return session;
    }
    catch (error) {
        console.error("Authentication error:", error);
        return null;
    }
}
// Verify that a user has a specific permission
async function hasPermission(userId, permissionCode, dbClient) {
    try {
        const user = await authenticateUser(userId, dbClient);
        if (!user)
            return false;
        // Admin has all permissions
        if (user.isAdmin)
            return true;
        // Check specific permission for the user's role
        const { rows } = await dbClient.query(`SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = (SELECT role_id FROM users WHERE id = $1::uuid)
       AND p.code = $2`, [BigInt(Number(userId)), permissionCode]);
        return rows.length > 0;
    }
    catch (error) {
        console.error("Permission check error:", error);
        return false;
    }
}
// Middleware: Require authentication
function requireAuth(req, res, next) {
    const userId = req.headers["x-user-id"];
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized - no user context" });
    }
    // In a real implementation, verify the session token here
    // For now, we just check if the user exists
    // Note: dbClient needs to be injected or available in scope
    // This is a simplified version - full integration requires db context
    if (!req.db) {
        return res.status(500).json({ error: "Database context not available" });
    }
    authenticateUser(userId, req.db).then((session) => {
        if (!session) {
            return res.status(401).json({ error: "Unauthorized - invalid user session" });
        }
        req.user = session;
        next();
    }).catch((err) => {
        res.status(500).json({ error: "Authentication error" });
    });
}
// Middleware: Require Admin principal
function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: "Forbidden - Admin principal required" });
    }
    next();
}
// Middleware: Check if Admin is available (not suspended/awaiting recovery)
function checkAdminAvailability(req, res, next) {
    if (req.user && req.user.isAdmin && !req.user.isActive) {
        return res.status(409).json({
            error: "Admin account is suspended. Action pending admin recovery."
        });
    }
    next();
}
// Get current user session
function getCurrentUser(req) {
    return req.user || null;
}
// Check if exactly one active Admin principal exists
async function checkSingleAdminPrincipal(dbClient) {
    try {
        const { rows } = await dbClient.query("SELECT id, email, name, is_active, mfa_enabled FROM users WHERE role = 'admin' AND is_active = true");
        const adminCount = rows.length;
        const adminEmails = rows.map((r) => r.email);
        const hasAvailableAdmin = adminCount > 0;
        return { count: adminCount, adminEmails, hasAvailableAdmin };
    }
    catch (error) {
        console.error("Error checking admin principal count:", error);
        return { count: 0, adminEmails: [], hasAvailableAdmin: false };
    }
}
// Set Row-Level Security context for the authenticated user
// This must be called at the start of each transaction/request
// Uses transaction-local settings to prevent context leakage in pooled connections
async function setRLSContext(userId, role, dbClient) {
    try {
        await dbClient.query("SELECT set_config('app.current_user_id', $1::text, true)", [userId]);
        await dbClient.query("SELECT set_config('app.current_role', $2::text, true)", [role]);
        await dbClient.query("SELECT set_config('app.current_project_id', '00000000-0000-0000-0000-000000000000'::text, true)");
    }
    catch (error) {
        console.error("Error setting RLS context:", error);
        throw error;
    }
}
// Clear Row-Level Security context (automatically transaction-local)
async function clearRLSContext(dbClient) {
    try {
        await dbClient.query("SELECT reset_config('app.current_user_id')");
        await dbClient.query("SELECT reset_config('app.current_role')");
        await dbClient.query("SELECT reset_config('app.current_project_id')");
    }
    catch (error) {
        console.error("Error clearing RLS context:", error);
        throw error;
    }
}
//# sourceMappingURL=auth.js.map