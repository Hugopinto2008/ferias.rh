# Folga — Sistema de Gestão de Férias

Aplicação para a Prova de Aptidão Profissional, feita com PHP, MySQL, HTML, CSS e JavaScript.

## Preparar no WampServer

1. Inicia o WampServer e espera pelo ícone verde.
2. Abre `http://localhost/phpmyadmin`, importa `database/schema.sql` e confirma que foi criada a base `folga_db`. Se a base já existir, volta a importar o ficheiro para criar a tabela das definições da empresa.
3. Configura um VirtualHost para a pasta do projeto ou coloca a pasta dentro do diretório `www` do WampServer.
4. Confirma a ligação em `http://folga.local/api/health.php` (ou troca `folga.local` pelo endereço configurado). A resposta esperada é `{"status":"ok","database":"connected"}`.
5. Na PowerShell, a partir da pasta do projeto, executa `php database/create_admin.php`. Se `php` não estiver no PATH, usa o executável PHP selecionado no WampServer, por exemplo `& 'C:\wamp64\bin\php\php8.4.15\php.exe' 'database\create_admin.php'`.
6. Segue as perguntas no terminal para criar a primeira conta administradora. Usa uma palavra-passe forte, com pelo menos 12 caracteres.
7. Abre `http://folga.local/`. A página inicial verifica PHP e MySQL e, estando disponíveis, abre o formulário de login.

O projeto precisa de um servidor que execute PHP e de MySQL. GitHub Pages, Live Server e outros alojamentos apenas estáticos não suportam login PHP; a página inicial mostra uma mensagem de configuração em vez de tentar descarregar um ficheiro PHP.

A configuração local de `config/database.php` assume o utilizador MySQL `root` sem palavra-passe. Se a instalação tiver credenciais diferentes, configura as variáveis de ambiente `FOLGA_DB_HOST`, `FOLGA_DB_PORT`, `FOLGA_DB_NAME`, `FOLGA_DB_USER` e `FOLGA_DB_PASSWORD`. Não publiques credenciais num repositório nem uses os valores predefinidos num servidor público.

Depois de criar o administrador, apaga `database/create_admin.php`. O script só pode correr na linha de comandos e recusa criar outro administrador se já existir um.

## Acesso e privacidade

- `login.php` valida a palavra-passe com `password_verify()` e cria uma sessão PHP com cookie `HttpOnly`.
- `index.php` exige uma sessão válida e obtém o perfil ativo da base de dados.
- `api/app.php` disponibiliza pedidos e colaboradores com verificações de sessão, CSRF e permissões no servidor.
- Os colaboradores veem e submetem os próprios pedidos; administradores e responsáveis consultam os pedidos da equipa, e só administradores criam contas e alteram definições da empresa.
- Pedidos, contas e definições são guardados no MySQL, partilhados entre utilizadores e dispositivos.
- O seletor de perfis e os dados pessoais fictícios da versão de demonstração foram removidos.
- `config/` e `database/` bloqueiam acesso HTTP através de `.htaccess`.

## Estado e configuração

O administrador inicial é criado pelo script de linha de comandos descrito acima. Depois, pode criar contas de colaboradores e definir o respetivo perfil, e-mail, palavra-passe inicial, departamento e saldo anual no separador Equipa. Testa os fluxos com contas separadas de administrador e colaborador antes de usar dados reais.