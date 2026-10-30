# Brasil em Desenvolvimento v6

Energia ONS: valores horários de intercâmbio em MWmed no mapa e no contexto Jarvis. Snapshot incorporado ao HTML para funcionar em file://. Pontos ilustrativos de fronteira; não representam usinas. Não mede geração de Itaipu. Sinal mantido como publicado, sem inferir direção. Fonte CC-BY: https://dados.ons.org.br/dataset/intercambio-internacional

Atualização diária às 06:30 de Brasília pelo workflow Atualizar energia ONS. Em caso de erro, permanece o snapshot anterior: observe a data no painel. Execute manualmente na primeira vez. Requer permissão de escrita; proteção de branch pode impedir commits. Commits automáticos não disparam Testar site: rode manualmente para validar.

GitHub: envie esta pasta para o repositório público brasil-dev, incluindo .github. Em Settings → Secrets and variables → Actions, cadastre GEMINI_API_KEY. Nunca coloque a chave no código ou no chat. Execute Actions → Testar site e baixe o artefato relatorio. Sem chave, desmarque usar_gemini. Relatórios não sobrescrevem mais a branch reports.

Para publicar: Settings → Pages → Deploy from a branch → main → / (root). O Secret não é publicado no HTML; no site cada usuário fornece sua própria chave no navegador. Uso sujeito às cotas gratuitas do Google.

Testes locais: Node 22+, npm install, npx playwright install chromium, npm test. Windows/Edge: BROWSER_CHANNEL=msedge. Atualizador: node scripts/update-energy.js.

Validação: 14 passos aprovados em Edge real nos modos file:// e HTTP. Gemini depende de Secret; criação do repositório e execução remota dependem de autenticação GitHub.

## Versão 8
Projetos salvos no navegador, com exportação/importação JSON (até 100 projetos, 500 KB por arquivo). A exportação não contém chave Gemini. Limpar dados do navegador pode apagar projetos: exporte cópias. Arquivos locais e site HTTP têm armazenamento separado.

Cópia oficial IBGE embutida no HTML, coletada em 29/10/2026: estados, malha UF mínima e agregado 5938/variável 37. Em caso de falha online, a interface identifica a coleta; o PIB continua mostrando seu ano de referência. Uma resposta online completa atualiza a cópia neste navegador. Dados de segurança não são dados em tempo real.

## Versão 9 — Pesquisa acadêmica
O botão Pesquisa acadêmica consulta gratuitamente a Crossref, limitada ao prefixo DOI 10.1590 (SciELO). Não é uma busca completa da SciELO. Escolha até cinco referências para o contexto do Jarvis. São enviados somente título, autores, ano e DOI; o artigo completo não é lido. Links da resposta indicam as referências selecionadas, não uma verificação automática de todas as afirmações. Consulte o trabalho e sua licença antes de reutilizar conteúdo. A busca não precisa de chave; a análise Gemini mantém as cotas já existentes. Ipea, BDTD e CEPAL são links externos, ainda sem consulta automática. A seleção é temporária e pode ser limpa. A Crossref pode registrar consulta e IP conforme sua política pública.
Fonte técnica: https://www.crossref.org/documentation/retrieve-metadata/rest-api/

## Versão 10 — Laboratório territorial
Nova interface escura: Sala de dependências como visão inicial e Território como visão complementar. Rede, interrupção de travessia, alternativa e croqui no mapa são DEMONSTRATIVOS: não representam ativos, gargalos, obras ou impactos reais comprovados. O mapa mantém os dados oficiais IBGE/ONS com suas referências.

Caderno de investigação: cadastre dados oficiais, literatura e notícias com título, URL HTTPS, data e nota. Fontes são salvas neste navegador; o sistema não lê nem verifica os links automaticamente. As últimas oito referências do caderno (notas limitadas a 500 caracteres) entram no contexto do Jarvis com identificação do tipo e proveniência. Notícias e anúncios não equivalem a obras executadas. A busca bibliográfica SciELO/Crossref continua disponível em Pesquisa acadêmica. Nenhum serviço pago foi acrescentado.

A demonstração Literatura → mapa → projeto permite aplicar duas lentes: Milton Santos (paráfrase da sinopse pública da Edusp, sem leitura integral do livro) e Bertha Becker (Geopolítica da Amazônia, 2005, artigo aberto DOI 10.1590/S0103-40142005000100005). O destaque da Região Norte é apenas recorte de navegação, não delimitação da Amazônia Legal. Os projetos são interpretações demonstrativas da plataforma, não propostas dos autores. A ficha exportada guarda referência, objetivo, etapas e a condição de estudo sem viabilidade validada.
