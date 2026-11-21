-- P16: resolve a document's Project only for a principal allowed to view Project evidence.
CREATE OR REPLACE FUNCTION public.pke_project_document_project_id(p_document_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT d.project_id
    FROM public.project_export_documents d
   WHERE d.id = p_document_id
     AND (
       public.pke_is_platform_admin()
       OR public.pke_has_project_permission(d.project_id, 'documents.view')
     )
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.pke_project_document_project_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_project_document_project_id(uuid) TO app_runtime_secure;
