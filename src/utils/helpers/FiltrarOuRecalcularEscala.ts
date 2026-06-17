import { OrdemJoinha } from "../../models/OrdemJoinha";

function filtrarERecalcularEscala(
  motoristasOriginais: (OrdemJoinha & { categoria?: string })[],
  limitePlantao: number,
  tipoDia: string,
  posicaoPermitidaApoio: number
): (OrdemJoinha & { categoria?: string })[] {
  if (tipoDia === 'DIA_LIVRE') return [...motoristasOriginais];

  let countPlantoesPreenchidos = 0;
  let temApoioPreenchido = false;
  let posicaoVisualAtual = 1;

  return motoristasOriginais.filter((reg) => {
    const { motorista } = reg;

    // Vagas de Plantão iniciais
    if (countPlantoesPreenchidos < limitePlantao) {
      countPlantoesPreenchidos++;
      posicaoVisualAtual++;
      return true;
    }

    // Se o motorista NÃO pode fazer rota
    if (!motorista?.podeFazerRota) {
      // Se ele cair exatamente na posição calculada do Apoio, ele é mantido
      if (posicaoVisualAtual === posicaoPermitidaApoio && !temApoioPreenchido) {
        temApoioPreenchido = true;
        reg.categoria = 'APOIO'; 
        posicaoVisualAtual++;
        return true;
      } 
      // Se não for a vaga do Apoio, remove do relatório sem quebrar o loop
      return false; 
    }

    posicaoVisualAtual++;
    return true;
  });
}

export default filtrarERecalcularEscala;