import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestContextService } from '../../../infrastructure/logger/request-context.service';
import { JwtPayload } from '../../../shared/interfaces/jwt-payload.interface';
import { RequestUser } from '../../../shared/interfaces/request-user.interface';
import { UserStatus } from '../../../shared/constants/roles.enum';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly requestContext: RequestContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (!payload.tenant_id) {
      throw new UnauthorizedException('Tenant context missing in token');
    }

    const user = await this.userModel.findById(payload.sub);
    if (!user || user.is_deleted || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not found or disabled');
    }

    if (user.tenant_id.toString() !== payload.tenant_id) {
      throw new UnauthorizedException('Tenant mismatch');
    }

    this.requestContext.setUser(
      user.tenant_id.toString(),
      user._id.toString(),
    );

    return {
      userId: user._id.toString(),
      tenantId: user.tenant_id.toString(),
      email: user.email,
      role: user.role,
      username: user.username,
    };
  }
}
