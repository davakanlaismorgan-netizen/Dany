// Contrôle des traductions : mêmes clés en EN et FR, aucune clé utilisée mais absente,
// et signalement des clés définies mais jamais utilisées.
//   node scripts/check-i18n.mjs            -> échoue sur les écarts EN/FR et les clés manquantes
//   node scripts/check-i18n.mjs --strict   -> échoue aussi sur les clés mortes
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const strict = process.argv.includes('--strict');
const keysOf = (file) =>
  new Set([...readFileSync(file, 'utf8').matchAll(/^\s*(?:'([^']+)'|"([^"]+)"):/gm)].map((m) => m[1] ?? m[2]));
const en = keysOf('src/i18n/en.ts');
const fr = keysOf('src/i18n/fr.ts');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !p.startsWith('src/i18n') && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const sources = walk('src').map((f) => [f, readFileSync(f, 'utf8')]);
const all = sources.map(([, t]) => t).join('\n');

// Une clé est « utilisée » si sa chaîne exacte apparaît quelque part dans le code, ou si un
// préfixe dynamique t(`prefix.${x}`) la couvre.
const dynamicPrefixes = [...all.matchAll(/t\(\s*`([^`$]*)\$\{/g)].map((m) => m[1]);
const isUsed = (k) => all.includes(`'${k}'`) || all.includes(`"${k}"`) || dynamicPrefixes.some((p) => k.startsWith(p));

const problems = [];
for (const k of en) if (!fr.has(k)) problems.push(`clé absente du français : ${k}`);
for (const k of fr) if (!en.has(k)) problems.push(`clé absente de l'anglais : ${k}`);

const used = new Set();
for (const [file, text] of sources) {
  for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) {
    used.add(m[1]);
    if (!en.has(m[1]) || !fr.has(m[1])) problems.push(`clé utilisée mais non définie : ${m[1]} (${relative('.', file)})`);
  }
}
const dead = [...en].filter((k) => !isUsed(k));
if (strict) for (const k of dead) problems.push(`clé morte : ${k}`);

console.log(`i18n : ${en.size} clés EN, ${fr.size} clés FR, ${used.size} utilisées directement, ${dead.length} clé(s) morte(s)`);
if (!strict && dead.length) console.log(`  (avertissement) clés mortes : ${dead.slice(0, 8).join(', ')}${dead.length > 8 ? '…' : ''}`);
if (problems.length) {
  console.error(problems.map((p) => '  ✗ ' + p).join('\n'));
  process.exit(1);
}
