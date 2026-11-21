-- P1 RLS policy execution: app runtime must be able to call the immutable permission mapper.
GRANT EXECUTE ON FUNCTION public.p1_workflow_permission(text,text) TO app_runtime_secure;

