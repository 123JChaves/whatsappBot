const validarCNPJCompleto = (cnpjInformado: string): boolean => {
    // Remove qualquer caractere que não seja número
    const cnpjSomenteNumeros = cnpjInformado.replace(/[^\d]+/g, '');

    // Verifica se possui 14 dígitos ou se é uma sequência repetida conhecida
    if (cnpjSomenteNumeros.length !== 14 || !!cnpjSomenteNumeros.match(/(\d)\1{13}/)) {
        return false;
    }

    // Função interna para calcular os dígitos verificadores
    const calcularDigitoVerificador = (baseDoCnpj: string, pesosIniciais: number[]): number => {
        let somatorioDosProdutos = 0;
        let multiplicadorDePeso = 0;

        for (let indiceAtual = 0; indiceAtual < baseDoCnpj.length; indiceAtual++) {
            const pesoAtual = pesosIniciais[multiplicadorDePeso];
            somatorioDosProdutos += parseInt(baseDoCnpj[indiceAtual]) * pesoAtual;
            
            // O peso volta a ser 9 após atingir o limite (padrão CNPJ)
            multiplicadorDePeso = (multiplicadorDePeso + 1) % pesosIniciais.length;
        }

        const restoDaDivisao = somatorioDosProdutos % 11;
        return restoDaDivisao < 2 ? 0 : 11 - restoDaDivisao;
    };

    // Pesos oficiais para o primeiro e segundo dígito
    const pesosPrimeiroDigito = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesosSegundoDigito = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const baseSemDigitos = cnpjSomenteNumeros.substring(0, 12);
    
    // Cálculo do Primeiro Dígito
    const primeiroDigitoCalculado = calcularDigitoVerificador(baseSemDigitos, pesosPrimeiroDigito);
    
    // Cálculo do Segundo Dígito (incluindo o primeiro calculado na base)
    const segundoDigitoCalculado = calcularDigitoVerificador(baseSemDigitos + primeiroDigitoCalculado, pesosSegundoDigito);

    // Compara os dígitos calculados com os informados no final do CNPJ
    const digitosVerificadoresInformados = cnpjSomenteNumeros.substring(12);
    const digitosVerificadoresCalculados = `${primeiroDigitoCalculado}${segundoDigitoCalculado}`;

    return digitosVerificadoresInformados === digitosVerificadoresCalculados;
};

export default validarCNPJCompleto;