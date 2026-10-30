// THROWAWAY: browser comparison uses exactly the terminal renderer's fixtures.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { scenarios } from "./output-fixtures.ts";
import type { Scenario } from "./output-fixtures.ts";
import { progress } from "./output-progress.ts";
import {
  createTheme,
  phase,
  transcript,
  variantNames,
} from "./output-render.ts";
import type { Style, Variant } from "./output-render.ts";

const spinnerFrames = progress("", 0, 1, { color: true, width: 80 }).spinner
  .frames;

function progressSample(
  scenario: Scenario,
  variant: Variant,
  style: Style
): string {
  const active = Math.min(2, scenario.phases.length - 1);
  const activePhase = scenario.phases[active];
  if (activePhase === undefined) {
    return "Dry run · no operations execute\n";
  }
  const completed = scenario.phases
    .slice(0, active)
    .map((text, i) =>
      phase(text, i, scenario.phases.length, false, variant, style)
    )
    .join("");
  let current = `  ${active + 1}/${scenario.phases.length} Working: ${activePhase}`;
  if (style.color) {
    // Ora's actual frame formatter, without starting a timer in Node.
    const spinner = progress(
      activePhase,
      active,
      scenario.phases.length,
      style
    );
    const [firstFrame] = spinnerFrames;
    current = spinner.frame();
    if (firstFrame !== undefined) {
      current = current.replace(
        firstFrame,
        createTheme(style).location("__ORA_FRAME__")
      );
    }
  }
  return `${completed + current}\n`;
}

