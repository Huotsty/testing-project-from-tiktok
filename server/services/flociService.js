/**
 * System Design Module 8: Floci Local Cloud Integration Service
 * 
 * Bridges SysLab's distributed primitives to wire-compatible local AWS services:
 * 1. S3 Storage Bridge: Syncs chunked CAS objects to local S3 buckets.
 * 2. SQS Queue Bridge: Routes scheduled posts & DLQ events to local SQS queues.
 * 3. DynamoDB State Bridge: Persists feature flags & whiteboard state in local NoSQL tables.
 * 
 * Zero external credentials, zero AWS bills, sub-50ms execution.
 */

const config = require('../config');

class FlociService {
  constructor() {
    this.reloadConfig();
    config.on('change:floci', () => this.reloadConfig());
  }

  reloadConfig() {
    this.endpoint = config.floci.endpoint;
    this.uiEndpoint = config.floci.uiUrl;
    this.region = config.floci.region;
    this.defaultBucket = config.floci.defaultBucket;
    this.defaultQueue = config.floci.defaultQueue;
    this.defaultTable = config.floci.defaultTable;
  }

  /**
   * Health & telemetry probe
   */
  async getHealth() {
    try {
      const res = await fetch(`${this.endpoint}/_floci/health`).catch(() => null)
               || await fetch(`${this.endpoint}/health`).catch(() => null);

      if (!res || !res.ok) {
        return {
          connected: false,
          endpoint: this.endpoint,
          uiEndpoint: this.uiEndpoint,
          error: 'Connection refused or container starting'
        };
      }

      const data = await res.json().catch(() => ({}));
      const activeServices = data.services 
        ? Object.entries(data.services).filter(([_, s]) => s === 'running').map(([name]) => name)
        : [];

      return {
        connected: true,
        endpoint: this.endpoint,
        uiEndpoint: this.uiEndpoint,
        version: data.version || '2.1.0',
        edition: data.edition || 'community',
        totalRunningServices: activeServices.length,
        services: activeServices.slice(0, 15) // highlight top 15
      };
    } catch (err) {
      return {
        connected: false,
        endpoint: this.endpoint,
        uiEndpoint: this.uiEndpoint,
        error: err.message
      };
    }
  }

  // ==========================================
  // S3 OBJECT STORAGE ADAPTER
  // ==========================================

  async s3CreateBucket(bucketName = this.defaultBucket) {
    const targetBucket = bucketName || this.defaultBucket;
    const safeName = targetBucket.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const res = await fetch(`${this.endpoint}/${safeName}`, { method: 'PUT' });
    return {
      success: res.ok || res.status === 409, // 409 = already exists
      bucket: safeName,
      status: res.status
    };
  }

  async s3PutObject(bucketName, key, body, contentType = 'text/plain') {
    const res = await fetch(`${this.endpoint}/${bucketName}/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      body: typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body)
    });

    return {
      success: res.ok,
      bucket: bucketName,
      key,
      status: res.status
    };
  }

  async s3ListBuckets() {
    try {
      const res = await fetch(`${this.endpoint}/`);
      if (!res.ok) return [];
      const xml = await res.text();
      const matches = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]);
      return matches;
    } catch (_) {
      return [];
    }
  }

  async s3ListObjects(bucketName) {
    try {
      const res = await fetch(`${this.endpoint}/${bucketName}`);
      if (!res.ok) return [];
      const xml = await res.text();
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1]);
      const sizes = [...xml.matchAll(/<Size>([^<]+)<\/Size>/g)].map(m => parseInt(m[1], 10));
      return keys.map((key, i) => ({ key, size: sizes[i] || 0 }));
    } catch (_) {
      return [];
    }
  }

  /**
   * Syncs SysLab Object Storage files to Floci S3
   */
  async syncFromSysLabStorage(objectStorageService, bucketName = this.defaultBucket) {
    const targetBucket = bucketName || this.defaultBucket;
    await this.s3CreateBucket(targetBucket);
    const catalog = objectStorageService.getAllFiles();
    const synced = [];

    for (const file of catalog) {
      try {
        const readResult = objectStorageService.readFile(file.fileId);
        if (readResult && readResult.buffer) {
          const s3Key = `objects/${file.filename}`;
          await this.s3PutObject(bucketName, s3Key, readResult.buffer, file.mimeType || 'text/plain');
          
          // Also save manifest as JSON
          const manifestKey = `manifests/${file.fileId}.json`;
          await this.s3PutObject(bucketName, manifestKey, file, 'application/json');
          
          synced.push({
            fileId: file.fileId,
            filename: file.filename,
            s3Key,
            size: file.size,
            chunks: file.chunks ? file.chunks.length : 0
          });
        }
      } catch (err) {
        console.error(`Failed to sync file ${file.fileId} to S3:`, err.message);
      }
    }

    return {
      success: true,
      bucket: bucketName,
      syncedCount: synced.length,
      syncedFiles: synced
    };
  }

  // ==========================================
  // SQS MESSAGE QUEUE ADAPTER
  // ==========================================

  async sqsCreateQueue(queueName = this.defaultQueue) {
    const targetQueue = queueName || this.defaultQueue;
    const res = await fetch(`${this.endpoint}/`, {
      method: 'POST',
      headers: {
        'Host': `sqs.${this.region}.localhost:4566`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Action=CreateQueue&QueueName=${encodeURIComponent(targetQueue)}&Version=2012-11-05`
    });

