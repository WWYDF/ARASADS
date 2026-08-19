import 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      id: string;
    };
    entry?: {
      id: string;
      username: string;
    };
  }
}