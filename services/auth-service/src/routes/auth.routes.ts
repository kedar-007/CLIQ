import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@comms/db';
import { generateSlug } from '@comms/utils';
import {
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  storePasswordResetToken,
  consumePasswordResetToken,
} from '../services/token.service';
import { generateMfaSecret, verifyTotp, generateBackupCodes, verifyBackupCode } from '../services/mfa.service';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/email.service';
import { verifyAccessTokenMiddleware, requireRole } from '../middleware/auth.middleware';
import type { AuthRequest } from '../middleware/auth.middleware';
import { createLogger } from '@comms/logger';

const logger = createLogger('auth-routes');
export const authRouter = Router();

// ─── Register ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  workspaceName: z.string().min(2).max(100),
  workspaceSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = registerSchema.parse(req.body);
    const slug = body.workspaceSlug || generateSlug(body.workspaceName);

    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      res.status(409).json({ success: false, error: 'Workspace slug already taken' });
      return;
    }

    const existingUser = await prisma.user.findFirst({ where: { email: body.email } });
    if (existingUser) {
      res.status(409).json({ success: false, error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const verificationToken = generateEmailVerificationToken();

    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: body.workspaceName,
        plan: 'FREE',
        users: {
          create: {
            email: body.email,
            passwordHash,
            name: body.name,
            role: 'OWNER',
            emailVerificationToken: verificationToken,
            userPreference: { create: {} },
          },
        },
        channels: {
          create: {
            name: 'general',
            slug: 'general',
            type: 'PUBLIC',
            isDefault: true,
            createdBy: 'system',
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];

    // Add user as member of the default channel
    const defaultChannel = await prisma.channel.findFirst({
      where: { tenantId: tenant.id, isDefault: true },
    });
    if (defaultChannel) {
      await prisma.channelMember.create({
        data: { channelId: defaultChannel.id, userId: user.id, role: 'OWNER' },
      }).catch(() => {});
    }

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendWelcomeEmail(user.email, user.name, verificationToken).catch((e) =>
      logger.warn('Welcome email failed', { err: e?.message })
    );

    const accessToken = generateAccessToken({
      sub: user.id,
      tenantId: tenant.id,
      role: 'OWNER' as any,
      email: user.email,
    });

    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: tenant.id,
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
        },
      },
    });
  } catch (err: any) {
    logger.error('Register error', { err: err?.message, stack: err?.stack });
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() });
      return;
    }
    res.status(500).json({ success: false, error: err?.message || 'Registration failed' });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  workspaceSlug: z.string().optional(),
  mfaToken: z.string().optional(),
  backupCode: z.string().optional(),
});

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: body.workspaceSlug
        ? { email: body.email, tenant: { slug: body.workspaceSlug } }
        : { email: body.email },
      include: { tenant: true },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (user.isDeactivated) {
      res.status(403).json({ success: false, error: 'Account deactivated' });
      return;
    }

    const passwordValid = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (user.mfaEnabled && user.mfaSecret) {
      if (!body.mfaToken && !body.backupCode) {
        res.status(200).json({ success: true, requiresMfa: true });
        return;
      }
      if (body.mfaToken) {
        if (!verifyTotp(user.mfaSecret, body.mfaToken)) {
          res.status(401).json({ success: false, error: 'Invalid MFA token' });
          return;
        }
      } else if (body.backupCode) {
        if (!await verifyBackupCode(user.id, body.backupCode)) {
          res.status(401).json({ success: false, error: 'Invalid backup code' });
          return;
        }
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    });

    const accessToken = generateAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as any,
      email: user.email,
    });

    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl,
          mustChangePassword: user.mustChangePassword,
          tenantId: user.tenantId,
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
            plan: user.tenant.plan,
            logoUrl: user.tenant.logoUrl,
            brandColor: user.tenant.brandColor,
          },
        },
      },
    });
  } catch (err: any) {
    logger.error('Login error', { err: err?.message, stack: err?.stack });
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() });
      return;
    }
    res.status(500).json({ success: false, error: err?.message || 'Login failed' });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────

authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken).catch(() => {});
  }
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

// ─── Refresh Token ─────────────────────────────────────────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: 'No refresh token' });
      return;
    }
    const { accessToken, refreshToken: newRefreshToken } = await rotateRefreshToken(
      refreshToken,
      req.headers['user-agent'],
      req.ip
    );
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, data: { accessToken, expiresIn: 900 } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

// ─── Me ───────────────────────────────────────────────────────────────────────

authRouter.get('/me', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: {
        tenant: true,
        userPreference: true,
        oauthAccounts: { select: { provider: true } },
      },
    });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    const { passwordHash, mfaSecret, emailVerificationToken, ...safeUser } = user;
    res.json({ success: true, data: safeUser });
  } catch (err: any) {
    logger.error('Me error', { err: err?.message });
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

authRouter.patch('/me', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      avatarUrl: z.string().url().or(z.literal('')).optional(),
      phoneNumber: z.string().max(30).optional(),
      department: z.string().max(100).optional(),
      jobTitle: z.string().max(100).optional(),
      timezone: z.string().max(100).optional(),
      locale: z.string().max(20).optional(),
    }).parse(req.body);

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.sub },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl || null } : {}),
        ...(body.phoneNumber !== undefined ? { phoneNumber: body.phoneNumber || null } : {}),
        ...(body.department !== undefined ? { department: body.department || null } : {}),
        ...(body.jobTitle !== undefined ? { jobTitle: body.jobTitle || null } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone || 'UTC' } : {}),
        ...(body.locale !== undefined ? { locale: body.locale || 'en' } : {}),
      },
      include: { tenant: true },
    });

    const { passwordHash, mfaSecret, emailVerificationToken, ...safeUser } = updatedUser;
    res.json({ success: true, data: safeUser });
  } catch (err: any) {
    logger.error('Update profile error', { err: err?.message, stack: err?.stack });
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

authRouter.post('/change-password', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user?.passwordHash) {
      res.status(400).json({ success: false, error: 'Password login is not enabled for this account' });
      return;
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    logger.error('Change password error', { err: err?.message, stack: err?.stack });
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: err.flatten() });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// ─── Forgot Password ──────────────────────────────────────────────────────────

authRouter.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findFirst({ where: { email } });
    if (user) {
      const token = generatePasswordResetToken();
      await storePasswordResetToken(user.id, token);
      await sendPasswordResetEmail(email, user.name, token).catch(() => {});
    }
    res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────

authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = z.object({ token: z.string(), password: z.string().min(8) }).parse(req.body);
    const userId = await consumePasswordResetToken(token);
    if (!userId) {
      res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// ─── Verify Email ─────────────────────────────────────────────────────────────

authRouter.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    const user = await prisma.user.findFirst({ where: { emailVerificationToken: token } });
    if (!user) {
      res.status(400).json({ success: false, error: 'Invalid verification token' });
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerificationToken: null },
    });
    res.json({ success: true, message: 'Email verified successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to verify email' });
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

authRouter.get('/sessions', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.sub, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
      select: { id: true, deviceInfo: true, ipAddress: true, lastActiveAt: true, createdAt: true },
    });
    res.json({ success: true, data: sessions });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

authRouter.delete('/sessions/:id', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.session.deleteMany({ where: { id: req.params.id, userId: req.user!.sub } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to revoke session' });
  }
});

// ─── MFA ─────────────────────────────────────────────────────────────────────

authRouter.post('/mfa/setup', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    const { secret, qrCodeUrl, otpAuthUrl } = await generateMfaSecret(user.id, user.email);
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });
    res.json({ success: true, data: { secret, qrCodeUrl, otpAuthUrl } });
  } catch {
    res.status(500).json({ success: false, error: 'MFA setup failed' });
  }
});

