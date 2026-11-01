/* Teste de ponta a ponta do index.html num Chromium real (Playwright).
   Gera report/latest.md e report/latest.json (+ capturas de tela e amostras de dados). */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http");

const KEY = process.env.GEMINI_API_KEY || "";
const GEM = process.env.RUN_GEMINI !== "false" && !!KEY;
const OUT = "report";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT + "/screens", { recursive: true });
fs.mkdirSync(OUT + "/amostras", { recursive: true });

const scrub = t => { t = String(t ?? ""); return KEY ? t.split(KEY).join("[CHAVE]") : t; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = {
  quando: new Date().toISOString(),
  commit: (process.env.GITHUB_SHA || "local").slice(0, 7),
  ambiente: process.env.GITHUB_ACTIONS ? "GitHub Actions" : "Windows local; navegador real",
  gemini: GEM ? "sim" : (KEY ? "desligado nesta execução" : "sem chave (secret GEMINI_API_KEY ausente)"),
  navegador: "", sondas: [], cenarios: [], erroFatal: null,
};

/* ---------- sondas de rede (sem navegador) ---------- */
async function sondar(nome, url, opts = {}) {
  const t = Date.now(), s = { nome, url };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: opts.headers || {} });
    const b = await r.text();
    s.status = r.status; s.bytes = b.length; s.tipo = r.headers.get("content-type") || "";
    if (opts.amostra) fs.writeFileSync(`${OUT}/amostras/${nome}.txt`, scrub(b.slice(0, 6000)));
  } catch (e) { s.erro = e.name + ": " + scrub(e.message).slice(0, 120); }
  s.ms = Date.now() - t; R.sondas.push(s);
}
async function todasSondas() {
  const I = "https://servicodados.ibge.gov.br/api/";
  await sondar("ibge_estados", I + "v1/localidades/estados");
  await sondar("ibge_pib", I + "v3/agregados/5938/periodos/-1/variaveis/37?localidades=N3[all]", { amostra: true });
  await sondar("cdnjs_leaflet", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js");
  await sondar("esri_tile", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/4/7/5");
  if (KEY) await sondar("gemini_modelos", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=5", { headers: { "x-goog-api-key": KEY } });
  /* palpites para a etapa de energia (endereços ainda não verificados) */
  await sondar("ons_ckan_intercambio", "https://dados.ons.org.br/api/3/action/package_search?q=intercambio&rows=10", { amostra: true });
  await sondar("aneel_ckan_geracao", "https://dadosabertos.aneel.gov.br/api/3/action/package_search?q=geracao&rows=10", { amostra: true });
}

/* ---------- servidor local simples (simula o GitHub Pages) ---------- */
function servir() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.url.split("?")[0] === "/data/snapshots.js") { rsp.writeHead(200, {"Content-Type":"application/javascript; charset=utf-8"});rsp.end(fs.readFileSync("data/snapshots.js"));return; }
      if (/^\/data\/parts\/[a-z]+-\d+\.js$/.test(req.url)) { rsp.writeHead(200,{"Content-Type":"application/javascript; charset=utf-8"});rsp.end(fs.readFileSync("."+req.url));return; }
      if (req.url.split("?")[0] !== "/") { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      rsp.end(fs.readFileSync("index.html"));
    }).listen(8123, () => res(srv));
  });
}

