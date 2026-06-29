import { CheckCircle2, Copy } from 'lucide-react';
import { useState } from 'react';
import { copiarTexto } from '../utils/clipboard';

export default function ResultadoTabela({ produtos, total = produtos.length }) {
  const [linhaCopiada, setLinhaCopiada] = useState(null);

  async function copiarPlu(plu) {
    await copiarTexto(plu);
    setLinhaCopiada(plu);
    setTimeout(() => {
      setLinhaCopiada(null);
    }, 1500);
  }

  return (
    <div className="resultado-tabela-container">
      <div className="tabela-scroll">
        <table className="resultado-tabela">
          <thead>
            <tr>
              <th>PLU</th>
              <th>Descricao</th>
              <th>Categoria</th>
              <th>Secao</th>
              <th>Tipo</th>
              <th>Emb.</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((produto) => (
              <tr key={produto.plu}>
                <td className="plu-cell">
                  <strong>{produto.plu}</strong>
                </td>
                <td className="descricao-cell">{produto.descricao}</td>
                <td className="categoria-cell">
                  <span className="badge-tabela">{produto.categoria}</span>
                </td>
                <td className="tipo-cell">{produto.secao}</td>
                <td className="tipo-cell">{produto.tipoPlu || produto.tipo}</td>
                <td className="tipo-cell">{produto.embalagemMultiplo || '-'}</td>
                <td className="acao-cell">
                  <button className="icon-button" onClick={() => copiarPlu(produto.plu)} title="Copiar PLU">
                    {linhaCopiada === produto.plu ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="resultado-info">Mostrando {produtos.length} de {total}</p>
    </div>
  );
}
