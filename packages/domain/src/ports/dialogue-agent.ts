export type DialogueMessage = { role: 'user' | 'nova'; text: string };

/** Conversación libre con Nova a través del servidor (AD-9); el árbol de diálogo no la usa. */
export interface DialogueAgent {
  reply(input: {
    topicId: string;
    history: DialogueMessage[];
    userText: string;
  }): Promise<{ text: string }>;
}
