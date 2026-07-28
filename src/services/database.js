import { supabase, supabaseConfigurado } from './supabaseClient';

export const ADMIN_MATRICULA = '000000';
export const CONTATO_LIBERACAO = '61998427629';
const ROTA_USUARIO_EXCLUIDO = '__deleted__';

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function normalizarNomePessoa(valor) {
  const nome = String(valor || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return nome.split(' ')[0] || '';
}

export function nomeUsuarioValido(valor) {
  const nome = normalizarNomePessoa(valor);
  const nomeSemAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return nome.length >= 2 && /[a-z]/i.test(nomeSemAcento);
}

function temCampoNome(usuario) {
  return Boolean(usuario && Object.prototype.hasOwnProperty.call(usuario, 'nome'));
}

function erroColunaNomeAusente(error) {
  return /nome|schema cache|column/i.test(String(error?.message || ''));
}

function marcarSuporteNome(data, suportado) {
  if (Array.isArray(data)) {
    return data.map((item) => (item ? { ...item, nomeSuportado: suportado } : item));
  }

  return data ? { ...data, nomeSuportado: suportado } : data;
}

async function consultarComFallbackNome(criarConsulta, selectComNome, selectSemNome) {
  const consulta = await criarConsulta(selectComNome);

  if (consulta.error && erroColunaNomeAusente(consulta.error)) {
    const fallback = await criarConsulta(selectSemNome);
    return {
      ...fallback,
      data: marcarSuporteNome(fallback.data, false),
    };
  }

  return {
    ...consulta,
    data: marcarSuporteNome(consulta.data, true),
  };
}

function exigirSupabase() {
  if (!supabaseConfigurado || !supabase) {
    throw new Error('Banco online nao configurado. O app precisa estar online para acessar os dados.');
  }
}

export function telefoneValido(valor) {
  const telefone = somenteDigitos(valor);
  const ddd = Number(telefone.slice(0, 2));
  const numero = telefone.slice(2);

  return (
    telefone.length === 11 &&
    ddd >= 11 &&
    ddd <= 99 &&
    numero.startsWith('9') &&
    !/^(\d)\1+$/.test(telefone)
  );
}

export function formatarTelefone(valor) {
  const telefone = somenteDigitos(valor).slice(0, 11);

  if (telefone.length <= 2) return telefone;
  if (telefone.length <= 7) return `(${telefone.slice(0, 2)}) ${telefone.slice(2)}`;

  return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
}

function normalizarPreferencias(preferencias = {}) {
  const secoes = Array.isArray(preferencias.secoesSelecionadas)
    ? preferencias.secoesSelecionadas
    : Array.isArray(preferencias.secoes_selecionadas)
      ? preferencias.secoes_selecionadas
      : [];

  return {
    secoesSelecionadas: Array.from(new Set(secoes.map((secao) => String(secao || '').trim()).filter(Boolean))),
    secoesConfiguradas: Boolean(preferencias.secoesConfiguradas ?? preferencias.secoes_configuradas),
    tema: ['claro', 'azul'].includes(preferencias.tema) ? preferencias.tema : 'claro',
    visualizacaoValidades:
      (preferencias.visualizacaoValidades ?? preferencias.visualizacao_validades) === 'simples'
        ? 'simples'
        : 'tabela',
  };
}

function colunaVisualizacaoValidadesAusente(error) {
  const mensagem = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return mensagem.includes('visualizacao_validades') && ['42703', 'PGRST204'].includes(error?.code);
}

function normalizarUsuario(usuario) {
  if (!usuario) return null;
  const matricula = somenteDigitos(usuario.matricula);
  const admin = matricula === ADMIN_MATRICULA;
  const nomeSuportado = temCampoNome(usuario) || usuario.nomeSuportado === true;
  const nome = normalizarNomePessoa(usuario.nome || usuario.nomeUsuario || '');

  return {
    id: usuario.id || `local-${matricula}`,
    nome,
    nomeSuportado,
    matricula,
    telefone: somenteDigitos(usuario.telefone),
    admin,
    aprovado: admin || Boolean(usuario.aprovado),
    createdAt: usuario.created_at || usuario.createdAt || '',
    lastLoginAt: usuario.last_login_at || usuario.lastLoginAt || '',
    lastActivityLabel: usuario.last_activity_label || usuario.lastActivityLabel || '',
    lastActivityAt: usuario.last_activity_at || usuario.lastActivityAt || '',
    lastRoute: usuario.last_route || usuario.lastRoute || '',
    atividade: usuario.atividade || null,
  };
}

function detectarOrigemAcesso() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'web';

  const userAgent = String(navigator.userAgent || '').toLowerCase();
  const appInstalado = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const webViewAndroid = userAgent.includes('; wv)') || userAgent.includes('version/4.0');

  return appInstalado || webViewAndroid ? 'app' : 'web';
}

