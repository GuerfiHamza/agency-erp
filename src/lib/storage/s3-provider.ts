import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { serverEnv } from '@/config/env';

import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type PresignedUpload,
  type StorageProvider,
  type StoredObject,
} from './provider';

/** Production storage. Also drives S3-compatible services via `S3_ENDPOINT`. */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  private readonly client: S3Client;

  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: serverEnv.S3_REGION ?? 'us-east-1',
      ...(serverEnv.S3_ENDPOINT
        ? {
            endpoint: serverEnv.S3_ENDPOINT,
            // MinIO and most S3 clones cannot do virtual-hosted-style addressing.
            forcePathStyle: true,
          }
        : {}),
      ...(serverEnv.S3_ACCESS_KEY_ID && serverEnv.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: serverEnv.S3_ACCESS_KEY_ID,
              secretAccessKey: serverEnv.S3_SECRET_ACCESS_KEY,
            },
          }
        : // No explicit keys: fall back to the default provider chain, which is
          // how IAM roles work on ECS/EC2. Better than requiring long-lived keys.
          {}),
    });
  }

  async presignUpload({
    key,
    contentType,
    contentLength,
  }: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      // Signed in, so the browser cannot substitute a different type or a
      // larger body than the one we authorised — S3 rejects the mismatch.
      ContentLength: contentLength,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

    return {
      url,
      key,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  async presignDownload({
    key,
    expiresInSeconds = DOWNLOAD_URL_TTL_SECONDS,
    download = false,
  }: {
    key: string;
    expiresInSeconds?: number;
    download?: boolean;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(download ? { ResponseContentDisposition: 'attachment' } : {}),
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async read(key: string): Promise<StoredObject> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));

    if (!response.Body) throw new Error(`S3 object has no body: ${key}`);

    const bytes = await response.Body.transformToByteArray();

    return { body: Buffer.from(bytes), contentType: response.ContentType ?? 'application/octet-stream' };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      // HeadObject throws NotFound rather than returning a flag.
      return false;
    }
  }
}
