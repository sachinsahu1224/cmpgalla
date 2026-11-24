import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { httpError } from './errors';

export type AuthUser = {
  uid: number;
  cid: number;
  sub: string;
  roles: string[];
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required');
  }
  return 'galla-dev-secret-change-me';
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, jwtSecret(), { expiresIn: '12h' });
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function checkPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    next(httpError(401, 'Sign in required'));
    return;
  }
  try {
    req.user = jwt.verify(token, jwtSecret()) as AuthUser;
    next();
  } catch {
    next(httpError(401, 'Sign in required'));
  }
}

export function requireWriter(req: Request, _res: Response, next: NextFunction) {
  const roles = req.user?.roles ?? [];
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('ADMIN')) {
    next(httpError(403, 'You do not have permission to change this'));
    return;
  }
  next();
}
