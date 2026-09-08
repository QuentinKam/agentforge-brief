// JWT 签发与校验工具
import jwt, { type SignOptions } from 'jsonwebtoken';
import 'dotenv/config';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: { sub: string; email: string }): string {
  // jsonwebtoken v9 的 SignOptions.expiresIn 期望 ms 的 StringValue 子类型，
  // 实际值（'7d'）兼容；此处显式断言以避免 string 不可赋值给 StringValue
  const opts: SignOptions = {
    expiresIn: EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, SECRET) as unknown as JwtPayload;
  return decoded;
}

export function extractBearer(authHeader: string | undefined | null): string | null {
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  return authHeader.slice(7).trim();
}
