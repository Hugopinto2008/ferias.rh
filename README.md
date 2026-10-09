# Folga — Sistema de Gestão de Férias

Protótipo funcional para a Prova de Aptidão Profissional. Permite consultar o saldo de férias, criar pedidos, aprovar ou rejeitar pedidos, visualizar o calendário da equipa, gerir colaboradores e ajustar regras básicas.

## Abrir

Abre `index.html` num navegador moderno. Não é necessário instalar dependências nem iniciar um servidor.

## Perfis de demonstração

Usa o botão do perfil, no canto inferior esquerdo (ou o avatar no telemóvel), para alternar entre:

- Hugo Pinto — Administrador
- Marta Silva e Leonor Alves — Responsáveis
- Inês Costa, Tiago Rocha e João Mendes — Colaboradores

Os dados de demonstração e as alterações ficam guardados no `localStorage` do navegador. A ação **Administração > Repor dados** restaura os dados iniciais.

## O que já funciona

- Pedidos de férias com contagem de dias úteis, validação de saldo e aviso de conflito.
- Aprovação, rejeição e cancelamento de pedidos, conforme o perfil selecionado.
- Calendário mensal com pedidos aprovados e pendentes.
- Consulta de saldos, atividade recente e equipa.
- Adição de colaboradores e configuração das regras de demonstração.
- Layout adaptado a computador e telemóvel.

## Limite desta versão

Esta versão é um protótipo de front-end: não tem autenticação real nem base de dados partilhada. O `localStorage` é local ao navegador e não deve ser usado para dados reais de colaboradores. Para a versão final prevista na apresentação, o próximo passo é ligar a aplicação a uma API (por exemplo, PHP) e a uma base de dados MySQL, acrescentando autenticação e permissões no servidor.

## Preparação inicial para WampServer

O projeto inclui agora `database/schema.sql`, que cria as tabelas `departments`, `users` e `leave_requests`, e uma ligação PDO em `config/database.php`. A configuração assume o utilizador local `root` sem palavra-passe, valor comum numa instalação WampServer nova; pode ser substituído com as variáveis de ambiente `FOLGA_DB_HOST`, `FOLGA_DB_PORT`, `FOLGA_DB_NAME`, `FOLGA_DB_USER` e `FOLGA_DB_PASSWORD`. Não uses esta configuração predefinida num servidor público.

1. Abre o WampServer e espera pelo ícone verde; confirma que Apache e MySQL estão ativos.
2. No phpMyAdmin (`http://localhost/phpmyadmin`), importa `database/schema.sql`.
3. Publica a pasta do projeto no diretório `www` do WampServer ou configura um VirtualHost para a pasta atual.
4. Abre `http://localhost/folga/api/health.php` (ajusta `folga` ao nome da pasta). Uma resposta com `"status":"ok"` confirma a ligação.

O endpoint de saúde só verifica a ligação; o interface ainda usa os dados locais de demonstração. A próxima etapa é implementar autenticação e endpoints de pedidos e ligar o interface a eles.