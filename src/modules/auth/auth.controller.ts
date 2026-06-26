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

  async resendOtp(req: Request, res: Response) {
    const result = await authService.resendRegisterOtp(req.body.phone);
    res.json(ok({ message: 'Verification code sent', ...result }));
  },

  async verifyOtp(req: Request, res: Response) {
    const { phone, otp } = req.body as { phone: string; otp: string };
    res.json(ok(await authService.verifyRegisterOtp(phone, otp)));
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

  async changePin(req: Request, res: Response) {
    if (!req.auth) throw Unauthorized();
    await authService.changePin(req.auth.sub, req.body.currentPin, req.body.newPin);
    res.json(ok({ message: 'PIN updated' }));
  },

  async verifyPin(req: Request, res: Response) {
    if (!req.auth) throw Unauthorized();
    await authService.verifyPin(req.auth.sub, req.body.pin);
    res.json(ok({ valid: true }));
  },

  async requestPinReset(req: Request, res: Response) {
    const result = await authService.requestPinReset(req.body.phone);
    res.status(201).json(ok({ message: 'Verification code sent', ...result }));
  },

  async confirmPinReset(req: Request, res: Response) {
    await authService.confirmPinReset(req.body);
    res.json(ok({ message: 'PIN updated' }));
  },
};
