import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '@comms/db';
import { generateSlug } from '@comms/utils';
import bcrypt from 'bcryptjs';

const CALLBACK_BASE = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

// ─── Google OAuth ─────────────────────────────────────────────────────────────

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: `${CALLBACK_BASE}/oauth/google/callback`,
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email from Google'), false);

      let user = await prisma.user.findFirst({
        where: { email },
        include: { tenant: true },
      });

      if (!user) {
        const name = profile.displayName || email.split('@')[0];
        const slug = generateSlug(name + '-workspace');
        const tenant = await prisma.tenant.create({
          data: {
            slug: `${slug}-${Date.now()}`.slice(0, 50),
            name: `${name}'s Workspace`,
            plan: 'FREE',
            users: {
              create: {
                email,
                name,
                role: 'OWNER',
                avatarUrl: profile.photos?.[0]?.value,
                isEmailVerified: true,
                oauthAccounts: {
                  create: { provider: 'GOOGLE', providerAccountId: profile.id },
                },
                userPreference: { create: {} },
              },
            },
          },
          include: { users: { include: { tenant: true } } },
        });
        user = tenant.users[0] as any;
      } else {
        await prisma.oAuthAccount.upsert({
          where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: profile.id } },
          create: { userId: user.id, provider: 'GOOGLE', providerAccountId: profile.id },
          update: {},
        });
      }

      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }));
}

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

if (process.env.GITHUB_CLIENT_ID) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    callbackURL: `${CALLBACK_BASE}/oauth/github/callback`,
    scope: ['user:email'],
  }, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('No email from GitHub'), false);

      let user = await prisma.user.findFirst({ where: { email } });

      if (!user) {
        const name = profile.displayName || profile.username || email.split('@')[0];
        const slug = `${generateSlug(name)}-${Date.now()}`.slice(0, 50);
        const tenant = await prisma.tenant.create({
          data: {
            slug,
            name: `${name}'s Workspace`,
            plan: 'FREE',
            users: {
              create: {
                email,
                name,
                role: 'OWNER',
                avatarUrl: profile.photos?.[0]?.value,
                isEmailVerified: true,
                oauthAccounts: {
                  create: { provider: 'GITHUB', providerAccountId: String(profile.id) },
                },
                userPreference: { create: {} },
              },
            },
          },
          include: { users: true },
        });
        user = tenant.users[0];
      }

      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }));
}

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});