function sanitizarDetalhesAtividade(detalhes) {
  if (!detalhes || typeof detalhes !== 'object') return {};

  const limites = {
    produto: 180,
    plu: 40,
    quantidade: 40,
    validade: 20,
    tipo: 20,
    local: 80,
  };

  return Object.fromEntries(
    Object.entries(limites)
      .filter(([campo]) => detalhes[campo] !== undefined && detalhes[campo] !== null && detalhes[campo] !== '')
      .map(([campo, limite]) => [campo, String(detalhes[campo]).slice(0, limite)]),
  );
}

function normalizarEventoAtividade(atividade, rota = '') {
  const evento = typeof atividade === 'string' ? { descricao: atividade } : atividade || {};

  return {
    acao: String(evento.acao || 'visualizacao').slice(0, 80),
    categoria: String(evento.categoria || 'navegacao').slice(0, 40),
    descricao: String(evento.descricao || evento.label || 'Atividade registrada').slice(0, 240),
    rota: String(evento.rota || rota || '').slice(0, 160),
    entidadeTipo: String(evento.entidadeTipo || '').slice(0, 60),
    entidadeId: String(evento.entidadeId || '').slice(0, 160),
    detalhes: sanitizarDetalhesAtividade(evento.detalhes),
    origem: ['app', 'web'].includes(evento.origem) ? evento.origem : detectarOrigemAcesso(),
  };
}

function normalizarLogAtividade(log) {
  return {
    id: log.id,
    acao: log.acao || 'visualizacao',
    categoria: log.categoria || 'navegacao',
    descricao: log.descricao || 'Atividade registrada',
    rota: log.rota || '',
    entidadeTipo: log.entidade_tipo || '',
    entidadeId: log.entidade_id || '',
    detalhes: log.detalhes && typeof log.detalhes === 'object' ? log.detalhes : {},
    origem: log.origem === 'app' ? 'app' : 'web',
    at: log.created_at || '',
  };
}

function tabelaAtividadesAusente(error) {
  return /atividades_usuario|schema cache|does not exist|pgrst205/i.test(String(error?.message || ''));
}

async function inserirLogAtividade(usuario, atividade, rota = '') {
  if (!usuario?.id || String(usuario.id).startsWith('local-')) return false;

  const evento = normalizarEventoAtividade(atividade, rota);
  const { error } = await supabase.from('atividades_usuario').insert({
    usuario_id: usuario.id,
    acao: evento.acao,
    categoria: evento.categoria,
    descricao: evento.descricao,
    rota: evento.rota || null,
    entidade_tipo: evento.entidadeTipo || null,
    entidade_id: evento.entidadeId || null,
    detalhes: evento.detalhes,
    origem: evento.origem,
  });

  if (error) {
    if (tabelaAtividadesAusente(error)) return false;
    throw new Error(error.message);
  }

  return true;
}

