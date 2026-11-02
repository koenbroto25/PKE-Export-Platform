import express from "express";
import dotenv from "dotenv";
import winston from "winston";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Extend Express Request type to include db, logger, and user
declare global {
  namespace Express {
    interface Request {
      db: any;
      logger: winston.Logger;
      user: any;
    }
  }
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Logging setup (Winston)
// ============================================
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "pke-error.log", level: "error" }),
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
let pool: Pool;
let db: any;

try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
  });

  db = drizzle({ client: pool, schema });

  // Test connection
  pool.query("SELECT 1").then(() => {
    logger.info("Database connection established successfully");
  }).catch((err) => {
    logger.error("Database connection failed:", err);
    process.exit(1);
  });
} catch (error) {
  logger.error("Failed to create database pool:", error);
  process.exit(1);
}

// ============================================
// Centralized error handling middleware
// ============================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
app.get("/api/v1/health", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.execute("SELECT 1 as healthy");
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
      environment: process.env.NODE_ENV,
});
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: (error as Error).message,
    });
  }
});

// ============================================
// API version prefix with auth injection
// ============================================
app.use("/api/v1", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.db = db;
  req.logger = logger;
  next();
});

// ============================================
// Authentication middleware
// ============================================

// Get current user context
app.get("/api/v1/me", async (req: express.Request, res: express.Response) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized - no user context" });
  }
  res.json({ id: userId, email: "user@pke.local", name: "User", role: "user" });
});

