import { Role } from '../constants/roles.enum';

export interface JwtPayload {
  sub: string;
  tenant_id: string;
  email: string;
  role: Role;
}
