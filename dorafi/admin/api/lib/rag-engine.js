/**
 * Modular RAG Engine
 * Supports similarity threshold of 0.65, history truncation, and markdown source links.
 */

class RagEngine {
    constructor(supabaseClient, similarityThreshold = 0.65) {
          this.supabase = supabaseClient;
          this.similarityThreshold = similarityThreshold;
    }

  /**
     * Truncates conversation history to stay within reasonable token/message limits.
     * Keeps the most recent messages.
     * @param {Array} history - Array of message objects
     * @param {number} maxMessages - Maximum number of messages to keep
     */
  truncateHistory(history, maxMessages = 10) {
        if (!history || !Array.isArray(history)) return [];
        return history.slice(-maxMessages);
  }

  /**
     * Searches Supabase vector store for relevant chunks matching the query embedding
     * @param {Array<number>} queryEmbedding - Vector embedding of the search query
     * @param {string} tenantId - The tenant's identifier
     * @param {number} limit - Max number of chunks to return
     */
  async searchRelevantChunks(queryEmbedding, tenantId, limit = 5) {
        const { data, error } = await this.supabase.rpc('match_chunks', {
                query_embedding: queryEmbedding,
                match_threshold: this.similarityThreshold,
                match_count: limit,
                filter_tenant_id: tenantId
        });

      if (error) {
              console.error('Error matching chunks:', error);
              throw error;
      }

      return data || [];
  }

  /**
     * Formats the retrieved chunks into markdown context with source links
     * @param {Array} chunks - Retrieved document chunks from Supabase
     */
  formatContext(chunks) {
        if (!chunks || chunks.length === 0) return '';

      return chunks
          .map((chunk, index) => {
                    const source = chunk.metadata?.url || chunk.metadata?.source || 'Unknown Source';
                    const title = chunk.metadata?.title || `Document ${index + 1}`;
                    // Markdown format for source links
                       const sourceLink = source.startsWith('http') ? `[${title}](${source})` : source;

                       return `--- Context Chunk ${index + 1} (Source: ${sourceLink}) ---\n\n${chunk.content}`;
          })
          .join('\n\n');
  }
}

export default RagEngine;
export { RagEngine };
