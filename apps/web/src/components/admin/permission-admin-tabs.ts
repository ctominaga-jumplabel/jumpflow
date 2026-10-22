/**
 * Tabs of the Permission Matrix admin screen. Lives in a plain (non-"use
 * client") module because the SERVER page reads it to validate `?tab=`: a
 * value exported from a client module reaches the server only as a client
 * reference, never as the real array.
 */
export const PERMISSION_ADMIN_TABS = ["matriz", "grupos", "funcionalidades"] as const;
export type PermissionAdminTab = (typeof PERMISSION_ADMIN_TABS)[number];
