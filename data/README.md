# Fontes do dashboard multissetorial

As cópias geográficas usadas no navegador estão em `snapshots.js` e nos fragmentos `parts/*.js`, como GeoJSON comprimido com gzip e codificado em base64. A função `unpackSector` apenas descomprime a geometria publicada ou convertida; não cria traçados por IA. Não há credenciais nesse arquivo.

- Ferrovia Norte–Sul: consulta `vhr_ferrov IN ('RMC','FNSTN')` na camada `https://geo.infrasa.gov.br/server/rest/services/Ferrovias_Concedidas_em_opera%C3%A7%C3%A3o/FeatureServer/0`. 52 feições, saída EPSG:4326. Referência declarada pelo serviço: Declaração de Rede 2024/ANTT. Consulta em 01/11/2026. O histórico de 1987 e da assinatura de 31/07/2019 é referenciado no dossiê; 1.537 km se refere ao recorte central/sul comunicado na assinatura, não à soma da geometria ou situação contratual atual.
- Portos: 248 registros da camada (247 pontos válidos e um registro sem geometria) `https://geo.infrasa.gov.br/server/rest/services/Terminais_Portu%C3%A1rias/FeatureServer/0`, origem ANTAQ conforme descrição da Infra S.A. Não é delimitação dos terminais, capacidade ou série de movimentação. Consulta em 01/11/2026; data individual não informada.
- Aeroportos: 505 pontos da camada `https://geo.infrasa.gov.br/server/rest/services/Aeroportos/FeatureServer/0`, origem ANAC conforme metadados da Infra S.A. Não inclui automaticamente aeródromos privados. Consulta em 01/11/2026; data individual não informada.
- Distribuição: BDGD/ANEEL, Ceral Araruama 6603, referência 31/12/2023, V11, publicação 08/01/2025. Item oficial `https://dadosabertos-aneel.opendata.arcgis.com/datasets/34727428a26d4f179ca549caf83b40cc`. Conversão das entidades SSDMT (6.686) e SSDBT (5.568), sem unidades consumidoras e sem dados pessoais. SSDAT estava vazia. Transformação EPSG:4674 → EPSG:4326 com Pyogrio/GDAL, Shapely e Pyproj. Preservados campos de identificação e atributos técnicos selecionados; não houve simplificação intencional do traçado. É um recorte regional no RJ, não cobertura brasileira. Dados derivados disponibilizados sob ODbL, conforme a base BDGD/ANEEL: https://opendatacommons.org/licenses/odbl/1-0/ . A licença dos dados não é uma licença do código do site.
- Rodovias: consulta por área ao serviço `Rodovias_Federais/FeatureServer/0` da Infra S.A., origem DNIT/SNV. Verificar `versao_snv` por trecho. Cada resposta informa seu limite; ausência em consulta parcial não comprova ausência de estrada.
- Usinas: consultas por área às camadas 0/2/3/4/18/19/21 do SIGEL/ANEEL. Potências são os atributos originais em kW quando assim nomeados; não equivalem a geração efetiva. Fase e atualização individual devem ser consultadas na ficha.
- Agropecuária e indústria: `producao-uf.json`, soma calculada dos 5.570 municípios, tabela IBGE 5938, variáveis 513 e 517, referência 2021, mil reais. A consulta 2023 retornou valores ausentes. Os dados são agregados por UF e não localizam fazendas ou fábricas.
- Transportadoras: `transportadoras-uf.json` registra a indisponibilidade da fonte RNTRC Set/2026 durante a coleta. Nenhuma contagem ou localização foi criada para preencher a ausência. A categoria é selecionável, mas seu estado permanece pendente.

## Consulta espacial

As consultas remotas usam envelope visível em EPSG:4326, saída GeoJSON, até 600 elementos por subcamada e uma consulta de contagem quando disponível. A interface indica parcialidade. Mova/aproxime o mapa e atualize a área para aprofundar o recorte. Não há alegação de inventário nacional completo ou atualização em tempo real.

## Skills e IA

As quatro skills estão em `.agents/skills`; os modos de investigação do Jarvis usam as mesmas instruções como método. Isso não cria ferramentas de pesquisa automática nem dá acesso ao cofre. Um ativo só entra no contexto por ação explícita. Os campos ausentes não são preenchidos pela IA.
