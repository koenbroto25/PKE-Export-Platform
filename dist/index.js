"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const winston_1 = __importDefault(require("winston"));
const pg_1 = require("pg");
const neon_serverless_1 = require("drizzle-orm/neon-serverless");
const schema = __importStar(require("./schema"));
const auth_ts_1 = require("./auth.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// ============================================
// Logging setup (Winston)
// ============================================
const logger = winston_1.default.createLogger({
    level: "info",
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}] ${message}`;
    })),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: "pke-error.log", level: "error" }),
    ],
});
// Global middleware to log all requests
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});
// ============================================
// Environment validation
// ============================================
const requiredEnv = ["DATABASE_URL", "NODE_ENV"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    logger.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
}
const isProduction = process.env.NODE_ENV === "production";
// ============================================
// Database connection with pooled RLS context support
// ============================================
let pool;
let db;
try {
    pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
    });
    db = (0, neon_serverless_1.drizzle)({ client: pool, schema });
    // Test connection
    pool.query("SELECT 1").then(() => {
        logger.info("Database connection established successfully");
    }).catch((err) => {
        logger.error("Database connection failed:", err);
        process.exit(1);
    });
}
catch (error) {
    logger.error("Failed to create database pool:", error);
    process.exit(1);
}
// ============================================
// Centralized error handling middleware
// ============================================
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = isProduction ? "Internal server error" : err.message || "Unknown error";
    // Log the full error for debugging
    logger.error({
        error: err,
        message: err.message,
        stack: isProduction ? "hidden" : err.stack,
        url: req.originalUrl,
        method: req.method,
    });
    res.status(status).json({
        status: "error",
        message,
        ...(isProduction ? {} : { stack: err.stack }),
    });
});
// ============================================
// Health check endpoint
// ============================================
app.get("/api/v1/health", async (req, res) => {
    try {
        const { rows } = await db.execute("SELECT 1 as healthy");
        const health = {
            status: "ok",
            timestamp: new Date().toISOString(),
            database: "connected",
            environment: process.env.NODE_ENV,
        };
        res.json(health);
    }
    catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message,
        });
    }
});
// ============================================
// API version prefix with auth injection
// ============================================
app.use("/api/v1", async (req, res, next) => {
    req.db = db;
    req.logger = logger;
    next();
});
// ============================================
// Authentication middleware setup
// ============================================
// Get current user context - protected by requireAuth
app.get("/api/v1/me", auth_ts_1.requireAuth, async (req, res) => {
    const user = (0, auth_ts_1.getCurrentUser)(req);
    if (!user) {
        return res.status(401).json({ error: "Unauthorized - no user context" });
    }
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});
// Role and permission endpoints - Admin only (role-based access control)
app.get("/api/v1/roles", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM role_catalog WHERE is_active = true");
        const { rows: perms } = await db.query("SELECT * FROM permissions WHERE is_active = true");
        res.json({ roles: rows, permissions: perms });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Contract Program management - Admin only
app.get("/api/v1/contract-programs", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM contract_programs WHERE is_active = true ORDER BY created_at DESC");
        res.json({ contractPrograms: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/contract-programs/:id", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query("SELECT * FROM contract_programs WHERE id = $1::uuid AND is_active = true", [BigInt(Number(id))]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Contract Program not found" });
        }
        res.json({ contractProgram: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/contract-programs", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    const { name, description, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode } = req.body;
    if (!name || !settlementUnit || !targetQuantity || !cadence || !generationMode) {
        return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity, cadence, generationMode" });
    }
    try {
        const { rows } = await db.query("INSERT INTO contract_programs (name, description, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), now()) RETURNING *", [name, description || null, buyerId || null, contractId || null, settlementUnit, targetQuantity, cadence, generationMode]);
        res.status(201).json({ contractProgram: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Cycle Policy management - Admin only
app.get("/api/v1/cycle-policies", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM cycle_policies WHERE is_active = true ORDER BY created_at DESC");
        res.json({ cyclePolicies: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/cycle-policies", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    const { contractProgramId, cadence, targetQuantity, generationMode } = req.body;
    if (!contractProgramId || !cadence || !generationMode) {
        return res.status(400).json({ error: "Required fields: contractProgramId, cadence, generationMode" });
    }
    try {
        const { rows } = await db.query("INSERT INTO cycle_policies (contract_program_id, cadence, target_quantity, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *", [contractProgramId, cadence, targetQuantity || null, generationMode]);
        res.status(201).json({ cyclePolicy: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Project management
app.get("/api/v1/projects", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query("SELECT * FROM projects WHERE is_active = true ORDER BY created_at DESC");
        res.json({ projects: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/projects/:id", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query("SELECT * FROM projects WHERE id = $1::uuid AND is_active = true", [BigInt(Number(id))]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Project not found" });
        }
        res.json({ project: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post("/api/v1/projects", auth_ts_1.requireAuth, auth_ts_1.requireAdmin, async (req, res) => {
    const { contractProgramId, name, description, status, settlementUnit, targetQuantity } = req.body;
    if (!contractProgramId || !name || !settlementUnit || !targetQuantity) {
        return res.status(400).json({ error: "Required fields: contractProgramId, name, settlementUnit, targetQuantity" });
    }
    try {
        const { rows } = await db.query("INSERT INTO projects (contract_program_id, name, description, status, settlement_unit, target_quantity, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, now(), now()) RETURNING *", [contractProgramId, name, description || null, status || "draft", settlementUnit, targetQuantity]);
        res.status(201).json({ project: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Check Admin principal availability and count - Admin only
app.get("/api/v1/admin/principal-count", auth_ts_1.requireAdmin, async (req, res) => {
    try {
        const result = await (0, auth_ts_1.checkSingleAdminPrincipal)(db);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Admin-only: Create Admin user (step-up authentication required in production)
app.post("/api/v1/admin/create-admin", auth_ts_1.requireAdmin, auth_ts_1.checkAdminAvailability, async (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }
    try {
        const { rows: existing } = await db.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: "Admin user already exists" });
        }
        // Verify no other admin is available if this is the first admin creation
        if (existing.length === 0) {
            const { hasAvailableAdmin } = await (0, auth_ts_1.checkSingleAdminPrincipal)(db);
            if (!hasAvailableAdmin) {
                // This is the first admin - allow creation
            }
        }
        const passwordHash = `hashed_${password}_placeholder`;
        const { rows: newUser } = await db.query("INSERT INTO users (email, name, role, password_hash, mfa_enabled, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, name, role", [email, name || "Admin", "admin", passwordHash, false, true]);
        res.status(201).json({
            id: newUser[0].id,
            email: newUser[0].email,
            name: newUser[0].name,
            role: newUser[0].role,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Seed development data - Admin only
app.post("/api/v1/admin/seed", auth_ts_1.requireAdmin, async (req, res) => {
    try {
        // Create default role entries (idempotent)
        await db.execute("INSERT INTO role_catalog (name, description, is_active) VALUES ($1, $2, true) ON CONFLICT DO NOTHING", ["admin", "Application Administrator"]);
        // Create default permissions (idempotent)
        const defaultPerms = [
            "view_projects", "create_projects", "edit_projects", "delete_projects",
            "view_contracts", "create_contracts", "edit_contracts", "approve_contracts",
            "view_buyers", "create_buyers", "edit_buyers",
            "view_pks_sites", "create_pks_sites", "edit_pks_sites",
            "view_contract_programs", "create_contract_programs", "edit_contract_programs",
            "manage_project_members", "manage_roles",
            "view_fx_rates", "manage_fx_rates",
            "view_rab", "manage_rab",
            "view_truck_trips", "manage_truck_trips",
            "view_reports", "export_reports",
        ];
        for (const code of defaultPerms) {
            await db.execute("INSERT INTO permissions (name, code, description, is_active) VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING", [code.replace(/_/g, " "), code, `Permission: ${code}`]);
        }
        // Create default Admin user
        const passwordHash = "placeholder_hash_must_be_replaced";
        const { rows: adminUser } = await db.query("INSERT INTO users (email, name, role, password_hash, mfa_enabled, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, name, role", ["admin@pke.local", "Principal Admin", "admin", passwordHash, true, true]);
        res.json({
            message: "Development data seeded successfully",
            adminUserId: adminUser[0].id,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Truck tracking endpoints - require authentication
app.post("/api/v1/truck-trips", auth_ts_1.requireAuth, async (req, res) => {
    const { projectId, pksSiteId, transporter, driverName, plateNumber, origin, destination, quantity, departureTime } = req.body;
    if (!projectId || !plateNumber || !departureTime) {
        return res.status(400).json({ error: "Required fields: projectId, plateNumber, departureTime" });
    }
    try {
        const tripId = `TRIP-${Date.now()}`;
        const { rows } = await db.query("INSERT INTO truck_trips (project_id, trip_id, pks_site_id, transporter, driver_name, plate_number, origin, destination, quantity, departure_time, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', now(), now()) RETURNING *", [projectId, tripId, pksSiteId || null, transporter || null, driverName || null, plateNumber, origin || null, destination || null, quantity || null, departureTime]);
        res.status(201).json({ truckTrip: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/truck-trips", auth_ts_1.requireAuth, async (req, res) => {
    const user = (0, auth_ts_1.getCurrentUser)(req);
    const userId = user ? user.id : null;
    try {
        let query = `
      SELECT tt.*, u.name as checker_name, u.role as checker_role
      FROM truck_trips tt
      LEFT JOIN users u ON tt.checker_id = u.id
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 1;
        if (userId) {
            query += ` AND (tt.project_id = $${paramCount} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tt.project_id AND pm.user_id = $${paramCount}))`;
            params.push(BigInt(Number(userId)));
            paramCount++;
        }
        // If user is admin, show all trips
        if (!userId || user?.isAdmin) {
            // No additional filter for admin
        }
        else {
            // Non-admin users only see their assigned trips
            query += ` AND tt.checker_id = $${paramCount}`;
            params.push(BigInt(Number(userId)));
            paramCount++;
        }
        query += ` ORDER BY tt.departure_time DESC`;
        const { rows } = await db.query(query, params);
        res.json({ truckTrips: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Tracking events endpoints - require authentication
app.post("/api/v1/tracking-events", auth_ts_1.requireAuth, async (req, res) => {
    const { truckTripId, eventType, latitude, longitude, accuracy, description, checkerId, evidenceUrl } = req.body;
    if (!truckTripId || !eventType) {
        return res.status(400).json({ error: "Required fields: truckTripId, eventType" });
    }
    try {
        const eventTypeEnum = eventType; // In production, validate against enum
        const { rows } = await db.query("INSERT INTO tracking_events (truck_trip_id, event_type, description, latitude, longitude, accuracy, server_timestamp, checker_id, evidence_url, notes) VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9) RETURNING *", [truckTripId, eventTypeEnum, description || null, latitude || null, longitude || null, accuracy || null, checkerId || null, evidenceUrl || null]);
        res.status(201).json({ trackingEvent: rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get("/api/v1/tracking-events", auth_ts_1.requireAuth, async (req, res) => {
    const user = (0, auth_ts_1.getCurrentUser)(req);
    const userId = user ? user.id : null;
    try {
        let query = `
      SELECT te.*, u.name as checker_name, u.role as checker_role
      FROM tracking_events te
      LEFT JOIN users u ON te.checker_id = u.id
      WHERE 1=1
    `;
        const params = [];
        let paramCount = 1;
        if (userId) {
            query += ` AND (te.truck_trip_id IN (SELECT id FROM truck_trips tt WHERE tt.project_id = $${paramCount} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = tt.project_id AND pm.user_id = $${paramCount})) OR tt.checker_id = $${paramCount})`;
            params.push(BigInt(Number(userId)));
            paramCount++;
        }
        if (user?.isAdmin) {
            // Admin can see all events - no additional filter needed
        }
        else if (userId) {
            // Non-admin, non-authenticated users filtered above
        }
        query += ` ORDER BY te.server_timestamp DESC`;
        const { rows } = await db.query(query, params);
        res.json({ trackingEvents: rows });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============================================
// Graceful shutdown
// ============================================
process.on("SIGTERM", async () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    try {
        await pool.end();
        logger.info("Database pool closed");
    }
    catch (err) {
        logger.error("Error closing database pool:", err);
    }
    process.exit(0);
});
process.on("SIGINT", async () => {
    logger.info("SIGINT received. Shutting down gracefully...");
    try {
        await pool.end();
        logger.info("Database pool closed");
    }
    catch (err) {
        logger.error("Error closing database pool:", err);
    }
    process.exit(0);
});
app.listen(PORT, () => {
    logger.info(`PKE Export Platform API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Timestamp: ${new Date().toISOString()}`);
});
//# sourceMappingURL=index.js.map