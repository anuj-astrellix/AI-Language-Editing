import pino from 'pino';

export const logger = pino({
  name: 'ai-language-editor',
  level: process.env.LOG_LEVEL ?? 'info'
});
