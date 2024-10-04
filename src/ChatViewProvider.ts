import * as vscode from 'vscode';
import OpenAI from 'openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Embeddings, EmbeddingsParams } from "@langchain/core/embeddings";
import playSound from 'play-sound';
import * as path from 'path';
import LANGREF from '../resources/langref.txt';
import STDLIB from '../resources/stdlib.txt';

const player = playSound({});

class SoundPlayer {
    private queue: string[] = [];

    constructor(private player: any, private extensionUri: vscode.Uri, private sounds: string[]) {
        this.shuffleQueue();
    }

    private shuffleQueue() {
        this.queue = [...this.sounds];
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
    }

    playRandomSound() {
        if (this.queue.length === 0) {
            this.shuffleQueue();
        }
        const randomSound = this.queue.pop()!;
        const audioPath = path.join(this.extensionUri.fsPath, 'resources', randomSound);

        this.player.play(audioPath, { afplay: ['-v', 0.5 ] /* lower volume for afplay on OSX */ }, (err: any) => {
            if (err) console.error('Audio playback failed:', err);
        });
    }
}

class TfidfEmbeddings extends Embeddings {
    private vocabulary: Map<string, number>;
    private documentFrequency: Map<string, number>;
    private documentCount: number;
    private idfCache: Map<string, number>;

    constructor(params: EmbeddingsParams = {}) {
        super(params);
        this.vocabulary = new Map();
        this.documentFrequency = new Map();
        this.idfCache = new Map();
        this.documentCount = 0;
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        this.buildVocabulary(documents);
        return documents.map(doc => this.embedText(doc));
    }

    async embedQuery(text: string): Promise<number[]> {
        return this.embedText(text);
    }

    private buildVocabulary(documents: string[]) {
        this.documentCount = documents.length;
        const tempDocFreq = new Map<string, number>();

        for (const doc of documents) {
            const uniqueWords = new Set(this.tokenize(doc));
            for (const word of uniqueWords) {
                if (!this.vocabulary.has(word)) {
                    this.vocabulary.set(word, this.vocabulary.size);
                }
                tempDocFreq.set(word, (tempDocFreq.get(word) || 0) + 1);
            }
        }

        for (const [word, freq] of tempDocFreq) {
            if (freq > 1) {
                this.documentFrequency.set(word, freq);
            }
        }
    }

    private embedText(text: string): number[] {
        const words = this.tokenize(text);
        const vector = new Float32Array(this.vocabulary.size);
        const wordCounts = new Map<string, number>();

        for (const word of words) {
            if (this.vocabulary.has(word)) {
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
            }
        }

        for (const [word, count] of wordCounts) {
            const index = this.vocabulary.get(word)!;
            const tf = count / words.length;
            const idf = this.getIdf(word);
            vector[index] = tf * idf;
        }

        this.normalize(vector);
        return vector; // NOTE: violates type constraints but is needed to avoid OOM!
    }

    private getIdf(word: string): number {
        if (!this.idfCache.has(word)) {
            const idf = Math.log(this.documentCount / (this.documentFrequency.get(word) || 1));
            this.idfCache.set(word, idf);
        }
        return this.idfCache.get(word)!;
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase().match(/\b\w+\b/g) || [];
    }

