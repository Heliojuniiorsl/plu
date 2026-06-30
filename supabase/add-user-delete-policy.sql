drop policy if exists "usuarios exclusao anon" on public.usuarios;

create policy "usuarios exclusao anon"
on public.usuarios for delete
to anon
using (matricula <> '000000');