async function garantirUsuarioRemoto(usuario) {
  exigirSupabase();
  if (!usuario) throw new Error('Sessao invalida.');

  const matricula = somenteDigitos(usuario.matricula);
  const idRemoto = usuario.id && !String(usuario.id).startsWith('local-') ? usuario.id : '';
  const idValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idRemoto);

  let data = null;

  if (idValido) {
    const consultaPorId = await consultarComFallbackNome(
      (select) => supabase.from('usuarios').select(select).eq('id', idRemoto).maybeSingle(),
      'id, nome, matricula, telefone, admin, aprovado',
      'id, matricula, telefone, admin, aprovado',
    );

    if (consultaPorId.error) throw new Error(consultaPorId.error.message);
    data = consultaPorId.data;

    if (data && matricula && somenteDigitos(data.matricula) !== matricula) {
      data = null;
    }
  }

  if (!data && matricula) {
    const consultaPorMatricula = await consultarComFallbackNome(
      (select) => supabase.from('usuarios').select(select).eq('matricula', matricula).maybeSingle(),
      'id, nome, matricula, telefone, admin, aprovado',
      'id, matricula, telefone, admin, aprovado',
    );

    if (consultaPorMatricula.error) throw new Error(consultaPorMatricula.error.message);
    data = consultaPorMatricula.data;
  }

  if (!data) throw new Error('Sessao nao encontrada. Cadastre a matricula e aguarde a aprovacao do admin.');

  const usuarioRemoto = normalizarUsuario(data);
  if (!usuarioRemoto.admin && !usuarioRemoto.aprovado) {
    throw new Error(`Cadastro pendente. Entre em contato com ${CONTATO_LIBERACAO} para liberar o acesso.`);
  }

  return usuarioRemoto;
}

function toDbValidade(item, usuario) {
  return {
    id: item.id,
    usuario_id: usuario?.id || null,
    produto: item.produto,
    plu: item.plu,
    categoria: item.categoria || 'Cadastro',
    lote: item.lote || 'Cadastro manual',
    setor: item.setor || '',
    tipo: item.tipo || '',
    quantidade: item.quantidade || '',
    fabricacao: item.fabricacao || null,
    validade: item.validade,
    responsavel: item.responsavel || '',
    revisado: Boolean(item.revisado),
  };
}

function fromDbValidade(item) {
  return {
    id: item.id,
    produto: item.produto,
    plu: item.plu,
    categoria: item.categoria || 'Cadastro',
    lote: item.lote || 'Cadastro manual',
    setor: item.setor || '',
    tipo: item.tipo || '',
    quantidade: item.quantidade || '',
    fabricacao: item.fabricacao || '',
    validade: item.validade,
    responsavel: item.responsavel || '',
    revisado: Boolean(item.revisado),
  };
}

function fromDbProduto(item) {
  return {
    plu: item.plu,
    descricao: item.descricao,
    categoria: item.categoria || 'Outros',
    tipo: item.tipo || item.tipo_plu || 'Nao informado',
    tipoPlu: item.tipo_plu || 'Nao informado',
    secao: item.secao || 'Outros',
    embalagemMultiplo: item.embalagem_multiplo ?? null,
  };
}

export function bancoAtivo() {
  return supabaseConfigurado;
}

export async function carregarProdutosBaseRemotos() {
  exigirSupabase();

  const tamanhoPagina = 1000;
  const produtos = [];

  for (let pagina = 0; ; pagina += 1) {
    const inicio = pagina * tamanhoPagina;
    const fim = inicio + tamanhoPagina - 1;
    const { data, error } = await supabase
      .from('produtos_base')
      .select('plu, descricao, categoria, tipo, tipo_plu, secao, embalagem_multiplo')
      .order('categoria', { ascending: true })
      .order('descricao', { ascending: true })
      .range(inicio, fim);

    if (error) {
      throw new Error(error.message);
    }

    produtos.push(...(data || []));

    if (!data || data.length < tamanhoPagina) {
      break;
    }
  }

  return produtos.map(fromDbProduto);
}

