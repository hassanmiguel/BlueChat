import { Router, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest, prisma } from '../middleware/auth.js';
import { canViewChannel } from '../middleware/authz.js';

export const uploadRouter = Router();

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
const privateUploadDir = path.resolve(process.cwd(), process.env.PRIVATE_UPLOAD_DIR || './private-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(privateUploadDir, { recursive: true });

const allowedTypes: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'audio/mpeg': ['mp3'],
  'audio/mp3': ['mp3'],
  'audio/ogg': ['ogg'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/webm': ['weba', 'webm'],
  'application/pdf': ['pdf'],
  'text/plain': ['txt', 'md', 'csv'],
  'application/zip': ['zip'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extensions = allowedTypes[file.mimetype] || [];
    const extension = (file.originalname.split('.').pop() || '').toLowerCase();
    callback(null, `${crypto.randomUUID()}.${extensions.includes(extension) ? extension : extensions[0] || 'bin'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = (file.originalname.split('.').pop() || '').toLowerCase();
    const extensions = allowedTypes[file.mimetype];
    if (!extensions) return callback(new Error('Unsupported file type'));
    if (!extensions.includes(extension)) return callback(new Error('File extension does not match its type'));
    callback(null, true);
  },
});

const magicMatches = (filePath: string, mime: string): boolean => {
  const buffer = Buffer.alloc(512);
  const fd = fs.openSync(filePath, 'r');
  const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);
  const data = buffer.subarray(0, bytes);
  const ascii = (offset: number, value: string) => data.subarray(offset, offset + value.length).toString('ascii') === value;

  switch (mime) {
    case 'image/jpeg': return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/png': return ascii(1, 'PNG');
    case 'image/gif': return ascii(0, 'GIF87a') || ascii(0, 'GIF89a');
    case 'image/webp': return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'video/mp4': return ascii(4, 'ftyp');
    case 'video/webm':
    case 'audio/webm': return data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
    case 'audio/mpeg':
    case 'audio/mp3': return ascii(0, 'ID3') || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
    case 'audio/ogg': return ascii(1, 'OggS');
    case 'audio/wav':
    case 'audio/x-wav': return ascii(0, 'RIFF') && ascii(8, 'WAVE');
    case 'application/pdf': return ascii(0, '%PDF');
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
    case 'text/plain':
      return data.every((byte) => byte === 0 || byte >= 9 && byte <= 13 || byte >= 32 && byte <= 126 || byte >= 128);
    default:
      return data.length > 0;
  }
};

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, try again later' },
});


uploadRouter.get('/private/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.privateUpload.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'File not found' });

    let allowed = item.ownerId === req.userId;
    const url = `/api/upload/private/${item.id}`;
    if (!allowed) {
      const attachment = await prisma.attachment.findFirst({
        where: { url: { endsWith: url } },
        include: { message: { select: { channelId: true } } },
      });
      if (attachment) allowed = await canViewChannel(req.userId!, attachment.message.channelId);
    }
    if (!allowed) {
      const dmAttachment = await prisma.dmAttachment.findFirst({
        where: { url },
        include: { message: { select: { dmId: true } } },
      });
      if (dmAttachment) {
        const participant = await prisma.directMessageParticipant.findUnique({
          where: { dmId_userId: { dmId: dmAttachment.message.dmId, userId: req.userId! } },
          select: { id: true },
        });
        allowed = Boolean(participant);
      }
    }
    if (!allowed) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(privateUploadDir, path.basename(item.storageKey));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', item.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(item.originalName)}`);
    return res.sendFile(filePath);
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

uploadRouter.post('/', authenticate, uploadLimiter, async (req: AuthRequest, res: Response) => {
  upload.single('file')(req, res, (error: any) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (25 MB limit)'
        : error.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received' });

    if (!magicMatches(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File content does not match its declared type' });
    }

    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const uploadField = String(req.get('X-Upload-Field') || 'file');
    if (uploadField === 'file') {
      const id = crypto.randomUUID();
      const storageKey = req.file.filename;
      const destination = path.join(privateUploadDir, storageKey);
      try {
        fs.renameSync(req.file.path, destination);
        await prisma.privateUpload.create({
          data: {
            id,
            ownerId: req.userId!,
            storageKey,
            originalName: path.basename(req.file.originalname).slice(0, 255),
            mimeType: req.file.mimetype,
            size: req.file.size,
          },
        });
      } catch (error) {
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
        return res.status(500).json({ error: 'Could not store private upload' });
      }
      return res.status(201).json({
        url: `${base}/api/upload/private/${id}`,
        type: req.file.mimetype,
        size: req.file.size,
        name: path.basename(req.file.originalname),
        private: true,
      });
    }

    return res.status(201).json({
      url: `${base}/uploads/${req.file.filename}`,
      type: req.file.mimetype,
      size: req.file.size,
      name: path.basename(req.file.originalname),
    });
  });
});
