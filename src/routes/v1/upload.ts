import { FastifyPluginAsync } from 'fastify';
import busboy from 'busboy';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { MediaType } from '../../../prisma/client';
import { isImageMimeType, optimizeImage } from '../../core/images';
import { isVideoMimeType } from '../../core/videos';
import { TMP_DIR, UPLOAD_ROOT } from '../../core/constants';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 200) * 1024 * 1024;

function mediaTypeFor(mimeType: string, extension: string): MediaType | null {
  if (isImageMimeType(mimeType)) return 'IMAGE';
  if (isVideoMimeType(mimeType)) return 'VIDEO';
  if (mimeType === 'text/markdown' || extension === 'md' || extension === 'markdown') return 'MARKDOWN';
  if (mimeType.startsWith('text/')) return 'TEXT';
  return null;
}

// Strips path separators/control chars so the original name is safe to store
// and display; it's never used to build a filesystem path (the asset id is).
function sanitizeBaseName(name: string): string {
  const cleaned = name.replace(/[/\\\0]/g, '_').replace(/[\x00-\x1f]/g, '').trim();
  return cleaned.slice(0, 200) || 'file';
}

const upload: FastifyPluginAsync = async (fastify) => {
  // Multipart bodies aren't parsed by Fastify by default; hand the raw
  // stream through untouched so busboy can read it in the handler.
  fastify.addContentTypeParser('multipart/form-data', (_request, payload, done) => {
    done(null, payload);
  });

  fastify.post<{ Querystring: { optimize?: string } }>('/', { preHandler: fastify.authenticate }, async (req, reply) => {
    const optimize = req.query.optimize === 'true';
    const owner = req.entry;
    if (!owner) {
      return reply.code(401).send({ error: 'This endpoint requires authorization.' });
    }

    await fs.mkdir(TMP_DIR, { recursive: true });

    type FileResult =
      | { ok: true; tempPath: string; originalName: string; mimeType: string; sizeBytes: number }
      | { ok: false; status: number; error: string };

    const result = await new Promise<FileResult>((resolve) => {
      let settled = false;
      const settle = (value: FileResult) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const bb = busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
      });

      let sawFile = false;
      let tempPath: string | null = null;

      bb.on('file', (_name, stream, info) => {
        sawFile = true;
        const { filename, mimeType } = info;
        tempPath = path.join(TMP_DIR, `${randomUUID()}.part`);
        const writeStream = createWriteStream(tempPath);
        let sizeBytes = 0;
        let truncated = false;

        stream.on('data', (chunk: Buffer) => {
          sizeBytes += chunk.length;
        });
        stream.on('limit', () => {
          truncated = true;
        });

        stream.pipe(writeStream);

        writeStream.on('close', () => {
          if (truncated) {
            fs.rm(tempPath!, { force: true }).finally(() =>
              settle({ ok: false, status: 413, error: 'File exceeds maximum upload size.' })
            );
            return;
          }
          settle({ ok: true, tempPath: tempPath!, originalName: filename, mimeType, sizeBytes });
        });

        writeStream.on('error', () => {
          fs.rm(tempPath!, { force: true }).finally(() =>
            settle({ ok: false, status: 500, error: 'Failed to store upload.' })
          );
        });
      });

      bb.on('error', () => {
        settle({ ok: false, status: 400, error: 'Malformed upload.' });
      });

      bb.on('close', () => {
        if (!sawFile) {
          settle({ ok: false, status: 400, error: 'No file provided.' });
        }
      });

      req.raw.pipe(bb);
    });

    if (result.ok === false) {
      return reply.code(result.status).send({ error: result.error });
    }

    const extension = path.extname(result.originalName).slice(1).toLowerCase();
    const type = mediaTypeFor(result.mimeType, extension);

    if (!type) {
      await fs.rm(result.tempPath, { force: true });
      return reply.code(415).send({ error: `Unsupported file type: ${result.mimeType}` });
    }

    const baseName = sanitizeBaseName(path.basename(result.originalName, path.extname(result.originalName)));

    let finalTempPath = result.tempPath;
    let finalSizeBytes = result.sizeBytes;
    let finalExtension = extension;

    if (optimize && type === 'IMAGE') {
      const optimizedPath = path.join(TMP_DIR, `${randomUUID()}.opt.webp`);
      const optimized = await optimizeImage(result.tempPath, optimizedPath, extension);

      if (optimized) {
        await fs.rm(result.tempPath, { force: true });
        finalTempPath = optimizedPath;
        finalSizeBytes = (await fs.stat(optimizedPath)).size;
        finalExtension = 'webp';
      }
      // else: sharp couldn't handle this format — fall back to the original upload.
    }

    const asset = await fastify.prisma.asset.create({
      data: {
        filename: baseName,
        extension: finalExtension,
        sizeBytes: finalSizeBytes,
        type,
        ownerId: owner.id,
      },
    });

    const destDir = path.join(UPLOAD_ROOT, owner.id);
    const destPath = path.join(destDir, `${asset.id}.${finalExtension}`);

    try {
      await fs.mkdir(destDir, { recursive: true });
      await fs.rename(finalTempPath, destPath);
    } catch (err) {
      await fastify.prisma.asset.delete({ where: { id: asset.id } }).catch(() => {});
      await fs.rm(finalTempPath, { force: true });
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to store upload.' });
    }

    return reply.code(201).send({
      id: asset.id,
      filename: asset.filename,
      extension: asset.extension,
      sizeBytes: asset.sizeBytes,
      type: asset.type,
      url: `/view/${owner.id}/${asset.id}.${asset.extension}`,
    });
  });
};

export default upload;
