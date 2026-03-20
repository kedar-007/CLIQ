import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { prisma } from '@comms/db';
import bcrypt from 'bcryptjs';

export async function generateMfaSecret(userId: string, email: string): Promise<{
  secret: string;
  qrCodeUrl: string;
  otpAuthUrl: string;
}> {
  const secret = speakeasy.generateSecret({
    name: `CommsPlatform (${email})`,
    issuer: 'CommsPlatform',
    length: 32,
  });

  const otpAuthUrl = secret.otpauth_url!;
  const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

  // Store secret temporarily in session (user must verify before enabling)
  return {
    secret: secret.base32,
    qrCodeUrl,
    otpAuthUrl,
  };
}

export function verifyTotp(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps tolerance
  });
}

export async function generateBackupCodes(userId: string): Promise<string[]> {
  const codes: string[] = [];

  // Delete existing backup codes
  await prisma.mfaBackupCode.deleteMany({ where: { userId } });

  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    const hashed = await bcrypt.hash(code, 10);
    await prisma.mfaBackupCode.create({ data: { userId, code: hashed } });
    codes.push(code);
  }

  return codes;
}

export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const backupCodes = await prisma.mfaBackupCode.findMany({
    where: { userId, usedAt: null },
  });

  for (const bc of backupCodes) {
    const valid = await bcrypt.compare(code, bc.code);
    if (valid) {
      await prisma.mfaBackupCode.update({
        where: { id: bc.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }

  return false;
}
