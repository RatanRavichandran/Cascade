import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      // No scopes requested — public repo read + 5,000 req/hr authenticated.
      // The consent screen shows only "verify your GitHub identity".
      authorization: { params: { scope: "" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Attach the GitHub access token and user identity to the JWT.
    // `account` is only present on the initial sign-in, so we persist to the token.
    jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.githubAccessToken = account.access_token;
      }
      if (profile) {
        const p = profile as unknown as { id: number; login: string };
        if (p.id) token.ghId = String(p.id);
        if (p.login) token.ghLogin = p.login;
      }
      return token;
    },
    // Expose safe identity fields on the session object (never expose the raw token).
    session({ session, token }) {
      if (token.ghId) session.user.ghId = token.ghId as string;
      if (token.ghLogin) session.user.ghLogin = token.ghLogin as string;
      return session;
    },
  },
});
