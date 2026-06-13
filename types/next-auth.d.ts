import type { DefaultSession, DefaultJWT } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      ghId?: string;
      ghLogin?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    githubAccessToken?: string;
    ghId?: string;
    ghLogin?: string;
  }
}
