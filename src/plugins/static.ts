import { appLogger } from '../plugins/logger';
import { FastifyPluginAsync } from 'fastify';
import staticPlugin from '@fastify/static';
import path from 'path';

const logger = appLogger('Routes');

const registerStatic: FastifyPluginAsync = async (fastify) => {
  fastify.register(staticPlugin, {
    root: path.resolve(process.cwd(), 'data/uploads/'),
    prefix: '/view/',
    setHeaders: (res, filePath) => {
      // Cache for 3 hours
      res.header('Cache-Control', 'public, max-age=10800, immutable');
    },
  });

  logger.info('[+] Static Route Initialized!');
};

export default registerStatic;