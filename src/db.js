import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = connectionString;
export const db = drizzle(client, { schema });