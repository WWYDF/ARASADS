import { FastifyPluginAsync } from 'fastify';
import { appLogger } from '../../plugins/logger';
import hello from './hello';
import auth from './auth';
import upload from './upload';

const logger = appLogger('Routes');

const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });
  fastify.register(auth, { prefix: '/auth' });
  fastify.register(upload, { prefix: '/upload' });

  logger.info('[+] Routes v1 Initialized!');
};

export default v1Routes;