alter table public.usuarios
add column if not exists nome text;

update public.usuarios
set nome = 'Administrador'
where matricula = '000000'
  and (nome is null or btrim(nome) = '');
