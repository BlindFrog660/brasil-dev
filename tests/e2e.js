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

