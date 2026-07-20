import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

export * from './document-template';
export * from './format';
export { PDF_COLORS, pdfStyles } from './theme';

/**
 * PDF rendering.
 *
 * `server-only`: the renderer is a large dependency with Node bindings and has
 * no business in a client bundle. Documents are produced on the server and
 * streamed or stored.
 */

/** Render a document to a Buffer, for storing or attaching to an email. */
export async function renderPdfToBuffer(element: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(element);
}

/**
 * Render a document as an HTTP response.
 *
 * `filename` reaches a `Content-Disposition` header, so quotes and newlines are
 * stripped — an unescaped filename there is a header-injection hole.
 */
export async function renderPdfResponse(
  element: ReactElement<DocumentProps>,
  filename: string,
  { download = true }: { download?: boolean } = {},
): Promise<Response> {
  const buffer = await renderPdfToBuffer(element);
  const safeFilename = filename.replace(/["\\\r\n]/g, '').slice(0, 120) || 'document.pdf';

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeFilename}"`,
      // Financial documents are per-tenant and can be regenerated; a shared
      // cache holding one is a cross-tenant leak waiting to happen.
      'Cache-Control': 'private, no-store',
    },
  });
}
