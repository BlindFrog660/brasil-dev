const fs = require('node:fs');
async function main() {
  const year = new Date().getUTCFullYear();
  const source = `https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/intercambio_internacional_ho/INTERCAMBIO_INTERNACIONAL_${year}.csv`;
  const response = await fetch(source, {signal: AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`ONS HTTP ${response.status}`);
  const csv = await response.text();
  const lines = csv.trim().replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.shift() !== 'din_instante;nom_paisdestino;val_intercambiomwmed;val_intercambioprogmwmed') throw new Error('Formato ONS alterado');
  const latest = {};
  for (const line of lines) {
    const [time, rawCountry, rawValue] = line.split(';');
    const country = rawCountry?.trim(), value = Number(rawValue);
    if (!country || !rawValue?.trim() || !Number.isFinite(value) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)) throw new Error('Registro ONS inválido');
    if (!latest[country] || time > latest[country].time) latest[country] = {country, time, value};
  }
  if (!latest.Argentina || !latest.Uruguai) throw new Error('Países esperados ausentes');
  const data = {source, retrievedAt: new Date().toISOString(), unit:'MWmed', records:Object.values(latest)};
  const file = 'index.html';
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('/* ENERGY_DATA_START */')) throw new Error('Marcador ausente');
  fs.writeFileSync(file, html.replace(/\/\* ENERGY_DATA_START \*\/[\s\S]*?\/\* ENERGY_DATA_END \*\//, `/* ENERGY_DATA_START */\nconst energyData=${JSON.stringify(data)};\n/* ENERGY_DATA_END */`));
  console.log('ONS atualizada:', data.records);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
