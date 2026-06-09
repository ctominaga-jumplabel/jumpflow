import type { DefaultSession } from "next-auth";
import type { RoleName } from "@/lib/auth/roles";

declare module "next-auth" {
  interface Session {
    user: {
      /** Stable provider subject id (Entra `oid`/`sub`). */
      id?: string;
      roles?: RoleName[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: RoleName[];
  }
}
