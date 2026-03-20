import { Router, Request, Response } from 'express';
import { prisma } from '@comms/db';
import { redis } from '../config/redis';
import bcrypt from 'bcryptjs';
import { generateSlug } from '@comms/utils';

export const scimRouter = Router();

// SCIM bearer token authentication
function scimAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Unauthorized',
      status: 401,
    });
    return;
  }
  next();
}

scimRouter.use(scimAuth);

// SCIM User list + create
scimRouter.get('/v2/Users', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const startIndex = parseInt(req.query.startIndex as string || '1');
  const count = parseInt(req.query.count as string || '100');

  const users = await prisma.user.findMany({
    where: { tenantId },
    take: count,
    skip: startIndex - 1,
  });

  const total = await prisma.user.count({ where: { tenantId } });

  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: total,
    startIndex,
    itemsPerPage: count,
    Resources: users.map(scimUserFormat),
  });
});

scimRouter.post('/v2/Users', async (req: Request, res: Response) => {
  const { userName, name, externalId, active, emails } = req.body;
  const tenantId = req.query.tenantId as string;

  const email = emails?.[0]?.value || userName;
  const displayName = name?.formatted || `${name?.givenName || ''} ${name?.familyName || ''}`.trim();

  const existing = await prisma.user.findFirst({ where: { email, tenantId } });
  if (existing) {
    res.status(409).json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'User already exists', status: 409 });
    return;
  }

  const tempPassword = Math.random().toString(36).slice(-12);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      name: displayName || email,
      passwordHash,
      scimExternalId: externalId,
      isDeactivated: !active,
      role: 'MEMBER',
    },
  });

  res.status(201).json(scimUserFormat(user));
});

scimRouter.get('/v2/Users/:id', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) { res.status(404).json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'User not found', status: 404 }); return; }
  res.json(scimUserFormat(user));
});

scimRouter.put('/v2/Users/:id', async (req: Request, res: Response) => {
  const { name, active, emails } = req.body;
  const email = emails?.[0]?.value;
  const displayName = name?.formatted || `${name?.givenName || ''} ${name?.familyName || ''}`.trim();

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { name: displayName, email, isDeactivated: !active },
  });
  res.json(scimUserFormat(user));
});

scimRouter.patch('/v2/Users/:id', async (req: Request, res: Response) => {
  const { Operations } = req.body;
  const updates: Record<string, unknown> = {};

  for (const op of Operations || []) {
    if (op.op === 'Replace' && op.path === 'active') {
      updates.isDeactivated = !op.value;
    }
    if (op.op === 'Replace' && op.path === 'displayName') {
      updates.name = op.value;
    }
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data: updates });
  res.json(scimUserFormat(user));
});

scimRouter.delete('/v2/Users/:id', async (req: Request, res: Response) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { isDeactivated: true } });
  res.status(204).send();
});

function scimUserFormat(user: any) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: user.scimExternalId,
    userName: user.email,
    name: { formatted: user.name },
    emails: [{ value: user.email, primary: true }],
    active: !user.isDeactivated,
    meta: {
      resourceType: 'User',
      created: user.createdAt,
      lastModified: user.updatedAt,
    },
  };
}
