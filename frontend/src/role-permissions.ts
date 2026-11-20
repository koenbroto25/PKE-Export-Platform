export type WorkspacePageKey =
  | 'dashboard' | 'projects' | 'contracts' | 'operations' | 'finance' | 'compliance'
  | 'reports' | 'notifications' | 'access' | 'journal-entries' | 'shipment-allocations'
  | 'cash-advances' | 'payment-instructions' | 'buyer' | 'supplier' | 'transporter'
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
  contracts: ['contract.view', 'manage_contract_programs'],
  operations: ['operations.view', 'logistics.create', 'logistics.update', 'warehouse.view', 'inventory.view', 'shipping.view'],
  finance: ['finance.view', 'finance.create', 'finance.update', 'finance.delete'],
  compliance: ['documents.review', 'documents.verify', 'documents.create', 'documents.update', 'compliance.view', 'compliance.assess', 'audit.view', 'workflow.view', 'project.view', 'quality.result.review'],
  reports: ['reports.view', 'report.view'],
  access: ['project.members.view', 'project.members.manage', 'project.roles.manage'],
  'journal-entries': ['accounting.view'],
  'shipment-allocations': ['shipping.view'],
  'cash-advances': ['finance.view', 'finance.cash_advance.request'],
  'payment-instructions': ['payment.view'],
  buyer: ['buyer.requirement.view', 'buyer.shipment.view'],
  supplier: ['supplier.view'],
  transporter: ['logistics.view', 'record_truck_trips', 'verify_checkpoints'],
  warehouse: ['warehouse.view', 'inventory.view'],
  warehouse_manager: ['warehouse.view', 'inventory.view'],
  funder: ['funder.view'],
};

export function hasActiveProjectMembership(user: WorkspaceAccessUser): boolean {
  return (user.projectMemberships || []).some(membership => membership.isActive === true);
}

export function hasPageAccess(pageKey: WorkspacePageKey | string, user: WorkspaceAccessUser): boolean {
  if (user.platformAdmin === true) return true;
  if (pageKey === 'notifications') return true;
  if (pageKey === 'projects') return hasActiveProjectMembership(user);
  if (!user.selectedProjectId || user.projectPermissionsLoading || user.projectPermissionsError) {
    return pageKey === 'dashboard' && !user.selectedProjectId && hasActiveProjectMembership(user);
  }
  if (pageKey === 'dashboard') {
    const externalOnly = new Set(['supplier.view', 'buyer.requirement.view', 'buyer.shipment.view', 'product.view', 'documents.view', 'shipment.view', 'logistics.view', 'record_truck_trips', 'verify_checkpoints']);
    return (user.projectPermissions || []).some(permission => !externalOnly.has(permission));
  }
  const required = PAGE_PERMISSION_REQUIREMENTS[pageKey];
  if (!required) return false;
  const permissions = new Set(user.projectPermissions || []);
  return required.some(permission => permissions.has(permission));
}

export function visiblePageKeys(user: WorkspaceAccessUser): WorkspacePageKey[] {
  const keys: WorkspacePageKey[] = ['dashboard', 'projects', 'contracts', 'operations', 'finance', 'compliance', 'journal-entries', 'shipment-allocations', 'cash-advances', 'payment-instructions', 'reports', 'notifications', 'access', 'buyer', 'supplier', 'transporter', 'warehouse', 'funder'];
  return keys.filter(key => hasPageAccess(key, user));
}
