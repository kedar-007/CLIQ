import { Router, Request, Response } from 'express';
import passport from 'passport';
import { prisma } from '@comms/db';
import { generateAccessToken, generateRefreshToken } from '../services/token.service';
import { createLogger } from '@comms/logger';

const logger = createLogger('auth-service:saml');
export const samlRouter = Router();

samlRouter.get('/:tenantSlug/login', async (req: Request, res: Response, next) => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.tenantSlug } });
  if (!tenant?.samlConfig) {
    res.status(404).json({ success: false, error: 'SAML not configured for this workspace' });
    return;
  }
  passport.authenticate(`saml-${req.params.tenantSlug}`, { session: false })(req, res, next);
});

samlRouter.post('/:tenantSlug/callback', async (req: Request, res: Response, next) => {
  passport.authenticate(`saml-${req.params.tenantSlug}`, { session: false }, async (err: any, user: any) => {
    if (err || !user) {
      logger.error('SAML callback error', { err });
      return res.redirect(`${process.env.NEXTAUTH_URL}/login?error=SAMLFailed`);
    }
    const accessToken = generateAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
    const refreshToken = await generateRefreshToken(user.id);
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${process.env.NEXTAUTH_URL}/auth/callback?token=${accessToken}`);
  })(req, res, next);
});

samlRouter.get('/:tenantSlug/metadata', async (req: Request, res: Response) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${process.env.AUTH_SERVICE_URL}/saml/${req.params.tenantSlug}/metadata">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${process.env.AUTH_SERVICE_URL}/saml/${req.params.tenantSlug}/callback" index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`);
});