export async function cadastrarUsuario({ matricula, telefone, nome }) {
  const matriculaLimpa = somenteDigitos(matricula);
  const telefoneLimpo = somenteDigitos(telefone);
  const nomeLimpo = normalizarNomePessoa(nome);

  if (!matriculaLimpa || !telefoneLimpo || !nomeLimpo) {
    throw new Error('Informe nome, telefone e matricula.');
  }

  if (!nomeUsuarioValido(nomeLimpo)) {
    throw new Error('Informe o primeiro nome.');
  }

  if (!telefoneValido(telefoneLimpo)) {
    throw new Error('Informe um telefone celular valido com DDD.');
  }

  const usuarioPayload = {
    nome: nomeLimpo,
    matricula: matriculaLimpa,
    telefone: telefoneLimpo,
    admin: matriculaLimpa === ADMIN_MATRICULA,
    aprovado: matriculaLimpa === ADMIN_MATRICULA,
  };

  exigirSupabase();

  const { data: existente, error: consultaError } = await consultarComFallbackNome(
    (select) => supabase.from('usuarios').select(select).eq('matricula', matriculaLimpa).maybeSingle(),
    'id, nome, matricula, telefone, admin, aprovado',
    'id, matricula, telefone, admin, aprovado',
  );

  if (consultaError) throw new Error(consultaError.message);

  if (existente) {
    if (!existente.admin && !existente.aprovado) {
      throw new Error(`Cadastro pendente. Entre em contato com ${CONTATO_LIBERACAO} para liberar o acesso.`);
    }

    throw new Error('Matricula ja cadastrada. Use o login para entrar.');
  }

  let cadastro = await supabase
    .from('usuarios')
    .insert(usuarioPayload)
    .select('id, nome, matricula, telefone, admin, aprovado')
    .single();

  if (cadastro.error && erroColunaNomeAusente(cadastro.error)) {
    const { nome: _nome, ...payloadSemNome } = usuarioPayload;
    cadastro = await supabase
      .from('usuarios')
      .insert(payloadSemNome)
      .select('id, matricula, telefone, admin, aprovado')
      .single();

    if (cadastro.data) {
      cadastro.data = { ...cadastro.data, nomeSuportado: false };
    }
  }

  const { data, error } = cadastro;
  if (error) throw new Error(error.message);

  const usuario = normalizarUsuario(data);
  inserirLogAtividade(usuario, {
    acao: 'cadastro_solicitado',
    categoria: 'conta',
    descricao: 'Solicitou cadastro no sistema',
    rota: '/acesso',
  }).catch(() => {});

  return usuario;
}

export async function loginUsuario(matricula) {
  const matriculaLimpa = somenteDigitos(matricula);

  if (!matriculaLimpa) {
    throw new Error('Informe a matricula.');
  }

  exigirSupabase();

  const { data, error } = await consultarComFallbackNome(
    (select) => supabase.from('usuarios').select(select).eq('matricula', matriculaLimpa).maybeSingle(),
    'id, nome, matricula, telefone, admin, aprovado',
    'id, matricula, telefone, admin, aprovado',
  );

  if (error) throw new Error(error.message);
  if (!data && matriculaLimpa === ADMIN_MATRICULA) {
    const primeiroLoginAt = new Date().toISOString();
    let cadastroAdmin = await supabase
      .from('usuarios')
      .insert({
        nome: 'Administrador',
        matricula: ADMIN_MATRICULA,
        telefone: '00000000000',
        admin: true,
        aprovado: true,
        last_login_at: primeiroLoginAt,
      })
      .select('id, nome, matricula, telefone, admin, aprovado, last_login_at')
      .single();

    if (cadastroAdmin.error && erroColunaNomeAusente(cadastroAdmin.error)) {
      cadastroAdmin = await supabase
        .from('usuarios')
        .insert({
          matricula: ADMIN_MATRICULA,
          telefone: '00000000000',
          admin: true,
          aprovado: true,
          last_login_at: primeiroLoginAt,
        })
        .select('id, matricula, telefone, admin, aprovado, last_login_at')
        .single();

      if (cadastroAdmin.data) {
        cadastroAdmin.data = { ...cadastroAdmin.data, nomeSuportado: false };
      }
    }

    const { data: adminData, error: adminError } = cadastroAdmin;
    if (adminError) throw new Error(adminError.message);

    const admin = normalizarUsuario(adminData);
    inserirLogAtividade(admin, {
      acao: 'login',
      categoria: 'conta',
      descricao: 'Entrou no sistema',
      rota: '/',
    }).catch(() => {});

    return admin;
  }
  if (!data) throw new Error('Matricula nao cadastrada.');

  const precisaAdmin = matriculaLimpa === ADMIN_MATRICULA && !data.admin;
  if (precisaAdmin) {
    await supabase.from('usuarios').update({ admin: true, aprovado: true }).eq('id', data.id);
  }
  const loginAt = new Date().toISOString();
  await supabase.from('usuarios').update({ last_login_at: loginAt }).eq('id', data.id);

  const usuarioNormalizado = normalizarUsuario({
    ...data,
    admin: data.admin || matriculaLimpa === ADMIN_MATRICULA,
    last_login_at: loginAt,
  });
  if (!usuarioNormalizado.admin && !usuarioNormalizado.aprovado) {
    throw new Error(`Cadastro pendente. Entre em contato com ${CONTATO_LIBERACAO} para liberar o acesso.`);
  }

  inserirLogAtividade(usuarioNormalizado, {
    acao: 'login',
    categoria: 'conta',
    descricao: 'Entrou no sistema',
    rota: '/',
  }).catch(() => {});

  return usuarioNormalizado;
}

