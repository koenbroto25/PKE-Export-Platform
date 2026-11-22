-- P17-A: fail-closed maritime source governance and auditable ingestion foundation.
-- UAT-only rollout. Provider credentials are external secret references; never store secret values here.
CREATE TABLE public.maritime_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code text NOT NULL UNIQUE CHECK (source_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  provider_name text NOT NULL CHECK (length(btrim(provider_name)) BETWEEN 2 AND 160),
  source_class text NOT NULL CHECK (source_class IN ('port_master','marine_weather','ais','port_geometry','navigation_notice','other')),
  dataset_code text NOT NULL CHECK (dataset_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  endpoint_url text,
  terms_url text,
  license_code text,
  access_method text NOT NULL DEFAULT 'manual' CHECK (access_method IN ('manual','https_api','file_download','webhook')),
  credential_secret_ref text,
  rights_status text NOT NULL DEFAULT 'pending_review' CHECK (rights_status IN ('pending_review','approved','restricted','suspended','revoked','expired')),
  commercial_use_allowed boolean,
  internal_processing_allowed boolean,
  customer_display_allowed boolean,
  redistribution_allowed boolean,
  derivative_use_allowed boolean,
  caching_allowed boolean,
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 0 AND 3650),
  attribution_text text,
  rights_evidence_url text,
  rights_reviewed_by uuid REFERENCES public.users(id),
  rights_reviewed_at timestamptz,
  rights_expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  quota_limit integer CHECK (quota_limit IS NULL OR quota_limit > 0),
  quota_window_seconds integer CHECK (quota_window_seconds IS NULL OR quota_window_seconds > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maritime_source_enable_requires_approved_rights CHECK (
    NOT enabled OR (
      rights_status='approved'
      AND internal_processing_allowed IS TRUE
            AND rights_reviewed_by IS NOT NULL
      AND rights_reviewed_at IS NOT NULL
      AND rights_expires_at IS NOT NULL
      AND rights_expires_at > rights_reviewed_at
      AND NULLIF(btrim(terms_url),'') IS NOT NULL
      AND NULLIF(btrim(rights_evidence_url),'') IS NOT NULL
      AND NULLIF(btrim(attribution_text),'') IS NOT NULL
    )
  )
);

CREATE TABLE public.maritime_source_field_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.maritime_data_sources(id) ON DELETE CASCADE,
  field_code text NOT NULL CHECK (field_code ~ '^[a-z][a-z0-9_]{1,95}$'),
  purpose_code text NOT NULL CHECK (purpose_code IN ('internal_operations','customer_display','analytics','redistribution','derived_product')),
  allowed boolean NOT NULL DEFAULT false,
  evidence_reference text,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,field_code,purpose_code),
  CHECK (NOT allowed OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND NULLIF(btrim(evidence_reference),'') IS NOT NULL))
);

CREATE TABLE public.maritime_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.maritime_data_sources(id),
  dataset_code text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  run_status text NOT NULL DEFAULT 'queued' CHECK (run_status IN ('queued','running','succeeded','partial','failed','blocked_rights','blocked_quota','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  records_seen integer NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
  records_staged integer NOT NULL DEFAULT 0 CHECK (records_staged >= 0),
  records_rejected integer NOT NULL DEFAULT 0 CHECK (records_rejected >= 0),
  source_cursor text,
  payload_sha256 text CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
  error_code text,
  error_summary text,
  triggered_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,idempotency_key),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE public.maritime_ingestion_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.maritime_ingestion_runs(id) ON DELETE CASCADE,
  external_record_id text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('port','port_geometry','marine_forecast','marine_warning','vessel_identity','vessel_position','navigation_notice','other')),
  raw_payload jsonb NOT NULL CHECK (jsonb_typeof(raw_payload) IN ('object','array')),
  normalized_payload jsonb CHECK (normalized_payload IS NULL OR jsonb_typeof(normalized_payload)='object'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected','quarantined')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors)='array'),
  retention_until timestamptz,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,external_record_id,payload_sha256),
  CHECK ((review_status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (review_status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE public.maritime_provider_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.maritime_data_sources(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  quota_limit integer CHECK (quota_limit IS NULL OR quota_limit > 0),
  last_request_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,window_started_at,window_seconds)
);

CREATE TABLE public.maritime_provider_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.maritime_data_sources(id) ON DELETE CASCADE,
  health_status text NOT NULL CHECK (health_status IN ('unknown','healthy','degraded','unavailable','quota_exhausted','rights_blocked')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  error_code text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  checked_by uuid REFERENCES public.users(id)
);

CREATE INDEX maritime_ingestion_runs_source_created_idx ON public.maritime_ingestion_runs(source_id,created_at DESC);
CREATE INDEX maritime_ingestion_staging_review_idx ON public.maritime_ingestion_staging(run_id,review_status,created_at);
CREATE INDEX maritime_provider_health_source_checked_idx ON public.maritime_provider_health(source_id,checked_at DESC);
CREATE INDEX maritime_provider_usage_source_window_idx ON public.maritime_provider_usage(source_id,window_started_at DESC);

ALTER TABLE public.maritime_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maritime_source_field_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maritime_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maritime_ingestion_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maritime_provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maritime_provider_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY maritime_sources_admin_all ON public.maritime_data_sources TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY maritime_field_permissions_admin_all ON public.maritime_source_field_permissions TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY maritime_ingestion_runs_admin_all ON public.maritime_ingestion_runs TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY maritime_ingestion_staging_admin_all ON public.maritime_ingestion_staging TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY maritime_provider_usage_admin_all ON public.maritime_provider_usage TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY maritime_provider_health_admin_all ON public.maritime_provider_health TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());

REVOKE ALL ON public.maritime_data_sources,public.maritime_source_field_permissions,public.maritime_ingestion_runs,
  public.maritime_ingestion_staging,public.maritime_provider_usage,public.maritime_provider_health FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.maritime_data_sources,public.maritime_source_field_permissions,
  public.maritime_ingestion_runs,public.maritime_ingestion_staging,public.maritime_provider_usage,
  public.maritime_provider_health TO app_runtime_secure;
