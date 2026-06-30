import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Filter,
  Grid3x3,
  List,
  PackageCheck,
  PackageSearch,
  Palette,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import Header from './components/Header';
import Footer from './components/Footer';
import ProdutoCard from './components/ProdutoCard';
import ResultadoTabela from './components/ResultadoTabela';
import ResultadoCards from './components/ResultadoCards';
import {
  ADMIN_MATRICULA,
  CONTATO_LIBERACAO,
  assinarValidadesRemotas,
  aprovarUsuario,
  bancoAtivo,
  cadastrarUsuario,
  carregarPreferenciasUsuario,
  carregarProdutosBaseRemotos,
  carregarUsuariosAdmin,
  carregarDadosRemotos,
  carregarValidadesRemotas,
  formatarTelefone,
  loginUsuario,
  registrarAtividadeUsuario,
  removerUsuario,
  removerValidadeRemota,
  salvarPreferenciasUsuario,
  salvarValidadesRemotas,
  telefoneValido,
} from './services/database';
import { calcularUltimoDigito, montarPluCompleto, somenteNumeros } from './utils/calcularDigito';
import { copiarTexto } from './utils/clipboard';
import { buscarProdutoExato, buscarProdutos } from './utils/filtros';

function listarCategoriasProdutos(listaProdutos) {
  return [
    'Todas',
    ...Array.from(new Set(listaProdutos.map((produto) => produto.categoria || 'Outros'))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    ),
  ];
}

function normalizarSecaoProduto(secao) {
  const valor = String(secao || 'Outros').trim();
  const valorNormalizado = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (valorNormalizado === 'carnes' || valorNormalizado === 'outros') {
    return 'Carnes e Aves';
  }

  return valor || 'Carnes e Aves';
}

function listarSecoesProdutos(listaProdutos) {
  return Array.from(new Set(listaProdutos.map((produto) => normalizarSecaoProduto(produto.secao))))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function contarProdutosPorSecao(listaProdutos) {
  return listaProdutos.reduce((resultado, produto) => {
    const secao = normalizarSecaoProduto(produto.secao);
    resultado[secao] = (resultado[secao] || 0) + 1;
    return resultado;
  }, {});
}

const navegacao = [
  { path: '/', label: 'Validade', icon: CalendarCheck },
  { path: '/plu', label: 'PLU', icon: Calculator },
  { action: 'cadastro', label: 'Cadastrar', icon: PackageCheck },
  { path: '/pesquisa-plu', label: 'Pesquisa', icon: Search },
  { path: '/configuracao', label: 'Config', icon: Settings },
];

const quantidadeInicialPesquisaPlu = 60;
const quantidadeIncrementoPesquisaPlu = 60;

const statusConfig = {
  vencido: {
    label: 'Vencidos',
    badge: 'Vencido',
    icon: XCircle,
    tone: 'vermelho',
  },
  hoje: {
    label: 'Vence hoje',
    badge: 'Vence hoje',
    icon: AlertTriangle,
    tone: 'laranja-forte',
  },
  ate1: {
    label: 'Vencendo em 1 dia',
    badge: 'Vencendo em 1 dia',
    icon: Clock3,
    tone: 'laranja',
  },
  ate3Resf: {
    label: 'Vencendo em 3d RESF',
    badge: 'Vencendo em 3 dias',
    icon: Clock3,
    tone: 'amarelo-laranja',
  },
  ate3Cong: {
    label: 'Vencendo em 3d CONG',
    badge: 'Vencendo em 3 dias',
    icon: Clock3,
    tone: 'amarelo',
  },
  ate10Resf: {
    label: 'Vencendo em 10d RESF',
    badge: 'Vencendo em 10 dias',
    icon: CalendarCheck,
    tone: 'amarelo',
  },
  ate15: {
    label: 'Vencendo em 15 dias',
    badge: 'Vencendo em 15 dias',
    icon: CalendarCheck,
    tone: 'amarelo-claro',
  },
  ate30Cong: {
    label: 'Vencendo em 30d CONG',
    badge: 'Vencendo em 30 dias',
    icon: CalendarCheck,
    tone: 'amarelo-claro',
  },
  okResf: {
    label: '+15d RESF',
    badge: 'Mais de 15 dias',
    icon: ShieldCheck,
    tone: 'verde',
  },
  okCong: {
    label: '+30d CONG',
    badge: 'Mais de 30 dias',
    icon: ShieldCheck,
    tone: 'verde',
  },
};

const statusOrdem = [
  'vencido',
  'hoje',
  'ate1',
  'ate3Resf',
  'ate3Cong',
  'ate10Resf',
  'ate15',
  'ate30Cong',
  'okResf',
  'okCong',
];

const legacyStoragePrefix = 'semVencer.';
const sessaoUsuarioStorageKey = 'semvencer.sessao.usuario';

const temasApp = [
  {
    id: 'claro',
    label: 'Google claro',
    description: 'Branco e azul',
  },
  {
    id: 'azul',
    label: 'Google azul',
    description: 'Azul suave',
  },
];

const appEmArquivoLocal = typeof window !== 'undefined' && window.location.protocol === 'file:';

function normalizarBase() {
  if (appEmArquivoLocal) {
    return '';
  }

  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

const basePath = normalizarBase();

function resolverRota(pathname) {
  let path = appEmArquivoLocal
    ? decodeURIComponent((window.location.hash || '#/').replace(/^#/, '') || '/')
    : decodeURIComponent(pathname || '/');

  if (basePath && basePath !== '/' && path === basePath) {
    path = '/';
  } else if (basePath && basePath !== '/' && path.startsWith(`${basePath}/`)) {
    path = path.slice(basePath.length);
  }

  if (!path || path === '') {
    return '/';
  }

  const aliases = {
    '/dashboard': '/',
    '/validades': '/',
    '/pesquisa': '/pesquisa-plu',
    '/pesquisa-de-plu': '/pesquisa-plu',
    '/pesquisa de plu': '/pesquisa-plu',
  };

  return aliases[path] || path;
}

function criarHref(path) {
  if (appEmArquivoLocal) {
    return `#${path}`;
  }

  if (!basePath || basePath === '/') {
    return path;
  }

  return `${basePath}${path === '/' ? '/' : path}`;
}

function criarDataRelativa(dias) {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function inferirTipoConservacao(valor) {
  const texto = String(valor || '').toUpperCase();
  if (texto.includes('CONG') || texto.includes('CONGEL')) return 'CONG';
  return 'RESF';
}

function normalizarTipoProduto(valor) {
  const texto = String(valor || '').trim().toUpperCase();
  if (texto === 'RESF' || texto === 'RESFRIADO') return 'RESF';
  if (texto === 'CONG' || texto === 'CONGELADO') return 'CONG';
  return inferirTipoConservacao(texto);
}

function inferirUnidadeProduto(valor) {
  const texto = String(valor || '').toUpperCase();
  return /\bUN\b/.test(texto) ? 'un' : 'kg';
}

function extrairUnidadeQuantidade(valor) {
  return String(valor || '').toLowerCase().includes('un') ? 'un' : 'kg';
}

function limparQuantidade(valor) {
  const somenteQuantidade = String(valor || '').replace(/[^\d,.]/g, '').replace(/\./g, ',');
  const partes = somenteQuantidade.split(',');
  return partes.length > 1 ? `${partes[0]},${partes.slice(1).join('')}` : partes[0];
}

function extrairNumeroQuantidade(valor) {
  const match = String(valor || '').match(/\d+(?:[,.]\d+)?/);
  return match ? limparQuantidade(match[0]) : '';
}

function formatarQuantidade(valor, unidade) {
  return `${limparQuantidade(valor) || '1'} ${unidade === 'un' ? 'un' : 'kg'}`;
}

function formatarEmbalagemProduto(valor) {
  if (valor === undefined || valor === null || valor === '') return '';
  const numero = Number(valor);

  if (Number.isFinite(numero)) {
    if (numero === 1) {
      return 'Caixa por KG';
    }

    return `Caixa com: ${String(numero).replace('.', ',')}`;
  }

  return String(valor);
}

function limparDadosLocaisAntigos() {
  try {
    const chaves = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const chave = window.localStorage.key(index);
      if (chave?.startsWith(legacyStoragePrefix)) {
        chaves.push(chave);
      }
    }

    chaves.forEach((chave) => window.localStorage.removeItem(chave));
  } catch (error) {
    console.warn('Nao foi possivel limpar dados locais antigos', error);
  }
}

function normalizarTema(valor) {
  return temasApp.some((tema) => tema.id === valor) ? valor : 'claro';
}

function carregarTemaInicial() {
  return 'claro';
}

function normalizarValidadesSalvas(itens) {
  return itens.map((item) => {
    return {
      ...item,
      tipo: item.tipo ? normalizarTipoProduto(item.tipo) : inferirTipoConservacao(item.produto),
    };
  });
}

function serializarValidades(itens) {
  return JSON.stringify(
    [...itens]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((item) => ({
        id: item.id,
        produto: item.produto,
        plu: item.plu,
        categoria: item.categoria,
        lote: item.lote,
        setor: item.setor,
        tipo: item.tipo,
        quantidade: item.quantidade,
        fabricacao: item.fabricacao,
        validade: item.validade,
        responsavel: item.responsavel,
        revisado: Boolean(item.revisado),
      })),
  );
}

function chaveValidadesUsuario(usuario) {
  const matricula = somenteNumeros(usuario?.matricula);
  return matricula ? `supabase.validades.usuario.${matricula}` : '';
}

function chaveSecoesUsuario(usuario) {
  const matricula = somenteNumeros(usuario?.matricula);
  return matricula ? `supabase.secoes.usuario.${matricula}` : '';
}

function chaveSecoesConfiguradasUsuario(usuario) {
  const matricula = somenteNumeros(usuario?.matricula);
  return matricula ? `supabase.secoes.configuradas.usuario.${matricula}` : '';
}

function normalizarSecoesSelecionadas(valor) {
  if (!Array.isArray(valor)) return [];

  return Array.from(new Set(valor.map((secao) => normalizarSecaoProduto(secao)).filter(Boolean)));
}

function carregarSecoesDoUsuario(usuario) {
  return usuario ? [] : [];
}

function carregarSecoesConfiguradasUsuario(usuario) {
  return Boolean(usuario?.admin);
}

function usuarioPodeAcessar(usuario) {
  return Boolean(usuario?.admin || usuario?.aprovado);
}

function salvarSessaoUsuario(usuario) {
  try {
    const matricula = somenteNumeros(usuario?.matricula);
    if (!matricula || !usuarioPodeAcessar(usuario)) return;

    const id = String(usuario?.id || '');
    const sessao = {
      id: id && !id.startsWith('local-') ? id : '',
      matricula,
      salvoEm: new Date().toISOString(),
    };

    window.localStorage.setItem(sessaoUsuarioStorageKey, JSON.stringify(sessao));
  } catch (error) {
    console.warn('Nao foi possivel salvar sessao do usuario', error);
  }
}

function removerSessaoUsuario() {
  try {
    window.localStorage.removeItem(sessaoUsuarioStorageKey);
  } catch (error) {
    console.warn('Nao foi possivel limpar sessao do usuario', error);
  }
}

function erroExigeNovoLogin(error) {
  const mensagem = normalizarTexto(error?.message || error);

  return (
    mensagem.includes('sessao invalida') ||
    mensagem.includes('sessao local nao encontrada') ||
    mensagem.includes('cadastro pendente') ||
    mensagem.includes('matricula nao cadastrada') ||
    mensagem.includes('aguarde a aprovacao')
  );
}

function descreverAtividadeUsuario(rota, cadastroAberto, cadastroEdicaoId, produtoDetalhe) {
  if (cadastroAberto) {
    return {
      acao: cadastroEdicaoId ? 'produto_edicao_aberta' : 'produto_cadastro_aberto',
      categoria: 'produto',
      descricao: cadastroEdicaoId ? 'Abriu a edicao de um produto' : 'Abriu o cadastro de produto',
      entidadeTipo: cadastroEdicaoId ? 'validade' : '',
      entidadeId: cadastroEdicaoId || '',
    };
  }

  if (produtoDetalhe) {
    return {
      acao: 'produto_visualizado',
      categoria: 'produto',
      descricao: `Visualizou ${produtoDetalhe.produto}`,
      entidadeTipo: 'validade',
      entidadeId: produtoDetalhe.id,
      detalhes: {
        produto: produtoDetalhe.produto,
        plu: produtoDetalhe.plu,
        validade: produtoDetalhe.validade,
        quantidade: produtoDetalhe.quantidade,
      },
    };
  }

  if (rota === '/plu') {
    return { acao: 'pagina_visualizada', categoria: 'navegacao', descricao: 'Acessou a calculadora de PLU' };
  }
  if (rota === '/pesquisa-plu') {
    return { acao: 'pagina_visualizada', categoria: 'navegacao', descricao: 'Acessou a pesquisa de PLU' };
  }
  if (rota === '/configuracao') {
    return { acao: 'pagina_visualizada', categoria: 'navegacao', descricao: 'Acessou as configuracoes' };
  }

  return { acao: 'pagina_visualizada', categoria: 'navegacao', descricao: 'Acessou as validades' };
}

function formatarData(dataISO) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${dataISO}T00:00:00`));
}

function formatarDataCurta(dataISO) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${dataISO}T00:00:00`));
}

function formatarDataHora(dataISO) {
  if (!dataISO) return 'Sem registro';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dataISO));
}

