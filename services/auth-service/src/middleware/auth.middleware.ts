import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/token.service';
import { prisma } from '@comms/db';
import type { JWTPayload, UserRole } from '@comms/types';

export interface AuthRequest extends Request {
  user?: JWTPayload;
  tenant?: { id: string; plan: string; settings: Record<string, unknown> };
}

export async function verifyAccessTokenMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No access token provided' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    req.user = payload;

    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired access token' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(req.user.role as UserRole)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export async function attachTenant(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.tenantId) {
    next();
    return;
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { id: true, plan: true, settings: true },
    });
    if (tenant) {
      req.tenant = { id: tenant.id, plan: tenant.plan, settings: tenant.settings as Record<string, unknown> };
    }
    next();
  } catch {
    next();
  }
}
