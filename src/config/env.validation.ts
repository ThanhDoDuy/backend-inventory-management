import Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().port().required(),
  MAX_TENANTS: Joi.number().integer().min(1).required(),
  MAX_USERS_PER_TENANT: Joi.number().integer().min(1).required(),
  MONGODB_URI: Joi.string().min(1).required(),
  REDIS_URL: Joi.string().min(1).required(),
  JWT_SECRET: Joi.string().min(1).required(),
  JWT_ACCESS_EXPIRES: Joi.string().min(1).required(),
  JWT_REFRESH_EXPIRES: Joi.string().min(1).required(),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .required(),
  LOG_FORMAT: Joi.string().valid('pretty', 'json').required(),
  LOG_SLOW_MS: Joi.number().integer().min(0).required(),
});