export async function carregarUsuariosPendentes() {
  exigirSupabase();

  const { data, error } = await consultarComFallbackNome(
    (select) =>
      supabase
        .from('usuarios')
        .select(select)
        .eq('aprovado', false)
        .eq('admin', false)
        .order('created_at', { ascending: true }),
    'id, nome, matricula, telefone, admin, aprovado, created_at',
    'id, matricula, telefone, admin, aprovado, created_at',
  );

  if (error) throw new Error(error.message);
  return (data || []).map(normalizarUsuario);
}

function resumoAtividadeUsuario(usuario, validades = [], logs = []) {
  const itens = validades
    .filter((item) => item.usuario_id === usuario.id)
    .sort((a, b) => {
      const dataA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dataB = new Date(b.updated_at || b.created_at || 0).getTime();
      return dataB - dataA;
  });
  const ultimo = itens[0] || null;
  const atividadeLabel =
    usuario.last_activity_label || usuario.lastActivityLabel || (ultimo ? `Cadastrou ${ultimo.produto}` : 'Sem atividade recente');
  const atividadeAt =
    usuario.last_activity_at || usuario.lastActivityAt || usuario.last_login_at || usuario.lastLoginAt || ultimo?.updated_at || ultimo?.created_at || '';
  const historico = logs
    .filter((log) => log.usuario_id === usuario.id)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .map(normalizarLogAtividade);
  const ultimoLog = historico[0] || null;
  const produtos = itens.map((item) => ({
    id: item.id || `${item.usuario_id}-${item.plu}-${item.validade}`,
    produto: item.produto || 'Produto sem nome',
    plu: item.plu || 'Sem PLU',
    quantidade: item.quantidade || '',
    validade: item.validade || '',
    tipo: item.tipo || '',
    setor: item.setor || '',
    createdAt: item.created_at || '',
    updatedAt: item.updated_at || '',
  }));

  return {
    totalProdutos: itens.length,
    produtos,
    ultimoProduto: ultimo?.produto || '',
    ultimoPlu: ultimo?.plu || '',
    ultimaValidade: ultimo?.validade || '',
    ultimaMovimentacaoAt: ultimo?.updated_at || ultimo?.created_at || '',
    totalAcoes: historico.length,
    totalLogins: historico.filter((log) => log.acao === 'login').length,
    totalCadastros: historico.filter((log) => log.acao === 'produto_cadastrado').length,
    totalEdicoes: historico.filter((log) => log.acao === 'produto_editado').length,
    totalExclusoes: historico.filter((log) => log.acao === 'produto_excluido').length,
    label: ultimoLog?.descricao || atividadeLabel,
    at: ultimoLog?.at || atividadeAt,
    rota: ultimoLog?.rota || usuario.last_route || usuario.lastRoute || '',
    origem: ultimoLog?.origem || '',
    historico,
  };
}

