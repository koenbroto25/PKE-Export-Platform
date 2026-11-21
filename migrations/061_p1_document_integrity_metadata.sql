-- P1 document integrity: persist verification metadata used by upload and LC presentation.
ALTER TABLE public.project_export_documents
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.project_export_documents
   SET updated_at=COALESCE(reviewed_at,uploaded_at,created_at,now())
 WHERE updated_at IS NULL;

ALTER TABLE public.project_export_documents
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.project_export_documents d
   SET document_type_code=edt.document_code
  FROM public.project_export_document_requirements per
  JOIN public.country_export_document_requirements cdr ON cdr.id=per.country_requirement_id
  JOIN public.export_document_types edt ON edt.id=cdr.document_type_id
 WHERE d.project_requirement_id=per.id
   AND d.document_type_code IS NULL;

CREATE OR REPLACE FUNCTION public.p1_touch_project_export_document_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.updated_at:=now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS p1_project_export_documents_updated_at ON public.project_export_documents;
CREATE TRIGGER p1_project_export_documents_updated_at
BEFORE UPDATE ON public.project_export_documents
FOR EACH ROW EXECUTE FUNCTION public.p1_touch_project_export_document_updated_at();

ALTER TABLE public.project_export_documents
  DROP CONSTRAINT IF EXISTS project_export_documents_verified_metadata_check;
ALTER TABLE public.project_export_documents
  ADD CONSTRAINT project_export_documents_verified_metadata_check
  CHECK (
    upload_verified_at IS NULL OR
    (object_key IS NOT NULL AND sha256_checksum IS NOT NULL AND file_size_bytes IS NOT NULL
     AND storage_bucket='pke-private-documents')
  );

CREATE INDEX IF NOT EXISTS idx_project_export_documents_project_type_status
  ON public.project_export_documents(project_id,document_type_code,status,expiry_date);

