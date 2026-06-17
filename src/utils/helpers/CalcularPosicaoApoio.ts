function calcularPosicaoApoio(rotas: { qtdTarde: number; qtdMadrugada: number }): number {
  const { qtdTarde, qtdMadrugada } = rotas;
  
  if (qtdTarde > qtdMadrugada) {
    return qtdTarde; // Posição da última rota da tarde
  } 
  
  // Se a madrugada for maior ou se ambas forem iguais
  return qtdMadrugada + 1; // Total de rotas da madrugada + 1
}

export default calcularPosicaoApoio;