// Role and permission endpoints
app.get("/api/v1/roles", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM role_catalog WHERE is_active = true");
    const { rows: perms } = await db.query("SELECT * FROM permissions WHERE is_active = true");
    res.json({ roles: rows, permissions: perms });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Contract Program management
app.get("/api/v1/contract-programs", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM contract_programs WHERE is_active = true ORDER BY created_at DESC");
    res.json({ contractPrograms: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/v1/contract-programs/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query("SELECT * FROM contract_programs WHERE id = $1::uuid AND is_active = true", [BigInt(Number(id))]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Contract Program not found" });
    }
    res.json({ contractProgram: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/v1/contract-programs", async (req: express.Request, res: express.Response) => {
  const { name, description, buyerId, contractId, settlementUnit, targetQuantity, cadence, generationMode } = req.body;

  if (!name || !settlementUnit || !targetQuantity || !cadence || !generationMode) {
    return res.status(400).json({ error: "Required fields: name, settlementUnit, targetQuantity, cadence, generationMode" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO contract_programs (name, description, buyer_id, contract_id, settlement_unit, target_quantity, cadence, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), now()) RETURNING *",
      [name, description || null, buyerId || null, contractId || null, settlementUnit, targetQuantity, cadence, generationMode]
    );
    res.status(201).json({ contractProgram: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Cycle Policy management
app.get("/api/v1/cycle-policies", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM cycle_policies WHERE is_active = true ORDER BY created_at DESC");
    res.json({ cyclePolicies: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/v1/cycle-policies", async (req: express.Request, res: express.Response) => {
  const { contractProgramId, cadence, targetQuantity, generationMode } = req.body;

  if (!contractProgramId || !cadence || !generationMode) {
    return res.status(400).json({ error: "Required fields: contractProgramId, cadence, generationMode" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO cycle_policies (contract_program_id, cadence, target_quantity, generation_mode, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *",
      [contractProgramId, cadence, targetQuantity || null, generationMode]
    );
    res.status(201).json({ cyclePolicy: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

// Project management
app.get("/api/v1/projects", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM projects WHERE is_active = true ORDER BY created_at DESC");
    res.json({ projects: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/v1/projects/:id", async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query("SELECT * FROM projects WHERE id = $1::uuid AND is_active = true", [BigInt(Number(id))]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ project: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/v1/projects", async (req: express.Request, res: express.Response) => {
  const { contractProgramId, name, description, status, settlementUnit, targetQuantity } = req.body;

  if (!contractProgramId || !name || !settlementUnit || !targetQuantity) {
    return res.status(400).json({ error: "Required fields: contractProgramId, name, settlementUnit, targetQuantity" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO projects (contract_program_id, name, description, status, settlement_unit, target_quantity, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, now(), now()) RETURNING *",
      [contractProgramId, name, description || null, status || "draft", settlementUnit, targetQuantity]
    );
    res.status(201).json({ project: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Truck tracking endpoints
app.post("/api/v1/truck-trips", async (req: express.Request, res: express.Response) => {
  const { projectId, pksSiteId, transporter, driverName, plateNumber, origin, destination, quantity, departureTime } = req.body;

  if (!projectId || !plateNumber || !departureTime) {
    return res.status(400).json({ error: "Required fields: projectId, plateNumber, departureTime" });
  }

  try {
    const tripId = `TRIP-${Date.now()}`;
    const { rows } = await db.query(
      "INSERT INTO truck_trips (project_id, trip_id, pks_site_id, transporter, driver_name, plate_number, origin, destination, quantity, departure_time, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', now(), now()) RETURNING *",
      [projectId, tripId, pksSiteId || null, transporter || null, driverName || null, plateNumber, origin || null, destination || null, quantity || null, departureTime]
    );
    res.status(201).json({ truckTrip: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/v1/truck-trips", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM truck_trips ORDER BY departure_time DESC");
    res.json({ truckTrips: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Tracking events endpoints
app.post("/api/v1/tracking-events", async (req: express.Request, res: express.Response) => {
  const { truckTripId, eventType, latitude, longitude, accuracy, description, checkerId, evidenceUrl } = req.body;

  if (!truckTripId || !eventType) {
    return res.status(400).json({ error: "Required fields: truckTripId, eventType" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO tracking_events (truck_trip_id, event_type, description, latitude, longitude, accuracy, server_timestamp, checker_id, evidence_url, notes) VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9) RETURNING *",
      [truckTripId, eventType, description || null, latitude || null, longitude || null, accuracy || null, checkerId || null, evidenceUrl || null]
    );
    res.status(201).json({ trackingEvent: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/v1/tracking-events", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM tracking_events ORDER BY server_timestamp DESC");
    res.json({ trackingEvents: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Financial Engine endpoints

// RAB management
app.get("/api/v1/rab", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM rab WHERE is_active = true ORDER BY created_at DESC");
    res.json({ rab: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/v1/rab", async (req: express.Request, res: express.Response) => {
  const { projectId, description, amount, category } = req.body;

  if (!projectId || !description || !amount) {
    return res.status(400).json({ error: "Required fields: projectId, description, amount" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO rab (project_id, description, amount, category, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *",
      [projectId, description, amount, category || "fixed"]
    );
    res.status(201).json({ rab: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// FX rates management
app.get("/api/v1/fx-rates", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM fx_rates WHERE is_active = true ORDER BY effective_date DESC");
    res.json({ fxRates: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/v1/fx-rates", async (req: express.Request, res: express.Response) => {
  const { fromCurrency, toCurrency, rate, rateType, source, effectiveDate } = req.body;

  if (!fromCurrency || !toCurrency || !rate) {
    return res.status(400).json({ error: "Required fields: fromCurrency, toCurrency, rate" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO fx_rates (from_currency, to_currency, rate, rate_type, source, effective_date, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, now(), now()) RETURNING *",
      [fromCurrency, toCurrency, rate, rateType || "reference", source || null, effectiveDate || null]
    );
    res.status(201).json({ fxRate: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

// FX exposure management
app.get("/api/v1/fx-exposure", async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM fx_exposure ORDER BY created_at DESC");
    res.json({ fxExposure: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/v1/fx-exposure", async (req: express.Request, res: express.Response) => {
  const { projectId, amountIdr, amountFx, fxRate, exposureType } = req.body;

  if (!projectId || !amountIdr) {
    return res.status(400).json({ error: "Required fields: projectId, amountIdr" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO fx_exposure (project_id, amount_idr, amount_fx, fx_rate, exposure_type, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'open', now(), now()) RETURNING *",
      [projectId, amountIdr, amountFx || null, fxRate || null, exposureType || "open"]
    );
    res.status(201).json({ fxExposure: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
  } catch (err) {
    logger.error("Error closing database pool:", err);
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received. Shutting down gracefully...");
  try {
    await pool.end();
    logger.info("Database pool closed");
  } catch (err) {
    logger.error("Error closing database pool:", err);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info(`PKE Export Platform API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`Timestamp: ${new Date().toISOString()}`);
});

// ============================================
// Phase 5: Export Compliance Endpoints
// ============================================

// Regulatory knowledge base - Admin only
app.get("/api/v1/regulatory-knowledge", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    // In production, this would query a regulatory knowledge base
    const knowledge = [
      { country: "China", requirements: "Import permit, phytoosanitary certificate, FDA registration", status: "active" },
      { country: "Pakistan", requirements: "No objection certificate, quality certificate, weight certificate", status: "active" },
      { country: "Indonesia", requirements: "Import license, health certificate, packing list", status: "pending" }
    ];
    res.json({ regulatoryKnowledge: knowledge });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Document registry - Admin only
app.post("/api/v1/documents", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { documentType, documentName, description, relatedEntityId, relatedEntityType, expiryDate } = req.body;

  if (!documentType || !documentName) {
    return res.status(400).json({ error: "Required fields: documentType, documentName" });
  }

  try {
    const { rows } = await db.query(
      "INSERT INTO document_registry (document_type, document_name, description, related_entity_id, related_entity_type, expiry_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING *",
      [documentType, documentName, description || null, relatedEntityId || null, relatedEntityType || null, expiryDate || null]
    );
    res.status(201).json({ document: rows[0] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/v1/documents", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { rows } = await db.query("SELECT * FROM document_registry ORDER BY created_at DESC");
    res.json({ documents: rows });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Compliance engine - Admin only
app.post("/api/v1/compliance-check", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { entityType, entityId, targetCountry, checkType } = req.body;

  if (!entityType || !entityId || !targetCountry || !checkType) {
    return res.status(400).json({ error: "Required fields: entityType, entityId, targetCountry, checkType" });
  }

  try {
    // In production, this would run compliance checks against regulatory knowledge base
    const complianceResult = {
      entityType,
      entityId,
      targetCountry,
      checkType,
      compliant: Math.random() > 0.3, // Placeholder: would be based on actual rules
      issues: checkType === "import" && Math.random() > 0.7 ? ["Missing phytoosanitary certificate"] : [],
      status: "passed",
      checkedAt: new Date().toISOString()
    };
    res.json({ complianceResult });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Country pack requirements - Admin only
app.get("/api/v1/country-packs", requireAuth, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    // Placeholder country pack data
    const countryPacks = [
      { country: "China", packName: "China PKE Standard", requirements: ["Import permit", "Phytoosanitary certificate", "FDA registration"], taxRate: 0.13 },
      { country: "Pakistan", packName: "Pakistan PKE Standard", requirements: ["NOC", "Quality certificate", "Weight certificate"], taxRate: 0.08 },
      { country: "Indonesia", packName: "Indonesia PKE Standard", requirements: ["Import license", "Health certificate", "Packing list"], taxRate: 0.10 }
    ];
    res.json({ countryPacks });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================
// Graceful shutdown
// ============================================
process.on("SIGTERM", async () => {