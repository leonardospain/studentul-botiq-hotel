export const PERMISSIONS = [
  'reservations:read', 'reservations:write', 'reservations:override',
  'rooms:read', 'rooms:write', 'housekeeping:read', 'housekeeping:write',
  'guests:read', 'guests:write', 'payments:read', 'payments:write',
  'extras:write', 'reports:read', 'staff:manage', 'settings:manage', 'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const ROLES = ['owner', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'accountant'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== 'staff:manage' && p !== 'settings:manage'),
  receptionist: ['reservations:read', 'reservations:write', 'rooms:read', 'housekeeping:read', 'guests:read', 'guests:write', 'payments:read', 'payments:write', 'extras:write'],
  housekeeping: ['rooms:read', 'housekeeping:read', 'housekeeping:write'],
  maintenance: ['rooms:read', 'housekeeping:read'],
  accountant: ['reservations:read', 'guests:read', 'payments:read', 'reports:read'],
};

export const can = (role: Role, perm: Permission) => ROLE_PERMISSIONS[role].includes(perm);
