import { FastifyPluginAsync } from 'fastify';
import { appLogger } from '../../plugins/logger';
import hello from './hello';

const logger = appLogger('Routes');

const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(hello, { prefix: '/hello' });

  logger.info('[+] Routes v1 Initialized!');
};

export default v1Routes;