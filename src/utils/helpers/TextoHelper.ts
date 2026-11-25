class TextoHelper {

    public static sanitizarNome(nome: string): string {
        if (!nome) return '';

        return nome
            .replace(/<[^>]*>/g, '')
            .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    public static sanitizarNumero(numero: string | number): string {
        if (numero === null || numero === undefined || numero === '') return '';

        return String(numero)
            .replace(/<[^>]*>/g, '')
            .replace(/[^A-Za-z0-9]/g, '')
            .replace(/\s+/g, '')
            .trim();
    };

    public static sanitizarPreco(valor: string | number): number {
        if (valor === null || valor === undefined || valor === '') return 0;
        if (typeof valor === 'number') return valor;

        let limpo = valor
            .replace(/[^0-9,.]/g, '')
            .replace(',', '.');
        return parseFloat(limpo) || 0;
    };

    public static sanitizarDigitos(dado: string | number): number {
        if (dado === null || dado === undefined || dado === '') return 0;
        const numerosPuros = String(dado).replace(/[^0-9]/g, '');
        return parseInt(numerosPuros, 10) || 0;
    };

}

export default TextoHelper;