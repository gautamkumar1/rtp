import multer from 'multer'
import path from 'path'
import os from 'os'
import type { Request } from 'express'

const MAX_SIZE_BYTES = parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '500') * 1024 * 1024

export const uploadMiddleware = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req: Request, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    const mime = file.mimetype
    const validMime =
      mime === 'application/zip' ||
      mime === 'application/x-zip-compressed' ||
      mime === 'application/octet-stream'
    if (ext !== '.zip' || !validMime) {
      cb(new Error('Only .zip files are accepted'))
      return
    }
    cb(null, true)
  },
}).single('file')
