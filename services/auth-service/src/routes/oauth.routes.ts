import { Router } from 'express';
import passport from 'passport';
import { generateAccessToken, generateRefreshToken } from '../services/token.service';
import { createLogger } from '@comms/logger';

const logger = createLogger('auth-service:oauth');
export const oauthRouter = Router();

function oauthCallback(req: any, res: any) {
  const user = req.user as any;
  if (!user) {
    return res.redirect(`${process.env.NEXTAUTH_URL}/login?error=OAuthFailed`);
  }

  const accessToken = generateAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });

  generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
    .then((refreshToken) => {
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.redirect(`${process.env.NEXTAUTH_URL}/auth/callback?token=${accessToken}`);
    })
    .catch((err) => {
      logger.error('OAuth callback error', { error: err });
      res.redirect(`${process.env.NEXTAUTH_URL}/login?error=OAuthFailed`);
    });
}

oauthRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
oauthRouter.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login?error=OAuthFailed' }), oauthCallback);

oauthRouter.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
oauthRouter.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: '/login?error=OAuthFailed' }), oauthCallback);

oauthRouter.get('/microsoft', passport.authenticate('microsoft', { scope: ['user.read', 'email', 'profile', 'openid'] }));
oauthRouter.get('/microsoft/callback', passport.authenticate('microsoft', { session: false, failureRedirect: '/login?error=OAuthFailed' }), oauthCallback);
