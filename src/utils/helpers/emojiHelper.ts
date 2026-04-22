export class EmojiHelper {
    // Captura 👍 até 👍🏿 (Fitzpatrick modifiers)
    private static readonly JOINHA_REGEX = /^[\u{1F44D}\u{1F44D}\u{1F3FB}-\u{1F44D}\u{1F3FF}]$/u;

    static isJoinha(texto: string): boolean {
        return this.JOINHA_REGEX.test(texto.trim());
    }
}
