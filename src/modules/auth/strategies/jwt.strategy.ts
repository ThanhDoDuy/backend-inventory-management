import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestContextService } from '../../../infrastructure/logger/request-context.service';
import { AppError, ERRORS } from '../../../shared/errors';
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
      throw new AppError(ERRORS.AUTH.TENANT_CONTEXT_MISSING);
    }

    if (!payload.role_id) {
      throw new AppError(ERRORS.AUTH.INVALID_TOKEN);
    }

    const user = await this.userModel.findById(payload.sub);
    if (!user || user.is_deleted || user.status !== UserStatus.ACTIVE) {
      throw new AppError(ERRORS.AUTH.USER_NOT_FOUND_OR_DISABLED);
    }

    if (user.tenant_id.toString() !== payload.tenant_id) {
      throw new AppError(ERRORS.AUTH.TENANT_MISMATCH);
    }

    if (user.role_id.toString() !== payload.role_id) {
      throw new AppError(ERRORS.AUTH.INVALID_TOKEN);
    }

    this.requestContext.setUser(
      user.tenant_id.toString(),
      user._id.toString(),
    );

    return {
      userId: user._id.toString(),
      tenantId: user.tenant_id.toString(),
      email: user.email,
      roleId: user.role_id.toString(),
      username: user.username,
    };
  }
}
