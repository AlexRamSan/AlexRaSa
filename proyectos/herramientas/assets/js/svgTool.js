// Utilitarios compartidos. Mantener liviano.
export function materialColor(id){
  const map = {
    carbide: '#87f7ff',
    hss:     '#a7b7ff',
    pcd:     '#ffe38f',
    cbn:     '#ffb3c1',
  };
  return map[id] || '#bfe7ff';
}

// (Opcional) paleta común si la quieres en otros módulos
export const PALETTE = {
  dim: '#6ee7ff',
  bodyStroke: '#2a4f7a',
  cl:  '#17314d',
  sl:  '#132a45',
  ohl: '#0f2238',
};

