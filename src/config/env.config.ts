import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  API_PREFIX: z.string().default('/api/v1'),
  
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform((val) => parseInt(val, 10)).default('5432'),
  DB_NAME: z.string().default('medical_inventory_db'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z.string().transform((val) => val === 'true').default('false'),
  DB_MAX_POOL: z.string().transform((val) => parseInt(val, 10)).default('20'),
  DB_IDLE_TIMEOUT_MS: z.string().transform((val) => parseInt(val, 10)).default('30000'),
  DB_CONN_TIMEOUT_MS: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  
  JWT_SECRET: z.string().default('super_secret_jwt_key_change_in_production_3984729384729384'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().default('super_secret_refresh_jwt_key_9823749823749823'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_SALT_ROUNDS: z.string().transform((val) => parseInt(val, 10)).default('10'),
  
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.string().transform((val) => parseInt(val, 10)).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform((val) => parseInt(val, 10)).default('1000')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
