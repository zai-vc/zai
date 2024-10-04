import { OpenAI } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';


class AIAssistant {
  private vectorStore: MemoryVectorStore | null = null;
  private llm: OpenAI;

  constructor() {
    this.llm = new OpenAI({ temperature: 0 });
  }

  async initialize(referenceText: string) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.createDocuments([referenceText]);
    const embeddings = new OpenAIEmbeddings();
    this.vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
  }

  async query(question: string): Promise<string> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    const relevantDocs = await this.vectorStore.similaritySearch(question, 3);
    const context = relevantDocs.map(doc => doc.pageContent).join('\n\n');

    const response = await this.llm.call(
      `Context: ${context}\n\nQuestion: ${question}\n\nAnswer:`
    );

    return response;
  }
}