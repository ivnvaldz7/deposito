export interface JwtPayload {
    sub: string;
    role: string;
    name: string;
}
export interface RefreshTokenPayload {
    sub: string;
    type: 'refresh';
}
export declare function signToken(payload: JwtPayload): string;
export declare function signRefreshToken(userId: string): string;
export declare function verifyToken(token: string): JwtPayload;
export declare function verifyRefreshToken(token: string): RefreshTokenPayload;
//# sourceMappingURL=jwt.d.ts.map