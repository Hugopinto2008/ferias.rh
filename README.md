# Folga — Sistema de Gestão de Férias

Aplicação para a Prova de Aptidão Profissional, feita com PHP, MySQL, HTML, CSS e JavaScript.

## Preparar no WampServer

1. Inicia o WampServer e espera pelo ícone verde.
2. Abre `http://localhost/phpmyadmin`, importa `database/schema.sql` e confirma que foi criada a base `folga_db`.
3. Configura um VirtualHost para a pasta do projeto ou coloca a pasta dentro do diretório `www` do WampServer.
4. Confirma a ligação em `http://folga.local/api/health.php` (ou troca `folga.local` pelo endereço configurado). A resposta esperada é `{"status":"ok","database":"connected"}`.
5. Na PowerShell, a partir da pasta do projeto, executa `php database/create_admin.php`. Se `php` não estiver no PATH, usa o executável PHP selecionado no WampServer, por exemplo `& 'C:\wamp64\bin\php\php8.4.15\php.exe' 'database\create_admin.php'`.
6. Segue as perguntas no terminal para criar a primeira conta administradora. Usa uma palavra-passe forte, com pelo menos 12 caracteres.
7. Abre `http://folga.local/`. Sem sessão, a página envia o visitante para o formulário de login.

A configuração local de `config/database.php` assume o utilizador MySQL `root` sem palavra-passe. Se a instalação tiver credenciais diferentes, configura as variáveis de ambiente `FOLGA_DB_HOST`, `FOLGA_DB_PORT`, `FOLGA_DB_NAME`, `FOLGA_DB_USER` e `FOLGA_DB_PASSWORD`. Não publiques credenciais num repositório nem uses os valores predefinidos num servidor público.

Depois de criar o administrador, apaga `database/create_admin.php`. O script só pode correr na linha de comandos e recusa criar outro administrador se já existir um.

## Acesso e privacidade

- `login.php` valida a palavra-passe com `password_verify()` e cria uma sessão PHP com cookie `HttpOnly`.
- `index.php` exige uma sessão válida e obtém o perfil ativo da base de dados.
- A navegação de Administração só é gerada para administradores.
- O seletor de perfis e os dados pessoais fictícios da versão de demonstração foram removidos.
- `config/` e `database/` bloqueiam acesso HTTP através de `.htaccess`.

## Estado atual e próximos passos

O login já consulta utilizadores MySQL e a entrada do painel está protegida. O painel ainda não lê nem grava pedidos e equipa na base de dados; os formulários remanescentes guardam alterações localmente por conta neste navegador. Não introduzas dados reais de colaboradores até a API MySQL dos pedidos e da gestão de equipa estar implementada.

Próximas etapas recomendadas: criar gestão de contas no painel de administrador; ligar pedidos, saldos e calendário a endpoints PHP com permissões por perfil e departamento; acrescentar histórico/auditoria; e testar todos os fluxos com contas de administrador, responsável e colaborador.