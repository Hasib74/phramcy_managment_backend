import { z } from 'zod';

export const registerOrgSchema = z.object({
  organizationName: z.string().min(2, 'Organization name is required'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  businessType: z.enum([
    'SMALL_PHARMACY',
    'RETAIL_PHARMACY',
    'WHOLESALE_PHARMACY',
    'PHARMACY_ONLINE',
    'PHARMACY_CHAIN',
    'ENTERPRISE_GROUP'
  ]).default('RETAIL_PHARMACY'),
  ownerName: z.string().min(2, 'Owner name is required'),
  ownerEmail: z.string().email('Invalid email address'),
  ownerPhone: z.string().min(6, 'Owner phone is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  branchName: z.string().default('Main Branch'),
  currency: z.string().default('BDT'),
  addressCity: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  organizationSlug: z.string().optional() // Optional if email is unique or super admin
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});
