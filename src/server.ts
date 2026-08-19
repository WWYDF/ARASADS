import Fastify, { LogController } from 'fastify';
import routeLogger from './plugins/logger';
import prismaPlugin from './plugins/prisma';
import registerStatic from './plugins/static';
import chalk from 'chalk';
import fastifyJWT from '@fastify/jwt';
import cors from '@fastify/cors'
import v1Routes from './routes/v1';

const fastify = Fastify({
  logger: {
    level: 'error',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
    hooks: {
      logMethod (args, method) {
        // Suppress 'Server listening at...' messages
        // if (args[0]?.includes?.('Server listening at')) return
        method.apply(this, args)
      }
    },
  },
  logController: new LogController({
    disableRequestLogging: true
  })
});

const start = async () => {
  console.clear();
  try {
    // JWT Setup
    await fastify.register(fastifyJWT, {
      secret: process.env.JWT_SECRET || 'super-secret' // use env in prod!
    });

    await fastify.register(cors, {
      origin: (origin, cb) => {
        // Accept any origin and echo it back — as long as it's defined (browser request)
        if (origin) {
          cb(null, origin); // echo origin back = "fake *"
        } else {
          cb(null, true); // SSR, curl, etc.
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    // Auth middleware for authenticating servers.
    fastify.decorate(
      'authenticate',
      async function (request, reply) {
        try {
          await request.jwtVerify();
          const entry = await fastify.prisma.user.findUnique({
            where: { id: request.user.id },
            select: { id: true, username: true },
          });

          if (!entry) throw new Error('No entry');

          request.entry = entry;
        } catch (e) {
          reply.code(401).send({ error: `This endpoint requires authorization.` });
        }
      }
    )


    await fastify.register(routeLogger);
    await fastify.register(prismaPlugin);
    await fastify.register(registerStatic);
    await fastify.register(v1Routes, { prefix: '/v1' });

    // Health check route
    fastify.get('/health', async () => ({ ok: true }));

    const PORT = Number(process.env.SERVER_PORT || 12290);

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log('');
    console.log(chalk.greenBright(`[>] Server Startup Completed. (Port ${PORT})`));
    console.log('');

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();