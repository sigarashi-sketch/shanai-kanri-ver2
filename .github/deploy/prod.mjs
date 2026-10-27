// GitHub Actions の本番出し（.github/deploy/run.sh）が使う、いまの本番を Vercel に聞く道具（2026-10-27・Mac の見張り役 prod-check.mjs / prod-pull.mjs の写し）
//   node prod.mjs check <main を展開したフォルダ>   … いまの本番が main の歴史に載っている中身だけで出来ているか
//       1行目 OK / NG / ERR、2行目以降 理由。
//       Actions が出したデプロイ（meta.ghDeploy=actions）は meta.ghSha が main の歴史にあれば OK。
//       Mac から CLI で出したデプロイ（src/ に元のファイルがある）は ファイルの sha1 を main の歴史と比べる（Mac だけにある変更があれば NG＝上から出すと消える）
//   node prod.mjs pull <出すフォルダ> <前置き（例 mf/）> … git に入れていないフォルダを 本番から取ってきて置く
//       Actions のデプロイは 組み上げたあとの形なので 元のファイルが無い。元のファイルを持つ いちばん新しい本番（Mac から出した分）から取る
//   env: VERCEL_TOKEN・VERCEL_SCOPE（チームの slug）・VERCEL_PROJECT（プロジェクト名）・PROD_IGNORE（check で比べない前置き・空白区切り）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [mode, dir, prefix] = process.argv.slice(2);
const token = process.env.VERCEL_TOKEN || '';
const slug = process.env.VERCEL_SCOPE || '';
const project = process.env.VERCEL_PROJECT || '';
const ignores = (process.env.PROD_IGNORE || '').split(/\s+/).filter(Boolean);
if (!dir || !token || !slug || !project || !['check', 'pull'].includes(mode) || (mode === 'pull' && !prefix)) {
  console.log('ERR\n使い方: prod.mjs check <dir> | pull <dir> <prefix>（env VERCEL_TOKEN・VERCEL_SCOPE・VERCEL_PROJECT）');
  process.exit(9);
}

const call = async (p) => {
  const r = await fetch(`https://api.vercel.com${p}${p.includes('?') ? '&' : '?'}slug=${slug}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${p.split('?')[0]} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
};
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const isActions = (d) => (d.meta || {}).ghDeploy === 'actions';

// 本番の READY のデプロイを新しい順に（最大 200）
const prodDeployments = async function* () {
  let until = '';
  for (let page = 0; page < 2; page++) {
    const j = await (await call(`/v6/deployments?app=${project}&target=production&state=READY&limit=100${until ? `&until=${until}` : ''}`)).json();
    for (const d of j.deployments || []) yield d;
    until = j.pagination && j.pagination.next;
    if (!until) return;
  }
};

// CLI で出したデプロイの元のファイル（src/ の下）
const sourceFiles = async (d) => {
  const tree = await (await call(`/v6/deployments/${d.uid}/files`)).json();
  const files = [];
  const walk = (nodes, pre) => { for (const n of nodes || []) { const p = pre ? `${pre}/${n.name}` : n.name; if (n.type === 'directory') walk(n.children, p); else if (n.type === 'file') files.push({ p, uid: n.uid }); } };
  walk(Array.isArray(tree) ? tree : tree.files || [], '');
  const src = files.filter((f) => f.p.startsWith('src/'));
  return (src.length ? src.map((f) => ({ p: f.p.slice(4), uid: f.uid })) : files).filter((f) => f.uid);
};

const git = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const inHistory = (p, want) => {
  let commits = [];
  try { commits = git(['log', '--format=%H', '-n', '300', 'HEAD', '--', p]).split('\n').filter(Boolean); } catch { return false; }
  for (const c of commits) {
    try { if (sha1(execFileSync('git', ['-C', dir, 'show', `${c}:${p}`], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] })) === want) return true; } catch { /* その版では消えている */ }
  }
  return false;
};
const IGNORE = /^(\.vercel|\.next|node_modules|\.git)(\/|$)|^next-env\.d\.ts$|\.tsbuildinfo$|^\.deploy\.log$/;

try {
  if (mode === 'check') {
    let d = null;
    for await (const x of prodDeployments()) { d = x; break; }
    if (!d) { console.log('ERR\n本番のデプロイが見つからない'); process.exit(3); }
    const when = `本番 ${d.url}（${new Date(d.created).toISOString()}）`;
    if (isActions(d)) {
      const s = (d.meta || {}).ghSha || '';
      let ok = false;
      try { execFileSync('git', ['-C', dir, 'merge-base', '--is-ancestor', s, 'HEAD'], { stdio: 'ignore' }); ok = !!s; } catch { ok = false; }
      console.log(ok ? `OK\n${when} は Actions が main の ${s.slice(0, 7)} から出したもの` : `NG\n${when} は Actions が ${s.slice(0, 7) || '?'} から出したが、それが main の歴史に無い`);
      process.exit(ok ? 0 : 1);
    }
    const use = (await sourceFiles(d)).filter((f) => !IGNORE.test(f.p) && !ignores.some((x) => f.p.startsWith(x)));
    if (!use.length) { console.log('ERR\n本番のファイルの一覧が取れない'); process.exit(4); }
    const bad = [];
    let older = 0;
    for (const f of use) {
      let h = '';
      try { h = sha1(fs.readFileSync(path.join(dir, f.p))); } catch { h = ''; }
      if (h === f.uid) continue;
      if (inHistory(f.p, f.uid)) { older++; continue; }
      bad.push(h ? `${f.p}（中身が main に無い）` : `${f.p}（main に無い）`);
    }
    if (bad.length) { console.log(['NG', when, ...bad.slice(0, 20), bad.length > 20 ? `ほか ${bad.length - 20} 件` : ''].filter(Boolean).join('\n')); process.exit(1); }
    console.log(`OK\n${when} の ${use.length} ファイルは main に載っている${older ? `（うち ${older} 件は main の古い版＝本番が遅れているだけ）` : ''}`);
    process.exit(0);
  }

  // pull
  let d = null;
  for await (const x of prodDeployments()) { if (!isActions(x)) { d = x; break; } }
  if (!d) { console.log(`元のファイルを持つ本番のデプロイが見つからない（${prefix} を取れない）`); process.exit(3); }
  const use = (await sourceFiles(d)).filter((f) => f.p.startsWith(prefix));
  for (const f of use) {
    const r = await call(`/v7/deployments/${d.uid}/files/${f.uid}`);
    let buf = Buffer.from(await r.arrayBuffer());
    if (sha1(buf) !== f.uid) {
      try { const j = JSON.parse(buf.toString('utf8')); if (typeof j.data === 'string') buf = Buffer.from(j.data, 'base64'); } catch { /* 生のまま */ }
    }
    if (sha1(buf) !== f.uid) throw new Error(`${f.p} の中身が合わない（取り方が変わった？）`);
    const out = path.join(dir, f.p);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
  }
  console.log(`本番 ${d.url}（${new Date(d.created).toISOString()}）から ${prefix} の ${use.length} ファイルを取ってきた`);
} catch (e) {
  console.log((mode === 'check' ? 'ERR\n' : '') + String((e && e.message) || e));
  process.exit(5);
}
