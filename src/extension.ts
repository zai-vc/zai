import * as vscode from 'vscode';
import { ChatViewProvider } from './ChatViewProvider';

let chatViewProvider: ChatViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating Zai extension');

    chatViewProvider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('zai.openChat', () => {
            vscode.commands.executeCommand('workbench.view.extension.zai-chat');
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('zai.apiKey')) {
                chatViewProvider.initializeOpenAI();
            }
        })
    );

    console.log('Zai extension activated');
}

export function deactivate() {}