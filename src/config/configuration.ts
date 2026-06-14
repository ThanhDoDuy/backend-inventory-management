export default () => ({
  port: parseInt(process.env.PORT!, 10),
  maxTenants: parseInt(process.env.MAX_TENANTS!, 10),
  maxUsersPerTenant: parseInt(process.env.MAX_USERS_PER_TENANT!, 10),
  mongodbUri: process.env.MONGODB_URI!,
  redisUrl: process.env.REDIS_URL!,
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
});