async function carregarUsuariosRemotosAdmin() {
  const selectCompleto =
    'id, nome, matricula, telefone, admin, aprovado, created_at, last_login_at, last_activity_label, last_activity_at, last_route';
  const selectBasico = 'id, matricula, telefone, admin, aprovado, created_at, last_login_at';

  let consulta = await consultarComFallbackNome(
    (select) =>
      supabase
        .from('usuarios')
        .select(select)
        .or(`last_route.is.null,last_route.neq.${ROTA_USUARIO_EXCLUIDO}`)
        .order('created_at', { ascending: false }),
    selectCompleto,
    selectBasico,
  );

  if (consulta.error && /last_activity_|last_route/i.test(consulta.error.message)) {
    consulta = await consultarComFallbackNome(
      (select) => supabase.from('usuarios').select(select).order('created_at', { ascending: false }),
      'id, nome, matricula, telefone, admin, aprovado, created_at, last_login_at',
      selectBasico,
    );
  }

  if (consulta.error) throw new Error(consulta.error.message);

  return consulta.data || [];
}

export async function carregarUsuariosAdmin() {
  exigirSupabase();

  const usuarios = await carregarUsuariosRemotosAdmin();
  const ids = usuarios.map((usuario) => usuario.id).filter(Boolean);
  let validades = [];
  let logs = [];

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('validades')
      .select('id, usuario_id, produto, plu, quantidade, setor, tipo, validade, created_at, updated_at')
      .in('usuario_id', ids);

    if (error) throw new Error(error.message);
    validades = data || [];

    const consultaLogs = await supabase
      .from('atividades_usuario')
      .select('id, usuario_id, acao, categoria, descricao, rota, entidade_tipo, entidade_id, detalhes, origem, created_at')
      .in('usuario_id', ids)
      .order('created_at', { ascending: false })
      .limit(500);

    if (consultaLogs.error && !tabelaAtividadesAusente(consultaLogs.error)) {
      throw new Error(consultaLogs.error.message);
    }

    logs = consultaLogs.data || [];
  }

  return usuarios.map((usuario) => {
    const normalizado = normalizarUsuario(usuario);
    return {
      ...normalizado,
      atividade: resumoAtividadeUsuario(usuario, validades, logs),
    };
  });
}

export async function carregarPreferenciasUsuario(usuario, fallback = {}) {
  const preferenciasFallback = normalizarPreferencias(fallback);

  exigirSupabase();
  if (!usuario) return preferenciasFallback;

  const usuarioBanco = await garantirUsuarioRemoto(usuario);
  let { data, error } = await supabase
    .from('preferencias_usuario')
    .select('secoes_selecionadas, secoes_configuradas, tema, visualizacao_validades')
    .eq('usuario_id', usuarioBanco.id)
    .maybeSingle();

  if (error && colunaVisualizacaoValidadesAusente(error)) {
    ({ data, error } = await supabase
      .from('preferencias_usuario')
      .select('secoes_selecionadas, secoes_configuradas, tema')
      .eq('usuario_id', usuarioBanco.id)
      .maybeSingle());
  }

  if (error) {
    throw new Error(`Nao foi possivel carregar preferencias online: ${error.message}`);
  }

  if (!data) {
    await salvarPreferenciasUsuario(usuarioBanco, preferenciasFallback);
    return preferenciasFallback;
  }

  return normalizarPreferencias(data);
}

export async function salvarPreferenciasUsuario(usuario, preferencias) {
  exigirSupabase();
  if (!usuario) return;

  const usuarioBanco = await garantirUsuarioRemoto(usuario);
  const preferenciasNormalizadas = normalizarPreferencias(preferencias);
  const payload = {
    usuario_id: usuarioBanco.id,
    matricula: usuarioBanco.matricula,
    secoes_selecionadas: preferenciasNormalizadas.secoesSelecionadas,
    secoes_configuradas: preferenciasNormalizadas.secoesConfiguradas,
    tema: preferenciasNormalizadas.tema,
    visualizacao_validades: preferenciasNormalizadas.visualizacaoValidades,
  };

  let { error } = await supabase.from('preferencias_usuario').upsert(payload, { onConflict: 'usuario_id' });

  if (error && colunaVisualizacaoValidadesAusente(error)) {
    const { visualizacao_validades: _visualizacaoIgnorada, ...payloadCompativel } = payload;
    ({ error } = await supabase.from('preferencias_usuario').upsert(payloadCompativel, {
      onConflict: 'usuario_id',
    }));
  }

  if (error) {
    throw new Error(`Nao foi possivel salvar preferencias online: ${error.message}`);
  }
}

