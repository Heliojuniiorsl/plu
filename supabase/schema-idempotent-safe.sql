create extension if not exists "pgcrypto";

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  matricula text not null unique,
  telefone text not null,
  admin boolean not null default false,
  aprovado boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table if exists public.usuarios add column if not exists aprovado boolean not null default false;
alter table if exists public.usuarios add column if not exists last_login_at timestamptz;
alter table if exists public.usuarios add column if not exists last_activity_label text;
alter table if exists public.usuarios add column if not exists last_activity_at timestamptz;
alter table if exists public.usuarios add column if not exists last_route text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_telefone_valido_check'
      and conrelid = 'public.usuarios'::regclass
  ) then
    alter table public.usuarios
    add constraint usuarios_telefone_valido_check
    check (
      admin = true
      or (
        telefone ~ '^[0-9]{11}$'
        and substring(telefone from 3 for 1) = '9'
        and telefone !~ '^([0-9])\1{10}$'
        and case
          when telefone ~ '^[0-9]{2}' then substring(telefone from 1 for 2)::int between 11 and 99
          else false
        end
      )
    ) not valid;
  end if;
end $$;

create table if not exists public.validades (
  id text primary key,
  usuario_id uuid references public.usuarios(id) on delete set null,
  produto text not null,
  plu text not null,
  categoria text default 'Cadastro',
  lote text default 'Cadastro manual',
  setor text,
  tipo text check (tipo in ('RESF', 'CONG') or tipo is null),
  quantidade text,
  fabricacao date,
  validade date not null,
  responsavel text,
  revisado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.preferencias_usuario (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  matricula text not null,
  secoes_selecionadas text[] not null default '{}',
  secoes_configuradas boolean not null default false,
  tema text not null default 'claro' check (tema in ('claro', 'azul')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atividades_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  acao text not null,
  categoria text not null default 'navegacao',
  descricao text not null,
  rota text,
  entidade_tipo text,
  entidade_id text,
  detalhes jsonb not null default '{}'::jsonb,
  origem text not null default 'web' check (origem in ('web', 'app')),
  created_at timestamptz not null default now()
);

create table if not exists public.produtos_base (
  plu text primary key,
  descricao text not null,
  categoria text not null default 'Outros',
  tipo text not null default 'Nao informado',
  tipo_plu text not null default 'Nao informado',
  secao text not null default 'Outros',
  embalagem_multiplo numeric,
  origem text not null default 'BASE_DADOS_NOMES_CORRIGIDOS.xlsx',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists preferencias_usuario_matricula_idx on public.preferencias_usuario (matricula);
create index if not exists atividades_usuario_usuario_data_idx on public.atividades_usuario (usuario_id, created_at desc);
create index if not exists atividades_usuario_acao_idx on public.atividades_usuario (acao);
create index if not exists produtos_base_categoria_idx on public.produtos_base (categoria);
create index if not exists produtos_base_secao_idx on public.produtos_base (secao);
create index if not exists produtos_base_descricao_idx on public.produtos_base using gin (to_tsvector('portuguese', descricao));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_validades_updated_at'
      and tgrelid = 'public.validades'::regclass
  ) then
    create trigger set_validades_updated_at
    before update on public.validades
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_preferencias_usuario_updated_at'
      and tgrelid = 'public.preferencias_usuario'::regclass
  ) then
    create trigger set_preferencias_usuario_updated_at
    before update on public.preferencias_usuario
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_produtos_base_updated_at'
      and tgrelid = 'public.produtos_base'::regclass
  ) then
    create trigger set_produtos_base_updated_at
    before update on public.produtos_base
    for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.usuarios (matricula, telefone, admin, aprovado)
values ('000000', '00000000000', true, true)
on conflict (matricula)
do update set admin = true, aprovado = true;

alter table public.usuarios enable row level security;
alter table public.validades enable row level security;
alter table public.preferencias_usuario enable row level security;
alter table public.atividades_usuario enable row level security;
alter table public.produtos_base enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios' and policyname = 'usuarios leitura anon') then
    create policy "usuarios leitura anon" on public.usuarios for select to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios' and policyname = 'usuarios cadastro anon') then
    create policy "usuarios cadastro anon" on public.usuarios for insert to anon with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios' and policyname = 'usuarios atualizacao anon') then
    create policy "usuarios atualizacao anon" on public.usuarios for update to anon using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'validades' and policyname = 'validades leitura anon') then
    create policy "validades leitura anon" on public.validades for select to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'validades' and policyname = 'validades escrita anon') then
    create policy "validades escrita anon" on public.validades for insert to anon with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'validades' and policyname = 'validades atualizacao anon') then
    create policy "validades atualizacao anon" on public.validades for update to anon using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'validades' and policyname = 'validades exclusao anon') then
    create policy "validades exclusao anon" on public.validades for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preferencias_usuario' and policyname = 'preferencias leitura anon') then
    create policy "preferencias leitura anon" on public.preferencias_usuario for select to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preferencias_usuario' and policyname = 'preferencias escrita anon') then
    create policy "preferencias escrita anon" on public.preferencias_usuario for insert to anon with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preferencias_usuario' and policyname = 'preferencias atualizacao anon') then
    create policy "preferencias atualizacao anon" on public.preferencias_usuario for update to anon using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'atividades_usuario' and policyname = 'atividades leitura anon') then
    create policy "atividades leitura anon" on public.atividades_usuario for select to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'atividades_usuario' and policyname = 'atividades escrita anon') then
    create policy "atividades escrita anon" on public.atividades_usuario for insert to anon with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'produtos_base' and policyname = 'produtos leitura anon') then
    create policy "produtos leitura anon" on public.produtos_base for select to anon using (true);
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'validades'
    )
  then
    alter publication supabase_realtime add table public.validades;
  end if;
end $$;
