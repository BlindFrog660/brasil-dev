# Cofre Brasil em Desenvolvimento

Abra esta pasta como cofre no Obsidian: `vault` (a pasta que contém Brasil em Desenvolvimento).

As notas iniciais são públicas, contêm paráfrases e referências, não livros integrais. Edite notas e use [[links]] para interligá-las. O site inclui uma cópia compilada dessas notas. Não existe sincronização automática.

## Fluxos gratuitos

1. No site, Obsidian e arquivos → Baixar cofre em ZIP. Extraia e abra a pasta externa como cofre.
2. Para levar alterações de volta ao site, importe os arquivos .md. A importação só afeta o navegador atual; não publica no GitHub.
3. API opcional: no cofre exclusivo, habilite o plugin comunitário Local REST API. Use o endereço HTTPS local e a chave apenas no painel do site. A leitura é limitada à pasta Brasil em Desenvolvimento; gravação cria arquivo novo com precondição de inexistência. Certificado e acesso à rede local dependem da configuração do navegador/dispositivo.
4. Mantenha a chave fora de notas, repositórios e chats. O painel apaga a chave ao fechar. Não desabilite a validação do certificado.

## Publicar notas revisadas

Edite os Markdown públicos em vault/Brasil em Desenvolvimento no repositório e execute `node scripts/build-knowledge.js`. Revise o diff do index.html antes de publicar. O compilador só inclui notas com visibility: public. Não copie seu cofre pessoal para o repositório público.

## Limites

Leitura local e API não são backup ou sincronização bidirecional. Exportações têm de ser guardadas. Notas importadas só entram no contexto da IA mediante a ação “Investigar nota com Jarvis”, que envia a nota selecionada e até cinco vizinhas. A chave da API do Obsidian nunca é enviada à IA.
