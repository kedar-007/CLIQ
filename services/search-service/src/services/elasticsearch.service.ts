import { Client } from '@elastic/elasticsearch';
import { createLogger } from '@comms/logger';

const logger = createLogger('search-service:elasticsearch');

export const elasticsearchService = {
  client: new Client({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' }),

  async createIndices(): Promise<void> {
    const indices = [
      {
        index: 'messages',
        mappings: {
          properties: {
            id: { type: 'keyword' },
            channelId: { type: 'keyword' },
            tenantId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            senderName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            content: { type: 'text', analyzer: 'standard' },
            type: { type: 'keyword' },
            createdAt: { type: 'date' },
            hasAttachments: { type: 'boolean' },
            hasLinks: { type: 'boolean' },
          },
        },
      },
      {
        index: 'files',
        mappings: {
          properties: {
            id: { type: 'keyword' },
            channelId: { type: 'keyword' },
            tenantId: { type: 'keyword' },
            uploaderId: { type: 'keyword' },
            fileName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            mimeType: { type: 'keyword' },
            ocrText: { type: 'text', analyzer: 'standard' },
            fileSize: { type: 'long' },
            createdAt: { type: 'date' },
          },
        },
      },
      {
        index: 'users',
        mappings: {
          properties: {
            id: { type: 'keyword' },
            tenantId: { type: 'keyword' },
            email: { type: 'keyword' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' }, completion: { type: 'completion' } } },
            department: { type: 'text' },
            jobTitle: { type: 'text' },
            avatarUrl: { type: 'keyword', index: false },
          },
        },
      },
      {
        index: 'channels',
        mappings: {
          properties: {
            id: { type: 'keyword' },
            tenantId: { type: 'keyword' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            description: { type: 'text' },
            topic: { type: 'text' },
            type: { type: 'keyword' },
          },
        },
      },
    ];

    for (const { index, mappings } of indices) {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        await this.client.indices.create({ index, mappings } as any);
        logger.info(`Index "${index}" created`);
      }
    }
  },

  async indexMessage(doc: {
    id: string; channelId: string; tenantId: string; senderId: string; senderName: string;
    content: string; type: string; createdAt: Date; hasAttachments: boolean; hasLinks: boolean;
  }): Promise<void> {
    await this.client.index({ index: 'messages', id: doc.id, document: doc });
  },

  async deleteMessage(id: string): Promise<void> {
    await this.client.delete({ index: 'messages', id }).catch(() => {});
  },

  async indexFile(doc: {
    id: string; channelId: string; tenantId: string; uploaderId: string;
    fileName: string; mimeType: string; ocrText?: string; fileSize: number; createdAt: Date;
  }): Promise<void> {
    await this.client.index({ index: 'files', id: doc.id, document: doc });
  },

  async searchGlobal(params: {
    query: string; tenantId: string; filters?: Record<string, unknown>; from?: number; size?: number;
  }): Promise<{ hits: any[]; total: number }> {
    const { query, tenantId, filters = {}, from = 0, size = 20 } = params;

    const must: any[] = [
      { term: { tenantId } },
      {
        multi_match: {
          query,
          fields: ['content^3', 'fileName^2', 'name^2', 'senderName', 'description', 'ocrText'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
    ];

    if (filters.channelId) must.push({ term: { channelId: filters.channelId } });
    if (filters.senderId) must.push({ term: { senderId: filters.senderId } });
    if (filters.from) must.push({ range: { createdAt: { gte: filters.from } } });
    if (filters.to) must.push({ range: { createdAt: { lte: filters.to } } });
    if (filters.hasAttachments) must.push({ term: { hasAttachments: true } });

    const result = await this.client.msearch({
      searches: [
        { index: 'messages' },
        { query: { bool: { must } }, from, size, highlight: { fields: { content: {}, fileName: {} } } },
        { index: 'files' },
        { query: { bool: { must: [{ term: { tenantId } }, { multi_match: { query, fields: ['fileName', 'ocrText'] } }] } }, from: 0, size: 5 },
        { index: 'users' },
        { query: { bool: { must: [{ term: { tenantId } }, { multi_match: { query, fields: ['name', 'email', 'department'] } }] } }, from: 0, size: 5 },
      ],
    });

    const allHits: any[] = [];
    const responses = result.responses as any[];

    for (const response of responses) {
      if (response.hits?.hits) {
        for (const hit of response.hits.hits) {
          allHits.push({ ...hit._source, _index: hit._index, _score: hit._score, highlight: hit.highlight });
        }
      }
    }

    allHits.sort((a, b) => (b._score || 0) - (a._score || 0));
    const total = responses.reduce((sum: number, r: any) => sum + (r.hits?.total?.value || 0), 0);

    return { hits: allHits, total };
  },

  async autocomplete(prefix: string, tenantId: string): Promise<string[]> {
    const result = await this.client.search({
      index: 'users,channels',
      body: {
        suggest: {
          nameSuggest: {
            prefix,
            completion: { field: 'name.completion', size: 10, contexts: { tenantId: [tenantId] } },
          },
        },
      },
    });

    const options = (result as any).suggest?.nameSuggest?.[0]?.options || [];
    return options.map((o: any) => o._source?.name).filter(Boolean);
  },
};
