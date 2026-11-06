# Folga — Sistema de Gestão de Férias

Aplicação estática para GitHub Pages. O login e os perfis usam Supabase; o WampServer não é necessário para executar a versão publicada.

## Publicar no GitHub Pages

1. Cria um projeto no Supabase.
2. No SQL Editor do Supabase, executa o conteúdo de `supabase/schema.sql`.
3. Em Authentication → Users, cria as contas de administrador e dos funcionários. O trigger cria automaticamente um perfil com papel `Colaborador`.
4. Promove a conta de administrador no SQL Editor, substituindo o e-mail:

	```sql
	update public.profiles
	set role = 'Administrador'
	where id = (select id from auth.users where email = 'admin@exemplo.pt');
	```

5. Em Project Settings → API, copia o Project URL e a chave pública `anon`/publishable para `supabase-config.js`. Não coloques a chave `service_role` neste ficheiro nem no frontend.
6. No GitHub, abre Settings → Pages e escolhe **GitHub Actions** como origem.
7. Envia as alterações para a branch `main` ou `master`. O workflow `.github/workflows/pages.yml` publica apenas `index.html`, `app.js`, `styles.css` e `supabase-config.js`; os ficheiros PHP não são publicados.

O endereço será `https://<utilizador>.github.io/<repositorio>/`. A primeira publicação aparece no separador Actions do repositório.

## Contas e dados

- A entrada em `index.html` separa Administração e Funcionários; o papel é obtido da tabela `profiles` no Supabase.
- Para adicionar contas, cria-as em Supabase Authentication → Users. A conta nova começa como `Colaborador`; atribui `Responsável` ou `Administrador` apenas pelo painel seguro do Supabase.
- A chave pública Supabase pode estar no frontend; a proteção dos dados depende das políticas RLS instaladas pelo SQL.
- Pedidos, calendário, equipa e definições do painel ainda são guardados no `localStorage` do navegador. Não são sincronizados entre dispositivos nem constituem armazenamento adequado para dados reais de funcionários.
- Os ficheiros PHP e o esquema MySQL continuam no repositório para a versão local antiga, mas não são executados nem incluídos no deploy do Pages.