authRouter.post('/mfa/verify', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = z.object({ token: z.string().length(6) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user?.mfaSecret) { res.status(400).json({ success: false, error: 'MFA not set up' }); return; }
    if (!verifyTotp(user.mfaSecret, token)) { res.status(400).json({ success: false, error: 'Invalid MFA token' }); return; }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    const backupCodes = await generateBackupCodes(user.id);
    res.json({ success: true, data: { backupCodes } });
  } catch {
    res.status(500).json({ success: false, error: 'MFA verification failed' });
  }
});

authRouter.post('/mfa/disable', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user?.passwordHash) { res.status(400).json({ success: false, error: 'Password required' }); return; }
    if (!await bcrypt.compare(password, user.passwordHash)) { res.status(401).json({ success: false, error: 'Invalid password' }); return; }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } });
    res.json({ success: true, message: 'MFA disabled' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to disable MFA' });
  }
});

authRouter.get('/mfa/backup-codes', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const backupCodes = await generateBackupCodes(req.user!.sub);
    res.json({ success: true, data: { backupCodes } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate backup codes' });
  }
});

// ─── Workspace Members ────────────────────────────────────────────────────────

// GET /auth/workspace/members — list all workspace members
authRouter.get('/workspace/members', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const members = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, isDeactivated: false },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, status: true, createdAt: true },
      orderBy: [{ name: 'asc' }],
    });
    res.json({ success: true, data: members });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch members' });
  }
});

// POST /auth/workspace/members/invite — invite user by email
authRouter.post('/workspace/members/invite', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, name, role = 'MEMBER' } = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      role: z.enum(['MEMBER', 'ADMIN']).optional(),
    }).parse(req.body);

    const tenantId = req.user!.tenantId;
    const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Check if user already exists in this tenant
    const existing = await prisma.user.findFirst({ where: { email, tenantId } });
    if (existing) {
      if (!existing.isDeactivated) {
        res.status(409).json({ success: false, error: 'User already in workspace' });
        return;
      }

      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          mustChangePassword: true,
          role: role as any || 'MEMBER',
          isDeactivated: false,
          status: 'OFFLINE',
          lastSeen: null,
        },
      });

      const defaultChannels = await prisma.channel.findMany({
        where: { tenantId, isDefault: true, isArchived: false },
      });

      for (const ch of defaultChannels) {
        await prisma.channelMember.upsert({
          where: { channelId_userId: { channelId: ch.id, userId: user.id } },
          create: { channelId: ch.id, userId: user.id, role: 'MEMBER' },
          update: {},
        }).catch(() => {});
      }

      res.json({
        success: true,
        data: { id: user.id, email: user.email, name: user.name, role: user.role, tempPassword, reactivated: true },
      });
      return;
    }

    // Create invited user with temporary password
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        mustChangePassword: true,
        role: role as any || 'MEMBER',
        tenantId,
        userPreference: { create: {} },
      },
    });

    // Add to default channels
    const defaultChannels = await prisma.channel.findMany({
      where: { tenantId, isDefault: true, isArchived: false },
    });
    for (const ch of defaultChannels) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: ch.id, userId: user.id } },
        create: { channelId: ch.id, userId: user.id, role: 'MEMBER' },
        update: {},
      }).catch(() => {});
    }

    res.json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name, role: user.role, tempPassword },
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid input', details: err.errors });
      return;
    }
    logger.error('Invite member error', { err });
    res.status(500).json({ success: false, error: 'Failed to invite member' });
  }
});

// DELETE /auth/workspace/members/:userId — remove member
authRouter.delete('/workspace/members/:userId', verifyAccessTokenMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (userId === req.user!.sub) {
      res.status(400).json({ success: false, error: 'Cannot remove yourself' });
      return;
    }
    const member = await prisma.user.findFirst({
      where: { id: userId, tenantId: req.user!.tenantId },
      select: { id: true },
    });

    if (!member) {
      res.status(404).json({ success: false, error: 'Member not found' });
      return;
    }

    await prisma.user.update({
      where: { id: member.id },
      data: { isDeactivated: true, status: 'OFFLINE', lastSeen: null },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});
