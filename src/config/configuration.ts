export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  maxTenants: parseInt(process.env.MAX_TENANTS ?? '20', 10),
  maxUsersPerTenant: parseInt(process.env.MAX_USERS_PER_TENANT ?? '20', 10),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/inventory',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },
});
