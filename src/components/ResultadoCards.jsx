import ProdutoCard from './ProdutoCard';

export default function ResultadoCards({ produtos, total = produtos.length }) {
  return (
    <div className="resultado-cards-container">
      <div className="cards-grid">
        {produtos.map((produto) => (
          <ProdutoCard key={produto.plu} produto={produto} />
        ))}
      </div>
      <p className="resultado-info">Mostrando {produtos.length} de {total}</p>
    </div>
  );
}
