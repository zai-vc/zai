import * as vscode from 'vscode';
import OpenAI from 'openai';


export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zaiChatView';


    private _view?: vscode.WebviewView;
    private openai: OpenAI | null = null;


    constructor(private readonly _extensionUri: vscode.Uri) {
        this.initializeOpenAI();
    }


    private initializeOpenAI() {
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
        if (!this.openai) {
            this._view?.webview.postMessage({ 
                type: 'addMessage', 
                message: { 
                    role: 'error', 
                    content: 'Error: OpenRouter API Key is not set. Please set it in the extension settings.' 
                } 
            });
            return;
        }


        // Display user message
        this._view?.webview.postMessage({ type: 'addMessage', message: { role: 'user', content: text } });


        const config = vscode.workspace.getConfiguration('zai');
        const apiModel = config.get<string>('api.model');
        if (!apiModel) {
            vscode.window.showErrorMessage('Zai: zai.api.model not set. Please set it in the extension settings.');
            return
        };


        try {
            const completion = await this.openai.chat.completions.create({
                model: apiModel,
                messages: [{ role: "user", content: text }]
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
                <style>
                    body { font-family: var(--vscode-font-family); margin: 0; padding: 10px; }
                    #chat-container { height: calc(100vh - 100px); overflow-y: auto; }
                    #input-container { position: fixed; bottom: 10px; width: calc(100% - 20px); }
                    #chat-input { width: calc(100% - 70px); }
                </style>
            </head>
            <body>
                <div id="chat-container"></div>
                <div id="input-container">
                    <input type="text" id="chat-input" placeholder="Type your message...">
                    <button onclick="sendMessage()">Send</button>
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
                                const messageElement = document.createElement('p');
                                messageElement.innerHTML = '<strong>' + message.message.role + ':</strong> ' + message.message.content;
                                chatContainer.appendChild(messageElement);
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}