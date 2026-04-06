import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
export declare function requireRole(...roles: string[]): (req: AuthRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=require-role.d.ts.map