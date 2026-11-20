export type WorkspacePageKey =
  | 'dashboard' | 'projects' | 'contracts' | 'operations' | 'finance' | 'compliance'
  | 'reports' | 'notifications' | 'access' | 'journal-entries' | 'shipment-allocations'
  | 'cash-advances' | 'payment-instructions' | 'my-work' | 'project-detail' | 'project-edit' | 'project-configuration' | 'project-roles' | 'project-members' | 'buyer' | 'supplier' | 'transporter'
  | 'warehouse' | 'warehouse_manager' | 'funder';

export interface WorkspaceAccessUser {
  platformAdmin?: boolean;
  selectedProjectId?: string;
  projectPermissions?: string[];
  projectPermissionsLoading?: boolean;
  projectPermissionsError?: string;
  projectMemberships?: Array<{ isActive?: boolean; projectId?: string }>;
}

const PAGE_PERMISSION_REQUIREMENTS: Record<string, readonly string[]> = {
  dashboard: ['project.view', 'reports.view', 'report.view', 'operations.view', 'logistics.view', 'finance.view', 'inventory.view', 'warehouse.view', 'shipment.view', 'shipping.view', 'documents.view', 'accounting.view', 'workflow.view', 'audit.view', 'supplier.view'],
  contracts: ['contract.view'],
  operations: ['operations.view', 'logistics.create', 'logistics.update', 'warehouse.view', 'inventory.view', 'shipping.view'],
  finance: ['finance.view', 'finance.create', 'finance.update', 'finance.delete'],
  compliance: ['documents.view', 'documents.review', 'documents.verify', 'documents.create', 'documents.update', 'compliance.view', 'compliance.assess', 'audit.view', 'workflow.view', 'project.view', 'quality.result.review'],
  reports: ['reports.view', 'report.view'],
  access: ['project.members.view', 'project.members.manage', 'project.roles.manage'],
  'journal-entries': ['accounting.view'],
  'shipment-allocations': ['shipping.view'],
  'cash-advances': ['finance.view', 'finance.cash_advance.request'],
  'payment-instructions': ['payment.view'],
  buyer: ['buyer.shipment.view'],
  supplier: ['supplier.view'],
  transporter: ['record_truck_trips', 'verify_checkpoints'],
  warehouse: ['warehouse.view', 'inventory.view'],
  warehouse_manager: ['warehouse.view', 'inventory.view'],
  funder: ['funder.view'],
};

export function hasProjectPermission(permission: string, user?: WorkspaceAccessUser): boolean {
  if (!user) return false;
  if (user.platformAdmin === true) return true;
  if (!user.selectedProjectId || user.projectPermissionsLoading || user.projectPermissionsError) return false;
  return (user.projectPermissions || []).includes(permission);
}

export function hasAnyProjectPermission(permissions: readonly string[], user?: WorkspaceAccessUser): boolean {
  return permissions.some(permission => hasProjectPermission(permission, user));
}

export function hasActiveProjectMembership(user: WorkspaceAccessUser): boolean {
  return (user.projectMemberships || []).some(membership => membership.isActive === true);
}

export function hasPageAccess(pageKey: WorkspacePageKey | string, user: WorkspaceAccessUser): boolean {
  if (user.platformAdmin === true) return true;
  if (pageKey === 'notifications') return true;
  if (pageKey === 'access') return hasAnyProjectPermission(['project.members.view', 'project.members.manage', 'project.roles.manage'], user);
  if (pageKey === 'project-detail') return hasProjectPermission('project.view', user);
  if (pageKey === 'project-edit') return hasProjectPermission('project.update', user);
  if (pageKey === 'project-configuration') return hasProjectPermission('project.configuration.manage', user);
  if (pageKey === 'project-roles') return hasProjectPermission('project.roles.manage', user);
  if (pageKey === 'project-members') return hasAnyProjectPermission(['project.members.view', 'project.members.manage'], user);
  if (pageKey === 'compliance') {
    const permissions = new Set(user.projectPermissions || []);
    const externalOnly = new Set(['supplier.view', 'buyer.requirement.view', 'buyer.shipment.view', 'documents.view', 'shipment.view', 'product.view', 'logistics.view', 'record_truck_trips', 'verify_checkpoints']);
    return [...permissions].some(permission => !externalOnly.has(permission))
      && PAGE_PERMISSION_REQUIREMENTS.compliance.some(permission => permissions.has(permission));
  }
  if (pageKey === 'my-work') return Boolean(user.selectedProjectId) && (user.projectPermissions || []).length > 0;
  if (pageKey === 'projects') return hasActiveProjectMembership(user);
  if (!user.selectedProjectId || user.projectPermissionsLoading || user.projectPermissionsError) {
    return pageKey === 'dashboard' && !user.selectedProjectId && hasActiveProjectMembership(user);
  }
  if (pageKey === 'dashboard') {
    // Every active Project role receives a scoped landing dashboard. Domain data
    // remains permission-gated by the dashboard and the API/RLS layer.
    return (user.projectPermissions || []).length > 0;
  }
  const permissions = new Set(user.projectPermissions || []);
  if (pageKey === 'supplier') return permissions.has('supplier.view') && permissions.has('shipment.view');
  if (pageKey === 'transporter') return permissions.has('record_truck_trips') && permissions.has('verify_checkpoints');
  const required = PAGE_PERMISSION_REQUIREMENTS[pageKey];
  if (!required) return false;
  return required.some(permission => permissions.has(permission));
}

export function visiblePageKeys(user: WorkspaceAccessUser): WorkspacePageKey[] {
  const keys: WorkspacePageKey[] = ['dashboard', 'projects', 'contracts', 'operations', 'finance', 'compliance', 'journal-entries', 'shipment-allocations', 'cash-advances', 'payment-instructions', 'reports', 'notifications', 'access', 'buyer', 'supplier', 'transporter', 'warehouse', 'funder'];
  return keys.filter(key => hasPageAccess(key, user));
}