export async function registrarAtividadeUsuario(usuario, atividade, rota = '') {
  if (!usuario || !atividade) return;
  exigirSupabase();

  const agora = new Date().toISOString();
  const evento = normalizarEventoAtividade(atividade, rota);
  const dadosAtividade = {
    lastActivityLabel: evento.descricao,
    lastActivityAt: agora,
    lastRoute: evento.rota,
  };

  const payload = {
    last_activity_label: evento.descricao,
    last_activity_at: agora,
    last_route: evento.rota,
  };

  const filtro = usuario.id && !String(usuario.id).startsWith('local-') ? { coluna: 'id', valor: usuario.id } : { coluna: 'matricula', valor: somenteDigitos(usuario.matricula) };
  const { error } = await supabase.from('usuarios').update(payload).eq(filtro.coluna, filtro.valor);

  if (error && !/last_activity_|last_route/i.test(error.message)) {
    throw new Error(error.message);
  }

  await inserirLogAtividade(usuario, evento, evento.rota);

  return dadosAtividade;
}

export async function atualizarNomeUsuario(usuario, nome) {
  exigirSupabase();
  const nomeLimpo = normalizarNomePessoa(nome);

  if (!nomeUsuarioValido(nomeLimpo)) {
    throw new Error('Informe o primeiro nome.');
  }

  const usuarioBanco = await garantirUsuarioRemoto(usuario);
  const { data, error } = await supabase
    .from('usuarios')
    .update({ nome: nomeLimpo })
    .eq('id', usuarioBanco.id)
    .select('id, nome, matricula, telefone, admin, aprovado, created_at, last_login_at, last_activity_label, last_activity_at, last_route')
    .single();

  if (error) {
    if (erroColunaNomeAusente(error)) {
      throw new Error('Atualize a tabela de usuarios no banco online para salvar o nome.');
    }

    throw new Error(error.message);
  }

  const usuarioAtualizado = normalizarUsuario(data);
  inserirLogAtividade(usuarioAtualizado, {
    acao: 'nome_atualizado',
    categoria: 'conta',
    descricao: 'Atualizou o nome do perfil',
    rota: '/perfil',
  }).catch(() => {});

  return usuarioAtualizado;
}

export async function aprovarUsuario(matricula) {
  const matriculaLimpa = somenteDigitos(matricula);

  if (!matriculaLimpa) {
    throw new Error('Matricula invalida.');
  }

  exigirSupabase();

  const { data, error } = await consultarComFallbackNome(
    (select) =>
      supabase
        .from('usuarios')
        .update({ aprovado: true, admin: false })
        .eq('matricula', matriculaLimpa)
        .select(select)
        .single(),
    'id, nome, matricula, telefone, admin, aprovado',
    'id, matricula, telefone, admin, aprovado',
  );

  if (error) throw new Error(error.message);

  const usuario = normalizarUsuario(data);
  inserirLogAtividade(usuario, {
    acao: 'cadastro_aprovado',
    categoria: 'conta',
    descricao: 'Cadastro aprovado pelo administrador',
    rota: '/configuracao',
  }).catch(() => {});

  return usuario;
}

