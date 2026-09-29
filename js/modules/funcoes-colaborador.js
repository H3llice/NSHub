// Funções (cargos) de Colaborador — lista única usada por Colaboradores,
// Embarques e Folha de pagamento. Mesmas chaves de FUNCOES em
// backend/routes/colaboradores.js.
export const FUNCOES = {
  gerente_operacional: 'GERENTE OPERACIONAL',
  gerente_comercial: 'GERENTE COMERCIAL',
  gerente_administrativo: 'GERENTE ADMINISTRATIVO',
  gerente_financeiro: 'GERENTE FINANCEIRO',
  auxiliar_manutencao: 'AUXILIAR DE MANUTENÇÃO',
  assistente_administrativo: 'ASSISTENTE ADMINISTRATIVO',
  assistente_comercial: 'ASSISTENTE COMERCIAL',
  tecnico_n1: 'TÉCNICO DE MANUTENÇÃO N1',
  tecnico_n2: 'TÉCNICO DE MANUTENÇÃO N2',
  tecnico_n3: 'TÉCNICO DE MANUTENÇÃO N3',
  estagiario: 'ESTAGIÁRIO',
}

// Funções antigas (antes da lista acima) — o cadastro já foi convertido ao
// subir o servidor, mas itens de folhas geradas antes guardam a função da
// época como cópia, então o nome antigo ainda precisa ser exibido.
const FUNCOES_ANTIGAS = {
  gerente: 'Gerente',
  tecnico: 'Técnico',
  vendedor: 'Vendedor',
  auxiliar: 'Auxiliar',
}

export function labelFuncao(funcao) {
  return FUNCOES[funcao] || FUNCOES_ANTIGAS[funcao] || funcao || '-'
}