function diferencaEmDias(dataISO) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${dataISO}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function classificarValidade(dias, tipo) {
  const tipoProduto = normalizarTipoProduto(tipo);

  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoje';
  if (dias <= 1) return 'ate1';

  if (dias <= 3) {
    return tipoProduto === 'CONG' ? 'ate3Cong' : 'ate3Resf';
  }

  if (tipoProduto === 'RESF' && dias <= 10) return 'ate10Resf';
  if (dias <= 15) return 'ate15';
  if (tipoProduto === 'CONG' && dias <= 30) return 'ate30Cong';

  return tipoProduto === 'CONG' ? 'okCong' : 'okResf';
}

function textoPrazo(dias) {
  if (dias < 0) return `${Math.abs(dias)} dia(s) vencido`;
  if (dias === 0) return 'vence hoje';
  return `vence em ${dias} dia(s)`;
}

function textoDiasTabela(dias) {
  if (dias < 0) {
    const total = Math.abs(dias);
    return `${total} ${total === 1 ? 'dia vencido' : 'dias vencidos'}`;
  }

  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function encontrarProdutosProvaveis(listaProdutos, nome, codigo, limite = 12) {
  const termoNome = normalizarTexto(nome);
  const termoCodigo = somenteNumeros(codigo);

  if (termoNome.length < 2 && termoCodigo.length < 2) {
    return [];
  }

  const palavras = termoNome.split(/\s+/).filter(Boolean);

  return listaProdutos
    .map((produto) => {
      const descricao = normalizarTexto(produto.descricao);
      let score = 0;

      if (termoCodigo) {
        if (produto.plu === termoCodigo) {
          score += 1000;
        } else if (produto.plu.startsWith(termoCodigo)) {
          score += 450 + termoCodigo.length;
        } else if (produto.plu.includes(termoCodigo)) {
          score += 220 + termoCodigo.length;
        }
      }

      if (termoNome.length >= 2) {
        if (descricao === termoNome) {
          score += 700;
        } else if (descricao.startsWith(termoNome)) {
          score += 420 + termoNome.length;
        } else if (descricao.includes(termoNome)) {
          score += 260 + termoNome.length;
        }

        const palavrasEncontradas = palavras.filter((palavra) => descricao.includes(palavra));
        score += palavrasEncontradas.length * 85;
      }

      return { produto, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.produto.descricao.localeCompare(b.produto.descricao))
    .slice(0, limite)
    .map((item) => item.produto);
}

function carregarUsuarioInicial() {
  try {
    const sessaoSalva = window.localStorage.getItem(sessaoUsuarioStorageKey);
    if (!sessaoSalva) return null;

    const sessao = JSON.parse(sessaoSalva);
    const matricula = somenteNumeros(sessao?.matricula);
    if (!matricula) {
      removerSessaoUsuario();
      return null;
    }

    const id = String(sessao?.id || '');

    return {
      id: id && !id.startsWith('local-') ? id : `local-${matricula}`,
      matricula,
      telefone: '',
      admin: false,
      aprovado: true,
      createdAt: '',
      lastLoginAt: '',
      sessaoRestaurada: true,
    };
  } catch (error) {
    removerSessaoUsuario();
    return null;
  }
}

function App() {
  const [rotaAtual, setRotaAtual] = useState(() => resolverRota(window.location.pathname));
  const [usuarioAtual, setUsuarioAtual] = useState(carregarUsuarioInicial);
  const [temaAtual, setTemaAtual] = useState(carregarTemaInicial);
  const [authErro, setAuthErro] = useState('');
  const [authMensagem, setAuthMensagem] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [tentativaSincronizacao, setTentativaSincronizacao] = useState(0);
  const [dadosRemotosCarregados, setDadosRemotosCarregados] = useState(false);
  const [usuarioDadosChave, setUsuarioDadosChave] = useState('');
  const [secoesSelecionadas, setSecoesSelecionadas] = useState(() => carregarSecoesDoUsuario(carregarUsuarioInicial()));
  const [secoesConfiguradas, setSecoesConfiguradas] = useState(() => carregarSecoesConfiguradasUsuario(carregarUsuarioInicial()));
  const [usuariosPendentes, setUsuariosPendentes] = useState([]);
  const [usuariosAdmin, setUsuariosAdmin] = useState([]);
  const [usuarioAdminSelecionado, setUsuarioAdminSelecionado] = useState(null);
  const [pluBase, setPluBase] = useState('');
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [categoria, setCategoria] = useState('Todas');
  const [copiado, setCopiado] = useState(false);
  const [visualizacao, setVisualizacao] = useState('tabela');
  const [visualizacaoValidades, setVisualizacaoValidades] = useState('tabela');
  const [produtosBase, setProdutosBase] = useState([]);
  const [validades, setValidades] = useState([]);
  const atualizacaoRemotaRef = useRef(false);
  const ultimaAtividadeRef = useRef({ chave: '', at: 0 });
  const [filtroValidade, setFiltroValidade] = useState('todos');
  const [buscaValidade, setBuscaValidade] = useState('');
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [cadastroEdicaoId, setCadastroEdicaoId] = useState(null);
  const [produtoDetalhe, setProdutoDetalhe] = useState(null);
  const [novoItem, setNovoItem] = useState({
    produto: '',
    plu: '',
    setor: '',
    tipo: '',
    quantidade: '',
    unidade: 'kg',
    validade: criarDataRelativa(5),
  });

  function aplicarValidadesRemotas(itens) {
    const normalizadas = normalizarValidadesSalvas(itens);

    setValidades((atuais) => {
      if (serializarValidades(atuais) === serializarValidades(normalizadas)) {
        return atuais;
      }

      atualizacaoRemotaRef.current = true;
      return normalizadas;
    });
  }

  useEffect(() => {
    const handlePopState = () => {
      setRotaAtual(resolverRota(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    limparDadosLocaisAntigos();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = temaAtual;
  }, [temaAtual]);

  useEffect(() => {
    if (usuarioAtual && usuarioPodeAcessar(usuarioAtual)) {
      salvarSessaoUsuario(usuarioAtual);
    }
  }, [usuarioAtual]);

  useEffect(() => {
    setSecoesSelecionadas(carregarSecoesDoUsuario(usuarioAtual));
    setSecoesConfiguradas(carregarSecoesConfiguradasUsuario(usuarioAtual));
  }, [usuarioAtual?.matricula]);

  useEffect(() => {
    if (!usuarioAtual || !usuarioPodeAcessar(usuarioAtual) || !secoesConfiguradas) {
      return;
    }

    if (!dadosRemotosCarregados || usuarioDadosChave !== chaveValidadesUsuario(usuarioAtual)) {
      return;
    }

    const preferencias = {
      secoesSelecionadas,
      secoesConfiguradas,
      tema: temaAtual,
    };

    salvarPreferenciasUsuario(usuarioAtual, preferencias).catch((error) => {
      console.warn('Nao foi possivel sincronizar preferencias', error);
    });
  }, [
    dadosRemotosCarregados,
    secoesConfiguradas,
    secoesSelecionadas,
    temaAtual,
    usuarioAtual,
    usuarioDadosChave,
  ]);

  useEffect(() => {
    let cancelado = false;

    carregarProdutosBaseRemotos()
      .then((itens) => {
        if (!cancelado && Array.isArray(itens)) {
          setProdutosBase(itens);
        }
      })
      .catch((error) => {
        if (!cancelado) {
          setProdutosBase([]);
          setAuthErro(error.message || 'Nao foi possivel carregar produtos do Supabase.');
        }
        console.warn('Nao foi possivel carregar produtos do Supabase', error);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!usuarioAtual || usuarioPodeAcessar(usuarioAtual)) {
      return;
    }

    removerSessaoUsuario();
    setUsuarioAtual(null);
    setValidades([]);
    setUsuarioDadosChave('');
    setDadosRemotosCarregados(false);
    setAuthMensagem(`Cadastro pendente. Entre em contato com ${CONTATO_LIBERACAO} para liberar o acesso.`);
  }, [usuarioAtual]);

  useEffect(() => {
    if (!usuarioAtual?.admin) {
      setUsuariosPendentes([]);
      setUsuariosAdmin([]);
      setUsuarioAdminSelecionado(null);
      return undefined;
    }

    let cancelado = false;

    async function carregarListaAdmin() {
      try {
        const usuarios = await carregarUsuariosAdmin();
        if (!cancelado) {
          setUsuariosAdmin(usuarios);
          setUsuariosPendentes(usuarios.filter((usuario) => !usuario.admin && !usuario.aprovado));
          setUsuarioAdminSelecionado((usuarioSelecionado) =>
            usuarioSelecionado ? usuarios.find((usuario) => usuario.matricula === usuarioSelecionado.matricula) || usuarioSelecionado : null,
          );
        }
      } catch (error) {
        console.warn('Nao foi possivel carregar usuarios admin', error);
      }
    }

    carregarListaAdmin();
    const intervalo = window.setInterval(carregarListaAdmin, 20000);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
    };
  }, [usuarioAtual?.admin, usuarioAtual?.id]);

  useEffect(() => {
    if (!usuarioAtual || !usuarioPodeAcessar(usuarioAtual)) {
      return undefined;
    }

    const atividade = descreverAtividadeUsuario(rotaAtual, cadastroAberto, cadastroEdicaoId, produtoDetalhe);
    const chaveAtividade = [
      usuarioAtual.id,
      atividade.acao,
      rotaAtual,
      atividade.entidadeId || '',
    ].join(':');
    const agora = Date.now();

    if (ultimaAtividadeRef.current.chave === chaveAtividade && agora - ultimaAtividadeRef.current.at < 30000) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      ultimaAtividadeRef.current = { chave: chaveAtividade, at: Date.now() };
      registrarAtividadeUsuario(usuarioAtual, atividade, rotaAtual).catch((error) => {
        console.warn('Nao foi possivel registrar atividade', error);
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [cadastroAberto, cadastroEdicaoId, produtoDetalhe, rotaAtual, usuarioAtual]);

  useEffect(() => {
    if (!usuarioAtual || !usuarioPodeAcessar(usuarioAtual) || dadosRemotosCarregados) {
      return undefined;
    }

    let cancelado = false;

    async function carregarBanco() {
      setSincronizando(true);
      setAuthErro('');

      try {
        const dados = await carregarDadosRemotos(usuarioAtual);

        if (cancelado) return;

        const usuarioCarregado = dados.usuario || usuarioAtual;
        const preferencias = await carregarPreferenciasUsuario(usuarioCarregado, {
          secoesSelecionadas: [],
          secoesConfiguradas: false,
          tema: 'claro',
        });

        if (cancelado) return;

        if (
          dados.usuario &&
          (dados.usuario.id !== usuarioAtual.id ||
            dados.usuario.admin !== usuarioAtual.admin ||
            dados.usuario.aprovado !== usuarioAtual.aprovado ||
            dados.usuario.telefone !== usuarioAtual.telefone)
        ) {
          setUsuarioAtual(dados.usuario);
        }
        setSecoesSelecionadas(normalizarSecoesSelecionadas(preferencias.secoesSelecionadas));
        setSecoesConfiguradas(Boolean(preferencias.secoesConfiguradas));
        setTemaAtual(normalizarTema(preferencias.tema));
        aplicarValidadesRemotas(dados.validades);
        setUsuarioDadosChave(chaveValidadesUsuario(usuarioCarregado));
        setDadosRemotosCarregados(true);
      } catch (error) {
        if (!cancelado) {
          if (erroExigeNovoLogin(error)) {
            removerSessaoUsuario();
            setUsuarioAtual(null);
            setValidades([]);
            setUsuarioDadosChave('');
            setDadosRemotosCarregados(false);
            setAuthErro(error.message || 'Nao foi possivel validar a sessao no Supabase.');
          } else {
            salvarSessaoUsuario(usuarioAtual);
            setUsuarioDadosChave('');
            setDadosRemotosCarregados(false);
            setAuthErro('Nao foi possivel sincronizar agora. Sua sessao continua salva; tente novamente.');
          }
        }
      } finally {
        if (!cancelado) {
          setSincronizando(false);
        }
      }
    }

    carregarBanco();

    return () => {
      cancelado = true;
    };
  }, [dadosRemotosCarregados, temaAtual, tentativaSincronizacao, usuarioAtual]);

  useEffect(() => {
    if (!cadastroAberto && !produtoDetalhe && !usuarioAdminSelecionado) {
      return undefined;
    }

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [cadastroAberto, produtoDetalhe, usuarioAdminSelecionado]);

  useEffect(() => {
    if (!usuarioAtual || !dadosRemotosCarregados || usuarioDadosChave !== chaveValidadesUsuario(usuarioAtual)) return;
    if (atualizacaoRemotaRef.current) {
      atualizacaoRemotaRef.current = false;
      return;
    }

    salvarValidadesRemotas(validades, usuarioAtual).catch((error) => {
      console.warn('Nao foi possivel sincronizar validades', error);
    });
  }, [dadosRemotosCarregados, usuarioAtual, usuarioDadosChave, validades]);

  useEffect(() => {
    if (
      !bancoAtivo() ||
      !usuarioAtual ||
      !dadosRemotosCarregados ||
      usuarioDadosChave !== chaveValidadesUsuario(usuarioAtual) ||
      !usuarioAtual.id ||
      String(usuarioAtual.id).startsWith('local-')
    ) {
      return undefined;
    }

    let cancelado = false;

    async function atualizarValidadesRemotas() {
      try {
        const itens = await carregarValidadesRemotas(usuarioAtual);
        if (!cancelado) {
          aplicarValidadesRemotas(itens);
        }
      } catch (error) {
        console.warn('Nao foi possivel atualizar validades do Supabase', error);
      }
    }

    const cancelarAssinatura = assinarValidadesRemotas(usuarioAtual, atualizarValidadesRemotas, (error) => {
      console.warn('Realtime do Supabase indisponivel, usando atualizacao periodica', error);
    });
    const intervalo = window.setInterval(atualizarValidadesRemotas, 5000);

    window.addEventListener('focus', atualizarValidadesRemotas);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      window.removeEventListener('focus', atualizarValidadesRemotas);
      cancelarAssinatura();
    };
  }, [dadosRemotosCarregados, usuarioAtual, usuarioDadosChave]);

  const produtosBaseComSecao = useMemo(
    () =>
      produtosBase.map((produto) => ({
        ...produto,
        secao: normalizarSecaoProduto(produto.secao),
      })),
    [produtosBase],
  );
  const secoesProdutos = useMemo(() => listarSecoesProdutos(produtosBaseComSecao), [produtosBaseComSecao]);
  const contagemSecoesProdutos = useMemo(() => contarProdutosPorSecao(produtosBaseComSecao), [produtosBaseComSecao]);
  const produtoBasePorPlu = useMemo(
    () => new Map(produtosBaseComSecao.map((produto) => [somenteNumeros(produto.plu), produto])),
    [produtosBaseComSecao],
  );
  const secoesSelecionadasValidas = useMemo(
    () => secoesSelecionadas.filter((secao) => secoesProdutos.includes(secao)),
    [secoesProdutos, secoesSelecionadas],
  );
  const produtosFiltradosPorSecao = useMemo(() => {
    if (secoesSelecionadasValidas.length === 0) {
      return produtosBaseComSecao;
    }

    const secoesPermitidas = new Set(secoesSelecionadasValidas);
    return produtosBaseComSecao.filter((produto) => secoesPermitidas.has(normalizarSecaoProduto(produto.secao)));
  }, [produtosBaseComSecao, secoesSelecionadasValidas]);

  const baseLimpa = somenteNumeros(pluBase);
  const ultimoDigito = calcularUltimoDigito(baseLimpa);
  const pluCompleto = montarPluCompleto(baseLimpa);
  const produtoCalculado = buscarProdutoExato(produtosFiltradosPorSecao, pluCompleto);
  const categoriasProdutos = useMemo(() => listarCategoriasProdutos(produtosFiltradosPorSecao), [produtosFiltradosPorSecao]);

  useEffect(() => {
    if (!categoriasProdutos.includes(categoria)) {
      setCategoria('Todas');
    }
  }, [categoria, categoriasProdutos]);

  const resultados = useMemo(() => {
    const termoAtivo = termoPesquisa.trim().length > 0;
    const categoriaAtivaBusca = (categoria || 'Todas') !== 'Todas';

    if (!termoAtivo && !categoriaAtivaBusca) {
      return [];
    }

    return buscarProdutos(produtosFiltradosPorSecao, termoPesquisa, categoria);
  }, [produtosFiltradosPorSecao, termoPesquisa, categoria]);

  const validadesTratadas = useMemo(() => {
    return validades
      .map((item) => {
        const dias = diferencaEmDias(item.validade);
        const tipo = item.tipo ? normalizarTipoProduto(item.tipo) : inferirTipoConservacao(item.produto);
        const status = classificarValidade(dias, tipo);
        const config = statusConfig[status];
        const produtoBase = produtoBasePorPlu.get(somenteNumeros(item.plu));

        return {
          ...item,
          tipo,
          nomeProduto: item.produto || produtoBase?.descricao || 'Produto sem nome',
          categoria: produtoBase?.categoria || item.categoria || 'Cadastro',
          tipoPlu: produtoBase?.tipoPlu || 'Nao informado',
          secao: produtoBase?.secao ? normalizarSecaoProduto(produtoBase.secao) : 'Nao informado',
          embalagem: formatarEmbalagemProduto(produtoBase?.embalagemMultiplo),
          dias,
          status,
          statusBadge: config.badge,
          statusLabel: config.label,
          statusTone: config.tone,
          prazo: textoPrazo(dias),
        };
      })
      .sort((a, b) => a.dias - b.dias || a.produto.localeCompare(b.produto));
  }, [produtoBasePorPlu, validades]);

  const resumoValidades = useMemo(() => {
    const resumo = statusOrdem.reduce(
      (resultado, status) => ({
        ...resultado,
        [status]: 0,
      }),
      { total: validadesTratadas.length },
    );

    validadesTratadas.forEach((item) => {
      if (typeof resumo[item.status] === 'number') {
        resumo[item.status] += 1;
      }
    });

    return resumo;
  }, [validadesTratadas]);

  const statusResumoCards = useMemo(
    () => {
      const candidatos = statusOrdem
        .filter((status) => status !== 'vencido')
        .map((status) => ({
          id: status,
          value: resumoValidades[status] || 0,
          ...statusConfig[status],
        }));
      const ativos = candidatos.filter((status) => status.value > 0);
      const vazios = candidatos.filter((status) => status.value === 0);

      return [...ativos, ...vazios].slice(0, 3);
    },
    [resumoValidades],
  );

  const statusFiltros = useMemo(
    () =>
      statusOrdem
        .map((status) => ({
          id: status,
          value: resumoValidades[status] || 0,
          ...statusConfig[status],
        }))
        .filter((status) => status.value > 0),
    [resumoValidades],
  );

  const validadesFiltradas = useMemo(() => {
    const termo = buscaValidade.trim().toLowerCase();

    return validadesTratadas.filter((item) => {
      const combinaStatus = filtroValidade === 'todos' || item.status === filtroValidade;
      const combinaBusca =
        !termo ||
        item.produto.toLowerCase().includes(termo) ||
        item.plu.includes(somenteNumeros(termo)) ||
        item.lote.toLowerCase().includes(termo);

      return combinaStatus && combinaBusca;
    });
  }, [buscaValidade, filtroValidade, validadesTratadas]);

  async function entrarComMatricula(matricula) {
    setSincronizando(true);
    setAuthErro('');
    setAuthMensagem('');

    try {
      const usuario = await loginUsuario(matricula);
      salvarSessaoUsuario(usuario);
      setUsuarioAtual(usuario);
      setValidades([]);
      setUsuarioDadosChave('');
      setDadosRemotosCarregados(false);
    } catch (error) {
      setAuthErro(error.message || 'Nao foi possivel entrar.');
    } finally {
      setSincronizando(false);
    }
  }

  async function cadastrarComTelefone(dados) {
    setSincronizando(true);
    setAuthErro('');
    setAuthMensagem('');

    try {
      const usuario = await cadastrarUsuario(dados);
      if (!usuarioPodeAcessar(usuario)) {
        setAuthMensagem(`Cadastro enviado. Entre em contato com ${CONTATO_LIBERACAO} para liberar o acesso.`);
        return;
      }

      salvarSessaoUsuario(usuario);
      setUsuarioAtual(usuario);
      setValidades([]);
      setUsuarioDadosChave('');
      setDadosRemotosCarregados(false);
    } catch (error) {
      setAuthErro(error.message || 'Nao foi possivel cadastrar.');
    } finally {
      setSincronizando(false);
    }
  }

  function sair() {
    removerSessaoUsuario();
    setUsuarioAtual(null);
    setValidades([]);
    setUsuarioDadosChave('');
    setDadosRemotosCarregados(false);
  }

  function tentarSincronizarSessao() {
    setAuthErro('');
    setUsuarioDadosChave('');
    setDadosRemotosCarregados(false);
    setTentativaSincronizacao((tentativa) => tentativa + 1);
  }

  async function aprovarCadastroUsuario(matricula) {
    setSincronizando(true);

    try {
      await aprovarUsuario(matricula);
      setUsuariosPendentes((usuarios) => usuarios.filter((usuario) => usuario.matricula !== matricula));
      setUsuariosAdmin((usuarios) =>
        usuarios.map((usuario) =>
          usuario.matricula === matricula
            ? {
                ...usuario,
                aprovado: true,
                admin: false,
                atividade: {
                  ...(usuario.atividade || {}),
                  label: 'Cadastro aprovado',
                  at: new Date().toISOString(),
                },
              }
            : usuario,
        ),
      );
      setUsuarioAdminSelecionado((usuario) =>
        usuario?.matricula === matricula
          ? {
              ...usuario,
              aprovado: true,
              admin: false,
              atividade: {
                ...(usuario.atividade || {}),
                label: 'Cadastro aprovado',
                at: new Date().toISOString(),
              },
            }
          : usuario,
      );
    } catch (error) {
      console.warn('Nao foi possivel aprovar usuario', error);
    } finally {
      setSincronizando(false);
    }
  }

  async function excluirUsuarioAdmin(usuario) {
    if (!usuario) return;

    if (usuario.admin || usuario.matricula === ADMIN_MATRICULA || usuario.matricula === usuarioAtual?.matricula) {
      window.alert('Nao e permitido excluir este usuario.');
      return;
    }

    const confirmado = window.confirm(
      `Excluir o usuario ${usuario.matricula}? Essa acao remove tambem os produtos, preferencias e logs desse usuario.`,
    );

    if (!confirmado) return;

    setSincronizando(true);

    try {
      await removerUsuario(usuario, usuarioAtual);
      setUsuariosAdmin((usuarios) => usuarios.filter((item) => item.matricula !== usuario.matricula));
      setUsuariosPendentes((usuarios) => usuarios.filter((item) => item.matricula !== usuario.matricula));
      setUsuarioAdminSelecionado((selecionado) => (selecionado?.matricula === usuario.matricula ? null : selecionado));
    } catch (error) {
      console.warn('Nao foi possivel excluir usuario', error);
      window.alert(error.message || 'Nao foi possivel excluir o usuario.');
    } finally {
      setSincronizando(false);
    }
  }

  async function copiarPlu() {
    if (!pluCompleto) return;
    await copiarTexto(pluCompleto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  function navegar(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', criarHref(path));
    setRotaAtual(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function executarAcaoNavegacao(action) {
    if (action === 'cadastro') {
      abrirCadastroProduto();
    }
  }

  function atualizarNovoItem(campo, valor) {
    setNovoItem((itemAtual) => ({
      ...itemAtual,
      [campo]: valor,
    }));
  }

  function limparCadastro() {
    setNovoItem({
      produto: '',
      plu: '',
      setor: '',
      tipo: '',
      quantidade: '',
      unidade: 'kg',
      validade: criarDataRelativa(5),
    });
    setCadastroEdicaoId(null);
  }

  function abrirCadastroProduto() {
    limparCadastro();
    setCadastroAberto(true);
  }

  function fecharCadastroProduto() {
    setCadastroAberto(false);
    limparCadastro();
  }

  function abrirEdicaoProduto(item) {
    setNovoItem({
      produto: item.produto,
      plu: item.plu === 'Sem PLU' ? '' : item.plu,
      setor: item.setor.includes('Câmara') ? 'Câmara' : 'Área de venda',
      tipo: item.tipo ? normalizarTipoProduto(item.tipo) : inferirTipoConservacao(item.produto),
      quantidade: extrairNumeroQuantidade(item.quantidade),
      unidade: extrairUnidadeQuantidade(item.quantidade),
      validade: item.validade,
    });
    setCadastroEdicaoId(item.id);
    setCadastroAberto(true);
  }

  function adicionarValidade(event) {
    event.preventDefault();

    if (!novoItem.produto.trim() || !novoItem.validade) {
      return;
    }

    const codigoLimpo = somenteNumeros(novoItem.plu);
    const pluFinal = codigoLimpo || 'Sem PLU';
    const quantidadeFinal = formatarQuantidade(novoItem.quantidade, novoItem.unidade);
    const tipoFinal = novoItem.tipo ? normalizarTipoProduto(novoItem.tipo) : inferirTipoConservacao(novoItem.produto);
    const produtoFinal = novoItem.produto.trim();

    if (cadastroEdicaoId) {
      const itemId = cadastroEdicaoId;
      setValidades((itens) =>
        itens.map((item) =>
          item.id === itemId
            ? {
                ...item,
                produto: produtoFinal,
                plu: pluFinal,
                setor: novoItem.setor,
                tipo: tipoFinal,
                quantidade: quantidadeFinal,
                validade: novoItem.validade,
              }
            : item,
        ),
      );
      registrarAtividadeUsuario(
        usuarioAtual,
        {
          acao: 'produto_editado',
          categoria: 'produto',
          descricao: `Editou ${produtoFinal}`,
          entidadeTipo: 'validade',
          entidadeId: itemId,
          detalhes: {
            produto: produtoFinal,
            plu: pluFinal,
            quantidade: quantidadeFinal,
            validade: novoItem.validade,
            tipo: tipoFinal,
            local: novoItem.setor,
          },
        },
        rotaAtual,
      ).catch((error) => console.warn('Nao foi possivel registrar edicao', error));
      setCadastroAberto(false);
      limparCadastro();
      return;
    }

    const novoId = `validade-${Date.now()}`;
    setValidades((itens) => [
      {
        id: novoId,
        produto: produtoFinal,
        plu: pluFinal,
        categoria: 'Cadastro',
        setor: novoItem.setor,
        tipo: tipoFinal,
        lote: 'Cadastro manual',
        quantidade: quantidadeFinal,
        fabricacao: criarDataRelativa(-1),
        validade: novoItem.validade,
        responsavel: 'Cadastro mobile',
        revisado: false,
      },
      ...itens,
    ]);

    registrarAtividadeUsuario(
      usuarioAtual,
      {
        acao: 'produto_cadastrado',
        categoria: 'produto',
        descricao: `Cadastrou ${produtoFinal}`,
        entidadeTipo: 'validade',
        entidadeId: novoId,
        detalhes: {
          produto: produtoFinal,
          plu: pluFinal,
          quantidade: quantidadeFinal,
          validade: novoItem.validade,
          tipo: tipoFinal,
          local: novoItem.setor,
        },
      },
      rotaAtual,
    ).catch((error) => console.warn('Nao foi possivel registrar cadastro', error));

    setCadastroAberto(false);
    limparCadastro();
  }

  function excluirProduto(id) {
    const itemExcluido = validades.find((item) => item.id === id);
    setValidades((itens) => itens.filter((item) => item.id !== id));
    removerValidadeRemota(id).catch((error) => {
      console.warn('Nao foi possivel remover do Supabase', error);
    });
    registrarAtividadeUsuario(
      usuarioAtual,
      {
        acao: 'produto_excluido',
        categoria: 'produto',
        descricao: itemExcluido ? `Excluiu ${itemExcluido.produto}` : 'Excluiu um produto',
        entidadeTipo: 'validade',
        entidadeId: id,
        detalhes: itemExcluido
          ? {
              produto: itemExcluido.produto,
              plu: itemExcluido.plu,
              quantidade: itemExcluido.quantidade,
              validade: itemExcluido.validade,
              tipo: itemExcluido.tipo,
              local: itemExcluido.setor,
            }
          : {},
      },
      rotaAtual,
    ).catch((error) => console.warn('Nao foi possivel registrar exclusao', error));
  }

  function alternarSecaoProduto(secao) {
    setSecoesSelecionadas((atuais) => {
      const selecionadas = normalizarSecoesSelecionadas(atuais);

      if (selecionadas.includes(secao)) {
        return selecionadas.filter((item) => item !== secao);
      }

      return [...selecionadas, secao];
    });
  }

  function confirmarSecoesProdutos() {
    setSecoesConfiguradas(true);
  }

  function confirmarTodasSecoesProdutos() {
    setSecoesSelecionadas([]);
    setSecoesConfiguradas(true);
  }

  function usarTodasSecoesProdutos() {
    setSecoesSelecionadas([]);
  }

  const pageProps = {
    resumoValidades,
    statusResumoCards,
    statusFiltros,
    validadesTratadas,
    validadesFiltradas,
    produtos: produtosFiltradosPorSecao,
    produtosBaseTotal: produtosBase.length,
    produtosVisiveisTotal: produtosFiltradosPorSecao.length,
    secoesProdutos,
    contagemSecoesProdutos,
    secoesSelecionadas: secoesSelecionadasValidas,
    alternarSecaoProduto,
    confirmarSecoesProdutos,
    confirmarTodasSecoesProdutos,
    usarTodasSecoesProdutos,
    categorias: categoriasProdutos,
    pluBase,
    setPluBase,
    baseLimpa,
    ultimoDigito,
    pluCompleto,
    produtoCalculado,
    copiado,
    copiarPlu,
    termoPesquisa,
    setTermoPesquisa,
    categoria,
    setCategoria,
    resultados,
    visualizacao,
    setVisualizacao,
    visualizacaoValidades,
    setVisualizacaoValidades,
    filtroValidade,
    setFiltroValidade,
    buscaValidade,
    setBuscaValidade,
    novoItem,
    atualizarNovoItem,
    adicionarValidade,
    cadastroAberto,
    cadastroEdicaoId,
    abrirCadastroProduto,
    fecharCadastroProduto,
    abrirEdicaoProduto,
    excluirProduto,
    produtoDetalhe,
    setProdutoDetalhe,
    usuarioAtual,
    temaAtual,
    setTemaAtual,
    temas: temasApp,
    sincronizando,
    usuariosPendentes,
    usuariosAdmin,
    usuarioAdminSelecionado,
    setUsuarioAdminSelecionado,
    aprovarCadastroUsuario,
    excluirUsuarioAdmin,
    sair,
    navegar,
  };

  const rotaRenderizada = ['/plu', '/pesquisa-plu', '/configuracao'].includes(rotaAtual) ? rotaAtual : '/';

  if (!bancoAtivo()) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand">
            <PackageCheck size={28} />
            <div>
              <span>Sem Vencer</span>
              <h1>Banco online</h1>
            </div>
          </div>
          <div className="auth-error">Supabase nao configurado. Gere o app com as variaveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</div>
        </section>
      </main>
    );
  }

  if (!usuarioAtual || !usuarioPodeAcessar(usuarioAtual)) {
    return (
      <AuthPage
        erro={authErro}
        mensagem={authMensagem}
        loading={sincronizando}
        onLogin={entrarComMatricula}
        onCadastro={cadastrarComTelefone}
      />
    );
  }

  if (bancoAtivo() && !dadosRemotosCarregados) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand">
            <PackageCheck size={28} />
            <div>
              <span>Sem Vencer</span>
              <h1>Sincronizando</h1>
            </div>
          </div>
          {authErro ? (
            <>
              <div className="auth-error">{authErro}</div>
              <button className="primary-button" type="button" onClick={tentarSincronizarSessao}>
                Tentar novamente
              </button>
              <button className="auth-logout-button" type="button" onClick={sair}>
                Sair
              </button>
            </>
          ) : (
            <div className="auth-info">Carregando dados do Supabase...</div>
          )}
        </section>
      </main>
    );
  }

  if (!secoesConfiguradas) {
    return <OnboardingSecoesPage {...pageProps} />;
  }

  return (
    <main className="app-shell">
      <Header
        navItems={navegacao}
        activePath={rotaRenderizada}
        buildHref={criarHref}
        onNavigate={navegar}
        onAction={executarAcaoNavegacao}
        usuarioAtual={usuarioAtual}
        sincronizando={sincronizando}
      />

      <section className="page-shell">
        {rotaRenderizada === '/' && <ValidadesPage {...pageProps} />}
        {rotaRenderizada === '/plu' && <PluPage {...pageProps} />}
        {rotaRenderizada === '/pesquisa-plu' && <PesquisaPluPage {...pageProps} />}
        {rotaRenderizada === '/configuracao' && <ConfiguracaoPage {...pageProps} />}
      </section>

      {cadastroAberto && (
        <CadastroProdutoSheet
          produtosBase={produtosFiltradosPorSecao}
          novoItem={novoItem}
          cadastroEdicaoId={cadastroEdicaoId}
          atualizarNovoItem={atualizarNovoItem}
          adicionarValidade={adicionarValidade}
          fecharCadastroProduto={fecharCadastroProduto}
        />
      )}

      <Footer />
    </main>
  );
}

function PageTitle({ eyebrow, title, description, icon: Icon }) {
  return (
    <div className="page-title">
      <div className="title-icon">
        <Icon size={22} />
      </div>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function MetricCard({ status, value, label }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <article className={`metric-card tone-${config.tone}`}>
      <div>
        <span>{label || config.label}</span>
        <strong>{value}</strong>
      </div>
      <Icon size={24} />
    </article>
  );
}

function AuthPage({ erro, mensagem, loading, onLogin, onCadastro }) {
  const [modo, setModo] = useState('login');
  const [matricula, setMatricula] = useState('');
  const [telefone, setTelefone] = useState('');
  const matriculaLimpa = somenteNumeros(matricula);
  const telefoneLimpo = somenteNumeros(telefone);

  function enviar(event) {
    event.preventDefault();

    if (modo === 'login') {
      onLogin(matriculaLimpa);
      return;
    }

    if (!telefoneValido(telefoneLimpo)) {
      onCadastro({
        matricula: matriculaLimpa,
        telefone: telefoneLimpo,
      });
      return;
    }

    onCadastro({
      matricula: matriculaLimpa,
      telefone: telefoneLimpo,
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <PackageCheck size={28} />
          <div>
            <span>Sem Vencer</span>
            <h1>Acesso</h1>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={modo === 'login' ? 'active' : ''} onClick={() => setModo('login')} type="button">
            Login
          </button>
          <button className={modo === 'cadastro' ? 'active' : ''} onClick={() => setModo('cadastro')} type="button">
            Cadastro
          </button>
        </div>

        <form className="auth-form" onSubmit={enviar}>
          <label>
            Matricula
            <input
              value={matricula}
              inputMode="numeric"
              onChange={(event) => setMatricula(somenteNumeros(event.target.value))}
            />
          </label>

          {modo === 'cadastro' && (
            <label>
              Telefone
              <input
                value={formatarTelefone(telefone)}
                inputMode="tel"
                placeholder="(61) 99842-7629"
                maxLength={15}
                onChange={(event) => setTelefone(somenteNumeros(event.target.value).slice(0, 11))}
              />
            </label>
          )}

          {mensagem && <div className="auth-info">{mensagem}</div>}
          {erro && <div className="auth-error">{erro}</div>}

          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            <CheckCircle2 size={18} />
            {loading ? 'Aguarde...' : modo === 'login' ? 'Entrar' : 'Cadastrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

function OnboardingSecoesPage({
  usuarioAtual,
  secoesProdutos,
  contagemSecoesProdutos,
  secoesSelecionadas,
  produtosBaseTotal,
  produtosVisiveisTotal,
  alternarSecaoProduto,
  confirmarSecoesProdutos,
  confirmarTodasSecoesProdutos,
  sair,
}) {
  const usandoTodasSecoes = secoesSelecionadas.length === 0;

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="auth-brand">
          <PackageSearch size={28} />
          <div>
            <span>Sem Vencer</span>
            <h1>Seções do PLU</h1>
          </div>
        </div>

        <div className="onboarding-copy">
          <strong>Matricula {usuarioAtual?.matricula}</strong>
          <p>Escolha as seções que aparecem na pesquisa e nas sugestões do cadastro.</p>
        </div>

        <div className="section-selector-status">
          <div>
            <span>{usandoTodasSecoes ? 'Todas as seções' : `${secoesSelecionadas.length} seção(ões)`}</span>
            <strong>
              {produtosVisiveisTotal} de {produtosBaseTotal} produtos
            </strong>
          </div>
          <button type="button" onClick={confirmarTodasSecoesProdutos}>
            Usar todas
          </button>
        </div>

        <div className="section-options onboarding-options" role="group" aria-label="Seções da base de PLU">
          {secoesProdutos.map((secao) => {
            const ativa = secoesSelecionadas.includes(secao);

            return (
              <button key={secao} type="button" className={ativa ? 'active' : ''} onClick={() => alternarSecaoProduto(secao)}>
                <CheckCircle2 size={17} />
                <span>
                  <strong>{secao}</strong>
                  <small>{contagemSecoesProdutos[secao] || 0} produto(s)</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="onboarding-actions">
          <button className="primary-button" type="button" onClick={confirmarSecoesProdutos}>
            <CheckCircle2 size={18} />
            {usandoTodasSecoes ? 'Continuar com todas' : 'Salvar seleção'}
          </button>
          <button className="onboarding-logout" type="button" onClick={sair}>
            <X size={18} />
            Sair
          </button>
        </div>
      </section>
    </main>
  );
}

function PluPage({
  pluBase,
  setPluBase,
  baseLimpa,
  ultimoDigito,
  pluCompleto,
  produtoCalculado,
  copiado,
  copiarPlu,
}) {
  return (
    <div className="page-grid">
      <section className="tool-layout">
        <div className="tool-panel plu-entry-panel">
          <input
            className="input-principal"
            value={pluBase}
            inputMode="numeric"
            maxLength={7}
            placeholder="Digite o PLU base"
            onChange={(event) => setPluBase(somenteNumeros(event.target.value))}
          />

          {baseLimpa.length > 0 && baseLimpa.length < 2 && (
            <p className="field-alert">Digite pelo menos 2 números para calcular.</p>
          )}
        </div>

        <div className="result-panel">
          {ultimoDigito !== null ? (
            <>
              <span>Último dígito</span>
              <strong>{ultimoDigito}</strong>
              <p>
                PLU completo <b>{pluCompleto}</b>
              </p>
              <button className="primary-button" onClick={copiarPlu}>
                {copiado ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </>
          ) : (
            <div className="empty-result">
              <Calculator size={32} />
              <strong>Aguardando PLU</strong>
              <span>O dígito aparece assim que a base tiver números suficientes.</span>
            </div>
          )}
        </div>
      </section>

      {ultimoDigito !== null && (
        <section className="work-panel">
          {produtoCalculado ? (
            <ProdutoCard produto={produtoCalculado} />
          ) : (
            <div className="empty-state">Nenhum produto encontrado com o PLU completo {pluCompleto}.</div>
          )}
        </section>
      )}
    </div>
  );
}

function PesquisaPluPage({
  termoPesquisa,
  setTermoPesquisa,
  categoria,
  setCategoria,
  categorias,
  resultados,
  visualizacao,
  setVisualizacao,
}) {
  const [categoriasAberto, setCategoriasAberto] = useState(false);
  const [limiteResultados, setLimiteResultados] = useState(quantidadeInicialPesquisaPlu);
  const categoriaAtiva = categoria || 'Todas';
  const pesquisaAtiva = termoPesquisa.trim().length > 0 || categoriaAtiva !== 'Todas';
  const totalResultadoTexto = `${resultados.length} PLU ${resultados.length === 1 ? 'encontrado' : 'encontrados'}`;
  const resultadosVisiveis = useMemo(
    () => resultados.slice(0, limiteResultados),
    [limiteResultados, resultados],
  );
  const temMaisResultados = resultadosVisiveis.length < resultados.length;
  const totalVisivelTexto = temMaisResultados
    ? `Mostrando ${resultadosVisiveis.length} de ${resultados.length}`
    : totalResultadoTexto;

  useEffect(() => {
    setLimiteResultados(quantidadeInicialPesquisaPlu);
  }, [categoriaAtiva, termoPesquisa, visualizacao]);

  function atualizarTermoPesquisa(valor) {
    setLimiteResultados(quantidadeInicialPesquisaPlu);
    setTermoPesquisa(valor);
  }

  function atualizarCategoria(item) {
    setLimiteResultados(quantidadeInicialPesquisaPlu);
    setCategoria(item);
    setCategoriasAberto(false);
  }

  function atualizarVisualizacao(tipo) {
    setLimiteResultados(quantidadeInicialPesquisaPlu);
    setVisualizacao(tipo);
  }

  return (
    <div className="page-grid">
      <section className="work-panel">
        <div className="search-row">
          <div className="search-field">
            <Search size={20} />
            <input
              value={termoPesquisa}
              placeholder="Ex: frango, 789, carne moída"
              onChange={(event) => atualizarTermoPesquisa(event.target.value)}
            />
          </div>

          <div className="search-actions">
            <div className="view-toggle">
              <button
                className={visualizacao === 'cards' ? 'active' : ''}
                onClick={() => atualizarVisualizacao('cards')}
                title="Visualizar como cards"
              >
                <Grid3x3 size={18} />
              </button>
              <button
                className={visualizacao === 'tabela' ? 'active' : ''}
                onClick={() => atualizarVisualizacao('tabela')}
                title="Visualizar como tabela"
              >
                <List size={18} />
              </button>
            </div>

            <button
              className={categoriaAtiva === 'Todas' ? 'filter-action-button' : 'filter-action-button active'}
              type="button"
              onClick={() => setCategoriasAberto(true)}
              title={`Filtrar categoria: ${categoriaAtiva}`}
              aria-label={`Filtrar categoria: ${categoriaAtiva}`}
            >
              <Filter size={18} />
            </button>
          </div>
        </div>
      </section>

      {categoriasAberto && (
        <CategoriaFiltroSheet
          categorias={categorias}
          categoriaAtual={categoriaAtiva}
          onSelect={atualizarCategoria}
          onClose={() => setCategoriasAberto(false)}
        />
      )}

      <section className="work-panel">
        {pesquisaAtiva && (
          <div className="results-count">
            <strong>{totalResultadoTexto}</strong>
            {temMaisResultados && <span>{totalVisivelTexto}</span>}
          </div>
        )}

        {!pesquisaAtiva ? (
          <div className="empty-state">Digite um PLU, nome ou escolha uma categoria para pesquisar.</div>
        ) : resultados.length > 0 ? (
          visualizacao === 'cards' ? (
            <ResultadoCards produtos={resultadosVisiveis} total={resultados.length} />
          ) : (
            <ResultadoTabela produtos={resultadosVisiveis} total={resultados.length} />
          )
        ) : (
          <div className="empty-state">Nenhum PLU encontrado nessa pesquisa.</div>
        )}

        {temMaisResultados && (
          <button
            className="load-more-button"
            type="button"
            onClick={() => setLimiteResultados((limite) => limite + quantidadeIncrementoPesquisaPlu)}
          >
            Mostrar mais {Math.min(quantidadeIncrementoPesquisaPlu, resultados.length - resultadosVisiveis.length)} PLU
          </button>
        )}
      </section>
    </div>
  );
}

function CategoriaFiltroSheet({ categorias, categoriaAtual, onSelect, onClose }) {
  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="bottom-sheet category-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="categoria-filtro-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <span>Filtro</span>
            <h3 id="categoria-filtro-titulo">Categoria</h3>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Fechar filtro de categoria">
            <X size={20} />
          </button>
        </div>

        <div className="category-sheet-options">
          {categorias.map((item) => (
            <button
              key={item}
              type="button"
              className={categoriaAtual === item ? 'active' : ''}
              onClick={() => onSelect(item)}
            >
              <span>{item}</span>
              {categoriaAtual === item && <CheckCircle2 size={18} />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ValidadesPage({
  resumoValidades,
  statusResumoCards,
  statusFiltros,
  validadesTratadas,
  validadesFiltradas,
  visualizacaoValidades,
  setVisualizacaoValidades,
  filtroValidade,
  setFiltroValidade,
  abrirEdicaoProduto,
  excluirProduto,
  produtoDetalhe,
  setProdutoDetalhe,
}) {
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const filtroAtivo = filtroValidade !== 'todos';
  const totalProdutosTexto = `${validadesFiltradas.length} ${validadesFiltradas.length === 1 ? 'produto' : 'produtos'}`;

  return (
    <div className="page-grid">
      <div className="metrics-grid compact status-summary">
        {statusResumoCards.map((item) => (
          <MetricCard key={item.id} status={item.id} value={item.value} label={item.label} />
        ))}
      </div>

      <section className="work-panel">
        <div className="section-heading products-heading">
          <div>
            <h3>{totalProdutosTexto}</h3>
          </div>
          <div className="heading-actions">
            <div className="view-toggle list-tools" aria-label="Acoes da lista">
              <button
                className={visualizacaoValidades === 'tabela' ? 'active' : ''}
                onClick={() => setVisualizacaoValidades('tabela')}
                title="Visualizar como tabela"
              >
                <List size={18} />
              </button>
              <button
                className={visualizacaoValidades === 'cards' ? 'active' : ''}
                onClick={() => setVisualizacaoValidades('cards')}
                title="Visualizar como cards"
              >
                <Grid3x3 size={18} />
              </button>
              <button
                className={filtroAtivo ? 'active' : ''}
                onClick={() => setFiltroAberto(true)}
                title="Filtrar validades"
                type="button"
              >
                <Filter size={18} />
              </button>
              <button onClick={() => setCalendarioAberto(true)} title="Ver calendario" type="button">
                <CalendarCheck size={18} />
              </button>
            </div>
          </div>
        </div>

        {validadesFiltradas.length > 0 ? (
          visualizacaoValidades === 'cards' ? (
            <div className="validade-list">
              {validadesFiltradas.map((item) => (
                <ProdutoCadastroCard
                  key={item.id}
                  item={item}
                  onView={setProdutoDetalhe}
                  onEdit={abrirEdicaoProduto}
                  onDelete={excluirProduto}
                />
              ))}
            </div>
          ) : (
            <ProdutoCadastroTabela
              itens={validadesFiltradas}
              onView={setProdutoDetalhe}
              onEdit={abrirEdicaoProduto}
              onDelete={excluirProduto}
            />
          )
        ) : (
          <div className="empty-state">Nenhum produto cadastrado ainda.</div>
        )}
      </section>

      {produtoDetalhe && (
        <ProdutoDetalheSheet
          item={produtoDetalhe}
          onClose={() => setProdutoDetalhe(null)}
          onEdit={(item) => {
            setProdutoDetalhe(null);
            abrirEdicaoProduto(item);
          }}
          onDelete={(id) => {
            excluirProduto(id);
            setProdutoDetalhe(null);
          }}
        />
      )}

      {filtroAberto && (
        <FiltroValidadeSheet
          resumoValidades={resumoValidades}
          statusFiltros={statusFiltros}
          filtroValidade={filtroValidade}
          setFiltroValidade={setFiltroValidade}
          onClose={() => setFiltroAberto(false)}
        />
      )}

      {calendarioAberto && (
        <CalendarioValidadesSheet itens={validadesTratadas} onClose={() => setCalendarioAberto(false)} />
      )}
    </div>
  );
}

function FiltroValidadeSheet({ resumoValidades, statusFiltros, filtroValidade, setFiltroValidade, onClose }) {
  function selecionarFiltro(status) {
    setFiltroValidade(status);
    onClose();
  }

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="bottom-sheet filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filtro-validade-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <span>Filtro</span>
            <h3 id="filtro-validade-titulo">Validades</h3>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Fechar filtro">
            <X size={20} />
          </button>
        </div>

        <div className="filter-sheet-options">
          <button
            className={filtroValidade === 'todos' ? 'status-filter-chip active all' : 'status-filter-chip all'}
            onClick={() => selecionarFiltro('todos')}
            type="button"
          >
            Todos
            <strong>{resumoValidades.total}</strong>
          </button>
          {statusFiltros.map((item) => (
            <button
              key={item.id}
              className={
                filtroValidade === item.id
                  ? `status-filter-chip tone-${item.tone} active`
                  : `status-filter-chip tone-${item.tone}`
              }
              onClick={() => selecionarFiltro(item.id)}
              type="button"
            >
              {item.label}
              <strong>{item.value}</strong>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CalendarioValidadesSheet({ itens, onClose }) {
  const hoje = useMemo(() => {
    const data = new Date();
    data.setHours(0, 0, 0, 0);
    return data;
  }, []);

  const calendario = useMemo(() => {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const inicio = new Date(primeiroDia);
    inicio.setDate(primeiroDia.getDate() - primeiroDia.getDay());
    const totalCelulas = Math.ceil((primeiroDia.getDay() + ultimoDia.getDate()) / 7) * 7;

    const porData = itens.reduce((resultado, item) => {
      const chave = item.validade;
      return {
        ...resultado,
        [chave]: [...(resultado[chave] || []), item],
      };
    }, {});

    return Array.from({ length: totalCelulas }, (_, index) => {
      const data = new Date(inicio);
      data.setDate(inicio.getDate() + index);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(
        data.getDate(),
      ).padStart(2, '0')}`;
      const produtosDia = (porData[chave] || []).sort(
        (a, b) => statusOrdem.indexOf(a.status) - statusOrdem.indexOf(b.status) || a.dias - b.dias,
      );
      const config = produtosDia[0] ? statusConfig[produtosDia[0].status] : null;

      return {
        chave,
        dia: data.getDate(),
        noMes: data.getMonth() === mes,
        produtos: produtosDia,
        config,
      };
    });
  }, [hoje, itens]);

  const proximasDatas = useMemo(() => {
    return itens
      .filter((item) => item.dias >= 0)
      .sort((a, b) => a.dias - b.dias || a.produto.localeCompare(b.produto))
      .slice(0, 6);
  }, [itens]);

  const tituloMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(hoje);

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="bottom-sheet calendar-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendario-validade-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <span>Calendario</span>
            <h3 id="calendario-validade-titulo">{tituloMes}</h3>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Fechar calendario">
            <X size={20} />
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((dia) => (
            <span key={dia}>{dia}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {calendario.map((dia) => (
            <div
              className={
                dia.config
                  ? `calendar-day tone-${dia.config.tone}${dia.noMes ? '' : ' muted'}`
                  : `calendar-day${dia.noMes ? '' : ' muted'}`
              }
              key={dia.chave}
            >
              <span>{dia.dia}</span>
              {dia.produtos.length > 0 && <strong>{dia.produtos.length}</strong>}
            </div>
          ))}
        </div>

        <div className="calendar-next-list">
          {proximasDatas.map((item) => {
            const config = statusConfig[item.status];

            return (
              <div className={`calendar-next-item tone-${config.tone}`} key={item.id}>
                <i />
                <span>{formatarDataCurta(item.validade)}</span>
                <strong>{item.produto}</strong>
                <em>{config.badge}</em>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ConfiguracaoPage({
  usuarioAtual,
  temaAtual,
  setTemaAtual,
  temas,
  sincronizando,
  usuariosPendentes,
  usuariosAdmin,
  usuarioAdminSelecionado,
  setUsuarioAdminSelecionado,
  aprovarCadastroUsuario,
  excluirUsuarioAdmin,
  sair,
  secoesProdutos,
  contagemSecoesProdutos,
  secoesSelecionadas,
  produtosBaseTotal,
  produtosVisiveisTotal,
  alternarSecaoProduto,
  usarTodasSecoesProdutos,
}) {
  const usandoTodasSecoes = secoesSelecionadas.length === 0;
  const totalUsuarios = usuariosAdmin.length;
  const totalPendentes = usuariosPendentes.length;

  return (
    <div className="page-grid">
      <PageTitle
        eyebrow="Ajustes"
        title="Configuração"
        description="Preferências da base de PLU."
        icon={Settings}
      />

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span>Aparência</span>
            <h3>Tema</h3>
          </div>
          <Palette size={22} />
        </div>

        <div className="theme-options" role="group" aria-label="Tema do aplicativo">
          {temas.map((tema) => (
            <button
              key={tema.id}
              type="button"
              className={temaAtual === tema.id ? 'active' : ''}
              onClick={() => setTemaAtual(tema.id)}
            >
              <i className={`theme-preview theme-${tema.id}`} aria-hidden="true" />
              <span>
                <strong>{tema.label}</strong>
                <small>{tema.description}</small>
              </span>
              {temaAtual === tema.id && <CheckCircle2 size={18} />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span>Base de PLU</span>
            <h3>Seções usadas</h3>
          </div>
          <PackageSearch size={22} />
        </div>

        <div className="section-selector-status">
          <div>
            <span>{usandoTodasSecoes ? 'Todas as seções' : `${secoesSelecionadas.length} seção(ões)`}</span>
            <strong>
              {produtosVisiveisTotal} de {produtosBaseTotal} produtos
            </strong>
          </div>
          <button type="button" onClick={usarTodasSecoesProdutos} disabled={usandoTodasSecoes}>
            Usar todas
          </button>
        </div>

        <div className="section-options" role="group" aria-label="Seções da base de PLU">
          {secoesProdutos.map((secao) => {
            const ativa = secoesSelecionadas.includes(secao);

            return (
              <button key={secao} type="button" className={ativa ? 'active' : ''} onClick={() => alternarSecaoProduto(secao)}>
                <CheckCircle2 size={17} />
                <span>
                  <strong>{secao}</strong>
                  <small>{contagemSecoesProdutos[secao] || 0} produto(s)</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span>Conta</span>
            <h3>Sessao</h3>
          </div>
          <ShieldCheck size={22} />
        </div>

        <div className="session-panel">
          <div>
            <span>Matricula</span>
            <strong>{usuarioAtual?.matricula}</strong>
          </div>
          <div>
            <span>Perfil</span>
            <strong>{usuarioAtual?.admin ? 'Admin' : 'Usuario'}</strong>
          </div>
          <button className="session-logout" onClick={sair} type="button">
            <X size={18} />
            Sair
          </button>
        </div>

        {sincronizando && <div className="sync-note">Processando...</div>}
      </section>

      {usuarioAtual?.admin && (
        <section className="settings-panel">
          <div className="section-heading">
            <div>
              <span>Admin</span>
              <h3>Usuarios</h3>
            </div>
            <ShieldCheck size={22} />
          </div>

          <div className="admin-summary">
            <span>{totalUsuarios} usuario(s)</span>
            <strong>{totalPendentes} pendente(s)</strong>
          </div>

          {usuariosAdmin.length > 0 ? (
            <div className="admin-users">
              {usuariosAdmin.map((usuario) => (
                <UsuarioAdminCard
                  key={usuario.matricula}
                  usuario={usuario}
                  sincronizando={sincronizando}
                  onOpen={() => setUsuarioAdminSelecionado(usuario)}
                  onApprove={() => aprovarCadastroUsuario(usuario.matricula)}
                  onDelete={() => excluirUsuarioAdmin(usuario)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-access">Nenhum usuario encontrado.</div>
          )}
        </section>
      )}

      {usuarioAdminSelecionado && (
        <UsuarioAdminDetalheSheet
          usuario={usuarioAdminSelecionado}
          sincronizando={sincronizando}
          onClose={() => setUsuarioAdminSelecionado(null)}
          onApprove={() => aprovarCadastroUsuario(usuarioAdminSelecionado.matricula)}
          onDelete={() => excluirUsuarioAdmin(usuarioAdminSelecionado)}
        />
      )}
    </div>
  );
}

function statusUsuarioAdmin(usuario) {
  if (usuario.admin) return 'Admin';
  if (usuario.aprovado) return 'Liberado';
  return 'Pendente';
}

function tomUsuarioAdmin(usuario) {
  if (usuario.admin) return 'admin';
  if (usuario.aprovado) return 'approved';
  return 'pending';
}

function rotuloCategoriaAtividade(categoria) {
  if (categoria === 'produto') return 'Produto';
  if (categoria === 'conta') return 'Conta';
  if (categoria === 'configuracao') return 'Configuracao';
  return 'Navegacao';
}

function rotuloOrigemAtividade(origem) {
  return origem === 'app' ? 'Aplicativo' : 'Site';
}

function rotuloRotaAtividade(rota) {
  if (!rota || rota === '/') return 'Validades';
  if (rota === '/plu') return 'PLU';
  if (rota === '/pesquisa-plu') return 'Pesquisa';
  if (rota === '/configuracao') return 'Configuracao';
  return rota;
}

function detalhesLogAtividade(log) {
  const detalhes = log?.detalhes || {};
  const itens = [];

  if (detalhes.produto) itens.push(detalhes.produto);
  if (detalhes.plu && detalhes.plu !== 'Sem PLU') itens.push(`PLU ${detalhes.plu}`);
  if (detalhes.quantidade) itens.push(`Qtd. ${detalhes.quantidade}`);
  if (detalhes.validade) itens.push(`Val. ${formatarData(detalhes.validade)}`);
  if (detalhes.tipo) itens.push(detalhes.tipo);
  if (detalhes.local) itens.push(detalhes.local);

  return itens;
}

function UsuarioLogo({ usuario }) {
  const matricula = usuario?.matricula || '';
  const iniciais = matricula.slice(-2) || 'U';

  return <span className={`user-logo tone-${tomUsuarioAdmin(usuario)}`}>{iniciais}</span>;
}

function UsuarioAdminCard({ usuario, sincronizando, onOpen, onApprove, onDelete }) {
  const pendente = !usuario.admin && !usuario.aprovado;
  const podeExcluir = !usuario.admin && usuario.matricula !== ADMIN_MATRICULA;

  return (
    <article
      className="admin-user-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <UsuarioLogo usuario={usuario} />
      <span className="admin-user-main">
        <strong>{usuario.matricula}</strong>
        <small>{formatarTelefone(usuario.telefone) || 'Telefone nao informado'}</small>
        <em>{usuario.atividade?.label || 'Sem atividade recente'}</em>
        <time>{formatarDataHora(usuario.atividade?.at)}</time>
      </span>
      <span className={`admin-user-status tone-${tomUsuarioAdmin(usuario)}`}>{statusUsuarioAdmin(usuario)}</span>
      {pendente && (
        <button
          type="button"
          className="admin-approve-button"
          onClick={(event) => {
            event.stopPropagation();
            onApprove();
          }}
          disabled={sincronizando}
        >
          Aprovar
        </button>
      )}
      {podeExcluir && (
        <button
          type="button"
          className="admin-delete-button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={sincronizando}
        >
          <Trash2 size={15} />
          Excluir
        </button>
      )}
    </article>
  );
}

function UsuarioAdminDetalheSheet({ usuario, sincronizando, onClose, onApprove, onDelete }) {
  const pendente = !usuario.admin && !usuario.aprovado;
  const podeExcluir = !usuario.admin && usuario.matricula !== ADMIN_MATRICULA;
  const atividade = usuario.atividade || {};
  const historico = Array.isArray(atividade.historico) ? atividade.historico.slice(0, 12) : [];

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="bottom-sheet user-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usuario-detalhe-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <span>Usuario</span>
            <h3 id="usuario-detalhe-titulo">{usuario.matricula}</h3>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Fechar detalhes do usuario">
            <X size={20} />
          </button>
        </div>

        <div className={`user-detail-hero tone-${tomUsuarioAdmin(usuario)}`}>
          <UsuarioLogo usuario={usuario} />
          <div>
            <span>{statusUsuarioAdmin(usuario)}</span>
            <strong>{atividade.label || 'Sem atividade recente'}</strong>
            <small>{formatarDataHora(atividade.at)}</small>
          </div>
        </div>

        <div className="user-detail-grid">
          <DetailBox label="Matricula" value={usuario.matricula} destaque />
          <DetailBox label="Telefone" value={formatarTelefone(usuario.telefone)} destaque />
          <DetailBox label="Ultimo login" value={formatarDataHora(usuario.lastLoginAt)} />
          <DetailBox label="Cadastrado em" value={formatarDataHora(usuario.createdAt)} />
          <DetailBox label="Produtos atuais" value={atividade.totalProdutos ?? 0} />
          <DetailBox label="Logs recentes" value={atividade.totalAcoes ?? 0} />
          <DetailBox label="Logins recentes" value={atividade.totalLogins ?? 0} />
          <DetailBox label="Cadastros recentes" value={atividade.totalCadastros ?? 0} />
          <DetailBox label="Edicoes recentes" value={atividade.totalEdicoes ?? 0} />
          <DetailBox label="Exclusoes recentes" value={atividade.totalExclusoes ?? 0} />
          <DetailBox label="Origem recente" value={atividade.origem ? rotuloOrigemAtividade(atividade.origem) : 'Sem registro'} />
          <DetailBox label="Rota" value={atividade.rota || usuario.lastRoute || 'Sem rota'} />
          <DetailBox label="Ultimo produto" value={atividade.ultimoProduto || 'Nenhum produto'} wide />
          <DetailBox label="PLU / EAN" value={atividade.ultimoPlu || 'Sem PLU'} />
          <DetailBox label="Validade" value={atividade.ultimaValidade ? formatarData(atividade.ultimaValidade) : 'Sem validade'} />
        </div>

        <section className="user-activity-history" aria-labelledby="historico-usuario-titulo">
          <div className="user-activity-heading">
            <div>
              <span>Logs</span>
              <h4 id="historico-usuario-titulo">Atividade recente</h4>
            </div>
            <strong>{historico.length} exibida(s)</strong>
          </div>

          {historico.length > 0 ? (
            <ol className="user-activity-list">
              {historico.map((log) => {
                const detalhes = detalhesLogAtividade(log);

                return (
                  <li key={log.id} className={`activity-${log.categoria}`}>
                    <span className="activity-icon" aria-hidden="true">
                      <Clock3 size={15} />
                    </span>
                    <div className="activity-content">
                      <div className="activity-title">
                        <strong>{log.descricao}</strong>
                        <span>{rotuloCategoriaAtividade(log.categoria)}</span>
                      </div>
                      <small>
                        {formatarDataHora(log.at)} · {rotuloOrigemAtividade(log.origem)} · {rotuloRotaAtividade(log.rota)}
                      </small>
                      {detalhes.length > 0 && (
                        <div className="activity-details">
                          {detalhes.map((detalhe) => (
                            <em key={detalhe}>{detalhe}</em>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="empty-activity-history">
              O historico comeca a aparecer depois que a tabela de logs for atualizada no Supabase.
            </div>
          )}
        </section>

        <div className="detail-actions">
          {pendente && (
            <button className="detail-action edit" type="button" onClick={onApprove} disabled={sincronizando}>
              <CheckCircle2 size={18} />
              Aprovar cadastro
            </button>
          )}
          {podeExcluir && (
            <button className="detail-action danger" type="button" onClick={onDelete} disabled={sincronizando}>
              <Trash2 size={18} />
              Excluir usuario
            </button>
          )}
          <button className="detail-action delete" type="button" onClick={onClose}>
            <X size={18} />
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}

function CadastroProdutoSheet({
  produtosBase,
  novoItem,
  cadastroEdicaoId,
  atualizarNovoItem,
  adicionarValidade,
  fecharCadastroProduto,
}) {
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const produtosProvaveis = useMemo(
    () => encontrarProdutosProvaveis(produtosBase, novoItem.produto, novoItem.plu),
    [novoItem.produto, novoItem.plu, produtosBase],
  );

  function usarProdutoProvavel(produto) {
    if (!produto) {
      return;
    }

    atualizarNovoItem('produto', produto.descricao);
    atualizarNovoItem('plu', produto.plu);
    atualizarNovoItem('unidade', inferirUnidadeProduto(produto.descricao));
    setMostrarSugestoes(false);
  }

  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={fecharCadastroProduto}>
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadastro-produto-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <span>Cadastro rápido</span>
            <h3 id="cadastro-produto-titulo">{cadastroEdicaoId ? 'Editar produto' : 'Novo produto'}</h3>
          </div>
          <button className="sheet-close" onClick={fecharCadastroProduto} aria-label="Fechar cadastro">
            <X size={20} />
          </button>
        </div>

        <form className="sheet-form" onSubmit={adicionarValidade}>
          <label>
            PLU / EAN
            <input
              value={novoItem.plu}
              inputMode="numeric"
              placeholder="Código de barras ou PLU"
              onChange={(event) => {
                const codigo = somenteNumeros(event.target.value);
                atualizarNovoItem('plu', codigo);
                setMostrarSugestoes(true);
              }}
            />
          </label>

          <label>
            Nome
            <input
              value={novoItem.produto}
              placeholder="Nome do produto"
              onChange={(event) => {
                atualizarNovoItem('produto', event.target.value);
                setMostrarSugestoes(true);
              }}
            />
          </label>

          {mostrarSugestoes && produtosProvaveis.length > 0 && (
            <div className="produto-sugestoes">
              <div className="sugestoes-header">
                <span>Produtos prováveis</span>
                <strong>{produtosProvaveis.length}</strong>
              </div>

              <div className="sugestoes-scroll">
                {produtosProvaveis.map((produto) => (
                  <button
                    className="produto-sugestao"
                    key={produto.plu}
                    type="button"
                    onClick={() => usarProdutoProvavel(produto)}
                  >
                    <div>
                      <strong>{produto.descricao}</strong>
                      <p>
                        PLU {produto.plu} · {produto.categoria}
                      </p>
                    </div>
                    <CheckCircle2 size={20} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sheet-form-grid">
            <label>
              Validade
              <input
                type="date"
                value={novoItem.validade}
                onChange={(event) => atualizarNovoItem('validade', event.target.value)}
              />
            </label>

            <label>
              Quantidade
              <div className="quantity-input-row">
                <input
                  value={novoItem.quantidade}
                  inputMode="decimal"
                  onChange={(event) => atualizarNovoItem('quantidade', limparQuantidade(event.target.value))}
                />
                <div className="unit-toggle" aria-label="Unidade">
                  {['kg', 'un'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={novoItem.unidade === item ? 'active' : ''}
                      onClick={() => atualizarNovoItem('unidade', item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </label>
          </div>

          <div className="choice-row">
            <span>Tipo</span>
            <div className="local-toggle compact-toggle" aria-label="Tipo">
              {['RESF', 'CONG'].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={novoItem.tipo === item ? 'active' : ''}
                  onClick={() => atualizarNovoItem('tipo', item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="choice-row">
            <span>Local</span>
            <div className="local-toggle" aria-label="Local">
              {['Área de venda', 'Câmara'].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={novoItem.setor === item ? 'active' : ''}
                  onClick={() => atualizarNovoItem('setor', item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <button className="primary-button sheet-submit" type="submit">
            <CheckCircle2 size={18} />
            {cadastroEdicaoId ? 'Salvar alterações' : 'Salvar produto'}
          </button>
        </form>
      </section>
    </div>
  );
}

function ProdutoCadastroTabela({ itens, onView }) {
  return (
    <div className="validade-tabela-container" role="table" aria-label="Produtos cadastrados">
      <div className="validade-tabela">
        {itens.map((item) => {
          const config = statusConfig[item.status];

          return (
            <button
              className={`validade-tabela-item tone-${config.tone}${item.dias <= 3 ? ' is-alerting' : ''}`}
              key={item.id}
              type="button"
              onClick={() => onView(item)}
            >
              <span className="validade-linha-principal">
                <strong>{item.produto}</strong>
                <span>{textoDiasTabela(item.dias)}</span>
                <i className="status-dot" title={config.badge} aria-label={config.badge} />
              </span>

              <span className="validade-linha-secundaria">
                <span>
                  <small>Qtd.</small>
                  <b>{item.quantidade}</b>
                </span>
                <span>
                  <small>Val.</small>
                  <b>{formatarDataCurta(item.validade)}</b>
                </span>
                <span>
                  <small>EAN</small>
                  <b>{item.plu}</b>
                </span>
                <span>
                  <small>Tipo</small>
                  <b>{item.tipo}</b>
                </span>
                <span>
                  <small>Local</small>
                  <b>{item.setor}</b>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProdutoCadastroCard({ item, onView, onEdit, onDelete }) {
  const config = statusConfig[item.status];

  return (
    <article className={`produto-cadastro-card tone-${config.tone}${item.dias <= 3 ? ' is-alerting' : ''}`}>
      <div className="produto-card-content">
        <div className="produto-name-box">
          <span className={`produto-status tone-${config.tone}`}>{config.badge}</span>
          <h3>{item.produto}</h3>
        </div>

        <div className="produto-info-grid">
          <InfoBox label="Código" value={item.plu} />
          <InfoBox label="Qtd." value={item.quantidade} />
          <InfoBox label="Local" value={item.setor} />
          <InfoBox label="Validade" value={formatarData(item.validade)} />
        </div>

        <div className="produto-actions">
          <button className="produto-action-btn view" onClick={() => onView(item)} title="Visualizar produto">
            <Eye size={20} />
          </button>
          <button className="produto-action-btn edit" onClick={() => onEdit(item)} title="Editar produto">
            <Pencil size={20} />
          </button>
          <button className="produto-action-btn delete" onClick={() => onDelete(item.id)} title="Excluir produto">
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="produto-info-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function valorDetalhe(valor) {
  return valor === undefined || valor === null || valor === '' ? 'Nao informado' : valor;
}

function DetailBox({ label, value, destaque, wide }) {
  const classes = ['detail-info-box'];
  if (destaque) classes.push('highlight');
  if (wide) classes.push('wide');

  return (
    <div className={classes.join(' ')}>
      <span>{label}</span>
      <strong>{valorDetalhe(value)}</strong>
    </div>
  );
}

function ProdutoDetalheSheet({ item, onClose, onEdit, onDelete }) {
  return (
    <div className="bottom-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="bottom-sheet detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="produto-detalhe-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <span>Produto cadastrado</span>
            <h3 id="produto-detalhe-titulo">{item.nomeProduto}</h3>
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Fechar detalhes">
            <X size={20} />
          </button>
        </div>

        <div className="detail-grid">
          <DetailBox label="Nome" value={item.nomeProduto} wide />
          <DetailBox label="PLU / EAN" value={item.plu} destaque />
          <DetailBox label="Quantidade" value={item.quantidade} destaque />
          <DetailBox label="Validade" value={formatarData(item.validade)} destaque />
          <DetailBox label="Tipo" value={item.tipo} />
          <DetailBox label="Tipo do PLU" value={item.tipoPlu} />
          <DetailBox label="Seção" value={item.secao} />
          <DetailBox label="Categoria" value={item.categoria} />
          <DetailBox label="Embalagem" value={item.embalagem} />
        </div>

        <div className="detail-actions">
          <button className="detail-action edit" onClick={() => onEdit(item)}>
            <Pencil size={18} />
            Editar
          </button>
          <button className="detail-action delete" onClick={() => onDelete(item.id)}>
            <Trash2 size={18} />
            Apagar
          </button>
        </div>
      </section>
    </div>
  );
}

export default App;
