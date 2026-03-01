import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service implements OnModuleInit {
  private client!: S3Client;
  private recordingsBucket!: string;
  private transcriptsBucket!: string;
  private localMode = false;
  private localStorageDir = '';

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const storageProvider = (this.configService.get<string>('STORAGE_PROVIDER') || '').trim().toLowerCase();
    this.localMode = storageProvider === 'local';
    this.localStorageDir =
      this.configService.get<string>('LOCAL_STORAGE_DIR') || path.resolve(process.cwd(), '.local/storage');

    this.recordingsBucket = this.configService.get<string>('S3_BUCKET_RECORDINGS') || '';
    this.transcriptsBucket = this.configService.get<string>('S3_BUCKET_TRANSCRIPTS') || '';

    if (this.localMode) {
      return;
    }

    const region = this.configService.get<string>('AWS_REGION');
    const endpoint =
      this.configService.get<string>('S3_ENDPOINT') ||
      this.configService.get<string>('AWS_ENDPOINT_URL_S3') ||
      this.configService.get<string>('AWS_LOCALSTACK_ENDPOINT');
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') || this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') || this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const forcePathStyleRaw =
      this.configService.get<string>('S3_FORCE_PATH_STYLE') ||
      (endpoint && endpoint.includes('localhost') ? 'true' : 'false');
    const forcePathStyle = String(forcePathStyleRaw).toLowerCase() === 'true';

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
    });
  }

  private recordingFilePath(companyId: string, callId: string): string {
    return path.join(this.localStorageDir, 'recordings', companyId, `${callId}.mp3`);
  }

  private transcriptFilePath(companyId: string, callId: string): string {
    return path.join(this.localStorageDir, 'transcripts', companyId, `${callId}.json`);
  }

  private async ensureParentDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  async uploadRecording(
    companyId: string,
    callId: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    if (this.localMode) {
      const filePath = this.recordingFilePath(companyId, callId);
      await this.ensureParentDir(filePath);
      await fs.writeFile(filePath, fileBuffer);
      return this.getRecordingUrl(companyId, callId);
    }

    const key = `recordings/${companyId}/${callId}.mp3`;

    const command = new PutObjectCommand({
      Bucket: this.recordingsBucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      Metadata: {
        company_id: companyId,
        call_id: callId,
      },
    });

    await this.client.send(command);

    return this.getRecordingUrl(companyId, callId);
  }

  async getRecordingUrl(companyId: string, callId: string, expiresIn = 3600): Promise<string> {
    if (this.localMode) {
      return `local-file://${this.recordingFilePath(companyId, callId)}`;
    }

    const key = `recordings/${companyId}/${callId}.mp3`;

    const command = new GetObjectCommand({
      Bucket: this.recordingsBucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async uploadTranscript(
    companyId: string,
    callId: string,
    transcript: any
  ): Promise<string> {
    if (this.localMode) {
      const filePath = this.transcriptFilePath(companyId, callId);
      await this.ensureParentDir(filePath);
      await fs.writeFile(filePath, JSON.stringify(transcript, null, 2), 'utf8');
      return filePath;
    }

    const key = `transcripts/${companyId}/${callId}.json`;

    const command = new PutObjectCommand({
      Bucket: this.transcriptsBucket,
      Key: key,
      Body: JSON.stringify(transcript),
      ContentType: 'application/json',
      Metadata: {
        company_id: companyId,
        call_id: callId,
      },
    });

    await this.client.send(command);

    return key;
  }

  async getTranscript(companyId: string, callId: string): Promise<any> {
    if (this.localMode) {
      try {
        const bodyContents = await fs.readFile(this.transcriptFilePath(companyId, callId), 'utf8');
        return bodyContents ? JSON.parse(bodyContents) : null;
      } catch (error: any) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    }

    const key = `transcripts/${companyId}/${callId}.json`;

    const command = new GetObjectCommand({
      Bucket: this.transcriptsBucket,
      Key: key,
    });

    const response = await this.client.send(command);
    const bodyContents = await response.Body?.transformToString();

    return bodyContents ? JSON.parse(bodyContents) : null;
  }

  async deleteRecording(companyId: string, callId: string): Promise<void> {
    if (this.localMode) {
      try {
        await fs.unlink(this.recordingFilePath(companyId, callId));
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
      return;
    }

    const key = `recordings/${companyId}/${callId}.mp3`;

    const command = new DeleteObjectCommand({
      Bucket: this.recordingsBucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async recordingExists(companyId: string, callId: string): Promise<boolean> {
    if (this.localMode) {
      try {
        await fs.access(this.recordingFilePath(companyId, callId));
        return true;
      } catch (error: any) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    }

    const key = `recordings/${companyId}/${callId}.mp3`;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.recordingsBucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }
}
