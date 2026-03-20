import { z } from 'zod';

// ─── Base Service Config Schema ───────────────────────────────────────────────

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export const parseBaseEnv = (): BaseEnv => {
  const result = baseEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
};

// ─── ESLint Config ────────────────────────────────────────────────────────────

export const eslintConfig = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};

// ─── TSConfig Base ────────────────────────────────────────────────────────────

export const tsConfigBase = {
  compilerOptions: {
    target: 'ES2022',
    module: 'commonjs',
    lib: ['ES2022'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    outDir: 'dist',
    baseUrl: '.',
    paths: {
      '@comms/db': ['../../packages/db/src'],
      '@comms/types': ['../../packages/types/src'],
      '@comms/utils': ['../../packages/utils/src'],
      '@comms/logger': ['../../packages/logger/src'],
      '@comms/events': ['../../packages/events/src'],
      '@comms/config': ['../../packages/config/src'],
    },
  },
  exclude: ['node_modules', 'dist'],
};
