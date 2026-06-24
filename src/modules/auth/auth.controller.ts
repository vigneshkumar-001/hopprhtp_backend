import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';

export const authController = {
  async requestOtp(req: Request, res: Response) {
    const result = await authService.requestRegisterOtp(req.body);
    res.status(201).json(ok({ message: 'Verification code sent', ...result }));
  },

  async confirmRegister(req: Request, res: Response) {
    const { user, tokens } = await authService.confirmRegister(req.body);
    res.status(201).json(ok({ user: user.toJSON(), ...tokens }));
  },

  async login(req: Request, res: Response) {
    const { user, tokens } = await authService.login(req.body);
    res.json(ok({ user: user.toJSON(), ...tokens }));
  },

  async refresh(req: Request, res: Response) {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.json(ok(tokens));
  },

  async logoutAll(req: Request, res: Response) {
    if (!req.auth) throw Unauthorized();
    await authService.logoutAll(req.auth.sub);
    res.json(ok({ message: 'Signed out of all devices' }));
  },
};
