import { Router } from 'express';
import { checkPassword, requireAuth, signToken } from '../auth';
import { httpError } from '../errors';
import { prisma } from '../prisma';
import { loginSchema, parseBody } from '../validate';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = parseBody(loginSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { username: body.username },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.active || !(await checkPassword(body.password, user.passwordHash))) {
      throw httpError(401, 'Username or password is incorrect');
    }
    const roles = user.roles.map((row) => row.role.name);
    const token = signToken({ uid: user.id, cid: user.companyId, sub: user.username, roles });
    await prisma.auditLog.create({
      data: { companyId: user.companyId, userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id },
    });
    res.json({
      token,
      user: { id: user.id, fullName: user.fullName, username: user.username, roles, companyId: user.companyId },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.uid },
      include: { roles: { include: { role: true } }, company: true },
    });
    if (!user || !user.active) throw httpError(401, 'Sign in required');
    res.json({
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      roles: user.roles.map((row) => row.role.name),
      companyId: user.companyId,
      companyName: user.company.tradeName,
    });
  } catch (error) {
    next(error);
  }
});
