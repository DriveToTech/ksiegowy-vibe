import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { readFile } from '../../services/storage/local-fs.js';

// ── JSON Schema definitions ─────────────────────────────────────────────────

const fileParamsSchema = {
  type: 'object',
  properties: {
    fileId: { type: 'string', minLength: 1 }
  },
  required: ['fileId']
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface FileParams {
  fileId: string;
}

// ── MIME → Content-Disposition mapping ───────────────────────────────────────

const INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

const dispositionFor = (mimeType: string, filename: string): string => {
  const disposition = INLINE_MIME_TYPES.has(mimeType) ? 'inline' : 'attachment';
  // Escape quotes in filename for safety
  const safeFilename = filename.replace(/"/g, '\\"');
  return `${disposition}; filename="${safeFilename}"`;
};

const filenameFromRecord = (record: {
  relativePath: string;
  mimeType: string;
  type: string;
}): string => {
  // Extract the UUID filename from the relative path, e.g. "companyId/outgoing/2026/03/uuid.pdf"
  const parts = record.relativePath.split('/');
  return parts[parts.length - 1] ?? `file.${record.mimeType.split('/')[1] ?? 'bin'}`;
};

// ── Plugin ───────────────────────────────────────────────────────────────────

export const fileServeRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /files/:fileId
   * Authenticated file streaming. The caller must be a member of the company
   * that owns the file. The companyId ownership check is enforced by readFile().
   *
   * We resolve the owning company from the FileRecord itself, then verify the
   * authenticated user is a member of that company before serving the bytes.
   */
  fastify.get<{ Params: FileParams }>(
    '/files/:fileId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: fileParamsSchema
        // No response schema — binary response; Fastify serialisation is bypassed
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { fileId } = request.params;

      // Look up the record first to identify the owning company
      const record = await fastify.prisma.fileRecord.findUnique({
        where: { id: fileId }
      });

      if (!record) {
        throw fastify.httpErrors.notFound('File not found');
      }

      // Enforce company membership — this is the security boundary
      const membership = user.companies.find((c) => c.id === record.companyId);
      if (!membership) {
        // Return 404 rather than 403 to avoid leaking existence of other companies' files
        throw fastify.httpErrors.notFound('File not found');
      }

      // Read the file bytes; readFile() performs its own companyId guard as a second check
      let fileData;
      try {
        fileData = await readFile(fastify.prisma, fileId, record.companyId);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404) throw fastify.httpErrors.notFound('File missing from storage');
        if (statusCode === 403) throw fastify.httpErrors.notFound('File not found');
        throw err;
      }

      const filename = filenameFromRecord(fileData.record);
      const disposition = dispositionFor(fileData.record.mimeType, filename);

      reply
        .header('Content-Type', fileData.record.mimeType)
        .header('Content-Disposition', disposition)
        .header('Content-Length', fileData.data.length)
        .header('Cache-Control', 'private, no-store');

      return reply.send(fileData.data);
    }
  );
};
