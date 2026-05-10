# Código para criar um bot de Whatsapp para automatização de tarefas

## Rquisitos

**!!Node.js 22 ou superior - Conferir a versão: `node -v`!!**

## Criando o arquivo

**Criar um arquivo package:**

`npm init -y`

**Instalar o [Express] para gerenciar as requisições, rotas e URLs, entre outras funcionalidades:**

`npm i express`

**Instalar os pacotes para suporte TypeScript:**

`npm i --save-dev @types/express`
`npm i --save-dev @types/node`

**Instalar o compilador projeto com TypeScript e reiniciar o projeto quando o arquivo é modificado:**

`npm i --save-dev ts-node`

**Gerar o arquivo de cnfiguração para o TypeScript:**

`npx tsc --init`

**Executar o arquivo gerado com Node.js:**

`node dist/index.js`

**Instalar as dependências para conectar o Node.js (TypeScript) com banco de dados:**

`npm install typeorm --save`

**Biblioteca utilizada no TpyesCript para dicionar metaddos (informações adicionais) as classes:**

`npm install reflect-metadata --save`

**Instalar o drive do Banco de Dados [MySQL:]**

`npm install mysql2 --save`

**Importar o [cors:]**
`npm install cors`
`npm install -D @types/cors`

**Criação do banco de dados:**

`create database whatsapp_bot character set utf8mb4 collate utf8mb4_unicode_ci;`

**Criar, com migrations, a tabela que será usada no banco de dados:**

`npx typeorm migration:create src/migrations/<nome-da-migrations>`

`npx typeorm migration:create src/migrations/CreateUsersTable`

**Executar as migrations criadas:**

`npx typeorm migration:run -d dist/data-source.js`

**Execução automatizada de migrations:**

**No terminal, sempre usar o prefixo npm run seguido do nome do script:**

ex: `npm run typeorm migration:generate -- ./src/migrations/<TablleName> -d ./src/data-source.ts`

**Para transpilar (TS para JS):** `npm run build`

**Para rodar a migration (no banco):** `npm run migration:run`

**Verificar a pasta src/migrations: O TypeORM criará um arquivo '.ts' contendo os métodos 'up' e 'down' com o SQL pronto (ex: ALTER TABLE pessoas ADD...).**
Transpile e Rode: `npm run build && npm run migration:run`

**Para transpilar e gravar automaticamente as mudanças no banco de dados:**
`npm install ts-node-dev typescript ts-node --save-dev`
Para rodar: `npm run dev`

## A API é executada neste endereço: **<http://localhost:8080>**

**Importar o [bcrypt], uma biblioteca para criptografar senha:**

`npm install bcrypt`
`npm install --save-dev @types/bcrypt`
`Na entidade = import * as bcrypt from 'bcrypt;`

**Importar a biblioteca [JWT:]**
`npm install jsonwebtoken`
`npm install -D @types/jsonwebtoken`

**Instalar o [.env:]**
`npm install dotenv`
`Na entidade = import 'dotenv/config;`

**Comando para importar um [.gitgnore] já configurado:**
`npx gitignore node`

**Instalar o [multer], uma biblioteca que intercepta o arquivo e permite nomea-lo
(usar para gravar imagens no banco):**
`npm install multer`
`npm install -D @types/multer`

**Para rodar testes em uma aplicação [Node.js]+[TypeScript]+[TypeORM] o padrão é usar
a biblioteca [Jest]. Para importar a biblioteca:**
`npm install -D jest ts-jest @types/jest supertest @types/supertest`

O [Jest:] O executor dos testes.
O [ts-jest:] Permite que o `Jest` entenda arquivos `.ts`.
O [Supertest:] Essencial para testar rotas (as requisições HTTP).

*É essencial criar um arquivo `jest.config.js` na raiz do projeto.*

*Para garantir que o [Jest] funcione mesmo com o arquivo sendo ignorado pelo [tsc]*
`npm install -D ts-node`

**Para fazer o teste execute esse comando no [CMD:]**
`npm test -- --forceExit --silent`
`npm test -- --forceExit`

**Para utilizar o agendamento de ações rodar o [node-cron]**
`npm install node-cron`
`npm install --save-dev @types/node-cron`

**Instalação do [Multer]**
`npm install multer`
`npm install -D @types/multer`

**Tamanho padrão das imagens: [157x250]**

**Instalação do WhatsappWeb.js**
`npm install whatsapp-web.js qrcode-terminal`
`npm install --save-dev @types/qrcode-terminal`
