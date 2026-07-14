const fs = require('fs');
const path = '/home/node/.n8n/database.sqlite';

function tryBetter() {
  try {
    return require('better-sqlite3');
  } catch {
    return null;
  }
}

async function main() {
  const Better = tryBetter();
  if (!Better) {
    // fallback: use sql.js or child sqlite via python
    const { execSync } = require('child_process');
    try {
      const out = execSync(
        'python3 - <<"PY"\nimport sqlite3,json\ndb=sqlite3.connect("/home/node/.n8n/database.sqlite")\nc=db.cursor()\nprint("WORKFLOWS")\nfor r in c.execute("SELECT id,name,active FROM workflow_entity ORDER BY updatedAt DESC LIMIT 20"):\n print(json.dumps({"id":r[0],"name":r[1],"active":bool(r[2])}))\nrows=list(c.execute("SELECT id,name,active,nodes FROM workflow_entity WHERE lower(name) LIKE \'%ask%\'"))\nif rows:\n r=rows[0]\n nodes=json.loads(r[3])\n print("ASK",r[0],r[1],bool(r[2]))\n print("NODES")\n for n in nodes: print(n.get("name"),"|",n.get("type"))\n print("PARSE")\n for n in nodes:\n  if "Parse" in n.get("name",""):\n   print(n.get("parameters",{}).get("jsCode","")[:2500])\nprint("EXECS")\nfor r in c.execute("SELECT id,workflowId,finished,mode,status,startedAt,stoppedAt FROM execution_entity ORDER BY startedAt DESC LIMIT 10"):\n print(json.dumps({"id":r[0],"wf":r[1],"finished":r[2],"mode":r[3],"status":r[4],"started":r[5],"stopped":r[6]}))\nPY',
        { encoding: 'utf8', maxBuffer: 10_000_000 },
      );
      console.log(out);
      return;
    } catch (e) {
      console.error('python fail', e.message);
    }
  }

  const db = new Better(path, { readonly: true });
  console.log('WORKFLOWS');
  for (const w of db.prepare('SELECT id, name, active FROM workflow_entity ORDER BY updatedAt DESC LIMIT 20').all()) {
    console.log(JSON.stringify(w));
  }
  const ask = db
    .prepare("SELECT id, name, active, nodes FROM workflow_entity WHERE lower(name) LIKE '%ask%' LIMIT 1")
    .get();
  if (ask) {
    const nodes = JSON.parse(ask.nodes);
    console.log('ASK', ask.id, ask.name, ask.active);
    console.log('NODES');
    for (const n of nodes) console.log(n.name, '|', n.type);
    for (const n of nodes) {
      if (/Parse/i.test(n.name)) {
        console.log('PARSE_CODE_START');
        console.log((n.parameters?.jsCode || '').slice(0, 3500));
        console.log('PARSE_CODE_END');
      }
      if (/Query|Format|Send/i.test(n.name)) {
        console.log('NODE', n.name, JSON.stringify(n.parameters).slice(0, 800));
      }
    }
  }
  console.log('EXECS');
  for (const e of db
    .prepare(
      'SELECT id, workflowId, finished, mode, status, startedAt, stoppedAt FROM execution_entity ORDER BY startedAt DESC LIMIT 10',
    )
    .all()) {
    console.log(JSON.stringify(e));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
