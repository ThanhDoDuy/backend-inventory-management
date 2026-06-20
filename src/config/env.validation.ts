import Joi from 'joi';
import { validateCorsOriginsString } from './cors.util';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
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
  RESEND_API_KEY: Joi.string().optional().allow(''),
  EMAIL_FROM: Joi.string().optional().allow(''),
  FRONTEND_URL: Joi.string().uri().optional(),
  PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().integer().min(1).max(60).default(15),
  CLOUDINARY_CLOUD_NAME: Joi.string().optional().allow(''),
  CLOUDINARY_API_KEY: Joi.string().optional().allow(''),
  CLOUDINARY_API_SECRET: Joi.string().optional().allow(''),
  CLOUDINARY_FOLDER_PREFIX: Joi.string().default('poos'),
  CORS_ORIGIN: Joi.string()
    .optional()
    .allow('')
    .custom((value: string | undefined, helpers) => {
      if (value === undefined || value === '') {
        return value;
      }

      const error = validateCorsOriginsString(value);
      if (error) {
        return helpers.error('cors.invalid', { message: error });
      }

      return value;
    })
    .messages({
      'cors.invalid': '{{#message}}',
    }),
});
