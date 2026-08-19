// The default template of sorts lol

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../plugins/prisma';

const hello: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {

    return reply.status(200).send('hello!');
  });
};

export default hello;
