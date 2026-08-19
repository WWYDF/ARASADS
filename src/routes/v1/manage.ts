import { UPLOAD_ROOT } from '../../core/constants';
import { FastifyPluginAsync } from 'fastify';
import fs from 'fs/promises';
import path from 'path';

const manage: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: fastify.authenticate }, async (req, reply) => {
    const owner = req.entry;
    if (!owner) { return reply.code(401).send({ error: 'This endpoint requires authorization.' }) };

    const asset = await fastify.prisma.asset.findUnique({ where: { id: req.params.id } });

    // 404 (not 403) for someone else's asset too, so existence of other users' assets isn't discoverable by id.
    if (!asset || asset.ownerId !== owner.id) { return reply.code(404).send({ error: 'Asset not found.' }) };

    const filePath = path.join(UPLOAD_ROOT, owner.id, `${asset.id}.${asset.extension}`);
    await fs.rm(filePath, { force: true }).catch((err) => fastify.log.error(err));

    await fastify.prisma.asset.delete({ where: { id: asset.id } });

    return reply.code(204).send();
  });
};

export default manage;
