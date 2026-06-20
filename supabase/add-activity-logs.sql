create extension if not exists "pgcrypto";

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

create index if not exists atividades_usuario_usuario_data_idx
on public.atividades_usuario (usuario_id, created_at desc);

create index if not exists atividades_usuario_acao_idx
on public.atividades_usuario (acao);

alter table public.atividades_usuario enable row level security;

drop policy if exists "atividades leitura anon" on public.atividades_usuario;
create policy "atividades leitura anon"
on public.atividades_usuario for select
to anon
using (true);

drop policy if exists "atividades escrita anon" on public.atividades_usuario;
create policy "atividades escrita anon"
on public.atividades_usuario for insert
to anon
with check (true);
