'use client';

import { CheckCircle2, Loader2, Paperclip, TriangleAlert, Upload, X } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from '@/lib/storage/provider';
import { cn } from '@/lib/utils';

import { presignUploadAction } from '../storage.actions';

export interface UploadedFile {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

interface Props {
  /** Key prefix, e.g. `documents` or `receipts`. */
  scope: string;
  onUploaded: (file: UploadedFile) => void;
  accept?: readonly string[];
  disabled?: boolean;
  className?: string;
  /** Allow picking/dropping several files at once; each still gets its own presign + PUT, and `onUploaded` fires once per file as it lands. */
  multiple?: boolean;
}

type Status = 'idle' | 'signing' | 'uploading' | 'done' | 'error';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Direct-to-storage upload.
 *
 * The bytes never touch the Next.js server: it asks for a presigned URL, then
 * PUTs straight to storage. Routing a 25 MB file through a Server Action would
 * buffer it in server memory and hit the body-size limit.
 *
 * XMLHttpRequest rather than fetch — deliberately. `fetch` still cannot report
 * upload progress, and a file upload with no progress bar is indistinguishable
 * from a hang.
 */
export function FileUpload({
  scope,
  onUploaded,
  accept = ALLOWED_UPLOAD_MIME_TYPES,
  disabled = false,
  className,
  multiple = false,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setStatus('idle');
    setProgress(0);
    setError(null);
    setFilename(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setFilename(file.name);
      setError(null);
      setProgress(0);

      // Checked here for a fast, friendly failure; the server checks again
      // because this one is trivially bypassed.
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus('error');
        setError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
        return;
      }

      setStatus('signing');

      const signed = await presignUploadAction({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentLength: file.size,
        scope,
      });

      if (!signed.success) {
        setStatus('error');
        setError(signed.error.message);
        return;
      }

      setStatus('uploading');

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.open('PUT', signed.data.url);

          for (const [header, value] of Object.entries(signed.data.headers)) {
            xhr.setRequestHeader(header, value);
          }

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100));
            }
          });

          xhr.addEventListener('load', () => {
            // S3 answers 200; the local provider answers 200 with JSON. Anything
            // 2xx means the bytes landed.
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Storage rejected the upload (${xhr.status}).`));
          });

          xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
          xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

          xhr.send(file);
        });

        setStatus('done');
        setProgress(100);

        // Reported only after the bytes are stored — telling the caller earlier
        // would let them save a key pointing at nothing.
        onUploaded({
          key: signed.data.key,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        });
      } catch (uploadError) {
        setStatus('error');
        setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
      } finally {
        xhrRef.current = null;
      }
    },
    [onUploaded, scope],
  );

  // Sequential, not Promise.all — keeps the single progress slot honest about
  // which file it's describing, and a stalled upload doesn't fan out into a
  // pile of concurrent requests against the presign endpoint.
  const uploadAll = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await upload(file);
      }
    },
    [upload],
  );

  const handleFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = Array.from(incoming);
      const [first] = files;
      if (!first) return;
      if (multiple) void uploadAll(files);
      else void upload(first);
    },
    [multiple, upload, uploadAll],
  );

  const isBusy = status === 'signing' || status === 'uploading';

  return (
    <div className={cn('space-y-3', className)}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !isBusy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled || isBusy) return;
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-6 py-8 text-center transition-colors',
          isDragging && 'border-primary bg-primary/5',
          (disabled || isBusy) && 'cursor-not-allowed opacity-60',
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-foreground">
          Drop {multiple ? 'files' : 'a file'} here, or <span className="text-primary">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">Up to {formatBytes(MAX_UPLOAD_BYTES)} each</span>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept.join(',')}
          disabled={disabled || isBusy}
          multiple={multiple}
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
          }}
        />
      </label>

      {filename && status !== 'idle' && (
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{filename}</p>

            {status === 'uploading' && (
              <Progress value={progress} className="mt-2 h-1.5" aria-label={`Uploading: ${progress}%`} />
            )}
            {status === 'signing' && <p className="mt-1 text-xs text-muted-foreground">Preparing...</p>}
            {status === 'error' && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          {isBusy && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
          {status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />}
          {status === 'error' && <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />}

          <Button type="button" variant="ghost" size="icon-xs" onClick={reset} aria-label="Remove file">
            <X aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
