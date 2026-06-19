import { parseCorsOrigins } from './cors.util';

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT!, 10),
  maxTenants: parseInt(process.env.MAX_TENANTS!, 10),
  maxUsersPerTenant: parseInt(process.env.MAX_USERS_PER_TENANT!, 10),
  mongodbUri: process.env.MONGODB_URI!,
  redisUrl: process.env.REDIS_URL!,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessExpires: process.env.JWT_ACCESS_EXPIRES!,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES!,
  },
  log: {
    level: process.env.LOG_LEVEL!,
    format: process.env.LOG_FORMAT!,
    slowMs: parseInt(process.env.LOG_SLOW_MS!, 10),
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  passwordReset: {
    expiresMinutes: parseInt(
      process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? '15',
      10,
    ),
  },
});