/* ---------- cenário de navegador ---------- */
async function cenario(browser, nome, url, gem, slug) {
  const c = { nome, passos: [], console: [], requisicoesFalhas: [], hosts: {} };
  R.cenarios.push(c);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  const host = u => { try { return new URL(u).host || "(local)"; } catch (e) { return "?"; } };
  page.on("console", m => { if (["error", "warning"].includes(m.type())) c.console.push(m.type() + ": " + scrub(m.text()).slice(0, 300)); });
  page.on("pageerror", e => c.console.push("pageerror: " + scrub(e.message).slice(0, 300)));
  page.on("requestfailed", r => c.requisicoesFalhas.push(host(r.url()) + " — " + (r.failure()?.errorText || "")));
  page.on("response", r => { const h = host(r.url()), o = c.hosts[h] = c.hosts[h] || {}; o[r.status()] = (o[r.status()] || 0) + 1; });

  const passo = async (n, fn) => {
    const t = Date.now();
    try {
      const d = await fn();
      c.passos.push(d && d.falhou
        ? { nome: n, ok: false, ms: Date.now() - t, detalhe: scrub(d.detalhe) }
        : { nome: n, ok: true, ms: Date.now() - t, detalhe: scrub(d ?? "") });
    } catch (e) {
      c.passos.push({ nome: n, ok: false, ms: Date.now() - t, detalhe: scrub(e.message).split("\n")[0].slice(0, 300) });
    }
  };
  const ev = (f, a) => page.evaluate(f, a);
  const shot = n => page.screenshot({ path: `${OUT}/screens/${slug}-${n}.png` }).catch(() => {});

  await passo("Abrir a página", async () => { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }); });

  await passo("Dashboard seleciona uma, várias ou todas as nove camadas",async()=>{
    if(!await page.locator('#sector-controls').isVisible())throw new Error('Dashboard não é a visão inicial');
    if(await page.locator('[data-sector]').count()!==9||await ev(()=>projectSkills.length)!==4||await ev(()=>kgNotes.filter(n=>n.path.startsWith('Camadas/')).length)!==9)throw new Error('Camadas ou skills incompletas');
    await page.click('#sector-all');if(await page.locator('[data-sector]:checked').count()!==9)throw new Error('Seleção total falhou');
    await page.click('#sector-none');if(await ev(()=>sectorSelected.size||sectorLayers.size))throw new Error('Limpeza de camadas falhou');
    for(const id of ['ferrovias','portos','aeroportos'])await page.check(`[data-sector="${id}"]`);
    if(await ev(()=>sectorSelected.size)!==3)throw new Error('Seleção múltipla falhou');
    await ev(async()=>{for(const id of ['ferrovias','portos','aeroportos'])await loadSector(sectorCatalog.find(d=>d.id===id),{full:true})});
    const result=await ev(()=>Object.fromEntries([...sectorLayers].map(([k,l])=>[k,l.getLayers().length])));
    if(result.ferrovias!==52||result.portos!==247||result.aeroportos!==505)throw new Error('Cópias oficiais não carregaram completas');
    await page.selectOption('#analysis-mode','cartografia-oficial-brasil');
    if(!(await ev(()=>analysisModeContext())).toLowerCase().includes('distribuição'))throw new Error('Skill não entrou no método do Jarvis');
    await page.selectOption('#analysis-mode','analisar-infraestrutura-brasil');
    return '9 seleções; composição múltipla; 52 trechos, 247 instalações portuárias localizadas e 505 aeroportos de fontes oficiais; 4 skills disponíveis.';
  });
  await passo("Pergunta sobre Norte–Sul desenha traçado e abre histórico documentado",async()=>{
    await page.fill('#q','Mostre a Ferrovia Norte-Sul no mapa');await page.click('#cf button');
    await page.waitForFunction(()=>!busy&&sectorLayers.get('ferrovias')?.getLayers().length===52);
    const trace=await ev(()=>{const fs=sectorLayers.get('ferrovias').toGeoJSON().features;let pts=0;const walk=c=>{if(typeof c[0]==='number')pts++;else c.forEach(walk)};fs.forEach(f=>walk(f.geometry.coordinates));const r=sectorLayers.get('ferrovias').getLayers().find(l=>l.feature.properties.vhr_ferrov==='RMC');r.fire('click');return {pts,types:[...new Set(fs.map(f=>f.geometry.type))]}});
    if(trace.pts<1000||trace.types.some(t=>!t.includes('LineString')))throw new Error('Traçado foi substituído por pontos ou retas');
    const dossier=await page.textContent('#asset-inspector');if(!dossier.includes('1.537')||!dossier.includes('31/07/2019')||!dossier.includes('1987'))throw new Error('Dossiê não contém histórico, extensão e recorte');
    await page.locator('#asset-inspector').getByRole('button',{name:'Salvar nota no cofre'}).click();
    if(!await ev(()=>kgUserNotes.some(n=>n.path.startsWith('Ativos/ferrovias-')&&n.source.includes('infrasa'))))throw new Error('Ativo não foi ligado ao cofre com fonte');
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/screens/${slug}-16-dashboard.png`,fullPage:true});
    return `${trace.pts} vértices oficiais; histórico e extensão contratual delimitados; nota vinculada ao cofre.`;
  });
  await passo("Distribuição é regional e produção é agregada, sem falsa precisão",async()=>{
    const r=await ev(async()=>{const d=await unpackSector('distribution');return {n:d.features.length,entities:[...new Set(d.features.map(f=>f.properties.entidade))],kinds:[...new Set(d.features.map(f=>f.geometry.type))]}});
    if(r.n!==12254||r.entities.some(e=>!['SSDMT','SSDBT','SSDAT'].includes(e))||r.kinds.some(t=>!t.includes('LineString')))throw new Error('Distribuição contém dado errado ou unidade consumidora');
    const prod=await ev(()=>territorialSnapshots.production);if(prod.referenceYear!==2021||prod.records.length!==27||prod.variables.industria!==517)throw new Error('Produção sem recorte ou variável correta');
    await page.waitForFunction(()=>!!geo,{timeout:20000});
    await ev(async()=>{sectorSelected.add('agro');sectorSelected.add('industria');sectorSelected.add('transportadoras');await loadSector(sectorCatalog.find(d=>d.id==='agro'));await loadSector(sectorCatalog.find(d=>d.id==='industria'));await loadSector(sectorCatalog.find(d=>d.id==='transportadoras'))});
    if(await ev(()=>sectorLayers.get('industria').getLayers().length)!==27)throw new Error('Indústria não usou regiões');
    if(await ev(()=>sectorStates.get('transportadoras').state)!=='error')throw new Error('Transportadoras indisponíveis foram apresentadas como disponíveis');
    await page.setViewportSize({width:390,height:844});
    if(!await ev(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Dashboard transborda no celular');
    await page.screenshot({path:`${OUT}/screens/${slug}-17-dashboard-mobile.png`,fullPage:true});await page.setViewportSize({width:1400,height:850});
    await page.click('#sector-none');await ev(()=>{kgUserNotes=[];localStorage.removeItem('brasil-knowledge-v1');kgAISelection=null;sectorAIAsset=null;rebuildKnowledge()});
    return '12.254 segmentos regionais de distribuição; agro/indústria estaduais de 2021; fonte indisponível explícita; celular sem transbordamento.';
  });

  await passo("Segundo cérebro usa notas, links e backlinks reais",async()=>{
    await page.click('[data-workspace-view="knowledge"]');
    if(!await page.locator('#knowledge-view').isVisible())throw new Error('Segundo cérebro não é a visão inicial');
    await page.waitForSelector('#kg-graph .kg-node');
    const base=await ev(()=>({n:kgNotes.length,links:kgEdges().length,missing:knowledgeSeed.flatMap(n=>kgLinks(n).filter(l=>!kgResolve(l.target))).length}));
    if(base.n<43||base.links<30||base.missing)throw new Error('Base inicial incompleta ou com links quebrados');
    await page.locator('#kg-list').getByRole('button',{name:'Milton Santos',exact:true}).click();
    await page.locator('#kg-note').getByRole('button',{name:'A Natureza do Espaço',exact:true}).first().click();
    if(!(await page.textContent('#kg-note')).includes('Mencionada por'))throw new Error('Backlinks ausentes');
    await page.check('#kg-local');
    if(await page.locator('#kg-graph .kg-node').count()>=base.n)throw new Error('Filtro local não restringe o grafo');
    await page.uncheck('#kg-local');await page.fill('#kg-search','Bertha Becker');
    if(!await page.locator('#kg-list').getByRole('button',{name:'Bertha Becker',exact:true}).isVisible())throw new Error('Busca não encontra autora');
    await page.fill('#kg-search','');await page.click('#kg-zoom-in');
    if(await ev(()=>kgScale)<=1)throw new Error('Zoom não altera enquadramento');
    await page.click('#kg-reset');await page.locator('#kg-list').getByRole('button',{name:'Bertha Becker',exact:true}).click();
    await page.evaluate(()=>window.scrollTo(0,200));await page.screenshot({path:`${OUT}/screens/${slug}-15-segundo-cerebro.png`,fullPage:true});
    return `${base.n} notas; ${base.links} links; títulos resolvidos, backlinks, busca e zoom funcionando.`;
  });
  await passo("Markdown local persiste, preserva links e exporta ZIP válido",async()=>{
    await page.click('#kg-new');await page.fill('#kg-edit-title','Investigação de teste');await page.fill('#kg-edit-body','# Investigação de teste\n\nPergunta relacionada a [[Brasil]] e [[Milton Santos]].\n\n<img src=x onerror=alert(1)>');await page.click('#kg-edit-form button');
    if(await page.locator('#kg-note img').count())throw new Error('HTML da nota foi executado');
    const persist=await ev(()=>JSON.parse(localStorage.getItem('brasil-knowledge-v1')).find(n=>n.title==='Investigação de teste'));
    if(!persist||await ev(()=>knowledgeContext())!=='')throw new Error('Nota não salva ou enviada à IA sem seleção');
    await page.reload({waitUntil:'domcontentloaded'});await page.click('[data-workspace-view="knowledge"]');await page.waitForSelector('#kg-list button');
    await page.locator('#kg-list').getByRole('button',{name:'Investigação de teste',exact:true}).click();
    const roundtrip=await ev(()=>{const n=kgNotes.find(x=>x.path===kgSelected),p=kgParse(kgMarkdown(n),n.path);return p.body.trim()===n.body.trim()&&kgResolve('Brasil')&&kgLinks(p).length===2});
    if(!roundtrip)throw new Error('Roundtrip Markdown perdeu conteúdo ou links');
    const zip=await ev(async()=>{const b=kgZip([{path:'Brasil em Desenvolvimento/Teste.md',content:'# Teste\n\n[[Brasil]]'}]);return Array.from(new Uint8Array(await b.arrayBuffer()))});
    fs.writeFileSync(`${OUT}/amostras/cofre-${slug}.zip`,Buffer.from(zip));
    if(Buffer.from(zip).readUInt32LE(0)!==0x04034b50||Buffer.from(zip).readUInt32LE(zip.length-22)!==0x06054b50)throw new Error('ZIP inválido');
    await page.click('#kg-connect');await page.setInputFiles('#kg-files',{name:'Ata.md',mimeType:'text/markdown',buffer:Buffer.from('---\ntitle: "Ata local"\ntype: "Nota"\n---\n\n# Ata local\n\nVer [[Brasil]].')});
    await page.waitForFunction(()=>document.getElementById('kg-integration-status').textContent.includes('importadas'));
    if(!await ev(()=>kgNotes.some(n=>n.title==='Ata local'&&n.visibility==='private-local')))throw new Error('Importação não marcada como local');
    await page.click('#kg-integration-close');
    return 'Notas locais restauradas; HTML inerte; Markdown com links preservado; ZIP gerado; importação privada.';
  });
  await passo("API Obsidian limita pasta, protege chave e cria sem sobrescrever",async()=>{
    const requests=[];
    await page.route('https://127.0.0.1:27124/**',async route=>{const r=route.request(),url=decodeURIComponent(r.url());requests.push({url,method:r.method(),headers:r.headers(),body:r.postData()});
      if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,PUT,OPTIONS'}});
      const headers={'access-control-allow-origin':'*'};
      if(r.method()==='PUT')return route.fulfill({status:204,headers});
      if(url.endsWith('/Brasil em Desenvolvimento/'))return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({files:['API-teste.md']})});
      return route.fulfill({status:200,headers,contentType:'text/markdown',body:'---\ntitle: "Nota API teste"\ntype: "Nota"\n---\n\n# Nota API teste\n\nLigação com [[Brasil]].'});
    });
    await page.click('#kg-connect');await page.fill('#kg-api-key','credencial-ficticia-e2e');await page.click('#kg-api-pull');
    await page.waitForFunction(()=>document.getElementById('kg-integration-status').textContent.includes('notas lidas'));
    if(!await ev(()=>kgNotes.some(n=>n.title==='Nota API teste')))throw new Error('API não importou nota');
    await page.click('#kg-api-write');await page.waitForFunction(()=>document.getElementById('kg-integration-status').textContent.includes('Nova nota gravada'));
    const writes=requests.filter(r=>r.method==='PUT');if(writes.length!==1||writes[0].headers['if-none-match']!=='*'||!writes[0].url.includes('/Brasil em Desenvolvimento/Entrada/'))throw new Error('Gravação sem precondição ou fora da pasta');
    if(requests.some(r=>!r.url.includes('/vault/Brasil em Desenvolvimento/')))throw new Error('API leu fora da pasta');
    if(await ev(()=>JSON.stringify(localStorage).includes('credencial-ficticia-e2e')||knowledgeContext().includes('credencial-ficticia-e2e')))throw new Error('Chave persistida ou no contexto da IA');
    await page.click('#kg-integration-close');if(await page.inputValue('#kg-api-key'))throw new Error('Chave não foi apagada ao fechar');
    await page.unroute('https://127.0.0.1:27124/**');
    await ev(()=>{kgUserNotes=[];localStorage.removeItem('brasil-knowledge-v1');kgAISelection=null;rebuildKnowledge()});
    await page.click('[data-workspace-view="network"]');
    return 'API simulada: leitura limitada, importação local, criação sem overwrite e credencial apenas na sessão. Plugin real ainda depende da configuração local.';
  });

  await passo("Sala de dependências integra seleção, cenário e território",async()=>{
    await page.waitForSelector("#dependency-network circle");
    if(!await page.locator("#network-view").isVisible())throw new Error("Sala de dependências não é a visão inicial");
    await page.click('[data-pilot-node="port"]');
    if(!await page.locator("#investigation-title").textContent().then(t=>t.includes("Porto C")))throw new Error("Dossiê não acompanhou seleção");
    await page.click("#close-crossing");await page.selectOption("#scenario-mode","alternative");
    const info=await ev(()=>({closed:pilotClosed,alt:pilotAlternative,context:investigationContext()}));
    if(!info.closed||!info.alt||!info.context.includes("DEMONSTRATIVO"))throw new Error("Cenário não foi identificado como demonstrativo");
    await page.click("#toggle-evidence");if(!await page.locator("#evidence-list").isVisible())throw new Error("Evidências não abriram");
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/screens/${slug}-0-sala-dependencias.png`,fullPage:true});await page.click("#pilot-in-map");
    if(!await page.locator("#map-view").isVisible()||await ev(()=>pilotMapLayer.getLayers().length)<5)throw new Error("Croqui não apareceu no território");
    await page.uncheck("#layer-pilot");await ev(()=>map.setView([-14.2,-51.9],4));
    return "Rede selecionável, evidências, cenário hipotético e croqui no mapa funcionando.";
  });

  await passo("Dados do IBGE carregam", async () => {
    await page.waitForFunction(() => /Dados do IBGE carregados|Não consegui acessar o IBGE/.test(document.getElementById("log").textContent), null, { timeout: 40000 });
    const t = await ev(() => document.getElementById("log").textContent);
    if (t.includes("Não consegui")) return { falhou: true, detalhe: "o IBGE não respondeu a partir deste servidor (pode ser bloqueio de IP fora do Brasil; veja as sondas)" };
  });

  await passo("27 estados desenhados no mapa", async () => {
    const n = await ev(() => Object.keys(layers).length);
    if (n !== 27) return { falhou: true, detalhe: n + " polígonos (esperado 27)" };
    return n + " polígonos";
  });

  await passo("Mapa base (Esri) carregou", async () => {
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length > 0, null, { timeout: 20000 });
    return (await ev(() => document.querySelectorAll(".leaflet-tile-loaded").length)) + " blocos carregados";
  });
  await shot("1-inicio");

  await passo("Clicar em São Paulo mostra o PIB", async () => {
    await ev(() => { layers["35"].fire("click", { latlng: layers["35"].getBounds().getCenter() }); });
    const o = await ev(() => ({ uf: document.getElementById("uf").textContent, pib: document.getElementById("pib").textContent, sub: document.getElementById("pibsub").textContent }));
    if (!o.uf.includes("São Paulo") || !/R\$ [\d.,]+ bi/.test(o.pib)) return { falhou: true, detalhe: JSON.stringify(o) };
    return `${o.uf} · ${o.pib} · ${o.sub}`;
  });

  await passo("Mapa segue a pergunta (sem IA): Rondônia", async () => {
    await page.fill("#q", "qual o pib de Rondônia?");
    await page.click("#cf button");
    await page.waitForFunction(() => document.getElementById("uf").textContent.includes("Rondônia"), null, { timeout: 8000 });
    await sleep(1800);
    const o = await ev(() => ({ dentro: layers["11"].getBounds().contains(map.getCenter()), c: map.getCenter(), z: map.getZoom() }));
    await shot("2-rondonia");
    if (!o.dentro) return { falhou: true, detalhe: "o centro do mapa não ficou dentro de Rondônia: " + JSON.stringify(o.c) };
    return `centro (${o.c.lat.toFixed(2)}, ${o.c.lng.toFixed(2)}) zoom ${o.z}`;
  });

  await passo("Energia ONS no mapa e contexto Jarvis", async () => {
    const o=await ev(()=>({n:energyData.records.length,text:context(),panel:document.getElementById("energy").textContent}));
    if(o.n<2 || !o.text.includes("MWmed") || !o.panel.includes("Argentina")) throw new Error("Energia ausente");
    return o.panel;
  });

  await passo("Cópia oficial funciona com IBGE bloqueado", async () => {
    await page.route("https://servicodados.ibge.gov.br/**", r=>r.abort());
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>typeof geo!=="undefined"&&geo&&Object.keys(layers).length===27);
    const data=await ev(()=>({backup:ibgeBackup,year:pibs["35"].ano,value:pibs["35"].v}));
    if(!data.backup||data.value<=0)throw new Error("Cópia IBGE inválida");
    return `27 estados; PIB de referência ${data.year}; cópia explicitamente identificada.`;
  });
  await passo("Projetos sobrevivem ao recarregamento e podem ser exportados", async () => {
    await ev(()=>layers["35"].fire("click",{latlng:layers["35"].getBounds().getCenter()}));
    await page.click('[data-workspace-view="map"]');
    await page.fill("#ptitle","Projeto de teste persistente");await page.click("#pf button");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>typeof geo!=="undefined"&&geo);
    const saved=await ev(()=>({n:projects.length,t:projects[0]?.t,markers:projectMarkers.getLayers().length}));
    if(saved.n!==1||saved.t!=="Projeto de teste persistente"||saved.markers!==1)throw new Error("Projeto não restaurado");
    await page.click('[data-workspace-view="map"]');
    const downloadPromise=page.waitForEvent("download");await page.click("#export-projects");const download=await downloadPromise;
    const doc=JSON.parse(fs.readFileSync(await download.path(),"utf8"));if(doc.version!==1||doc.projects.length!==1||JSON.stringify(doc).includes(KEY)&&KEY)throw new Error("Exportação inválida");
    return "Projeto e marcador restaurados; JSON exportado sem credenciais.";
  });
  await passo("Importação inválida não apaga projetos", async()=>{
    await page.locator("#project-file").setInputFiles({name:"invalido.json",mimeType:"application/json",buffer:Buffer.from('{"version":1,"projects":[{"t":"inválido"}]}')});
    await page.waitForFunction(()=>document.getElementById("project-status").textContent.includes("recusada"));
    if(await ev(()=>projects.length)!==1)throw new Error("Importação alterou projetos existentes");
    const doc=await ev(()=>JSON.stringify({version:1,projects}));
    await page.locator("#project-file").setInputFiles({name:"valido.json",mimeType:"application/json",buffer:Buffer.from(doc)});
    await page.waitForFunction(()=>!document.getElementById("project-status").textContent.includes("recusada"));
    if(await ev(()=>projects.length)!==1)throw new Error("Importação duplicou o projeto");
    return "Arquivo inválido recusado; reimportação válida sem duplicação.";
  });

  await passo("Literatura orienta mapa e projeto com autoria e limites explícitos",async()=>{
    await page.click("#theory-open");await page.selectOption("#theory-select","becker");await page.click("#theory-apply");
    const info=await ev(()=>({theory:activeTheory,text:document.getElementById("theory-active").textContent,ctx:theoryContext()}));
    if(info.theory!=="becker"||!info.text.includes("Amazônia Legal")||!info.ctx.includes("Não atribua"))throw new Error("Lente sem escopo ou autoria explícitos");
    await page.click("#theory-create-project");
    const pr=await ev(()=>projects.find(p=>p.theory==="becker"));
    if(!pr?.demonstrative||!pr.reference?.url||pr.steps.length!==4)throw new Error("Projeto não contém referência e plano de estudo");
    await shot("12-literatura-projeto");await page.click("#theory-clear");await page.click("#theory-close");
    await ev(()=>{projects=projects.filter(p=>!p.theory);renderProjects();persistProjects()});
    return "Bertha Becker com fonte e recorte explícitos; projeto demonstrativo salvo com objetivo e etapas.";
  });
  await passo("Biblioteca de autores responde com proveniência e recusa tema sem apoio",async()=>{
    await page.click('#scholar-open');
    await page.waitForSelector('#scholar-dialog[open]');
    const initial=await ev(()=>({author:selectedScholar,note:scholarResult.note?.id,src:document.getElementById('scholar-photo').src,ctx:scholarContext()}));
    if(initial.author!=='santos'||initial.note!=='MS-01'||!initial.ctx.includes('Não personifique'))throw new Error('Consulta sem autoria, fonte ou limite');
    await page.fill('#scholar-question','Qual é a previsão de chuva amanhã?');await page.click('#scholar-submit');
    if(!(await page.textContent('#scholar-result')).includes('Sem apoio suficiente')||!(await page.isDisabled('#scholar-project')))throw new Error('Resposta sem fonte foi permitida');
    await page.fill('#scholar-question','<img src=x onerror=alert(1)>');await page.click('#scholar-submit');
    if(await page.locator('#scholar-result img').count())throw new Error('Pergunta interpretada como HTML');
    await page.click('[data-scholar="becker"]');
    await page.locator('#scholar-suggestions button').nth(1).click();
    if(await ev(()=>scholarResult.note?.id)!=='BB-02')throw new Error('Rede não recuperou nota pertinente');
    await page.screenshot({path:`${OUT}/screens/${slug}-13-biblioteca.png`,fullPage:true});
    await page.click('#scholar-project');
    const saved=await ev(()=>projects.find(p=>p.scholarQuestion));
    if(!saved?.reference?.noteId||saved.steps.length!==3||!saved.demonstrative)throw new Error('Ficha sem referência e etapas');
    await page.click('#scholar-project');
    if(await ev(()=>projects.filter(p=>p.scholarQuestion).length)!==1)throw new Error('Ficha duplicada');
    await page.click('#scholar-jarvis');
    if(!(await page.textContent('#scholar-status')).includes('configurada'))throw new Error('Ausência de IA não foi explicada');
    await page.click('#scholar-map');
    if(await ev(()=>activeTheory)!=='becker'||await page.locator('#scholar-dialog[open]').count())throw new Error('Lente não aplicada');
    await ev(()=>{projects=projects.filter(p=>!p.scholarQuestion);renderProjects();persistProjects();scholarResult=null;activeTheory='';document.getElementById('theory-active').hidden=true;geo?.eachLayer(l=>geo.resetStyle(l))});
    return 'Notas citadas; tema sem apoio e HTML tratados; ficha sem duplicação; conexão ao mapa.';
  });
  await passo("Biblioteca funciona no celular e narração tem ciclo controlado",async()=>{
    await page.setViewportSize({width:390,height:844});await page.click('#scholar-open');
    await page.click('[data-scholar="santos"]');
    const voice=await ev(()=>{if(!('speechSynthesis'in window))return {supported:false};const old=speechSynthesis.speak,oldCancel=speechSynthesis.cancel;let heard='';speechSynthesis.speak=u=>{heard=u.text;u.onstart?.()};speechSynthesis.cancel=()=>{};readScholar();const active=document.getElementById('scholar-stage').classList.contains('is-reading');stopScholarVoice();const stopped=!document.getElementById('scholar-stage').classList.contains('is-reading');speechSynthesis.speak=old;speechSynthesis.cancel=oldCancel;return {supported:true,active,stopped,heard}});
    if(voice.supported&&(!voice.active||!voice.stopped||!voice.heard.includes('Síntese da plataforma')))throw new Error('Narração sem identificação ou encerramento');
    const dims=await ev(()=>{const d=document.getElementById('scholar-dialog');return {s:d.scrollWidth,c:d.clientWidth}});
    if(dims.s>dims.c+2)throw new Error('Biblioteca transborda no celular');
    await page.screenshot({path:`${OUT}/screens/${slug}-14-biblioteca-mobile.png`,fullPage:true});
    await page.keyboard.press('Escape');
    if(await page.locator('#scholar-dialog[open]').count())throw new Error('Escape não fecha biblioteca');
    await page.setViewportSize({width:1400,height:850});await ev(()=>{scholarResult=null});
    return '390px sem transbordamento; Escape fecha; reprodução e parada verificadas com voz simulada.';
  });

  await passo("Caderno distingue notícias e preserva fontes após recarregar",async()=>{
    await page.click("#sources-open");await page.selectOption("#source-type","news");
    await page.fill("#source-title","Notícia demonstrativa de teste");await page.fill("#source-url","https://example.org/noticia-de-teste");
    await page.fill("#source-date","2026-10-30");await page.fill("#source-note","Anúncio a confirmar em fonte oficial.");await page.click("#source-form button");
    if(await ev(()=>investigationSources.length)!==1)throw new Error("Fonte não adicionada");
    await page.click("#sources-close");await page.reload({waitUntil:"domcontentloaded"});
    const source=await ev(()=>({n:investigationSources.length,c:sourceNotebookContext()}));
    if(source.n!==1||!source.c.includes("Notícia")||!source.c.includes("sem verificação automática"))throw new Error("Fonte perdeu categoria ou proveniência");
    await page.click("#sources-open");await page.click("#source-notebook-list button");await page.click("#sources-close");
    if(await ev(()=>investigationSources.length)!==0)throw new Error("Remoção de fonte falhou");
    await page.click('[data-workspace-view="map"]');
    return "Notícia salva e restaurada com data e nota; contexto distingue anúncio de fato comprovado.";
  });

  await passo("Pesquisa acadêmica real com DOI e contexto rastreável", async()=>{
    await page.click("#research-open");await page.fill("#research-query","energia");await page.click("#research-submit");
    await page.waitForFunction(()=>!document.getElementById("research-submit").disabled,null,{timeout:20000});
    if(await page.locator(".research-result").count()===0)throw new Error(await page.locator("#research-status").textContent());
    await page.locator(".research-result input").first().check();
    const result=await ev(()=>({refs:[...selectedReferences.values()],context:academicContext()}));
    if(!result.refs[0].doi.startsWith("10.1590/")||!result.context.includes("NÃO foi lido"))throw new Error("Referência sem rastreabilidade");
    const href=await page.locator(".research-result a").first().getAttribute("href");if(new URL(href).hostname!=="doi.org")throw new Error("Link de referência inseguro");
    await shot("11-pesquisa");return result.refs[0].title+" · "+result.refs[0].doi;
  });
  await passo("Pesquisa trata falha de rede sem inventar resultados",async()=>{
    await page.route("https://api.crossref.org/**",r=>r.abort());await page.fill("#research-query","consulta bloqueada para teste");await page.click("#research-submit");
    await page.waitForFunction(()=>!document.getElementById("research-submit").disabled);
    if(!await page.locator("#research-status").textContent().then(x=>x.includes("Não foi possível")))throw new Error("Falha não informada");
    if(await page.locator(".research-result").count()!==0)throw new Error("Resultados antigos mostrados como atuais");
    await page.click("#clear-references");if(await ev(()=>selectedReferences.size)!==0)throw new Error("Referências não limpas");
    await page.click("#research-close");return "Falha explícita, sem resultados fabricados; seleção pode ser limpa.";
  });

  if (gem) {
    await passo("Preencher a chave do Gemini", async () => { await ev(() => { document.getElementById("ai-settings").open = true; }); await page.fill("#key", KEY); });
    await passo("Teste de velocidade da API (botão da página)", async () => {
      await ev(() => { document.getElementById("ai-settings").open = true; });
      await page.click("#test");
      await page.waitForFunction(() => [...document.querySelectorAll("#log .m")].some(m => m.textContent.startsWith("TESTE DE VELOCIDADE")), null, { timeout: 150000 });
      const t = await ev(() => [...document.querySelectorAll("#log .m")].pop().textContent);
      return /HTTP 200/.test(t) ? t : { falhou: true, detalhe: t };
    });

    const perguntar = async q => {
      const n = await ev(() => document.querySelectorAll("#log .m").length);
      await page.fill("#q", q);
      await page.click("#cf button");
      await page.waitForFunction(k => document.querySelectorAll("#log .m").length >= k + 2 && document.getElementById("status").textContent.includes("Pronto"), n, { timeout: 100000 });
      await sleep(1800);
      return ev(() => ({ resp: [...document.querySelectorAll("#log .m.j")].pop().textContent, diag: document.getElementById("diag").textContent }));
    };
    const ruim = r => /^(A API|Falha|Nenhum modelo|Ainda estou)/.test(r.resp);
    const dist = (a, b) => Math.hypot(a.lat - b[0], a.lng - b[1]);

    await passo("Jarvis usa PIB carregado ou informa indisponibilidade", async () => {
      if(await ev(()=>Object.keys(pibs).length===0)) {
        await page.fill("#q","Qual o PIB de São Paulo?"); await page.click("#cf button");
        const reply=await ev(()=>[...document.querySelectorAll("#log .m.j")].pop().textContent);
        if(!reply.includes("Não tenho um PIB verificado")) throw new Error("Jarvis informou PIB sem fonte");
        return "IBGE indisponível: Jarvis recusou informar PIB sem verificação.";
      }
      const r = await perguntar("Qual o PIB de São Paulo e de que ano é o dado? Responda em 2 frases.");
      const d = r.diag + "\nResposta: " + r.resp;
      return ruim(r) ? { falhou: true, detalhe: d } : d;
    });

    const lugar = async (nome, q, alvo, lim, tira) => passo(nome, async () => {
      const r = await perguntar(q);
      const o = await ev(() => ({ marca: mark !== null, c: map.getCenter(), z: map.getZoom() }));
      await shot(tira);
      const d = `${r.diag}\nResposta: ${r.resp}\nMapa: marca=${o.marca} centro (${o.c.lat.toFixed(2)}, ${o.c.lng.toFixed(2)}) zoom ${o.z}`;
      if (ruim(r)) return { falhou: true, detalhe: d };
      if (!o.marca || dist(o.c, alvo) > lim) return { falhou: true, detalhe: "o mapa não foi ao lugar esperado\n" + d };
      return d;
    });
    await lugar("Mapa vai a Itaipu (marca amarela)", "Fale da usina de Itaipu em até 3 frases.", [-25.41, -54.59], 2.5, "3-itaipu");
    await lugar("Mapa vai ao Porto de Santos", "Qual a importância do Porto de Santos para o Mercosul? Responda em 3 frases.", [-23.98, -46.30], 1.5, "4-santos");
  }

  await shot("9-final");
  await passo("Controles gratuitos de voz disponíveis", async () => {
    await page.locator("#voice-settings summary").click();
    if (!await page.locator("#voice-select").isVisible()) throw new Error("Seletor de voz ausente");
    await page.locator("#voice-rate").fill("1.05");
    const rate=await page.locator("#rate-label").textContent();
    if(!rate.includes("1,05")) throw new Error("Velocidade não atualizada");
    await page.locator("#voice-stop").click();
    return "Seleção de voz, velocidade e parada disponíveis; qualidade auditiva depende das vozes do navegador.";
  });
  await passo("Layout móvel sem rolagem horizontal", async () => {
    await page.click('[data-workspace-view="network"]');
    await page.setViewportSize({width:390,height:844});
    await ev(()=>map.invalidateSize());
    const fits=await ev(()=>document.documentElement.scrollWidth<=window.innerWidth);
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${OUT}/screens/${slug}-10-mobile.png`,fullPage:true});
    if(!fits) throw new Error("Conteúdo ultrapassa a largura do celular");
    return "390px: mapa e painéis adaptados";
  });
  await ctx.close();
}

/* ---------- relatório ---------- */
function relatorio() {
  const L = [], ps = R.cenarios.flatMap(c => c.passos);
  L.push(`# Relatório de teste — ${R.quando}`, "",
    `- Commit: \`${R.commit}\` · ${R.navegador || "navegador não iniciou"}`,
    `- Ambiente: ${R.ambiente}`, `- Gemini real: ${R.gemini}`,
    `- **Resumo: ${ps.filter(p => p.ok).length} passos OK, ${ps.filter(p => !p.ok).length} com falha**`);
  if (R.erroFatal) L.push("", "## ERRO FATAL", "```", R.erroFatal, "```");
  L.push("", "## Sondas de rede (sem navegador)", "", "| Alvo | Status | Tempo | Bytes | Obs |", "|---|---|---|---|---|");
  R.sondas.forEach(s => L.push(`| ${s.nome} | ${s.status ?? "—"} | ${s.ms} ms | ${s.bytes ?? "—"} | ${(s.erro || s.tipo || "").replace(/\|/g, "/")} |`));
  R.cenarios.forEach(c => {
    L.push("", `## Cenário: ${c.nome}`, "");
    c.passos.forEach(p => {
      const d = p.detalhe || "";
      L.push(`- ${p.ok ? "✅" : "❌"} **${p.nome}** (${(p.ms / 1000).toFixed(1)} s)${d && !d.includes("\n") ? ": " + d : ""}`);
      if (d.includes("\n")) L.push("  ```", ...d.split("\n").map(x => "  " + x), "  ```");
    });
    L.push("", `Hosts contatados (status: contagem): \`${JSON.stringify(c.hosts)}\``);
    if (c.console.length) L.push("", "Mensagens de console:", ...[...new Set(c.console)].slice(0, 15).map(x => "- " + x));
    if (c.requisicoesFalhas.length) L.push("", "Requisições que falharam:", ...[...new Set(c.requisicoesFalhas)].slice(0, 15).map(x => "- " + x));
  });
  return scrub(L.join("\n"));
}
function escrever() {
  fs.writeFileSync(OUT + "/latest.md", relatorio());
  fs.writeFileSync(OUT + "/latest.json", scrub(JSON.stringify(R, null, 2)));
  const falhas = R.cenarios.flatMap(c => c.passos).filter(p => !p.ok).length;
  if (falhas || R.erroFatal) process.exitCode = 1;
}

(async () => {
  let srv, browser;
  try {
    await todasSondas();
    srv = await servir();
    browser = await chromium.launch(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {});
    R.navegador = "Chromium " + browser.version();
    const tentar = async (...a) => { try { await cenario(...a); } catch (e) { R.erroFatal = (R.erroFatal || "") + "\ncenário \"" + a[1] + "\": " + scrub(e.stack || e.message).slice(0, 600); } };
    await tentar(browser, "arquivo local (file://), como você abre no PC", require("url").pathToFileURL(path.resolve("index.html")).href, GEM, "file");
    await tentar(browser, "servidor http, como será no GitHub Pages", "http://localhost:8123/", false, "http");
  } catch (e) {
    R.erroFatal = scrub(e.stack || e.message).slice(0, 1500);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (srv) srv.close();
    escrever();
    console.log(relatorio());
  }
})();