const snapshots = Object.fromEntries(
  Object.entries(scenarios).map(([name, scenario]) => [
    name,
    Object.fromEntries(
      variantNames.map((variant) => [
        variant,
        Object.fromEntries(
          [52, 80, 100].map((width) => [
            width,
            {
              color: transcript(scenario, variant, { width, color: true }),
              live: {
                color: progressSample(scenario, variant, {
                  width,
                  color: true,
                }),
                plain: progressSample(scenario, variant, {
                  width,
                  color: false,
                }),
              },
              plain: transcript(scenario, variant, { width, color: false }),
            },
          ])
        ),
      ])
    ),
  ])
);
const destination = path.resolve(".scratch/research/cli-output-preview.html");
mkdirSync(path.resolve(".scratch/research"), { recursive: true });
writeFileSync(
  destination,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CLI output prototypes</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101417;color:#e7edf0}*{box-sizing:border-box}body{margin:0;padding:32px 24px 100px}main{max-width:1100px;margin:auto}h1{font-size:24px;font-weight:550;margin:0 0 8px}p{color:#aab7c0;line-height:1.5}.controls{display:flex;gap:20px;flex-wrap:wrap;align-items:end;margin:24px 0}label{display:flex;flex-direction:column;gap:7px;font-size:13px;color:#aab7c0}label.check{flex-direction:row;align-items:center;padding-bottom:10px}select,button{font:inherit;color:#e7edf0;background:#1b252c;border:1px solid #3b4b56;border-radius:7px;padding:10px 14px}button{cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid #86ccde;outline-offset:3px}.terminal{background:#151b20;border:1px solid #2b3942;border-radius:12px;overflow:hidden}.titlebar{padding:12px 20px;border-bottom:1px solid #2b3942;color:#9aadb9;font-size:12px;display:flex;justify-content:space-between}pre{margin:0;padding:18px 24px 26px;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-x:auto;tab-size:2;white-space:pre}pre span.b{font-weight:700}.dim{color:#99aab5}.cyan{color:#8ed7e8}.green{color:#99d5a2}.yellow{color:#f0cd83}.red{color:#ff9e9e}.switcher{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;background:#25323c;border:1px solid #4a5d6c;box-shadow:0 8px 28px #0006;border-radius:40px;padding:8px}#variant{min-width:200px;text-align:center;font-size:14px}.switcher button{border:0;background:transparent;border-radius:30px}.verdict{max-width:800px;margin:20px 0}code{font-family:ui-monospace,monospace;font-size:13px;color:#c1e3ed}.live{font-size:13px}a{color:#8ed7e8}@media(max-width:600px){body{padding:22px 12px 110px}pre{padding:12px;font-size:12px}.controls{gap:12px}#variant{min-width:150px}.titlebar{padding:12px}}
</style></head><body><main>
<h1>Give the output a clear next step</h1><p>Ora for live progress. Effect for execution and prompts. Custom renderers for the handoff.<br>All receipts are simulated; commands shown here are examples.</p>
<div class="controls"><label>Scenario<select id="scenario"><option value="search">Search · manual Contentstack setup</option><option value="search-installed">Search · app installed</option><option value="search-vercel">Search · Vercel destination</option><option value="cms">CMS · manual Live Preview setup</option><option value="compose">Compose · provider setup remains</option><option value="failure">Search · partial failure</option><option value="plan">Search · dry run</option></select></label>
<label>Prose width<select id="width"><option value="52">52 columns</option><option value="80" selected>80 columns</option><option value="100">100 columns</option></select></label><label class="check"><input type="checkbox" id="plain"> Plain / piped output</label></div>
<div class="terminal" style="margin-bottom:20px"><div class="titlebar"><span>During execution · Ora progress sample</span><span>Simulated · stops before Effect prompts</span></div><pre id="progress"></pre></div>
<div class="terminal"><div class="titlebar"><span id="caption">Phase journal</span><span>After execution · custom renderer · Node styleText</span></div><pre id="output" aria-live="polite"></pre></div>
<p class="verdict" id="verdict"></p><p class="live">Try the live terminal version: <code id="run"></code></p>
</main><nav class="switcher" aria-label="Output layout"><button id="previous" aria-label="Previous layout">←</button><span id="variant"></span><button id="next" aria-label="Next layout">→</button></nav>
<script>
const snapshots=${JSON.stringify(snapshots).replaceAll("<", "\\u003c")};
const spinnerFrames=${JSON.stringify(spinnerFrames)};
let frameIndex=0;
const variants=['journal','receipt','guided'];
const titles=['A · Phase journal','B · Compact receipt','C · Guided checklist'];
const verdicts=['Recommended starting point: visible phases during execution, a short receipt, then numbered tasks with a specific destination.','Receipt first: a compact completion summary that is easy to scan or paste into a support conversation.','Action first: completed automation and unchecked human tasks share a checklist vocabulary.'];
const params=new URLSearchParams(location.search);let index=Math.max(0,variants.indexOf(params.get('variant')||'journal'));
const scenario=document.getElementById('scenario'),width=document.getElementById('width'),plain=document.getElementById('plain');
if(snapshots[params.get('scenario')])scenario.value=params.get('scenario');
function escaped(text){return text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function ansi(text){let classes=new Set();return text.split(/(\\u001b\\[[0-9;]*m)/).map(part=>{const match=part.match(/^\\u001b\\[([0-9;]*)m$/);if(!match)return '<span class="'+[...classes].join(' ')+'">'+escaped(part)+'</span>';for(const code of match[1].split(';').map(Number)){if(code===0)classes.clear();if(code===1)classes.add('b');if(code===2)classes.add('dim');if(code===22){classes.delete('b');classes.delete('dim');}if(code===39){for(const name of ['red','green','yellow','cyan'])classes.delete(name);}const name={31:'red',32:'green',33:'yellow',36:'cyan'}[code];if(name)classes.add(name);}return '';}).join('');}
function renderProgress(){const snapshot=snapshots[scenario.value][variants[index]][width.value];document.getElementById('progress').innerHTML=ansi(snapshot.live[plain.checked?'plain':'color'].replace('__ORA_FRAME__',spinnerFrames[frameIndex%spinnerFrames.length]));}
function render(){const v=variants[index];document.getElementById('output').innerHTML=ansi(snapshots[scenario.value][v][width.value][plain.checked?'plain':'color']);renderProgress();document.getElementById('variant').textContent=titles[index];document.getElementById('caption').textContent=titles[index];document.getElementById('verdict').textContent=verdicts[index];document.getElementById('run').textContent='pnpm cli:output-prototype --variant '+v+' --scenario '+scenario.value+' --onboarding'+(plain.checked?' --color never':'');const url=new URL(location.href);url.searchParams.set('variant',v);url.searchParams.set('scenario',scenario.value);history.replaceState(null,'',url);}
setInterval(()=>{frameIndex++;renderProgress();},80);
function move(delta){index=(index+delta+3)%3;render();}
document.getElementById('previous').onclick=()=>move(-1);document.getElementById('next').onclick=()=>move(1);scenario.onchange=width.onchange=plain.onchange=render;document.addEventListener('keydown',event=>{if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;if(event.key==='ArrowLeft')move(-1);if(event.key==='ArrowRight')move(1);});render();
</script></body></html>`
);
process.stdout.write(`${destination}\n`);
