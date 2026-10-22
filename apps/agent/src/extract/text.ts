export function extractPlainText(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/^﻿/, '');
}
