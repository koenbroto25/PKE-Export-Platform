import dotenv from "dotenv";
import pg from "pg";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

dotenv.config({ path: ".env.migrate" });
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL is not set in .env.migrate.");
  process.exit(1);
}

const dbRole = decodeURIComponent(new URL(connectionString).username);
if (dbRole !== "neondb_owner") {
  console.error("Bootstrap must run with the neondb_owner maintenance connection.");
  process.exit(1);
}

const rl = readline.createInterface({ input, output });
try {
  const email = (process.env.PKE_ADMIN_EMAIL || await rl.question("Verified Neon Auth admin email: ")).trim();
  const confirmation = (process.env.PKE_BOOTSTRAP_CONFIRM || await rl.question("Type BOOTSTRAP-FIRST-ADMIN to continue: ")).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || confirmation !== "BOOTSTRAP-FIRST-ADMIN") {
    throw new Error("Email or confirmation is invalid.");
  }

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    const authUser = await client.query(
      `SELECT id, email, name, "emailVerified" AS email_verified
         FROM neon_auth."user"
        WHERE lower(email) = lower($1)
        FOR UPDATE`,
      [email],
    );
    if (authUser.rows.length !== 1 || authUser.rows[0].email_verified !== true) {
      throw new Error("Exactly one Neon Auth identity with a verified email is required.");
    }

    const authUserId = authUser.rows[0].id;
    const adminCount = await client.query(
      `SELECT count(*)::int AS count FROM public.users WHERE role = 'admin' AND is_active = true`,
    );
    const existingMapping = await client.query(
      `SELECT id FROM public.users WHERE neon_auth_user_id = $1::uuid`,
      [authUserId],
    );
    if (existingMapping.rows.length > 0) {
      const alreadyAdmin = await client.query(
        `SELECT id FROM public.users WHERE neon_auth_user_id = $1::uuid AND role = 'admin' AND is_active = true`,
        [authUserId],
      );
      if (alreadyAdmin.rows.length !== 1) throw new Error("This Auth identity is already mapped but is not the active bootstrap admin.");
      await client.query("COMMIT");
      console.log("PASS: this verified Neon Auth identity is already mapped as the active PKE Platform Admin.");
      process.exitCode = 0;
    } else {
    if (adminCount.rows[0].count !== 0) {
      throw new Error("An active PKE Platform Admin already exists. Bootstrap is allowed only once.");
    }

    const pkeUser = await client.query(
      `SELECT id FROM public.users WHERE lower(email) = lower($1) FOR UPDATE`,
      [email],
    );
    if (pkeUser.rows.length === 1) {
      await client.query(
        `UPDATE public.users
            SET neon_auth_user_id = $1::uuid,
                role = 'admin',
                is_active = true,
                updated_at = now()
          WHERE id = $2::uuid`,
        [authUserId, pkeUser.rows[0].id],
      );
    } else if (pkeUser.rows.length === 0) {
      await client.query(
        `INSERT INTO public.users (email, name, role, is_active, neon_auth_user_id, created_at, updated_at)
         VALUES ($1, $2, 'admin', true, $3::uuid, now(), now())`,
        [email, authUser.rows[0].name || null, authUserId],
      );
    } else {
      throw new Error("More than one PKE user matches this email; manual review required.");
    }

    const verify = await client.query(
      `SELECT count(*)::int AS count
         FROM public.users
        WHERE lower(email) = lower($1)
          AND neon_auth_user_id = $2::uuid
          AND role = 'admin'
          AND is_active = true`,
      [email, authUserId],
    );
    if (verify.rows[0].count !== 1) throw new Error("The PKE admin identity mapping did not verify.");
    await client.query("COMMIT");
    console.log("PASS: the verified Neon Auth identity is now linked to the first PKE Platform Admin.");
    console.log("No password was copied into public.users; Neon Auth remains the password authority.");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(`BOOTSTRAP FAILED: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
