# SPRINT 02A NEON SETUP DOCUMENTATION
# PKE Export Platform v4.2.2 - Operational Workflow, Inventory & Truck Checkpoint Tracking

## 1. Project Selection and Region

- **Project Status**: Use existing Neon project from Sprint 01C
- **Region**: Asia Pacific Singapore (`aws-ap-southeast-1`) - confirmed supported for Object Storage
- **Branch**: Create `sprint02a` branch from `main` for staging migrations and tests
- **Database**: Use the `neon` database on the sprint02a branch

## 2. Database Resources

### 2.1 Required Tables and Extensions (from existing migrations)

Ensure these migrations are applied:
- `001_initial_schema.sql` - Core application foundation
- `002_phase2_business_foundations.sql` - Business foundation tables
- `003_rls_policies.sql` - Row Level Security policies

### 2.2 Additional Tables for Sprint 02A

New tables need to be created via SQL in Neon SQL Editor. (See Section 3 for full SQL).

## 3. Neon Role Configuration

### 3.1 Runtime Role (`app_runtime`)

- **Purpose**: Used by the application for all database operations
- **Privileges**: least privilege - only SELECT, INSERT, UPDATE on operational tables
- **RLS**: Must have RLS enabled and respect `app.current_user_id`, `app.current_role`, `app.current_project_id` session settings
- **Must NOT**: Have `bypass_rls` or `neon_superuser` privileges

### 3.2 Migration Role (`app_migration`)

- **Purpose**: Used for running database migrations
- **Privileges**: CREATE, ALTER, DROP on staging branch
- **Connection**: Use direct connection (not `-pooler` suffix) for migration operations

## 4. Environment Variables

The following environment variables must be configured in `.env`:

```
DATABASE_URL=postgres://user:password@db.free-tier-project.neon.tech:5432/neon?connection_timeout=60
DATABASE_URL_MIGRATION=postgres://user:password@db.free-tier-project.neon.tech:5432/neon
STORAGE_BUCKET_NAME=pke-operational-sprint02a
NODE_ENV=development
APP_URL=http://localhost:3000
SESSION_SECRET=change-this-in-production
```

## 5. Migration and Smoke Test Commands

### 5.1 Run Migrations

```bash
npx drizzle-kit generate --schema="./src/schema.ts"
npx drizzle-kit push --env=local
```

### 5.2 Smoke Test

```bash
npm run dev
curl http://localhost:3000/api/v1/health
```