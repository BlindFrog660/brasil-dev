---
name: cartografia-oficial-brasil
description: "Localize e represente infraestrutura brasileira em mapas com traçados, pontos ou polígonos oficiais, distinguindo cobertura e precisão. Use para integrar ou revisar camadas geográficas."
---

# Cartografia oficial

Use geometria publicada pela entidade responsável ou por um portal oficial que documente a origem. Preserve identificadores, referência temporal, sistema de coordenadas e endpoint. No Leaflet, GeoJSON usa longitude/latitude; solicite saída EPSG:4326 quando a fonte permitir.

Um ponto aproximado nunca substitui o traçado de uma ferrovia, rodovia ou rede. Não una terminais por reta para simular alinhamento. Extensão geométrica calculada deve ser distinguida da extensão operacional ou contratual publicada. Trecho sem tráfego e trecho em operação não são equivalentes.

Em consultas por área, declare bbox, filtros, total retornado, limite e paginação. Ausência na resposta não prova inexistência do ativo. Distribuição e transmissão de energia são camadas diferentes; unidades geradoras e concessionárias também.

Escolha pontos para instalações, linhas para redes e polígonos para agregados territoriais. Não coloque empresas individuais no centro do município como se fosse seu endereço. Teste CRS, limites espaciais e associação entre ficha e geometria.
