import type { RoleName } from "./roles";

/**
 * Application-level user, decoupled from the auth provider's session shape.
 * The rest of the app should depend on this type, not on Auth.js internals.
 */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: RoleName[];
}

export type { RoleName };
