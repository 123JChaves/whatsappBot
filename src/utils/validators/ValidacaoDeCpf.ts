const CpfValido = (cpf: string): boolean => {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11 || /^(\d)\1+$/.test(cpfLimpo)) return false;

    const calcularDigito = (pesoMaximo: number) => (cpfLimpo.split("").slice(0, pesoMaximo - 1)
        .reduce((somaTotal, numero, indice) => somaTotal + parseInt(numero) * (pesoMaximo - indice), 0) * 10 % 11) % 10;

    const primeiroDigitoVerificador = calcularDigito(10);
    const segundoDigitoVerificador = calcularDigito(11);

    return primeiroDigitoVerificador === parseInt(cpfLimpo[9]) && segundoDigitoVerificador === parseInt(cpfLimpo[10]);
};

export default CpfValido;