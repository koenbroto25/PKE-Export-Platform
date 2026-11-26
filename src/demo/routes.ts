import type { Express, Request, Response } from "express";
import { getDemoState, resetDemoState, nextDemoId, touchDemoState, demoPermissionsForRole } from "./store.ts";
import { demoRequireAuth, demoRequireAdmin, demoRequireProjectPermission, registerDemoAuthRoutes } from "./auth.ts";

function ok(res: Response, body: any) { return res.json(body); }
function created(res: Response, body: any) { return res.status(201).json(body); }
function notInDemo(res: Response, feature: string) {
  return res.status(501).json({ error: "NOT AVAILABLE IN DEMO", code: "DEMO_NOT_AVAILABLE", feature, demo: true });
}

function projectById(id: string) {
  return getDemoState().projects.find((p: any) => p.id === id);
}

export function registerDemoApiRoutes(app: Express) {
  registerDemoAuthRoutes(app);

  app.post("/api/v1/demo/reset", demoRequireAuth, demoRequireAdmin, (req: Request, res: Response) => {
    resetDemoState();
    ok(res, { ok: true, reset: true, demo: true });
  });

  app.get("/api/v1/health", (_req: Request, res: Response) => {
    ok(res, { status: "ok", demo: true, mode: "manual-trial", timestamp: new Date().toISOString(), database: "in-memory-demo", environment: process.env.NODE_ENV || "development" });
  });

  app.use("/api/v1", (req: Request, res: Response, next) => demoRequireAuth(req, res, next));

  app.get("/api/v1/me", (req: Request, res: Response) => {
    const user = (req as any).user;
    const s = getDemoState();
    const memberships = s.projects.map((p: any) => ({ projectId: p.id, projectName: p.name, roleId: null, catalogRoleId: null, catalogRoleName: user.role, projectRoleId: null, roleCode: user.role, roleName: user.role, isActive: true, joinedAt: s.seededAt }));
    const permissions = demoPermissionsForRole(user.role);
    ok(res, {
      status: "authenticated",
      user: { ...user, accountStatus: "active", platformAdmin: user.isAdmin === true, projectMemberships: memberships, permissions, portalAccess: ["admin","workspace","field","buyer","partner","reports"] }
    });
  });

  // Projects
  app.get("/api/v1/projects", (_req, res) => ok(res, { projects: getDemoState().projects }));
  app.get("/api/v1/projects/:id", (req, res) => {
    const p = projectById(req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found", demo: true });
    ok(res, { project: p });
  });
  app.get("/api/v1/projects/:id/detail", (req, res) => {
    const p = projectById(req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found", demo: true });
    ok(res, { project: p, operatingProfile: null, members: [], roles: [], moduleReadiness: { demo: true } });
  });
  app.post("/api/v1/projects", (req, res) => {
    if (!demoRequireProjectPermission(req, res, "project.configuration.manage") && !(req as any).user?.isAdmin) return;
    const s = getDemoState();
    const body = req.body || {};
    const p = { id: nextDemoId("PROJECT"), contract_program_id: body.contractProgramId || s.contractPrograms[0]?.id || null, name: body.name || "Demo Project", description: body.description || null, status: body.status || "draft", settlement_unit: body.settlementUnit || "MT", target_quantity: Number(body.targetQuantity || 0), export_country_code: body.exportCountryCode || null, is_active: true, started_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    s.projects.unshift(p); touchDemoState();
    created(res, { project: p, roles: [], demo: true });
  });
  app.patch("/api/v1/projects/:id", (req, res) => { if (!demoRequireProjectPermission(req, res, "project.configuration.manage")) return;
    const s = getDemoState();
    const p = s.projects.find((x: any) => x.id === req.params.id);
    if (!p) return res.status(404).json({ error: "Project not found", demo: true });
    Object.assign(p, req.body || {}, { updated_at: new Date().toISOString() }); touchDemoState();
    ok(res, { project: p, demo: true });
  });
  app.post("/api/v1/projects/:id/archive", (req, res) => { if (!demoRequireProjectPermission(req, res, "project.configuration.manage")) return;
    const p = projectById(req.params.id); if (!p) return res.status(404).json({ error: "Project not found", demo: true });
    p.status = "archived"; p.updated_at = new Date().toISOString(); touchDemoState(); ok(res, { project: p, demo: true });
  });
  app.post("/api/v1/projects/:id/activate", (req, res) => { if (!demoRequireProjectPermission(req, res, "project.configuration.manage")) return; const p = projectById(req.params.id); if (!p) return res.status(404).json({ error: "Project not found", demo: true }); p.status = "active"; p.updated_at = new Date().toISOString(); touchDemoState(); ok(res, { project: p, demo: true }); });
  app.post("/api/v1/projects/:id/deactivate", (req, res) => { if (!demoRequireProjectPermission(req, res, "project.configuration.manage")) return; const p = projectById(req.params.id); if (!p) return res.status(404).json({ error: "Project not found", demo: true }); p.status = "inactive"; p.updated_at = new Date().toISOString(); touchDemoState(); ok(res, { project: p, demo: true }); });
  app.get("/api/v1/projects/:projectId/operating-profile", (_req, res) => res.status(404).json({ error: "Operating profile not found", demo: true, note: "NOT AVAILABLE IN DEMO" }));
  app.put("/api/v1/projects/:projectId/operating-profile", (_req, res) => notInDemo(res, "project operating profile persistence"));
  app.patch("/api/v1/projects/:projectId/operating-profile", (_req, res) => notInDemo(res, "project operating profile persistence"));
  app.get("/api/v1/projects/:id/module-readiness", (_req, res) => ok(res, { readiness: { demo: true, status: "simulated" } }));
  app.get("/api/v1/projects/:id/roles", (_req, res) => ok(res, { roles: [] }));
  app.post("/api/v1/projects/:id/roles", (_req, res) => notInDemo(res, "project role management"));
  app.patch("/api/v1/projects/:id/roles/:roleId", (_req, res) => notInDemo(res, "project role management"));
  app.delete("/api/v1/projects/:id/roles/:roleId", (_req, res) => notInDemo(res, "project role management"));
  app.get("/api/v1/projects/:id/roles/:roleId/permissions", (_req, res) => ok(res, { permissions: [] }));
  app.put("/api/v1/projects/:id/roles/:roleId/permissions", (_req, res) => notInDemo(res, "project permissions"));
  app.get("/api/v1/projects/:id/members", (_req, res) => ok(res, { members: [] }));
  app.post("/api/v1/projects/:id/members/invite", (_req, res) => notInDemo(res, "project member management"));
  app.patch("/api/v1/projects/:id/members/:memberId", (_req, res) => notInDemo(res, "project member management"));
  app.post("/api/v1/projects/:id/members/:memberId/revoke", (_req, res) => notInDemo(res, "project member management"));

  // Commercial
  app.get("/api/v1/contract-programs", (_req, res) => ok(res, { contractPrograms: getDemoState().contractPrograms }));
  app.get("/api/v1/contract-programs/:id", (req, res) => { const x = getDemoState().contractPrograms.find((i:any)=>i.id===req.params.id); if(!x) return res.status(404).json({error:"Contract Program not found", demo:true}); ok(res,{contractProgram:x}); });
  app.post("/api/v1/contract-programs", (req, res) => { const s=getDemoState(); const b=req.body||{}; const x={id:nextDemoId("PROGRAM"), name:b.name, buyer_id:b.buyerId||null, contract_id:b.contractId||null, settlement_unit:b.settlementUnit, target_quantity:Number(b.targetQuantity||0), cadence:b.cadence, generation_mode:b.generationMode||"scheduled_draft", description:b.description||null, is_active:true, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}; s.contractPrograms.unshift(x); touchDemoState(); created(res,{contractProgram:x,demo:true}); });
  app.patch("/api/v1/contract-programs/:id", (req,res)=>{ const s=getDemoState(); const x=s.contractPrograms.find((i:any)=>i.id===req.params.id); if(!x) return res.status(404).json({error:"Contract program not found", demo:true}); Object.assign(x, req.body||{}, {updated_at:new Date().toISOString()}); touchDemoState(); ok(res,{contractProgram:x,demo:true}); });
  app.get("/api/v1/cycle-policies", (_req,res)=>ok(res,{cyclePolicies:getDemoState().cyclePolicies}));
  app.post("/api/v1/cycle-policies", (req,res)=>{ const s=getDemoState(); const b=req.body||{}; const x={id:nextDemoId("CYCLE"), contract_program_id:b.contractProgramId, cadence:b.cadence, target_quantity:b.targetQuantity??null, generation_mode:b.generationMode, is_active:true, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}; s.cyclePolicies.unshift(x); touchDemoState(); created(res,{cyclePolicy:x,demo:true}); });
  app.get("/api/v1/buyers", (_req,res)=>ok(res,{buyers:getDemoState().buyers}));
  app.post("/api/v1/buyers", (req,res)=>{ const s=getDemoState(); const b=req.body||{}; const x={id:nextDemoId("BUYER"), name:b.name, code:b.code||null, country_code:b.countryCode||null, is_active:true, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}; s.buyers.unshift(x); touchDemoState(); created(res,{buyer:x,demo:true}); });
  app.patch("/api/v1/buyers/:id", (req,res)=>{ const s=getDemoState(); const x=s.buyers.find((i:any)=>i.id===req.params.id); if(!x) return res.status(404).json({error:"Buyer not found", demo:true}); Object.assign(x,{name:req.body?.name??x.name, code:req.body?.code??x.code, country_code:req.body?.countryCode??x.country_code, is_active:req.body?.isActive??x.is_active, updated_at:new Date().toISOString()}); touchDemoState(); ok(res,{buyer:x,demo:true}); });
  app.get("/api/v1/buyers/:id", (req,res)=>{ const x=getDemoState().buyers.find((i:any)=>i.id===req.params.id); if(!x) return res.status(404).json({error:"Buyer not found", demo:true}); ok(res,{buyer:x}); });
  app.get("/api/v1/contracts", (_req,res)=>ok(res,{contracts:getDemoState().contracts}));
  app.post("/api/v1/contracts", (req,res)=>{ const s=getDemoState(); const b=req.body||{}; const x={id:nextDemoId("CONTRACT"), buyer_id:b.buyerId, code:b.code, name:b.name, start_date:b.startDate, end_date:b.endDate||null, is_active:true, created_at:new Date().toISOString(), updated_at:new Date().toISOString()}; s.contracts.unshift(x); touchDemoState(); created(res,{contract:x,demo:true}); });
  app.get("/api/v1/contracts/:id", (req,res)=>{ const x=getDemoState().contracts.find((i:any)=>i.id===req.params.id); if(!x) return res.status(404).json({error:"Contract not found", demo:true}); ok(res,{contract:x}); });
  app.patch("/api/v1/contracts/:id", (_req,res)=>notInDemo(res,"contract update"));
  app.get("/api/v1/buyer-projects", (_req,res)=>ok(res,{buyerProjects:getDemoState().projects.map((p:any)=>({id:p.id,name:p.name,status:p.status,settlement_unit:p.settlement_unit,target_quantity:p.target_quantity,created_at:p.created_at}))}));
  app.get("/api/v1/supplier-projects", (_req,res)=>ok(res,{supplierProjects:getDemoState().projects.map((p:any)=>({id:p.id,name:p.name,status:p.status,settlement_unit:p.settlement_unit,target_quantity:p.target_quantity,created_at:p.created_at}))}));

  // Reports / dashboard
  app.get("/api/v1/reports/portfolio", (_req,res)=>{ const s=getDemoState(); ok(res,{activeProjects:s.projects.filter((p:any)=>p.status==="active").length, contractVolume:s.projects.reduce((a:number,p:any)=>a+Number(p.target_quantity||0),0), approvedBudget:null, shipmentCount:0, committedCost:null, actualCost:null, outstandingReceivables:null, criticalComplianceBlockers:null, dataFreshness:new Date().toISOString(), demo:true}); });
  app.get("/api/v1/reports/project/:projectId", (req,res)=>{ const p=projectById(req.params.projectId); if(!p) return res.status(404).json({error:"Project not found",demo:true}); ok(res,{project:p, demo:true, activeProjects:1, contractVolume:Number(p.target_quantity||0), approvedBudget:null, shipmentCount:0, dataFreshness:new Date().toISOString()}); });
  app.get("/api/v1/reports/templates", (_req,res)=>ok(res,{templates:[{id:"DEMO-TPL-001",name:"Demo Portfolio Summary",type:"portfolio"}], demo:true}));
  app.get("/api/v1/reports/runs", (_req,res)=>ok(res,{runs:getDemoState().reportRuns, demo:true}));
  app.post("/api/v1/reports/generate", (req,res)=>{ const s=getDemoState(); const run={id:nextDemoId("REPORT"), project_id:req.body?.projectId||null, template:req.body?.template||"demo", status:"unavailable_in_demo", note:"NOT AVAILABLE IN DEMO: report file generation/storage is disabled in manual trial mode.", created_at:new Date().toISOString()}; s.reportRuns.unshift(run); touchDemoState(); created(res,{run,demo:true}); });
  app.get("/api/v1/reports/export/projects", (_req,res)=>notInDemo(res,"report export"));
  app.get("/api/v1/reports/kpis/operational", (_req,res)=>ok(res,{kpis:{demo:true}, message:"Simulated demo KPI data", demo:true}));
  app.get("/api/v1/reports/kpis/financial", (_req,res)=>ok(res,{kpis:{demo:true}, message:"Simulated demo KPI data", demo:true}));
  app.get("/api/v1/reports/historical", (_req,res)=>ok(res,{historical:[], demo:true}));
  app.get("/api/v1/reports/schedules", (_req,res)=>ok(res,{schedules:[], demo:true}));
  app.post("/api/v1/reports/schedules", (_req,res)=>notInDemo(res,"report scheduling"));
  app.post("/api/v1/reports/scheduler/run-due", (_req,res)=>notInDemo(res,"report scheduler"));
  app.get("/api/v1/reports/scheduler/runs", (_req,res)=>ok(res,{runs:[], demo:true}));
  app.post("/api/v1/reports/export/audit", (_req,res)=>notInDemo(res,"report audit export"));

  // Notifications / workflows
  app.get("/api/v1/notifications", (_req,res)=>ok(res,{notifications:getDemoState().notifications, demo:true}));
  app.post("/api/v1/notifications", (req,res)=>{ const s=getDemoState(); const n={id:nextDemoId("NOTIF"), type:req.body?.type||"info", title:req.body?.title||"Demo notification", message:req.body?.message||"", is_read:false, created_at:new Date().toISOString()}; s.notifications.unshift(n); touchDemoState(); created(res,{notification:n,demo:true}); });
  app.patch("/api/v1/notifications/:id/read", (req,res)=>{ const s=getDemoState(); const n=s.notifications.find((x:any)=>x.id===req.params.id); if(!n) return res.status(404).json({error:"Notification not found",demo:true}); n.is_read=true; n.read_at=new Date().toISOString(); touchDemoState(); ok(res,{notification:n,demo:true}); });
  app.get("/api/v1/workflows/project/:projectId", (_req,res)=>ok(res,{workflows:getDemoState().workflowDefinitions, demo:true}));
  app.post("/api/v1/workflows", (_req,res)=>notInDemo(res,"workflow creation persistence"));
  app.get("/api/v1/notifications/providers", (_req,res)=>ok(res,{providers:[], demo:true, note:"NOT AVAILABLE IN DEMO: external notification providers disabled"}));
  app.get("/api/v1/kpis", (_req,res)=>ok(res,{kpis:[], demo:true}));

  // Documents/storage (simulated, no real storage)
  app.get("/api/v1/projects/:projectId/document-requirements", (req,res)=>{ if(!demoRequireProjectPermission(req,res,"documents.view")) return; ok(res,{documentRequirements:getDemoState().documentRequirements.filter((d:any)=>d.project_id===req.params.projectId), demo:true}); });
  app.get("/api/v1/projects/:projectId/documents", (req,res)=>{ if(!demoRequireProjectPermission(req,res,"documents.view")) return; ok(res,{documents:getDemoState().exportDocuments.filter((d:any)=>d.project_id===req.params.projectId), demo:true}); });
  app.post("/api/v1/projects/:projectId/documents", (req,res)=>{ if(!demoRequireProjectPermission(req,res,"documents.create")) return; const s=getDemoState(); const b=req.body||{}; const reqDoc=s.documentRequirements.find((r:any)=>r.id===b.projectRequirementId && r.project_id===req.params.projectId); if(!reqDoc) return res.status(404).json({error:"Requirement not found",demo:true}); const doc={id:nextDemoId("DOC"), project_id:req.params.projectId, project_requirement_id:b.projectRequirementId, file_reference:b.fileReference, object_key:b.objectKey||null, original_filename:b.originalFilename, mime_type:b.mimeType||null, sha256_checksum:b.sha256Checksum||null, version_no:b.versionNo??1, status:"uploaded", uploaded_by:(req as any).user?.id||null, reviewed_by:null, uploaded_at:new Date().toISOString(), reviewed_at:null, expiry_date:b.expiryDate||null, notes:b.notes||null, created_at:new Date().toISOString(), updated_at:new Date().toISOString(), country_requirement_id:reqDoc.country_requirement_id, country_code:reqDoc.country_code, document_code:reqDoc.document_code, document_name:reqDoc.document_name}; s.exportDocuments.unshift(doc); touchDemoState(); created(res,{document:doc,demo:true,note:"Simulated document metadata only (no file storage in demo)."}); });
  app.patch("/api/v1/documents/:id", (req,res)=>{ if(!demoRequireProjectPermission(req,res,"documents.review")) return; const s=getDemoState(); const d=s.exportDocuments.find((x:any)=>x.id===req.params.id); if(!d) return res.status(404).json({error:"Document not found",demo:true}); const transitions: Record<string,string[]> = { uploaded:["in_review"], in_review:["approved","rejected","needs_correction"], needs_correction:["in_review"] }; if(req.body?.status){ const allowed=transitions[d.status]||[]; if(!["uploaded","in_review","approved","rejected","needs_correction","expired"].includes(req.body.status)) return res.status(400).json({error:"Invalid document status",code:"DEMO_INVALID_DOCUMENT_STATUS",demo:true}); if(!allowed.includes(req.body.status)) return res.status(409).json({error:"Invalid document status transition",code:"DEMO_DOCUMENT_TRANSITION_INVALID",from:d.status,to:req.body.status,demo:true}); if(req.body.status==="rejected"&&!String(req.body.notes||"").trim()) return res.status(400).json({error:"Rejection note is required",code:"DEMO_REJECTION_NOTE_REQUIRED",demo:true}); d.status=req.body.status; d.reviewed_by=(req as any).user?.id||null; d.reviewed_at=new Date().toISOString(); } if(req.body?.notes!==undefined) d.notes=req.body.notes; d.updated_at=new Date().toISOString(); touchDemoState(); ok(res,{document:d,demo:true}); });
  app.get("/api/v1/storage/status", (_req,res)=>ok(res,{available:false,bucket:"pke-private-documents",reason:"NOT AVAILABLE IN DEMO: private storage is disabled in manual trial mode.",demo:true}));
  app.post("/api/v1/storage/presigned-upload", (_req,res)=>notInDemo(res,"storage presigned upload"));
  app.get("/api/v1/storage/presigned-download/*objectKey", (_req,res)=>notInDemo(res,"storage presigned download"));

  // Compliance/admin-ish reads
  app.get("/api/v1/regulatory-knowledge", (_req,res)=>ok(res,{regulatoryKnowledge:[], demo:true, note:"NOT AVAILABLE IN DEMO: verified regulatory sources not loaded"}));
  app.post("/api/v1/compliance-check", (_req,res)=>ok(res,{complianceResult:{compliant:null,status:"requires_human_review",issues:[],message:"NOT AVAILABLE IN DEMO: compliance engine requires verified rules and human review.",demo:true}}));
  app.get("/api/v1/country-packs", (_req,res)=>ok(res,{countryPacks:[], demo:true}));

  // Generic demo-safe fallbacks for common lists used by UI
  const emptyList = (key: string) => (_req: Request, res: Response) => ok(res, { [key]: [], demo: true });
  app.get("/api/v1/truck-trips", emptyList("truckTrips"));
  app.post("/api/v1/truck-trips", (_req,res)=>notInDemo(res,"truck trips"));
  app.get("/api/v1/truck-trips/:id", (_req,res)=>res.status(404).json({error:"Not found",demo:true}));
  app.patch("/api/v1/truck-trips/:id", (_req,res)=>notInDemo(res,"truck trips"));
  app.get("/api/v1/transport-legs", emptyList("transportLegs"));
  app.get("/api/v1/tracking-events", emptyList("trackingEvents"));
  app.post("/api/v1/tracking-events", (_req,res)=>notInDemo(res,"tracking events"));
  app.get("/api/v1/tracking-events/trip/:tripId", emptyList("trackingEvents"));
  app.get("/api/v1/warehouse-receipts", emptyList("warehouseReceipts"));
  app.post("/api/v1/warehouse-receipts", (_req,res)=>notInDemo(res,"warehouse receipts"));
  app.patch("/api/v1/warehouse-receipts/:id", (_req,res)=>notInDemo(res,"warehouse receipts"));
  app.get("/api/v1/inventory-lots", emptyList("inventoryLots"));
  app.post("/api/v1/inventory-lots", (_req,res)=>notInDemo(res,"inventory lots"));
  app.post("/api/v1/inventory-movements", (_req,res)=>notInDemo(res,"inventory movements"));
  app.get("/api/v1/inventory-reservations", emptyList("inventoryReservations"));
  app.post("/api/v1/inventory-reservations", (_req,res)=>notInDemo(res,"inventory reservations"));
  app.get("/api/v1/inventory-holds", emptyList("inventoryHolds"));
  app.post("/api/v1/inventory-holds", (_req,res)=>notInDemo(res,"inventory holds"));
  app.get("/api/v1/shipment-allocations", emptyList("shipmentAllocations"));
  app.post("/api/v1/shipment-allocations", (_req,res)=>notInDemo(res,"shipment allocations"));
  app.patch("/api/v1/shipment-allocations/:id", (_req,res)=>notInDemo(res,"shipment allocations"));
  app.get("/api/v1/fx-rates", emptyList("fxRates"));
  app.post("/api/v1/fx-rates", (_req,res)=>notInDemo(res,"fx rates"));
  app.get("/api/v1/fx-exposure", emptyList("fxExposure"));
  app.post("/api/v1/fx-exposure", (_req,res)=>notInDemo(res,"fx exposure"));
  app.get("/api/v1/journal-entries", emptyList("journalEntries"));
  app.post("/api/v1/journal-entries", (_req,res)=>notInDemo(res,"journal entries"));
  app.post("/api/v1/journal-entries/:id/post", (_req,res)=>notInDemo(res,"journal posting"));
  app.post("/api/v1/journal-lines", (_req,res)=>notInDemo(res,"journal lines"));
  app.get("/api/v1/rab", emptyList("rab"));
  app.post("/api/v1/rab", (_req,res)=>notInDemo(res,"RAB"));
  app.get("/api/v1/chart-of-accounts", emptyList("accounts"));
  app.post("/api/v1/chart-of-accounts", (_req,res)=>notInDemo(res,"chart of accounts"));
  app.get("/api/v1/payment-instructions", emptyList("paymentInstructions"));
  app.post("/api/v1/payment-instructions", (_req,res)=>res.status(503).json({ error: "Payment execution unavailable in demo (and production fail-closed)", code: "PAYMENT_UNAVAILABLE", demo: true }));
  app.patch("/api/v1/payment-instructions/:id", (_req,res)=>res.status(503).json({ error: "Payment execution unavailable in demo (and production fail-closed)", code: "PAYMENT_UNAVAILABLE", demo: true }));
  app.get("/api/v1/export-document-types", emptyList("exportDocumentTypes"));
  app.post("/api/v1/export-document-types", (_req,res)=>notInDemo(res,"export document types"));
  app.get("/api/v1/country-export-document-requirements", emptyList("countryExportDocumentRequirements"));
  app.post("/api/v1/country-export-document-requirements", (_req,res)=>notInDemo(res,"country export requirements"));
  app.get("/api/v1/project-export-document-requirements", (req,res)=>{ const pid=req.query.projectId as string|undefined; const rows=getDemoState().documentRequirements.filter((d:any)=>!pid||d.project_id===pid); ok(res,{projectExportDocumentRequirements:rows,demo:true}); });
  app.post("/api/v1/project-export-document-requirements", (_req,res)=>notInDemo(res,"project export requirements"));
  app.get("/api/v1/project-export-documents", (req,res)=>{ const pid=req.query.projectId as string|undefined; const rows=getDemoState().exportDocuments.filter((d:any)=>!pid||d.project_id===pid); ok(res,{projectExportDocuments:rows,demo:true}); });
  app.post("/api/v1/project-export-documents", (_req,res)=>notInDemo(res,"project export documents"));
  app.patch("/api/v1/project-export-documents/:id", (_req,res)=>notInDemo(res,"project export documents"));
  app.get("/api/v1/regulatory-sources", emptyList("regulatorySources"));
  app.post("/api/v1/regulatory-sources", (_req,res)=>notInDemo(res,"regulatory sources"));
  app.get("/api/v1/users", (_req,res)=>ok(res,{users:[], demo:true}));
  app.post("/api/v1/admin/users/:id/password-reset", (_req,res)=>notInDemo(res,"admin password reset (Neon Auth disabled in demo)"));
  app.get("/api/v1/roles", (_req,res)=>ok(res,{roles:[], demo:true}));
  app.get("/api/v1/permissions", (_req,res)=>ok(res,{permissions:demoPermissionsForRole((_req as any).user?.role||"viewer"), demo:true}));
  app.post("/api/v1/auth/revoke-session", (_req,res)=>ok(res,{revoked:true, demo:true, note:"NOT AVAILABLE IN DEMO: no Neon Auth sessions"}));
  app.get("/api/v1/audit/privileged-actions", emptyList("auditEvents"));
  app.post("/api/v1/audit/privileged-actions", (_req,res)=>notInDemo(res,"privileged audit actions"));

  // Catch-all for unimplemented demo endpoints
  app.use("/api/v1", (req: Request, res: Response) => {
    return res.status(501).json({ error: "NOT AVAILABLE IN DEMO", code: "DEMO_NOT_IMPLEMENTED", path: req.path, method: req.method, demo: true });
  });
}



