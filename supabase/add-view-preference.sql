alter table public.preferencias_usuario
add column if not exists visualizacao_validades text not null default 'tabela';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'preferencias_usuario_visualizacao_validades_check'
      and conrelid = 'public.preferencias_usuario'::regclass
  ) then
    alter table public.preferencias_usuario
    add constraint preferencias_usuario_visualizacao_validades_check
    check (visualizacao_validades in ('tabela', 'simples'));
  end if;
end
$$;