    const xml = await res.text();
    const urlMatch = xml.match(/<QueueUrl>([^<]+)<\/QueueUrl>/);
    const queueUrl = urlMatch ? urlMatch[1] : `${this.endpoint}/000000000000/${queueName}`;

    return {
      success: res.ok,
      queueName,
      queueUrl
    };
  }

  getQueueUrl(queueName = this.defaultQueue) {
    const targetQueue = queueName || this.defaultQueue;
    return `${this.endpoint}/000000000000/${targetQueue}`;
  }

  async sqsListQueues() {
    try {
      const res = await fetch(`${this.endpoint}/`, {
        method: 'POST',
        headers: {
          'Host': `sqs.${this.region}.localhost:4566`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'Action=ListQueues&Version=2012-11-05'
      });

      const xml = await res.text();
      const matches = [...xml.matchAll(/<QueueUrl>([^<]+)<\/QueueUrl>/g)].map(m => m[1]);
      return matches;
    } catch (_) {
      return [];
    }
  }

  async sqsSendMessage(queueUrl, messageBody) {
    const urlObj = new URL(queueUrl);
    const bodyStr = typeof messageBody === 'object' ? JSON.stringify(messageBody) : String(messageBody);

    const res = await fetch(queueUrl, {
      method: 'POST',
      headers: {
        'Host': `sqs.${this.region}.localhost:4566`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Action=SendMessage&MessageBody=${encodeURIComponent(bodyStr)}&Version=2012-11-05`
    });

    const xml = await res.text();
    const idMatch = xml.match(/<MessageId>([^<]+)<\/MessageId>/);
    const md5Match = xml.match(/<MD5OfMessageBody>([^<]+)<\/MD5OfMessageBody>/);

    return {
      success: res.ok,
      messageId: idMatch ? idMatch[1] : null,
      md5: md5Match ? md5Match[1] : null
    };
  }

  async sqsReceiveMessages(queueUrl, maxMessages = 5) {
    const res = await fetch(queueUrl, {
      method: 'POST',
      headers: {
        'Host': `sqs.${this.region}.localhost:4566`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Action=ReceiveMessage&MaxNumberOfMessages=${maxMessages}&VisibilityTimeout=15&Version=2012-11-05`
    });

    const xml = await res.text();
    const messageBlocks = xml.split('<Message>').slice(1);
    const messages = messageBlocks.map(block => {
      const id = (block.match(/<MessageId>([^<]+)<\/MessageId>/) || [])[1];
      const receiptHandle = (block.match(/<ReceiptHandle>([^<]+)<\/ReceiptHandle>/) || [])[1];
      const body = (block.match(/<Body>([^<]+)<\/Body>/) || [])[1];
      let parsedBody = body;
      try { parsedBody = JSON.parse(body); } catch (_) {}
      return { id, receiptHandle, body: parsedBody };
    });

    return messages;
  }

  /**
   * Bridges SysLab's scheduled posts into Floci SQS
   */
  async bridgePostScheduler(postSchedulerService, queueName = this.defaultQueue) {
    const targetQueue = queueName || this.defaultQueue;
    const q = await this.sqsCreateQueue(targetQueue);
    const jobs = postSchedulerService.getAllJobs ? postSchedulerService.getAllJobs() : [];
    const published = [];

    for (const job of jobs.slice(0, 10)) {
      const msg = await this.sqsSendMessage(q.queueUrl, {
        source: 'SysLab_PostScheduler',
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        content: job.content,
        targetTime: job.scheduledFor,
        timestamp: new Date().toISOString()
      });
      published.push({ jobId: job.id, messageId: msg.messageId });
    }

    return {
      success: true,
      queueUrl: q.queueUrl,
      publishedCount: published.length,
      published
    };
  }

  // ==========================================
  // DYNAMODB NOSQL DATABASE ADAPTER
  // ==========================================

  async dynamoCreateTable(tableName = this.defaultTable) {
    const targetTable = tableName || this.defaultTable;
    const res = await fetch(`${this.endpoint}/`, {
      method: 'POST',
      headers: {
        'Host': `dynamodb.${this.region}.localhost:4566`,
        'x-amz-target': 'DynamoDB_20120810.CreateTable',
        'Content-Type': 'application/x-amz-json-1.0'
      },
      body: JSON.stringify({
        TableName: targetTable,
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST'
      })
    });

    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok || (data.__type && data.__type.includes('ResourceInUseException')),
      tableName,
      status: data.TableDescription ? data.TableDescription.TableStatus : 'ACTIVE'
    };
  }

  async dynamoPutItem(tableName, item) {
    // Convert simple JS object to DynamoDB AttributeValue format
    const dynamoItem = {};
    for (const [key, val] of Object.entries(item)) {
      if (typeof val === 'number') dynamoItem[key] = { N: String(val) };
      else if (typeof val === 'boolean') dynamoItem[key] = { BOOL: val };
      else dynamoItem[key] = { S: typeof val === 'object' ? JSON.stringify(val) : String(val) };
    }

    const res = await fetch(`${this.endpoint}/`, {
      method: 'POST',
      headers: {
        'Host': `dynamodb.${this.region}.localhost:4566`,
        'x-amz-target': 'DynamoDB_20120810.PutItem',
        'Content-Type': 'application/x-amz-json-1.0'
      },
      body: JSON.stringify({
        TableName: tableName,
        Item: dynamoItem
      })
    });

    return { success: res.ok };
  }

  async dynamoScan(tableName) {
    const res = await fetch(`${this.endpoint}/`, {
      method: 'POST',
      headers: {
        'Host': `dynamodb.${this.region}.localhost:4566`,
        'x-amz-target': 'DynamoDB_20120810.Scan',
        'Content-Type': 'application/x-amz-json-1.0'
      },
      body: JSON.stringify({ TableName: tableName })
    });

    if (!res.ok) return [];
    const data = await res.json().catch(() => ({ Items: [] }));
    const items = (data.Items || []).map(raw => {
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v.S !== undefined) clean[k] = v.S;
        else if (v.N !== undefined) clean[k] = Number(v.N);
        else if (v.BOOL !== undefined) clean[k] = v.BOOL;
      }
      return clean;
    });
    return items;
  }

  /**
   * Exports SysLab feature flags into DynamoDB
   */
  async syncFeatureFlags(featureFlagService, tableName = this.defaultTable) {
    const targetTable = tableName || this.defaultTable;
    await this.dynamoCreateTable(targetTable);
    const flags = featureFlagService.getAllFlags();
    const synced = [];

    for (const flag of flags) {
      await this.dynamoPutItem(tableName, {
        id: flag.key,
        name: flag.name || flag.key,
        enabled: !!flag.enabled,
        percentage: flag.rolloutPercentage !== undefined ? flag.rolloutPercentage : 100,
        updatedAt: new Date().toISOString()
      });
      synced.push(flag.key);
    }

    return {
      success: true,
      tableName,
      syncedFlags: synced
    };
  }
}

module.exports = new FlociService();
