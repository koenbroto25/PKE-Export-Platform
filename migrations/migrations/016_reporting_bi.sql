-- Migration 016: Reporting, BI, notifications, and durable scheduler support
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  audience TEXT NOT NULL,
  recipient_user_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  frequency TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  execution_time TIME NOT NULL DEFAULT '06:00:00',
  cutoff_policy TEXT NOT NULL DEFAULT 'previous_day',
  channel TEXT NOT NULL DEFAULT 'in_app',
  approval_required BOOLEAN NOT NULL DEFAULT false,
  last_execution_at TIMESTAMPTZ,
  next_execution_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES report_schedules(id),
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID REFERENCES users(id),
  audience TEXT,
  project_id UUID REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'completed',
  idempotency_key TEXT UNIQUE,
  file_reference TEXT,
  data_freshness TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL,
  channel TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_export_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  export_type TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
