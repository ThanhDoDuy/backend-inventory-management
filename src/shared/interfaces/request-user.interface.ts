import { Role } from '../constants/roles.enum';

export interface RequestUser {
  userId: string;
  tenantId: string;
  email: string;
  role: Role;
  username: string;
}