export async function removerUsuario(usuario, administrador) {
  exigirSupabase();

  const matriculaLimpa = somenteDigitos(usuario?.matricula);
  const idRemoto = usuario?.id && !String(usuario.id).startsWith('local-') ? usuario.id : '';

  if (!matriculaLimpa && !idRemoto) {
    throw new Error('Usuario invalido.');
  }

  const adminBanco = await garantirUsuarioRemoto(administrador);
  if (!adminBanco.admin) {
    throw new Error('Somente o administrador pode excluir usuarios.');
  }

  const { data, error } = await consultarComFallbackNome(
    (select) =>
      supabase
        .from('usuarios')
        .select(select)
        .eq(idRemoto ? 'id' : 'matricula', idRemoto || matriculaLimpa)
        .maybeSingle(),
    'id, nome, matricula, telefone, admin, aprovado',
    'id, matricula, telefone, admin, aprovado',
  );

  if (error) throw new Error(error.message);
  if (!data) return null;

  const usuarioBanco = normalizarUsuario(data);
  if (usuarioBanco.admin || usuarioBanco.matricula === ADMIN_MATRICULA) {
    throw new Error('Nao e permitido excluir o usuario administrador.');
  }

  if (usuarioBanco.id === adminBanco.id) {
    throw new Error('Nao e permitido excluir o usuario logado.');
  }

  const usuarioId = usuarioBanco.id;

  const { error: validadesError } = await supabase.from('validades').delete().eq('usuario_id', usuarioId);
  if (validadesError) throw new Error(validadesError.message);

  const { data: usuarioRemovido, error: usuarioError } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', usuarioId)
    .select('id')
    .maybeSingle();
  if (usuarioError) throw new Error(usuarioError.message);

  if (!usuarioRemovido) {
    const sufixo = usuarioId.replace(/-/g, '').slice(0, 18);
    const matriculaExcluida = `excluido-${sufixo}`;
    const agora = new Date().toISOString();
    const { data: usuarioAtualizado, error: updateError } = await supabase
      .from('usuarios')
      .update({
        matricula: matriculaExcluida,
        aprovado: false,
        last_activity_label: `Usuario ${usuarioBanco.matricula} excluido pelo admin`,
        last_activity_at: agora,
        last_route: ROTA_USUARIO_EXCLUIDO,
      })
      .eq('id', usuarioId)
      .select('id')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!usuarioAtualizado) throw new Error('O banco online nao confirmou a exclusao do usuario.');
  }

  return usuarioBanco;
}

export async function carregarDadosRemotos(usuario) {
  exigirSupabase();
  if (!usuario) {
    throw new Error('Sessao invalida.');
  }

  const usuarioBanco = await garantirUsuarioRemoto(usuario);
  const { data: validades, error: validadesError } = await supabase
    .from('validades')
    .select('*')
    .eq('usuario_id', usuarioBanco.id)
    .order('created_at', { ascending: false });

  if (validadesError) throw new Error(validadesError.message);

  return {
    usuario: usuarioBanco,
    validades: (validades || []).map(fromDbValidade),
  };
}

export async function carregarValidadesRemotas(usuario) {
  exigirSupabase();
  if (!usuario) return [];

  const usuarioBanco = await garantirUsuarioRemoto(usuario);
  const { data, error } = await supabase
    .from('validades')
    .select('*')
    .eq('usuario_id', usuarioBanco.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(fromDbValidade);
}

export function assinarValidadesRemotas(usuario, onChange, onError) {
  if (!supabaseConfigurado || !supabase || !usuario?.id || String(usuario.id).startsWith('local-')) {
    return () => {};
  }

  const canal = supabase
    .channel(`validades:${usuario.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'validades',
        filter: `usuario_id=eq.${usuario.id}`,
      },
      () => {
        onChange();
      },
    )
    .subscribe((status, error) => {
      if (error) {
        onError(error);
      }
    });

  return () => {
    supabase.removeChannel(canal);
  };
}

export async function salvarValidadesRemotas(validades, usuario) {
  exigirSupabase();
  if (!usuario || validades.length === 0) return;

  const payload = validades.map((item) => toDbValidade(item, usuario));
  const { error } = await supabase.from('validades').upsert(payload, { onConflict: 'id' });

  if (error) throw new Error(error.message);
}

export async function removerValidadeRemota(id) {
  exigirSupabase();
  if (!id) return;

  const { error } = await supabase.from('validades').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
