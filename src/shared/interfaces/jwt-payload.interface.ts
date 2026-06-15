export interface JwtPayload {
  sub: string;
  tenant_id: string;
  email: string;
  role_id: string;
}
