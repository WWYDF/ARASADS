import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';

type Credentials = { username: string; password: string };

const auth: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Credentials }>('/register', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    const existing = await fastify.prisma.user.findUnique({ where: { username } });
    if (existing) {
      return reply.code(409).send({ error: 'Username already taken' });
    }

    const passHash = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: { username, passHash },
      select: { id: true, username: true },
    });

    return reply.code(201).send(user);
  });

  fastify.post<{ Body: Credentials }>('/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    const user = await fastify.prisma.user.findUnique({ where: { username } });
    const valid = await bcrypt.compare(password, user?.passHash ?? process.env.JWT_SECRET);

    if (!user || !valid) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    const token = fastify.jwt.sign({ id: user.id });
    return reply.send({ token });
  });
};

export default auth;