    private normalize(vector: Float32Array): void {
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude !== 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }
    }
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zaiChatView';

    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];
    private openai: OpenAI | null = null;
    private langRefVectorStore: MemoryVectorStore | null = null;
    private langRefEmbeddings: TfidfEmbeddings | null = null;
    private stdlibVectorStore: MemoryVectorStore | null = null;
    private stdlibEmbeddings: TfidfEmbeddings | null = null;
    private meme: SoundPlayer | null = null;
    
    constructor(private readonly _extensionUri: vscode.Uri) {
        // Play loading music
        const sounds = ['dankengine.mp3', 'stanley-hahaha-gotcha.mp3', 'skibidi.mp3', 'party.mp3'];
        const randomSound = sounds[Math.floor(Math.random() * sounds.length * Date.now() % sounds.length)];
        const audioPath = path.join(this._extensionUri.fsPath, 'resources', randomSound);
        
        // player.play(audioPath, (err: any) => {
        //     if (err) console.error('Audio playback failed:', err);
        // });

        this.meme = new SoundPlayer(player, this._extensionUri, [
            'stanley-hahaha-gotcha.mp3', 
            'prime-20-years-moron.mp3',
            'prime-my-dayjob-makes-me-program-faster-harder.mp3',
            'prime-scary-uwu.mp3',
            'prime-checkboxes-not-aligned.mp3',
            'stanley-so-bad-at-following-directions.mp3',
            'stanley-only-got-the-job-family-connection.mp3',
            'stanley-no-long-term-sustainability-of-humans.mp3',
            'prime-world-class-bugs-take-time.mp3',
            'prime-so-cringe-its-a-sauce.mp3',
            'prime-should-you-use-copilot.mp3',
            'prime-too-many-emojis.mp3',
            'prime-this-is-not-san-francisco.mp3'
        ]);
        
        this.initializeOpenAI();
    }

    public async initializeOpenAI() {
        const config = vscode.workspace.getConfiguration('zai');
        const apiUrl = config.get<string>('api.url');
        if (!apiUrl) {
            vscode.window.showErrorMessage('Zai: zai.api.url not set. Please set it in the extension settings.');
            return
        };
        const apiKey = config.get<string>('api.key');
        if (!apiKey) {
            vscode.window.showErrorMessage('Zai: zai.api.key not set. Please set it in the extension settings.');
            return
        };

        this.openai = new OpenAI({
            baseURL: apiUrl,
            apiKey: apiKey,
            defaultHeaders: {
                "HTTP-Referer": "https://github.com/hexops/zai",
                "X-Title": "Zai",
            }
        });

        this.langRefEmbeddings = new TfidfEmbeddings();
        this.stdlibEmbeddings = new TfidfEmbeddings();

        await this.loadReferenceText();
    }

    async initializeVectorStore(langRefText: string, stdlibText: string) {
        if (!this.langRefEmbeddings || !this.stdlibEmbeddings) {
            throw new Error('Embeddings not initialized');
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        this.langRefVectorStore = await MemoryVectorStore.fromDocuments(
            await splitter.createDocuments([langRefText]),
            this.langRefEmbeddings,
        );
        this.stdlibVectorStore = await MemoryVectorStore.fromDocuments(
            await splitter.createDocuments([stdlibText]),
            this.stdlibEmbeddings,
        );
    }

    async loadReferenceText() {
        try {
            await this.initializeVectorStore(LANGREF, STDLIB);
        } catch (error) {
            console.error('Error loading reference text:', error);
            vscode.window.showErrorMessage(`Zai: Error loading reference text: ${error}`);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        this._setWebviewMessageListener(webviewView.webview);
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message: any) => {
                const { command, text } = message;
                switch (command) {
                    case 'sendMessage':
                        await this._handleUserMessage(text);
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }

    private async _handleUserMessage(text: string) {
        if (!this.openai || !this.langRefVectorStore || !this.stdlibVectorStore) {
            await this.initializeOpenAI();
            if (!this.openai || !this.langRefVectorStore || !this.stdlibVectorStore) {
                this._view?.webview.postMessage({ 
                    type: 'addMessage', 
                    message: { 
                        role: 'error', 
                        content: 'Error: OpenAI or Vector Store not initialized.' 
                    } 
                });
                return;
            }
        }

        // Display user message
        this._view?.webview.postMessage({ type: 'addMessage', message: { role: 'user', content: text } });

        const config = vscode.workspace.getConfiguration('zai');
        const apiModel = config.get<string>('api.model');
        if (!apiModel) {
            vscode.window.showErrorMessage('Zai: zai.api.model not set. Please set it in the extension settings.');
            return;
        }

        this.meme!.playRandomSound();

        try {
            // Retrieve relevant documents from the vector store
            const langRefRelevantDocs = await this.langRefVectorStore!.similaritySearch(text, 12);
            const langRefContext = langRefRelevantDocs.map(doc => doc.pageContent).join('\n\n');

            const stdlibRelevantDocs = await this.stdlibVectorStore!.similaritySearch(text, 12);
            const stdlibContext = stdlibRelevantDocs.map(doc => doc.pageContent).join('\n\n');


            const systemPrompt = `
For context, here is the Zig programming language reference which is the language we are writing code in:

---------
${langRefContext}
---------

And here is some possibly relevant code from the Zig standard library that might be helpful to reference:

---------
${stdlibContext}
---------

You are an elite coder, who writes perfect code 24 hours a day. You're not rude, but you're not friendly either. You aren't over-eager to help people, but when they ask you do. The answers you give people tend to be short, concise, clear and to the point. They are factual, accurate, and you don't include fluff. When you aren't sure or might be hallucinating an answer, you just say 'idk'.

The person you are talking to is also an elite coder with 10 years of experience, and although they know a ton about coding in general, they just lack the context you have. When they ask you questions, your goal is just to share the relevant context with them. Your answers tend to be more code than English.

If the person asks a basic programming question, start your response with 'bruh', 'bruh, srsly?' before answering. This type of humor will make the person happy.
`

            // Create completion with context
            console.log(systemPrompt);
            const completion = await this.openai.chat.completions.create({
                model: apiModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ]
            });

            const aiResponse = completion.choices[0].message.content;
            
            // Display AI response
            this._view?.webview.postMessage({ type: 'addMessage', message: { role: 'assistant', content: aiResponse } });
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            this._view?.webview.postMessage({ type: 'addMessage', message: { role: 'error', content: 'Error: Unable to get response from AI.' } });
        }
    }

    
    private _getHtmlForWebview(webview: vscode.Webview) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Zai Chat</title>
                <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism-tomorrow.min.css" rel="stylesheet" />
                <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-core.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/autoloader/prism-autoloader.min.js"></script>
                <style>
                    body { 
                        font-family: var(--vscode-font-family); 
                        margin: 0; 
                        padding: 10px; 
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    #chat-container { 
                        height: calc(100vh - 80px); 
                        overflow-y: auto; 
                        padding-bottom: 10px;
                    }
                    #input-container { 
                        position: fixed; 
                        bottom: 10px; 
                        left: 10px;
                        right: 10px;
                        display: flex;
                        background-color: var(--vscode-input-background);
                        border-radius: 5px;
                        overflow: hidden;
                    }
                    #chat-input { 
                        flex-grow: 1;
                        border: none;
                        padding: 10px;
                        font-size: 14px;
                        background-color: transparent;
                        color: var(--vscode-input-foreground);
                    }
                    #chat-input:focus {
                        outline: none;
                    }
                    #send-button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 10px 15px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    #send-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .message {
                        margin-bottom: 10px;
                        padding: 10px;
                        border-radius: 5px;
                        max-width: 80%;
                    }
                    .user-message {
                        background-color: var(--vscode-textBlockQuote-background);
                        align-self: flex-end;
                        margin-left: auto;
                    }
                    .assistant-message {
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                        align-self: flex-start;
                    }
                    .error-message {
                        background-color: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-inputValidation-errorForeground);
                        align-self: flex-start;
                    }
                    .message pre {
                        background-color: var(--vscode-textCodeBlock-background);
                        padding: 10px;
                        border-radius: 5px;
                        overflow-x: auto;
                        margin: 10px 0;
                    }
                    .message code {
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        white-space: pre-wrap;
                        word-break: break-all;
                    }
                    .message p {
                        margin: 0 0 10px 0;
                    }
                    .message ul, .message ol {
                        margin: 0 0 10px 0;
                        padding-left: 20px;
                    }
                    .message pre code {
                        display: block;
                        background-color: transparent;
                        padding: 0;
                        margin: 0;
                        border: none;
                        border-radius: 0;
                    }
                    /* Override Prism styles to better match VS Code */
                    .message pre[class*="language-"] {
                        background-color: var(--vscode-textCodeBlock-background);
                        padding: 10px;
                        border-radius: 5px;
                        overflow-x: auto;
                        margin: 10px 0;
                    }
                    .message code[class*="language-"] {
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        white-space: pre;
                        word-break: normal;
                    }
                </style>
            </head>
            <body>
                <div id="chat-container"></div>
                <div id="input-container">
                    <input type="text" id="chat-input" placeholder="Type your message...">
                    <button id="send-button" onclick="sendMessage()">Send</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const chatContainer = document.getElementById('chat-container');
                    const chatInput = document.getElementById('chat-input');
    
                    function sendMessage() {
                        const text = chatInput.value;
                        if (text) {
                            vscode.postMessage({ command: 'sendMessage', text });
                            chatInput.value = '';
                        }
                    }
    
                    chatInput.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            sendMessage();
                        }
                    });
    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'addMessage':
                                const messageElement = document.createElement('div');
                                messageElement.classList.add('message');
                                messageElement.classList.add(message.message.role + '-message');
                                messageElement.innerHTML = marked.parse(message.message.content);
                                chatContainer.appendChild(messageElement);
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                                Prism.highlightAllUnder(messageElement);
                                break;
                        }
                    });
    
                    marked.setOptions({
                        highlight: function(code, lang) {
                            if (Prism.languages[lang]) {
                                return Prism.highlight(code, Prism.languages[lang], lang);
                            } else {
                                return code;
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

}