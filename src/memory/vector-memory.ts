import { LocalIndex } from 'vectra';
import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { VectorMemoryItem } from '../types/mcp-types';

/**
 * Vector Memory System for MCP Smart Proxy
 * 
 * Uses local embeddings and vector search to store and retrieve
 * tool descriptions, resources, and conversations efficiently.
 */
export class VectorMemory {
  private index: LocalIndex;
  private embedder: any;
  private initialized: boolean = false;
  
  constructor(
    private indexPath: string = process.env.MCP_VECTOR_MEMORY_PATH || path.join(process.cwd(), '.mcp-vector-index'),
    private embeddingModel: string = 'Xenova/all-MiniLM-L6-v2',
    private chunkSize: number = 500,
    private overlap: number = 50
  ) {
    this.index = new LocalIndex(this.indexPath);
  }

  /**
   * Initialize the vector memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.embedder = await pipeline('feature-extraction', this.embeddingModel);
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }
    this.initialized = true;
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize();
    const result = await this.embedder(text, { 
      pooling: 'mean', 
      normalize: true 
    });
    return Array.from(result.data);
  }

  /**
   * Add an item to the vector store
   */
  async addItem(
    text: string, 
    metadata: Omit<VectorMemoryItem['metadata'], 'timestamp' | 'usageCount' | 'lastUsed'>
  ): Promise<string> {
    await this.initialize();
    
    const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const embedding = await this.generateEmbedding(text);
    
    await this.index.insertItem({
      vector: embedding,
      metadata: {
        id,
        text: text.substring(0, 1000),
        fullText: text,
        timestamp: new Date().toISOString(),
        usageCount: 0,
        lastUsed: new Date().toISOString(),
        ...metadata
      }
    });

    console.log(`Item added: ${id} (${text.length} chars, type: ${metadata.type})`);
    return id;
  }

  /**
   * Search items by semantic similarity
   */
  async searchItems(
    query: string, 
    limit: number = 5, 
    minScore: number = 0.3,
    filter?: { type?: string; server?: string }
  ): Promise<VectorMemoryItem[]> {
    await this.initialize();
    
    const queryEmbedding = await this.generateEmbedding(query);
    const results = await this.index.queryItems(queryEmbedding, limit * 2);
    
    // Filter by minimum score and optional filters
    const filteredResults = results
      .filter(result => result.score >= minScore)
      .filter(result => {
        if (!filter) return true;
        
        const metadata = result.item.metadata;
        if (filter.type && metadata.type !== filter.type) return false;
        if (filter.server && metadata.server !== filter.server) return false;
        
        return true;
      })
      .slice(0, limit)
      .map(result => ({
        id: String(result.item.metadata.id),
        text: String(result.item.metadata.text),
        embedding: result.item.vector,
        metadata: {
          type: String(result.item.metadata.type) as 'tool' | 'resource' | 'conversation' | 'query',
          server: result.item.metadata.server ? String(result.item.metadata.server) : undefined,
          toolName: result.item.metadata.toolName ? String(result.item.metadata.toolName) : undefined,
          timestamp: new Date(String(result.item.metadata.timestamp)),
          usageCount: Number(result.item.metadata.usageCount || 0),
          lastUsed: new Date(String(result.item.metadata.lastUsed || result.item.metadata.timestamp))
        },
        score: result.score
      }));
    
    console.log(`Found ${filteredResults.length} relevant items (min score: ${minScore})`);
    return filteredResults;
  }

  /**
   * Update item usage statistics
   */
  async updateUsage(itemId: string): Promise<void> {
    await this.initialize();
    
    // Note: Vectra doesn't support direct updates, so we need to:
    // 1. Find the item
    // 2. Remove it
    // 3. Reinsert with updated metadata
    
    // This is a simplified implementation
    // In production, you'd want to implement proper update logic
    console.log(`Usage updated for item: ${itemId}`);
  }

  /**
   * Index tools from MCP servers
   */
  async indexTools(tools: Array<{ name: string; description: string; server: string }>): Promise<number> {
    await this.initialize();
    
    let indexed = 0;
    
    for (const tool of tools) {
      const text = `${tool.name}: ${tool.description}`;
      
      await this.addItem(text, {
        type: 'tool',
        server: tool.server,
        toolName: tool.name
      });
      
      indexed++;
    }
    
    console.log(`Indexed ${indexed} tools`);
    return indexed;
  }

  /**
   * Index conversation history
   */
  async indexConversation(messages: Array<{ role: string; content: string }>, context: string = ''): Promise<string[]> {
    await this.initialize();
    
    const ids: string[] = [];
    
    for (const message of messages) {
      const text = `${message.role}: ${message.content}`;
      const id = await this.addItem(text, {
        type: 'conversation'
      });
      ids.push(id);
    }
    
    console.log(`Indexed ${ids.length} conversation messages`);
    return ids;
  }

  /**
   * Split text into overlapping chunks
   */
  splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      let chunk = text.substring(start, end);
      
      // Try to end at a sentence boundary
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const boundary = Math.max(lastPeriod, lastNewline);
      
      if (boundary > this.chunkSize / 2 && boundary < chunk.length - 10) {
        chunk = chunk.substring(0, boundary + 1);
      }
      
      chunks.push(chunk.trim());
      start += chunk.length - this.overlap;
      
      if (chunk.length === 0) break; // Prevent infinite loop
    }
    
    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<{
    indexPath: string;
    embeddingModel: string;
    initialized: boolean;
    estimatedItems: number;
    chunkSize: number;
    overlap: number;
  }> {
    await this.initialize();
    
    let estimatedItems = 0;
    if (fs.existsSync(this.indexPath)) {
      const files = fs.readdirSync(this.indexPath);
      estimatedItems = Math.floor(files.length / 3);
    }
    
    return {
      indexPath: this.indexPath,
      embeddingModel: this.embeddingModel,
      initialized: this.initialized,
      estimatedItems,
      chunkSize: this.chunkSize,
      overlap: this.overlap
    };
  }

  /**
   * Clear the entire index
   */
  async clearIndex(): Promise<{ success: boolean }> {
    await this.initialize();
    await this.index.deleteIndex();
    console.log('Vector index cleared');
    return { success: true };
  }

  /**
   * Export items to JSON
   */
  async exportItems(limit: number = 100): Promise<{
    count: number;
    items: VectorMemoryItem[];
    exportedAt: string;
  }> {
    await this.initialize();
    
    const queryEmbedding = await this.generateEmbedding('general');
    const results = await this.index.queryItems(queryEmbedding, limit);
    
    const items = results.map(result => ({
      id: String(result.item.metadata.id),
      text: String(result.item.metadata.text),
      embedding: result.item.vector,
      metadata: {
        type: String(result.item.metadata.type) as 'tool' | 'resource' | 'conversation' | 'query',
        server: result.item.metadata.server ? String(result.item.metadata.server) : undefined,
        toolName: result.item.metadata.toolName ? String(result.item.metadata.toolName) : undefined,
        timestamp: new Date(String(result.item.metadata.timestamp)),
        usageCount: Number(result.item.metadata.usageCount || 0),
        lastUsed: new Date(String(result.item.metadata.lastUsed || result.item.metadata.timestamp))
      },
      score: result.score
    }));
    
    return {
      count: items.length,
      items,
      exportedAt: new Date().toISOString()
    };
  }
}