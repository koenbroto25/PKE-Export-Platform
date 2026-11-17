-- CATALOG-BASED RECOVERY SNAPSHOT: HISTORICAL MIGRATIONS 029-035
-- Source: legacy child br-calm-glade-b3nrleet; baseline: parent br-gentle-thunder-b3z7y3bk
-- CUMULATIVE parent-to-child delta, NOT byte-identical original migration files.
-- REVIEW/EVIDENCE ONLY. NOT SAFE FOR DIRECT EXECUTION OR PRODUCTION REPLAY.
-- Generated from pg_catalog and information_schema on 2026-11-17.

-- TABLE public.project_module_configuration_versions
CREATE TABLE public.project_module_configuration_versions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "configuration_version" integer NOT NULL DEFAULT 1,
  "schema_version" integer NOT NULL DEFAULT 1,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "activated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "project_id" uuid NOT NULL,
  "change_reason" text,
  "activated_by" uuid
);
-- TABLE public.fiscal_periods
CREATE TABLE public.fiscal_periods (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'open'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid,
  "closed_at" timestamp with time zone,
  "closed_by" uuid,
  "period_end" date NOT NULL,
  "period_start" date NOT NULL,
  "code" text NOT NULL
);
-- TABLE public.outbox_events
CREATE TABLE public.outbox_events (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "available_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payload" jsonb NOT NULL,
  "locked_at" timestamp with time zone,
  "aggregate_id" uuid NOT NULL,
  "aggregate_type" text NOT NULL,
  "project_id" uuid,
  "last_error" text,
  "processed_at" timestamp with time zone,
  "event_type" text NOT NULL
);
-- TABLE public.idempotency_keys
CREATE TABLE public.idempotency_keys (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "state" text NOT NULL DEFAULT 'processing'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "request_hash" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "scope" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "idempotency_key" text NOT NULL,
  "completed_at" timestamp with time zone,
  "response_body" jsonb,
  "response_status" integer
);
-- TABLE public.partner_organizations
CREATE TABLE public.partner_organizations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "verification_status" text NOT NULL DEFAULT 'unverified'::text,
  "source_type" text NOT NULL DEFAULT 'manual'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "registered_address" jsonb,
  "trading_name" text,
  "verified_by" uuid,
  "organization_type" text NOT NULL,
  "created_by" uuid,
  "country_code" character(2) NOT NULL,
  "phone" text,
  "legal_name" text NOT NULL,
  "email" text,
  "registration_number" text,
  "registration_type" text,
  "tax_id_ciphertext" text,
  "verified_at" timestamp with time zone,
  "website" text,
  "source_reference" text
);
-- TABLE public.facility_contacts
CREATE TABLE public.facility_contacts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "is_primary" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "email" text,
  "facility_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid,
  "role" text NOT NULL,
  "phone" text
);
-- TABLE public.facility_capacity_records
CREATE TABLE public.facility_capacity_records (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "verified_by" uuid,
  "verified_at" timestamp with time zone,
  "facility_id" uuid NOT NULL,
  "capacity_value" numeric(20,6) NOT NULL,
  "process_type" text NOT NULL,
  "effective_to" date,
  "capacity_kind" text NOT NULL,
  "source_reference" text,
  "unit_code" text NOT NULL,
  "effective_from" date NOT NULL,
  "period_type" text NOT NULL
);
-- TABLE public.facility_products
CREATE TABLE public.facility_products (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "capability_status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "capacity_record_id" uuid,
  "evidence_object_key" text,
  "verified_at" timestamp with time zone,
  "product_variant_id" uuid,
  "verified_by" uuid,
  "product_id" uuid NOT NULL,
  "process_type" text NOT NULL,
  "facility_id" uuid NOT NULL
);
-- TABLE public.facility_operating_periods
CREATE TABLE public.facility_operating_periods (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "timezone" text NOT NULL DEFAULT 'Asia/Makassar'::text,
  "is_operational" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "shutdown_reason" text,
  "weekday" smallint,
  "opens_at" time without time zone,
  "facility_id" uuid NOT NULL,
  "closes_at" time without time zone,
  "effective_to" date,
  "effective_from" date
);
-- TABLE public.product_attributes
CREATE TABLE public.product_attributes (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "comparison_basis" text,
  "dimension" text,
  "name" text NOT NULL,
  "data_type" text NOT NULL,
  "unit_code" text,
  "attribute_code" text NOT NULL
);
-- TABLE public.shipment_events
CREATE TABLE public.shipment_events (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recorded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'manual'::text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "quantity_delta" numeric(20,6),
  "event_timestamp" timestamp with time zone NOT NULL,
  "actor_id" uuid,
  "event_type" text NOT NULL,
  "unit_code" text,
  "shipment_id" uuid NOT NULL,
  "reason" text,
  "idempotency_key" text,
  "status" text NOT NULL,
  "evidence_object_key" text,
  "project_id" uuid NOT NULL
);
-- TABLE public.product_hs_classifications
CREATE TABLE public.product_hs_classifications (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "review_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "valid_to" date,
  "goods_description" text NOT NULL,
  "classification_rationale" text,
  "nomenclature_version" text NOT NULL,
  "reviewer_id" uuid,
  "hs_code" text NOT NULL,
  "source_reference" text,
  "product_id" uuid NOT NULL,
  "country_code" character(2) NOT NULL,
  "valid_from" date NOT NULL,
  "product_variant_id" uuid,
  "reviewed_at" timestamp with time zone
);
-- TABLE public.buyer_facilities
CREATE TABLE public.buyer_facilities (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "facility_type" text NOT NULL DEFAULT 'receiving_plant'::text,
  "verification_status" text NOT NULL DEFAULT 'unverified'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "verified_by" uuid,
  "buyer_id" uuid NOT NULL,
  "verified_at" timestamp with time zone,
  "name" text NOT NULL,
  "organization_id" uuid,
  "longitude" numeric(10,6),
  "destination_port_id" uuid,
  "latitude" numeric(9,6),
  "address" jsonb,
  "country_code" character(2)
);
-- TABLE public.buyer_product_requirements
CREATE TABLE public.buyer_product_requirements (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "version_no" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "effective_from" date,
  "buyer_facility_id" uuid,
  "required_quantity" numeric(20,6),
  "delivery_window_start" date,
  "product_id" uuid NOT NULL,
  "reviewed_by" uuid,
  "packaging_mode" text,
  "product_variant_id" uuid,
  "destination_country" character(2),
  "created_by" uuid,
  "buyer_id" uuid NOT NULL,
  "mandatory_origin_country" character(2),
  "reviewed_at" timestamp with time zone,
  "product_specification_id" uuid,
  "quantity_unit" text,
  "effective_to" date,
  "delivery_window_end" date
);
-- TABLE public.buyer_requirement_attributes
CREATE TABLE public.buyer_requirement_attributes (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "is_mandatory" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "target_values" jsonb,
  "attribute_id" uuid NOT NULL,
  "operator" text NOT NULL,
  "target_numeric" numeric(20,8),
  "requirement_id" uuid NOT NULL,
  "measurement_basis" text,
  "max_numeric" numeric(20,8),
  "min_numeric" numeric(20,8),
  "target_text" text,
  "unit_code" text
);
-- TABLE public.buyer_demand_forecasts
CREATE TABLE public.buyer_demand_forecasts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_type" text NOT NULL DEFAULT 'manual'::text,
  "is_committed_order" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "product_id" uuid NOT NULL,
  "confidence" numeric(5,4),
  "buyer_facility_id" uuid,
  "forecast_period" date NOT NULL,
  "created_by" uuid,
  "buyer_id" uuid NOT NULL,
  "source_reference" text,
  "unit_code" text NOT NULL,
  "currency_id" uuid,
  "quantity" numeric(20,6) NOT NULL
);
-- TABLE public.production_batches
CREATE TABLE public.production_batches (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "quality_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid,
  "unit_code" text NOT NULL,
  "production_started_at" timestamp with time zone,
  "batch_code" text NOT NULL,
  "production_ended_at" timestamp with time zone,
  "product_variant_id" uuid,
  "process_line" text,
  "facility_id" uuid NOT NULL,
  "shift_code" text,
  "source_reference" text,
  "project_id" uuid,
  "quantity" numeric(20,6) NOT NULL,
  "product_id" uuid NOT NULL
);
-- TABLE public.regulatory_rules
CREATE TABLE public.regulatory_rules (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "jurisdiction" text NOT NULL,
  "title" text NOT NULL,
  "created_by" uuid,
  "subject_type" text NOT NULL,
  "reviewed_at" timestamp with time zone,
  "rule_code" text NOT NULL,
  "active_version_id" uuid,
  "reviewed_by" uuid
);
-- TABLE public.loading_tickets
CREATE TABLE public.loading_tickets (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "unit_code" text NOT NULL,
  "ticket_type" text NOT NULL,
  "quantity" numeric(20,6) NOT NULL,
  "equipment_id" uuid,
  "lot_id" uuid,
  "measured_at" timestamp with time zone NOT NULL,
  "verified_at" timestamp with time zone,
  "loading_operation_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "sha256_checksum" text,
  "object_key" text,
  "ticket_number" text NOT NULL,
  "verified_by" uuid
);
-- TABLE public.regulatory_rule_versions
CREATE TABLE public.regulatory_rule_versions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "condition_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "version_number" integer NOT NULL,
  "regulatory_source_id" uuid NOT NULL,
  "approved_at" timestamp with time zone,
  "rule_id" uuid NOT NULL,
  "effective_from" date NOT NULL,
  "risk_category" text,
  "source_locator" text,
  "effective_to" date,
  "source_url_snapshot" text,
  "rule_summary" text NOT NULL,
  "source_checksum" text,
  "outcome" text NOT NULL,
  "approved_by" uuid
);
-- TABLE public.loading_segments
CREATE TABLE public.loading_segments (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "quantity" numeric(20,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'planned'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ended_at" timestamp with time zone,
  "loading_method" text NOT NULL,
  "equipment_id" uuid,
  "container_number" text,
  "hold_number" text,
  "project_id" uuid NOT NULL,
  "unit_code" text NOT NULL,
  "segment_code" text NOT NULL,
  "started_at" timestamp with time zone,
  "loading_operation_id" uuid NOT NULL
);
-- TABLE public.shipment_document_links
CREATE TABLE public.shipment_document_links (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "visibility_status" text NOT NULL DEFAULT 'internal'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid,
  "project_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "shipment_id" uuid NOT NULL
);
-- TABLE public.inventory_reservations
CREATE TABLE public.inventory_reservations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "reserved_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "fulfilled_quantity" numeric NOT NULL DEFAULT 0,
  "buyer_id" uuid,
  "idempotency_key" text NOT NULL,
  "lot_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "released_by" uuid,
  "released_at" timestamp with time zone,
  "shipment_id" uuid,
  "created_by" uuid NOT NULL,
  "reserved_quantity" numeric(20,6) NOT NULL,
  "unit_code" text NOT NULL,
  "expires_at" timestamp with time zone
);
-- TABLE public.inventory_holds
CREATE TABLE public.inventory_holds (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "placed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "quantity" numeric(20,6) NOT NULL,
  "release_reason" text,
  "project_id" uuid NOT NULL,
  "released_at" timestamp with time zone,
  "released_by" uuid,
  "placed_by" uuid NOT NULL,
  "lot_id" uuid NOT NULL,
  "hold_type" text NOT NULL,
  "reason" text NOT NULL,
  "unit_code" text NOT NULL
);
-- TABLE public.inventory_reconciliations
CREATE TABLE public.inventory_reconciliations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "variance_quantity" numeric(20,6) GENERATED ALWAYS AS ((counted_quantity - book_quantity)) STORED,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone,
  "project_id" uuid NOT NULL,
  "reviewed_by" uuid,
  "book_quantity" numeric(20,6) NOT NULL,
  "warehouse_id" uuid,
  "counted_at" timestamp with time zone NOT NULL,
  "lot_id" uuid NOT NULL,
  "reason" text,
  "counted_by" uuid NOT NULL,
  "evidence_object_key" text,
  "unit_code" text NOT NULL,
  "counted_quantity" numeric(20,6) NOT NULL
);
-- TABLE public.matching_candidates
CREATE TABLE public.matching_candidates (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "hard_filter_failures" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "score_explanation" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "data_freshness" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "review_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "fit_score" numeric(7,4),
  "lot_id" uuid,
  "logistics_score" numeric(7,4),
  "supplier_reliability_score" numeric(7,4),
  "matching_run_id" uuid NOT NULL,
  "facility_id" uuid,
  "estimated_fulfillable_quantity" numeric(20,6),
  "quality_score" numeric(7,4),
  "product_variant_id" uuid,
  "unit_code" text,
  "availability_score" numeric(7,4),
  "hard_filter_pass" boolean NOT NULL,
  "similarity_score" numeric(7,4)
);
-- TABLE public.payment_instructions
CREATE TABLE public.payment_instructions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "instruction_status" text NOT NULL DEFAULT 'draft'::text,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payment_method_id" uuid,
  "project_id" uuid NOT NULL,
  "approved_at" timestamp with time zone,
  "returned_by" uuid,
  "acknowledged_at" timestamp with time zone,
  "payment_obligation_id" uuid,
  "notes" text,
  "approved_by" uuid,
  "cash_advance_id" uuid,
  "external_reference" text,
  "instruction_number" text NOT NULL,
  "requested_by" uuid NOT NULL,
  "amount" numeric(20,4) NOT NULL,
  "returned_at" timestamp with time zone,
  "payee_name" text NOT NULL,
  "currency_id" uuid NOT NULL,
  "return_reason" text,
  "acknowledged_by" uuid,
  "external_execution_date" timestamp with time zone
);
-- TABLE public.matching_runs
CREATE TABLE public.matching_runs (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'queued'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "generated_by" uuid,
  "buyer_id" uuid NOT NULL,
  "project_id" uuid,
  "requirement_id" uuid NOT NULL,
  "algorithm_version" text NOT NULL,
  "input_snapshot" jsonb NOT NULL,
  "generated_at" timestamp with time zone,
  "error_message" text
);
-- TABLE public.payment_instruction_approvals
CREATE TABLE public.payment_instruction_approvals (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "decided_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payment_instruction_id" uuid NOT NULL,
  "reason" text,
  "approver_id" uuid NOT NULL,
  "decision" text NOT NULL
);
-- TABLE public.payment_verifications
CREATE TABLE public.payment_verifications (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "verified_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payment_instruction_id" uuid NOT NULL,
  "verified_amount" numeric(20,4),
  "verification_status" text NOT NULL,
  "evidence_id" uuid NOT NULL,
  "notes" text,
  "verified_by" uuid NOT NULL,
  "verified_currency_id" uuid,
  "verified_execution_date" date
);
-- TABLE public.payment_reconciliations
CREATE TABLE public.payment_reconciliations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "reconciliation_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "currency_id" uuid NOT NULL,
  "reconciled_amount" numeric(20,4) NOT NULL,
  "reconciled_at" timestamp with time zone,
  "reconciled_by" uuid,
  "payment_instruction_id" uuid NOT NULL,
  "verification_id" uuid NOT NULL,
  "journal_entry_id" uuid,
  "project_id" uuid NOT NULL,
  "exception_reason" text
);
-- TABLE public.payment_evidence
CREATE TABLE public.payment_evidence (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "object_bucket" text NOT NULL DEFAULT 'pke-private-documents'::text,
  "uploaded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'submitted'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "rejection_reason" text,
  "mime_type" text NOT NULL,
  "sha256_checksum" text NOT NULL,
  "file_size_bytes" bigint NOT NULL,
  "payment_instruction_id" uuid NOT NULL,
  "supersedes_evidence_id" uuid,
  "original_filename" text NOT NULL,
  "reviewed_by" uuid,
  "uploaded_by" uuid NOT NULL,
  "reviewed_at" timestamp with time zone,
  "object_key" text NOT NULL
);
-- TABLE public.port_terminals
CREATE TABLE public.port_terminals (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "cargo_types" text[] NOT NULL DEFAULT '{}'::text[],
  "status" text NOT NULL DEFAULT 'unverified'::text,
  "operating_restrictions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "terminal_code" text NOT NULL,
  "source_reference" text,
  "name" text NOT NULL,
  "port_id" uuid NOT NULL,
  "operator_organization_id" uuid,
  "verified_at" timestamp with time zone
);
-- TABLE public.port_berths
CREATE TABLE public.port_berths (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'unverified'::text,
  "restrictions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "max_loa_m" numeric(12,3),
  "max_beam_m" numeric(12,3),
  "depth_datum" text,
  "declared_depth_m" numeric(12,3),
  "terminal_id" uuid NOT NULL,
  "length_m" numeric(12,3),
  "source_reference" text,
  "verified_at" timestamp with time zone,
  "berth_code" text NOT NULL,
  "max_operational_draft_m" numeric(12,3),
  "name" text
);
-- TABLE public.port_channels
CREATE TABLE public.port_channels (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "restrictions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "source_reference" text,
  "depth_datum" text NOT NULL,
  "declared_depth_m" numeric(12,3),
  "traffic_direction" text,
  "width_m" numeric(12,3),
  "survey_date" date,
  "verified_at" timestamp with time zone,
  "port_id" uuid NOT NULL,
  "channel_name" text NOT NULL,
  "length_m" numeric(14,3)
);
-- TABLE public.port_anchorages
CREATE TABLE public.port_anchorages (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "restrictions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "verified_at" timestamp with time zone,
  "latitude" numeric(9,6),
  "survey_date" date,
  "port_id" uuid NOT NULL,
  "source_reference" text,
  "name" text,
  "capacity_vessels" integer,
  "anchorage_code" text NOT NULL,
  "declared_depth_m" numeric(12,3),
  "depth_datum" text,
  "longitude" numeric(10,6)
);
-- TABLE public.port_depth_observations
CREATE TABLE public.port_depth_observations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "depth_unit" text NOT NULL DEFAULT 'm'::text,
  "quality_status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "channel_id" uuid,
  "source_authority" text NOT NULL,
  "evidence_object_key" text,
  "notes" text,
  "observed_at" timestamp with time zone NOT NULL,
  "port_id" uuid NOT NULL,
  "reviewed_at" timestamp with time zone,
  "survey_date" date NOT NULL,
  "berth_id" uuid,
  "valid_to" date,
  "survey_method" text,
  "terminal_id" uuid,
  "reviewer_id" uuid,
  "depth_datum" text NOT NULL,
  "depth_feature_type" text NOT NULL,
  "depth_value" numeric(12,4) NOT NULL,
  "anchorage_id" uuid
);
-- TABLE public.port_loading_services
CREATE TABLE public.port_loading_services (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "handling_mode" text NOT NULL,
  "rate_value" numeric(18,4),
  "cargo_type" text NOT NULL,
  "operating_window" jsonb,
  "berth_id" uuid,
  "terminal_id" uuid,
  "rate_unit" text,
  "service_type" text NOT NULL,
  "verified_at" timestamp with time zone,
  "port_id" uuid NOT NULL,
  "source_reference" text
);
-- TABLE public.port_equipment
CREATE TABLE public.port_equipment (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "condition_status" text NOT NULL DEFAULT 'unverified'::text,
  "availability" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "equipment_type" text NOT NULL,
  "port_id" uuid NOT NULL,
  "source_reference" text,
  "terminal_id" uuid,
  "berth_id" uuid,
  "last_verified_at" timestamp with time zone,
  "capacity_unit" text,
  "rated_capacity" numeric(20,4)
);
-- TABLE public.port_operating_limits
CREATE TABLE public.port_operating_limits (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "weather_limits" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "approval_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "cargo_type" text,
  "effective_to" date,
  "port_id" uuid NOT NULL,
  "verified_at" timestamp with time zone,
  "effective_from" date NOT NULL,
  "berth_id" uuid,
  "max_beam_m" numeric(12,3),
  "authority_name" text NOT NULL,
  "terminal_id" uuid,
  "source_reference" text NOT NULL,
  "min_ukc_m" numeric(12,3),
  "verified_by" uuid,
  "max_draft_m" numeric(12,3),
  "max_loa_m" numeric(12,3),
  "vessel_type" text
);
-- TABLE public.warehouse_zones
CREATE TABLE public.warehouse_zones (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "unit_code" text,
  "warehouse_id" uuid NOT NULL,
  "capacity" numeric(20,4),
  "zone_type" text NOT NULL,
  "zone_code" text NOT NULL
);
-- TABLE public.warehouse_bins
CREATE TABLE public.warehouse_bins (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "allowed_product_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "unit_code" text,
  "zone_id" uuid NOT NULL,
  "capacity" numeric(20,4),
  "bin_code" text NOT NULL
);
-- TABLE public.warehouse_reservations
CREATE TABLE public.warehouse_reservations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "project_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "zone_id" uuid,
  "bin_id" uuid,
  "window_end" timestamp with time zone NOT NULL,
  "reserved_quantity" numeric(20,6) NOT NULL,
  "lot_id" uuid,
  "unit_code" text NOT NULL
);
-- TABLE public.warehouse_equipment
CREATE TABLE public.warehouse_equipment (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "condition_status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "equipment_type" text NOT NULL,
  "source_reference" text,
  "asset_code" text,
  "warehouse_id" uuid NOT NULL,
  "rated_capacity" numeric(20,4),
  "capacity_unit" text,
  "verified_at" timestamp with time zone
);
-- TABLE public.vessel_identifiers
CREATE TABLE public.vessel_identifiers (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "verification_status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "identifier_value" text NOT NULL,
  "identifier_type" text NOT NULL,
  "valid_from" date,
  "vessel_id" uuid NOT NULL,
  "source_reference" text,
  "valid_to" date
);
-- TABLE public.vessel_certificates
CREATE TABLE public.vessel_certificates (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "verification_status" text NOT NULL DEFAULT 'unverified'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "issuer" text NOT NULL,
  "verified_at" timestamp with time zone,
  "vessel_id" uuid NOT NULL,
  "certificate_number" text NOT NULL,
  "certificate_type" text NOT NULL,
  "verified_by" uuid,
  "expires_at" date,
  "document_object_key" text,
  "issued_at" date
);
-- TABLE public.vessel_name_history
CREATE TABLE public.vessel_name_history (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "verified_by" uuid,
  "source_reference" text,
  "verified_at" timestamp with time zone,
  "vessel_name" text NOT NULL,
  "valid_from" date NOT NULL,
  "valid_to" date,
  "vessel_id" uuid NOT NULL
);
-- TABLE public.vessel_nominations
CREATE TABLE public.vessel_nominations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "nomination_status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "voyage_id" uuid,
  "shipment_id" uuid NOT NULL,
  "reviewed_at" timestamp with time zone,
  "vessel_id" uuid NOT NULL,
  "reason" text,
  "project_id" uuid NOT NULL,
  "nominated_by" uuid NOT NULL,
  "reviewed_by" uuid,
  "evidence_object_key" text
);
-- TABLE public.vessel_port_assessments
CREATE TABLE public.vessel_port_assessments (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_freshness" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "limitations" text[] NOT NULL DEFAULT '{}'::text[],
  "assessed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "port_id" uuid NOT NULL,
  "vessel_id" uuid NOT NULL,
  "reviewed_at" timestamp with time zone,
  "result" text NOT NULL,
  "assessed_by" uuid,
  "project_id" uuid NOT NULL,
  "reviewed_by" uuid,
  "terminal_id" uuid,
  "berth_id" uuid,
  "assessment_inputs" jsonb NOT NULL
);
-- TABLE public.vessel_tracking_positions
CREATE TABLE public.vessel_tracking_positions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "source_quality" text NOT NULL DEFAULT 'unknown'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "eta_provider" timestamp with time zone,
  "cog_degrees" numeric(7,3),
  "raw_payload_hash" text,
  "position_timestamp" timestamp with time zone NOT NULL,
  "longitude" numeric(10,6) NOT NULL,
  "reported_draught_m" numeric(8,3),
  "latitude" numeric(9,6) NOT NULL,
  "navigation_status" text,
  "vessel_id" uuid NOT NULL,
  "heading_degrees" numeric(7,3),
  "sog_knots" numeric(8,3),
  "provider_code" text NOT NULL,
  "destination_text" text,
  "provider_reference" text
);
-- TABLE public.vessel_port_calls
CREATE TABLE public.vessel_port_calls (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'planned'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "actual_at" timestamp with time zone,
  "event_type" text NOT NULL,
  "predicted_at" timestamp with time zone,
  "source_reference" text,
  "port_id" uuid NOT NULL,
  "voyage_id" uuid,
  "provider_code" text,
  "vessel_id" uuid NOT NULL,
  "terminal_id" uuid
);
-- TABLE public.regulatory_rule_documents
CREATE TABLE public.regulatory_rule_documents (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "condition_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "rule_version_id" uuid NOT NULL,
  "issuing_authority" text,
  "document_type_id" uuid NOT NULL,
  "requirement_kind" text NOT NULL,
  "holder_party" text,
  "validity_days" integer,
  "presentation_point" text
);
-- TABLE public.regulatory_assessment_results
CREATE TABLE public.regulatory_assessment_results (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "required_documents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "missing_documents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "evaluated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reason" text,
  "assessment_id" uuid NOT NULL,
  "reviewed_at" timestamp with time zone,
  "result_status" text NOT NULL,
  "rule_version_id" uuid NOT NULL,
  "reviewer_id" uuid
);
-- TABLE public.regulatory_rule_exceptions
CREATE TABLE public.regulatory_rule_exceptions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "evidence_object_key" text NOT NULL,
  "authority_reference" text NOT NULL,
  "reason" text NOT NULL,
  "valid_to" date,
  "decision_reason" text,
  "shipment_id" uuid,
  "valid_from" date NOT NULL,
  "project_id" uuid,
  "approved_at" timestamp with time zone,
  "requested_by" uuid NOT NULL,
  "rule_version_id" uuid NOT NULL,
  "approved_by" uuid,
  "authority_name" text NOT NULL
);
-- TABLE public.regulatory_assessments
CREATE TABLE public.regulatory_assessments (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "failed_count" integer NOT NULL DEFAULT 0,
  "pending_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_by" uuid,
  "ruleset_version_snapshot" jsonb NOT NULL,
  "destination_country" character(2),
  "assessment_date" date NOT NULL,
  "origin_country" character(2),
  "product_hs_classification_id" uuid,
  "overall_status" text NOT NULL,
  "project_id" uuid,
  "reviewed_at" timestamp with time zone,
  "product_id" uuid,
  "shipment_id" uuid,
  "assessed_by" uuid,
  "input_snapshot" jsonb NOT NULL
);
-- TABLE public.regulatory_rule_conditions
CREATE TABLE public.regulatory_rule_conditions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "is_mandatory" boolean NOT NULL DEFAULT true,
  "condition_group" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "operator" text NOT NULL,
  "field_path" text NOT NULL,
  "comparison_value" jsonb NOT NULL,
  "rule_version_id" uuid NOT NULL
);
-- TABLE public.knowledge_documents
CREATE TABLE public.knowledge_documents (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "access_rights" text NOT NULL DEFAULT 'unknown'::text,
  "status" text NOT NULL DEFAULT 'registered'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "current_version_id" uuid,
  "canonical_url" text,
  "owner_user_id" uuid,
  "jurisdiction" text,
  "document_type" text NOT NULL,
  "source_id" uuid,
  "title" text NOT NULL
);
-- TABLE public.knowledge_document_versions
CREATE TABLE public.knowledge_document_versions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "retrieved_at" timestamp with time zone NOT NULL DEFAULT now(),
  "extraction_status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "parser_version" text,
  "document_id" uuid NOT NULL,
  "source_url" text,
  "version_label" text NOT NULL,
  "reviewed_by" uuid,
  "effective_from" date,
  "object_key" text,
  "effective_to" date,
  "reviewed_at" timestamp with time zone,
  "source_checksum" text NOT NULL,
  "published_at" date,
  "language" text
);
-- TABLE public.knowledge_chunks
CREATE TABLE public.knowledge_chunks (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_locator" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(content, ''::text))) STORED,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "document_version_id" uuid NOT NULL,
  "content" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "content_hash" text NOT NULL,
  "page_number" integer,
  "section_heading" text
);
-- TABLE public.knowledge_ingestion_runs
CREATE TABLE public.knowledge_ingestion_runs (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'queued'::text,
  "chunk_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "error_message" text,
  "started_at" timestamp with time zone,
  "parser_version" text,
  "requested_by" uuid,
  "document_version_id" uuid NOT NULL
);
-- TABLE public.buyer_visibility_grants
CREATE TABLE public.buyer_visibility_grants (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "granted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  "project_id" uuid NOT NULL,
  "reason" text,
  "facility_id" uuid,
  "shipment_id" uuid,
  "buyer_id" uuid NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_by" uuid,
  "scope" text NOT NULL,
  "granted_by" uuid NOT NULL
);
-- TABLE public.facility_certifications
CREATE TABLE public.facility_certifications (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "certification_type" text NOT NULL,
  "certificate_number" text NOT NULL,
  "facility_id" uuid NOT NULL,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "issuer" text NOT NULL,
  "scope" text NOT NULL,
  "valid_to" date,
  "valid_from" date,
  "document_object_key" text
);
-- TABLE public.product_variants
CREATE TABLE public.product_variants (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "variant_code" text NOT NULL,
  "created_by" uuid,
  "variant_name" text NOT NULL,
  "product_id" uuid NOT NULL,
  "process_route" text,
  "physical_form" text,
  "description" text
);
-- TABLE public.product_quality_results
CREATE TABLE public.product_quality_results (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "review_status" text NOT NULL DEFAULT 'unreviewed'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "method_code" text NOT NULL,
  "reviewed_at" timestamp with time zone,
  "attribute_id" uuid NOT NULL,
  "result_numeric" numeric(20,8),
  "sample_id" uuid NOT NULL,
  "uncertainty" numeric(20,8),
  "result_text" text,
  "reviewed_by" uuid,
  "result_boolean" boolean,
  "measurement_basis" text,
  "unit_code" text,
  "detection_limit" numeric(20,8)
);
-- TABLE public.ai_action_requests
CREATE TABLE public.ai_action_requests (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_by" uuid,
  "proposed_change" jsonb NOT NULL,
  "target_id" uuid,
  "target_type" text NOT NULL,
  "application_reference" jsonb,
  "project_id" uuid,
  "applied_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "action_type" text NOT NULL,
  "requested_by" uuid NOT NULL,
  "reason" text,
  "ai_run_id" uuid
);
-- TABLE public.port_tide_observations
CREATE TABLE public.port_tide_observations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "is_forecast" boolean NOT NULL DEFAULT false,
  "quality_status" text NOT NULL DEFAULT 'unverified'::text,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "vertical_datum" text NOT NULL,
  "provider_code" text,
  "berth_id" uuid,
  "source_reference" text,
  "observed_at" timestamp with time zone NOT NULL,
  "port_id" uuid NOT NULL,
  "tide_height_m" numeric(10,4) NOT NULL
);
-- TABLE public.product_quality_samples
CREATE TABLE public.product_quality_samples (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'pending'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "project_id" uuid,
  "sample_location" text,
  "sample_number" text NOT NULL,
  "lab_report_object_key" text,
  "sample_type" text NOT NULL,
  "sample_condition" text,
  "laboratory_name" text,
  "lot_id" uuid,
  "sampled_at" timestamp with time zone NOT NULL,
  "sampling_method" text NOT NULL,
  "sampled_by" uuid NOT NULL,
  "seal_number" text
);
-- TABLE public.ai_source_citations
CREATE TABLE public.ai_source_citations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "citation_locator" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "regulatory_rule_version_id" uuid,
  "regulatory_source_id" uuid,
  "ai_run_id" uuid NOT NULL,
  "knowledge_chunk_id" uuid,
  "relevance_score" numeric(7,4),
  "excerpt" text
);
-- TABLE public.payment_invoice_allocations
CREATE TABLE public.payment_invoice_allocations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "allocation_status" text NOT NULL DEFAULT 'reserved'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ar_invoice_id" uuid,
  "ap_invoice_id" uuid,
  "payment_instruction_id" uuid NOT NULL,
  "allocated_amount" numeric(20,4) NOT NULL,
  "currency_id" uuid NOT NULL,
  "created_by" uuid NOT NULL
);
-- TABLE public.audit_events
CREATE TABLE public.audit_events (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_type" text NOT NULL DEFAULT 'user'::text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "outcome" text NOT NULL DEFAULT 'success'::text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "project_id" uuid,
  "after_snapshot" jsonb,
  "permission_code" text,
  "target_type" text NOT NULL,
  "action" text NOT NULL,
  "request_id" text,
  "actor_user_id" uuid,
  "source" text,
  "organization_id" uuid,
  "reason" text,
  "before_snapshot" jsonb,
  "target_id" uuid,
  "actor_role" text
);
-- TABLE public.ai_runs
CREATE TABLE public.ai_runs (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "input_scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "review_status" text NOT NULL DEFAULT 'not_required'::text,
  "token_usage" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "approved_by" uuid,
  "input_hash" text,
  "prompt_version" text NOT NULL,
  "model_version" text,
  "use_case" text NOT NULL,
  "started_at" timestamp with time zone,
  "model_name" text NOT NULL,
  "output_text" text,
  "output_hash" text,
  "error_message" text,
  "project_id" uuid,
  "completed_at" timestamp with time zone,
  "user_id" uuid NOT NULL,
  "approved_at" timestamp with time zone,
  "provider_code" text NOT NULL
);
-- TABLE public.ai_feedback
CREATE TABLE public.ai_feedback (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "user_id" uuid NOT NULL,
  "rating" smallint,
  "ai_run_id" uuid NOT NULL,
  "feedback_type" text,
  "comment" text,
  "corrected_output" text
);

-- CONSTRAINTS ADDED (NOT NULL is represented in column definitions)
ALTER TABLE journal_entries ADD CONSTRAINT "journal_entries_reversal_of_journal_entry_id_fkey" FOREIGN KEY (reversal_of_journal_entry_id) REFERENCES journal_entries(id);
ALTER TABLE inventory_movements ADD CONSTRAINT "inventory_movements_reversal_of_movement_id_fkey" FOREIGN KEY (reversal_of_movement_id) REFERENCES inventory_movements(id);
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES inventory_reservations(id);
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE project_module_configuration_versions ADD CONSTRAINT "project_module_configuration_versions_configuration_object" CHECK ((jsonb_typeof(configuration) = 'object'::text));
ALTER TABLE project_module_configuration_versions ADD CONSTRAINT "project_module_configuration_versions_pkey" PRIMARY KEY (id);
ALTER TABLE project_module_configuration_versions ADD CONSTRAINT "project_module_configuration_versions_project_version_unique" UNIQUE (project_id, configuration_version);
ALTER TABLE project_module_configuration_versions ADD CONSTRAINT "project_module_configuration_versions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_module_configuration_versions ADD CONSTRAINT "project_module_configuration_versions_activated_by_fkey" FOREIGN KEY (activated_by) REFERENCES users(id);
ALTER TABLE fiscal_periods ADD CONSTRAINT "fiscal_periods_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'soft_closed'::text, 'closed'::text, 'locked'::text])));
ALTER TABLE fiscal_periods ADD CONSTRAINT "fiscal_periods_valid_range" CHECK ((period_end >= period_start));
ALTER TABLE fiscal_periods ADD CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY (id);
ALTER TABLE fiscal_periods ADD CONSTRAINT "fiscal_periods_code_key" UNIQUE (code);
ALTER TABLE fiscal_periods ADD CONSTRAINT "fiscal_periods_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES users(id);
ALTER TABLE fiscal_periods ADD CONSTRAINT "fiscal_periods_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE journal_entries ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey" FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id);
ALTER TABLE audit_events ADD CONSTRAINT "audit_events_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'system'::text, 'provider'::text, 'admin'::text])));
ALTER TABLE audit_events ADD CONSTRAINT "audit_events_outcome_check" CHECK ((outcome = ANY (ARRAY['success'::text, 'denied'::text, 'failed'::text])));
ALTER TABLE audit_events ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE audit_events ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE audit_events ADD CONSTRAINT "audit_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE idempotency_keys ADD CONSTRAINT "idempotency_keys_request_hash_check" CHECK ((request_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE idempotency_keys ADD CONSTRAINT "idempotency_keys_state_check" CHECK ((state = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE idempotency_keys ADD CONSTRAINT "idempotency_keys_key_length" CHECK (((length(idempotency_key) >= 8) AND (length(idempotency_key) <= 200)));
ALTER TABLE idempotency_keys ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY (id);
ALTER TABLE idempotency_keys ADD CONSTRAINT "idempotency_keys_scope_key_unique" UNIQUE (actor_user_id, scope, idempotency_key);
ALTER TABLE idempotency_keys ADD CONSTRAINT "idempotency_keys_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE outbox_events ADD CONSTRAINT "outbox_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'dead_letter'::text])));
ALTER TABLE outbox_events ADD CONSTRAINT "outbox_events_attempt_count_check" CHECK ((attempt_count >= 0));
ALTER TABLE outbox_events ADD CONSTRAINT "outbox_events_pkey" PRIMARY KEY (id);
ALTER TABLE outbox_events ADD CONSTRAINT "outbox_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE partner_organizations ADD CONSTRAINT "partner_organizations_organization_type_check" CHECK ((organization_type = ANY (ARRAY['buyer'::text, 'supplier'::text, 'processor'::text, 'transporter'::text, 'warehouse_operator'::text, 'port_operator'::text, 'shipping_agent'::text, 'surveyor'::text, 'funder'::text, 'other'::text])));
ALTER TABLE partner_organizations ADD CONSTRAINT "partner_organizations_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'expired'::text, 'suspended'::text])));
ALTER TABLE partner_organizations ADD CONSTRAINT "partner_organizations_pkey" PRIMARY KEY (id);
ALTER TABLE partner_organizations ADD CONSTRAINT "partner_organizations_country_code_fkey" FOREIGN KEY (country_code) REFERENCES countries(country_code);
ALTER TABLE partner_organizations ADD CONSTRAINT "partner_organizations_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE partner_organizations ADD CONSTRAINT "partner_organizations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_project_not_null" CHECK ((project_id IS NOT NULL));
ALTER TABLE buyers ADD CONSTRAINT "buyers_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES partner_organizations(id);
ALTER TABLE vendors ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES partner_organizations(id);
ALTER TABLE service_vendors ADD CONSTRAINT "service_vendors_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES partner_organizations(id);
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES partner_organizations(id);
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_quantity_positive" CHECK ((allocated_quantity > (0)::numeric));
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_loaded_quantity_valid" CHECK (((loaded_quantity >= (0)::numeric) AND (loaded_quantity <= allocated_quantity)));
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'allocated'::text, 'partially_loaded'::text, 'loaded'::text, 'cancelled'::text, 'reversed'::text])));
ALTER TABLE fx_rates ADD CONSTRAINT "fx_rates_positive_rate" CHECK ((rate > (0)::numeric));
ALTER TABLE fx_rates ADD CONSTRAINT "fx_rates_distinct_currencies" CHECK ((from_currency_id <> to_currency_id));
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_facility_type_check" CHECK ((facility_type = ANY (ARRAY['palm_oil_mill'::text, 'kernel_crushing_plant'::text, 'integrated_mill_kcp'::text, 'warehouse'::text, 'port_terminal'::text, 'collection_point'::text, 'other'::text])));
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_operating_status_check" CHECK ((operating_status = ANY (ARRAY['planned'::text, 'operational'::text, 'maintenance'::text, 'suspended'::text, 'closed'::text])));
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_records_capacity_kind_check" CHECK ((capacity_kind = ANY (ARRAY['nominal'::text, 'rated'::text, 'practical'::text, 'verified_actual'::text])));
ALTER TABLE fx_history ADD CONSTRAINT "fx_history_distinct_currencies" CHECK ((from_currency_id <> to_currency_id));
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_latitude_check" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))));
ALTER TABLE pks_sites ADD CONSTRAINT "pks_sites_longitude_check" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))));
ALTER TABLE facility_contacts ADD CONSTRAINT "facility_contacts_pkey" PRIMARY KEY (id);
ALTER TABLE facility_contacts ADD CONSTRAINT "facility_contacts_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id) ON DELETE CASCADE;
ALTER TABLE facility_contacts ADD CONSTRAINT "facility_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_records_capacity_value_check" CHECK ((capacity_value > (0)::numeric));
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_records_period_type_check" CHECK ((period_type = ANY (ARRAY['hour'::text, 'day'::text, 'week'::text, 'month'::text, 'year'::text, 'batch'::text])));
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_valid_period" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_records_pkey" PRIMARY KEY (id);
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_records_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id) ON DELETE CASCADE;
ALTER TABLE facility_capacity_records ADD CONSTRAINT "facility_capacity_records_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE facility_certifications ADD CONSTRAINT "facility_certifications_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'expired'::text, 'suspended'::text, 'rejected'::text])));
ALTER TABLE facility_certifications ADD CONSTRAINT "facility_cert_valid_range" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)));
ALTER TABLE facility_certifications ADD CONSTRAINT "facility_certifications_pkey" PRIMARY KEY (id);
ALTER TABLE facility_certifications ADD CONSTRAINT "facility_certifications_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id) ON DELETE CASCADE;
ALTER TABLE facility_certifications ADD CONSTRAINT "facility_certifications_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE product_variants ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY (id);
ALTER TABLE product_variants ADD CONSTRAINT "product_variants_product_id_variant_code_key" UNIQUE (product_id, variant_code);
ALTER TABLE product_variants ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id) ON DELETE RESTRICT;
ALTER TABLE product_variants ADD CONSTRAINT "product_variants_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_capability_status_check" CHECK ((capability_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'verified'::text, 'suspended'::text, 'rejected'::text])));
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_pkey" PRIMARY KEY (id);
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_facility_id_product_id_process_type_key" UNIQUE (facility_id, product_id, process_type);
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id) ON DELETE CASCADE;
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_capacity_record_id_fkey" FOREIGN KEY (capacity_record_id) REFERENCES facility_capacity_records(id);
ALTER TABLE facility_products ADD CONSTRAINT "facility_products_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE facility_operating_periods ADD CONSTRAINT "facility_operating_periods_weekday_check" CHECK (((weekday >= 0) AND (weekday <= 6)));
ALTER TABLE facility_operating_periods ADD CONSTRAINT "facility_operating_periods_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE facility_operating_periods ADD CONSTRAINT "facility_operating_periods_pkey" PRIMARY KEY (id);
ALTER TABLE facility_operating_periods ADD CONSTRAINT "facility_operating_periods_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id) ON DELETE CASCADE;
ALTER TABLE product_attributes ADD CONSTRAINT "product_attributes_data_type_check" CHECK ((data_type = ANY (ARRAY['numeric'::text, 'text'::text, 'boolean'::text, 'range'::text])));
ALTER TABLE product_attributes ADD CONSTRAINT "product_attributes_pkey" PRIMARY KEY (id);
ALTER TABLE product_attributes ADD CONSTRAINT "product_attributes_attribute_code_key" UNIQUE (attribute_code);
ALTER TABLE product_specifications ADD CONSTRAINT "product_specifications_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE product_specifications ADD CONSTRAINT "product_specifications_supersedes_specification_id_fkey" FOREIGN KEY (supersedes_specification_id) REFERENCES product_specifications(id);
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_pkey" PRIMARY KEY (id);
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_sample_type_check" CHECK ((sample_type = ANY (ARRAY['composite'::text, 'retained'::text, 'pre_shipment'::text, 'discharge'::text, 'claim'::text, 'other'::text])));
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'tested'::text, 'reviewed'::text, 'rejected'::text])));
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_pkey" PRIMARY KEY (id);
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_sample_number_key" UNIQUE (sample_number);
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE RESTRICT;
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE product_quality_samples ADD CONSTRAINT "product_quality_samples_sampled_by_fkey" FOREIGN KEY (sampled_by) REFERENCES users(id);
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_review_status_check" CHECK ((review_status = ANY (ARRAY['unreviewed'::text, 'accepted'::text, 'rejected'::text, 'retest_required'::text])));
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_country_code_fkey" FOREIGN KEY (country_code) REFERENCES countries(country_code);
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_check" CHECK ((num_nonnulls(result_numeric, result_text, result_boolean) = 1));
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_detection_limit_check" CHECK (((detection_limit IS NULL) OR (detection_limit >= (0)::numeric)));
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_uncertainty_check" CHECK (((uncertainty IS NULL) OR (uncertainty >= (0)::numeric)));
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_pkey" PRIMARY KEY (id);
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_sample_id_fkey" FOREIGN KEY (sample_id) REFERENCES product_quality_samples(id) ON DELETE CASCADE;
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES product_attributes(id);
ALTER TABLE product_quality_results ADD CONSTRAINT "product_quality_results_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_review_status_check" CHECK ((review_status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])));
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_check" CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)));
ALTER TABLE product_hs_classifications ADD CONSTRAINT "product_hs_classifications_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES users(id);
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_latitude_check" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))));
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_longitude_check" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))));
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_pkey" PRIMARY KEY (id);
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES partner_organizations(id);
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_country_code_fkey" FOREIGN KEY (country_code) REFERENCES countries(country_code);
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_destination_port_id_fkey" FOREIGN KEY (destination_port_id) REFERENCES ports(id);
ALTER TABLE buyer_facilities ADD CONSTRAINT "buyer_facilities_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_version_no_check" CHECK ((version_no > 0));
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'approved'::text, 'superseded'::text, 'expired'::text, 'rejected'::text])));
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_required_quantity_check" CHECK (((required_quantity IS NULL) OR (required_quantity > (0)::numeric)));
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_check1" CHECK (((delivery_window_end IS NULL) OR (delivery_window_start IS NULL) OR (delivery_window_end >= delivery_window_start)));
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_pkey" PRIMARY KEY (id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_buyer_id_version_no_product_id_key" UNIQUE (buyer_id, version_no, product_id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_buyer_facility_id_fkey" FOREIGN KEY (buyer_facility_id) REFERENCES buyer_facilities(id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_product_specification_id_fkey" FOREIGN KEY (product_specification_id) REFERENCES product_specifications(id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_mandatory_origin_country_fkey" FOREIGN KEY (mandatory_origin_country) REFERENCES countries(country_code);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_destination_country_fkey" FOREIGN KEY (destination_country) REFERENCES countries(country_code);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE buyer_product_requirements ADD CONSTRAINT "buyer_product_requirements_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE buyer_requirement_attributes ADD CONSTRAINT "buyer_requirement_attributes_operator_check" CHECK ((operator = ANY (ARRAY['eq'::text, 'ne'::text, 'gt'::text, 'gte'::text, 'lt'::text, 'lte'::text, 'between'::text, 'in'::text, 'contains'::text])));
ALTER TABLE buyer_requirement_attributes ADD CONSTRAINT "buyer_requirement_attributes_check" CHECK (((min_numeric IS NULL) OR (max_numeric IS NULL) OR (max_numeric >= min_numeric)));
ALTER TABLE buyer_requirement_attributes ADD CONSTRAINT "buyer_requirement_attributes_pkey" PRIMARY KEY (id);
ALTER TABLE buyer_requirement_attributes ADD CONSTRAINT "buyer_requirement_attributes_requirement_id_fkey" FOREIGN KEY (requirement_id) REFERENCES buyer_product_requirements(id) ON DELETE CASCADE;
ALTER TABLE buyer_requirement_attributes ADD CONSTRAINT "buyer_requirement_attributes_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES product_attributes(id);
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_quantity_check" CHECK ((quantity >= (0)::numeric));
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_pkey" PRIMARY KEY (id);
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE;
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_buyer_facility_id_fkey" FOREIGN KEY (buyer_facility_id) REFERENCES buyer_facilities(id);
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE buyer_demand_forecasts ADD CONSTRAINT "buyer_demand_forecasts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_quality_status_check" CHECK ((quality_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'held'::text, 'retest'::text])));
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_check" CHECK (((production_ended_at IS NULL) OR (production_started_at IS NULL) OR (production_ended_at >= production_started_at)));
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_pkey" PRIMARY KEY (id);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_facility_id_batch_code_key" UNIQUE (facility_id, batch_code);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE production_batches ADD CONSTRAINT "production_batches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE inventory_lots ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE inventory_lots ADD CONSTRAINT "inventory_lots_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE inventory_lots ADD CONSTRAINT "inventory_lots_production_batch_id_fkey" FOREIGN KEY (production_batch_id) REFERENCES production_batches(id);
ALTER TABLE inventory_lots ADD CONSTRAINT "inventory_lots_owner_organization_id_fkey" FOREIGN KEY (owner_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE inventory_lots ADD CONSTRAINT "inventory_lots_nonnegative_holds_check" CHECK (((held_quantity >= (0)::numeric) AND (reserved_quantity >= (0)::numeric) AND ((held_quantity + reserved_quantity) <= quantity)));
ALTER TABLE inventory_lots ADD CONSTRAINT "inventory_lots_quality_status_check" CHECK ((quality_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'held'::text, 'retest'::text])));
ALTER TABLE fx_history ADD CONSTRAINT "fx_history_positive_rate" CHECK ((rate > (0)::numeric));
ALTER TABLE journal_entries ADD CONSTRAINT "journal_entries_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'void'::text])));
ALTER TABLE journal_entries ADD CONSTRAINT "journal_entries_reversal_reason_check" CHECK (((reversal_of_journal_entry_id IS NULL) OR (NULLIF(btrim(reversal_reason), ''::text) IS NOT NULL)));
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocation_status_check" CHECK ((allocation_status = ANY (ARRAY['reserved'::text, 'applied'::text, 'released'::text])));
ALTER TABLE rab ADD CONSTRAINT "pke_rab_amount_nonnegative" CHECK ((amount >= (0)::numeric));
ALTER TABLE cost_obligations ADD CONSTRAINT "pke_cost_obligations_quantity_positive" CHECK ((quantity > (0)::numeric));
ALTER TABLE cost_obligations ADD CONSTRAINT "pke_cost_obligations_unit_price_nonnegative" CHECK ((unit_price >= (0)::numeric));
ALTER TABLE cost_obligations ADD CONSTRAINT "pke_cost_obligations_estimated_total_nonnegative" CHECK ((estimated_total >= (0)::numeric));
ALTER TABLE cost_obligations ADD CONSTRAINT "pke_cost_obligations_exchange_rate_positive" CHECK (((exchange_rate IS NULL) OR (exchange_rate > (0)::numeric)));
ALTER TABLE payment_obligations ADD CONSTRAINT "pke_payment_obligations_amount_positive" CHECK ((amount > (0)::numeric));
ALTER TABLE cash_advances ADD CONSTRAINT "pke_cash_advances_amount_positive" CHECK ((amount > (0)::numeric));
ALTER TABLE cash_advances ADD CONSTRAINT "pke_cash_advances_remaining_balance_nonnegative" CHECK (((remaining_balance IS NULL) OR (remaining_balance >= (0)::numeric)));
ALTER TABLE cash_advances ADD CONSTRAINT "pke_cash_advances_refund_amount_nonnegative" CHECK (((refund_amount IS NULL) OR (refund_amount >= (0)::numeric)));
ALTER TABLE ap_invoices ADD CONSTRAINT "pke_ap_invoices_invoice_amount_positive" CHECK ((invoice_amount > (0)::numeric));
ALTER TABLE ap_invoices ADD CONSTRAINT "pke_ap_invoices_total_amount_positive" CHECK ((total_amount > (0)::numeric));
ALTER TABLE ap_invoices ADD CONSTRAINT "pke_ap_invoices_paid_amount_nonnegative" CHECK (((paid_amount IS NULL) OR (paid_amount >= (0)::numeric)));
ALTER TABLE ap_invoices ADD CONSTRAINT "pke_ap_invoices_paid_amount_within_total" CHECK (((paid_amount IS NULL) OR (paid_amount <= total_amount)));
ALTER TABLE ap_invoices ADD CONSTRAINT "pke_ap_invoices_outstanding_within_total" CHECK (((outstanding_amount >= (0)::numeric) AND (outstanding_amount <= total_amount)));
ALTER TABLE tracking_evidence ADD CONSTRAINT "tracking_evidence_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE tracking_evidence ADD CONSTRAINT "tracking_evidence_private_bucket_check" CHECK ((storage_bucket = 'pke-private-documents'::text));
ALTER TABLE tracking_evidence ADD CONSTRAINT "tracking_evidence_size_check" CHECK (((file_size >= (1)::numeric) AND (file_size <= (52428800)::numeric)));
ALTER TABLE tracking_evidence ADD CONSTRAINT "tracking_evidence_sha256_format_check" CHECK ((sha256_checksum ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE tracking_evidence ADD CONSTRAINT "tracking_evidence_mime_type_check" CHECK ((lower(mime_type) = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text])));
ALTER TABLE tracking_events ADD CONSTRAINT "tracking_events_idempotency_key_nonempty" CHECK ((length(btrim(idempotency_key)) > 0));
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_fulfilled_quantity_check" CHECK (((fulfilled_quantity >= (0)::numeric) AND (fulfilled_quantity <= reserved_quantity)));
ALTER TABLE shipment_allocations ADD CONSTRAINT "shipment_allocations_idempotency_nonempty" CHECK ((length(btrim(idempotency_key)) > 0));
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_idempotency_nonempty" CHECK ((length(btrim(idempotency_key)) > 0));
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_returned_by_fkey" FOREIGN KEY (returned_by) REFERENCES users(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_instruction_status_check" CHECK ((instruction_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'issued'::text, 'acknowledged'::text, 'executed_external'::text, 'evidence_submitted'::text, 'verified'::text, 'reconciled'::text, 'rejected'::text, 'returned'::text, 'cancelled'::text, 'void'::text])));
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_return_metadata_check" CHECK ((((returned_by IS NULL) AND (returned_at IS NULL) AND (return_reason IS NULL)) OR ((returned_by IS NOT NULL) AND (returned_at IS NOT NULL) AND (length(btrim(return_reason)) > 0))));
ALTER TABLE ap_invoices ADD CONSTRAINT "pke_ap_invoice_outstanding_equals_total" CHECK ((outstanding_amount = (total_amount - COALESCE(paid_amount, (0)::numeric))));
ALTER TABLE ar_invoices ADD CONSTRAINT "pke_ar_invoice_total_positive" CHECK ((total_amount > (0)::numeric));
ALTER TABLE ar_invoices ADD CONSTRAINT "pke_ar_invoice_outstanding_within_total" CHECK (((outstanding_amount >= (0)::numeric) AND (outstanding_amount <= total_amount)));
ALTER TABLE ar_invoices ADD CONSTRAINT "pke_ar_invoice_outstanding_equals_total" CHECK ((outstanding_amount = (total_amount - COALESCE(paid_amount, (0)::numeric))));
ALTER TABLE cash_advances ADD CONSTRAINT "pke_cash_advance_refund_within_amount" CHECK ((COALESCE(refund_amount, (0)::numeric) <= amount));
ALTER TABLE cash_advances ADD CONSTRAINT "pke_cash_advance_balance_within_amount" CHECK ((COALESCE(remaining_balance, (0)::numeric) <= amount));
ALTER TABLE cash_advances ADD CONSTRAINT "pke_cash_advance_balance_refund_within_disbursed" CHECK (((COALESCE(remaining_balance, (0)::numeric) + COALESCE(refund_amount, (0)::numeric)) <= amount));
ALTER TABLE truck_trips ADD CONSTRAINT "truck_trips_project_transport_leg_scope_fkey" FOREIGN KEY (project_id, transport_leg_id) REFERENCES transport_legs(project_id, id) ON DELETE CASCADE;
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_project_trip_scope_fkey" FOREIGN KEY (project_id, truck_trip_id) REFERENCES truck_trips(project_id, id);
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_project_lot_scope_fkey" FOREIGN KEY (project_id, lot_id) REFERENCES inventory_lots(project_id, id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_project_obligation_scope_fkey" FOREIGN KEY (project_id, payment_obligation_id) REFERENCES payment_obligations(project_id, id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_project_cash_advance_scope_fkey" FOREIGN KEY (project_id, cash_advance_id) REFERENCES cash_advances(project_id, id);
ALTER TABLE report_runs ADD CONSTRAINT "report_runs_project_schedule_scope_fkey" FOREIGN KEY (project_id, schedule_id) REFERENCES report_schedules(project_id, id);
ALTER TABLE report_runs ADD CONSTRAINT "report_runs_completed_requires_file_reference" CHECK (((status <> 'completed'::text) OR (NULLIF(btrim(file_reference), ''::text) IS NOT NULL)));
ALTER TABLE truck_trips ADD CONSTRAINT "truck_trips_gps_tuple_valid" CHECK ((((gps_latitude IS NULL) AND (gps_longitude IS NULL) AND (gps_accuracy IS NULL)) OR ((gps_latitude IS NOT NULL) AND (gps_longitude IS NOT NULL) AND (gps_accuracy IS NOT NULL) AND ((gps_latitude >= ('-90'::integer)::numeric) AND (gps_latitude <= (90)::numeric)) AND ((gps_longitude >= ('-180'::integer)::numeric) AND (gps_longitude <= (180)::numeric)) AND (gps_accuracy > (0)::numeric) AND (gps_accuracy <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric])))));
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_released_by_fkey" FOREIGN KEY (released_by) REFERENCES users(id);
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_hold_type_check" CHECK ((hold_type = ANY (ARRAY['quality'::text, 'legal'::text, 'claim'::text, 'operational'::text, 'customer'::text, 'other'::text])));
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'superseded'::text])));
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_check" CHECK ((((status = 'released'::text) AND (released_by IS NOT NULL) AND (released_at IS NOT NULL)) OR (status <> 'released'::text)));
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_pkey" PRIMARY KEY (id);
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE RESTRICT;
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_placed_by_fkey" FOREIGN KEY (placed_by) REFERENCES users(id);
ALTER TABLE inventory_holds ADD CONSTRAINT "inventory_holds_released_by_fkey" FOREIGN KEY (released_by) REFERENCES users(id);
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'adjusted'::text])));
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_pkey" PRIMARY KEY (id);
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id);
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_counted_by_fkey" FOREIGN KEY (counted_by) REFERENCES users(id);
ALTER TABLE inventory_reconciliations ADD CONSTRAINT "inventory_reconciliations_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE matching_runs ADD CONSTRAINT "matching_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE matching_runs ADD CONSTRAINT "matching_runs_pkey" PRIMARY KEY (id);
ALTER TABLE matching_runs ADD CONSTRAINT "matching_runs_requirement_id_fkey" FOREIGN KEY (requirement_id) REFERENCES buyer_product_requirements(id);
ALTER TABLE matching_runs ADD CONSTRAINT "matching_runs_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES buyers(id);
ALTER TABLE matching_runs ADD CONSTRAINT "matching_runs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE matching_runs ADD CONSTRAINT "matching_runs_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES users(id);
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_review_status_check" CHECK ((review_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'reserved'::text])));
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_similarity_score_check" CHECK (((similarity_score IS NULL) OR ((similarity_score >= (0)::numeric) AND (similarity_score <= (100)::numeric))));
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_quality_score_check" CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (100)::numeric))));
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_pkey" PRIMARY KEY (id);
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_matching_run_id_fkey" FOREIGN KEY (matching_run_id) REFERENCES matching_runs(id) ON DELETE CASCADE;
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES pks_sites(id);
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_acknowledged_by_fkey" FOREIGN KEY (acknowledged_by) REFERENCES users(id);
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_reserved_quantity_check" CHECK ((reserved_quantity > (0)::numeric));
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'partially_fulfilled'::text, 'fulfilled'::text, 'released'::text, 'expired'::text])));
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_check" CHECK (((expires_at IS NULL) OR (expires_at > reserved_at)));
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY (id);
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE RESTRICT;
ALTER TABLE inventory_reservations ADD CONSTRAINT "inventory_reservations_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES buyers(id);
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_availability_score_check" CHECK (((availability_score IS NULL) OR ((availability_score >= (0)::numeric) AND (availability_score <= (100)::numeric))));
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_logistics_score_check" CHECK (((logistics_score IS NULL) OR ((logistics_score >= (0)::numeric) AND (logistics_score <= (100)::numeric))));
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_supplier_reliability_score_check" CHECK (((supplier_reliability_score IS NULL) OR ((supplier_reliability_score >= (0)::numeric) AND (supplier_reliability_score <= (100)::numeric))));
ALTER TABLE matching_candidates ADD CONSTRAINT "matching_candidates_fit_score_check" CHECK (((fit_score IS NULL) OR ((fit_score >= (0)::numeric) AND (fit_score <= (100)::numeric))));
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instruction_single_source" CHECK ((num_nonnulls(payment_obligation_id, cash_advance_id) = 1));
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instruction_approval_order" CHECK (((approved_at IS NULL) OR (approved_by IS NOT NULL)));
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instruction_ack_order" CHECK (((acknowledged_at IS NULL) OR (acknowledged_by IS NOT NULL)));
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_pkey" PRIMARY KEY (id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_instruction_number_key" UNIQUE (instruction_number);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_payment_obligation_id_fkey" FOREIGN KEY (payment_obligation_id) REFERENCES payment_obligations(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_cash_advance_id_fkey" FOREIGN KEY (cash_advance_id) REFERENCES cash_advances(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_payment_method_id_fkey" FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE payment_instructions ADD CONSTRAINT "payment_instructions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_pkey" PRIMARY KEY (id);
ALTER TABLE payment_instruction_approvals ADD CONSTRAINT "payment_instruction_approvals_decision_check" CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'returned'::text])));
ALTER TABLE payment_instruction_approvals ADD CONSTRAINT "payment_instruction_approvals_pkey" PRIMARY KEY (id);
ALTER TABLE payment_instruction_approvals ADD CONSTRAINT "payment_instruction_approvals_payment_instruction_id_fkey" FOREIGN KEY (payment_instruction_id) REFERENCES payment_instructions(id) ON DELETE RESTRICT;
ALTER TABLE payment_instruction_approvals ADD CONSTRAINT "payment_instruction_approvals_approver_id_fkey" FOREIGN KEY (approver_id) REFERENCES users(id);
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_file_size_bytes_check" CHECK (((file_size_bytes > 0) AND (file_size_bytes <= 52428800)));
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_sha256_checksum_check" CHECK ((sha256_checksum ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_status_check" CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'accepted'::text, 'rejected'::text, 'superseded'::text])));
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_payment_instruction_id_fkey" FOREIGN KEY (payment_instruction_id) REFERENCES payment_instructions(id) ON DELETE RESTRICT;
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_supersedes_evidence_id_fkey" FOREIGN KEY (supersedes_evidence_id) REFERENCES payment_evidence(id);
ALTER TABLE payment_evidence ADD CONSTRAINT "payment_evidence_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_verification_status_check" CHECK ((verification_status = ANY (ARRAY['verified'::text, 'rejected'::text, 'needs_correction'::text])));
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_verified_amount_check" CHECK (((verified_amount IS NULL) OR (verified_amount >= (0)::numeric)));
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_pkey" PRIMARY KEY (id);
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_payment_instruction_id_fkey" FOREIGN KEY (payment_instruction_id) REFERENCES payment_instructions(id) ON DELETE RESTRICT;
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_evidence_id_fkey" FOREIGN KEY (evidence_id) REFERENCES payment_evidence(id) ON DELETE RESTRICT;
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_verified_currency_id_fkey" FOREIGN KEY (verified_currency_id) REFERENCES currencies(id);
ALTER TABLE payment_verifications ADD CONSTRAINT "payment_verifications_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_reconciled_amount_check" CHECK ((reconciled_amount > (0)::numeric));
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_reconciliation_status_check" CHECK ((reconciliation_status = ANY (ARRAY['pending'::text, 'matched'::text, 'exception'::text, 'reversed'::text])));
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY (id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_payment_instruction_id_key" UNIQUE (payment_instruction_id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_payment_instruction_id_fkey" FOREIGN KEY (payment_instruction_id) REFERENCES payment_instructions(id) ON DELETE RESTRICT;
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_verification_id_fkey" FOREIGN KEY (verification_id) REFERENCES payment_verifications(id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_journal_entry_id_fkey" FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE payment_reconciliations ADD CONSTRAINT "payment_reconciliations_reconciled_by_fkey" FOREIGN KEY (reconciled_by) REFERENCES users(id);
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_allocated_amount_check" CHECK ((allocated_amount > (0)::numeric));
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_one_invoice" CHECK ((num_nonnulls(ap_invoice_id, ar_invoice_id) = 1));
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_payment_instruction_id_fkey" FOREIGN KEY (payment_instruction_id) REFERENCES payment_instructions(id) ON DELETE RESTRICT;
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_ap_invoice_id_fkey" FOREIGN KEY (ap_invoice_id) REFERENCES ap_invoices(id);
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_ar_invoice_id_fkey" FOREIGN KEY (ar_invoice_id) REFERENCES ar_invoices(id);
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_currency_id_fkey" FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE payment_invoice_allocations ADD CONSTRAINT "payment_invoice_allocations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE port_loading_services ADD CONSTRAINT "port_loading_services_berth_id_fkey" FOREIGN KEY (berth_id) REFERENCES port_berths(id);
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id);
ALTER TABLE payment_obligations ADD CONSTRAINT "payment_obligations_amount_paid_check" CHECK (((amount_paid >= (0)::numeric) AND (amount_paid <= amount)));
ALTER TABLE ar_invoices ADD CONSTRAINT "ar_invoices_amount_consistency_check" CHECK (((invoice_amount >= (0)::numeric) AND (total_amount >= (0)::numeric) AND (paid_amount >= (0)::numeric) AND (paid_amount <= total_amount) AND ((outstanding_amount IS NULL) OR (outstanding_amount >= (0)::numeric))));
ALTER TABLE project_export_documents ADD CONSTRAINT "project_export_documents_version_positive" CHECK ((version_no > 0));
ALTER TABLE project_export_documents ADD CONSTRAINT "project_export_documents_file_size_check" CHECK (((file_size_bytes IS NULL) OR ((file_size_bytes >= 1) AND (file_size_bytes <= 52428800))));
ALTER TABLE project_export_documents ADD CONSTRAINT "project_export_documents_sha256_check" CHECK (((sha256_checksum IS NULL) OR (sha256_checksum ~ '^[0-9a-f]{64}$'::text)));
ALTER TABLE fx_exposures ADD CONSTRAINT "fx_exposures_functional_currency_id_fkey" FOREIGN KEY (functional_currency_id) REFERENCES currencies(id);
ALTER TABLE fx_exposures ADD CONSTRAINT "fx_exposures_positive_rate" CHECK ((fx_rate > (0)::numeric));
ALTER TABLE fx_exposures ADD CONSTRAINT "fx_exposures_nonnegative_amounts" CHECK (((original_amount >= (0)::numeric) AND (functional_amount >= (0)::numeric)));
ALTER TABLE fx_exposures ADD CONSTRAINT "fx_exposures_direction_check" CHECK ((exposure_direction = ANY (ARRAY['receivable'::text, 'payable'::text, 'commitment'::text, 'forecast'::text, 'unknown'::text])));
ALTER TABLE fx_exposures ADD CONSTRAINT "fx_exposures_valuation_type_check" CHECK ((valuation_type = ANY (ARRAY['baseline'::text, 'market_reference'::text, 'actual_execution'::text, 'revaluation'::text, 'contract'::text])));
ALTER TABLE journal_lines ADD CONSTRAINT "journal_lines_nonnegative_amounts" CHECK (((COALESCE(debit, (0)::numeric) >= (0)::numeric) AND (COALESCE(credit, (0)::numeric) >= (0)::numeric)));
ALTER TABLE journal_lines ADD CONSTRAINT "journal_lines_one_sided_amount" CHECK ((((COALESCE(debit, (0)::numeric) > (0)::numeric) AND (COALESCE(credit, (0)::numeric) = (0)::numeric)) OR ((COALESCE(credit, (0)::numeric) > (0)::numeric) AND (COALESCE(debit, (0)::numeric) = (0)::numeric))));
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_berth_id_fkey" FOREIGN KEY (berth_id) REFERENCES port_berths(id);
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_operator_organization_id_fkey" FOREIGN KEY (operator_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE inventory_movements ADD CONSTRAINT "inventory_movements_quantity_positive" CHECK ((quantity > (0)::numeric));
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_quantity_positive" CHECK ((received_quantity > (0)::numeric));
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_gps_latitude_range" CHECK (((gps_latitude IS NULL) OR ((gps_latitude >= ('-90'::integer)::numeric) AND (gps_latitude <= (90)::numeric))));
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_gps_longitude_range" CHECK (((gps_longitude IS NULL) OR ((gps_longitude >= ('-180'::integer)::numeric) AND (gps_longitude <= (180)::numeric))));
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_gps_accuracy_positive" CHECK (((gps_accuracy IS NULL) OR (gps_accuracy > (0)::numeric)));
ALTER TABLE ports ADD CONSTRAINT "ports_latitude_range" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))));
ALTER TABLE ports ADD CONSTRAINT "ports_longitude_range" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))));
ALTER TABLE ports ADD CONSTRAINT "ports_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_declared_depth_m_check" CHECK (((declared_depth_m IS NULL) OR (declared_depth_m > (0)::numeric)));
ALTER TABLE port_terminals ADD CONSTRAINT "port_terminals_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'operational'::text, 'maintenance'::text, 'suspended'::text, 'closed'::text, 'unverified'::text])));
ALTER TABLE port_terminals ADD CONSTRAINT "port_terminals_pkey" PRIMARY KEY (id);
ALTER TABLE port_terminals ADD CONSTRAINT "port_terminals_port_id_terminal_code_key" UNIQUE (port_id, terminal_code);
ALTER TABLE port_terminals ADD CONSTRAINT "port_terminals_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE RESTRICT;
ALTER TABLE port_terminals ADD CONSTRAINT "port_terminals_operator_organization_id_fkey" FOREIGN KEY (operator_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_status_check" CHECK ((status = ANY (ARRAY['operational'::text, 'maintenance'::text, 'suspended'::text, 'closed'::text, 'unverified'::text])));
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_length_m_check" CHECK (((length_m IS NULL) OR (length_m > (0)::numeric)));
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_max_beam_m_check" CHECK (((max_beam_m IS NULL) OR (max_beam_m > (0)::numeric)));
ALTER TABLE warehouse_bins ADD CONSTRAINT "warehouse_bins_pkey" PRIMARY KEY (id);
ALTER TABLE warehouse_bins ADD CONSTRAINT "warehouse_bins_zone_id_bin_code_key" UNIQUE (zone_id, bin_code);
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_max_operational_draft_m_check" CHECK (((max_operational_draft_m IS NULL) OR (max_operational_draft_m > (0)::numeric)));
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_max_loa_m_check" CHECK (((max_loa_m IS NULL) OR (max_loa_m > (0)::numeric)));
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_pkey" PRIMARY KEY (id);
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_terminal_id_berth_code_key" UNIQUE (terminal_id, berth_code);
ALTER TABLE port_berths ADD CONSTRAINT "port_berths_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id) ON DELETE RESTRICT;
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_traffic_direction_check" CHECK ((traffic_direction = ANY (ARRAY['one_way'::text, 'two_way'::text, 'alternating'::text, 'unknown'::text])));
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_status_check" CHECK ((status = ANY (ARRAY['operational'::text, 'restricted'::text, 'closed'::text, 'unverified'::text])));
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_length_m_check" CHECK (((length_m IS NULL) OR (length_m > (0)::numeric)));
ALTER TABLE warehouse_bins ADD CONSTRAINT "warehouse_bins_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES warehouse_zones(id) ON DELETE CASCADE;
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_width_m_check" CHECK (((width_m IS NULL) OR (width_m > (0)::numeric)));
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_declared_depth_m_check" CHECK (((declared_depth_m IS NULL) OR (declared_depth_m > (0)::numeric)));
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_pkey" PRIMARY KEY (id);
ALTER TABLE port_channels ADD CONSTRAINT "port_channels_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE RESTRICT;
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_status_check" CHECK ((status = ANY (ARRAY['operational'::text, 'restricted'::text, 'closed'::text, 'unverified'::text])));
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_latitude_check" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))));
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_depth_unit_check" CHECK ((depth_unit = ANY (ARRAY['m'::text, 'ft'::text, 'fathom'::text])));
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_longitude_check" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))));
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_declared_depth_m_check" CHECK (((declared_depth_m IS NULL) OR (declared_depth_m > (0)::numeric)));
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_capacity_vessels_check" CHECK (((capacity_vessels IS NULL) OR (capacity_vessels > 0)));
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_pkey" PRIMARY KEY (id);
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_port_id_anchorage_code_key" UNIQUE (port_id, anchorage_code);
ALTER TABLE port_anchorages ADD CONSTRAINT "port_anchorages_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE RESTRICT;
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_depth_feature_type_check" CHECK ((depth_feature_type = ANY (ARRAY['port'::text, 'terminal'::text, 'berth'::text, 'channel'::text, 'anchorage'::text, 'fairway'::text, 'river_segment'::text])));
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_depth_value_check" CHECK ((depth_value > (0)::numeric));
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_quality_status_check" CHECK ((quality_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'reviewed'::text, 'verified'::text, 'rejected'::text, 'stale'::text])));
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_check" CHECK ((num_nonnulls(terminal_id, berth_id, channel_id, anchorage_id) <= 1));
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_check1" CHECK (((valid_to IS NULL) OR (valid_to >= survey_date)));
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_pkey" PRIMARY KEY (id);
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_berth_id_fkey" FOREIGN KEY (berth_id) REFERENCES port_berths(id);
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES port_channels(id);
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_anchorage_id_fkey" FOREIGN KEY (anchorage_id) REFERENCES port_anchorages(id);
ALTER TABLE port_depth_observations ADD CONSTRAINT "port_depth_observations_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES users(id);
ALTER TABLE port_loading_services ADD CONSTRAINT "port_loading_services_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE port_loading_services ADD CONSTRAINT "port_loading_services_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE port_tide_observations ADD CONSTRAINT "port_tide_observations_quality_status_check" CHECK ((quality_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'stale'::text, 'provider_unavailable'::text])));
ALTER TABLE port_tide_observations ADD CONSTRAINT "port_tide_observations_pkey" PRIMARY KEY (id);
ALTER TABLE port_tide_observations ADD CONSTRAINT "port_tide_observations_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE port_tide_observations ADD CONSTRAINT "port_tide_observations_berth_id_fkey" FOREIGN KEY (berth_id) REFERENCES port_berths(id);
ALTER TABLE port_loading_services ADD CONSTRAINT "port_loading_services_handling_mode_check" CHECK ((handling_mode = ANY (ARRAY['bagged'::text, 'loose_bulk'::text, 'containerized'::text, 'bulk_container_stuffing'::text, 'mixed'::text])));
ALTER TABLE port_loading_services ADD CONSTRAINT "port_loading_services_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'maintenance'::text, 'unverified'::text])));
ALTER TABLE port_loading_services ADD CONSTRAINT "port_loading_services_pkey" PRIMARY KEY (id);
ALTER TABLE port_equipment ADD CONSTRAINT "port_equipment_condition_status_check" CHECK ((condition_status = ANY (ARRAY['operational'::text, 'limited'::text, 'maintenance'::text, 'unavailable'::text, 'unverified'::text])));
ALTER TABLE port_equipment ADD CONSTRAINT "port_equipment_pkey" PRIMARY KEY (id);
ALTER TABLE port_equipment ADD CONSTRAINT "port_equipment_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE port_equipment ADD CONSTRAINT "port_equipment_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE port_equipment ADD CONSTRAINT "port_equipment_berth_id_fkey" FOREIGN KEY (berth_id) REFERENCES port_berths(id);
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_approval_status_check" CHECK ((approval_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_check" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_pkey" PRIMARY KEY (id);
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE port_operating_limits ADD CONSTRAINT "port_operating_limits_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_zone_id_fkey" FOREIGN KEY (zone_id) REFERENCES warehouse_zones(id);
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_latitude_range" CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))));
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_longitude_range" CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))));
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_storage_mode_check" CHECK ((storage_mode = ANY (ARRAY['bagged'::text, 'loose_bulk'::text, 'containerized'::text, 'bulk_container_stuffing'::text, 'mixed'::text])));
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_capacity_positive" CHECK (((storage_capacity_mt IS NULL) OR (storage_capacity_mt > (0)::numeric)));
ALTER TABLE warehouses ADD CONSTRAINT "warehouses_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'suspended'::text])));
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_bin_id_fkey" FOREIGN KEY (bin_id) REFERENCES warehouse_bins(id);
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE warehouse_zones ADD CONSTRAINT "warehouse_zones_zone_type_check" CHECK ((zone_type = ANY (ARRAY['receiving'::text, 'storage'::text, 'packing'::text, 'dispatch'::text, 'quarantine'::text, 'other'::text])));
ALTER TABLE warehouse_zones ADD CONSTRAINT "warehouse_zones_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'blocked'::text, 'maintenance'::text, 'closed'::text])));
ALTER TABLE warehouse_zones ADD CONSTRAINT "warehouse_zones_capacity_check" CHECK (((capacity IS NULL) OR (capacity > (0)::numeric)));
ALTER TABLE warehouse_zones ADD CONSTRAINT "warehouse_zones_pkey" PRIMARY KEY (id);
ALTER TABLE warehouse_zones ADD CONSTRAINT "warehouse_zones_warehouse_id_zone_code_key" UNIQUE (warehouse_id, zone_code);
ALTER TABLE warehouse_zones ADD CONSTRAINT "warehouse_zones_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE warehouse_bins ADD CONSTRAINT "warehouse_bins_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'blocked'::text, 'full'::text, 'maintenance'::text])));
ALTER TABLE warehouse_bins ADD CONSTRAINT "warehouse_bins_capacity_check" CHECK (((capacity IS NULL) OR (capacity > (0)::numeric)));
ALTER TABLE warehouse_equipment ADD CONSTRAINT "warehouse_equipment_condition_status_check" CHECK ((condition_status = ANY (ARRAY['operational'::text, 'limited'::text, 'maintenance'::text, 'unavailable'::text, 'unverified'::text])));
ALTER TABLE warehouse_equipment ADD CONSTRAINT "warehouse_equipment_pkey" PRIMARY KEY (id);
ALTER TABLE warehouse_equipment ADD CONSTRAINT "warehouse_equipment_warehouse_id_asset_code_key" UNIQUE (warehouse_id, asset_code);
ALTER TABLE warehouse_equipment ADD CONSTRAINT "warehouse_equipment_warehouse_id_fkey" FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_reserved_quantity_check" CHECK ((reserved_quantity > (0)::numeric));
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'expired'::text, 'fulfilled'::text, 'cancelled'::text])));
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_check" CHECK ((window_end > window_start));
ALTER TABLE warehouse_reservations ADD CONSTRAINT "warehouse_reservations_pkey" PRIMARY KEY (id);
ALTER TABLE vessels ADD CONSTRAINT "vessels_owner_organization_id_fkey" FOREIGN KEY (owner_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE vessels ADD CONSTRAINT "vessels_operator_organization_id_fkey" FOREIGN KEY (operator_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE vessels ADD CONSTRAINT "vessels_manager_organization_id_fkey" FOREIGN KEY (manager_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE vessels ADD CONSTRAINT "vessels_imo_format_check" CHECK (((imo_number IS NULL) OR (imo_number ~ '^[0-9]{7}$'::text)));
ALTER TABLE vessels ADD CONSTRAINT "vessels_dimensions_positive" CHECK ((((loa_m IS NULL) OR (loa_m > (0)::numeric)) AND ((beam_m IS NULL) OR (beam_m > (0)::numeric)) AND ((depth_m IS NULL) OR (depth_m > (0)::numeric)) AND ((air_draft_m IS NULL) OR (air_draft_m > (0)::numeric)) AND ((summer_draft_m IS NULL) OR (summer_draft_m > (0)::numeric)) AND ((max_draft_m IS NULL) OR (max_draft_m > (0)::numeric)) AND ((dwt_mt IS NULL) OR (dwt_mt > (0)::numeric)) AND ((hold_capacity_m3 IS NULL) OR (hold_capacity_m3 > (0)::numeric))));
ALTER TABLE vessels ADD CONSTRAINT "vessels_mmsi_format_check" CHECK (((mmsi IS NULL) OR (mmsi ~ '^[0-9]{9}$'::text)));
ALTER TABLE vessels ADD CONSTRAINT "vessels_year_built_check" CHECK (((year_built IS NULL) OR ((year_built >= 1850) AND (year_built <= 2200))));
ALTER TABLE vessels ADD CONSTRAINT "vessels_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'under_review'::text, 'verified'::text, 'rejected'::text, 'suspended'::text])));
ALTER TABLE vessel_name_history ADD CONSTRAINT "vessel_name_history_check" CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)));
ALTER TABLE vessel_name_history ADD CONSTRAINT "vessel_name_history_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_name_history ADD CONSTRAINT "vessel_name_history_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE;
ALTER TABLE vessel_name_history ADD CONSTRAINT "vessel_name_history_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE vessel_identifiers ADD CONSTRAINT "vessel_identifiers_identifier_type_check" CHECK ((identifier_type = ANY (ARRAY['IMO'::text, 'MMSI'::text, 'CALL_SIGN'::text, 'FLAG_REGISTRY'::text, 'OTHER'::text])));
ALTER TABLE vessel_certificates ADD CONSTRAINT "vessel_certificates_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE;
ALTER TABLE vessel_identifiers ADD CONSTRAINT "vessel_identifiers_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE vessel_identifiers ADD CONSTRAINT "vessel_identifiers_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)));
ALTER TABLE vessel_identifiers ADD CONSTRAINT "vessel_identifiers_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_identifiers ADD CONSTRAINT "vessel_identifiers_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE;
ALTER TABLE vessel_certificates ADD CONSTRAINT "vessel_certificates_verification_status_check" CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'submitted'::text, 'verified'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE vessel_certificates ADD CONSTRAINT "vessel_certificates_check" CHECK (((expires_at IS NULL) OR (issued_at IS NULL) OR (expires_at >= issued_at)));
ALTER TABLE vessel_certificates ADD CONSTRAINT "vessel_certificates_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_certificates ADD CONSTRAINT "vessel_certificates_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_latitude_check" CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_longitude_check" CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_source_quality_check" CHECK ((source_quality = ANY (ARRAY['fresh'::text, 'delayed'::text, 'stale'::text, 'unknown'::text, 'provider_unavailable'::text])));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_sog_knots_check" CHECK (((sog_knots IS NULL) OR (sog_knots >= (0)::numeric)));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_cog_degrees_check" CHECK (((cog_degrees IS NULL) OR ((cog_degrees >= (0)::numeric) AND (cog_degrees <= (360)::numeric))));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_heading_degrees_check" CHECK (((heading_degrees IS NULL) OR ((heading_degrees >= (0)::numeric) AND (heading_degrees <= (360)::numeric))));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_reported_draught_m_check" CHECK (((reported_draught_m IS NULL) OR (reported_draught_m >= (0)::numeric)));
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_tracking_positions ADD CONSTRAINT "vessel_tracking_positions_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE;
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_event_type_check" CHECK ((event_type = ANY (ARRAY['planned_arrival'::text, 'eta_update'::text, 'arrived'::text, 'berthed'::text, 'departed'::text, 'cancelled'::text])));
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'predicted'::text, 'actual'::text, 'cancelled'::text, 'unknown'::text])));
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id);
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_voyage_id_fkey" FOREIGN KEY (voyage_id) REFERENCES voyages(id);
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE vessel_port_calls ADD CONSTRAINT "vessel_port_calls_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_nomination_status_check" CHECK ((nomination_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'identity_verified'::text, 'port_screened'::text, 'documents_checked'::text, 'approved_for_internal_planning'::text, 'changed'::text, 'rejected'::text, 'withdrawn'::text])));
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_voyage_id_fkey" FOREIGN KEY (voyage_id) REFERENCES voyages(id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_nominated_by_fkey" FOREIGN KEY (nominated_by) REFERENCES users(id);
ALTER TABLE vessel_nominations ADD CONSTRAINT "vessel_nominations_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_result_check" CHECK ((result = ANY (ARRAY['eligible_for_review'::text, 'not_eligible'::text, 'insufficient_data'::text, 'manual_review_required'::text])));
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_pkey" PRIMARY KEY (id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_vessel_id_fkey" FOREIGN KEY (vessel_id) REFERENCES vessels(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_port_id_fkey" FOREIGN KEY (port_id) REFERENCES ports(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES port_terminals(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_berth_id_fkey" FOREIGN KEY (berth_id) REFERENCES port_berths(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_assessed_by_fkey" FOREIGN KEY (assessed_by) REFERENCES users(id);
ALTER TABLE vessel_port_assessments ADD CONSTRAINT "vessel_port_assessments_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE voyages ADD CONSTRAINT "voyages_origin_port_id_fkey" FOREIGN KEY (origin_port_id) REFERENCES ports(id);
ALTER TABLE voyages ADD CONSTRAINT "voyages_destination_port_id_fkey" FOREIGN KEY (destination_port_id) REFERENCES ports(id);
ALTER TABLE voyages ADD CONSTRAINT "voyages_shipping_agent_organization_id_fkey" FOREIGN KEY (shipping_agent_organization_id) REFERENCES partner_organizations(id);
ALTER TABLE shipments ADD CONSTRAINT "shipments_destination_port_id_fkey" FOREIGN KEY (destination_port_id) REFERENCES ports(id);
ALTER TABLE shipment_events ADD CONSTRAINT "shipment_events_pkey" PRIMARY KEY (id);
ALTER TABLE shipment_events ADD CONSTRAINT "shipment_events_project_id_idempotency_key_key" UNIQUE (project_id, idempotency_key);
ALTER TABLE shipment_events ADD CONSTRAINT "shipment_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE shipment_events ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE RESTRICT;
ALTER TABLE shipment_events ADD CONSTRAINT "shipment_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_ticket_type_check" CHECK ((ticket_type = ANY (ARRAY['weighbridge'::text, 'belt_scale'::text, 'tally'::text, 'draft_survey'::text, 'container_vgm'::text, 'other'::text])));
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_quantity_check" CHECK ((quantity > (0)::numeric));
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'superseded'::text])));
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_loading_operation_id_ticket_number_key" UNIQUE (loading_operation_id, ticket_number);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_loading_operation_id_fkey" FOREIGN KEY (loading_operation_id) REFERENCES loading_operations(id);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES inventory_lots(id);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES port_equipment(id);
ALTER TABLE loading_tickets ADD CONSTRAINT "loading_tickets_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES users(id);
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_quantity_check" CHECK ((quantity >= (0)::numeric));
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text, 'exception'::text, 'cancelled'::text])));
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_check" CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at)));
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_pkey" PRIMARY KEY (id);
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_loading_operation_id_segment_code_key" UNIQUE (loading_operation_id, segment_code);
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_loading_operation_id_fkey" FOREIGN KEY (loading_operation_id) REFERENCES loading_operations(id);
ALTER TABLE loading_segments ADD CONSTRAINT "loading_segments_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES port_equipment(id);
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_visibility_status_check" CHECK ((visibility_status = ANY (ARRAY['internal'::text, 'buyer_visible'::text, 'withheld'::text, 'redacted'::text])));
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_pkey" PRIMARY KEY (id);
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_shipment_id_document_id_key" UNIQUE (shipment_id, document_id);
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_document_id_fkey" FOREIGN KEY (document_id) REFERENCES project_export_documents(id);
ALTER TABLE shipment_document_links ADD CONSTRAINT "shipment_document_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_scope_check" CHECK ((scope = ANY (ARRAY['summary'::text, 'milestones'::text, 'documents_view'::text, 'documents_download'::text, 'vessel_tracking'::text, 'financial_milestones'::text])));
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text])));
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_check" CHECK (((expires_at IS NULL) OR (expires_at > granted_at)));
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_pkey" PRIMARY KEY (id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES buyers(id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES buyer_facilities(id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES users(id);
ALTER TABLE buyer_visibility_grants ADD CONSTRAINT "buyer_visibility_grants_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES users(id);
ALTER TABLE regulatory_rules ADD CONSTRAINT "regulatory_rules_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_rules ADD CONSTRAINT "regulatory_rules_rule_code_key" UNIQUE (rule_code);
ALTER TABLE regulatory_rules ADD CONSTRAINT "regulatory_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE regulatory_sources ADD CONSTRAINT "regulatory_sources_access_rights_check" CHECK ((access_rights = ANY (ARRAY['public'::text, 'licensed'::text, 'restricted'::text, 'internal'::text, 'unknown'::text])));
ALTER TABLE regulatory_sources ADD CONSTRAINT "regulatory_sources_verification_check" CHECK ((verification_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'verified'::text, 'rejected'::text])));
ALTER TABLE regulatory_rules ADD CONSTRAINT "regulatory_rules_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'under_review'::text, 'approved'::text, 'effective'::text, 'superseded'::text, 'repealed'::text, 'suspended'::text])));
ALTER TABLE regulatory_rules ADD CONSTRAINT "regulatory_rules_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_version_number_check" CHECK ((version_number > 0));
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_outcome_check" CHECK ((outcome = ANY (ARRAY['require'::text, 'prohibit'::text, 'allow'::text, 'manual_review'::text, 'informational'::text])));
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'under_review'::text, 'approved'::text, 'effective'::text, 'superseded'::text, 'repealed'::text])));
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_check" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_rule_id_version_number_key" UNIQUE (rule_id, version_number);
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES regulatory_rules(id) ON DELETE RESTRICT;
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_regulatory_source_id_fkey" FOREIGN KEY (regulatory_source_id) REFERENCES regulatory_sources(id);
ALTER TABLE regulatory_rule_versions ADD CONSTRAINT "regulatory_rule_versions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE regulatory_rules ADD CONSTRAINT "regulatory_rules_active_version_fk" FOREIGN KEY (active_version_id) REFERENCES regulatory_rule_versions(id);
ALTER TABLE regulatory_rule_conditions ADD CONSTRAINT "regulatory_rule_conditions_operator_check" CHECK ((operator = ANY (ARRAY['eq'::text, 'ne'::text, 'in'::text, 'not_in'::text, 'gt'::text, 'gte'::text, 'lt'::text, 'lte'::text, 'between'::text, 'contains'::text, 'exists'::text])));
ALTER TABLE regulatory_rule_conditions ADD CONSTRAINT "regulatory_rule_conditions_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_rule_conditions ADD CONSTRAINT "regulatory_rule_conditions_rule_version_id_fkey" FOREIGN KEY (rule_version_id) REFERENCES regulatory_rule_versions(id) ON DELETE CASCADE;
ALTER TABLE regulatory_rule_documents ADD CONSTRAINT "regulatory_rule_documents_requirement_kind_check" CHECK ((requirement_kind = ANY (ARRAY['mandatory'::text, 'conditional'::text, 'optional'::text])));
ALTER TABLE regulatory_rule_documents ADD CONSTRAINT "regulatory_rule_documents_validity_days_check" CHECK (((validity_days IS NULL) OR (validity_days > 0)));
ALTER TABLE regulatory_rule_documents ADD CONSTRAINT "regulatory_rule_documents_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_rule_documents ADD CONSTRAINT "regulatory_rule_documents_rule_version_id_document_type_id_key" UNIQUE (rule_version_id, document_type_id);
ALTER TABLE regulatory_rule_documents ADD CONSTRAINT "regulatory_rule_documents_rule_version_id_fkey" FOREIGN KEY (rule_version_id) REFERENCES regulatory_rule_versions(id) ON DELETE CASCADE;
ALTER TABLE regulatory_rule_documents ADD CONSTRAINT "regulatory_rule_documents_document_type_id_fkey" FOREIGN KEY (document_type_id) REFERENCES export_document_types(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_pending_count_check" CHECK ((pending_count >= 0));
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'revoked'::text])));
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_check" CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)));
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_rule_version_id_fkey" FOREIGN KEY (rule_version_id) REFERENCES regulatory_rule_versions(id);
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE regulatory_rule_exceptions ADD CONSTRAINT "regulatory_rule_exceptions_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_overall_status_check" CHECK ((overall_status = ANY (ARRAY['pass'::text, 'fail'::text, 'pending'::text, 'not_applicable'::text, 'manual_review'::text])));
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_failed_count_check" CHECK ((failed_count >= 0));
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_product_id_fkey" FOREIGN KEY (product_id) REFERENCES product_catalog(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_product_hs_classification_id_fkey" FOREIGN KEY (product_hs_classification_id) REFERENCES product_hs_classifications(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_origin_country_fkey" FOREIGN KEY (origin_country) REFERENCES countries(country_code);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_destination_country_fkey" FOREIGN KEY (destination_country) REFERENCES countries(country_code);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_assessed_by_fkey" FOREIGN KEY (assessed_by) REFERENCES users(id);
ALTER TABLE regulatory_assessments ADD CONSTRAINT "regulatory_assessments_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE regulatory_assessment_results ADD CONSTRAINT "regulatory_assessment_results_result_status_check" CHECK ((result_status = ANY (ARRAY['pass'::text, 'fail'::text, 'pending'::text, 'not_applicable'::text, 'manual_review'::text])));
ALTER TABLE regulatory_assessment_results ADD CONSTRAINT "regulatory_assessment_results_pkey" PRIMARY KEY (id);
ALTER TABLE regulatory_assessment_results ADD CONSTRAINT "regulatory_assessment_results_assessment_id_rule_version_id_key" UNIQUE (assessment_id, rule_version_id);
ALTER TABLE regulatory_assessment_results ADD CONSTRAINT "regulatory_assessment_results_assessment_id_fkey" FOREIGN KEY (assessment_id) REFERENCES regulatory_assessments(id) ON DELETE CASCADE;
ALTER TABLE regulatory_assessment_results ADD CONSTRAINT "regulatory_assessment_results_rule_version_id_fkey" FOREIGN KEY (rule_version_id) REFERENCES regulatory_rule_versions(id);
ALTER TABLE regulatory_assessment_results ADD CONSTRAINT "regulatory_assessment_results_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES users(id);
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_document_id_version_label_key" UNIQUE (document_id, version_label);
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_document_id_fkey" FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE RESTRICT;
ALTER TABLE country_export_document_requirements ADD CONSTRAINT "country_doc_req_verification_check" CHECK ((verification_status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'verified'::text, 'rejected'::text])));
ALTER TABLE country_export_document_requirements ADD CONSTRAINT "country_doc_req_version_positive" CHECK ((version_no > 0));
ALTER TABLE country_export_document_requirements ADD CONSTRAINT "country_doc_req_effective_range" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE knowledge_documents ADD CONSTRAINT "knowledge_documents_access_rights_check" CHECK ((access_rights = ANY (ARRAY['public'::text, 'licensed'::text, 'restricted'::text, 'internal'::text, 'unknown'::text])));
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE knowledge_documents ADD CONSTRAINT "knowledge_documents_status_check" CHECK ((status = ANY (ARRAY['registered'::text, 'ingesting'::text, 'indexed'::text, 'failed'::text, 'restricted'::text, 'superseded'::text])));
ALTER TABLE knowledge_documents ADD CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_documents ADD CONSTRAINT "knowledge_documents_source_id_fkey" FOREIGN KEY (source_id) REFERENCES regulatory_sources(id);
ALTER TABLE knowledge_documents ADD CONSTRAINT "knowledge_documents_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_source_checksum_check" CHECK ((source_checksum ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_extraction_status_check" CHECK ((extraction_status = ANY (ARRAY['pending'::text, 'extracted'::text, 'review_required'::text, 'approved'::text, 'failed'::text, 'rejected'::text])));
ALTER TABLE knowledge_document_versions ADD CONSTRAINT "knowledge_document_versions_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from)));
ALTER TABLE knowledge_documents ADD CONSTRAINT "knowledge_documents_current_version_fk" FOREIGN KEY (current_version_id) REFERENCES knowledge_document_versions(id);
ALTER TABLE knowledge_chunks ADD CONSTRAINT "knowledge_chunks_chunk_index_check" CHECK ((chunk_index >= 0));
ALTER TABLE knowledge_chunks ADD CONSTRAINT "knowledge_chunks_content_hash_check" CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE knowledge_chunks ADD CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_chunks ADD CONSTRAINT "knowledge_chunks_document_version_id_chunk_index_key" UNIQUE (document_version_id, chunk_index);
ALTER TABLE knowledge_chunks ADD CONSTRAINT "knowledge_chunks_document_version_id_fkey" FOREIGN KEY (document_version_id) REFERENCES knowledge_document_versions(id) ON DELETE CASCADE;
ALTER TABLE knowledge_ingestion_runs ADD CONSTRAINT "knowledge_ingestion_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE knowledge_ingestion_runs ADD CONSTRAINT "knowledge_ingestion_runs_chunk_count_check" CHECK ((chunk_count >= 0));
ALTER TABLE knowledge_ingestion_runs ADD CONSTRAINT "knowledge_ingestion_runs_pkey" PRIMARY KEY (id);
ALTER TABLE knowledge_ingestion_runs ADD CONSTRAINT "knowledge_ingestion_runs_document_version_id_fkey" FOREIGN KEY (document_version_id) REFERENCES knowledge_document_versions(id);
ALTER TABLE knowledge_ingestion_runs ADD CONSTRAINT "knowledge_ingestion_runs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE ai_source_citations ADD CONSTRAINT "ai_source_citations_regulatory_source_id_fkey" FOREIGN KEY (regulatory_source_id) REFERENCES regulatory_sources(id);
ALTER TABLE ai_source_citations ADD CONSTRAINT "ai_source_citations_regulatory_rule_version_id_fkey" FOREIGN KEY (regulatory_rule_version_id) REFERENCES regulatory_rule_versions(id);
ALTER TABLE ai_source_citations ADD CONSTRAINT "ai_source_citations_knowledge_chunk_id_fkey" FOREIGN KEY (knowledge_chunk_id) REFERENCES knowledge_chunks(id);
ALTER TABLE ai_runs ADD CONSTRAINT "ai_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'needs_review'::text])));
ALTER TABLE ai_runs ADD CONSTRAINT "ai_runs_review_status_check" CHECK ((review_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE ai_runs ADD CONSTRAINT "ai_runs_pkey" PRIMARY KEY (id);
ALTER TABLE ai_runs ADD CONSTRAINT "ai_runs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ai_runs ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ai_runs ADD CONSTRAINT "ai_runs_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE ai_source_citations ADD CONSTRAINT "ai_source_citations_check" CHECK ((num_nonnulls(regulatory_source_id, regulatory_rule_version_id, knowledge_chunk_id) >= 1));
ALTER TABLE ai_source_citations ADD CONSTRAINT "ai_source_citations_pkey" PRIMARY KEY (id);
ALTER TABLE ai_source_citations ADD CONSTRAINT "ai_source_citations_ai_run_id_fkey" FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE CASCADE;
ALTER TABLE ai_feedback ADD CONSTRAINT "ai_feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE ai_feedback ADD CONSTRAINT "ai_feedback_pkey" PRIMARY KEY (id);
ALTER TABLE ai_feedback ADD CONSTRAINT "ai_feedback_ai_run_id_fkey" FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE CASCADE;
ALTER TABLE ai_feedback ADD CONSTRAINT "ai_feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ai_action_requests ADD CONSTRAINT "ai_action_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'applied'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE ai_action_requests ADD CONSTRAINT "ai_action_requests_pkey" PRIMARY KEY (id);
ALTER TABLE ai_action_requests ADD CONSTRAINT "ai_action_requests_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ai_action_requests ADD CONSTRAINT "ai_action_requests_ai_run_id_fkey" FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id);
ALTER TABLE ai_action_requests ADD CONSTRAINT "ai_action_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(id);
ALTER TABLE ai_action_requests ADD CONSTRAINT "ai_action_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES users(id);

-- NEW/CHANGED FUNCTIONS (must precede policies and triggers)
CREATE OR REPLACE FUNCTION public.pke_has_facility_permission(p_facility_id uuid, p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.pks_sites s JOIN public.project_operating_profiles op ON op.primary_pks_site_id=s.id WHERE s.id=p_facility_id AND public.pke_has_project_permission(op.project_id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.pks_sites s JOIN public.inventory_lots l ON l.pks_site_id=s.id WHERE s.id=p_facility_id AND public.pke_has_project_permission(l.project_id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.pks_sites s JOIN public.vendors v ON v.organization_id=s.organization_id JOIN public.project_supplier_participation psp ON psp.vendor_id=v.id AND psp.is_active=true WHERE s.id=p_facility_id AND public.pke_has_project_permission(psp.project_id,p_permission_code)) $function$
;

CREATE OR REPLACE FUNCTION public.pke_audit_events_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN RAISE EXCEPTION 'Audit events are append-only.' USING ERRCODE='55000'; END $function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_movement_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE src record;
BEGIN
 IF TG_OP='UPDATE' OR TG_OP='DELETE' THEN
  IF OLD.status IN ('posted','reversed','adjusted') THEN RAISE EXCEPTION 'Posted inventory movements are immutable; record a compensating movement.' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.reversal_of_movement_id IS NOT NULL THEN
  SELECT * INTO src FROM public.inventory_movements WHERE id=NEW.reversal_of_movement_id FOR UPDATE;
  IF NOT FOUND OR src.status<>'posted' THEN RAISE EXCEPTION 'Only a posted movement can be reversed.' USING ERRCODE='23514'; END IF;
  IF NEW.project_id<>src.project_id OR NEW.lot_id<>src.lot_id OR NEW.quantity<>src.quantity OR NEW.unit<>src.unit OR NEW.movement_type<>'adjustment' THEN
   RAISE EXCEPTION 'Compensating movement must preserve project, lot, quantity and unit.' USING ERRCODE='23514';
  END IF;
  IF NEW.source_location IS DISTINCT FROM src.destination_location OR NEW.destination_location IS DISTINCT FROM src.source_location THEN
   RAISE EXCEPTION 'Compensating movement must reverse source and destination locations.' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_reconciliation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE pi record; ver record;
BEGIN
 SELECT project_id,amount,currency_id,instruction_status INTO pi
 FROM public.payment_instructions WHERE id=NEW.payment_instruction_id FOR UPDATE;
 IF NOT FOUND OR pi.project_id<>NEW.project_id OR pi.currency_id<>NEW.currency_id THEN
  RAISE EXCEPTION 'Payment reconciliation must match its instruction project and currency.' USING ERRCODE='23514';
 END IF;
 SELECT payment_instruction_id,verification_status,verified_amount,verified_currency_id INTO ver
 FROM public.payment_verifications WHERE id=NEW.verification_id FOR UPDATE;
 IF NOT FOUND OR ver.payment_instruction_id<>NEW.payment_instruction_id OR ver.verification_status<>'verified' THEN
  RAISE EXCEPTION 'A verified payment evidence record for this instruction is required.' USING ERRCODE='23514';
 END IF;
 IF NEW.reconciled_amount<>ver.verified_amount OR NEW.currency_id<>ver.verified_currency_id THEN
  RAISE EXCEPTION 'Reconciled amount and currency must match verified payment evidence.' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.reconciliation_status<>'pending' THEN RAISE EXCEPTION 'Reconciliation must be created as pending.' USING ERRCODE='55000'; END IF;
 ELSE
  IF OLD.reconciliation_status IN ('matched','reversed') THEN RAISE EXCEPTION 'Matched or reversed reconciliations are immutable.' USING ERRCODE='55000'; END IF;
  IF NEW.payment_instruction_id<>OLD.payment_instruction_id OR NEW.project_id<>OLD.project_id OR NEW.verification_id<>OLD.verification_id OR NEW.reconciled_amount<>OLD.reconciled_amount OR NEW.currency_id<>OLD.currency_id THEN
   RAISE EXCEPTION 'Reconciliation identity and amounts are immutable.' USING ERRCODE='55000';
  END IF;
  IF NEW.reconciliation_status='matched' THEN
   IF OLD.reconciliation_status<>'pending' OR NEW.reconciled_by IS DISTINCT FROM public.pke_current_user_id() OR NEW.reconciled_at IS NULL THEN
    RAISE EXCEPTION 'Only a pending reconciliation can be matched by the authenticated reconciler.' USING ERRCODE='42501';
   END IF;
   IF NEW.journal_entry_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.journal_entries j WHERE j.id=NEW.journal_entry_id AND j.status='posted' AND j.project_id=NEW.project_id) THEN
    RAISE EXCEPTION 'A posted journal for the same project is required to match a payment reconciliation.' USING ERRCODE='23514';
   END IF;
   IF NOT public.pke_is_platform_admin() AND NOT public.pke_has_project_permission(NEW.project_id,'payment.reconcile') THEN
    RAISE EXCEPTION 'Missing payment.reconcile permission.' USING ERRCODE='42501';
   END IF;
  ELSIF NEW.reconciliation_status='exception' THEN
   IF OLD.reconciliation_status<>'pending' OR NEW.reconciled_by IS DISTINCT FROM public.pke_current_user_id() OR NULLIF(btrim(NEW.exception_reason),'') IS NULL THEN
    RAISE EXCEPTION 'Payment exception requires authenticated actor and reason.' USING ERRCODE='42501';
   END IF;
  ELSE
   RAISE EXCEPTION 'Unsupported reconciliation transition.' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_audit_and_payment_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN RAISE EXCEPTION 'This financial/audit record is append-only.' USING ERRCODE='55000'; END $function$
;

CREATE OR REPLACE FUNCTION public.pke_has_any_project_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.project_members pm JOIN public.project_roles pr ON pr.id=pm.project_role_id AND pr.project_id=pm.project_id JOIN public.project_role_permissions prp ON prp.project_role_id=pr.id AND prp.project_id=pr.project_id JOIN public.permissions perm ON perm.id=prp.permission_id JOIN public.projects proj ON proj.id=pm.project_id JOIN public.users u ON u.id=pm.user_id WHERE pm.user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now()) AND pr.is_active=true AND proj.is_active=true AND u.is_active=true AND perm.is_active=true AND perm.code=p_permission_code) $function$
;

CREATE OR REPLACE FUNCTION public.pke_has_port_permission(p_port_id uuid, p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.project_operating_profiles op WHERE op.primary_port_id=p_port_id AND public.pke_has_project_permission(op.project_id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.shipments s WHERE s.destination_port_id=p_port_id AND public.pke_has_project_permission(s.project_id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.voyages v WHERE v.port_id=p_port_id AND public.pke_has_project_permission(v.project_id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.pks_port_routes r JOIN public.pks_sites ps ON ps.id=r.pks_site_id JOIN public.vendors vd ON vd.organization_id=ps.organization_id JOIN public.project_supplier_participation sp ON sp.vendor_id=vd.id AND sp.is_active=true WHERE r.port_id=p_port_id AND public.pke_has_project_permission(sp.project_id,p_permission_code)) $function$
;

CREATE OR REPLACE FUNCTION public.pke_has_warehouse_permission(p_warehouse_id uuid, p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.warehouse_reservations wr WHERE wr.warehouse_id=p_warehouse_id AND public.pke_has_project_permission(wr.project_id,p_permission_code)) $function$
;

CREATE OR REPLACE FUNCTION public.pke_has_payment_instruction_permission(p_instruction_id uuid, p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.payment_instructions pi WHERE pi.id=p_instruction_id AND public.pke_has_project_permission(pi.project_id,p_permission_code)) $function$
;

CREATE OR REPLACE FUNCTION public.pke_has_ai_run_permission(p_ai_run_id uuid, p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.ai_runs r WHERE r.id=p_ai_run_id AND (r.user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid OR (r.project_id IS NOT NULL AND public.pke_has_project_permission(r.project_id,p_permission_code)))) $function$
;

CREATE OR REPLACE FUNCTION public.pke_has_partner_organization_permission(p_organization_id uuid, p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT public.pke_is_platform_admin() OR EXISTS(SELECT 1 FROM public.vendors v JOIN public.project_supplier_participation sp ON sp.vendor_id=v.id AND sp.is_active=true WHERE v.organization_id=p_organization_id AND public.pke_has_project_permission(sp.project_id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.buyers b JOIN public.contract_programs cp ON cp.buyer_id=b.id JOIN public.projects p ON p.contract_program_id=cp.id WHERE b.organization_id=p_organization_id AND public.pke_has_project_permission(p.id,p_permission_code)) OR EXISTS(SELECT 1 FROM public.pks_sites s JOIN public.project_operating_profiles op ON op.primary_pks_site_id=s.id WHERE s.organization_id=p_organization_id AND public.pke_has_project_permission(op.project_id,p_permission_code)) $function$
;

CREATE OR REPLACE FUNCTION public.pke_lock_journal_line_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE parent_id uuid; parent_status text;
BEGIN
 parent_id:=CASE WHEN TG_OP='INSERT' THEN NEW.journal_entry_id ELSE OLD.journal_entry_id END;
 SELECT status INTO parent_status FROM public.journal_entries WHERE id=parent_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Journal header not found.' USING ERRCODE='23503'; END IF;
 IF parent_status='posted' THEN RAISE EXCEPTION 'Lines of a posted journal are immutable.' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND NEW.journal_entry_id<>OLD.journal_entry_id THEN
  SELECT status INTO parent_status FROM public.journal_entries WHERE id=NEW.journal_entry_id FOR UPDATE;
  IF NOT FOUND OR parent_status='posted' THEN RAISE EXCEPTION 'Cannot move a journal line into a missing or posted journal.' USING ERRCODE='55000'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_lot_counter_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF (NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity OR NEW.held_quantity IS DISTINCT FROM OLD.held_quantity)
    AND current_setting('app.inventory_counter_update',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Inventory reservation and hold counters are maintained by database workflows.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_reservation_counter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  old_reserved numeric:=0;
  new_reserved numeric:=0;
  delta numeric:=0;
  lot_id_value uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status IN ('active','partially_fulfilled') THEN
      new_reserved:=GREATEST(NEW.reserved_quantity-NEW.fulfilled_quantity,0);
    END IF;
    lot_id_value:=NEW.lot_id;
  ELSIF TG_OP='DELETE' THEN
    IF OLD.status IN ('active','partially_fulfilled') THEN
      old_reserved:=GREATEST(OLD.reserved_quantity-OLD.fulfilled_quantity,0);
    END IF;
    lot_id_value:=OLD.lot_id;
  ELSE
    IF OLD.status IN ('active','partially_fulfilled') THEN
      old_reserved:=GREATEST(OLD.reserved_quantity-OLD.fulfilled_quantity,0);
    END IF;
    IF NEW.status IN ('active','partially_fulfilled') THEN
      new_reserved:=GREATEST(NEW.reserved_quantity-NEW.fulfilled_quantity,0);
    END IF;
    lot_id_value:=NEW.lot_id;
  END IF;

  delta:=new_reserved-old_reserved;
  IF delta<>0 THEN
    PERFORM set_config('app.inventory_counter_update','on',true);
    UPDATE public.inventory_lots
       SET reserved_quantity=reserved_quantity+delta,updated_at=now()
     WHERE id=lot_id_value;
    PERFORM set_config('app.inventory_counter_update','off',true);
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_reservation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  lot public.inventory_lots%ROWTYPE;
  old_active boolean:=false;
  new_active boolean:=false;
  available_before numeric:=0;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Inventory reservation history is retained; release or expire the reservation instead.' USING ERRCODE='55000';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active'
       OR NEW.created_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.fulfilled_quantity<>0
       OR NULLIF(btrim(NEW.idempotency_key),'') IS NULL THEN
      RAISE EXCEPTION 'New reservations must begin active, be created by the authenticated user, and include an idempotency key.' USING ERRCODE='42501';
    END IF;
    NEW.reserved_at:=now();
  ELSE
    IF NEW.lot_id IS DISTINCT FROM OLD.lot_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.unit_code IS DISTINCT FROM OLD.unit_code
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
       OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
       OR NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity
       OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'Reservation identity, quantity and expiry are immutable; release and create a replacement.' USING ERRCODE='55000';
    END IF;

    IF NEW.fulfilled_quantity IS DISTINCT FROM OLD.fulfilled_quantity
       AND current_setting('app.reservation_fulfilled_update',true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Reservation fulfilled quantity is maintained by shipment allocation movements.' USING ERRCODE='42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF current_setting('app.reservation_fulfilled_update',true)='on' THEN
        IF OLD.status IN ('released','expired') THEN
          RAISE EXCEPTION 'Released or expired reservations cannot be reactivated.' USING ERRCODE='55000';
        END IF;
        IF NEW.fulfilled_quantity>=NEW.reserved_quantity THEN
          IF NEW.status<>'fulfilled' THEN
            RAISE EXCEPTION 'Fully fulfilled reservation must use fulfilled status.' USING ERRCODE='23514';
          END IF;
        ELSIF NEW.fulfilled_quantity>0 THEN
          IF NEW.status<>'partially_fulfilled' THEN
            RAISE EXCEPTION 'Partially fulfilled reservation must use partially_fulfilled status.' USING ERRCODE='23514';
          END IF;
        ELSE
          IF NEW.status<>'active' THEN
            RAISE EXCEPTION 'Reservation with no fulfilled quantity must be active.' USING ERRCODE='23514';
          END IF;
        END IF;
      ELSE
        IF OLD.status NOT IN ('active','partially_fulfilled')
           OR NEW.status NOT IN ('released','expired') THEN
          RAISE EXCEPTION 'Reservation can only be released/expired manually; fulfillment is controlled by shipment loading.' USING ERRCODE='55000';
        END IF;
        IF NEW.released_by IS DISTINCT FROM public.pke_current_user_id()
           OR NEW.released_at IS NULL
           OR NULLIF(btrim(NEW.release_reason),'') IS NULL THEN
          RAISE EXCEPTION 'Reservation release requires authenticated actor, timestamp and reason.' USING ERRCODE='42501';
        END IF;
        IF NEW.status='expired'
           AND (NEW.expires_at IS NULL OR NEW.expires_at>now()) THEN
          RAISE EXCEPTION 'A reservation cannot expire before its expiry timestamp.' USING ERRCODE='23514';
        END IF;
        IF EXISTS (
          SELECT 1 FROM public.shipment_allocations a
           WHERE a.reservation_id=OLD.id
             AND a.status IN ('allocated','partially_loaded','loaded')
        ) THEN
          RAISE EXCEPTION 'Cancel or reverse active shipment allocations before releasing a reservation.' USING ERRCODE='55000';
        END IF;
      END IF;
    ELSIF NEW.released_by IS DISTINCT FROM OLD.released_by
       OR NEW.released_at IS DISTINCT FROM OLD.released_at
       OR NEW.release_reason IS DISTINCT FROM OLD.release_reason THEN
      RAISE EXCEPTION 'Reservation release metadata is immutable after the release transition.' USING ERRCODE='55000';
    END IF;
  END IF;

  SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory lot does not exist.' USING ERRCODE='23503';
  END IF;
  IF lot.project_id<>NEW.project_id THEN
    RAISE EXCEPTION 'Reservation project must match inventory lot project.' USING ERRCODE='23514';
  END IF;
  IF lot.unit<>NEW.unit_code THEN
    RAISE EXCEPTION 'Reservation unit must match inventory lot unit.' USING ERRCODE='23514';
  END IF;
  IF NEW.shipment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shipments s WHERE s.id=NEW.shipment_id AND s.project_id=NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Reservation shipment must belong to the same project.' USING ERRCODE='23514';
  END IF;
  IF NEW.reserved_quantity<=0 OR NEW.fulfilled_quantity<0
     OR NEW.fulfilled_quantity>NEW.reserved_quantity THEN
    RAISE EXCEPTION 'Reservation and fulfilled quantities are invalid.' USING ERRCODE='23514';
  END IF;

  IF TG_OP='INSERT' THEN
    new_active:=true;
  ELSE
    old_active:=OLD.status IN ('active','partially_fulfilled');
    new_active:=NEW.status IN ('active','partially_fulfilled');
  END IF;

  IF new_active THEN
    available_before:=lot.quantity-lot.held_quantity-lot.reserved_quantity;
    IF old_active THEN
      available_before:=available_before+GREATEST(OLD.reserved_quantity-OLD.fulfilled_quantity,0);
    END IF;
    IF NEW.reserved_quantity-NEW.fulfilled_quantity>available_before THEN
      RAISE EXCEPTION 'Insufficient available lot quantity for reservation.' USING ERRCODE='23514';
    END IF;
  END IF;

  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_fx_exposure_calculate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE functional_id uuid;
BEGIN
 SELECT id INTO functional_id FROM public.currencies WHERE is_functional=true AND is_active=true;
 IF functional_id IS NULL THEN RAISE EXCEPTION 'No active functional currency is configured.' USING ERRCODE='23514'; END IF;
 IF NEW.functional_currency_id IS NOT NULL AND NEW.functional_currency_id<>functional_id THEN
  RAISE EXCEPTION 'FX exposure functional currency must match the configured company functional currency.' USING ERRCODE='23514';
 END IF;
 NEW.functional_currency_id:=functional_id;
 IF NEW.fx_rate<=0 OR NEW.original_amount<0 THEN
  RAISE EXCEPTION 'FX rate must be positive and original amount nonnegative.' USING ERRCODE='23514';
 END IF;
 IF NEW.original_currency_id=functional_id AND NEW.fx_rate<>1 THEN
  RAISE EXCEPTION 'Functional-currency exposure must use an FX rate of 1.' USING ERRCODE='23514';
 END IF;
 NEW.functional_amount:=round(NEW.original_amount*NEW.fx_rate,4);
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_hold_counter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE delta numeric:=0; lot_id_value uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status='active' THEN delta:=NEW.quantity; END IF;
  lot_id_value:=NEW.lot_id;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.status='active' THEN delta:=-OLD.quantity; END IF;
  lot_id_value:=OLD.lot_id;
 ELSE
  IF OLD.status='active' THEN delta:=delta-OLD.quantity; END IF;
  IF NEW.status='active' THEN delta:=delta+NEW.quantity; END IF;
  lot_id_value:=NEW.lot_id;
 END IF;
 IF delta<>0 THEN
  PERFORM set_config('app.inventory_counter_update','on',true);
  UPDATE public.inventory_lots SET held_quantity=held_quantity+delta,updated_at=now() WHERE id=lot_id_value;
  PERFORM set_config('app.inventory_counter_update','off',true);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_guard_journal_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 fp record;
 line_count bigint;
 total_debit numeric;
 total_credit numeric;
 has_inactive_account boolean;
 source_project uuid;
 source_status text;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Journal entries are retained for audit; void drafts or create reversal entries for posted journals.' USING ERRCODE='55000';
 END IF;
 IF OLD.status='posted' THEN
  RAISE EXCEPTION 'Posted journal entries are immutable; create a reversal entry.' USING ERRCODE='55000';
 END IF;
 IF NEW.status='posted' AND OLD.status<>'posted' THEN
  IF OLD.status<>'draft' THEN RAISE EXCEPTION 'Only a draft journal can be posted.' USING ERRCODE='55000'; END IF;
  IF NEW.project_id IS NULL THEN RAISE EXCEPTION 'A project is required for posted operational journals.' USING ERRCODE='23502'; END IF;
  IF NOT public.pke_is_platform_admin() AND NOT public.pke_has_project_permission(NEW.project_id,'accounting.post') THEN
   RAISE EXCEPTION 'The current user lacks accounting.post permission for this project.' USING ERRCODE='42501';
  END IF;
  IF NEW.fiscal_period_id IS NULL THEN RAISE EXCEPTION 'A fiscal period is required before posting.' USING ERRCODE='23502'; END IF;
  SELECT period_start,period_end,status INTO fp
    FROM public.fiscal_periods WHERE id=NEW.fiscal_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiscal period does not exist.' USING ERRCODE='23503'; END IF;
  IF fp.status<>'open' OR NEW.entry_date::date NOT BETWEEN fp.period_start AND fp.period_end THEN
   RAISE EXCEPTION 'Journal date is outside an open fiscal period.' USING ERRCODE='55000';
  END IF;
  SELECT count(*),COALESCE(sum(COALESCE(debit,0)),0),COALESCE(sum(COALESCE(credit,0)),0)
    INTO line_count,total_debit,total_credit
    FROM public.journal_lines WHERE journal_entry_id=NEW.id;
  IF line_count<2 THEN RAISE EXCEPTION 'A journal requires at least two lines.' USING ERRCODE='23514'; END IF;
  IF abs(total_debit-total_credit)>0.005 THEN
   RAISE EXCEPTION 'Journal is not balanced: debit % credit %.',total_debit,total_credit USING ERRCODE='23514';
  END IF;
  SELECT EXISTS(
   SELECT 1 FROM public.journal_lines l
   JOIN public.chart_of_accounts a ON a.id=l.account_id
   WHERE l.journal_entry_id=NEW.id AND a.is_active IS NOT TRUE
  ) INTO has_inactive_account;
  IF has_inactive_account THEN RAISE EXCEPTION 'Journal contains an inactive account.' USING ERRCODE='23514'; END IF;
  IF NEW.reversal_of_journal_entry_id IS NOT NULL THEN
   IF NEW.entry_type<>'reversal' OR NULLIF(btrim(NEW.reversal_reason),'') IS NULL THEN
    RAISE EXCEPTION 'A reversal journal requires a reversal type and reason.' USING ERRCODE='23514';
   END IF;
   SELECT project_id,status INTO source_project,source_status
    FROM public.journal_entries WHERE id=NEW.reversal_of_journal_entry_id FOR UPDATE;
   IF NOT FOUND OR source_status<>'posted' OR source_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Reversal source must be a posted journal in the same project.' USING ERRCODE='23514';
   END IF;
   IF EXISTS(
    (SELECT l.account_id,round(sum(COALESCE(l.debit,0)),4) AS debit,round(sum(COALESCE(l.credit,0)),4) AS credit
       FROM public.journal_lines l WHERE l.journal_entry_id=NEW.reversal_of_journal_entry_id GROUP BY l.account_id)
    EXCEPT
    (SELECT l.account_id,round(sum(COALESCE(l.credit,0)),4) AS debit,round(sum(COALESCE(l.debit,0)),4) AS credit
       FROM public.journal_lines l WHERE l.journal_entry_id=NEW.id GROUP BY l.account_id)
   ) OR EXISTS(
    (SELECT l.account_id,round(sum(COALESCE(l.credit,0)),4) AS debit,round(sum(COALESCE(l.debit,0)),4) AS credit
       FROM public.journal_lines l WHERE l.journal_entry_id=NEW.id GROUP BY l.account_id)
    EXCEPT
    (SELECT l.account_id,round(sum(COALESCE(l.debit,0)),4) AS debit,round(sum(COALESCE(l.credit,0)),4) AS credit
       FROM public.journal_lines l WHERE l.journal_entry_id=NEW.reversal_of_journal_entry_id GROUP BY l.account_id)
   ) THEN
    RAISE EXCEPTION 'Reversal lines must exactly reverse the source journal by account.' USING ERRCODE='23514';
   END IF;
  END IF;
  IF NEW.posted_by IS NOT NULL AND NEW.posted_by IS DISTINCT FROM public.pke_current_user_id() THEN
   RAISE EXCEPTION 'Posted actor must match the authenticated request user.' USING ERRCODE='42501';
  END IF;
  NEW.posted_at:=COALESCE(NEW.posted_at,now());
  NEW.posted_by:=COALESCE(public.pke_current_user_id(),NEW.posted_by);
  IF NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Posting actor is required.' USING ERRCODE='23502'; END IF;
 ELSIF NEW.status NOT IN ('draft','void') THEN
  RAISE EXCEPTION 'Unsupported journal status transition.' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_instruction_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  approval_decision text;
  approval_reason text;
  approval_time timestamptz;
  verified_amount numeric;
  verified_currency uuid;
  verification_actor uuid;
  rec_status text;
  rec_journal uuid;
  rec_actor uuid;
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.payment_obligation_id IS DISTINCT FROM OLD.payment_obligation_id
     OR NEW.cash_advance_id IS DISTINCT FROM OLD.cash_advance_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.instruction_number IS DISTINCT FROM OLD.instruction_number THEN
    RAISE EXCEPTION 'Payment instruction source, project, amount, currency, requester and number are immutable.'
      USING ERRCODE='55000';
  END IF;

  IF OLD.instruction_status IN ('reconciled','void','cancelled','rejected') THEN
    RAISE EXCEPTION 'Terminal payment instructions are immutable.' USING ERRCODE='55000';
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    IF NEW.instruction_status NOT IN ('approved','rejected') THEN
      RAISE EXCEPTION 'Approval/decision metadata may change only during approval or rejection.' USING ERRCODE='55000';
    END IF;
  END IF;
  IF NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    IF NEW.instruction_status<>'acknowledged' THEN
      RAISE EXCEPTION 'Executor acknowledgement metadata may change only during acknowledgement.' USING ERRCODE='55000';
    END IF;
  END IF;
  IF NEW.external_execution_date IS DISTINCT FROM OLD.external_execution_date
     OR NEW.external_reference IS DISTINCT FROM OLD.external_reference THEN
    IF NEW.instruction_status<>'executed_external' THEN
      RAISE EXCEPTION 'External execution metadata may change only during external execution recording.' USING ERRCODE='55000';
    END IF;
  END IF;
  IF (NEW.returned_by IS DISTINCT FROM OLD.returned_by
      OR NEW.returned_at IS DISTINCT FROM OLD.returned_at
      OR NEW.return_reason IS DISTINCT FROM OLD.return_reason)
     AND NEW.instruction_status<>'returned' THEN
    RAISE EXCEPTION 'Return metadata may change only when an instruction is returned.' USING ERRCODE='55000';
  END IF;

  IF NEW.instruction_status IS NOT DISTINCT FROM OLD.instruction_status THEN
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      IF OLD.instruction_status NOT IN ('draft','returned')
         OR NEW.requested_by IS DISTINCT FROM public.pke_current_user_id()
         OR (NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_project_permission(NEW.project_id,'payment.request')) THEN
        RAISE EXCEPTION 'Payment instruction notes may be edited only by the requester while draft or returned.'
          USING ERRCODE='42501';
      END IF;
    END IF;
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;

  IF OLD.instruction_status='draft' AND NEW.instruction_status='submitted' THEN
    IF NOT public.pke_is_platform_admin()
       AND NOT public.pke_has_project_permission(NEW.project_id,'payment.request') THEN
      RAISE EXCEPTION 'Missing payment.request permission.' USING ERRCODE='42501';
    END IF;
    IF NEW.requested_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
       OR NEW.acknowledged_by IS NOT NULL OR NEW.acknowledged_at IS NOT NULL
       OR NEW.external_execution_date IS NOT NULL OR NEW.external_reference IS NOT NULL THEN
      RAISE EXCEPTION 'Only the requester may submit a clean draft payment instruction.' USING ERRCODE='42501';
    END IF;

  ELSIF OLD.instruction_status='submitted' AND NEW.instruction_status='approved' THEN
    SELECT decision,decided_at INTO approval_decision,approval_time
      FROM public.payment_instruction_approvals
     WHERE payment_instruction_id=NEW.id
       AND approver_id=public.pke_current_user_id()
       AND decision='approved'
     ORDER BY decided_at DESC LIMIT 1;
    IF approval_decision IS NULL
       OR NEW.approved_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.approved_by=NEW.requested_by
       OR NEW.approved_at IS NULL
       OR NEW.approved_at IS DISTINCT FROM approval_time THEN
      RAISE EXCEPTION 'Independent authenticated approval record and matching decision time are required.'
        USING ERRCODE='42501';
    END IF;

  ELSIF OLD.instruction_status='submitted' AND NEW.instruction_status='rejected' THEN
    SELECT decision,decided_at INTO approval_decision,approval_time
      FROM public.payment_instruction_approvals
     WHERE payment_instruction_id=NEW.id
       AND approver_id=public.pke_current_user_id()
       AND decision='rejected'
     ORDER BY decided_at DESC LIMIT 1;
    IF approval_decision IS NULL
       OR NEW.approved_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.approved_by=NEW.requested_by
       OR NEW.approved_at IS DISTINCT FROM approval_time THEN
      RAISE EXCEPTION 'A recorded independent rejection by the authenticated approver is required.'
        USING ERRCODE='42501';
    END IF;

  ELSIF OLD.instruction_status='submitted' AND NEW.instruction_status='returned' THEN
    SELECT decision,reason,decided_at INTO approval_decision,approval_reason,approval_time
      FROM public.payment_instruction_approvals
     WHERE payment_instruction_id=NEW.id
       AND approver_id=public.pke_current_user_id()
       AND decision='returned'
     ORDER BY decided_at DESC LIMIT 1;
    IF approval_decision IS NULL
       OR NEW.returned_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.returned_by=NEW.requested_by
       OR NEW.returned_at IS DISTINCT FROM approval_time
       OR NULLIF(btrim(approval_reason),'') IS NULL
       OR NEW.return_reason IS DISTINCT FROM approval_reason
       OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Returning an instruction requires an independent approval record with a reason and matching timestamp.'
        USING ERRCODE='42501';
    END IF;

  ELSIF OLD.instruction_status='returned' AND NEW.instruction_status='draft' THEN
    IF NEW.requested_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.returned_by IS DISTINCT FROM OLD.returned_by
       OR NEW.returned_at IS DISTINCT FROM OLD.returned_at
       OR NEW.return_reason IS DISTINCT FROM OLD.return_reason
       OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
       OR NEW.acknowledged_by IS NOT NULL OR NEW.acknowledged_at IS NOT NULL
       OR NEW.external_execution_date IS NOT NULL OR NEW.external_reference IS NOT NULL
       OR (NOT public.pke_is_platform_admin()
           AND NOT public.pke_has_project_permission(NEW.project_id,'payment.request')) THEN
      RAISE EXCEPTION 'Only the requester may reopen a returned instruction as draft; the return decision remains in its audit history.'
        USING ERRCODE='42501';
    END IF;

  ELSIF OLD.instruction_status='approved' AND NEW.instruction_status='issued' THEN
    IF NOT public.pke_is_platform_admin()
       AND NOT public.pke_has_project_permission(NEW.project_id,'payment.instruction.issue') THEN
      RAISE EXCEPTION 'Missing payment.instruction.issue permission.' USING ERRCODE='42501';
    END IF;
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Approval metadata cannot change during issue.' USING ERRCODE='55000';
    END IF;

  ELSIF OLD.instruction_status='issued' AND NEW.instruction_status='acknowledged' THEN
    IF NEW.acknowledged_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.acknowledged_at IS NULL
       OR NEW.acknowledged_at>now()+interval '5 minutes'
       OR NEW.acknowledged_by=NEW.requested_by
       OR NEW.acknowledged_by=NEW.approved_by THEN
      RAISE EXCEPTION 'Executor acknowledgement requires an authenticated actor independent of requester and approver.'
        USING ERRCODE='42501';
    END IF;

  ELSIF OLD.instruction_status='acknowledged' AND NEW.instruction_status='executed_external' THEN
    IF NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
       OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
       OR NEW.external_execution_date IS NULL
       OR NEW.external_execution_date>now()+interval '5 minutes'
       OR NULLIF(btrim(NEW.external_reference),'') IS NULL
       OR NEW.acknowledged_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'External execution requires the acknowledged executor, a valid execution time and external reference.'
        USING ERRCODE='23514';
    END IF;

  ELSIF OLD.instruction_status='executed_external' AND NEW.instruction_status='evidence_submitted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_evidence e
       WHERE e.payment_instruction_id=NEW.id
         AND e.status IN ('submitted','under_review','accepted')
    ) THEN
      RAISE EXCEPTION 'Submitted payment evidence is required.' USING ERRCODE='23514';
    END IF;

  ELSIF OLD.instruction_status='evidence_submitted' AND NEW.instruction_status='verified' THEN
    SELECT verified_amount,verified_currency_id,verified_by
      INTO verified_amount,verified_currency,verification_actor
      FROM public.payment_verifications
     WHERE payment_instruction_id=NEW.id
       AND verification_status='verified'
     ORDER BY verified_at DESC LIMIT 1;
    IF verified_amount IS NULL OR verified_amount<>NEW.amount
       OR verified_currency<>NEW.currency_id
       OR verification_actor IS DISTINCT FROM public.pke_current_user_id()
       OR verification_actor=NEW.requested_by THEN
      RAISE EXCEPTION 'Independent Finance verification with matching amount and currency is required.'
        USING ERRCODE='23514';
    END IF;

  ELSIF OLD.instruction_status='verified' AND NEW.instruction_status='reconciled' THEN
    SELECT r.reconciliation_status,r.journal_entry_id,r.reconciled_by
      INTO rec_status,rec_journal,rec_actor
      FROM public.payment_reconciliations r
     WHERE r.payment_instruction_id=NEW.id
     ORDER BY r.reconciled_at DESC NULLS LAST LIMIT 1;
    IF rec_status<>'matched' OR rec_journal IS NULL
       OR rec_actor IS DISTINCT FROM public.pke_current_user_id()
       OR NOT EXISTS (
         SELECT 1 FROM public.journal_entries j
          WHERE j.id=rec_journal AND j.status='posted' AND j.project_id=NEW.project_id
       )
       OR (NOT public.pke_is_platform_admin()
           AND NOT public.pke_has_project_permission(NEW.project_id,'payment.reconcile')) THEN
      RAISE EXCEPTION 'Matched reconciliation by an authorized reconciler and a posted journal for the same project are required.'
        USING ERRCODE='23514';
    END IF;

  ELSIF NEW.instruction_status='cancelled'
        AND OLD.instruction_status IN ('draft','submitted','approved','returned') THEN
    IF NOT public.pke_is_platform_admin()
       AND NOT public.pke_has_project_permission(NEW.project_id,'payment.request') THEN
      RAISE EXCEPTION 'Missing permission to cancel payment instruction.' USING ERRCODE='42501';
    END IF;
    IF OLD.instruction_status IN ('draft','returned')
       AND NEW.requested_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Only the requester may cancel a draft/returned payment instruction.' USING ERRCODE='42501';
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid payment instruction state transition: % -> %.',
      OLD.instruction_status,NEW.instruction_status USING ERRCODE='55000';
  END IF;

  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN RAISE EXCEPTION 'Payment approval and verification events are append-only.' USING ERRCODE='55000'; END; $function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_instruction_release_allocations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.instruction_status IN ('cancelled','rejected')
     AND OLD.instruction_status IS DISTINCT FROM NEW.instruction_status THEN
    PERFORM set_config('app.payment_allocation_release','on',true);
    UPDATE public.payment_invoice_allocations
       SET allocation_status='released',updated_at=now()
     WHERE payment_instruction_id=NEW.id AND allocation_status='reserved';
    PERFORM set_config('app.payment_allocation_release','off',true);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_invoice_allocation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  pi record;
  invoice record;
  instruction_allocated numeric;
  invoice_reserved numeric;
  invoice_outstanding numeric;
BEGIN
  SELECT project_id,amount,currency_id,instruction_status
    INTO pi
    FROM public.payment_instructions
   WHERE id=NEW.payment_instruction_id
   FOR UPDATE;

  IF NOT FOUND OR pi.instruction_status NOT IN
     ('approved','issued','acknowledged','executed_external','evidence_submitted','verified') THEN
    RAISE EXCEPTION 'Invoice allocation is allowed only for an approved, non-terminal payment instruction.'
      USING ERRCODE='55000';
  END IF;

  IF NEW.allocation_status<>'reserved'
     OR NEW.currency_id<>pi.currency_id
     OR NEW.created_by IS DISTINCT FROM public.pke_current_user_id() THEN
    RAISE EXCEPTION 'New invoice allocation must be reserved and match instruction currency and authenticated creator.'
      USING ERRCODE='23514';
  END IF;

  SELECT COALESCE(sum(a.allocated_amount),0) INTO instruction_allocated
    FROM public.payment_invoice_allocations a
   WHERE a.payment_instruction_id=NEW.payment_instruction_id
     AND a.allocation_status<>'released';

  IF instruction_allocated+NEW.allocated_amount>pi.amount THEN
    RAISE EXCEPTION 'Invoice allocations exceed payment instruction amount.' USING ERRCODE='23514';
  END IF;

  IF NEW.ap_invoice_id IS NOT NULL THEN
    SELECT project_id,currency_id,total_amount,COALESCE(paid_amount,0) AS paid_amount,
           outstanding_amount,verification_status,dispute_reason
      INTO invoice
      FROM public.ap_invoices
     WHERE id=NEW.ap_invoice_id
     FOR UPDATE;

    IF NOT FOUND OR invoice.project_id IS DISTINCT FROM pi.project_id
       OR invoice.currency_id<>pi.currency_id
       OR invoice.verification_status<>'verified'
       OR NULLIF(btrim(invoice.dispute_reason),'') IS NOT NULL THEN
      RAISE EXCEPTION 'AP invoice must be verified, undisputed and match payment project/currency.'
        USING ERRCODE='23514';
    END IF;

    SELECT COALESCE(sum(a.allocated_amount),0) INTO invoice_reserved
      FROM public.payment_invoice_allocations a
     WHERE a.ap_invoice_id=NEW.ap_invoice_id
       AND a.allocation_status='reserved';

    invoice_outstanding:=LEAST(
      COALESCE(invoice.outstanding_amount,invoice.total_amount-invoice.paid_amount),
      invoice.total_amount-invoice.paid_amount
    );

    IF invoice_reserved+NEW.allocated_amount>invoice_outstanding THEN
      RAISE EXCEPTION 'AP invoice allocations exceed its remaining outstanding amount.' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT project_id,currency_id,total_amount,COALESCE(paid_amount,0) AS paid_amount,
           outstanding_amount,approval_status,payment_status,settlement_status
      INTO invoice
      FROM public.ar_invoices
     WHERE id=NEW.ar_invoice_id
     FOR UPDATE;

    IF NOT FOUND OR invoice.project_id IS DISTINCT FROM pi.project_id
       OR invoice.currency_id<>pi.currency_id
       OR invoice.approval_status<>'approved'
       OR invoice.payment_status NOT IN ('open','partial')
       OR invoice.settlement_status IN ('settled','disputed') THEN
      RAISE EXCEPTION 'AR invoice must be approved, open/partial, undisputed and match payment project/currency.'
        USING ERRCODE='23514';
    END IF;

    SELECT COALESCE(sum(a.allocated_amount),0) INTO invoice_reserved
      FROM public.payment_invoice_allocations a
     WHERE a.ar_invoice_id=NEW.ar_invoice_id
       AND a.allocation_status='reserved';

    invoice_outstanding:=LEAST(
      COALESCE(invoice.outstanding_amount,invoice.total_amount-invoice.paid_amount),
      invoice.total_amount-invoice.paid_amount
    );

    IF invoice_reserved+NEW.allocated_amount>invoice_outstanding THEN
      RAISE EXCEPTION 'AR invoice allocations exceed its remaining outstanding amount.' USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_lot_balance_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.quantity<>0 OR NEW.held_quantity<>0 OR NEW.reserved_quantity<>0 THEN
      RAISE EXCEPTION 'New inventory lots must start with zero on-hand, held and reserved quantities; post an opening receipt/adjustment movement.'
        USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.location IS DISTINCT FROM OLD.location)
     AND current_setting('app.inventory_movement_apply',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Inventory lot quantity/location are movement-ledger controlled; post a movement instead.'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_project_export_document_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE parent_project uuid; max_version integer;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.legal_hold OR (OLD.retention_until IS NOT NULL AND OLD.retention_until>=CURRENT_DATE)
       OR OLD.status IN ('under_review','approved') THEN
      RAISE EXCEPTION 'Document is retained or legally protected; supersede or expire it instead.' USING ERRCODE='55000';
    END IF;
    INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      project_id,before_snapshot,outcome)
    VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),'documents.delete',
      'project_document.deleted','project_export_document',OLD.id,OLD.project_id,
      jsonb_build_object('status',OLD.status,'version_no',OLD.version_no,'object_key',OLD.object_key),'success');
    RETURN OLD;
  END IF;

  IF TG_OP='INSERT' THEN
    SELECT project_id INTO parent_project FROM public.project_export_document_requirements
     WHERE id=NEW.project_requirement_id FOR UPDATE;
    IF NOT FOUND OR parent_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Document project must match its project requirement.' USING ERRCODE='23514';
    END IF;
    IF NEW.uploaded_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Uploader must match the authenticated request user.' USING ERRCODE='42501';
    END IF;
    IF NEW.status<>'uploaded' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'A new document must begin uploaded and without review metadata.' USING ERRCODE='55000';
    END IF;
    IF NEW.storage_bucket<>'pke-private-documents'
       OR NEW.object_key IS NULL
       OR NEW.file_reference IS DISTINCT FROM NEW.object_key
       OR NEW.object_key NOT LIKE 'projects/'||NEW.project_id::text||'/documents/'||NEW.project_requirement_id::text||'/%'
       OR position('..' in NEW.object_key)>0
       OR position(E'\\' in NEW.object_key)>0
       OR NEW.upload_verified_at IS NULL OR NEW.file_size_bytes IS NULL
       OR NEW.sha256_checksum IS NULL OR NEW.mime_type IS NULL OR NEW.original_filename IS NULL THEN
      RAISE EXCEPTION 'Document requires verified metadata in the private project/requirement object namespace.' USING ERRCODE='23514';
    END IF;
    IF lower(NEW.mime_type) NOT IN ('application/pdf','image/jpeg','image/png','image/webp',
                                    'application/xml','text/xml','text/csv') THEN
      RAISE EXCEPTION 'Unsupported document MIME type.' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(max(version_no),0) INTO max_version
      FROM public.project_export_documents WHERE project_requirement_id=NEW.project_requirement_id;
    IF NEW.version_no<>max_version+1 THEN
      RAISE EXCEPTION 'Document version must be sequential within the requirement.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.project_requirement_id IS DISTINCT FROM OLD.project_requirement_id
       OR NEW.file_reference IS DISTINCT FROM OLD.file_reference
       OR NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.sha256_checksum IS DISTINCT FROM OLD.sha256_checksum
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
       OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
       OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes
       OR NEW.upload_verified_at IS DISTINCT FROM OLD.upload_verified_at
       OR NEW.uploaded_content_type IS DISTINCT FROM OLD.uploaded_content_type
       OR NEW.document_type_code IS DISTINCT FROM OLD.document_type_code THEN
      RAISE EXCEPTION 'Uploaded document content, identity and version metadata are immutable.' USING ERRCODE='55000';
    END IF;
    IF OLD.legal_hold AND NOT NEW.legal_hold AND NOT public.pke_is_platform_admin() THEN
      RAISE EXCEPTION 'Only platform admin may release a legal hold.' USING ERRCODE='42501';
    END IF;
    IF OLD.retention_until IS NOT NULL AND NEW.retention_until IS NOT NULL
       AND NEW.retention_until<OLD.retention_until AND NOT public.pke_is_platform_admin() THEN
      RAISE EXCEPTION 'Document retention cannot be shortened without platform admin approval.' USING ERRCODE='42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status='uploaded' AND NEW.status='under_review' THEN
        NULL;
      ELSIF OLD.status='under_review' AND NEW.status IN ('approved','rejected') THEN
        IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
           OR NEW.reviewed_by=OLD.uploaded_by OR NEW.reviewed_at IS NULL
           OR (NEW.status='rejected' AND NULLIF(btrim(NEW.notes),'') IS NULL) THEN
          RAISE EXCEPTION 'Document review requires an independent reviewer, timestamp and rejection reason where applicable.' USING ERRCODE='42501';
        END IF;
      ELSIF OLD.status IN ('uploaded','under_review','approved','rejected','expired') AND NEW.status='superseded' THEN
        IF NOT public.pke_is_platform_admin()
           AND NOT public.pke_has_project_permission(NEW.project_id,'documents.update') THEN
          RAISE EXCEPTION 'Superseding a document requires documents.update.' USING ERRCODE='42501';
        END IF;
      ELSIF OLD.status IN ('approved','rejected') AND NEW.status='expired' THEN
        IF OLD.expiry_date IS NULL OR OLD.expiry_date>CURRENT_DATE THEN
          RAISE EXCEPTION 'A document cannot be marked expired before its expiry date.' USING ERRCODE='23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid document transition: % -> %.',OLD.status,NEW.status USING ERRCODE='55000';
      END IF;
    END IF;
  END IF;

  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.legal_hold IS DISTINCT FROM OLD.legal_hold
     OR NEW.retention_until IS DISTINCT FROM OLD.retention_until THEN
    INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      project_id,after_snapshot,metadata,outcome)
    VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
      CASE WHEN NEW.status IN ('approved','rejected') THEN 'documents.verify' ELSE 'documents.update' END,
      CASE WHEN TG_OP='INSERT' THEN 'project_document.registered' ELSE 'project_document.state_changed' END,
      'project_export_document',NEW.id,NEW.project_id,
      jsonb_build_object('status',NEW.status,'version_no',NEW.version_no,'expiry_date',NEW.expiry_date),
      jsonb_build_object('project_requirement_id',NEW.project_requirement_id,'storage_bucket',NEW.storage_bucket,
        'object_key',NEW.object_key,'sha256_checksum',NEW.sha256_checksum,'legal_hold',NEW.legal_hold,
        'retention_until',NEW.retention_until),'success');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_tracking_event_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE trip record;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Tracking events are retained for evidentiary traceability.' USING ERRCODE='55000';
  END IF;
  SELECT project_id,is_active INTO trip FROM public.truck_trips
   WHERE id=NEW.truck_trip_id FOR SHARE;
  IF NOT FOUND OR trip.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Tracking event must reference an active truck trip.' USING ERRCODE='23514';
  END IF;
  IF length(btrim(NEW.idempotency_key))=0 THEN
    RAISE EXCEPTION 'Tracking event requires an idempotency key.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.checker_id IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Tracking checker must match authenticated request user.' USING ERRCODE='42501';
    END IF;
    IF NEW.capture_timestamp>now()+interval '5 minutes' THEN
      RAISE EXCEPTION 'Tracking capture timestamp cannot be materially in the future.' USING ERRCODE='23514';
    END IF;
    NEW.status:='unverified';
    NEW.server_received_timestamp:=now();
  ELSE
    IF NEW.truck_trip_id IS DISTINCT FROM OLD.truck_trip_id
       OR NEW.event_type IS DISTINCT FROM OLD.event_type
       OR NEW.checker_id IS DISTINCT FROM OLD.checker_id
       OR NEW.latitude IS DISTINCT FROM OLD.latitude
       OR NEW.longitude IS DISTINCT FROM OLD.longitude
       OR NEW.gps_accuracy IS DISTINCT FROM OLD.gps_accuracy
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.capture_timestamp IS DISTINCT FROM OLD.capture_timestamp
       OR NEW.server_received_timestamp IS DISTINCT FROM OLD.server_received_timestamp
       OR NEW.qr_scanned IS DISTINCT FROM OLD.qr_scanned
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'Captured tracking evidence is immutable; append a new event to correct it.' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status='verified' THEN
        RAISE EXCEPTION 'Verified tracking events are immutable.' USING ERRCODE='55000';
      END IF;
      IF NEW.status NOT IN ('needs_review','location_mismatch','verified')
         OR NEW.checker_id=public.pke_current_user_id()
         OR (NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_truck_trip_permission(NEW.truck_trip_id,'logistics.update')) THEN
        RAISE EXCEPTION 'Tracking review requires a different authorized reviewer and supported review state.' USING ERRCODE='42501';
      END IF;
      IF NEW.status='verified' AND OLD.status='location_mismatch'
         AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN
        RAISE EXCEPTION 'Location-mismatch event requires an explicit reviewer note before verification.' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Tracking notes may be changed only during a formal review transition.' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      project_id,after_snapshot,metadata,outcome)
    VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
      CASE WHEN TG_OP='INSERT' THEN 'logistics.create' ELSE 'logistics.update' END,
      CASE WHEN TG_OP='INSERT' THEN 'tracking_event.captured' ELSE 'tracking_event.reviewed' END,
      'tracking_event',NEW.id,trip.project_id,
      jsonb_build_object('event_type',NEW.event_type,'status',NEW.status,
        'capture_timestamp',NEW.capture_timestamp,'server_received_timestamp',NEW.server_received_timestamp),
      jsonb_build_object('truck_trip_id',NEW.truck_trip_id,'gps_accuracy',NEW.gps_accuracy,
        'qr_scanned',NEW.qr_scanned,'source',NEW.source,'idempotency_key',NEW.idempotency_key),'success');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_movement_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE lot public.inventory_lots%ROWTYPE; src public.inventory_movements%ROWTYPE;
        new_quantity numeric; new_location text;
BEGIN
  SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory lot disappeared during movement posting.' USING ERRCODE='23503'; END IF;
  new_quantity:=lot.quantity;
  new_location:=lot.location;

  IF NEW.movement_type='receipt' THEN
    new_quantity:=lot.quantity+NEW.quantity;
    new_location:=NEW.destination_location;
  ELSIF NEW.movement_type='issue' THEN
    new_quantity:=lot.quantity-NEW.quantity;
  ELSIF NEW.movement_type='transfer' THEN
    new_location:=NEW.destination_location;
  ELSIF NEW.movement_type='adjustment' AND NEW.reversal_of_movement_id IS NULL THEN
    IF NEW.source_location IS NULL THEN
      IF lot.location IS NOT NULL AND lot.location IS DISTINCT FROM NEW.destination_location THEN
        RAISE EXCEPTION 'Positive adjustment must be recorded at the lot current location.' USING ERRCODE='23514';
      END IF;
      new_quantity:=lot.quantity+NEW.quantity;
      new_location:=COALESCE(lot.location,NEW.destination_location);
    ELSE
      IF lot.location IS DISTINCT FROM NEW.source_location
         OR NEW.quantity>lot.quantity-lot.held_quantity-lot.reserved_quantity THEN
        RAISE EXCEPTION 'Negative adjustment must come from current unreserved/unheld stock.' USING ERRCODE='23514';
      END IF;
      new_quantity:=lot.quantity-NEW.quantity;
    END IF;
  ELSIF NEW.movement_type='adjustment' AND NEW.reversal_of_movement_id IS NOT NULL THEN
    SELECT * INTO src FROM public.inventory_movements WHERE id=NEW.reversal_of_movement_id FOR SHARE;
    IF src.movement_type='receipt' THEN
      IF lot.location IS DISTINCT FROM src.destination_location
         OR NEW.quantity>lot.quantity-lot.held_quantity-lot.reserved_quantity THEN
        RAISE EXCEPTION 'Reversing a receipt requires available quantity at the original destination.' USING ERRCODE='23514';
      END IF;
      new_quantity:=lot.quantity-NEW.quantity;
    ELSIF src.movement_type='issue' THEN
      IF lot.location IS NOT NULL AND lot.location IS DISTINCT FROM src.source_location THEN
        RAISE EXCEPTION 'Reversing an issue must restore stock to the source location.' USING ERRCODE='23514';
      END IF;
      new_quantity:=lot.quantity+NEW.quantity;
      new_location:=src.source_location;
    ELSIF src.movement_type='transfer' THEN
      IF lot.location IS DISTINCT FROM src.destination_location THEN
        RAISE EXCEPTION 'Reversing a transfer requires the lot to remain at its transferred destination.' USING ERRCODE='23514';
      END IF;
      new_location:=src.source_location;
    ELSIF src.movement_type='adjustment' THEN
      IF src.source_location IS NULL THEN
        IF lot.location IS DISTINCT FROM src.destination_location
           OR NEW.quantity>lot.quantity-lot.held_quantity-lot.reserved_quantity THEN
          RAISE EXCEPTION 'Adjustment reversal lacks available stock at original location.' USING ERRCODE='23514';
        END IF;
        new_quantity:=lot.quantity-NEW.quantity;
      ELSE
        IF lot.location IS NOT NULL AND lot.location IS DISTINCT FROM src.source_location THEN
          RAISE EXCEPTION 'Adjustment reversal must restore the original location.' USING ERRCODE='23514';
        END IF;
        new_quantity:=lot.quantity+NEW.quantity;
        new_location:=src.source_location;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported source movement for reversal.' USING ERRCODE='23514';
    END IF;
  END IF;

  IF new_quantity<0 OR lot.held_quantity+lot.reserved_quantity>new_quantity THEN
    RAISE EXCEPTION 'Movement would make stock negative or below held/reserved quantity.' USING ERRCODE='23514';
  END IF;

  PERFORM set_config('app.inventory_movement_apply','on',true);
  UPDATE public.inventory_lots
     SET quantity=new_quantity,location=new_location,updated_at=now()
   WHERE id=NEW.lot_id;
  PERFORM set_config('app.inventory_movement_apply','off',true);

  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
    project_id,after_snapshot,metadata,outcome)
  VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),'inventory.create',
    'inventory.movement.posted','inventory_movement',NEW.id,NEW.project_id,
    jsonb_build_object('movement_type',NEW.movement_type,'quantity',NEW.quantity,'unit',NEW.unit,
      'lot_quantity_after',new_quantity,'location_after',new_location),
    jsonb_build_object('lot_id',NEW.lot_id,'warehouse_receipt_id',NEW.warehouse_receipt_id,
      'reversal_of_movement_id',NEW.reversal_of_movement_id,'idempotency_key',NEW.idempotency_key),'success');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_evidence_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE pi record; predecessor record;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Payment evidence is retained for audit; supersede rather than delete.' USING ERRCODE='55000';
  END IF;

  IF TG_OP='INSERT' THEN
    SELECT project_id,instruction_status INTO pi
      FROM public.payment_instructions WHERE id=NEW.payment_instruction_id FOR UPDATE;
    IF NOT FOUND OR pi.instruction_status NOT IN ('executed_external','evidence_submitted') THEN
      RAISE EXCEPTION 'Payment evidence can only be registered after external execution.' USING ERRCODE='55000';
    END IF;
    IF NEW.uploaded_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Uploader must match authenticated user.' USING ERRCODE='42501';
    END IF;
    IF NEW.status<>'submitted' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New payment evidence must begin submitted without review metadata.' USING ERRCODE='55000';
    END IF;
    IF NEW.object_bucket<>'pke-private-documents'
       OR NEW.object_key NOT LIKE 'projects/'||pi.project_id::text||'/payments/'||NEW.payment_instruction_id::text||'/%'
       OR position('..' in NEW.object_key)>0 OR position(E'\\' in NEW.object_key)>0
       OR lower(NEW.mime_type) NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
       OR NULLIF(btrim(NEW.original_filename),'') IS NULL THEN
      RAISE EXCEPTION 'Payment evidence must use the private bucket, a project/instruction key namespace, an allowed MIME type and a filename.' USING ERRCODE='23514';
    END IF;
    IF NEW.supersedes_evidence_id IS NOT NULL THEN
      SELECT payment_instruction_id,status INTO predecessor
        FROM public.payment_evidence WHERE id=NEW.supersedes_evidence_id FOR SHARE;
      IF NOT FOUND OR predecessor.payment_instruction_id<>NEW.payment_instruction_id
         OR predecessor.status IN ('superseded') THEN
        RAISE EXCEPTION 'Superseded payment evidence must belong to the same instruction and be a current version.' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payment_instruction_id IS DISTINCT FROM OLD.payment_instruction_id
     OR NEW.object_bucket IS DISTINCT FROM OLD.object_bucket
     OR NEW.object_key IS DISTINCT FROM OLD.object_key
     OR NEW.sha256_checksum IS DISTINCT FROM OLD.sha256_checksum
     OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
     OR NEW.supersedes_evidence_id IS DISTINCT FROM OLD.supersedes_evidence_id THEN
    RAISE EXCEPTION 'Payment evidence content and ownership are immutable.' USING ERRCODE='55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status='submitted' AND NEW.status='under_review' THEN
      IF NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Evidence entering review cannot yet carry a final reviewer decision.' USING ERRCODE='55000';
      END IF;
    ELSIF OLD.status='under_review' AND NEW.status IN ('accepted','rejected') THEN
      IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by=OLD.uploaded_by OR NEW.reviewed_at IS NULL
         OR (NEW.status='rejected' AND NULLIF(btrim(NEW.rejection_reason),'') IS NULL)
         OR (NEW.status='accepted' AND NEW.rejection_reason IS NOT NULL) THEN
        RAISE EXCEPTION 'Payment evidence decision requires an independent authenticated reviewer and rejection reason when rejected.' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status IN ('submitted','under_review','accepted','rejected') AND NEW.status='superseded' THEN
      IF NOT EXISTS(SELECT 1 FROM public.payment_evidence e
                    WHERE e.supersedes_evidence_id=OLD.id
                      AND e.payment_instruction_id=OLD.payment_instruction_id
                      AND e.status IN ('submitted','under_review','accepted')) THEN
        RAISE EXCEPTION 'Evidence can be superseded only when a replacement version exists for the same instruction.' USING ERRCODE='23514';
      END IF;
      IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by=OLD.uploaded_by OR NEW.reviewed_at IS NULL
         OR (NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_project_permission((SELECT project_id FROM public.payment_instructions WHERE id=OLD.payment_instruction_id),'payment.evidence.verify')) THEN
        RAISE EXCEPTION 'Superseding payment evidence requires an independent authorized reviewer.' USING ERRCODE='42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid payment evidence status transition: % -> %.',OLD.status,NEW.status USING ERRCODE='55000';
    END IF;
  ELSE
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
      RAISE EXCEPTION 'Payment evidence review metadata is immutable after the decision.' USING ERRCODE='55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_country_document_requirement_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE src record; doc_active boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('verified','active','superseded') THEN
      RAISE EXCEPTION 'Verified country requirements cannot be deleted; supersede them instead.' USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;
  IF jsonb_typeof(NEW.condition_schema)<>'object' THEN
    RAISE EXCEPTION 'Country requirement condition_schema must be a JSON object.' USING ERRCODE='23514';
  END IF;
  SELECT is_active INTO doc_active FROM public.export_document_types WHERE id=NEW.document_type_id;
  IF NOT FOUND OR doc_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Country requirement must reference an active document type.' USING ERRCODE='23514';
  END IF;
  IF NEW.verification_status='verified' OR NEW.status IN ('verified','active') THEN
    IF NEW.regulatory_source_id IS NULL OR NEW.verified_by IS NULL OR NEW.last_verified_at IS NULL THEN
      RAISE EXCEPTION 'Verified/active requirements need a linked source, verifier and timestamp.' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' OR OLD.verification_status IS DISTINCT FROM 'verified'
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.last_verified_at IS DISTINCT FROM OLD.last_verified_at THEN
      IF NEW.verified_by IS DISTINCT FROM public.pke_current_user_id() THEN
        RAISE EXCEPTION 'The user verifying a country requirement must be the recorded verifier.' USING ERRCODE='42501';
      END IF;
    END IF;
    SELECT status,verification_status,effective_date,expiry_repeal_date INTO src
      FROM public.regulatory_sources WHERE id=NEW.regulatory_source_id FOR SHARE;
    IF NOT FOUND OR src.status<>'active' OR src.verification_status<>'verified'
       OR src.effective_date>now() OR (src.expiry_repeal_date IS NOT NULL AND src.expiry_repeal_date<now()) THEN
      RAISE EXCEPTION 'Country requirement must link to a currently effective verified source.' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='active' AND (NEW.verification_status<>'verified'
     OR (NEW.effective_from IS NOT NULL AND NEW.effective_from>CURRENT_DATE)
     OR (NEW.effective_to IS NOT NULL AND NEW.effective_to<CURRENT_DATE)) THEN
    RAISE EXCEPTION 'Country requirement cannot be active before verification or outside its effective period.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' AND
     (NEW.country_code IS DISTINCT FROM OLD.country_code OR NEW.product_id IS DISTINCT FROM OLD.product_id
      OR NEW.document_type_id IS DISTINCT FROM OLD.document_type_id
      OR NEW.regulatory_source_id IS DISTINCT FROM OLD.regulatory_source_id
      OR NEW.mandatory IS DISTINCT FROM OLD.mandatory
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.effective_to IS DISTINCT FROM OLD.effective_to) THEN
    RAISE EXCEPTION 'Core content of an active country requirement is immutable; create a new version.' USING ERRCODE='55000';
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_financial_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_project_id uuid; v_target_id uuid; v_action text; v_permission text;
        v_target_type text; v_after jsonb; v_metadata jsonb;
BEGIN
  v_permission:='finance.update';
  CASE TG_TABLE_NAME
    WHEN 'payment_instructions' THEN
      IF TG_OP='UPDATE' AND OLD.instruction_status IS NOT DISTINCT FROM NEW.instruction_status THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='payment_instruction';
      v_action:='payment_instruction.status_changed'; v_permission:='payment.request';
      v_after:=jsonb_build_object('instruction_status',NEW.instruction_status,'approved_at',NEW.approved_at,
        'acknowledged_at',NEW.acknowledged_at,'external_execution_date',NEW.external_execution_date,
        'returned_at',NEW.returned_at);
      v_metadata:=jsonb_build_object('payment_obligation_id',NEW.payment_obligation_id,'cash_advance_id',NEW.cash_advance_id,
        'amount',NEW.amount,'currency_id',NEW.currency_id,'requested_by',NEW.requested_by,
        'approved_by',NEW.approved_by,'acknowledged_by',NEW.acknowledged_by,
        'returned_by',NEW.returned_by,'return_reason',NEW.return_reason,
        'external_reference_present',NULLIF(btrim(NEW.external_reference),'') IS NOT NULL);
    WHEN 'payment_instruction_approvals' THEN
      SELECT project_id INTO v_project_id FROM public.payment_instructions WHERE id=NEW.payment_instruction_id;
      v_target_id:=NEW.id; v_target_type:='payment_instruction_approval';
      v_action:='payment_instruction.approval_recorded'; v_permission:='payment.approve';
      v_after:=jsonb_build_object('decision',NEW.decision,'approver_id',NEW.approver_id,'decided_at',NEW.decided_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,'reason',NEW.reason);
    WHEN 'payment_evidence' THEN
      SELECT project_id INTO v_project_id FROM public.payment_instructions WHERE id=NEW.payment_instruction_id;
      v_target_id:=NEW.id; v_target_type:='payment_evidence';
      v_action:=CASE WHEN TG_OP='INSERT' THEN 'payment_evidence.registered' ELSE 'payment_evidence.reviewed' END;
      v_permission:=CASE WHEN TG_OP='INSERT' THEN 'payment.request' ELSE 'payment.evidence.verify' END;
      v_after:=jsonb_build_object('status',NEW.status,'mime_type',NEW.mime_type,'file_size_bytes',NEW.file_size_bytes,
        'sha256_checksum',NEW.sha256_checksum,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,
        'object_bucket',NEW.object_bucket,'object_key',NEW.object_key,'supersedes_evidence_id',NEW.supersedes_evidence_id);
    WHEN 'payment_verifications' THEN
      SELECT project_id INTO v_project_id FROM public.payment_instructions WHERE id=NEW.payment_instruction_id;
      v_target_id:=NEW.id; v_target_type:='payment_verification'; v_action:='payment_evidence.verified';
      v_permission:='payment.evidence.verify';
      v_after:=jsonb_build_object('verification_status',NEW.verification_status,'verified_amount',NEW.verified_amount,
        'verified_currency_id',NEW.verified_currency_id,'verified_execution_date',NEW.verified_execution_date,
        'verified_by',NEW.verified_by,'verified_at',NEW.verified_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,'evidence_id',NEW.evidence_id);
    WHEN 'payment_reconciliations' THEN
      IF TG_OP='UPDATE' AND OLD.reconciliation_status IS NOT DISTINCT FROM NEW.reconciliation_status THEN RETURN NEW; END IF;
      IF NEW.reconciliation_status='matched' THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='payment_reconciliation';
      v_action:=CASE WHEN TG_OP='INSERT' THEN 'payment_reconciliation.created' ELSE 'payment_reconciliation.exception' END;
      v_permission:='payment.reconcile';
      v_after:=jsonb_build_object('reconciliation_status',NEW.reconciliation_status,'reconciled_amount',NEW.reconciled_amount,
        'currency_id',NEW.currency_id,'reconciled_by',NEW.reconciled_by,'reconciled_at',NEW.reconciled_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,
        'verification_id',NEW.verification_id,'exception_reason',NEW.exception_reason);
    WHEN 'payment_obligations' THEN
      IF TG_OP='UPDATE' AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status
         AND OLD.amount_paid IS NOT DISTINCT FROM NEW.amount_paid
         AND OLD.approval_status IS NOT DISTINCT FROM NEW.approval_status THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='payment_obligation';
      v_action:='payment_obligation.state_changed'; v_permission:='finance.update';
      v_after:=jsonb_build_object('approval_status',NEW.approval_status,'payment_status',NEW.payment_status,
        'amount_paid',NEW.amount_paid,'amount',NEW.amount);
      v_metadata:=jsonb_build_object('cost_obligation_id',NEW.cost_obligation_id,'currency_id',NEW.currency_id);
    WHEN 'cash_advances' THEN
      IF TG_OP='UPDATE' AND OLD.approval_status IS NOT DISTINCT FROM NEW.approval_status
         AND OLD.disbursement_status IS NOT DISTINCT FROM NEW.disbursement_status
         AND OLD.expense_submission_status IS NOT DISTINCT FROM NEW.expense_submission_status
         AND OLD.settled_status IS NOT DISTINCT FROM NEW.settled_status
         AND OLD.remaining_balance IS NOT DISTINCT FROM NEW.remaining_balance
         AND OLD.refund_amount IS NOT DISTINCT FROM NEW.refund_amount THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='cash_advance';
      v_action:='cash_advance.state_changed'; v_permission:='finance.update';
      v_after:=jsonb_build_object('approval_status',NEW.approval_status,'disbursement_status',NEW.disbursement_status,
        'expense_submission_status',NEW.expense_submission_status,'settled_status',NEW.settled_status,
        'remaining_balance',NEW.remaining_balance,'refund_amount',NEW.refund_amount);
      v_metadata:=jsonb_build_object('requestor_id',NEW.requestor_id,'amount',NEW.amount,'currency_id',NEW.currency_id);
    WHEN 'ap_invoices' THEN
      IF TG_OP='UPDATE' AND OLD.paid_amount IS NOT DISTINCT FROM NEW.paid_amount
         AND OLD.outstanding_amount IS NOT DISTINCT FROM NEW.outstanding_amount
         AND OLD.verification_status IS NOT DISTINCT FROM NEW.verification_status THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='ap_invoice';
      v_action:='ap_invoice.state_changed'; v_permission:='finance.update';
      v_after:=jsonb_build_object('verification_status',NEW.verification_status,'paid_amount',NEW.paid_amount,
        'outstanding_amount',NEW.outstanding_amount,'total_amount',NEW.total_amount);
      v_metadata:=jsonb_build_object('invoice_number',NEW.invoice_number,'supplier_id',NEW.supplier_id,'currency_id',NEW.currency_id);
    WHEN 'ar_invoices' THEN
      IF TG_OP='UPDATE' AND OLD.paid_amount IS NOT DISTINCT FROM NEW.paid_amount
         AND OLD.outstanding_amount IS NOT DISTINCT FROM NEW.outstanding_amount
         AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status
         AND OLD.settlement_status IS NOT DISTINCT FROM NEW.settlement_status THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='ar_invoice';
      v_action:='ar_invoice.state_changed'; v_permission:='finance.update';
      v_after:=jsonb_build_object('payment_status',NEW.payment_status,'settlement_status',NEW.settlement_status,
        'paid_amount',NEW.paid_amount,'outstanding_amount',NEW.outstanding_amount,'total_amount',NEW.total_amount);
      v_metadata:=jsonb_build_object('invoice_number',NEW.invoice_number,'buyer_id',NEW.buyer_id,'currency_id',NEW.currency_id);
    ELSE
      RAISE EXCEPTION 'Unsupported financial audit trigger table: %',TG_TABLE_NAME USING ERRCODE='0A000';
  END CASE;

  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
    project_id,after_snapshot,metadata,outcome)
  VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
    v_permission,v_action,v_target_type,v_target_id,v_project_id,v_after,v_metadata,'success');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_project_document_requirement_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE project_country character(2); req record;
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.project_export_documents d WHERE d.project_requirement_id=OLD.id) THEN
      RAISE EXCEPTION 'A project requirement with document history cannot be deleted.' USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;
  SELECT export_country_code INTO project_country FROM public.projects WHERE id=NEW.project_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project requirement references a missing project.' USING ERRCODE='23503'; END IF;
  SELECT country_code,mandatory,status,verification_status,effective_from,effective_to
    INTO req FROM public.country_export_document_requirements WHERE id=NEW.country_requirement_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project requirement references a missing country requirement.' USING ERRCODE='23503'; END IF;
  IF project_country IS NULL OR project_country<>req.country_code THEN
    RAISE EXCEPTION 'Country requirement must match the project export destination.' USING ERRCODE='23514';
  END IF;
  IF req.status<>'active' OR req.verification_status<>'verified'
     OR (req.effective_from IS NOT NULL AND req.effective_from>CURRENT_DATE)
     OR (req.effective_to IS NOT NULL AND req.effective_to<CURRENT_DATE) THEN
    RAISE EXCEPTION 'Only current verified country requirements can be attached to a project.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' THEN RAISE EXCEPTION 'New project document requirements must begin pending.' USING ERRCODE='55000'; END IF;
    NEW.is_required:=req.mandatory;
    NEW.override_reason:=NULL;
    NEW.overridden_by:=NULL;
  ELSE
    IF NEW.status IN ('waived','not_applicable') OR NEW.is_required IS DISTINCT FROM OLD.is_required THEN
      IF NULLIF(btrim(NEW.override_reason),'') IS NULL
         OR NEW.overridden_by IS DISTINCT FROM public.pke_current_user_id()
         OR (NOT public.pke_is_platform_admin() AND NOT public.pke_has_project_permission(NEW.project_id,'documents.manage')) THEN
        RAISE EXCEPTION 'Requirement overrides need a reason and authorized authenticated actor.' USING ERRCODE='42501';
      END IF;
    END IF;
    IF OLD.status IN ('waived','not_applicable') AND NEW.status NOT IN ('waived','not_applicable')
       AND NOT public.pke_is_platform_admin()
       AND NOT public.pke_has_project_permission(NEW.project_id,'documents.manage') THEN
      RAISE EXCEPTION 'Reopening a waived requirement requires documents.manage permission.' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.status='completed' AND NOT EXISTS(
    SELECT 1 FROM public.project_export_documents d WHERE d.project_requirement_id=NEW.id
      AND d.status='approved' AND (d.expiry_date IS NULL OR d.expiry_date>=CURRENT_DATE)) THEN
    RAISE EXCEPTION 'A requirement can be completed only with an approved, non-expired document.' USING ERRCODE='23514';
  END IF;
  NEW.updated_at:=now();
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.is_required IS DISTINCT FROM OLD.is_required THEN
    INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,after_snapshot,metadata,outcome)
    VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
      CASE WHEN NEW.status IN ('waived','not_applicable') THEN 'documents.manage' ELSE 'documents.update' END,
      CASE WHEN TG_OP='INSERT' THEN 'project_document_requirement.created' ELSE 'project_document_requirement.state_changed' END,
      'project_export_document_requirement',NEW.id,NEW.project_id,
      jsonb_build_object('status',NEW.status,'is_required',NEW.is_required),
      jsonb_build_object('country_requirement_id',NEW.country_requirement_id,'override_reason',NEW.override_reason),'success');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_assessment_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p_id uuid; action_name text; t_type text; after_data jsonb; metadata_data jsonb;
BEGIN
  IF TG_TABLE_NAME='regulatory_assessments' THEN
    IF TG_OP='UPDATE' AND OLD.overall_status IS NOT DISTINCT FROM NEW.overall_status
       AND OLD.reviewed_by IS NOT DISTINCT FROM NEW.reviewed_by
       AND OLD.reviewed_at IS NOT DISTINCT FROM NEW.reviewed_at THEN
      RETURN NEW;
    END IF;
    p_id:=NEW.project_id;
    t_type:='regulatory_assessment';
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'regulatory_assessment.created' ELSE 'regulatory_assessment.reviewed' END;
    after_data:=jsonb_build_object('overall_status',NEW.overall_status,'failed_count',NEW.failed_count,
      'pending_count',NEW.pending_count,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at);
    metadata_data:=jsonb_build_object('shipment_id',NEW.shipment_id,'product_id',NEW.product_id,
      'destination_country',NEW.destination_country,'assessment_date',NEW.assessment_date);
  ELSE
    SELECT project_id INTO p_id FROM public.regulatory_assessments WHERE id=NEW.assessment_id;
    t_type:='regulatory_assessment_result';
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'regulatory_rule.evaluated' ELSE 'regulatory_rule.result_reviewed' END;
    after_data:=jsonb_build_object('result_status',NEW.result_status,'reason',NEW.reason,
      'reviewer_id',NEW.reviewer_id,'reviewed_at',NEW.reviewed_at,'evaluated_at',NEW.evaluated_at);
    metadata_data:=jsonb_build_object('assessment_id',NEW.assessment_id,'rule_version_id',NEW.rule_version_id,
      'required_documents',NEW.required_documents,'missing_documents',NEW.missing_documents);
  END IF;
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
    project_id,after_snapshot,metadata,outcome)
  VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
    'compliance.assess',action_name,t_type,NEW.id,p_id,after_data,metadata_data,'success');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_child_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_status text; is_active_doc boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT status INTO v_status FROM public.regulatory_rule_versions WHERE id=OLD.rule_version_id FOR UPDATE;
    IF NOT FOUND OR v_status<>'draft' THEN
      RAISE EXCEPTION 'Conditions and document requirements can be deleted only while their parent rule version is draft.' USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO v_status FROM public.regulatory_rule_versions WHERE id=NEW.rule_version_id FOR UPDATE;
  IF NOT FOUND OR v_status<>'draft' THEN
    RAISE EXCEPTION 'Conditions and document requirements can be modified only while their parent rule version is draft.' USING ERRCODE='55000';
  END IF;

  IF TG_TABLE_NAME='regulatory_rule_conditions' THEN
    IF NULLIF(btrim(NEW.field_path),'') IS NULL OR NEW.condition_group<1 THEN
      RAISE EXCEPTION 'Rule condition requires a field path and positive condition group.' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT is_active INTO is_active_doc FROM public.export_document_types WHERE id=NEW.document_type_id;
    IF NOT FOUND OR is_active_doc IS NOT TRUE OR jsonb_typeof(NEW.condition_schema)<>'object' THEN
      RAISE EXCEPTION 'Rule document requirement must use an active document type and JSON object condition.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_invoice_allocation_mutation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Payment invoice allocation history is retained; release reserved allocation rather than deleting it.' USING ERRCODE='55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.payment_instruction_id IS DISTINCT FROM OLD.payment_instruction_id
     OR NEW.ap_invoice_id IS DISTINCT FROM OLD.ap_invoice_id
     OR NEW.ar_invoice_id IS DISTINCT FROM OLD.ar_invoice_id
     OR NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
     OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Payment invoice allocation identity and amount are immutable.' USING ERRCODE='55000';
  END IF;
  IF NEW.allocation_status IS NOT DISTINCT FROM OLD.allocation_status THEN
    IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION 'Allocation updated_at is database managed.' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.allocation_status='reserved' AND NEW.allocation_status='applied'
     AND current_setting('app.payment_allocation_apply',true)='on' THEN
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;
  IF OLD.allocation_status='reserved' AND NEW.allocation_status='released'
     AND current_setting('app.payment_allocation_release',true)='on' THEN
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Payment invoice allocation state can change only through the verified reconciliation or cancellation workflow.' USING ERRCODE='55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_history_delete_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RAISE EXCEPTION '% history is retained; use a terminal status transition rather than deleting the row.',TG_TABLE_NAME
    USING ERRCODE='55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_hold_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.placed_by IS DISTINCT FROM public.pke_current_user_id()
       OR NULLIF(btrim(NEW.reason),'') IS NULL THEN
      RAISE EXCEPTION 'New inventory holds must begin active with an authenticated placer and reason.' USING ERRCODE='42501';
    END IF;
    NEW.placed_at:=now();
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.lot_id IS DISTINCT FROM OLD.lot_id OR NEW.hold_type IS DISTINCT FROM OLD.hold_type
       OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.unit_code IS DISTINCT FROM OLD.unit_code
       OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.placed_by IS DISTINCT FROM OLD.placed_by
       OR NEW.placed_at IS DISTINCT FROM OLD.placed_at THEN
      RAISE EXCEPTION 'Inventory hold identity and quantity are immutable; release and create a new hold.' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status<>'active' OR NEW.status<>'released'
         OR NEW.released_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.released_at IS NULL OR NULLIF(btrim(NEW.release_reason),'') IS NULL THEN
        RAISE EXCEPTION 'An active hold can only be released by an authenticated actor with a timestamp and reason.' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.released_by IS DISTINCT FROM OLD.released_by
       OR NEW.released_at IS DISTINCT FROM OLD.released_at
       OR NEW.release_reason IS DISTINCT FROM OLD.release_reason THEN
      RAISE EXCEPTION 'Hold release metadata is immutable after release.' USING ERRCODE='55000';
    END IF;
    NEW.updated_at:=now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_state_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  project_value uuid;
  target_value uuid;
  target_name text;
  action_name text;
  permission_value text;
  after_value jsonb;
  metadata_value jsonb;
BEGIN
  IF TG_TABLE_NAME='inventory_holds' THEN
    IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    project_value:=NEW.project_id;
    target_value:=NEW.id;
    target_name:='inventory_hold';
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'inventory_hold.created' ELSE 'inventory_hold.released' END;
    permission_value:='inventory.hold';
    after_value:=jsonb_build_object('status',NEW.status,'quantity',NEW.quantity,'hold_type',NEW.hold_type);
    metadata_value:=jsonb_build_object('lot_id',NEW.lot_id,'placed_by',NEW.placed_by,
      'released_by',NEW.released_by,'release_reason',NEW.release_reason);

  ELSIF TG_TABLE_NAME='inventory_reservations' THEN
    IF TG_OP='UPDATE'
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.fulfilled_quantity IS NOT DISTINCT FROM OLD.fulfilled_quantity THEN
      RETURN NEW;
    END IF;
    project_value:=NEW.project_id;
    target_value:=NEW.id;
    target_name:='inventory_reservation';
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'inventory_reservation.created' ELSE 'inventory_reservation.state_changed' END;
    permission_value:='inventory.reserve';
    after_value:=jsonb_build_object('status',NEW.status,'reserved_quantity',NEW.reserved_quantity,
      'fulfilled_quantity',NEW.fulfilled_quantity,'unit_code',NEW.unit_code);
    metadata_value:=jsonb_build_object('lot_id',NEW.lot_id,'shipment_id',NEW.shipment_id,
      'buyer_id',NEW.buyer_id,'expires_at',NEW.expires_at,'idempotency_key',NEW.idempotency_key,
      'released_by',NEW.released_by,'release_reason',NEW.release_reason);

  ELSIF TG_TABLE_NAME='shipment_allocations' THEN
    IF TG_OP='UPDATE'
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.loaded_quantity IS NOT DISTINCT FROM OLD.loaded_quantity THEN
      RETURN NEW;
    END IF;
    project_value:=NEW.project_id;
    target_value:=NEW.id;
    target_name:='shipment_allocation';
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'shipment_allocation.created' ELSE 'shipment_allocation.state_changed' END;
    permission_value:='shipping.update';
    after_value:=jsonb_build_object('status',NEW.status,'allocated_quantity',NEW.allocated_quantity,
      'loaded_quantity',NEW.loaded_quantity,'unit',NEW.unit);
    metadata_value:=jsonb_build_object('shipment_id',NEW.shipment_id,'lot_id',NEW.lot_id,
      'reservation_id',NEW.reservation_id,'idempotency_key',NEW.idempotency_key,
      'reversal_reason',NEW.reversal_reason);
  ELSE
    RAISE EXCEPTION 'Unsupported inventory audit trigger table: %',TG_TABLE_NAME USING ERRCODE='0A000';
  END IF;

  INSERT INTO public.audit_events(
    actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
    project_id,after_snapshot,metadata,outcome
  ) VALUES (
    public.pke_current_user_id(),'user',current_setting('app.current_role',true),
    permission_value,action_name,target_name,target_value,
    project_value,after_value,metadata_value,'success'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_assessment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE result_failed integer; result_pending integer; result_total integer;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.assessed_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Assessment actor must match authenticated user.' USING ERRCODE='42501';
    END IF;
    IF NEW.project_id IS NULL THEN
      IF NOT public.pke_is_platform_admin() THEN
        RAISE EXCEPTION 'Global regulatory assessments are restricted to platform administrators.' USING ERRCODE='42501';
      END IF;
    ELSIF NOT public.pke_is_platform_admin()
       AND NOT public.pke_has_project_permission(NEW.project_id,'compliance.assess') THEN
      RAISE EXCEPTION 'Missing compliance.assess permission for the project.' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(NEW.input_snapshot)<>'object'
       OR jsonb_typeof(NEW.ruleset_version_snapshot)<>'object' THEN
      RAISE EXCEPTION 'Assessment input and ruleset snapshots must be JSON objects.' USING ERRCODE='23514';
    END IF;
    IF NEW.overall_status NOT IN ('pending','manual_review')
       OR NEW.failed_count<>0 OR NEW.pending_count<>0
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'A new assessment must begin pending/manual_review with zero counts and no reviewer metadata.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.product_hs_classification_id IS DISTINCT FROM OLD.product_hs_classification_id
       OR NEW.origin_country IS DISTINCT FROM OLD.origin_country
       OR NEW.destination_country IS DISTINCT FROM OLD.destination_country
       OR NEW.assessment_date IS DISTINCT FROM OLD.assessment_date
       OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
       OR NEW.ruleset_version_snapshot IS DISTINCT FROM OLD.ruleset_version_snapshot
       OR NEW.assessed_by IS DISTINCT FROM OLD.assessed_by THEN
      RAISE EXCEPTION 'Regulatory assessment identity and source snapshots are immutable.' USING ERRCODE='55000';
    END IF;

    IF NEW.overall_status IS DISTINCT FROM OLD.overall_status THEN
      IF OLD.overall_status NOT IN ('pending','manual_review')
         OR NEW.overall_status NOT IN ('pass','fail','not_applicable')
         OR NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by=OLD.assessed_by
         OR NEW.reviewed_at IS NULL
         OR (NEW.project_id IS NOT NULL AND NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_project_permission(NEW.project_id,'compliance.assess'))
         OR (NEW.project_id IS NULL AND NOT public.pke_is_platform_admin()) THEN
        RAISE EXCEPTION 'Final assessment review requires an independent authenticated assessor with compliance permission.' USING ERRCODE='42501';
      END IF;

      SELECT count(*) FILTER (WHERE result_status='fail')::integer,
             count(*) FILTER (WHERE result_status IN ('pending','manual_review'))::integer,
             count(*)::integer
        INTO result_failed,result_pending,result_total
        FROM public.regulatory_assessment_results WHERE assessment_id=NEW.id;

      NEW.failed_count:=COALESCE(result_failed,0);
      NEW.pending_count:=COALESCE(result_pending,0);

      IF NEW.overall_status='pass'
         AND (COALESCE(result_total,0)=0 OR NEW.failed_count>0 OR NEW.pending_count>0) THEN
        RAISE EXCEPTION 'An assessment cannot pass without evaluated rules or while failed, pending or manual-review rules remain.'
          USING ERRCODE='23514';
      END IF;
      IF NEW.overall_status='fail' AND NEW.failed_count=0 THEN
        RAISE EXCEPTION 'A failed assessment requires at least one failed rule.' USING ERRCODE='23514';
      END IF;
      IF NEW.overall_status='not_applicable' AND
         (COALESCE(result_total,0)=0 OR EXISTS(
           SELECT 1 FROM public.regulatory_assessment_results
            WHERE assessment_id=NEW.id AND result_status<>'not_applicable'
         )) THEN
        RAISE EXCEPTION 'An assessment may be not_applicable only when every evaluated rule is not_applicable.' USING ERRCODE='23514';
      END IF;

    ELSIF NEW.failed_count IS DISTINCT FROM OLD.failed_count
       OR NEW.pending_count IS DISTINCT FROM OLD.pending_count THEN
      IF current_setting('app.assessment_result_count_update',true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Assessment counts are maintained only by the result ledger.' USING ERRCODE='42501';
      END IF;
      SELECT count(*) FILTER (WHERE result_status='fail')::integer,
             count(*) FILTER (WHERE result_status IN ('pending','manual_review'))::integer
        INTO result_failed,result_pending
        FROM public.regulatory_assessment_results WHERE assessment_id=NEW.id;
      IF NEW.failed_count<>COALESCE(result_failed,0)
         OR NEW.pending_count<>COALESCE(result_pending,0) THEN
        RAISE EXCEPTION 'Assessment counts must reconcile exactly to its result rows.' USING ERRCODE='23514';
      END IF;
      IF OLD.overall_status NOT IN ('pending','manual_review') THEN
        RAISE EXCEPTION 'Final assessment counts are immutable.' USING ERRCODE='55000';
      END IF;
    ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Assessment reviewer metadata changes only during final review.' USING ERRCODE='55000';
    END IF;
  END IF;

  IF NEW.shipment_id IS NOT NULL THEN
    IF NEW.project_id IS NULL THEN
      RAISE EXCEPTION 'A shipment-bound assessment must specify its project.' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.shipments s WHERE s.id=NEW.shipment_id AND s.project_id=NEW.project_id) THEN
      RAISE EXCEPTION 'Assessment shipment must belong to the same project.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_shipment_allocation_post_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  reservation_row record;
  total_loaded numeric;
  delta_loaded numeric;
  lot_location text;
  movement_row record;
  remaining_allocations integer;
  next_reservation_status text;
  allocation_reason text;
BEGIN
  IF NEW.reservation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status='reversed' AND OLD.status IN ('partially_loaded','loaded') THEN
    -- Restore every posted outbound movement by inserting a distinct compensating movement.
    FOR movement_row IN
      SELECT id,project_id,lot_id,quantity,unit,source_location,destination_location
        FROM public.inventory_movements
       WHERE reference_type='shipment_allocation'
         AND reference_id=NEW.id
         AND movement_type='issue'
         AND status='posted'
         AND reversal_of_movement_id IS NULL
       FOR UPDATE
    LOOP
      INSERT INTO public.inventory_movements(
        project_id,lot_id,movement_type,quantity,unit,
        source_location,destination_location,reason,actor_id,"timestamp",
        reference_id,reference_type,status,reversal_of_movement_id,idempotency_key
      ) VALUES (
        movement_row.project_id,movement_row.lot_id,'adjustment',movement_row.quantity,movement_row.unit,
        movement_row.destination_location,movement_row.source_location,
        'Reversal of shipment allocation '||NEW.id::text,
        public.pke_current_user_id(),now(),NEW.id,'shipment_allocation','reversed',
        movement_row.id,
        'shipment-allocation:'||NEW.id::text||':reverse:'||movement_row.id::text
      );
    END LOOP;

    SELECT reserved_quantity,status INTO reservation_row
      FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shipment allocation reservation does not exist.' USING ERRCODE='23503';
    END IF;

    SELECT COALESCE(sum(loaded_quantity),0) INTO total_loaded
      FROM public.shipment_allocations
     WHERE reservation_id=NEW.reservation_id
       AND status IN ('allocated','partially_loaded','loaded');

    next_reservation_status:=CASE
      WHEN total_loaded>=reservation_row.reserved_quantity THEN 'fulfilled'
      WHEN total_loaded>0 THEN 'partially_fulfilled'
      ELSE 'active'
    END;

    PERFORM set_config('app.reservation_fulfilled_update','on',true);
    UPDATE public.inventory_reservations
       SET fulfilled_quantity=total_loaded,
           status=next_reservation_status,
           updated_at=now()
     WHERE id=NEW.reservation_id;
    PERFORM set_config('app.reservation_fulfilled_update','off',true);

  ELSIF NEW.status='cancelled' AND OLD.status IN ('draft','allocated') THEN
    SELECT count(*) INTO remaining_allocations
      FROM public.shipment_allocations
     WHERE reservation_id=NEW.reservation_id
       AND status IN ('allocated','partially_loaded','loaded');

    IF remaining_allocations=0 THEN
      SELECT status INTO reservation_row
        FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
      IF FOUND AND reservation_row.status IN ('active','partially_fulfilled') THEN
        UPDATE public.inventory_reservations
           SET status='released',
               released_by=public.pke_current_user_id(),
               released_at=now(),
               release_reason='Shipment allocation cancelled: '||NEW.id::text,
               updated_at=now()
         WHERE id=NEW.reservation_id;
      END IF;
    END IF;

  ELSE
    delta_loaded:=NEW.loaded_quantity-OLD.loaded_quantity;
    IF delta_loaded>0 THEN
      SELECT reserved_quantity INTO reservation_row
        FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Shipment allocation reservation does not exist.' USING ERRCODE='23503';
      END IF;

      SELECT COALESCE(sum(loaded_quantity),0) INTO total_loaded
        FROM public.shipment_allocations
       WHERE reservation_id=NEW.reservation_id
         AND status IN ('allocated','partially_loaded','loaded');

      IF total_loaded>reservation_row.reserved_quantity THEN
        RAISE EXCEPTION 'Total loaded allocation exceeds reservation quantity.' USING ERRCODE='23514';
      END IF;

      next_reservation_status:=CASE
        WHEN total_loaded>=reservation_row.reserved_quantity THEN 'fulfilled'
        WHEN total_loaded>0 THEN 'partially_fulfilled'
        ELSE 'active'
      END;

      -- Release the consumed reservation quantity first, then issue the same amount
      -- from on-hand stock. Both operations are in this row's transaction.
      PERFORM set_config('app.reservation_fulfilled_update','on',true);
      UPDATE public.inventory_reservations
         SET fulfilled_quantity=total_loaded,
             status=next_reservation_status,
             updated_at=now()
       WHERE id=NEW.reservation_id;
      PERFORM set_config('app.reservation_fulfilled_update','off',true);

      SELECT location INTO lot_location
        FROM public.inventory_lots WHERE id=NEW.lot_id FOR SHARE;
      IF NULLIF(btrim(lot_location),'') IS NULL THEN
        RAISE EXCEPTION 'Inventory lot must have a current location before loading.' USING ERRCODE='23514';
      END IF;

      INSERT INTO public.inventory_movements(
        project_id,lot_id,movement_type,quantity,unit,source_location,destination_location,
        reason,actor_id,"timestamp",reference_id,reference_type,status,idempotency_key
      ) VALUES (
        NEW.project_id,NEW.lot_id,'issue',delta_loaded,NEW.unit,lot_location,NULL,
        'Outbound loading for shipment allocation '||NEW.id::text,
        public.pke_current_user_id(),now(),NEW.id,'shipment_allocation','posted',
        'shipment-allocation:'||NEW.id::text||':load:'||NEW.loaded_quantity::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_fiscal_period_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE overlapping integer;
BEGIN
 PERFORM pg_advisory_xact_lock(9124,1);
 IF TG_OP='UPDATE' AND OLD.status IN ('closed','locked') AND NEW.status<>OLD.status THEN
  RAISE EXCEPTION 'Closed or locked fiscal periods cannot be reopened or changed.' USING ERRCODE='55000';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.period_start<>OLD.period_start OR NEW.period_end<>OLD.period_end) AND EXISTS(SELECT 1 FROM public.journal_entries je WHERE je.fiscal_period_id=OLD.id AND je.status='posted') THEN
  RAISE EXCEPTION 'A fiscal period containing posted journals cannot have its date range changed.' USING ERRCODE='55000';
 END IF;
 SELECT count(*) INTO overlapping FROM public.fiscal_periods p
 WHERE p.id IS DISTINCT FROM CASE WHEN TG_OP='UPDATE' THEN OLD.id ELSE NULL END
   AND daterange(p.period_start,p.period_end,'[]') && daterange(NEW.period_start,NEW.period_end,'[]');
 IF overlapping>0 THEN RAISE EXCEPTION 'Fiscal period date ranges cannot overlap.' USING ERRCODE='23505'; END IF;
 IF NEW.status IN ('closed','locked') AND EXISTS(SELECT 1 FROM public.journal_entries je WHERE je.fiscal_period_id=NEW.id AND je.status='draft') THEN
  RAISE EXCEPTION 'A fiscal period with draft journal entries cannot be closed.' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_assessment_result_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE a record; v record;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory assessment results are retained as compliance evidence.' USING ERRCODE='55000';
  END IF;
  SELECT project_id,assessed_by,assessment_date,overall_status
    INTO a FROM public.regulatory_assessments WHERE id=NEW.assessment_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment result requires a valid parent assessment.' USING ERRCODE='23503';
  END IF;
  IF a.overall_status NOT IN ('pending','manual_review') THEN
    RAISE EXCEPTION 'Results of a final assessment are immutable; create a new assessment to reevaluate.' USING ERRCODE='55000';
  END IF;
  SELECT status,effective_from,effective_to
    INTO v FROM public.regulatory_rule_versions WHERE id=NEW.rule_version_id FOR SHARE;
  IF NOT FOUND OR v.status NOT IN ('approved','effective')
     OR a.assessment_date<v.effective_from
     OR (v.effective_to IS NOT NULL AND a.assessment_date>v.effective_to) THEN
    RAISE EXCEPTION 'Assessment result must reference an approved/effective rule version valid on the assessment date.' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(NEW.required_documents)<>'array'
     OR jsonb_typeof(NEW.missing_documents)<>'array'
     OR jsonb_typeof(NEW.evidence)<>'object'
     OR NEW.evaluated_at>now()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Assessment documents/evidence must have valid JSON types and evaluation time.' USING ERRCODE='23514';
  END IF;
  IF NEW.result_status='pass' AND jsonb_array_length(NEW.missing_documents)>0 THEN
    RAISE EXCEPTION 'A rule with missing required documents cannot pass.' USING ERRCODE='23514';
  END IF;
  IF NEW.result_status IN ('fail','not_applicable')
     AND NULLIF(btrim(NEW.reason),'') IS NULL THEN
    RAISE EXCEPTION 'Failed and not-applicable rule results require a reason.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.reviewer_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL
       OR NEW.evidence='{}'::jsonb THEN
      RAISE EXCEPTION 'New rule results require evaluation evidence and cannot carry review metadata.' USING ERRCODE='55000';
    END IF;
    IF a.assessed_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Initial rule evaluation must be recorded by the assessment actor.' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
       OR NEW.rule_version_id IS DISTINCT FROM OLD.rule_version_id
       OR NEW.evaluated_at IS DISTINCT FROM OLD.evaluated_at
       OR NEW.required_documents IS DISTINCT FROM OLD.required_documents
       OR NEW.missing_documents IS DISTINCT FROM OLD.missing_documents
       OR NEW.evidence IS DISTINCT FROM OLD.evidence THEN
      RAISE EXCEPTION 'Evaluated rule inputs and evidence are immutable; create a new assessment for re-evaluation.' USING ERRCODE='55000';
    END IF;
    IF NEW.result_status IS DISTINCT FROM OLD.result_status
       OR NEW.reason IS DISTINCT FROM OLD.reason THEN
      IF NEW.reviewer_id IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewer_id=a.assessed_by OR NEW.reviewed_at IS NULL
         OR (a.project_id IS NULL AND NOT public.pke_is_platform_admin())
         OR (a.project_id IS NOT NULL AND NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_project_permission(a.project_id,'compliance.assess')) THEN
        RAISE EXCEPTION 'Rule result review requires an independent authorized reviewer.' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Rule reviewer metadata changes only with a formal result review.' USING ERRCODE='55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_block_direct_ledger_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF pg_trigger_depth()<=1 THEN
    CASE TG_TABLE_NAME
      WHEN 'payment_obligations' THEN
        IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
           OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
          RAISE EXCEPTION 'Payment obligation cash-paid balance can change only through the database reconciliation trigger.' USING ERRCODE='42501';
        END IF;
      WHEN 'ap_invoices' THEN
        IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
           OR NEW.outstanding_amount IS DISTINCT FROM OLD.outstanding_amount THEN
          RAISE EXCEPTION 'AP invoice balances can change only through the database reconciliation trigger.' USING ERRCODE='42501';
        END IF;
      WHEN 'ar_invoices' THEN
        IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
           OR NEW.outstanding_amount IS DISTINCT FROM OLD.outstanding_amount
           OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
          RAISE EXCEPTION 'AR invoice balances can change only through the database reconciliation trigger.' USING ERRCODE='42501';
        END IF;
      WHEN 'cash_advances' THEN
        IF NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status
           OR NEW.remaining_balance IS DISTINCT FROM OLD.remaining_balance
           OR NEW.refund_amount IS DISTINCT FROM OLD.refund_amount THEN
          RAISE EXCEPTION 'Cash advance disbursement/settlement balances can change only through a controlled finance workflow.' USING ERRCODE='42501';
        END IF;
      WHEN 'payment_invoice_allocations' THEN
        IF NEW.allocation_status IS DISTINCT FROM OLD.allocation_status THEN
          RAISE EXCEPTION 'Invoice allocation state can change only through payment cancellation/reconciliation triggers.' USING ERRCODE='42501';
        END IF;
      WHEN 'inventory_lots' THEN
        IF NEW.quantity IS DISTINCT FROM OLD.quantity
           OR NEW.location IS DISTINCT FROM OLD.location
           OR NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity
           OR NEW.held_quantity IS DISTINCT FROM OLD.held_quantity THEN
          RAISE EXCEPTION 'Inventory lot balances and custody counters can change only through the movement/reservation/hold ledger.' USING ERRCODE='42501';
        END IF;
      WHEN 'inventory_reservations' THEN
        IF NEW.fulfilled_quantity IS DISTINCT FROM OLD.fulfilled_quantity
           OR (NEW.status IS DISTINCT FROM OLD.status
               AND NEW.status IN ('partially_fulfilled','fulfilled')) THEN
          RAISE EXCEPTION 'Reservation fulfillment is driven only by shipment allocation triggers.' USING ERRCODE='42501';
        END IF;
      WHEN 'regulatory_assessments' THEN
        IF NEW.failed_count IS DISTINCT FROM OLD.failed_count
           OR NEW.pending_count IS DISTINCT FROM OLD.pending_count THEN
          RAISE EXCEPTION 'Assessment counters are recalculated only from rule result rows.' USING ERRCODE='42501';
        END IF;
      ELSE
        NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_cash_advance_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.approval_status='approved'
       OR OLD.disbursement_status='disbursed'
       OR EXISTS(SELECT 1 FROM public.payment_instructions pi WHERE pi.cash_advance_id=OLD.id) THEN
      RAISE EXCEPTION 'Approved, disbursed or linked cash advances are retained for audit.' USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.requestor_id IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.approval_status<>'draft'
       OR NEW.disbursement_status<>'pending'
       OR COALESCE(NEW.remaining_balance,0)<>0
       OR COALESCE(NEW.refund_amount,0)<>0 THEN
      RAISE EXCEPTION 'New cash advances must be created by their authenticated requestor as draft and undistributed.'
        USING ERRCODE='42501';
    END IF;
  ELSE
    IF OLD.approval_status='approved' OR OLD.disbursement_status='disbursed' THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.requestor_id IS DISTINCT FROM OLD.requestor_id
         OR NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
         OR NEW.purpose IS DISTINCT FROM OLD.purpose
         OR NEW.advance_date IS DISTINCT FROM OLD.advance_date THEN
        RAISE EXCEPTION 'Approved/disbursed cash advance terms are immutable.' USING ERRCODE='55000';
      END IF;
    END IF;

    IF NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status THEN
      IF current_setting('app.cash_advance_reconciliation_apply',true) IS DISTINCT FROM 'on'
         OR OLD.disbursement_status<>'pending'
         OR NEW.disbursement_status<>'disbursed'
         OR NEW.remaining_balance IS DISTINCT FROM NEW.amount THEN
        RAISE EXCEPTION 'Cash advance disbursement is set only by a fully matched payment reconciliation.'
          USING ERRCODE='42501';
      END IF;
    END IF;

    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status IN ('approved','rejected') THEN
      IF NOT public.pke_is_platform_admin()
         AND NOT public.pke_has_project_permission(NEW.project_id,'finance.update') THEN
        RAISE EXCEPTION 'Missing finance.update permission for cash advance decision.' USING ERRCODE='42501';
      END IF;
      IF NEW.requestor_id=public.pke_current_user_id() THEN
        RAISE EXCEPTION 'Cash advance approval/rejection must be performed by someone other than the requestor.'
          USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;

  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_reconciliation_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  allocation_total numeric;
  a record;
  pi record;
  obligation record;
  advance_row record;
  new_paid numeric;
BEGIN
  IF NEW.reconciliation_status='matched'
     AND (TG_OP='INSERT' OR OLD.reconciliation_status IS DISTINCT FROM 'matched') THEN
    SELECT payment_obligation_id,cash_advance_id,project_id,currency_id
      INTO pi FROM public.payment_instructions
     WHERE id=NEW.payment_instruction_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment instruction does not exist.' USING ERRCODE='23503';
    END IF;
    IF pi.project_id IS DISTINCT FROM NEW.project_id
       OR pi.currency_id IS DISTINCT FROM NEW.currency_id THEN
      RAISE EXCEPTION 'Payment reconciliation source project or currency mismatch.' USING ERRCODE='23514';
    END IF;

    IF pi.payment_obligation_id IS NOT NULL THEN
      SELECT project_id,currency_id,amount,amount_paid,approval_status
        INTO obligation
        FROM public.payment_obligations
       WHERE id=pi.payment_obligation_id FOR UPDATE;

      IF NOT FOUND OR obligation.project_id IS DISTINCT FROM pi.project_id
         OR obligation.currency_id IS DISTINCT FROM pi.currency_id
         OR obligation.approval_status<>'approved' THEN
        RAISE EXCEPTION 'Payment obligation must remain approved and match the source instruction.' USING ERRCODE='23514';
      END IF;

      new_paid:=COALESCE(obligation.amount_paid,0)+NEW.reconciled_amount;
      IF new_paid>obligation.amount THEN
        RAISE EXCEPTION 'Payment reconciliation exceeds remaining obligation balance.' USING ERRCODE='23514';
      END IF;

    ELSIF pi.cash_advance_id IS NOT NULL THEN
      SELECT project_id,currency_id,amount,approval_status,disbursement_status
        INTO advance_row
        FROM public.cash_advances WHERE id=pi.cash_advance_id FOR UPDATE;
      IF NOT FOUND OR advance_row.project_id IS DISTINCT FROM pi.project_id
         OR advance_row.currency_id IS DISTINCT FROM pi.currency_id
         OR advance_row.approval_status<>'approved'
         OR advance_row.disbursement_status<>'pending'
         OR NEW.reconciled_amount<>advance_row.amount THEN
        RAISE EXCEPTION 'Cash advance must be approved, pending disbursement and reconciled for its full approved amount.' USING ERRCODE='23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Payment instruction must reference an obligation or cash advance.' USING ERRCODE='23514';
    END IF;

    SELECT COALESCE(sum(allocated_amount),0) INTO allocation_total
      FROM public.payment_invoice_allocations
     WHERE payment_instruction_id=NEW.payment_instruction_id
       AND allocation_status='reserved';
    IF allocation_total>0 AND allocation_total<>NEW.reconciled_amount THEN
      RAISE EXCEPTION 'Reserved invoice allocations must equal the payment reconciliation amount.' USING ERRCODE='23514';
    END IF;

    FOR a IN
      SELECT * FROM public.payment_invoice_allocations
       WHERE payment_instruction_id=NEW.payment_instruction_id
         AND allocation_status='reserved'
       FOR UPDATE
    LOOP
      PERFORM set_config('app.invoice_reconciliation_apply','on',true);
      IF a.ap_invoice_id IS NOT NULL THEN
        UPDATE public.ap_invoices
           SET paid_amount=COALESCE(paid_amount,0)+a.allocated_amount,
               outstanding_amount=total_amount-(COALESCE(paid_amount,0)+a.allocated_amount),
               updated_at=now()
         WHERE id=a.ap_invoice_id
           AND total_amount>=(COALESCE(paid_amount,0)+a.allocated_amount);
        IF NOT FOUND THEN
          PERFORM set_config('app.invoice_reconciliation_apply','off',true);
          RAISE EXCEPTION 'AP invoice outstanding amount changed before reconciliation.' USING ERRCODE='23514';
        END IF;
      ELSE
        UPDATE public.ar_invoices
           SET paid_amount=COALESCE(paid_amount,0)+a.allocated_amount,
               outstanding_amount=total_amount-(COALESCE(paid_amount,0)+a.allocated_amount),
               payment_status=CASE
                 WHEN total_amount<=(COALESCE(paid_amount,0)+a.allocated_amount) THEN 'paid'
                 WHEN (COALESCE(paid_amount,0)+a.allocated_amount)>0 THEN 'partial'
                 ELSE 'open' END,
               updated_at=now()
         WHERE id=a.ar_invoice_id
           AND total_amount>=(COALESCE(paid_amount,0)+a.allocated_amount);
        IF NOT FOUND THEN
          PERFORM set_config('app.invoice_reconciliation_apply','off',true);
          RAISE EXCEPTION 'AR invoice outstanding amount changed before reconciliation.' USING ERRCODE='23514';
        END IF;
      END IF;
      PERFORM set_config('app.invoice_reconciliation_apply','off',true);

      PERFORM set_config('app.payment_allocation_apply','on',true);
      UPDATE public.payment_invoice_allocations
         SET allocation_status='applied',updated_at=now()
       WHERE id=a.id;
      PERFORM set_config('app.payment_allocation_apply','off',true);
    END LOOP;

    IF pi.payment_obligation_id IS NOT NULL THEN
      PERFORM set_config('app.payment_obligation_reconciliation_apply','on',true);
      UPDATE public.payment_obligations
         SET amount_paid=new_paid,
             payment_status=CASE WHEN new_paid>=obligation.amount THEN 'paid' ELSE 'partially_paid' END,
             updated_at=now()
       WHERE id=pi.payment_obligation_id;
      PERFORM set_config('app.payment_obligation_reconciliation_apply','off',true);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment obligation disappeared during reconciliation.' USING ERRCODE='23503';
      END IF;
    ELSE
      PERFORM set_config('app.cash_advance_reconciliation_apply','on',true);
      UPDATE public.cash_advances
         SET disbursement_status='disbursed',
             remaining_balance=amount,
             updated_at=now()
       WHERE id=pi.cash_advance_id
         AND approval_status='approved'
         AND disbursement_status='pending';
      PERFORM set_config('app.cash_advance_reconciliation_apply','off',true);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cash advance was not pending/approved for disbursement.' USING ERRCODE='23514';
      END IF;
    END IF;

    INSERT INTO public.audit_events(
      actor_user_id,actor_type,actor_role,permission_code,action,
      target_type,target_id,project_id,after_snapshot,metadata,outcome
    ) VALUES (
      public.pke_current_user_id(),'user',current_setting('app.current_role',true),
      'payment.reconcile','payment.reconciled','payment_instruction',
      NEW.payment_instruction_id,NEW.project_id,
      jsonb_build_object('amount',NEW.reconciled_amount,'currency_id',NEW.currency_id,
        'journal_entry_id',NEW.journal_entry_id),
      jsonb_build_object('reconciliation_id',NEW.id,
        'payment_obligation_id',pi.payment_obligation_id,
        'cash_advance_id',pi.cash_advance_id),'success'
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_hold_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE lot public.inventory_lots%ROWTYPE; old_active boolean:=false; new_active boolean:=false; existing_held numeric:=0;
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM 1 FROM public.inventory_lots WHERE id=OLD.lot_id FOR UPDATE;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.lot_id<>OLD.lot_id OR NEW.project_id<>OLD.project_id OR NEW.unit_code<>OLD.unit_code OR NEW.placed_by<>OLD.placed_by THEN
   RAISE EXCEPTION 'Hold project, lot, unit and placer are immutable.' USING ERRCODE='55000';
  END IF;
  old_active:=OLD.status='active';
 END IF;
 SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inventory lot does not exist.' USING ERRCODE='23503'; END IF;
 IF lot.project_id<>NEW.project_id OR lot.unit<>NEW.unit_code THEN
  RAISE EXCEPTION 'Hold project and unit must match inventory lot.' USING ERRCODE='23514';
 END IF;
 new_active:=NEW.status='active';
 existing_held:=lot.held_quantity;
 IF old_active THEN existing_held:=existing_held-OLD.quantity; END IF;
 IF new_active AND NEW.quantity > lot.quantity-lot.reserved_quantity-existing_held THEN
  RAISE EXCEPTION 'Inventory hold exceeds available quantity.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_inventory_movement_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE lot public.inventory_lots%ROWTYPE; receipt record; src public.inventory_movements%ROWTYPE;
BEGIN
  SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory lot does not exist.' USING ERRCODE='23503'; END IF;
  IF NEW.project_id IS DISTINCT FROM lot.project_id OR NEW.unit IS DISTINCT FROM lot.unit THEN
    RAISE EXCEPTION 'Movement project and unit must match the inventory lot.' USING ERRCODE='23514';
  END IF;
  IF NEW.actor_id IS DISTINCT FROM public.pke_current_user_id() THEN
    RAISE EXCEPTION 'Inventory movement actor must match authenticated request user.' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(NEW.idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION 'Every inventory movement requires an idempotency key.' USING ERRCODE='23514';
  END IF;
  IF NEW.timestamp > now()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Inventory movement timestamp cannot be materially in the future.' USING ERRCODE='23514';
  END IF;

  IF NEW.reversal_of_movement_id IS NOT NULL THEN
    IF NEW.movement_type<>'adjustment' OR NEW.status<>'reversed' THEN
      RAISE EXCEPTION 'A compensating movement must be adjustment type with reversed status.' USING ERRCODE='23514';
    END IF;
    SELECT * INTO src FROM public.inventory_movements WHERE id=NEW.reversal_of_movement_id FOR UPDATE;
    IF NOT FOUND OR src.status<>'posted' OR src.project_id<>NEW.project_id
       OR src.lot_id<>NEW.lot_id OR src.quantity<>NEW.quantity OR src.unit<>NEW.unit
       OR NEW.source_location IS DISTINCT FROM src.destination_location
       OR NEW.destination_location IS DISTINCT FROM src.source_location THEN
      RAISE EXCEPTION 'Compensating movement must exactly reverse one posted movement.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.movement_type='adjustment' THEN
      IF NEW.status<>'adjusted'
         OR (NEW.source_location IS NULL AND NEW.destination_location IS NULL)
         OR (NEW.source_location IS NOT NULL AND NEW.destination_location IS NOT NULL) THEN
        RAISE EXCEPTION 'Manual adjustment requires adjusted status and exactly one direction/location.' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.movement_type IN ('receipt','issue','transfer') AND NEW.status<>'posted' THEN
      RAISE EXCEPTION 'Receipt, issue and transfer movements must be posted.' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.movement_type='receipt' THEN
    IF NEW.reversal_of_movement_id IS NOT NULL
       OR NEW.warehouse_receipt_id IS NULL
       OR NEW.source_location IS NOT NULL
       OR NULLIF(btrim(NEW.destination_location),'') IS NULL THEN
      RAISE EXCEPTION 'Receipt movement must originate from a verified warehouse receipt and have a destination location.' USING ERRCODE='23514';
    END IF;
    SELECT project_id,lot_id,received_quantity,unit,status INTO receipt
      FROM public.warehouse_receipts WHERE id=NEW.warehouse_receipt_id FOR SHARE;
    IF NOT FOUND OR receipt.status NOT IN ('verified','partial')
       OR receipt.project_id<>NEW.project_id OR receipt.lot_id<>NEW.lot_id
       OR receipt.received_quantity<>NEW.quantity OR receipt.unit<>NEW.unit THEN
      RAISE EXCEPTION 'Receipt movement must exactly match its verified warehouse receipt.' USING ERRCODE='23514';
    END IF;
    IF lot.quantity>0 AND lot.location IS DISTINCT FROM NEW.destination_location THEN
      RAISE EXCEPTION 'Receipt cannot add stock to a lot at a different location; transfer or split the lot first.' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.movement_type='issue' THEN
    IF NEW.reversal_of_movement_id IS NOT NULL
       OR NEW.warehouse_receipt_id IS NOT NULL
       OR NULLIF(btrim(NEW.source_location),'') IS NULL
       OR NEW.destination_location IS NOT NULL
       OR lot.location IS DISTINCT FROM NEW.source_location
       OR NEW.quantity>lot.quantity-lot.held_quantity-lot.reserved_quantity THEN
      RAISE EXCEPTION 'Issue must come from the lot location and cannot consume held/reserved stock.' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.movement_type='transfer' THEN
    IF NEW.reversal_of_movement_id IS NOT NULL
       OR NEW.warehouse_receipt_id IS NOT NULL
       OR NULLIF(btrim(NEW.source_location),'') IS NULL
       OR NULLIF(btrim(NEW.destination_location),'') IS NULL
       OR NEW.source_location=NEW.destination_location
       OR lot.location IS DISTINCT FROM NEW.source_location
       OR NEW.quantity<>lot.quantity
       OR lot.held_quantity<>0 OR lot.reserved_quantity<>0 THEN
      RAISE EXCEPTION 'A single-location lot transfer must move its full unreserved/unheld balance between distinct locations.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_invoice_financial_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='ap_invoices' THEN
      IF COALESCE(OLD.paid_amount,0)>0 OR EXISTS(
        SELECT 1 FROM public.payment_invoice_allocations a
         WHERE a.ap_invoice_id=OLD.id AND a.allocation_status<>'released'
      ) THEN
        RAISE EXCEPTION 'AP invoice with payment history/reservations cannot be deleted.' USING ERRCODE='55000';
      END IF;
      IF OLD.verification_status='verified' THEN
        RAISE EXCEPTION 'Verified AP invoices are retained for audit.' USING ERRCODE='55000';
      END IF;
    ELSE
      IF COALESCE(OLD.paid_amount,0)>0 OR EXISTS(
        SELECT 1 FROM public.payment_invoice_allocations a
         WHERE a.ar_invoice_id=OLD.id AND a.allocation_status<>'released'
      ) THEN
        RAISE EXCEPTION 'AR invoice with payment history/reservations cannot be deleted.' USING ERRCODE='55000';
      END IF;
      IF OLD.approval_status='approved' THEN
        RAISE EXCEPTION 'Approved AR invoices are retained for audit.' USING ERRCODE='55000';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP='INSERT' THEN
    IF TG_TABLE_NAME='ap_invoices' THEN
      IF COALESCE(NEW.paid_amount,0)<>0
         OR NEW.outstanding_amount<>NEW.total_amount
         OR NEW.verification_status NOT IN ('pending','draft') THEN
        RAISE EXCEPTION 'New AP invoice must be unpaid, fully outstanding and unverified.' USING ERRCODE='23514';
      END IF;
    ELSE
      IF COALESCE(NEW.paid_amount,0)<>0 THEN
        RAISE EXCEPTION 'New AR invoice must be unpaid.' USING ERRCODE='23514';
      END IF;
      IF NEW.outstanding_amount IS NULL THEN
        NEW.outstanding_amount:=NEW.total_amount;
      END IF;
      IF NEW.outstanding_amount<>NEW.total_amount OR NEW.payment_status<>'open' THEN
        RAISE EXCEPTION 'New AR invoice must be open with its full amount outstanding.' USING ERRCODE='23514';
      END IF;
    END IF;
    NEW.updated_at:=now();
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME='ap_invoices' THEN
    IF OLD.verification_status='verified' AND
       (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
        OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
        OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
        OR NEW.due_date IS DISTINCT FROM OLD.due_date
        OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
        OR NEW.invoice_amount IS DISTINCT FROM OLD.invoice_amount
        OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
        OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
        OR NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.related_cost_obligation_id IS DISTINCT FROM OLD.related_cost_obligation_id
        OR NEW.related_payment_obligation_id IS DISTINCT FROM OLD.related_payment_obligation_id
        OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
        OR NEW.goods_receipt_id IS DISTINCT FROM OLD.goods_receipt_id) THEN
      RAISE EXCEPTION 'Verified AP invoice commercial identity is immutable.' USING ERRCODE='55000';
    END IF;
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.outstanding_amount IS DISTINCT FROM OLD.outstanding_amount THEN
      IF current_setting('app.invoice_reconciliation_apply',true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'AP paid/outstanding balances are maintained only by verified payment reconciliation.' USING ERRCODE='42501';
      END IF;
      IF COALESCE(NEW.paid_amount,0)<COALESCE(OLD.paid_amount,0)
         OR NEW.outstanding_amount<>NEW.total_amount-COALESCE(NEW.paid_amount,0) THEN
        RAISE EXCEPTION 'AP invoice payment balance must be monotonic and reconcile to total_amount.' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF OLD.approval_status='approved' AND
       (NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
        OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
        OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
        OR NEW.due_date IS DISTINCT FROM OLD.due_date
        OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
        OR NEW.invoice_amount IS DISTINCT FROM OLD.invoice_amount
        OR NEW.accepted_quantity IS DISTINCT FROM OLD.accepted_quantity
        OR NEW.unit IS DISTINCT FROM OLD.unit
        OR NEW.selling_price IS DISTINCT FROM OLD.selling_price
        OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
        OR NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.related_shipment_id IS DISTINCT FROM OLD.related_shipment_id) THEN
      RAISE EXCEPTION 'Approved AR invoice commercial identity is immutable.' USING ERRCODE='55000';
    END IF;
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
       OR NEW.outstanding_amount IS DISTINCT FROM OLD.outstanding_amount
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      IF current_setting('app.invoice_reconciliation_apply',true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'AR paid/outstanding/payment status are maintained only by verified payment reconciliation.' USING ERRCODE='42501';
      END IF;
      IF NEW.paid_amount<OLD.paid_amount
         OR NEW.outstanding_amount<>NEW.total_amount-NEW.paid_amount
         OR NEW.payment_status IS DISTINCT FROM
            (CASE WHEN NEW.paid_amount>=NEW.total_amount THEN 'paid'
                  WHEN NEW.paid_amount>0 THEN 'partial'
                  ELSE 'open' END) THEN
        RAISE EXCEPTION 'AR invoice payment balance/status must reconcile to total_amount.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_journal_entry_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF NEW.status<>'draft' OR NEW.posted_at IS NOT NULL OR NEW.posted_by IS NOT NULL THEN
  RAISE EXCEPTION 'New journal entries must be created as draft; use the controlled posting workflow.' USING ERRCODE='55000';
 END IF;
 IF NEW.reversal_of_journal_entry_id IS NOT NULL AND (NEW.entry_type<>'reversal' OR NULLIF(btrim(NEW.reversal_reason),'') IS NULL) THEN
  RAISE EXCEPTION 'A reversal journal requires reversal entry type and reason.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_journal_post_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='posted' THEN
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,after_snapshot,metadata,outcome)
  VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),'accounting.post','journal.posted','journal_entry',NEW.id,NEW.project_id,
         jsonb_build_object('status',NEW.status,'entry_type',NEW.entry_type,'entry_date',NEW.entry_date,'fiscal_period_id',NEW.fiscal_period_id),
         jsonb_build_object('reversal_of',NEW.reversal_of_journal_entry_id), 'success');
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_shipment_allocation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE sh public.shipments%ROWTYPE; lot public.inventory_lots%ROWTYPE; res public.inventory_reservations%ROWTYPE; other_allocated numeric;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.shipment_id<>OLD.shipment_id OR NEW.lot_id<>OLD.lot_id OR NEW.project_id<>OLD.project_id OR NEW.unit<>OLD.unit OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id) THEN
  RAISE EXCEPTION 'Shipment, lot, project, unit and reservation are immutable; cancel and create a replacement allocation.' USING ERRCODE='55000';
 END IF;
 SELECT * INTO sh FROM public.shipments WHERE id=NEW.shipment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shipment does not exist.' USING ERRCODE='23503'; END IF;
 SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inventory lot does not exist.' USING ERRCODE='23503'; END IF;
 NEW.project_id:=sh.project_id;
 IF lot.project_id<>sh.project_id THEN RAISE EXCEPTION 'Shipment and lot must belong to the same project.' USING ERRCODE='23514'; END IF;
 IF lot.unit<>NEW.unit THEN RAISE EXCEPTION 'Allocation unit must match the inventory lot unit.' USING ERRCODE='23514'; END IF;
 IF NEW.allocated_quantity<=0 OR NEW.loaded_quantity<0 OR NEW.loaded_quantity>NEW.allocated_quantity THEN
  RAISE EXCEPTION 'Allocation and loaded quantities are invalid.' USING ERRCODE='23514';
 END IF;
 IF NEW.status IN ('allocated','partially_loaded','loaded') THEN
  IF NEW.reservation_id IS NULL THEN RAISE EXCEPTION 'An active shipment allocation requires an inventory reservation.' USING ERRCODE='23514'; END IF;
  SELECT * INTO res FROM public.inventory_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  IF NOT FOUND OR res.project_id<>sh.project_id OR res.lot_id<>lot.id OR (res.shipment_id IS NOT NULL AND res.shipment_id<>sh.id) OR res.status NOT IN ('active','partially_fulfilled') THEN
   RAISE EXCEPTION 'Active shipment allocation must reference a matching active reservation.' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(a.allocated_quantity),0) INTO other_allocated
  FROM public.shipment_allocations a
  WHERE a.reservation_id=res.id AND a.status IN ('allocated','partially_loaded','loaded') AND a.id<>NEW.id;
  IF other_allocated+NEW.allocated_quantity>res.reserved_quantity THEN
   RAISE EXCEPTION 'Shipment allocations exceed the reserved quantity.' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(a.allocated_quantity),0) INTO other_allocated
  FROM public.shipment_allocations a
  WHERE a.shipment_id=sh.id AND a.status IN ('allocated','partially_loaded','loaded') AND a.id<>NEW.id;
  IF other_allocated+NEW.allocated_quantity>sh.quantity THEN
   RAISE EXCEPTION 'Allocations exceed shipment quantity.' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status='loaded' AND NEW.loaded_quantity<>NEW.allocated_quantity THEN
  RAISE EXCEPTION 'A loaded allocation must reconcile loaded quantity to the allocated quantity.' USING ERRCODE='23514';
 END IF;
 IF NEW.status='partially_loaded' AND NEW.loaded_quantity<=0 THEN
  RAISE EXCEPTION 'A partially loaded allocation requires a positive loaded quantity.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_approval_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE requester uuid; state text; project_uuid uuid;
BEGIN
  SELECT requested_by,instruction_status,project_id
    INTO requester,state,project_uuid
    FROM public.payment_instructions
   WHERE id=NEW.payment_instruction_id
   FOR UPDATE;
  IF NOT FOUND OR state<>'submitted' THEN
    RAISE EXCEPTION 'Only submitted payment instructions can receive approval decisions.' USING ERRCODE='55000';
  END IF;
  IF NEW.approver_id IS DISTINCT FROM public.pke_current_user_id()
     OR NEW.approver_id=requester THEN
    RAISE EXCEPTION 'Payment decision must be made by an authenticated user other than requester.' USING ERRCODE='42501';
  END IF;
  IF NOT public.pke_is_platform_admin()
     AND NOT public.pke_has_project_permission(project_uuid,'payment.approve') THEN
    RAISE EXCEPTION 'Missing payment.approve permission.' USING ERRCODE='42501';
  END IF;
  IF NEW.decided_at>now()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Payment decision timestamp cannot be materially in the future.' USING ERRCODE='23514';
  END IF;
  IF NEW.decision IN ('rejected','returned') AND NULLIF(btrim(NEW.reason),'') IS NULL THEN
    RAISE EXCEPTION 'Rejected/returned payment instructions require a reason.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_instruction_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE src record;
BEGIN
  IF NEW.instruction_status<>'draft' THEN
    RAISE EXCEPTION 'Payment instructions must be created as draft.' USING ERRCODE='55000';
  END IF;
  IF NEW.requested_by IS DISTINCT FROM public.pke_current_user_id() THEN
    RAISE EXCEPTION 'Payment requester must match the authenticated user.' USING ERRCODE='42501';
  END IF;

  IF NEW.payment_obligation_id IS NOT NULL THEN
    SELECT project_id,payee,amount,currency_id,amount_paid,approval_status,payment_status
      INTO src FROM public.payment_obligations
     WHERE id=NEW.payment_obligation_id FOR UPDATE;
    IF NOT FOUND OR src.project_id<>NEW.project_id OR src.currency_id<>NEW.currency_id THEN
      RAISE EXCEPTION 'Payment obligation must match project and currency.' USING ERRCODE='23514';
    END IF;
    IF src.approval_status<>'approved' OR src.payment_status='paid' THEN
      RAISE EXCEPTION 'Payment instruction requires an approved, not-yet-paid obligation.' USING ERRCODE='55000';
    END IF;
    IF NEW.amount>src.amount-COALESCE(src.amount_paid,0) THEN
      RAISE EXCEPTION 'Payment instruction exceeds remaining payment obligation.' USING ERRCODE='23514';
    END IF;
    IF lower(btrim(NEW.payee_name))<>lower(btrim(src.payee)) THEN
      RAISE EXCEPTION 'Payment payee must match the obligation payee.' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT project_id,amount,currency_id,approval_status,disbursement_status
      INTO src FROM public.cash_advances WHERE id=NEW.cash_advance_id FOR UPDATE;
    IF NOT FOUND OR src.project_id<>NEW.project_id OR src.currency_id<>NEW.currency_id
       OR src.approval_status<>'approved'
       OR src.disbursement_status<>'pending'
       OR NEW.amount<>src.amount THEN
      RAISE EXCEPTION 'Cash advance payment instruction requires the full approved amount, project and currency match, and pending disbursement.'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_obligation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE source_row record;
BEGIN
  IF TG_OP='DELETE' THEN
    IF COALESCE(OLD.amount_paid,0)>0
       OR OLD.approval_status='approved'
       OR EXISTS(SELECT 1 FROM public.payment_instructions pi WHERE pi.payment_obligation_id=OLD.id) THEN
      RAISE EXCEPTION 'Approved, paid or linked payment obligations are retained; use a controlled amendment/change record.'
        USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM public.pke_current_user_id()
       OR COALESCE(NEW.amount_paid,0)<>0
       OR NEW.payment_status<>'draft' THEN
      RAISE EXCEPTION 'New payment obligations must be created by the authenticated actor as unpaid draft records.'
        USING ERRCODE='42501';
    END IF;
    IF NEW.cost_obligation_id IS NOT NULL THEN
      SELECT project_id,currency_id,approval_status INTO source_row
        FROM public.cost_obligations WHERE id=NEW.cost_obligation_id FOR SHARE;
      IF NOT FOUND OR source_row.project_id<>NEW.project_id
         OR source_row.currency_id<>NEW.currency_id
         OR source_row.approval_status<>'approved' THEN
        RAISE EXCEPTION 'Linked cost obligation must be approved and match project/currency.' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF OLD.approval_status='approved' OR COALESCE(OLD.amount_paid,0)>0 THEN
      IF NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.cost_obligation_id IS DISTINCT FROM OLD.cost_obligation_id
         OR NEW.payee IS DISTINCT FROM OLD.payee
         OR NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
         OR NEW.basis IS DISTINCT FROM OLD.basis
         OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id
         OR NEW.payment_trigger_event IS DISTINCT FROM OLD.payment_trigger_event
         OR NEW.cash_classification IS DISTINCT FROM OLD.cash_classification
         OR NEW.source_agreement IS DISTINCT FROM OLD.source_agreement THEN
        RAISE EXCEPTION 'Approved payment obligation terms are immutable; create a new obligation/change record.'
          USING ERRCODE='55000';
      END IF;
    END IF;

    IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      IF current_setting('app.payment_obligation_reconciliation_apply',true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Payment obligation paid balance/status are maintained only by verified reconciliation.'
          USING ERRCODE='42501';
      END IF;
      IF NEW.amount_paid<OLD.amount_paid OR NEW.amount_paid>NEW.amount
         OR NEW.payment_status IS DISTINCT FROM
            (CASE WHEN NEW.amount_paid>=NEW.amount THEN 'paid'
                  WHEN NEW.amount_paid>0 THEN 'partially_paid'
                  ELSE 'draft' END) THEN
        RAISE EXCEPTION 'Payment obligation balance/status must reconcile to amount.' USING ERRCODE='23514';
      END IF;
    END IF;

    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND NEW.approval_status IN ('approved','rejected') THEN
      IF NOT public.pke_is_platform_admin()
         AND NOT public.pke_has_project_permission(NEW.project_id,'finance.update') THEN
        RAISE EXCEPTION 'Missing finance.update permission to decide payment obligation.' USING ERRCODE='42501';
      END IF;
      IF NEW.created_by IS NOT DISTINCT FROM public.pke_current_user_id() THEN
        RAISE EXCEPTION 'Payment obligation approval/rejection must be performed by someone other than its creator.'
          USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;

  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_payment_verification_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE evidence_instruction uuid; evidence_uploader uuid; evidence_status text; pi_amount numeric; pi_currency uuid;
BEGIN
 SELECT payment_instruction_id,uploaded_by,status INTO evidence_instruction,evidence_uploader,evidence_status
 FROM public.payment_evidence WHERE id=NEW.evidence_id FOR UPDATE;
 IF NOT FOUND OR evidence_instruction<>NEW.payment_instruction_id OR evidence_status<>'accepted' THEN
  RAISE EXCEPTION 'Verified payment record must reference accepted evidence for the same instruction.' USING ERRCODE='23514';
 END IF;
 SELECT amount,currency_id INTO pi_amount,pi_currency FROM public.payment_instructions WHERE id=NEW.payment_instruction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment instruction does not exist.' USING ERRCODE='23503'; END IF;
 IF NEW.verified_by IS DISTINCT FROM public.pke_current_user_id() OR NEW.verified_by=evidence_uploader THEN
  RAISE EXCEPTION 'Payment verification must be performed by an authenticated user other than the uploader.' USING ERRCODE='42501';
 END IF;
 IF NEW.verification_status='verified' AND (NEW.verified_amount<>pi_amount OR NEW.verified_currency_id<>pi_currency OR NEW.verified_execution_date IS NULL) THEN
  RAISE EXCEPTION 'Verified amount, currency and execution date must match the payment instruction evidence.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_assessment_result_recount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE assessment_uuid uuid; result_failed integer; result_pending integer;
BEGIN
  assessment_uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.assessment_id ELSE NEW.assessment_id END;
  SELECT count(*) FILTER (WHERE result_status='fail')::integer,
         count(*) FILTER (WHERE result_status IN ('pending','manual_review'))::integer
    INTO result_failed,result_pending
    FROM public.regulatory_assessment_results
   WHERE assessment_id=assessment_uuid;

  PERFORM set_config('app.assessment_result_count_update','on',true);
  UPDATE public.regulatory_assessments
     SET failed_count=COALESCE(result_failed,0),
         pending_count=COALESCE(result_pending,0)
   WHERE id=assessment_uuid
     AND overall_status IN ('pending','manual_review');
  PERFORM set_config('app.assessment_result_count_update','off',true);

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_exception_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE rv record; shipment_project uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory exceptions are retained for legal and audit traceability.' USING ERRCODE='55000';
  END IF;

  SELECT status,rule_id INTO rv
    FROM public.regulatory_rule_versions WHERE id=NEW.rule_version_id FOR SHARE;
  IF NOT FOUND OR rv.status NOT IN ('approved','effective') THEN
    RAISE EXCEPTION 'An exception must reference an approved/effective rule version.' USING ERRCODE='23514';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending'
       OR NEW.requested_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.project_id IS NULL
       OR NEW.approved_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL
       OR NEW.decision_reason IS NOT NULL
       OR (NOT public.pke_is_platform_admin()
           AND NOT public.pke_has_project_permission(NEW.project_id,'compliance.assess')) THEN
      RAISE EXCEPTION 'Exception request must begin pending, be created by an authorized project assessor and have no decision metadata.'
        USING ERRCODE='42501';
    END IF;
    IF NEW.evidence_object_key NOT LIKE 'projects/'||NEW.project_id::text||'/compliance/exceptions/'||NEW.id::text||'/%'
       OR position('..' in NEW.evidence_object_key)>0
       OR position(E'\\' in NEW.evidence_object_key)>0 THEN
      RAISE EXCEPTION 'Exception evidence must use its project/exception-scoped private object key.' USING ERRCODE='23514';
    END IF;
    IF NEW.valid_from>CURRENT_DATE
       OR (NEW.valid_to IS NOT NULL AND NEW.valid_to<NEW.valid_from) THEN
      RAISE EXCEPTION 'Exception validity dates are invalid.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.rule_version_id IS DISTINCT FROM OLD.rule_version_id
       OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
       OR NEW.authority_name IS DISTINCT FROM OLD.authority_name
       OR NEW.authority_reference IS DISTINCT FROM OLD.authority_reference
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.evidence_object_key IS DISTINCT FROM OLD.evidence_object_key
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.valid_to IS DISTINCT FROM OLD.valid_to
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
      RAISE EXCEPTION 'Regulatory exception request details are immutable after submission.' USING ERRCODE='55000';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.approved_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.approved_by=OLD.requested_by
         OR NEW.approved_at IS NULL
         OR (NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_project_permission(NEW.project_id,'regulatory.rule.manage')) THEN
        RAISE EXCEPTION 'Exception decisions require an independent authorized reviewer and timestamp.' USING ERRCODE='42501';
      END IF;

      IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
        IF NEW.status='approved' AND
           (NEW.valid_from>CURRENT_DATE OR (NEW.valid_to IS NOT NULL AND NEW.valid_to<CURRENT_DATE)) THEN
          RAISE EXCEPTION 'An exception cannot be approved outside its validity period.' USING ERRCODE='23514';
        END IF;
        IF NEW.status='rejected' AND NULLIF(btrim(NEW.decision_reason),'') IS NULL THEN
          RAISE EXCEPTION 'Rejected exception requires a decision reason.' USING ERRCODE='23514';
        END IF;
      ELSIF OLD.status='pending' AND NEW.status='expired' THEN
        IF NEW.valid_to IS NULL OR NEW.valid_to>=CURRENT_DATE
           OR NULLIF(btrim(NEW.decision_reason),'') IS NULL THEN
          RAISE EXCEPTION 'A pending exception can expire only after its validity end date with a reason.' USING ERRCODE='23514';
        END IF;
      ELSIF OLD.status='approved' AND NEW.status='expired' THEN
        IF NEW.valid_to IS NULL OR NEW.valid_to>=CURRENT_DATE
           OR NULLIF(btrim(NEW.decision_reason),'') IS NULL THEN
          RAISE EXCEPTION 'An approved exception can expire only after its validity end date with a reason.' USING ERRCODE='23514';
        END IF;
      ELSIF OLD.status='approved' AND NEW.status='revoked' THEN
        IF NULLIF(btrim(NEW.decision_reason),'') IS NULL THEN
          RAISE EXCEPTION 'Revoking an approved exception requires a reason.' USING ERRCODE='23514';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid regulatory exception transition: % -> %.',OLD.status,NEW.status USING ERRCODE='55000';
      END IF;
    ELSE
      IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
         OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
         OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason THEN
        RAISE EXCEPTION 'Exception decision metadata is immutable outside a decision transition.' USING ERRCODE='55000';
      END IF;
    END IF;
  END IF;

  IF NEW.shipment_id IS NOT NULL THEN
    SELECT project_id INTO shipment_project FROM public.shipments WHERE id=NEW.shipment_id;
    IF NOT FOUND OR shipment_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Regulatory exception shipment must belong to the same project.' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE action_name text; target_name text; target_uuid uuid; p_id uuid; after_data jsonb; metadata_data jsonb;
BEGIN
  IF TG_TABLE_NAME='regulatory_rules' THEN
    target_name:='regulatory_rule'; target_uuid:=NEW.id;
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'regulatory_rule.created' ELSE 'regulatory_rule.state_changed' END;
    after_data:=jsonb_build_object('rule_code',NEW.rule_code,'status',NEW.status,'active_version_id',NEW.active_version_id,
      'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at);
    metadata_data:=jsonb_build_object('jurisdiction',NEW.jurisdiction,'subject_type',NEW.subject_type);
  ELSIF TG_TABLE_NAME='regulatory_rule_versions' THEN
    target_name:='regulatory_rule_version'; target_uuid:=NEW.id;
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'regulatory_rule_version.created' ELSE 'regulatory_rule_version.state_changed' END;
    after_data:=jsonb_build_object('rule_id',NEW.rule_id,'version_number',NEW.version_number,'status',NEW.status,
      'effective_from',NEW.effective_from,'effective_to',NEW.effective_to,'approved_by',NEW.approved_by,'approved_at',NEW.approved_at);
    metadata_data:=jsonb_build_object('regulatory_source_id',NEW.regulatory_source_id,'outcome',NEW.outcome);
  ELSE
    target_name:='regulatory_rule_exception'; target_uuid:=NEW.id; p_id:=NEW.project_id;
    action_name:=CASE WHEN TG_OP='INSERT' THEN 'regulatory_exception.requested' ELSE 'regulatory_exception.decided' END;
    after_data:=jsonb_build_object('status',NEW.status,'approved_by',NEW.approved_by,'approved_at',NEW.approved_at,
      'decision_reason',NEW.decision_reason,'valid_from',NEW.valid_from,'valid_to',NEW.valid_to);
    metadata_data:=jsonb_build_object('rule_version_id',NEW.rule_version_id,'shipment_id',NEW.shipment_id,
      'authority_reference',NEW.authority_reference,'evidence_object_key',NEW.evidence_object_key);
  END IF;
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
    project_id,after_snapshot,metadata,outcome)
  VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
    CASE WHEN TG_TABLE_NAME='regulatory_rule_exceptions' THEN 'compliance.assess' ELSE 'regulatory.rule.manage' END,
    action_name,target_name,target_uuid,p_id,after_data,metadata_data,'success');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v record;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory rule identities are retained; supersede or repeal instead.' USING ERRCODE='55000';
  END IF;
  IF jsonb_typeof(NEW.scope)<>'object' OR NULLIF(btrim(NEW.rule_code),'') IS NULL
     OR NULLIF(btrim(NEW.title),'') IS NULL THEN
    RAISE EXCEPTION 'Regulatory rule requires code, title and JSON object scope.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.active_version_id IS NOT NULL
       OR NEW.created_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'New regulatory rules must begin as draft and be created by the authenticated administrator.' USING ERRCODE='55000';
    END IF;
  ELSE
    IF NEW.rule_code IS DISTINCT FROM OLD.rule_code OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Regulatory rule identity and scope are immutable.' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.pke_is_platform_admin() THEN
        RAISE EXCEPTION 'Only platform administrators may advance regulatory rule states.' USING ERRCODE='42501';
      END IF;
      IF NOT (
        (OLD.status='draft' AND NEW.status='under_review')
        OR (OLD.status='under_review' AND NEW.status='approved')
        OR (OLD.status='approved' AND NEW.status='effective')
        OR (OLD.status='effective' AND NEW.status IN ('suspended','superseded','repealed'))
        OR (OLD.status='suspended' AND NEW.status IN ('effective','superseded','repealed'))
        OR (OLD.status='approved' AND NEW.status IN ('superseded','repealed'))
      ) THEN
        RAISE EXCEPTION 'Invalid regulatory rule transition: % -> %.',OLD.status,NEW.status USING ERRCODE='55000';
      END IF;
      IF NEW.status IN ('approved','effective') THEN
        IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id() OR NEW.reviewed_at IS NULL THEN
          RAISE EXCEPTION 'Rule approval/activation requires authenticated reviewer and timestamp.' USING ERRCODE='42501';
        END IF;
      END IF;
    ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id() OR NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'Rule reviewer changes must be made by the authenticated reviewer.' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('approved','effective') AND NEW.active_version_id IS NULL THEN
    RAISE EXCEPTION 'An approved/effective regulatory rule must identify its selected version.' USING ERRCODE='23514';
  END IF;
  IF NEW.active_version_id IS NOT NULL THEN
    SELECT rule_id,status,effective_from,effective_to,regulatory_source_id
      INTO v FROM public.regulatory_rule_versions WHERE id=NEW.active_version_id FOR SHARE;
    IF NOT FOUND OR v.rule_id<>NEW.id OR v.status NOT IN ('approved','effective') THEN
      RAISE EXCEPTION 'Selected rule version must belong to this rule and be approved/effective.' USING ERRCODE='23514';
    END IF;
    IF NEW.status='effective' THEN
      IF v.status<>'effective' OR v.effective_from>CURRENT_DATE
         OR (v.effective_to IS NOT NULL AND v.effective_to<CURRENT_DATE) THEN
        RAISE EXCEPTION 'An effective rule must point to a currently effective version.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_version_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE src record; max_version integer; parent_status text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory rule versions are retained; supersede or repeal them instead.' USING ERRCODE='55000';
  END IF;
  IF jsonb_typeof(NEW.condition_schema)<>'object' OR NULLIF(btrim(NEW.rule_summary),'') IS NULL THEN
    RAISE EXCEPTION 'Rule version requires a JSON condition schema and non-empty summary.' USING ERRCODE='23514';
  END IF;
  SELECT status INTO parent_status FROM public.regulatory_rules WHERE id=NEW.rule_id FOR SHARE;
  IF NOT FOUND OR parent_status IN ('superseded','repealed') THEN
    RAISE EXCEPTION 'Rule version must belong to a live regulatory rule.' USING ERRCODE='23514';
  END IF;
  SELECT status,verification_status,effective_date,expiry_repeal_date,official_url,
         COALESCE(source_checksum_sha256,source_checksum) AS source_hash
    INTO src FROM public.regulatory_sources WHERE id=NEW.regulatory_source_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule version requires an existing regulatory source.' USING ERRCODE='23503'; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'New regulatory rule versions must begin in draft without approval metadata.' USING ERRCODE='55000';
    END IF;
    SELECT COALESCE(max(version_number),0) INTO max_version
      FROM public.regulatory_rule_versions WHERE rule_id=NEW.rule_id;
    IF NEW.version_number<>max_version+1 THEN
      RAISE EXCEPTION 'Rule version number must be sequential within its rule.' USING ERRCODE='23514';
    END IF;
    NEW.source_url_snapshot:=COALESCE(NEW.source_url_snapshot,src.official_url);
    NEW.source_checksum:=COALESCE(NEW.source_checksum,src.source_hash);
  ELSE
    IF OLD.status IN ('approved','effective','superseded','repealed') AND
       (NEW.rule_id IS DISTINCT FROM OLD.rule_id OR NEW.version_number IS DISTINCT FROM OLD.version_number
        OR NEW.regulatory_source_id IS DISTINCT FROM OLD.regulatory_source_id
        OR NEW.source_locator IS DISTINCT FROM OLD.source_locator
        OR NEW.source_url_snapshot IS DISTINCT FROM OLD.source_url_snapshot
        OR NEW.source_checksum IS DISTINCT FROM OLD.source_checksum
        OR NEW.rule_summary IS DISTINCT FROM OLD.rule_summary
        OR NEW.condition_schema IS DISTINCT FROM OLD.condition_schema
        OR NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.risk_category IS DISTINCT FROM OLD.risk_category
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_to IS DISTINCT FROM OLD.effective_to) THEN
      RAISE EXCEPTION 'Approved/effective rule version content is immutable; create a new version.' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.pke_is_platform_admin() THEN
        RAISE EXCEPTION 'Only platform administrators may advance regulatory rule version states.' USING ERRCODE='42501';
      END IF;
      IF NOT (
        (OLD.status='draft' AND NEW.status='under_review'
          AND parent_status IN ('under_review','approved','effective','suspended'))
        OR (OLD.status='under_review' AND NEW.status='approved'
          AND parent_status IN ('under_review','approved','effective','suspended'))
        OR (OLD.status='approved' AND NEW.status='effective'
          AND parent_status IN ('approved','effective','suspended'))
        OR (OLD.status IN ('approved','effective') AND NEW.status IN ('superseded','repealed'))
      ) THEN
        RAISE EXCEPTION 'Invalid regulatory rule version transition or parent rule lifecycle: % -> % (parent %).',
          OLD.status,NEW.status,parent_status USING ERRCODE='55000';
      END IF;
      IF NEW.status='approved' THEN
        IF src.status<>'active' OR src.verification_status<>'verified'
           OR src.effective_date>now() OR (src.expiry_repeal_date IS NOT NULL AND src.expiry_repeal_date<now())
           OR NEW.approved_by IS DISTINCT FROM public.pke_current_user_id() OR NEW.approved_at IS NULL THEN
          RAISE EXCEPTION 'Approval requires a currently effective verified source and authenticated approver.' USING ERRCODE='23514';
        END IF;
      ELSIF NEW.status='effective' THEN
        IF src.status<>'active' OR src.verification_status<>'verified'
           OR src.effective_date>now() OR (src.expiry_repeal_date IS NOT NULL AND src.expiry_repeal_date<now())
           OR NEW.effective_from>CURRENT_DATE
           OR (NEW.effective_to IS NOT NULL AND NEW.effective_to<CURRENT_DATE)
           OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
          RAISE EXCEPTION 'A rule version can become effective only within its dates under an active verified source.' USING ERRCODE='23514';
        END IF;
      END IF;
    ELSIF OLD.status IN ('approved','effective') AND
      (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
      RAISE EXCEPTION 'Rule version approval identity/timestamp are immutable.' USING ERRCODE='55000';
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_regulatory_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory source records are retained; supersede or repeal them instead.' USING ERRCODE='55000';
  END IF;

  IF NEW.official_url IS NOT NULL AND NEW.official_url !~* '^https://' THEN
    RAISE EXCEPTION 'Regulatory official_url must use HTTPS.' USING ERRCODE='23514';
  END IF;

  IF NEW.verification_status='verified' THEN
    IF NULLIF(btrim(NEW.official_url),'') IS NULL
       AND NULLIF(btrim(NEW.source_file_reference),'') IS NULL THEN
      RAISE EXCEPTION 'Verified source requires an official URL or archived source.' USING ERRCODE='23514';
    END IF;
    IF NEW.reviewer_id IS NULL OR NEW.last_reviewed IS NULL
       OR NEW.date_retrieved IS NULL OR NEW.access_rights='unknown' THEN
      RAISE EXCEPTION 'Verified source requires reviewer, retrieval/review timestamps and known access rights.' USING ERRCODE='23514';
    END IF;
    IF (TG_OP='INSERT' OR OLD.verification_status IS DISTINCT FROM 'verified'
        OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
        OR NEW.last_reviewed IS DISTINCT FROM OLD.last_reviewed)
       AND NEW.reviewer_id IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'The user verifying a regulatory source must be the recorded reviewer.' USING ERRCODE='42501';
    END IF;
    IF NEW.source_file_reference IS NOT NULL
       AND COALESCE(NEW.source_checksum_sha256,NEW.source_checksum) !~* '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Archived regulatory source requires a valid SHA-256 checksum.' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.status='active' AND
     (NEW.verification_status<>'verified'
      OR NEW.access_rights='unknown'
      OR NEW.effective_date>now()
      OR (NEW.expiry_repeal_date IS NOT NULL AND NEW.expiry_repeal_date<now())) THEN
    RAISE EXCEPTION 'A source can be active only after verification, known access-right classification and within its effective period.'
      USING ERRCODE='23514';
  END IF;

  IF TG_OP='UPDATE' AND (OLD.status='active' OR OLD.verification_status='verified') AND
     (NEW.source_id IS DISTINCT FROM OLD.source_id
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.issuing_authority IS DISTINCT FROM OLD.issuing_authority
      OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction
      OR NEW.document_type IS DISTINCT FROM OLD.document_type
      OR NEW.regulation_number IS DISTINCT FROM OLD.regulation_number
      OR NEW.article_annex_section IS DISTINCT FROM OLD.article_annex_section
      OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
      OR NEW.official_url IS DISTINCT FROM OLD.official_url
      OR NEW.source_file_reference IS DISTINCT FROM OLD.source_file_reference
      OR NEW.source_checksum IS DISTINCT FROM OLD.source_checksum
      OR NEW.source_checksum_sha256 IS DISTINCT FROM OLD.source_checksum_sha256
      OR NEW.access_rights IS DISTINCT FROM OLD.access_rights) THEN
    RAISE EXCEPTION 'Verified source content and provenance are immutable; register a new source version.' USING ERRCODE='55000';
  END IF;

  IF TG_OP='UPDATE' AND OLD.status='active'
     AND NEW.status IN ('superseded','repealed')
     AND EXISTS (
       SELECT 1
         FROM public.regulatory_rule_versions rv
         JOIN public.regulatory_rules rr ON rr.id=rv.rule_id
        WHERE rv.regulatory_source_id=OLD.id
          AND (rv.status='effective' OR rr.status='effective')
     ) THEN
    RAISE EXCEPTION 'A source referenced by an effective rule cannot be superseded/repealed until its rule versions are retired.' USING ERRCODE='55000';
  END IF;

  NEW.updated_at:=now();

  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    INSERT INTO public.audit_events(
      actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      after_snapshot,metadata,outcome
    ) VALUES (
      public.pke_current_user_id(),'user',current_setting('app.current_role',true),'regulatory.source.manage',
      CASE WHEN TG_OP='INSERT' THEN 'regulatory_source.created' ELSE 'regulatory_source.state_changed' END,
      'regulatory_source',NEW.id,
      jsonb_build_object('source_id',NEW.source_id,'status',NEW.status,
        'verification_status',NEW.verification_status,'jurisdiction',NEW.jurisdiction,
        'effective_date',NEW.effective_date,'expiry_repeal_date',NEW.expiry_repeal_date),
      jsonb_build_object('access_rights',NEW.access_rights,'version_label',NEW.version_label,
        'reviewer_id',NEW.reviewer_id,'last_reviewed',NEW.last_reviewed),'success'
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_shipment_allocation_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft'
       OR NEW.loaded_quantity<>0
       OR NEW.created_by IS DISTINCT FROM public.pke_current_user_id()
       OR NULLIF(btrim(NEW.idempotency_key),'') IS NULL
       OR NEW.reversal_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New shipment allocations must begin draft with zero loaded quantity, authenticated creator and idempotency key.'
        USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'Shipment allocation creator and idempotency key are immutable.' USING ERRCODE='55000';
    END IF;

    IF NEW.loaded_quantity<OLD.loaded_quantity THEN
      RAISE EXCEPTION 'Loaded quantity cannot decrease; reverse the allocation through its compensating movement.'
        USING ERRCODE='55000';
    END IF;

    IF OLD.status IN ('cancelled','reversed') THEN
      RAISE EXCEPTION 'Cancelled or reversed shipment allocations are terminal.' USING ERRCODE='55000';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status='draft' AND NEW.status IN ('allocated','cancelled'))
        OR (OLD.status='allocated' AND NEW.status IN ('partially_loaded','loaded','cancelled'))
        OR (OLD.status='partially_loaded' AND NEW.status IN ('partially_loaded','loaded','reversed'))
        OR (OLD.status='loaded' AND NEW.status='reversed')
      ) THEN
        RAISE EXCEPTION 'Invalid shipment allocation transition: % -> %.',OLD.status,NEW.status
          USING ERRCODE='55000';
      END IF;

      IF NEW.status='cancelled' AND NEW.loaded_quantity<>0 THEN
        RAISE EXCEPTION 'An allocation with loaded quantity must be reversed, not cancelled.'
          USING ERRCODE='23514';
      END IF;

      IF NEW.status='reversed' AND
         (NEW.loaded_quantity<>OLD.loaded_quantity OR NULLIF(btrim(NEW.reversal_reason),'') IS NULL) THEN
        RAISE EXCEPTION 'A loaded allocation reversal requires unchanged loaded quantity and a reversal reason.'
          USING ERRCODE='23514';
      END IF;

      IF NEW.status<>'reversed' AND NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason THEN
        RAISE EXCEPTION 'Reversal reason may be recorded only on a reversal transition.'
          USING ERRCODE='55000';
      END IF;
    ELSE
      IF OLD.status IN ('draft','allocated','loaded') AND
         NEW.loaded_quantity IS DISTINCT FROM OLD.loaded_quantity THEN
        RAISE EXCEPTION 'Loaded quantity can change only while transitioning to or remaining partially_loaded/loaded.'
          USING ERRCODE='55000';
      END IF;
      IF NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason THEN
        RAISE EXCEPTION 'Reversal reason is immutable after the reversal transition.'
          USING ERRCODE='55000';
      END IF;
    END IF;
  END IF;

  IF NEW.loaded_quantity<0 OR NEW.loaded_quantity>NEW.allocated_quantity THEN
    RAISE EXCEPTION 'Loaded quantity must be between zero and allocated quantity.' USING ERRCODE='23514';
  END IF;

  IF NEW.status IN ('draft','allocated','cancelled') AND NEW.loaded_quantity<>0 THEN
    RAISE EXCEPTION 'Draft, allocated and cancelled states require zero loaded quantity.'
      USING ERRCODE='23514';
  ELSIF NEW.status='partially_loaded' AND
        (NEW.loaded_quantity<=0 OR NEW.loaded_quantity>=NEW.allocated_quantity) THEN
    RAISE EXCEPTION 'Partially loaded state requires a positive quantity below the allocation quantity.'
      USING ERRCODE='23514';
  ELSIF NEW.status='loaded' AND NEW.loaded_quantity<>NEW.allocated_quantity THEN
    RAISE EXCEPTION 'Loaded state requires loaded quantity to equal allocated quantity.'
      USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_tracking_evidence_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE trip_project uuid; trip_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Tracking evidence is retained; supersede evidence instead of deleting it.' USING ERRCODE='55000';
  END IF;
  SELECT t.project_id,e.truck_trip_id INTO trip_project,trip_id
    FROM public.tracking_events e JOIN public.truck_trips t ON t.id=e.truck_trip_id
   WHERE e.id=NEW.tracking_event_id FOR SHARE OF e,t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evidence must reference a valid tracking event and trip.' USING ERRCODE='23503'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.uploaded_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Tracking evidence uploader must match authenticated request user.' USING ERRCODE='42501';
    END IF;
    IF NEW.status<>'active' OR NEW.storage_bucket<>'pke-private-documents'
       OR NEW.upload_verified_at IS NULL
       OR NEW.object_key NOT LIKE 'projects/'||trip_project::text||'/trips/'||trip_id::text||
          '/tracking/'||NEW.tracking_event_id::text||'/%'
       OR position('..' in NEW.object_key)>0 OR position(E'\\' in NEW.object_key)>0
       OR NEW.file_size<=0 OR NEW.file_size>52428800
       OR NEW.sha256_checksum !~* '^[0-9a-f]{64}$'
       OR lower(NEW.mime_type) NOT IN ('image/jpeg','image/png','image/webp') THEN
      RAISE EXCEPTION 'Tracking evidence must be a verified checksummed image in the private project/trip/event namespace.' USING ERRCODE='23514';
    END IF;
    IF NEW.supersedes_document_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.tracking_evidence old
       WHERE old.id=NEW.supersedes_document_id AND old.tracking_event_id=NEW.tracking_event_id) THEN
      RAISE EXCEPTION 'Superseded evidence must belong to the same tracking event.' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.tracking_event_id IS DISTINCT FROM OLD.tracking_event_id
       OR NEW.object_key IS DISTINCT FROM OLD.object_key
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.file_size IS DISTINCT FROM OLD.file_size
       OR NEW.sha256_checksum IS DISTINCT FROM OLD.sha256_checksum
       OR NEW.supersedes_document_id IS DISTINCT FROM OLD.supersedes_document_id
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
       OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
       OR NEW.upload_verified_at IS DISTINCT FROM OLD.upload_verified_at THEN
      RAISE EXCEPTION 'Tracking evidence content and ownership are immutable.' USING ERRCODE='55000';
    END IF;
    IF OLD.status<>'active' OR NEW.status NOT IN ('superseded','deleted') THEN
      RAISE EXCEPTION 'Evidence may transition once from active to superseded/deleted.' USING ERRCODE='55000';
    END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      project_id,after_snapshot,metadata,outcome)
    VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),
      CASE WHEN TG_OP='INSERT' THEN 'logistics.create' ELSE 'logistics.update' END,
      CASE WHEN TG_OP='INSERT' THEN 'tracking_evidence.registered' ELSE 'tracking_evidence.superseded' END,
      'tracking_evidence',NEW.id,trip_project,
      jsonb_build_object('status',NEW.status,'mime_type',NEW.mime_type,'file_size',NEW.file_size),
      jsonb_build_object('tracking_event_id',NEW.tracking_event_id,'object_key',NEW.object_key,
        'sha256_checksum',NEW.sha256_checksum,'uploaded_by',NEW.uploaded_by,
        'storage_bucket',NEW.storage_bucket,'upload_verified_at',NEW.upload_verified_at),'success');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_warehouse_receipt_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE trip_project uuid; lot public.inventory_lots%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Warehouse receipt records are retained for quantity and audit traceability.'
      USING ERRCODE='55000';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.checker_id IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Warehouse checker must match authenticated request user.' USING ERRCODE='42501';
    END IF;
    IF NEW.status<>'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'New warehouse receipts must begin pending without review metadata.' USING ERRCODE='55000';
    END IF;
    IF NEW.check_timestamp>now()+interval '5 minutes' THEN
      RAISE EXCEPTION 'Warehouse check timestamp cannot be materially in the future.' USING ERRCODE='23514';
    END IF;
    NEW.received_at:=now();
  ELSE
    IF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.truck_trip_id IS DISTINCT FROM OLD.truck_trip_id
       OR NEW.checker_id IS DISTINCT FROM OLD.checker_id
       OR NEW.check_timestamp IS DISTINCT FROM OLD.check_timestamp
       OR NEW.received_at IS DISTINCT FROM OLD.received_at
       OR NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
       OR NEW.unit IS DISTINCT FROM OLD.unit THEN
      RAISE EXCEPTION 'Warehouse receipt identity, measured quantity and capture times are immutable.' USING ERRCODE='55000';
    END IF;

    IF OLD.status<>'pending' THEN
      RAISE EXCEPTION 'Reviewed warehouse receipts are immutable; correct them with a separate adjustment record.' USING ERRCODE='55000';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status NOT IN ('verified','partial','rejected')
         OR NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by=NEW.checker_id
         OR NEW.reviewed_at IS NULL
         OR (NOT public.pke_is_platform_admin()
             AND NOT public.pke_has_project_permission(NEW.project_id,'inventory.update')) THEN
        RAISE EXCEPTION 'Receipt decision requires an independent authenticated reviewer with inventory.update permission.' USING ERRCODE='42501';
      END IF;

      IF NEW.status='rejected' THEN
        IF NULLIF(btrim(NEW.exception_reason),'') IS NULL THEN
          RAISE EXCEPTION 'Rejected warehouse receipt requires a rejection reason.' USING ERRCODE='23514';
        END IF;
      ELSE
        IF NEW.lot_id IS NULL OR NULLIF(btrim(NEW.weighbridge_ticket_key),'') IS NULL
           OR NEW.gps_latitude IS NULL OR NEW.gps_longitude IS NULL OR NEW.gps_accuracy IS NULL THEN
          RAISE EXCEPTION 'Receipt verification requires a lot, weighbridge ticket and GPS evidence.' USING ERRCODE='23514';
        END IF;
        IF NEW.status='partial' AND NULLIF(btrim(NEW.exception_reason),'') IS NULL THEN
          RAISE EXCEPTION 'Partial receipt requires a variance/exception reason.' USING ERRCODE='23514';
        END IF;

        SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR UPDATE;
        IF NOT FOUND OR lot.project_id<>NEW.project_id OR lot.unit<>NEW.unit
           OR NULLIF(btrim(lot.location),'') IS NULL THEN
          RAISE EXCEPTION 'Receipt lot must match project/unit and have a configured destination location.' USING ERRCODE='23514';
        END IF;
      END IF;
    ELSE
      IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
         OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
        RAISE EXCEPTION 'Receipt review metadata is database managed.' USING ERRCODE='55000';
      END IF;
    END IF;

    NEW.updated_at:=now();
  END IF;

  IF NEW.truck_trip_id IS NOT NULL THEN
    SELECT project_id INTO trip_project FROM public.truck_trips WHERE id=NEW.truck_trip_id FOR SHARE;
    IF NOT FOUND OR trip_project<>NEW.project_id THEN
      RAISE EXCEPTION 'Warehouse receipt trip must belong to the same project.' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.lot_id IS NOT NULL THEN
    SELECT * INTO lot FROM public.inventory_lots WHERE id=NEW.lot_id FOR SHARE;
    IF NOT FOUND OR lot.project_id<>NEW.project_id OR lot.unit<>NEW.unit THEN
      RAISE EXCEPTION 'Warehouse receipt lot must match project and unit.' USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pke_warehouse_receipt_post_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE lot_location text;
BEGIN
  IF OLD.status='pending' AND NEW.status IN ('verified','partial') THEN
    SELECT location INTO lot_location FROM public.inventory_lots WHERE id=NEW.lot_id;
    INSERT INTO public.inventory_movements(
      project_id,lot_id,warehouse_receipt_id,movement_type,quantity,unit,
      source_location,destination_location,reason,actor_id,"timestamp",status,
      idempotency_key
    ) VALUES (
      NEW.project_id,NEW.lot_id,NEW.id,'receipt',NEW.received_quantity,NEW.unit,
      NULL,lot_location,'Warehouse receipt posted',public.pke_current_user_id(),now(),
      'posted','warehouse-receipt:'||NEW.id::text
    );
    INSERT INTO public.audit_events(
      actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      project_id,after_snapshot,metadata,outcome
    ) VALUES (
      public.pke_current_user_id(),'user',current_setting('app.current_role',true),'inventory.update',
      'warehouse_receipt.verified','warehouse_receipt',NEW.id,NEW.project_id,
      jsonb_build_object('status',NEW.status,'received_quantity',NEW.received_quantity,'unit',NEW.unit,
        'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at),
      jsonb_build_object('lot_id',NEW.lot_id,'movement_key','warehouse-receipt:'||NEW.id::text,
        'weighbridge_ticket_key',NEW.weighbridge_ticket_key,'exception_reason',NEW.exception_reason),'success'
    );
  ELSIF OLD.status='pending' AND NEW.status='rejected' THEN
    INSERT INTO public.audit_events(
      actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
      project_id,after_snapshot,metadata,outcome
    ) VALUES (
      public.pke_current_user_id(),'user',current_setting('app.current_role',true),'inventory.update',
      'warehouse_receipt.rejected','warehouse_receipt',NEW.id,NEW.project_id,
      jsonb_build_object('status',NEW.status,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at),
      jsonb_build_object('exception_reason',NEW.exception_reason,'lot_id',NEW.lot_id),'success'
    );
  END IF;
  RETURN NEW;
END;
$function$
;

-- REPLACE set_rls_context(uuid)
CREATE OR REPLACE FUNCTION public.set_rls_context(user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'RLS context user_id cannot be null'
      USING ERRCODE = '22004';
  END IF;

  PERFORM pg_catalog.set_config('app.current_user_id', user_id::text, true);
  PERFORM pg_catalog.set_config('app.current_role', 'user', true);
  PERFORM pg_catalog.set_config(
    'app.current_project_id',
    '00000000-0000-0000-0000-000000000000',
    true
  );
END;
$function$
;


-- RLS ENABLE/FORCE
ALTER TABLE public.project_module_configuration_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_capacity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_operating_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_hs_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_product_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_requirement_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instruction_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_berths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_anchorages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_depth_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_loading_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_operating_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_name_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_port_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_tracking_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_port_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_assessment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_visibility_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_quality_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_tide_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_quality_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_source_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoice_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.partner_organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.facility_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.facility_capacity_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.facility_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.facility_operating_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_hs_classifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_facilities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_product_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_requirement_attributes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_demand_forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.production_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loading_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loading_segments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_document_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_holds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.matching_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instructions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.matching_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instruction_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconciliations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_terminals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_berths FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_anchorages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_depth_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_loading_services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_operating_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_zones FORCE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_bins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_identifiers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_certificates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_name_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_nominations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_port_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_tracking_positions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_port_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_assessment_results FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_rule_conditions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_ingestion_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_visibility_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.facility_certifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_quality_results FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.port_tide_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_quality_samples FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_source_citations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoice_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback FORCE ROW LEVEL SECURITY;

-- NEW POLICIES
CREATE POLICY "pke_module_config_versions_select" ON public.project_module_configuration_versions AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((pke_has_project_permission(project_id, 'operations.view'::text) OR pke_has_project_permission(project_id, 'project.configuration.manage'::text)));
CREATE POLICY "pke_module_config_versions_insert" ON public.project_module_configuration_versions AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'project.configuration.manage'::text));
CREATE POLICY "pke_admin_all" ON public.buyer_visibility_grants AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.inventory_reservations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.inventory_reservations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.view'::text));
CREATE POLICY "pke_scope_insert" ON public.inventory_reservations AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'inventory.reserve'::text));
CREATE POLICY "pke_scope_update" ON public.inventory_reservations AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.reserve'::text)) WITH CHECK (pke_has_project_permission(project_id, 'inventory.reserve'::text));
CREATE POLICY "pke_scope_delete" ON public.inventory_reservations AS PERMISSIVE DELETE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.delete'::text));
CREATE POLICY "pke_admin_all" ON public.inventory_holds AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.port_channels AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.inventory_holds AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.view'::text));
CREATE POLICY "pke_scope_insert" ON public.inventory_holds AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'inventory.hold'::text));
CREATE POLICY "pke_scope_update" ON public.inventory_holds AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.hold'::text)) WITH CHECK (pke_has_project_permission(project_id, 'inventory.hold'::text));
CREATE POLICY "pke_admin_all" ON public.inventory_reconciliations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.inventory_reconciliations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.view'::text));
CREATE POLICY "pke_scope_insert" ON public.inventory_reconciliations AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'inventory.reconcile'::text));
CREATE POLICY "pke_scope_update" ON public.inventory_reconciliations AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.reconcile'::text)) WITH CHECK (pke_has_project_permission(project_id, 'inventory.reconcile'::text));
CREATE POLICY "pke_admin_all" ON public.payment_instructions AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.payment_instructions AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'payment.view'::text));
CREATE POLICY "pke_scope_insert" ON public.payment_instructions AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'payment.request'::text));
CREATE POLICY "pke_scope_insert" ON public.vessel_nominations AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'vessel.nominate'::text));
CREATE POLICY "pke_scope_update" ON public.payment_instructions AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'payment.request'::text)) WITH CHECK (pke_has_project_permission(project_id, 'payment.request'::text));
CREATE POLICY "pke_admin_all" ON public.payment_reconciliations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.payment_reconciliations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'payment.view'::text));
CREATE POLICY "pke_scope_insert" ON public.payment_reconciliations AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'payment.reconcile'::text));
CREATE POLICY "pke_scope_update" ON public.payment_reconciliations AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'payment.reconcile'::text)) WITH CHECK (pke_has_project_permission(project_id, 'payment.reconcile'::text));
CREATE POLICY "pke_admin_all" ON public.warehouse_reservations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.warehouse_reservations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'warehouse.view'::text));
CREATE POLICY "pke_scope_insert" ON public.warehouse_reservations AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'warehouse.create'::text));
CREATE POLICY "pke_scope_update" ON public.warehouse_reservations AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'warehouse.update'::text)) WITH CHECK (pke_has_project_permission(project_id, 'warehouse.update'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_nominations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_nominations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'vessel.view'::text));
CREATE POLICY "pke_scope_update" ON public.vessel_nominations AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'vessel.nominate'::text)) WITH CHECK (pke_has_project_permission(project_id, 'vessel.nominate'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_port_assessments AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_port_assessments AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'vessel.view'::text));
CREATE POLICY "pke_scope_insert" ON public.vessel_port_assessments AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'vessel.port.assess'::text));
CREATE POLICY "pke_scope_update" ON public.vessel_port_assessments AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'vessel.port.assess'::text)) WITH CHECK (pke_has_project_permission(project_id, 'vessel.port.assess'::text));
CREATE POLICY "pke_admin_all" ON public.shipment_events AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.shipment_events AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'shipment.view'::text));
CREATE POLICY "pke_scope_insert" ON public.shipment_events AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'shipment.event.create'::text));
CREATE POLICY "pke_scope_update" ON public.shipment_events AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'shipment.event.create'::text)) WITH CHECK (pke_has_project_permission(project_id, 'shipment.event.create'::text));
CREATE POLICY "pke_admin_all" ON public.loading_tickets AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.loading_tickets AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'shipment.view'::text));
CREATE POLICY "pke_scope_insert" ON public.loading_tickets AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'loading.ticket.create'::text));
CREATE POLICY "pke_scope_update" ON public.loading_tickets AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'loading.ticket.create'::text)) WITH CHECK (pke_has_project_permission(project_id, 'loading.ticket.create'::text));
CREATE POLICY "pke_admin_all" ON public.loading_segments AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.loading_segments AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'shipment.view'::text));
CREATE POLICY "pke_scope_insert" ON public.loading_segments AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'loading.ticket.create'::text));
CREATE POLICY "pke_scope_update" ON public.loading_segments AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'loading.ticket.create'::text)) WITH CHECK (pke_has_project_permission(project_id, 'loading.ticket.create'::text));
CREATE POLICY "pke_admin_all" ON public.shipment_document_links AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.shipment_document_links AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'documents.view'::text));
CREATE POLICY "pke_scope_insert" ON public.shipment_document_links AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'documents.update'::text));
CREATE POLICY "pke_scope_update" ON public.shipment_document_links AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'documents.update'::text)) WITH CHECK (pke_has_project_permission(project_id, 'documents.update'::text));
CREATE POLICY "pke_scope_select" ON public.buyer_visibility_grants AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'buyer.shipment.view'::text));
CREATE POLICY "pke_scope_insert" ON public.buyer_visibility_grants AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'buyer.visibility.manage'::text));
CREATE POLICY "pke_scope_update" ON public.buyer_visibility_grants AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'buyer.visibility.manage'::text)) WITH CHECK (pke_has_project_permission(project_id, 'buyer.visibility.manage'::text));
CREATE POLICY "pke_admin_all" ON public.regulatory_rule_exceptions AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.regulatory_rule_exceptions AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'compliance.view'::text));
CREATE POLICY "pke_scope_insert" ON public.regulatory_rule_exceptions AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'compliance.assess'::text));
CREATE POLICY "pke_scope_update" ON public.regulatory_rule_exceptions AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'regulatory.rule.manage'::text)) WITH CHECK (pke_has_project_permission(project_id, 'regulatory.rule.manage'::text));
CREATE POLICY "pke_admin_all" ON public.regulatory_assessments AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.regulatory_assessments AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'compliance.view'::text));
CREATE POLICY "pke_scope_insert" ON public.regulatory_assessments AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'compliance.assess'::text));
CREATE POLICY "pke_admin_all" ON public.ai_runs AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.port_anchorages AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_update" ON public.ai_runs AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'ai.run'::text)) WITH CHECK (pke_has_project_permission(project_id, 'ai.run'::text));
CREATE POLICY "pke_admin_all" ON public.ai_action_requests AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.ai_action_requests AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'ai.run.view'::text));
CREATE POLICY "pke_scope_insert" ON public.ai_action_requests AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'ai.action.request'::text));
CREATE POLICY "pke_scope_update" ON public.ai_action_requests AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'ai.action.request'::text)) WITH CHECK (pke_has_project_permission(project_id, 'ai.action.request'::text));
CREATE POLICY "pke_admin_all" ON public.outbox_events AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.outbox_events AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'system.outbox.manage'::text));
CREATE POLICY "pke_scope_insert" ON public.outbox_events AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'system.outbox.manage'::text));
CREATE POLICY "pke_facility_select" ON public.facility_certifications AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.view'::text));
CREATE POLICY "pke_scope_select" ON public.port_channels AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('port.view'::text));
CREATE POLICY "pke_scope_update" ON public.outbox_events AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'system.outbox.manage'::text)) WITH CHECK (pke_has_project_permission(project_id, 'system.outbox.manage'::text));
CREATE POLICY "pke_admin_all" ON public.product_quality_samples AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.product_quality_samples AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'quality.result.create'::text));
CREATE POLICY "pke_scope_insert" ON public.product_quality_samples AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'quality.sample.create'::text));
CREATE POLICY "pke_scope_update" ON public.product_quality_samples AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'quality.result.review'::text)) WITH CHECK (pke_has_project_permission(project_id, 'quality.result.review'::text));
CREATE POLICY "pke_admin_all" ON public.production_batches AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.production_batches AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.view'::text));
CREATE POLICY "pke_scope_insert" ON public.production_batches AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_project_permission(project_id, 'inventory.create'::text));
CREATE POLICY "pke_scope_update" ON public.production_batches AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'inventory.update'::text)) WITH CHECK (pke_has_project_permission(project_id, 'inventory.update'::text));
CREATE POLICY "pke_admin_all" ON public.partner_organizations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.product_attributes AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_partner_org_select" ON public.partner_organizations AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((pke_has_partner_organization_permission(id, 'supplier.view'::text) OR pke_has_partner_organization_permission(id, 'buyer.requirement.view'::text)));
CREATE POLICY "pke_admin_all" ON public.facility_contacts AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_facility_select" ON public.facility_contacts AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.view'::text));
CREATE POLICY "pke_facility_insert" ON public.facility_contacts AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_facility_permission(facility_id, 'facility.manage'::text));
CREATE POLICY "pke_facility_update" ON public.facility_contacts AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.manage'::text)) WITH CHECK (pke_has_facility_permission(facility_id, 'facility.manage'::text));
CREATE POLICY "pke_admin_all" ON public.facility_capacity_records AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_facility_select" ON public.facility_capacity_records AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.capacity.view'::text));
CREATE POLICY "pke_facility_insert" ON public.facility_capacity_records AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_facility_permission(facility_id, 'facility.capacity.manage'::text));
CREATE POLICY "pke_facility_update" ON public.facility_capacity_records AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.capacity.manage'::text)) WITH CHECK (pke_has_facility_permission(facility_id, 'facility.capacity.manage'::text));
CREATE POLICY "pke_admin_all" ON public.facility_certifications AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.port_berths AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_facility_insert" ON public.facility_certifications AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_facility_permission(facility_id, 'facility.manage'::text));
CREATE POLICY "pke_facility_update" ON public.facility_certifications AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.manage'::text)) WITH CHECK (pke_has_facility_permission(facility_id, 'facility.manage'::text));
CREATE POLICY "pke_admin_all" ON public.facility_products AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_facility_select" ON public.facility_products AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.product.view'::text));
CREATE POLICY "pke_facility_insert" ON public.facility_products AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_facility_permission(facility_id, 'facility.product.manage'::text));
CREATE POLICY "pke_facility_update" ON public.facility_products AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.product.manage'::text)) WITH CHECK (pke_has_facility_permission(facility_id, 'facility.product.manage'::text));
CREATE POLICY "pke_admin_all" ON public.facility_operating_periods AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_facility_select" ON public.facility_operating_periods AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.view'::text));
CREATE POLICY "pke_facility_manage" ON public.facility_operating_periods AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_has_facility_permission(facility_id, 'facility.manage'::text)) WITH CHECK (pke_has_facility_permission(facility_id, 'facility.manage'::text));
CREATE POLICY "pke_admin_all" ON public.product_variants AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_product_select" ON public.product_variants AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('product.view'::text));
CREATE POLICY "pke_product_select" ON public.product_attributes AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((pke_has_any_project_permission('product.view'::text) OR pke_has_any_project_permission('quality.result.create'::text)));
CREATE POLICY "pke_admin_all" ON public.product_quality_results AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_quality_select" ON public.product_quality_results AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM product_quality_samples s
  WHERE ((s.id = product_quality_results.sample_id) AND (pke_is_platform_admin() OR ((s.project_id IS NOT NULL) AND pke_has_project_permission(s.project_id, 'quality.result.create'::text)))))));
CREATE POLICY "pke_quality_insert" ON public.product_quality_results AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK ((EXISTS ( SELECT 1
   FROM product_quality_samples s
  WHERE ((s.id = product_quality_results.sample_id) AND pke_has_project_permission(s.project_id, 'quality.result.create'::text)))));
CREATE POLICY "pke_quality_update" ON public.product_quality_results AS PERMISSIVE UPDATE TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM product_quality_samples s
  WHERE ((s.id = product_quality_results.sample_id) AND pke_has_project_permission(s.project_id, 'quality.result.review'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM product_quality_samples s
  WHERE ((s.id = product_quality_results.sample_id) AND pke_has_project_permission(s.project_id, 'quality.result.review'::text)))));
CREATE POLICY "pke_admin_all" ON public.product_hs_classifications AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_classification_select" ON public.product_hs_classifications AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((pke_has_any_project_permission('product.view'::text) OR pke_has_any_project_permission('compliance.view'::text)));
CREATE POLICY "pke_admin_all" ON public.buyer_facilities AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_buyer_facility_select" ON public.buyer_facilities AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'buyer.requirement.view'::text));
CREATE POLICY "pke_buyer_facility_insert" ON public.buyer_facilities AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text));
CREATE POLICY "pke_buyer_facility_update" ON public.buyer_facilities AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text)) WITH CHECK (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text));
CREATE POLICY "pke_admin_all" ON public.buyer_product_requirements AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_buyer_req_select" ON public.buyer_product_requirements AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'buyer.requirement.view'::text));
CREATE POLICY "pke_buyer_req_insert" ON public.buyer_product_requirements AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text));
CREATE POLICY "pke_buyer_req_update" ON public.buyer_product_requirements AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text)) WITH CHECK (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text));
CREATE POLICY "pke_admin_all" ON public.buyer_requirement_attributes AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_buyer_req_attribute_select" ON public.buyer_requirement_attributes AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM buyer_product_requirements r
  WHERE ((r.id = buyer_requirement_attributes.requirement_id) AND pke_has_buyer_permission(r.buyer_id, 'buyer.requirement.view'::text)))));
CREATE POLICY "pke_buyer_req_attribute_insert" ON public.buyer_requirement_attributes AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK ((EXISTS ( SELECT 1
   FROM buyer_product_requirements r
  WHERE ((r.id = buyer_requirement_attributes.requirement_id) AND pke_has_buyer_permission(r.buyer_id, 'buyer.requirement.manage'::text)))));
CREATE POLICY "pke_buyer_req_attribute_update" ON public.buyer_requirement_attributes AS PERMISSIVE UPDATE TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM buyer_product_requirements r
  WHERE ((r.id = buyer_requirement_attributes.requirement_id) AND pke_has_buyer_permission(r.buyer_id, 'buyer.requirement.manage'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM buyer_product_requirements r
  WHERE ((r.id = buyer_requirement_attributes.requirement_id) AND pke_has_buyer_permission(r.buyer_id, 'buyer.requirement.manage'::text)))));
CREATE POLICY "pke_admin_all" ON public.buyer_demand_forecasts AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_buyer_forecast_select" ON public.buyer_demand_forecasts AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'buyer.requirement.view'::text));
CREATE POLICY "pke_buyer_forecast_insert" ON public.buyer_demand_forecasts AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text));
CREATE POLICY "pke_buyer_forecast_update" ON public.buyer_demand_forecasts AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text)) WITH CHECK (pke_has_buyer_permission(buyer_id, 'buyer.requirement.manage'::text));
CREATE POLICY "pke_admin_all" ON public.matching_runs AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_matching_select" ON public.matching_runs AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'matching.view'::text));
CREATE POLICY "pke_scope_select" ON public.port_berths AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('port.view'::text));
CREATE POLICY "pke_matching_insert" ON public.matching_runs AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_buyer_permission(buyer_id, 'matching.run'::text));
CREATE POLICY "pke_matching_update" ON public.matching_runs AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_buyer_permission(buyer_id, 'matching.run'::text)) WITH CHECK (pke_has_buyer_permission(buyer_id, 'matching.run'::text));
CREATE POLICY "pke_admin_all" ON public.matching_candidates AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_matching_candidate_select" ON public.matching_candidates AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM matching_runs r
  WHERE ((r.id = matching_candidates.matching_run_id) AND pke_has_buyer_permission(r.buyer_id, 'matching.view'::text)))));
CREATE POLICY "pke_matching_candidate_insert" ON public.matching_candidates AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK ((EXISTS ( SELECT 1
   FROM matching_runs r
  WHERE ((r.id = matching_candidates.matching_run_id) AND pke_has_buyer_permission(r.buyer_id, 'matching.run'::text)))));
CREATE POLICY "pke_matching_candidate_update" ON public.matching_candidates AS PERMISSIVE UPDATE TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM matching_runs r
  WHERE ((r.id = matching_candidates.matching_run_id) AND pke_has_buyer_permission(r.buyer_id, 'matching.run'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM matching_runs r
  WHERE ((r.id = matching_candidates.matching_run_id) AND pke_has_buyer_permission(r.buyer_id, 'matching.run'::text)))));
CREATE POLICY "pke_admin_all" ON public.port_terminals AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.port_terminals AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('port.view'::text));
CREATE POLICY "pke_scope_select" ON public.port_anchorages AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('port.view'::text));
CREATE POLICY "pke_admin_all" ON public.port_depth_observations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.port_depth_observations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_port_permission(port_id, 'port.depth.view'::text));
CREATE POLICY "pke_admin_all" ON public.port_tide_observations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.port_tide_observations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_port_permission(port_id, 'port.view'::text));
CREATE POLICY "pke_admin_all" ON public.port_loading_services AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.port_loading_services AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_port_permission(port_id, 'port.view'::text));
CREATE POLICY "pke_admin_all" ON public.port_equipment AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.port_equipment AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_port_permission(port_id, 'port.view'::text));
CREATE POLICY "pke_admin_all" ON public.port_operating_limits AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.port_operating_limits AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_port_permission(port_id, 'port.view'::text));
CREATE POLICY "pke_admin_all" ON public.warehouse_zones AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.warehouse_zones AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('warehouse.view'::text));
CREATE POLICY "pke_admin_all" ON public.warehouse_bins AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.fiscal_periods AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((pke_has_any_project_permission('finance.view'::text) OR pke_has_any_project_permission('accounting.view'::text)));
CREATE POLICY "pke_scope_select" ON public.warehouse_bins AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM warehouse_zones z
  WHERE ((z.id = warehouse_bins.zone_id) AND pke_has_any_project_permission('warehouse.view'::text)))));
CREATE POLICY "pke_admin_all" ON public.warehouse_equipment AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.warehouse_equipment AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('warehouse.view'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_name_history AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_name_history AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('vessel.view'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_identifiers AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_identifiers AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('vessel.view'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_certificates AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_certificates AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('vessel.view'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_tracking_positions AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_tracking_positions AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('vessel.position.view'::text));
CREATE POLICY "pke_admin_all" ON public.vessel_port_calls AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.vessel_port_calls AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_any_project_permission('vessel.view'::text));
CREATE POLICY "pke_admin_all" ON public.fiscal_periods AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.payment_instruction_approvals AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.payment_instruction_approvals AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.view'::text));
CREATE POLICY "pke_admin_all" ON public.payment_evidence AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.payment_evidence AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.view'::text));
CREATE POLICY "pke_admin_all" ON public.payment_verifications AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.payment_verifications AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.view'::text));
CREATE POLICY "pke_admin_all" ON public.payment_invoice_allocations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.payment_invoice_allocations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.view'::text));
CREATE POLICY "pke_admin_all" ON public.regulatory_rules AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.regulatory_rule_versions AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.regulatory_rule_conditions AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.regulatory_rule_documents AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.regulatory_assessment_results AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_admin_all" ON public.knowledge_documents AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.knowledge_documents AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((access_rights = 'public'::text) AND (status = 'indexed'::text) AND pke_has_any_project_permission('knowledge.search'::text)));
CREATE POLICY "pke_admin_all" ON public.knowledge_document_versions AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.knowledge_document_versions AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM knowledge_documents d
  WHERE ((d.id = knowledge_document_versions.document_id) AND (d.access_rights = 'public'::text) AND (d.status = 'indexed'::text) AND pke_has_any_project_permission('knowledge.search'::text)))));
CREATE POLICY "pke_admin_all" ON public.knowledge_chunks AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.knowledge_chunks AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM (knowledge_document_versions v
     JOIN knowledge_documents d ON ((d.id = v.document_id)))
  WHERE ((v.id = knowledge_chunks.document_version_id) AND (d.access_rights = 'public'::text) AND (d.status = 'indexed'::text) AND pke_has_any_project_permission('knowledge.search'::text)))));
CREATE POLICY "pke_admin_all" ON public.knowledge_ingestion_runs AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.knowledge_ingestion_runs AS PERMISSIVE SELECT TO "app_runtime_secure" USING (false);
CREATE POLICY "pke_admin_all" ON public.ai_source_citations AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_scope_select" ON public.ai_source_citations AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_has_ai_run_permission(ai_run_id, 'ai.run.view'::text));
CREATE POLICY "pke_admin_all" ON public.ai_feedback AS PERMISSIVE ALL TO "app_runtime_secure" USING (pke_is_platform_admin()) WITH CHECK (pke_is_platform_admin());
CREATE POLICY "pke_audit_admin_select" ON public.audit_events AS PERMISSIVE SELECT TO "app_runtime_secure" USING (pke_is_platform_admin());
CREATE POLICY "pke_audit_project_select" ON public.audit_events AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((project_id IS NOT NULL) AND pke_has_project_permission(project_id, 'audit.view'::text)));
CREATE POLICY "pke_audit_insert_self" ON public.audit_events AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (((actor_user_id = pke_current_user_id()) OR pke_is_platform_admin()));
CREATE POLICY "pke_idempotency_select_own" ON public.idempotency_keys AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((actor_user_id = pke_current_user_id()) OR pke_is_platform_admin()));
CREATE POLICY "pke_idempotency_insert_own" ON public.idempotency_keys AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (((actor_user_id = pke_current_user_id()) OR pke_is_platform_admin()));
CREATE POLICY "pke_idempotency_update_own" ON public.idempotency_keys AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (((actor_user_id = pke_current_user_id()) OR pke_is_platform_admin())) WITH CHECK (((actor_user_id = pke_current_user_id()) OR pke_is_platform_admin()));
CREATE POLICY "pke_ai_runs_select" ON public.ai_runs AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((user_id = pke_current_user_id()) OR ((project_id IS NOT NULL) AND pke_has_project_permission(project_id, 'ai.run.view'::text))));
CREATE POLICY "pke_ai_runs_insert" ON public.ai_runs AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (((user_id = pke_current_user_id()) AND ((project_id IS NULL) OR pke_has_project_permission(project_id, 'ai.run'::text))));
CREATE POLICY "pke_ai_runs_update" ON public.ai_runs AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (((user_id = pke_current_user_id()) OR pke_is_platform_admin())) WITH CHECK (((user_id = pke_current_user_id()) OR pke_is_platform_admin()));
CREATE POLICY "pke_ai_feedback_select" ON public.ai_feedback AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((user_id = pke_current_user_id()) OR pke_is_platform_admin()));
CREATE POLICY "pke_ai_feedback_insert" ON public.ai_feedback AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (((user_id = pke_current_user_id()) AND pke_has_ai_run_permission(ai_run_id, 'ai.run'::text)));
CREATE POLICY "pke_journal_post" ON public.journal_entries AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'accounting.post'::text)) WITH CHECK (pke_has_project_permission(project_id, 'accounting.post'::text));
CREATE POLICY "pke_journal_lines_insert" ON public.journal_lines AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_journal_entry_permission(journal_entry_id, 'accounting.create'::text));
CREATE POLICY "pke_journal_lines_update" ON public.journal_lines AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_journal_entry_permission(journal_entry_id, 'accounting.update'::text)) WITH CHECK (pke_has_journal_entry_permission(journal_entry_id, 'accounting.update'::text));
CREATE POLICY "pke_journal_lines_delete" ON public.journal_lines AS PERMISSIVE DELETE TO "app_runtime_secure" USING (pke_has_journal_entry_permission(journal_entry_id, 'accounting.delete'::text));
CREATE POLICY "pke_payment_approvals_insert" ON public.payment_instruction_approvals AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.approve'::text));
CREATE POLICY "pke_payment_evidence_insert" ON public.payment_evidence AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.request'::text));
CREATE POLICY "pke_payment_evidence_update" ON public.payment_evidence AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.evidence.verify'::text)) WITH CHECK (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.evidence.verify'::text));
CREATE POLICY "pke_payment_verifications_insert" ON public.payment_verifications AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.evidence.verify'::text));
CREATE POLICY "pke_payment_invoice_allocation_insert" ON public.payment_invoice_allocations AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK (pke_has_payment_instruction_permission(payment_instruction_id, 'payment.request'::text));
CREATE POLICY "pke_payment_instruction_approve_update" ON public.payment_instructions AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'payment.approve'::text)) WITH CHECK (pke_has_project_permission(project_id, 'payment.approve'::text));
CREATE POLICY "pke_payment_instruction_issue_update" ON public.payment_instructions AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (pke_has_project_permission(project_id, 'payment.instruction.issue'::text)) WITH CHECK (pke_has_project_permission(project_id, 'payment.instruction.issue'::text));
CREATE POLICY "pke_scope_select" ON public.regulatory_assessment_results AS PERMISSIVE SELECT TO "app_runtime_secure" USING ((pke_is_platform_admin() OR (EXISTS ( SELECT 1
   FROM regulatory_assessments a
  WHERE ((a.id = regulatory_assessment_results.assessment_id) AND (a.project_id IS NOT NULL) AND pke_has_project_permission(a.project_id, 'compliance.view'::text))))));
CREATE POLICY "pke_scope_insert" ON public.regulatory_assessment_results AS PERMISSIVE INSERT TO "app_runtime_secure" WITH CHECK ((EXISTS ( SELECT 1
   FROM regulatory_assessments a
  WHERE ((a.id = regulatory_assessment_results.assessment_id) AND (a.project_id IS NOT NULL) AND pke_has_project_permission(a.project_id, 'compliance.assess'::text)))));
CREATE POLICY "pke_scope_update" ON public.regulatory_assessment_results AS PERMISSIVE UPDATE TO "app_runtime_secure" USING ((EXISTS ( SELECT 1
   FROM regulatory_assessments a
  WHERE ((a.id = regulatory_assessment_results.assessment_id) AND (a.project_id IS NOT NULL) AND pke_has_project_permission(a.project_id, 'compliance.assess'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM regulatory_assessments a
  WHERE ((a.id = regulatory_assessment_results.assessment_id) AND (a.project_id IS NOT NULL) AND pke_has_project_permission(a.project_id, 'compliance.assess'::text)))));
CREATE POLICY "pke_scope_update" ON public.regulatory_assessments AS PERMISSIVE UPDATE TO "app_runtime_secure" USING (((project_id IS NOT NULL) AND pke_has_project_permission(project_id, 'compliance.assess'::text))) WITH CHECK (((project_id IS NOT NULL) AND pke_has_project_permission(project_id, 'compliance.assess'::text)));
CREATE POLICY "pke_scope_select" ON public.regulatory_rules AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((status = ANY (ARRAY['approved'::text, 'effective'::text])) AND (pke_has_any_project_permission('regulatory.rule.view'::text) OR pke_has_any_project_permission('compliance.view'::text))));
CREATE POLICY "pke_scope_select" ON public.regulatory_rule_versions AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((status = ANY (ARRAY['approved'::text, 'effective'::text])) AND (pke_has_any_project_permission('regulatory.rule.view'::text) OR pke_has_any_project_permission('compliance.view'::text))));
CREATE POLICY "pke_scope_select" ON public.regulatory_rule_conditions AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((EXISTS ( SELECT 1
   FROM regulatory_rule_versions v
  WHERE ((v.id = regulatory_rule_conditions.rule_version_id) AND (v.status = ANY (ARRAY['approved'::text, 'effective'::text]))))) AND (pke_has_any_project_permission('regulatory.rule.view'::text) OR pke_has_any_project_permission('compliance.view'::text))));
CREATE POLICY "pke_scope_select" ON public.regulatory_rule_documents AS PERMISSIVE SELECT TO "app_runtime_secure" USING (((EXISTS ( SELECT 1
   FROM regulatory_rule_versions v
  WHERE ((v.id = regulatory_rule_documents.rule_version_id) AND (v.status = ANY (ARRAY['approved'::text, 'effective'::text]))))) AND (pke_has_any_project_permission('regulatory.rule.view'::text) OR pke_has_any_project_permission('compliance.view'::text))));

-- CHANGED POLICIES
ALTER POLICY "pke_regulatory_sources_read" ON public.regulatory_sources TO "app_runtime_secure" USING (((verification_status = ANY (ARRAY['verified'::text, 'approved'::text])) AND (pke_has_any_project_permission('regulatory.source.view'::text) OR pke_has_any_project_permission('regulatory.rule.view'::text) OR pke_has_any_project_permission('compliance.view'::text))));

-- NEW NON-CONSTRAINT INDEXES
CREATE INDEX idx_quality_samples_lot ON public.product_quality_samples USING btree (lot_id, sampled_at DESC);
CREATE INDEX idx_fk_d8a6f5e253795d55 ON public.matching_runs USING btree (generated_by);
CREATE UNIQUE INDEX idx_inventory_reservations_idempotency ON public.inventory_reservations USING btree (project_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_fk_5b58985aefe21dd0 ON public.ports USING btree (country_code);
CREATE INDEX idx_port_tide_port_observed ON public.port_tide_observations USING btree (port_id, observed_at DESC);
CREATE INDEX idx_fk_cc0803abbe55ef02 ON public.ai_action_requests USING btree (ai_run_id);
CREATE INDEX idx_fk_3677ca7791f5b3a9 ON public.vessel_nominations USING btree (reviewed_by);
CREATE INDEX idx_ai_runs_project_created ON public.ai_runs USING btree (project_id, created_at DESC);
CREATE INDEX idx_fk_7fdf7eb1e7e7ad6a ON public.packing_batches USING btree (project_id);
CREATE INDEX idx_fk_900bafa9bfb4083a ON public.pks_sites USING btree (verified_by);
CREATE INDEX idx_fk_2641413d22d23d89 ON public.buyer_demand_forecasts USING btree (buyer_facility_id);
CREATE INDEX idx_port_channels_port_status ON public.port_channels USING btree (port_id, status);
CREATE INDEX idx_fk_8c2f44287d34722b ON public.vessel_port_assessments USING btree (berth_id);
CREATE INDEX idx_fk_7ada565304a557c0 ON public.project_product_specifications USING btree (created_by);
CREATE INDEX idx_fk_2d11965033c61cd9 ON public.regulatory_rule_exceptions USING btree (rule_version_id);
CREATE INDEX idx_port_terminals_port_status ON public.port_terminals USING btree (port_id, status);
CREATE INDEX idx_fk_ebde9fff2405e2ad ON public.shipment_events USING btree (actor_id);
CREATE INDEX idx_fk_295416088c88d0d4 ON public.ai_source_citations USING btree (knowledge_chunk_id);
CREATE INDEX idx_audit_events_project_time ON public.audit_events USING btree (project_id, occurred_at DESC);
CREATE INDEX idx_fk_d7362d8960306ce5 ON public.packing_batches USING btree (lot_id);
CREATE INDEX idx_fk_d644e399e65238b7 ON public.port_operating_limits USING btree (terminal_id);
CREATE INDEX idx_fk_cd13a3bd9ead04e1 ON public.ai_source_citations USING btree (regulatory_rule_version_id);
CREATE INDEX idx_payment_reconciliations_project_status ON public.payment_reconciliations USING btree (project_id, reconciliation_status);
CREATE INDEX idx_fk_0897bf958b79f1af ON public.vessel_port_calls USING btree (vessel_id);
CREATE INDEX idx_fk_3fdf06d4b2178e66 ON public.product_specifications USING btree (supersedes_specification_id);
CREATE INDEX idx_fk_9564660954dc3383 ON public.payment_verifications USING btree (verified_by);
CREATE INDEX idx_fk_13cedafba7adce53 ON public.cost_obligations USING btree (currency_id);
CREATE INDEX idx_fk_aa3c6796895826ea ON public.payment_reconciliations USING btree (currency_id);
CREATE INDEX idx_fk_b8b1af4ff84f48ff ON public.fx_exposures USING btree (functional_currency_id);
CREATE INDEX idx_product_attributes_active ON public.product_attributes USING btree (is_active, attribute_code);
CREATE INDEX idx_fk_3320a33485b6bee3 ON public.project_financiers USING btree (vendor_id);
CREATE INDEX idx_facility_capacity_lookup ON public.facility_capacity_records USING btree (facility_id, process_type, effective_from DESC);
CREATE INDEX idx_fk_1ed9324a705f5d2d ON public.facility_products USING btree (capacity_record_id);
CREATE INDEX idx_fk_847fa9f9ab0e2f7f ON public.voyages USING btree (vessel_id);
CREATE INDEX idx_fk_8a5e36005e199e19 ON public.project_change_requests USING btree (project_id);
CREATE INDEX idx_port_depth_feature_time ON public.port_depth_observations USING btree (port_id, depth_feature_type, observed_at DESC);
CREATE INDEX idx_inventory_movements_project_time ON public.inventory_movements USING btree (project_id, "timestamp" DESC);
CREATE INDEX idx_fk_0d251384c07a76c3 ON public.loading_operations USING btree (vessel_id);
CREATE INDEX idx_fk_bab918518d9ed935 ON public.inventory_holds USING btree (released_by);
CREATE INDEX idx_fk_37535e005df177d8 ON public.regulatory_rules USING btree (active_version_id);
CREATE INDEX idx_fk_c9786063ff9c068e ON public.project_role_permissions USING btree (permission_id);
CREATE INDEX idx_fk_14649550b0edfd9e ON public.facility_certifications USING btree (verified_by);
CREATE INDEX idx_fk_443e55ab560def5a ON public.vessel_port_calls USING btree (port_id);
CREATE INDEX idx_fk_ed053972f9080dc8 ON public.buyer_facilities USING btree (verified_by);
CREATE INDEX idx_regulatory_rule_conditions_version ON public.regulatory_rule_conditions USING btree (rule_version_id, condition_group);
CREATE INDEX idx_fk_f349b751eb7c71df ON public.buyer_parties USING btree (buyer_id);
CREATE INDEX idx_regulatory_rules_jurisdiction_status ON public.regulatory_rules USING btree (jurisdiction, status);
CREATE INDEX idx_fk_9f8160876782e4bb ON public.payment_instructions USING btree (currency_id);
CREATE INDEX idx_partner_org_name ON public.partner_organizations USING btree (lower(legal_name));
CREATE INDEX idx_fk_f942fa04c5850ac1 ON public.shipments USING btree (destination_port_id);
CREATE INDEX idx_fk_b03f09fd5e598851 ON public.buyer_product_requirements USING btree (product_specification_id);
CREATE INDEX idx_fk_bc6e146cf957f1ab ON public.country_export_document_requirements USING btree (verified_by);
CREATE INDEX idx_payment_invoice_ap ON public.payment_invoice_allocations USING btree (ap_invoice_id);
CREATE INDEX idx_fk_c2ba5e6dbfb9c845 ON public.fiscal_periods USING btree (closed_by);
CREATE UNIQUE INDEX idx_shipment_allocations_idempotency ON public.shipment_allocations USING btree (project_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_fk_a85ee08a3193b37b ON public.project_financiers USING btree (created_by);
CREATE INDEX idx_fk_0aa54aa77ac87018 ON public.vessel_certificates USING btree (vessel_id);
CREATE INDEX idx_fk_21e8d6d113196075 ON public.warehouse_reservations USING btree (created_by);
CREATE INDEX idx_fk_5b610f52fdf70f8e ON public.regulatory_assessments USING btree (origin_country);
CREATE INDEX idx_fk_47a2a81d92374ced ON public.production_batches USING btree (created_by);
CREATE INDEX idx_fk_7fd932863a7346f5 ON public.ai_action_requests USING btree (reviewed_by);
CREATE INDEX idx_fk_aef42bbf6c732c2f ON public.pks_sites USING btree (country_code);
CREATE INDEX idx_fk_2aeb1e9c31170576 ON public.project_export_document_requirements USING btree (country_requirement_id);
CREATE INDEX idx_fk_99572e47a42de457 ON public.vessel_name_history USING btree (vessel_id);
CREATE INDEX idx_fk_5113bfb727d9c739 ON public.vessels USING btree (manager_organization_id);
CREATE INDEX idx_fk_fc46a87aae6eb2ae ON public.truck_trips USING btree (pks_site_id);
CREATE INDEX idx_regulatory_rule_versions_effective ON public.regulatory_rule_versions USING btree (rule_id, status, effective_from, effective_to);
CREATE INDEX idx_regulatory_assessment_results_assessment ON public.regulatory_assessment_results USING btree (assessment_id, result_status);
CREATE INDEX idx_warehouse_receipts_reviewed_by ON public.warehouse_receipts USING btree (reviewed_by);
CREATE INDEX idx_fk_0218bee6aa857fcd ON public.product_quality_results USING btree (reviewed_by);
CREATE INDEX idx_regulatory_sources_search ON public.regulatory_sources USING gin (search_vector);
CREATE INDEX idx_fk_6b0d2ee361e7af82 ON public.warehouse_reservations USING btree (bin_id);
CREATE INDEX idx_idempotency_keys_expiry ON public.idempotency_keys USING btree (expires_at);
CREATE INDEX idx_payment_instructions_advance ON public.payment_instructions USING btree (cash_advance_id);
CREATE INDEX idx_fk_9b04578ad8b334c0 ON public.buyer_facilities USING btree (country_code);
CREATE INDEX idx_buyer_req_attributes_requirement ON public.buyer_requirement_attributes USING btree (requirement_id, attribute_id);
CREATE INDEX idx_fk_a30466eb9c0ee87c ON public.shipments USING btree (voyage_id);
CREATE INDEX idx_fk_d162083e26f5a8ac ON public.buyer_product_requirements USING btree (product_variant_id);
CREATE INDEX idx_fk_c8d454db989662cb ON public.report_runs USING btree (schedule_id);
CREATE UNIQUE INDEX idx_vessels_imo_unique ON public.vessels USING btree (imo_number) WHERE (imo_number IS NOT NULL);
CREATE INDEX idx_fk_b2b9cf2b2e63f6ab ON public.ap_invoices USING btree (related_payment_obligation_id);
CREATE INDEX idx_fk_6efc04e2819c367b ON public.report_schedules USING btree (project_id);
CREATE INDEX idx_product_specs_effective ON public.product_specifications USING btree (product_id, status, effective_from DESC);
CREATE INDEX idx_fk_6f5e220dcf9b4f16 ON public.loading_segments USING btree (equipment_id);
CREATE INDEX idx_fk_dbdc6a5df149fc6d ON public.project_product_specifications USING btree (product_id);
CREATE INDEX idx_fk_969ff651fb47770e ON public.regulatory_assessment_results USING btree (reviewer_id);
CREATE INDEX idx_warehouse_reservations_project_window ON public.warehouse_reservations USING btree (project_id, warehouse_id, window_start, window_end, status);
CREATE INDEX idx_fk_e8dc309cc489639f ON public.report_export_audit USING btree (user_id);
CREATE INDEX idx_shipment_allocations_project_status ON public.shipment_allocations USING btree (project_id, status);
CREATE INDEX idx_port_berths_terminal_status ON public.port_berths USING btree (terminal_id, status);
CREATE UNIQUE INDEX pke_payment_invoice_allocation_ap_unique ON public.payment_invoice_allocations USING btree (payment_instruction_id, ap_invoice_id) WHERE (ap_invoice_id IS NOT NULL);
CREATE INDEX idx_fk_f6a4513c167424f0 ON public.project_members USING btree (deactivated_by);
CREATE INDEX idx_fk_27fcdc4b7ae43ea1 ON public.approval_events USING btree (project_id);
CREATE INDEX idx_fk_00dea6f475ae8df1 ON public.regulatory_assessment_results USING btree (rule_version_id);
CREATE INDEX idx_fk_3b32a77622579915 ON public.warehouse_reservations USING btree (lot_id);
CREATE INDEX idx_pks_sites_facility_type ON public.pks_sites USING btree (facility_type, operating_status, verification_status);
CREATE INDEX idx_fk_215de290a450111f ON public.vessel_nominations USING btree (nominated_by);
CREATE INDEX idx_fk_3bf2c34c59ab6042 ON public.project_invitations USING btree (project_role_id, project_id);
CREATE INDEX idx_fk_a173206a5f812d38 ON public.buyer_product_requirements USING btree (reviewed_by);
CREATE INDEX idx_fk_abfb6f8ae249fcf4 ON public.payment_instruction_approvals USING btree (approver_id);
CREATE INDEX idx_fk_798d1e8576e3b071 ON public.report_runs USING btree (requested_by);
CREATE INDEX idx_fk_8f27edee99d450b9 ON public.vessel_nominations USING btree (voyage_id);
CREATE INDEX idx_fk_7ec0738ac2a7b328 ON public.voyages USING btree (origin_port_id);
CREATE INDEX idx_fk_d12c6e88fec2c442 ON public.regulatory_assessments USING btree (shipment_id);
CREATE INDEX idx_fk_da3331d9d8c3f970 ON public.contracts USING btree (buyer_id);
CREATE INDEX idx_fk_67da6eeb1369eaa2 ON public.port_operating_limits USING btree (berth_id);
CREATE INDEX idx_matching_runs_requirement ON public.matching_runs USING btree (requirement_id, created_at DESC);
CREATE INDEX idx_fk_cfcea049a40da2b6 ON public.facility_products USING btree (product_variant_id);
CREATE INDEX idx_fk_0dade5aad0cd632d ON public.voyages USING btree (destination_port_id);
CREATE INDEX idx_fk_ffc76631cbefaa3a ON public.payment_instructions USING btree (acknowledged_by);
CREATE UNIQUE INDEX idx_voyages_code_unique ON public.voyages USING btree (voyage_code) WHERE (voyage_code IS NOT NULL);
CREATE INDEX idx_fk_58888b8c4c722504 ON public.admin_action_queue USING btree (resolved_by);
CREATE INDEX idx_fk_a713dd9a06e22534 ON public.project_export_document_requirements USING btree (overridden_by);
CREATE UNIQUE INDEX idx_shipments_code_unique ON public.shipments USING btree (shipment_code) WHERE (shipment_code IS NOT NULL);
CREATE INDEX idx_fk_380df7163533fdaa ON public.partner_organizations USING btree (verified_by);
CREATE INDEX idx_journal_entries_reversal_ref ON public.journal_entries USING btree (reversal_of_journal_entry_id);
CREATE INDEX idx_fk_dc136da212105b0d ON public.fx_rates USING btree (to_currency_id);
CREATE INDEX idx_fk_4642e45a2bd22ae4 ON public.country_export_document_requirements USING btree (regulatory_source_id);
CREATE INDEX idx_fk_0646235b227ac9a4 ON public.port_tide_observations USING btree (berth_id);
CREATE INDEX idx_inventory_holds_lot_status ON public.inventory_holds USING btree (lot_id, status);
CREATE INDEX idx_fk_373d21c19e82fb7c ON public.country_export_document_requirements USING btree (product_id);
CREATE UNIQUE INDEX tracking_events_trip_idempotency_unique ON public.tracking_events USING btree (truck_trip_id, idempotency_key);
CREATE INDEX idx_outbox_pending ON public.outbox_events USING btree (status, available_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));
CREATE INDEX idx_fk_8650b46a377dd116 ON public.matching_candidates USING btree (lot_id);
CREATE INDEX idx_fk_aa115abd7754548d ON public.loading_tickets USING btree (lot_id);
CREATE INDEX idx_fk_7ffe42de793fe8be ON public.buyer_visibility_grants USING btree (facility_id);
CREATE INDEX idx_fk_8793ded6fe875a92 ON public.fx_exposure USING btree (project_id);
CREATE INDEX idx_facility_operating_periods_facility ON public.facility_operating_periods USING btree (facility_id, effective_from, effective_to);
CREATE UNIQUE INDEX idx_journal_entries_single_reversal ON public.journal_entries USING btree (reversal_of_journal_entry_id) WHERE (reversal_of_journal_entry_id IS NOT NULL);
CREATE INDEX idx_loading_segments_project_operation ON public.loading_segments USING btree (project_id, loading_operation_id, status);
CREATE INDEX idx_fk_9a5f8f6c85b46bb7 ON public.project_role_permissions USING btree (granted_by);
CREATE INDEX idx_fk_278cf4452ba324bf ON public.cycle_policies USING btree (contract_program_id);
CREATE INDEX idx_fk_9b677196f50abaf2 ON public.payment_reconciliations USING btree (verification_id);
CREATE INDEX idx_fk_b211109236b2dffb ON public.loading_tickets USING btree (verified_by);
CREATE UNIQUE INDEX idx_inventory_movement_idempotency ON public.inventory_movements USING btree (project_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_fk_0d292d9a54afd20b ON public.payment_obligations USING btree (payment_method_id);
CREATE INDEX idx_fk_f47106b2e3971082 ON public.inventory_movements USING btree (warehouse_receipt_id);
CREATE INDEX idx_fk_aca0129436d4fb6a ON public.fiscal_periods USING btree (created_by);
CREATE INDEX idx_fk_79324ea328957e1e ON public.product_variants USING btree (created_by);
CREATE INDEX idx_fk_9567432460cbe944 ON public.payment_obligations USING btree (created_by);
CREATE INDEX idx_fk_0ea6bbb6d718003c ON public.regulatory_assessments USING btree (product_hs_classification_id);
CREATE INDEX idx_fk_eee6f4306b321789 ON public.inventory_reservations USING btree (shipment_id);
CREATE INDEX idx_fk_5897c70e45ad662c ON public.project_operating_profiles USING btree (primary_pks_site_id);
CREATE INDEX idx_fk_c2c4414467d2f1cf ON public.facility_contacts USING btree (created_by);
CREATE INDEX idx_loading_tickets_project_operation ON public.loading_tickets USING btree (project_id, loading_operation_id, status);
CREATE INDEX idx_quality_samples_project ON public.product_quality_samples USING btree (project_id, sampled_at DESC);
CREATE INDEX idx_fk_e989eea6b0598a7b ON public.product_hs_classifications USING btree (product_variant_id);
CREATE INDEX idx_audit_events_action_time ON public.audit_events USING btree (action, occurred_at DESC);
CREATE INDEX idx_fk_3934e2301e882bd2 ON public.port_equipment USING btree (terminal_id);
CREATE INDEX idx_fk_e715c2d1a20645b5 ON public.knowledge_ingestion_runs USING btree (document_version_id);
CREATE INDEX idx_regulatory_sources_verification ON public.regulatory_sources USING btree (verification_status, last_reviewed DESC);
CREATE INDEX idx_fk_56e56ee2bea51929 ON public.vessel_name_history USING btree (verified_by);
CREATE INDEX idx_fk_dddac166252be324 ON public.payment_instructions USING btree (requested_by);
CREATE INDEX idx_fk_6d29aaaec9a3be70 ON public.warehouse_reservations USING btree (warehouse_id);
CREATE INDEX idx_fk_ffcb665c9d4bfda2 ON public.vessel_port_assessments USING btree (terminal_id);
CREATE INDEX idx_fk_9d0dc882d6c2cd4e ON public.buyer_demand_forecasts USING btree (currency_id);
CREATE INDEX idx_facility_contacts_facility ON public.facility_contacts USING btree (facility_id, is_active);
CREATE INDEX idx_fk_140f3cf6666adfdd ON public.vessel_port_assessments USING btree (vessel_id);
CREATE INDEX idx_shipment_allocations_reservation ON public.shipment_allocations USING btree (reservation_id, status);
CREATE INDEX idx_fk_bd2c0d90a7c90361 ON public.shipments USING btree (project_id);
CREATE INDEX idx_fk_a49ca4ca9ba3fdbd ON public.buyer_product_requirements USING btree (buyer_facility_id);
CREATE INDEX idx_fk_52778647148ec221 ON public.project_invitations USING btree (invited_by);
CREATE INDEX idx_payment_instructions_returned_by ON public.payment_instructions USING btree (returned_by);
CREATE INDEX idx_fk_c5ae4a14f945a5cc ON public.matching_candidates USING btree (product_variant_id);
CREATE INDEX idx_fk_a63a09825004124f ON public.regulatory_rule_versions USING btree (regulatory_source_id);
CREATE INDEX idx_fk_f08d03c67afa5373 ON public.project_invitations USING btree (accepted_user_id);
CREATE INDEX idx_fk_92a4cf9e20fc53b9 ON public.contract_programs USING btree (buyer_id);
CREATE INDEX idx_fx_exposures_maturity ON public.fx_exposures USING btree (project_id, original_currency_id, maturity_date);
CREATE INDEX idx_facility_products_product ON public.facility_products USING btree (product_id, capability_status);
CREATE INDEX idx_fk_2ba0bd8ed9e58be5 ON public.project_supplier_participation USING btree (vendor_id);
CREATE INDEX idx_inventory_reconciliations_project_status ON public.inventory_reconciliations USING btree (project_id, status);
CREATE INDEX idx_fk_d2397479580d42af ON public.inventory_reservations USING btree (buyer_id);
CREATE INDEX idx_fk_953a63a513ed7514 ON public.buyer_requirement_attributes USING btree (attribute_id);
CREATE INDEX idx_vessel_tracking_positions_vessel_time ON public.vessel_tracking_positions USING btree (vessel_id, position_timestamp DESC);
CREATE INDEX idx_fk_ad5d553e5a897279 ON public.contract_programs USING btree (contract_id);
CREATE INDEX idx_fk_08e4f17cc468cea2 ON public.vessels USING btree (operator_organization_id);
CREATE INDEX idx_fk_632634de888251b1 ON public.production_batches USING btree (product_id);
CREATE INDEX idx_tracking_evidence_uploaded_by ON public.tracking_evidence USING btree (uploaded_by);
CREATE INDEX idx_fk_ef0630ca88c8f133 ON public.ai_action_requests USING btree (requested_by);
CREATE INDEX idx_fk_726004bc84afe7d3 ON public.knowledge_ingestion_runs USING btree (requested_by);
CREATE INDEX idx_fk_cb82420411e25d7c ON public.port_depth_observations USING btree (channel_id);
CREATE INDEX idx_fk_71a8701125dcd028 ON public.regulatory_assessments USING btree (destination_country);
CREATE INDEX idx_fk_ae10c58edd16ee09 ON public.ai_feedback USING btree (user_id);
CREATE INDEX idx_fk_00e5b7519278e8bb ON public.product_quality_results USING btree (attribute_id);
CREATE INDEX idx_knowledge_documents_source ON public.knowledge_documents USING btree (source_id, status);
CREATE INDEX idx_fk_775cecd1e997762d ON public.regulatory_rule_exceptions USING btree (shipment_id);
CREATE INDEX idx_inventory_reservations_project_status ON public.inventory_reservations USING btree (project_id, status);
CREATE INDEX idx_fk_bd3d724be3cc581d ON public.country_export_document_requirements USING btree (document_type_id);
CREATE INDEX idx_fiscal_periods_dates_status ON public.fiscal_periods USING btree (period_start, period_end, status);
CREATE INDEX idx_knowledge_chunks_search ON public.knowledge_chunks USING gin (search_vector);
CREATE INDEX idx_fk_40ec718f8de77f0b ON public.buyer_facilities USING btree (organization_id);
CREATE INDEX idx_fk_4950d12c353b2151 ON public.project_product_specifications USING btree (product_specification_id);
CREATE INDEX idx_fk_caa240e005770da4 ON public.inventory_reconciliations USING btree (counted_by);
CREATE INDEX idx_fk_220f250817540a10 ON public.loading_operations USING btree (port_id);
CREATE INDEX idx_fk_ddbf59110b01eb63 ON public.inventory_holds USING btree (placed_by);
CREATE INDEX idx_fk_ddc45bf5397e8217 ON public.payment_reconciliations USING btree (journal_entry_id);
CREATE INDEX idx_payment_evidence_instruction ON public.payment_evidence USING btree (payment_instruction_id, status);
CREATE INDEX idx_fk_88815fd23f7e2e9d ON public.vessel_port_assessments USING btree (assessed_by);
CREATE INDEX idx_fk_95e08b27b57e1e4e ON public.voyages USING btree (shipping_agent_organization_id);
CREATE INDEX idx_fk_29f45ffdc27daaae ON public.port_loading_services USING btree (terminal_id);
CREATE INDEX idx_fk_c0cd41dfa8d958b1 ON public.ar_invoices USING btree (currency_id);
CREATE INDEX idx_fk_bb421326b97d04d2 ON public.ap_invoices USING btree (currency_id);
CREATE INDEX idx_fk_500d073a8b2bb7ce ON public.buyer_visibility_grants USING btree (granted_by);
CREATE INDEX idx_fk_c319feceacf20f7c ON public.payment_verifications USING btree (verified_currency_id);
CREATE INDEX idx_regulatory_rule_exceptions_project ON public.regulatory_rule_exceptions USING btree (project_id, status);
CREATE UNIQUE INDEX idx_inventory_movement_single_reversal ON public.inventory_movements USING btree (reversal_of_movement_id) WHERE (reversal_of_movement_id IS NOT NULL);
CREATE INDEX idx_payment_instruction_approvals_instruction ON public.payment_instruction_approvals USING btree (payment_instruction_id, decided_at DESC);
CREATE INDEX idx_fk_1b2091ee6fbc9d87 ON public.stage_transitions USING btree (triggered_by);
CREATE INDEX idx_project_export_documents_project_status ON public.project_export_documents USING btree (project_id, status);
CREATE INDEX idx_fk_25093d174323a116 ON public.inventory_lots USING btree (project_id);
CREATE INDEX idx_fk_1bab7f88992ab042 ON public.report_schedules USING btree (recipient_user_id);
CREATE INDEX idx_fk_6bb39a1ff2fd5da8 ON public.projects USING btree (contract_program_id);
CREATE INDEX idx_tracking_events_trip_time ON public.tracking_events USING btree (truck_trip_id, capture_timestamp DESC);
CREATE INDEX idx_payment_invoice_ar ON public.payment_invoice_allocations USING btree (ar_invoice_id);
CREATE INDEX idx_fk_92e3547b157ed8b4 ON public.port_depth_observations USING btree (reviewer_id);
CREATE INDEX idx_audit_events_actor_time ON public.audit_events USING btree (actor_user_id, occurred_at DESC);
CREATE INDEX idx_fk_53cb5a80ed38bbe4 ON public.facility_products USING btree (verified_by);
CREATE INDEX idx_port_operating_limits_effective ON public.port_operating_limits USING btree (port_id, terminal_id, effective_from, effective_to);
CREATE INDEX idx_fk_a85dff53bba2c691 ON public.product_specifications USING btree (created_by);
CREATE INDEX idx_fk_06bf0c9b3d50d5fd ON public.payment_reconciliations USING btree (reconciled_by);
CREATE INDEX idx_fk_74bb0f0276f3e10e ON public.matching_runs USING btree (buyer_id);
CREATE INDEX idx_port_equipment_terminal ON public.port_equipment USING btree (port_id, terminal_id, condition_status);
CREATE INDEX idx_buyers_organization ON public.buyers USING btree (organization_id);
CREATE INDEX idx_fk_c75319b962eb5489 ON public.regulatory_assessments USING btree (assessed_by);
CREATE INDEX idx_fk_2810998dd5a29707 ON public.port_terminals USING btree (operator_organization_id);
CREATE INDEX idx_fk_be4a7dd40ca07bb1 ON public.inventory_reconciliations USING btree (warehouse_id);
CREATE INDEX idx_fk_81867acf8a7d211d ON public.buyer_product_requirements USING btree (product_id);
CREATE INDEX idx_fk_93978625702e273c ON public.knowledge_documents USING btree (owner_user_id);
CREATE INDEX idx_fk_5abebc8f1c8436d5 ON public.inventory_reservations USING btree (created_by);
CREATE INDEX idx_fx_exposures_source ON public.fx_exposures USING btree (exposure_source_type, source_record_id);
CREATE INDEX idx_ai_action_requests_project_status ON public.ai_action_requests USING btree (project_id, status);
CREATE INDEX idx_fk_3d935401c0885ac3 ON public.production_batches USING btree (product_variant_id);
CREATE INDEX idx_fk_568422814ecc993e ON public.ai_source_citations USING btree (regulatory_source_id);
CREATE INDEX idx_fk_ca9b84047d6153bd ON public.product_hs_classifications USING btree (reviewer_id);
CREATE INDEX idx_fk_b2ad52dba38f5017 ON public.payment_instructions USING btree (payment_method_id);
CREATE INDEX idx_fk_df75125a1d5b207e ON public.settlement_checklist_items USING btree (completed_by);
CREATE INDEX idx_buyer_product_requirements_buyer ON public.buyer_product_requirements USING btree (buyer_id, status, effective_from DESC);
CREATE INDEX idx_fk_6930c247cff6a29b ON public.project_operating_profiles USING btree (primary_port_id);
CREATE INDEX idx_fk_99a43d4e03ad28b2 ON public.project_role_permissions USING btree (project_role_id, project_id);
CREATE INDEX idx_ai_source_citations_run ON public.ai_source_citations USING btree (ai_run_id);
CREATE INDEX idx_inventory_movements_reversal_ref ON public.inventory_movements USING btree (reversal_of_movement_id);
CREATE INDEX idx_fk_1c4fbb0e614fa431 ON public.regulatory_assessments USING btree (product_id);
CREATE INDEX idx_fk_391b16a67bce92cd ON public.warehouses USING btree (terminal_id);
CREATE INDEX idx_fk_d784c7afb88a7b11 ON public.cash_schedules USING btree (currency_id);
CREATE INDEX idx_fk_a5d83c4fa55de409 ON public.knowledge_documents USING btree (current_version_id);
CREATE INDEX idx_fk_8f816a780840d321 ON public.payment_instructions USING btree (approved_by);
CREATE INDEX idx_fk_77ac7da0ace53ac5 ON public.project_templates USING btree (contract_program_id);
CREATE UNIQUE INDEX pke_payment_instruction_cash_advance_active_unique ON public.payment_instructions USING btree (cash_advance_id) WHERE ((cash_advance_id IS NOT NULL) AND (instruction_status <> ALL (ARRAY['cancelled'::text, 'rejected'::text, 'void'::text])));
CREATE INDEX idx_fk_82941f4c073a4edb ON public.product_specifications USING btree (approved_by);
CREATE INDEX idx_project_export_documents_object_key ON public.project_export_documents USING btree (storage_bucket, object_key) WHERE (object_key IS NOT NULL);
CREATE INDEX idx_fk_b2ed845e277547eb ON public.projects USING btree (export_country_code);
CREATE INDEX idx_partner_org_country_status ON public.partner_organizations USING btree (country_code, verification_status);
CREATE INDEX idx_knowledge_ingestion_status ON public.knowledge_ingestion_runs USING btree (status, created_at);
CREATE INDEX idx_inventory_lots_product ON public.inventory_lots USING btree (product_id, quality_status, status);
CREATE INDEX idx_warehouses_port_terminal ON public.warehouses USING btree (port_id, terminal_id, is_active);
CREATE INDEX idx_fk_4741a7303a60714c ON public.project_change_requests USING btree (approved_by);
CREATE INDEX idx_fk_abb851d27044903e ON public.project_members USING btree (project_role_id, project_id);
CREATE INDEX idx_knowledge_chunks_version_page ON public.knowledge_chunks USING btree (document_version_id, page_number, chunk_index);
CREATE INDEX idx_fk_801b3a70309176e8 ON public.product_quality_samples USING btree (sampled_by);
CREATE UNIQUE INDEX idx_ports_unlocode_unique ON public.ports USING btree (unlocode) WHERE (unlocode IS NOT NULL);
CREATE INDEX idx_fk_9dffda380dc539b9 ON public.payment_invoice_allocations USING btree (currency_id);
CREATE INDEX idx_fk_1b06ca3a3d40abc8 ON public.matching_candidates USING btree (facility_id);
CREATE INDEX idx_fk_dbce16fa88cf8543 ON public.regulatory_rules USING btree (created_by);
CREATE INDEX idx_fk_fd611df1c35e5806 ON public.journal_entries USING btree (posted_by);
CREATE UNIQUE INDEX idx_inventory_movements_single_receipt ON public.inventory_movements USING btree (warehouse_receipt_id) WHERE (warehouse_receipt_id IS NOT NULL);
CREATE INDEX idx_payment_instructions_project_status ON public.payment_instructions USING btree (project_id, instruction_status);
CREATE INDEX idx_fk_c86b44cd0a012261 ON public.regulatory_rules USING btree (reviewed_by);
CREATE INDEX idx_fk_c726cb80250b1b1e ON public.regulatory_sources USING btree (reviewer_id);
CREATE INDEX idx_port_loading_services_port ON public.port_loading_services USING btree (port_id, terminal_id, status);
CREATE INDEX project_module_configuration_versions_project_idx ON public.project_module_configuration_versions USING btree (project_id, created_at DESC);
CREATE UNIQUE INDEX pke_payment_invoice_allocation_ar_unique ON public.payment_invoice_allocations USING btree (payment_instruction_id, ar_invoice_id) WHERE (ar_invoice_id IS NOT NULL);
CREATE INDEX idx_fk_fa98f0d8555203fc ON public.production_batches USING btree (project_id);
CREATE INDEX idx_fk_f4872f8c1d36feb9 ON public.buyer_product_requirements USING btree (mandatory_origin_country);
CREATE INDEX idx_fk_66f2fe215ef52ba9 ON public.project_members USING btree (role_id);
CREATE INDEX idx_fk_2e10e42affd967e1 ON public.regulatory_rule_exceptions USING btree (requested_by);
CREATE INDEX idx_fk_e8c3bf65445164de ON public.approval_events USING btree (approved_by);
CREATE INDEX idx_fk_c96379683501d8dc ON public.buyers USING btree (country_code);
CREATE INDEX idx_fk_8b4301c41861015c ON public.facility_capacity_records USING btree (verified_by);
CREATE INDEX idx_fk_3ca7630b3ae641af ON public.project_product_specifications USING btree (project_id);
CREATE INDEX idx_fk_9a6f54fc714b0164 ON public.vessel_nominations USING btree (shipment_id);
CREATE INDEX idx_fk_6eac3d9965eac9b9 ON public.payment_evidence USING btree (supersedes_evidence_id);
CREATE INDEX idx_matching_candidates_run_score ON public.matching_candidates USING btree (matching_run_id, fit_score DESC);
CREATE INDEX idx_fk_cb4ada0b63b17f1d ON public.vessel_certificates USING btree (verified_by);
CREATE INDEX idx_fk_526f4544b08254c4 ON public.role_permissions USING btree (permission_id);
CREATE INDEX idx_fk_0a2e299d421c64ca ON public.inventory_lots USING btree (pks_site_id);
CREATE INDEX idx_fk_644a893ff6693233 ON public.buyer_product_requirements USING btree (created_by);
CREATE INDEX idx_fk_c30a5c18d1880a5e ON public.vessels USING btree (owner_organization_id);
CREATE INDEX idx_fk_773e7ec3cb3aae69 ON public.warehouses USING btree (operator_organization_id);
CREATE INDEX idx_fk_a194e9b810b7f49f ON public.shipment_document_links USING btree (document_id);
CREATE INDEX idx_fk_b4d552586cd850b8 ON public.payment_invoice_allocations USING btree (created_by);
CREATE INDEX idx_quality_results_sample ON public.product_quality_results USING btree (sample_id, attribute_id);
CREATE INDEX idx_buyer_facilities_buyer ON public.buyer_facilities USING btree (buyer_id, is_active);
CREATE INDEX idx_fk_23ee9f0e550353a5 ON public.buyer_demand_forecasts USING btree (product_id);
CREATE INDEX idx_pks_sites_organization ON public.pks_sites USING btree (organization_id);
CREATE INDEX idx_fk_04db0f6469bef7ec ON public.vessel_nominations USING btree (vessel_id);
CREATE INDEX idx_fk_d99c14b43aec1875 ON public.project_module_configuration_versions USING btree (activated_by);
CREATE INDEX idx_shipment_events_timeline ON public.shipment_events USING btree (shipment_id, event_timestamp DESC);
CREATE INDEX idx_fk_76fbe646955eebd3 ON public.buyer_visibility_grants USING btree (revoked_by);
CREATE INDEX idx_audit_events_target ON public.audit_events USING btree (target_type, target_id, occurred_at DESC);
CREATE UNIQUE INDEX idx_currencies_single_functional ON public.currencies USING btree (is_functional) WHERE (is_functional = true);
CREATE INDEX idx_fk_d6c34a4aee3aaa6c ON public.buyer_product_requirements USING btree (destination_country);
CREATE INDEX idx_fk_2047181ba7dd704c ON public.project_roles USING btree (created_by);
CREATE UNIQUE INDEX idx_vessel_identifiers_current_unique ON public.vessel_identifiers USING btree (identifier_type, identifier_value) WHERE (valid_to IS NULL);
CREATE INDEX idx_ai_runs_user_created ON public.ai_runs USING btree (user_id, created_at DESC);
CREATE INDEX idx_shipment_allocations_created_by ON public.shipment_allocations USING btree (created_by);
CREATE INDEX idx_fk_cff15644bba91864 ON public.matching_runs USING btree (project_id);
CREATE INDEX idx_fk_39c6f8290f0514f2 ON public.knowledge_document_versions USING btree (reviewed_by);
CREATE INDEX idx_fk_7fccf73f2a86ccca ON public.project_workflows USING btree (workflow_template_id);
CREATE INDEX idx_fk_54b3d0776571d33c ON public.cash_advances USING btree (currency_id);
CREATE INDEX idx_journal_lines_account_entry ON public.journal_lines USING btree (account_id, journal_entry_id);
CREATE INDEX idx_fk_502ede950789faa3 ON public.inventory_lots USING btree (product_variant_id);
CREATE INDEX idx_fk_c4848d466379a34a ON public.ai_feedback USING btree (ai_run_id);
CREATE UNIQUE INDEX idx_vessels_mmsi_unique ON public.vessels USING btree (mmsi) WHERE (mmsi IS NOT NULL);
CREATE INDEX idx_fk_232abf503bc34eae ON public.shipment_document_links USING btree (created_by);
CREATE INDEX idx_product_hs_lookup ON public.product_hs_classifications USING btree (product_id, country_code, valid_from DESC);
CREATE INDEX idx_fk_58ce0d3e412165be ON public.ar_invoices USING btree (related_shipment_id);
CREATE INDEX idx_vessel_nominations_project_status ON public.vessel_nominations USING btree (project_id, nomination_status);
CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id, is_active);
CREATE INDEX idx_regulatory_sources_jurisdiction_status ON public.regulatory_sources USING btree (jurisdiction, status, effective_date DESC);
CREATE INDEX idx_fk_a75d342899088620 ON public.report_runs USING btree (project_id);
CREATE INDEX idx_fk_429547efcf138875 ON public.cost_obligations USING btree (created_by);
CREATE INDEX idx_regulatory_assessments_project_date ON public.regulatory_assessments USING btree (project_id, assessment_date DESC);
CREATE INDEX idx_fk_322a3c0dfb311c44 ON public.port_operating_limits USING btree (verified_by);
CREATE INDEX idx_fk_32ac12721d3a40e9 ON public.role_permissions USING btree (granted_by);
CREATE INDEX idx_fk_e0835095a5bce2f2 ON public.inventory_reservations USING btree (released_by);
CREATE INDEX idx_fk_aa673493df79cdc8 ON public.payment_verifications USING btree (evidence_id);
CREATE INDEX idx_shipment_document_links_project ON public.shipment_document_links USING btree (project_id, shipment_id);
CREATE INDEX idx_fk_a5404e19b9638b57 ON public.project_operating_profiles USING btree (updated_by);
CREATE INDEX idx_fk_a47879c1e8a185d7 ON public.payment_evidence USING btree (uploaded_by);
CREATE INDEX idx_fk_7996972684211695 ON public.rab USING btree (project_id);
CREATE INDEX idx_fk_d3db9e8fa6d0de14 ON public.payment_evidence USING btree (reviewed_by);
CREATE INDEX idx_fk_134cd9d982587ac4 ON public.payment_obligations USING btree (cost_obligation_id);
CREATE INDEX idx_vessel_port_calls_voyage ON public.vessel_port_calls USING btree (voyage_id, predicted_at);
CREATE INDEX idx_vendors_organization ON public.vendors USING btree (organization_id);
CREATE INDEX idx_service_vendors_organization ON public.service_vendors USING btree (organization_id);
CREATE INDEX idx_fk_79b53486b25b0549 ON public.user_notifications USING btree (created_by);
CREATE INDEX idx_fk_8e14a20f09c4e9d0 ON public.buyer_facilities USING btree (destination_port_id);
CREATE INDEX idx_fk_c7dc855f234678f2 ON public.ap_invoices USING btree (related_cost_obligation_id);
CREATE INDEX idx_fk_3f5dc35ee1731453 ON public.voyages USING btree (port_id);
CREATE INDEX idx_fk_1cb16a185dab37a6 ON public.payment_obligations USING btree (currency_id);
CREATE INDEX idx_fk_e59b919432d7326c ON public.fx_history USING btree (to_currency_id);
CREATE INDEX idx_fk_016f628f01ce189a ON public.regulatory_rule_versions USING btree (approved_by);
CREATE INDEX idx_fk_c348834a853c9dc6 ON public.project_export_documents USING btree (uploaded_by);
CREATE INDEX idx_fk_dbf55cdc79d820a0 ON public.project_export_documents USING btree (reviewed_by);
CREATE INDEX idx_fk_c1e8093c13be2ba2 ON public.regulatory_rule_exceptions USING btree (approved_by);
CREATE INDEX idx_fk_76eb0c39a396002a ON public.shipments USING btree (pks_site_id);
CREATE INDEX idx_fk_776a7ce74941c8f1 ON public.vessel_identifiers USING btree (vessel_id);
CREATE UNIQUE INDEX idx_journal_lines_entry_order ON public.journal_lines USING btree (journal_entry_id, line_order);
CREATE INDEX idx_payment_verifications_instruction ON public.payment_verifications USING btree (payment_instruction_id, verified_at DESC);
CREATE INDEX idx_buyer_visibility_grants_buyer_scope ON public.buyer_visibility_grants USING btree (buyer_id, project_id, scope, status, expires_at);
CREATE INDEX idx_fk_bf4fb89192312b74 ON public.port_equipment USING btree (berth_id);
CREATE INDEX idx_fk_1e3e3feb9e7269ca ON public.buyer_demand_forecasts USING btree (created_by);
CREATE INDEX idx_fk_8ab35585ef941f24 ON public.port_depth_observations USING btree (berth_id);
CREATE INDEX idx_facility_cert_facility_expiry ON public.facility_certifications USING btree (facility_id, valid_to);
CREATE INDEX idx_buyer_demand_forecast ON public.buyer_demand_forecasts USING btree (buyer_id, forecast_period, product_id);
CREATE INDEX idx_inventory_lots_batch ON public.inventory_lots USING btree (production_batch_id);
CREATE INDEX idx_fx_rates_pair_date ON public.fx_rates USING btree (from_currency_id, to_currency_id, rate_date DESC);
CREATE INDEX idx_fk_80052820cd611022 ON public.port_depth_observations USING btree (terminal_id);
CREATE INDEX idx_payment_instructions_obligation ON public.payment_instructions USING btree (payment_obligation_id);
CREATE INDEX idx_fk_c7e0fbd93ba5b0bf ON public.pks_port_routes USING btree (port_id);
CREATE INDEX idx_fk_d4b7008e8b49b5da ON public.vessel_port_assessments USING btree (port_id);
CREATE INDEX idx_vessel_port_assessments_project ON public.vessel_port_assessments USING btree (project_id, assessed_at DESC);
CREATE INDEX idx_inventory_reservations_lot_status ON public.inventory_reservations USING btree (lot_id, status);
CREATE INDEX idx_fk_2022f7c6f11cbc9a ON public.loading_operations USING btree (project_id);
CREATE INDEX idx_fk_81b453d1cc60221d ON public.payment_invoice_allocations USING btree (payment_instruction_id);
CREATE INDEX idx_fk_5b844c048430b55e ON public.fx_exposures USING btree (original_currency_id);
CREATE UNIQUE INDEX pke_regulatory_rule_single_effective_version ON public.regulatory_rule_versions USING btree (rule_id) WHERE (status = 'effective'::text);
CREATE INDEX idx_fk_14e990dd13fc2ccc ON public.cost_obligations USING btree (vendor_id);
CREATE INDEX idx_fk_e247d53cb8c8143f ON public.inventory_lots USING btree (owner_organization_id);
CREATE INDEX idx_fk_c26275df6fba6998 ON public.ai_runs USING btree (approved_by);
CREATE INDEX idx_production_batches_facility_date ON public.production_batches USING btree (facility_id, production_started_at DESC);
CREATE INDEX idx_fk_de969f2622ad8930 ON public.regulatory_assessments USING btree (reviewed_by);
CREATE INDEX idx_fk_576fef404b5881f8 ON public.project_financiers USING btree (currency_id);
CREATE INDEX idx_fk_991cf6c1a7b586da ON public.vessel_port_assessments USING btree (reviewed_by);
CREATE INDEX idx_country_doc_requirements_lookup ON public.country_export_document_requirements USING btree (country_code, product_id, status, effective_from, effective_to);
CREATE INDEX idx_fk_a2e60f64321aad28 ON public.product_hs_classifications USING btree (country_code);
CREATE INDEX idx_fk_b6380b1e3448b57e ON public.buyer_visibility_grants USING btree (shipment_id);
CREATE INDEX idx_fk_280c4b6f1bb77915 ON public.port_loading_services USING btree (berth_id);
CREATE INDEX idx_fk_9fd7d398e5f650c0 ON public.partner_organizations USING btree (created_by);
CREATE INDEX idx_fk_c5aeaa6fc1b26c6a ON public.voyages USING btree (project_id);
CREATE INDEX idx_fk_1224a4ac09f74a6a ON public.inventory_reconciliations USING btree (lot_id);
CREATE INDEX idx_fk_49bed5d8f3c23a7b ON public.buyer_visibility_grants USING btree (project_id);
CREATE INDEX idx_fk_69c7d7b3a99f4ee7 ON public.warehouse_reservations USING btree (zone_id);
CREATE INDEX idx_fk_322738e42db08970 ON public.inventory_holds USING btree (project_id);
CREATE INDEX idx_outbox_project_time ON public.outbox_events USING btree (project_id, created_at DESC);
CREATE INDEX idx_fk_1df8079618bd271d ON public.loading_tickets USING btree (equipment_id);
CREATE INDEX idx_fk_9e622b475eb5850a ON public.port_depth_observations USING btree (anchorage_id);
CREATE INDEX idx_fk_70a34f95c0c52115 ON public.vessel_port_calls USING btree (terminal_id);
CREATE INDEX idx_fk_cd07c1256b7b22bd ON public.tracking_evidence USING btree (supersedes_document_id);
CREATE INDEX idx_fk_b2dff1ae99799e6f ON public.project_supplier_participation USING btree (created_by);
CREATE INDEX idx_fk_8c2beec35c1ba9f8 ON public.inventory_reconciliations USING btree (reviewed_by);
CREATE INDEX idx_fk_b38d3981aee577c4 ON public.regulatory_rule_documents USING btree (document_type_id);

-- TABLE GRANTS ADDED FOR app_runtime_secure
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.project_module_readiness TO app_runtime_secure;
GRANT INSERT, SELECT ON TABLE public.project_module_configuration_versions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.fiscal_periods TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.outbox_events TO app_runtime_secure;
GRANT INSERT, SELECT, UPDATE ON TABLE public.idempotency_keys TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.partner_organizations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.facility_contacts TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.facility_capacity_records TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.facility_products TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.facility_operating_periods TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.product_attributes TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.shipment_events TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.product_hs_classifications TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.buyer_facilities TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.buyer_product_requirements TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.buyer_requirement_attributes TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.buyer_demand_forecasts TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.production_batches TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_rules TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.loading_tickets TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_rule_versions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.loading_segments TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.shipment_document_links TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.inventory_reservations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.inventory_holds TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.inventory_reconciliations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.matching_candidates TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.payment_instructions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.matching_runs TO app_runtime_secure;
GRANT INSERT, SELECT ON TABLE public.payment_instruction_approvals TO app_runtime_secure;
GRANT INSERT, SELECT ON TABLE public.payment_verifications TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.payment_reconciliations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.payment_evidence TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_terminals TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_berths TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_channels TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_anchorages TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_depth_observations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_loading_services TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_equipment TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_operating_limits TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.warehouse_zones TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.warehouse_bins TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.warehouse_reservations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.warehouse_equipment TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_identifiers TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_certificates TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_name_history TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_nominations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_port_assessments TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_tracking_positions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.vessel_port_calls TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_rule_documents TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_assessment_results TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_rule_exceptions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_assessments TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.regulatory_rule_conditions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.knowledge_documents TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.knowledge_document_versions TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.knowledge_chunks TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.knowledge_ingestion_runs TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.buyer_visibility_grants TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.facility_certifications TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.product_variants TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.product_quality_results TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.ai_action_requests TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.port_tide_observations TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.product_quality_samples TO app_runtime_secure;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.ai_source_citations TO app_runtime_secure;
GRANT INSERT, SELECT ON TABLE public.payment_invoice_allocations TO app_runtime_secure;
GRANT INSERT, SELECT ON TABLE public.audit_events TO app_runtime_secure;
GRANT INSERT, SELECT, UPDATE ON TABLE public.ai_runs TO app_runtime_secure;
GRANT INSERT, SELECT ON TABLE public.ai_feedback TO app_runtime_secure;

-- NEW TRIGGERS (functions above)
CREATE TRIGGER trg_journal_entry_guard BEFORE DELETE OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION pke_guard_journal_entry();
CREATE TRIGGER trg_journal_line_parent_lock BEFORE INSERT OR DELETE OR UPDATE ON journal_lines FOR EACH ROW EXECUTE FUNCTION pke_lock_journal_line_parent();
CREATE TRIGGER trg_audit_events_immutable BEFORE DELETE OR UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION pke_audit_events_immutable();
CREATE TRIGGER trg_inventory_movement_immutable BEFORE INSERT OR DELETE OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION pke_inventory_movement_immutable();
CREATE TRIGGER trg_payment_verification_guard BEFORE INSERT ON payment_verifications FOR EACH ROW EXECUTE FUNCTION pke_payment_verification_guard();
CREATE TRIGGER trg_payment_reconciliation_guard BEFORE INSERT OR UPDATE ON payment_reconciliations FOR EACH ROW EXECUTE FUNCTION pke_payment_reconciliation_guard();
CREATE TRIGGER trg_inventory_lot_counter_guard BEFORE UPDATE OF reserved_quantity, held_quantity ON inventory_lots FOR EACH ROW EXECUTE FUNCTION pke_inventory_lot_counter_guard();
CREATE TRIGGER trg_inventory_reservation_guard BEFORE INSERT OR DELETE OR UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION pke_inventory_reservation_guard();
CREATE TRIGGER trg_inventory_reservation_counter AFTER INSERT OR DELETE OR UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION pke_inventory_reservation_counter();
CREATE TRIGGER trg_inventory_hold_guard BEFORE INSERT OR DELETE OR UPDATE ON inventory_holds FOR EACH ROW EXECUTE FUNCTION pke_inventory_hold_guard();
CREATE TRIGGER trg_inventory_hold_counter AFTER INSERT OR DELETE OR UPDATE ON inventory_holds FOR EACH ROW EXECUTE FUNCTION pke_inventory_hold_counter();
CREATE TRIGGER trg_shipment_allocation_guard BEFORE INSERT OR UPDATE ON shipment_allocations FOR EACH ROW EXECUTE FUNCTION pke_shipment_allocation_guard();
CREATE TRIGGER trg_fx_exposure_calculate BEFORE INSERT OR UPDATE OF original_currency_id, original_amount, fx_rate, functional_currency_id ON fx_exposures FOR EACH ROW EXECUTE FUNCTION pke_fx_exposure_calculate();
CREATE TRIGGER trg_journal_entry_insert_guard BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION pke_journal_entry_insert_guard();
CREATE TRIGGER trg_fiscal_period_guard BEFORE INSERT OR UPDATE ON fiscal_periods FOR EACH ROW EXECUTE FUNCTION pke_fiscal_period_guard();
CREATE TRIGGER trg_journal_post_audit AFTER UPDATE OF status ON journal_entries FOR EACH ROW EXECUTE FUNCTION pke_journal_post_audit();
CREATE TRIGGER trg_payment_instruction_insert_guard BEFORE INSERT ON payment_instructions FOR EACH ROW EXECUTE FUNCTION pke_payment_instruction_insert_guard();
CREATE TRIGGER trg_payment_instruction_guard BEFORE UPDATE ON payment_instructions FOR EACH ROW EXECUTE FUNCTION pke_payment_instruction_guard();
CREATE TRIGGER trg_payment_approval_guard BEFORE INSERT ON payment_instruction_approvals FOR EACH ROW EXECUTE FUNCTION pke_payment_approval_guard();
CREATE TRIGGER trg_payment_approvals_append_only BEFORE DELETE OR UPDATE ON payment_instruction_approvals FOR EACH ROW EXECUTE FUNCTION pke_payment_append_only();
CREATE TRIGGER trg_payment_evidence_guard BEFORE INSERT OR DELETE OR UPDATE ON payment_evidence FOR EACH ROW EXECUTE FUNCTION pke_payment_evidence_guard();
CREATE TRIGGER trg_payment_verifications_append_only BEFORE DELETE OR UPDATE ON payment_verifications FOR EACH ROW EXECUTE FUNCTION pke_payment_append_only();
CREATE TRIGGER trg_payment_invoice_allocation_guard BEFORE INSERT ON payment_invoice_allocations FOR EACH ROW EXECUTE FUNCTION pke_payment_invoice_allocation_guard();
CREATE TRIGGER trg_payment_reconciliation_apply AFTER UPDATE OF reconciliation_status ON payment_reconciliations FOR EACH ROW EXECUTE FUNCTION pke_payment_reconciliation_apply();
CREATE TRIGGER trg_payment_instruction_release_allocations AFTER UPDATE OF instruction_status ON payment_instructions FOR EACH ROW EXECUTE FUNCTION pke_payment_instruction_release_allocations();
CREATE TRIGGER trg_pke_regulatory_source_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_sources FOR EACH ROW EXECUTE FUNCTION pke_regulatory_source_guard();
CREATE TRIGGER trg_pke_country_document_requirement_guard BEFORE INSERT OR DELETE OR UPDATE ON country_export_document_requirements FOR EACH ROW EXECUTE FUNCTION pke_country_document_requirement_guard();
CREATE TRIGGER trg_pke_project_document_requirement_guard BEFORE INSERT OR DELETE OR UPDATE ON project_export_document_requirements FOR EACH ROW EXECUTE FUNCTION pke_project_document_requirement_guard();
CREATE TRIGGER trg_pke_project_export_document_guard BEFORE INSERT OR DELETE OR UPDATE ON project_export_documents FOR EACH ROW EXECUTE FUNCTION pke_project_export_document_guard();
CREATE TRIGGER trg_pke_tracking_event_guard BEFORE INSERT OR DELETE OR UPDATE ON tracking_events FOR EACH ROW EXECUTE FUNCTION pke_tracking_event_guard();
CREATE TRIGGER trg_pke_tracking_evidence_guard BEFORE INSERT OR DELETE OR UPDATE ON tracking_evidence FOR EACH ROW EXECUTE FUNCTION pke_tracking_evidence_guard();
CREATE TRIGGER trg_pke_inventory_lot_balance_guard BEFORE INSERT OR UPDATE OF quantity, location ON inventory_lots FOR EACH ROW EXECUTE FUNCTION pke_inventory_lot_balance_guard();
CREATE TRIGGER trg_pke_inventory_movement_guard BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION pke_inventory_movement_guard();
CREATE TRIGGER trg_pke_inventory_movement_apply AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION pke_inventory_movement_apply();
CREATE TRIGGER trg_pke_warehouse_receipt_guard BEFORE INSERT OR DELETE OR UPDATE ON warehouse_receipts FOR EACH ROW EXECUTE FUNCTION pke_warehouse_receipt_guard();
CREATE TRIGGER trg_pke_warehouse_receipt_post_movement AFTER UPDATE OF status ON warehouse_receipts FOR EACH ROW EXECUTE FUNCTION pke_warehouse_receipt_post_movement();
CREATE TRIGGER trg_pke_payment_instruction_audit AFTER UPDATE OF instruction_status ON payment_instructions FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_payment_approval_audit AFTER INSERT ON payment_instruction_approvals FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_payment_evidence_audit AFTER INSERT OR UPDATE OF status ON payment_evidence FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_payment_verification_audit AFTER INSERT ON payment_verifications FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_payment_reconciliation_audit AFTER INSERT OR UPDATE OF reconciliation_status ON payment_reconciliations FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_payment_obligation_audit AFTER UPDATE OF approval_status, payment_status, amount_paid ON payment_obligations FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_ap_invoice_audit AFTER UPDATE OF verification_status, paid_amount, outstanding_amount ON ap_invoices FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_ar_invoice_audit AFTER UPDATE OF payment_status, settlement_status, paid_amount, outstanding_amount ON ar_invoices FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_pke_regulatory_assessment_guard BEFORE INSERT OR UPDATE ON regulatory_assessments FOR EACH ROW EXECUTE FUNCTION pke_regulatory_assessment_guard();
CREATE TRIGGER trg_pke_regulatory_assessment_result_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_assessment_results FOR EACH ROW EXECUTE FUNCTION pke_regulatory_assessment_result_guard();
CREATE TRIGGER trg_pke_regulatory_assessment_audit AFTER INSERT OR UPDATE ON regulatory_assessments FOR EACH ROW EXECUTE FUNCTION pke_regulatory_assessment_audit();
CREATE TRIGGER trg_pke_regulatory_assessment_result_audit AFTER INSERT OR UPDATE ON regulatory_assessment_results FOR EACH ROW EXECUTE FUNCTION pke_regulatory_assessment_audit();
CREATE TRIGGER trg_pke_regulatory_rule_version_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_rule_versions FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_version_guard();
CREATE TRIGGER trg_pke_regulatory_rule_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_rules FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_guard();
CREATE TRIGGER trg_pke_regulatory_rule_child_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_rule_conditions FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_child_guard();
CREATE TRIGGER trg_pke_regulatory_rule_document_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_rule_documents FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_child_guard();
CREATE TRIGGER trg_pke_regulatory_exception_guard BEFORE INSERT OR DELETE OR UPDATE ON regulatory_rule_exceptions FOR EACH ROW EXECUTE FUNCTION pke_regulatory_exception_guard();
CREATE TRIGGER trg_pke_regulatory_rule_audit AFTER INSERT OR UPDATE ON regulatory_rules FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_audit();
CREATE TRIGGER trg_pke_regulatory_rule_version_audit AFTER INSERT OR UPDATE ON regulatory_rule_versions FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_audit();
CREATE TRIGGER trg_pke_regulatory_exception_audit AFTER INSERT OR UPDATE ON regulatory_rule_exceptions FOR EACH ROW EXECUTE FUNCTION pke_regulatory_rule_audit();
CREATE TRIGGER trg_pke_payment_invoice_allocation_mutation_guard BEFORE DELETE OR UPDATE ON payment_invoice_allocations FOR EACH ROW EXECUTE FUNCTION pke_payment_invoice_allocation_mutation_guard();
CREATE TRIGGER trg_pke_inventory_hold_delete_guard BEFORE DELETE ON inventory_holds FOR EACH ROW EXECUTE FUNCTION pke_inventory_history_delete_guard();
CREATE TRIGGER trg_pke_inventory_reservation_delete_guard BEFORE DELETE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION pke_inventory_history_delete_guard();
CREATE TRIGGER trg_pke_shipment_allocation_delete_guard BEFORE DELETE ON shipment_allocations FOR EACH ROW EXECUTE FUNCTION pke_inventory_history_delete_guard();
CREATE TRIGGER trg_pke_inventory_hold_state_guard BEFORE INSERT OR UPDATE ON inventory_holds FOR EACH ROW EXECUTE FUNCTION pke_inventory_hold_state_guard();
CREATE TRIGGER trg_zz_pke_shipment_allocation_state_guard BEFORE INSERT OR UPDATE ON shipment_allocations FOR EACH ROW EXECUTE FUNCTION pke_shipment_allocation_state_guard();
CREATE TRIGGER trg_zz_pke_shipment_allocation_post_inventory AFTER UPDATE OF status, loaded_quantity ON shipment_allocations FOR EACH ROW EXECUTE FUNCTION pke_shipment_allocation_post_inventory();
CREATE TRIGGER trg_pke_inventory_hold_audit AFTER INSERT OR UPDATE ON inventory_holds FOR EACH ROW EXECUTE FUNCTION pke_inventory_state_audit();
CREATE TRIGGER trg_pke_inventory_reservation_audit AFTER INSERT OR UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION pke_inventory_state_audit();
CREATE TRIGGER trg_pke_shipment_allocation_audit AFTER INSERT OR UPDATE ON shipment_allocations FOR EACH ROW EXECUTE FUNCTION pke_inventory_state_audit();
CREATE TRIGGER trg_zz_pke_regulatory_assessment_result_recount AFTER INSERT OR UPDATE ON regulatory_assessment_results FOR EACH ROW EXECUTE FUNCTION pke_regulatory_assessment_result_recount();
CREATE TRIGGER trg_pke_ap_invoice_financial_guard BEFORE INSERT OR DELETE OR UPDATE ON ap_invoices FOR EACH ROW EXECUTE FUNCTION pke_invoice_financial_guard();
CREATE TRIGGER trg_pke_ar_invoice_financial_guard BEFORE INSERT OR DELETE OR UPDATE ON ar_invoices FOR EACH ROW EXECUTE FUNCTION pke_invoice_financial_guard();
CREATE TRIGGER trg_pke_payment_obligation_guard BEFORE INSERT OR DELETE OR UPDATE ON payment_obligations FOR EACH ROW EXECUTE FUNCTION pke_payment_obligation_guard();
CREATE TRIGGER trg_pke_cash_advance_guard BEFORE INSERT OR DELETE OR UPDATE ON cash_advances FOR EACH ROW EXECUTE FUNCTION pke_cash_advance_guard();
CREATE TRIGGER trg_pke_cash_advance_audit AFTER UPDATE OF approval_status, disbursement_status, expense_submission_status, settled_status, remaining_balance, refund_amount ON cash_advances FOR EACH ROW EXECUTE FUNCTION pke_financial_audit_event();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON payment_obligations FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON ap_invoices FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON ar_invoices FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON cash_advances FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON payment_invoice_allocations FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON inventory_lots FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();
CREATE TRIGGER trg_zzzz_pke_block_direct_ledger_mutation BEFORE UPDATE ON regulatory_assessments FOR EACH ROW EXECUTE FUNCTION pke_block_direct_ledger_mutation();

-- EXISTING-TABLE COLUMN ADDITIONS
ALTER TABLE public.project_operating_profiles ADD COLUMN "configuration_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE public.pks_sites ADD COLUMN "facility_type" text DEFAULT 'other'::text NOT NULL;
ALTER TABLE public.pks_sites ADD COLUMN "operating_status" text DEFAULT 'planned'::text NOT NULL;
ALTER TABLE public.pks_sites ADD COLUMN "verification_status" text DEFAULT 'unverified'::text NOT NULL;
ALTER TABLE public.pks_sites ADD COLUMN "access_constraints" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.pks_sites ADD COLUMN "source_type" text DEFAULT 'manual'::text NOT NULL;
ALTER TABLE public.product_catalog ADD COLUMN "synonyms" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.product_catalog ADD COLUMN "classification_status" text DEFAULT 'unverified'::text NOT NULL;
ALTER TABLE public.inventory_lots ADD COLUMN "quality_status" text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.inventory_lots ADD COLUMN "held_quantity" numeric(20,6) DEFAULT 0 NOT NULL;
ALTER TABLE public.inventory_lots ADD COLUMN "reserved_quantity" numeric(20,6) DEFAULT 0 NOT NULL;
ALTER TABLE public.payment_obligations ADD COLUMN "amount_paid" numeric(20,4) DEFAULT 0 NOT NULL;
ALTER TABLE public.payment_obligations ADD COLUMN "payment_instruction_required" boolean DEFAULT true NOT NULL;
ALTER TABLE public.ar_invoices ADD COLUMN "paid_amount" numeric(20,4) DEFAULT 0 NOT NULL;
ALTER TABLE public.ar_invoices ADD COLUMN "payment_status" text DEFAULT 'open'::text NOT NULL;
ALTER TABLE public.project_export_documents ADD COLUMN "storage_bucket" text DEFAULT 'pke-private-documents'::text NOT NULL;
ALTER TABLE public.project_export_documents ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL;
ALTER TABLE public.fx_exposures ADD COLUMN "exposure_direction" text DEFAULT 'unknown'::text NOT NULL;
ALTER TABLE public.fx_exposures ADD COLUMN "valuation_type" text DEFAULT 'baseline'::text NOT NULL;
ALTER TABLE public.ports ADD COLUMN "verification_status" text DEFAULT 'unverified'::text NOT NULL;
ALTER TABLE public.warehouses ADD COLUMN "storage_mode" text DEFAULT 'mixed'::text NOT NULL;
ALTER TABLE public.warehouses ADD COLUMN "verification_status" text DEFAULT 'unverified'::text NOT NULL;
ALTER TABLE public.vessels ADD COLUMN "cargo_capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.vessels ADD COLUMN "verification_status" text DEFAULT 'unverified'::text NOT NULL;
ALTER TABLE public.regulatory_sources ADD COLUMN "access_rights" text DEFAULT 'unknown'::text NOT NULL;
ALTER TABLE public.regulatory_sources ADD COLUMN "source_type" text DEFAULT 'regulation'::text NOT NULL;
ALTER TABLE public.country_export_document_requirements ADD COLUMN "condition_schema" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.country_export_document_requirements ADD COLUMN "verification_status" text DEFAULT 'pending'::text NOT NULL;
ALTER TABLE public.country_export_document_requirements ADD COLUMN "version_no" integer DEFAULT 1 NOT NULL;
ALTER TABLE public.regulatory_sources ADD COLUMN "search_vector" tsvector DEFAULT to_tsvector('simple'::regconfig, ((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(issuing_authority, ''::text)) || ' '::text) || COALESCE(regulation_number, ''::text)) || ' '::text) || COALESCE(article_annex_section, ''::text)));
ALTER TABLE public.shipment_allocations ADD COLUMN "status" text DEFAULT 'draft'::text NOT NULL;
ALTER TABLE public.shipment_allocations ADD COLUMN "loaded_quantity" numeric(20,6) DEFAULT 0 NOT NULL;
ALTER TABLE public.shipment_allocations ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.tracking_evidence ADD COLUMN "uploaded_by" uuid DEFAULT pke_current_user_id() NOT NULL;
ALTER TABLE public.tracking_evidence ADD COLUMN "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public.tracking_evidence ADD COLUMN "storage_bucket" text DEFAULT 'pke-private-documents'::text NOT NULL;
ALTER TABLE public.ports ADD COLUMN "operator_name" text;
ALTER TABLE public.project_export_documents ADD COLUMN "upload_verified_at" timestamp with time zone;
ALTER TABLE public.shipments ADD COLUMN "shipment_code" text;
ALTER TABLE public.warehouses ADD COLUMN "storage_capacity_mt" numeric(20,4);
ALTER TABLE public.vessels ADD COLUMN "manager_organization_id" uuid;
ALTER TABLE public.voyages ADD COLUMN "origin_port_id" uuid;
ALTER TABLE public.voyages ADD COLUMN "actual_arrival_at" timestamp with time zone;
ALTER TABLE public.warehouses ADD COLUMN "terminal_id" uuid;
ALTER TABLE public.product_specifications ADD COLUMN "approved_at" timestamp with time zone;
ALTER TABLE public.shipments ADD COLUMN "contract_reference" text;
ALTER TABLE public.shipment_allocations ADD COLUMN "reversal_reason" text;
ALTER TABLE public.warehouses ADD COLUMN "usable_volume_m3" numeric(16,3);
ALTER TABLE public.buyers ADD COLUMN "organization_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "air_draft_m" numeric(12,3);
ALTER TABLE public.vessels ADD COLUMN "source_reference" text;
ALTER TABLE public.fx_exposures ADD COLUMN "counterparty_id" uuid;
ALTER TABLE public.ar_invoices ADD COLUMN "outstanding_amount" numeric(20,4) NOT NULL;
ALTER TABLE public.vessels ADD COLUMN "summer_draft_m" numeric(12,3);
ALTER TABLE public.tracking_events ADD COLUMN "idempotency_key" text NOT NULL;
ALTER TABLE public.regulatory_sources ADD COLUMN "publication_reference" text;
ALTER TABLE public.project_export_documents ADD COLUMN "file_size_bytes" bigint;
ALTER TABLE public.fx_exposures ADD COLUMN "source_record_id" uuid;
ALTER TABLE public.ports ADD COLUMN "national_code" text;
ALTER TABLE public.vessels ADD COLUMN "depth_m" numeric(12,3);
ALTER TABLE public.vessels ADD COLUMN "operator_organization_id" uuid;
ALTER TABLE public.product_catalog ADD COLUMN "physical_form" text;
ALTER TABLE public.vessels ADD COLUMN "owner_organization_id" uuid;
ALTER TABLE public.journal_entries ADD COLUMN "reversal_reason" text;
ALTER TABLE public.pks_sites ADD COLUMN "location_accuracy_m" numeric(12,3);
ALTER TABLE public.inventory_lots ADD COLUMN "product_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "dwt_mt" numeric(20,3);
ALTER TABLE public.inventory_movements ADD COLUMN "evidence_object_key" text;
ALTER TABLE public.vessels ADD COLUMN "loa_m" numeric(12,3);
ALTER TABLE public.pks_sites ADD COLUMN "verified_by" uuid;
ALTER TABLE public.pks_sites ADD COLUMN "organization_id" uuid;
ALTER TABLE public.regulatory_sources ADD COLUMN "language" text;
ALTER TABLE public.product_catalog ADD COLUMN "canonical_name" text;
ALTER TABLE public.shipments ADD COLUMN "planned_arrival_at" timestamp with time zone;
ALTER TABLE public.inventory_movements ADD COLUMN "idempotency_key" text NOT NULL;
ALTER TABLE public.vessels ADD COLUMN "flag_code" character(2);
ALTER TABLE public.fx_exposures ADD COLUMN "functional_currency_id" uuid;
ALTER TABLE public.voyages ADD COLUMN "planned_arrival_at" timestamp with time zone;
ALTER TABLE public.vessels ADD COLUMN "classification_society" text;
ALTER TABLE public.fx_exposures ADD COLUMN "maturity_date" date;
ALTER TABLE public.shipments ADD COLUMN "planned_departure_at" timestamp with time zone;
ALTER TABLE public.warehouses ADD COLUMN "latitude" numeric(9,6);
ALTER TABLE public.regulatory_sources ADD COLUMN "version_label" text;
ALTER TABLE public.shipment_allocations ADD COLUMN "created_by" uuid NOT NULL;
ALTER TABLE public.voyages ADD COLUMN "actual_departure_at" timestamp with time zone;
ALTER TABLE public.warehouses ADD COLUMN "verified_at" timestamp with time zone;
ALTER TABLE public.shipments ADD COLUMN "destination_port_id" uuid;
ALTER TABLE public.product_catalog ADD COLUMN "process_route" text;
ALTER TABLE public.warehouses ADD COLUMN "longitude" numeric(10,6);
ALTER TABLE public.shipment_allocations ADD COLUMN "idempotency_key" text NOT NULL;
ALTER TABLE public.voyages ADD COLUMN "planned_departure_at" timestamp with time zone;
ALTER TABLE public.fx_exposures ADD COLUMN "exposure_source_type" text;
ALTER TABLE public.project_export_documents ADD COLUMN "document_type_code" text;
ALTER TABLE public.product_specifications ADD COLUMN "measurement_basis" text;
ALTER TABLE public.inventory_movements ADD COLUMN "movement_group_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "max_draft_m" numeric(12,3);
ALTER TABLE public.shipment_allocations ADD COLUMN "project_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "year_built" integer;
ALTER TABLE public.pks_sites ADD COLUMN "source_reference" text;
ALTER TABLE public.ports ADD COLUMN "source_reference" text;
ALTER TABLE public.vessels ADD COLUMN "net_tonnage" numeric(20,3);
ALTER TABLE public.tracking_evidence ADD COLUMN "upload_verified_at" timestamp with time zone NOT NULL;
ALTER TABLE public.ports ADD COLUMN "verified_at" timestamp with time zone;
ALTER TABLE public.vessels ADD COLUMN "hold_capacity_m3" numeric(20,3);
ALTER TABLE public.inventory_lots ADD COLUMN "packaging_mode" text;
ALTER TABLE public.project_export_documents ADD COLUMN "uploaded_content_type" text;
ALTER TABLE public.vendors ADD COLUMN "organization_id" uuid;
ALTER TABLE public.warehouses ADD COLUMN "port_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "vessel_type" text;
ALTER TABLE public.vessels ADD COLUMN "beam_m" numeric(12,3);
ALTER TABLE public.shipment_allocations ADD COLUMN "reservation_id" uuid;
ALTER TABLE public.voyages ADD COLUMN "voyage_code" text;
ALTER TABLE public.service_vendors ADD COLUMN "organization_id" uuid;
ALTER TABLE public.pks_sites ADD COLUMN "verified_at" timestamp with time zone;
ALTER TABLE public.inventory_lots ADD COLUMN "production_batch_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "gross_tonnage" numeric(20,3);
ALTER TABLE public.warehouse_receipts ADD COLUMN "reviewed_by" uuid;
ALTER TABLE public.inventory_lots ADD COLUMN "product_variant_id" uuid;
ALTER TABLE public.product_specifications ADD COLUMN "approved_by" uuid;
ALTER TABLE public.warehouses ADD COLUMN "floor_area_m2" numeric(16,3);
ALTER TABLE public.voyages ADD COLUMN "shipping_agent_organization_id" uuid;
ALTER TABLE public.inventory_movements ADD COLUMN "reversal_of_movement_id" uuid;
ALTER TABLE public.product_catalog ADD COLUMN "product_family" text;
ALTER TABLE public.shipments ADD COLUMN "unit_code" text;
ALTER TABLE public.ports ADD COLUMN "unlocode" text;
ALTER TABLE public.fx_exposures ADD COLUMN "counterparty_type" text;
ALTER TABLE public.project_export_documents ADD COLUMN "retention_until" date;
ALTER TABLE public.voyages ADD COLUMN "destination_port_id" uuid;
ALTER TABLE public.regulatory_sources ADD COLUMN "source_checksum_sha256" text;
ALTER TABLE public.warehouses ADD COLUMN "operator_organization_id" uuid;
ALTER TABLE public.journal_entries ADD COLUMN "reversal_of_journal_entry_id" uuid;
ALTER TABLE public.vessels ADD COLUMN "mmsi" text;
ALTER TABLE public.vessels ADD COLUMN "verified_at" timestamp with time zone;
ALTER TABLE public.inventory_lots ADD COLUMN "owner_organization_id" uuid;
ALTER TABLE public.ports ADD COLUMN "authority_name" text;
ALTER TABLE public.warehouse_receipts ADD COLUMN "reviewed_at" timestamp with time zone;
ALTER TABLE public.product_specifications ADD COLUMN "supersedes_specification_id" uuid;

-- CHANGED CONSTRAINTS
ALTER TABLE buyers VALIDATE CONSTRAINT "buyers_country_code_fkey";
ALTER TABLE pks_sites VALIDATE CONSTRAINT "pks_sites_country_code_fkey";
ALTER TABLE ports VALIDATE CONSTRAINT "ports_country_code_fkey";
ALTER TABLE projects VALIDATE CONSTRAINT "projects_export_country_code_fkey";
ALTER TABLE project_members VALIDATE CONSTRAINT "project_members_project_role_same_project_fkey";
ALTER TABLE tracking_events DROP CONSTRAINT "tracking_events_event_type_check";
ALTER TABLE tracking_events ADD CONSTRAINT "tracking_events_event_type_check" CHECK ((event_type = ANY (ARRAY['departure'::text, 'checkpoint'::text, 'arrival'::text, 'weighbridge'::text, 'receipt'::text, 'exception'::text])));
ALTER TABLE warehouse_receipts DROP CONSTRAINT "warehouse_receipts_status_check";
ALTER TABLE warehouse_receipts ADD CONSTRAINT "warehouse_receipts_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'partial'::text, 'rejected'::text])));

-- RUNTIME TABLE PRIVILEGES REVOKED
REVOKE INSERT ON TABLE public.migration_history FROM app_runtime_secure;
REVOKE UPDATE ON TABLE public.migration_history FROM app_runtime_secure;
REVOKE DELETE ON TABLE public.migration_history FROM app_runtime_secure;

-- REVIEW NOTES
-- Changed columns: 3; removed columns: 0.
-- Removed policies: 0; removed indexes: 0.
-- Changed/removed triggers: 0/0.
-- Routine grants added/removed: 8/0.
-- This interval includes effects from 029-035 and cannot safely be split into authentic individual migration files without further evidence.


-- RUNTIME FUNCTION EXECUTE GRANTS ADDED
GRANT EXECUTE ON FUNCTION public.pke_has_ai_run_permission(uuid,text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_has_any_project_permission(text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_has_facility_permission(uuid,text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_has_partner_organization_permission(uuid,text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_has_payment_instruction_permission(uuid,text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_has_port_permission(uuid,text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_has_warehouse_permission(uuid,text) TO app_runtime_secure;


-- NEW VIEW(S) SINCE BASELINE
CREATE OR REPLACE VIEW public.project_module_readiness AS
 WITH module_rows AS (
  SELECT p.id AS project_id, kv.module_name, kv.enabled_text = 'true'::text AS enabled
  FROM public.projects p
  LEFT JOIN LATERAL jsonb_each_text(COALESCE((SELECT pop.configuration FROM public.project_operating_profiles pop WHERE pop.project_id=p.id),'{}'::jsonb)) kv(module_name,enabled_text) ON true
  WHERE kv.module_name IS NOT NULL
 ), enabled_modules AS (
  SELECT project_id,module_name FROM module_rows WHERE enabled=true
  UNION
  SELECT pop.project_id,'logistics_mode'::text FROM public.project_operating_profiles pop WHERE pop.logistics_mode <> 'unspecified'::text
 ), dependencies AS (
  SELECT d.module_name,d.depends_on FROM (VALUES
   ('procurement'::text,'pks'::text),('inventory'::text,'pks'::text),('trucking'::text,'logistics_mode'::text),
   ('warehouse'::text,'inventory'::text),('port_operations'::text,'logistics_mode'::text),('loading'::text,'warehouse'::text),
   ('vessel'::text,'port_operations'::text),('voyage'::text,'vessel'::text),('shipment'::text,'loading'::text),
   ('tracking'::text,'shipment'::text),('finance'::text,'procurement'::text),('accounting'::text,'finance'::text),
   ('fx'::text,'finance'::text),('financing'::text,'finance'::text),('reporting'::text,'documents'::text),
   ('visual_reporting'::text,'reporting'::text),('workflow'::text,'documents'::text),('approvals'::text,'workflow'::text)
  ) d(module_name,depends_on)
 )
 SELECT m.project_id,m.module_name,m.enabled,
  CASE WHEN NOT m.enabled THEN 'disabled'::text WHEN d.depends_on IS NULL THEN 'ready'::text
       WHEN EXISTS (SELECT 1 FROM enabled_modules em WHERE em.project_id=m.project_id AND em.module_name=d.depends_on) THEN 'ready'::text
       ELSE 'blocked'::text END AS readiness,
  d.depends_on
 FROM module_rows m LEFT JOIN dependencies d ON d.module_name=m.module_name;
