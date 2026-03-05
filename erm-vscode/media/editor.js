'use strict';

// VS Code WebView API — must be acquired exactly once
const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────────────────────────
let S = { entities: [], relationships: [] };
let uid = 1;
const id = () => uid++;

// ── Tool / pan state ───────────────────────────────────────────────────────
let tool = 'select';
let panActive = false, panStart = {x:0,y:0}, panOrigin = {x:0,y:0};
let offset = {x:0,y:0};
let relFrom = null;
let pendingRel = null;
let selRelType = '1:N';
let editingId = null;
let editingRelId = null;
let rowCtr = 0;

const wrap = document.getElementById('canvas-wrapper');
const cvs  = document.getElementById('canvas');
const svg  = document.getElementById('svg-layer');

// ── Tool selector ──────────────────────────────────────────────────────────
function setTool(t) {
  tool = t;
  document.querySelectorAll('.btn-tool').forEach(b => b.classList.remove('active'));
  document.getElementById('tool-' + t).classList.add('active');
  wrap.className = t === 'relate' ? 'relating' : '';
  if (t !== 'relate') cancelRelDraw();
}
setTool('select');

// ── Canvas pan ─────────────────────────────────────────────────────────────
wrap.addEventListener('mousedown', e => {
  if (tool !== 'select') return;
  const tgt = e.target;
  if (tgt === wrap || tgt === cvs || tgt.id === 'svg-layer') {
    panActive = true;
    panStart = {x: e.clientX, y: e.clientY};
    panOrigin = {...offset};
    wrap.classList.add('panning');
  }
});
window.addEventListener('mousemove', e => {
  if (panActive) {
    offset.x = panOrigin.x + e.clientX - panStart.x;
    offset.y = panOrigin.y + e.clientY - panStart.y;
    cvs.style.transform = `translate(${offset.x}px,${offset.y}px)`;
  }
  if (relFrom !== null) updatePreview(e);
});
window.addEventListener('mouseup', () => { panActive = false; wrap.classList.remove('panning'); });

// ── Entity modal ───────────────────────────────────────────────────────────
function openNewEntityModal() {
  editingId = null;
  document.getElementById('em-title').textContent = 'New Entity';
  document.getElementById('em-name').value = '';
  document.getElementById('fields-editor').innerHTML = '';
  addFieldRow({name:'id', type:'INT', pk:true, fk:false});
  document.getElementById('entity-overlay').classList.add('open');
  setTimeout(() => document.getElementById('em-name').focus(), 50);
}

function openEditModal(eid) {
  const ent = S.entities.find(e => e.id === eid);
  if (!ent) return;
  editingId = eid;
  document.getElementById('em-title').textContent = 'Edit: ' + ent.name;
  document.getElementById('em-name').value = ent.name;
  document.getElementById('fields-editor').innerHTML = '';
  ent.fields.forEach(f => addFieldRow(f));
  document.getElementById('entity-overlay').classList.add('open');
}

function closeEntityModal() {
  document.getElementById('entity-overlay').classList.remove('open');
  editingId = null;
}

function addFieldRow(f = {}) {
  const rid = rowCtr++;
  const name = f.name || '';
  const type = f.type || 'VARCHAR(255)';
  const pk = f.pk || false;
  const fk = f.fk || false;
  const nn = f.nn || false;
  const refEnt = f.refEnt || '';
  const refField = f.refField || '';

  const types = ['INT','UNSIGNED INT','VARCHAR(50)','VARCHAR(100)','VARCHAR(255)','DATE','TIMESTAMP','FLOAT','TEXT','BOOLEAN','BIGINT'];
  const hideNN = pk || type === 'TIMESTAMP';

  const wrap_div = document.createElement('div');
  wrap_div.setAttribute('data-rid', rid);
  wrap_div.innerHTML = `
    <div class="fe-row">
      <input type="text" class="fi-name" placeholder="field_name" value="${esc(name)}" style="flex:2;min-width:90px">
      <select class="fi-type" style="flex:2;min-width:100px">
        ${types.map(t=>`<option${t===type?' selected':''}>${t}</option>`).join('')}
      </select>
      <label class="cb-label"><input type="checkbox" class="fi-pk"${pk?' checked':''}> PK</label>
      <label class="cb-label"><input type="checkbox" class="fi-fk"${fk?' checked':''}> FK</label>
      <label class="cb-label fi-nn-label"${hideNN?' style="display:none"':''}><input type="checkbox" class="fi-nn"${nn?' checked':''}> NN</label>
      <button class="fe-del" onclick="removeRow(${rid})">✕</button>
    </div>
    <div class="fe-ref" style="display:${fk?'flex':'none'};padding:0 6px 6px 6px;">
      <span class="fe-ref-label">References:</span>
      <select class="fi-ref-ent" style="flex:2;min-width:100px">
        <option value="">-- Table --</option>
        ${S.entities.filter(e=>e.id!==editingId).map(e=>`<option value="${e.id}"${e.id==refEnt?' selected':''}>${esc(e.name)}</option>`).join('')}
      </select>
      <input type="text" class="fi-ref-field" placeholder="field" value="${esc(refField)}" style="flex:1;min-width:60px">
    </div>
  `;
  wrap_div.querySelector('.fi-fk').addEventListener('change', function() {
    wrap_div.querySelector('.fe-ref').style.display = this.checked ? 'flex' : 'none';
  });
  wrap_div.querySelector('.fi-pk').addEventListener('change', function() {
    const isTS = wrap_div.querySelector('.fi-type').value === 'TIMESTAMP';
    wrap_div.querySelector('.fi-nn-label').style.display = (this.checked || isTS) ? 'none' : '';
  });
  wrap_div.querySelector('.fi-type').addEventListener('change', function() {
    const isPK = wrap_div.querySelector('.fi-pk').checked;
    wrap_div.querySelector('.fi-nn-label').style.display = (this.value === 'TIMESTAMP' || isPK) ? 'none' : '';
  });
  document.getElementById('fields-editor').appendChild(wrap_div);
}

function removeRow(rid) {
  const el = document.querySelector(`[data-rid="${rid}"]`);
  if (el) el.remove();
}

function saveEntity() {
  const name = document.getElementById('em-name').value.trim();
  if (!name) { toast('Entity name required'); return; }

  const fields = [];
  document.querySelectorAll('#fields-editor [data-rid]').forEach(row => {
    const fname = row.querySelector('.fi-name').value.trim();
    if (!fname) return;
    const isPK = row.querySelector('.fi-pk').checked;
    const isFK = row.querySelector('.fi-fk').checked;
    const refEntEl = row.querySelector('.fi-ref-ent');
    const refFldEl = row.querySelector('.fi-ref-field');
    const ftype = row.querySelector('.fi-type').value;
    const nnEl = row.querySelector('.fi-nn');
    fields.push({
      id: id(),
      name: fname,
      type: ftype,
      pk: isPK, fk: isFK,
      nn: !isPK && ftype !== 'TIMESTAMP' && nnEl ? nnEl.checked : false,
      refEnt: isFK && refEntEl ? (refEntEl.value || '') : '',
      refField: isFK && refFldEl ? refFldEl.value.trim() : ''
    });
  });

  if (editingId !== null) {
    const ent = S.entities.find(e => e.id === editingId);
    ent.name = name;
    ent.fields = fields;
    // Drop relationships whose FK column was removed from this entity
    S.relationships = S.relationships.filter(r =>
      r.to !== ent.id || fields.some(f => f.fk && String(f.refEnt) === String(r.from))
    );
  } else {
    S.entities.push({ id: id(), name, x: 100 + Math.random()*300, y: 80 + Math.random()*200, fields });
  }
  closeEntityModal();
  render();
}

function deleteEntity(eid) {
  if (!confirm('Delete entity and all its relationships?')) return;
  S.entities = S.entities.filter(e => e.id !== eid);
  S.relationships = S.relationships.filter(r => r.from !== eid && r.to !== eid);
  render();
}

// ── Rendering ──────────────────────────────────────────────────────────────
function render() {
  renderEntities();
  renderRelationships();
}

function renderEntities() {
  const live = new Set(S.entities.map(e => e.id));
  document.querySelectorAll('.entity').forEach(el => {
    if (!live.has(+el.dataset.eid)) el.remove();
  });
  S.entities.forEach(ent => {
    let el = document.querySelector(`.entity[data-eid="${ent.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'entity';
      el.dataset.eid = ent.id;
      el.style.left = ent.x + 'px';
      el.style.top  = ent.y + 'px';
      makeDraggable(el, ent);
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        if (tool === 'relate') handleEntityClick(ent.id, el);
      });
      el.addEventListener('mouseenter', () => {
        if (tool === 'relate' && relFrom !== null && relFrom !== ent.id)
          el.classList.add('rel-target-hover');
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('rel-target-hover');
      });
      cvs.appendChild(el);
    }

    el.innerHTML = `
      <div class="entity-header">
        <span class="entity-name">${esc(ent.name)}</span>
        <div class="entity-btns">
          <button class="ebn ebn-edit" onclick="event.stopPropagation();openEditModal(${ent.id})" title="Edit">✎</button>
          <button class="ebn ebn-del"  onclick="event.stopPropagation();deleteEntity(${ent.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="entity-fields">
        ${ent.fields.map(f => `
          <div class="frow${f.pk?' is-pk':''}${f.fk?' is-fk':''}">
            ${f.pk ? '<span class="badge pk-b">PK</span>' : ''}
            ${f.fk ? '<span class="badge fk-b">FK</span>' : ''}
            ${f.nn && !f.pk && f.type !== 'TIMESTAMP' ? '<span class="badge nn-b">NN</span>' : ''}
            <span class="fname">${esc(f.name)}</span>
            <span class="ftype">${esc(f.type)}</span>
          </div>
        `).join('')}
      </div>
      <div class="entity-add-field" onclick="event.stopPropagation();quickAddField(${ent.id})">+ field</div>
    `;
  });
}

function quickAddField(eid) {
  openEditModal(eid);
  setTimeout(() => addFieldRow(), 50);
}

function renderRelationships() {
  svg.querySelectorAll('.rel-g').forEach(g => g.remove());
  S.relationships.forEach(rel => {
    const fromEl = document.querySelector(`.entity[data-eid="${rel.from}"]`);
    const toEl   = document.querySelector(`.entity[data-eid="${rel.to}"]`);
    if (!fromEl || !toEl) return;

    const {p1, p2} = connPoints(fromEl, toEl);
    const {d, ang1, ang2} = getBezierInfo(p1, p2);

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.className.baseVal = 'rel-g';

    const path = svgEl('path', {d, class:'rel-line', 'stroke-width':2});
    g.appendChild(path);

    const fromCard = rel.type === 'N:M' ? 'N' : '1';
    const toCard   = rel.type === '1:1' ? '1' : 'N';
    drawCard(g, p1, ang1, fromCard);
    drawCard(g, p2, ang2, toCard);

    const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
    const lbl = svgEl('text', {x:mx, y:my-8, 'text-anchor':'middle', class:'rel-label'});
    lbl.textContent = rel.type;
    g.appendChild(lbl);

    const hit = svgEl('path', {d, class:'rel-hit'});
    hit.addEventListener('click', ev => {
      ev.stopPropagation();
      openRelEditModal(rel.id);
    });
    hit.addEventListener('mouseenter', () => path.setAttribute('stroke','#cba6f7'));
    hit.addEventListener('mouseleave', () => path.setAttribute('stroke','#89b4fa'));
    g.appendChild(hit);

    svg.appendChild(g);
  });
}

function drawCard(g, p, angle, type) {
  const dist = 18;
  const cx = p.x + Math.cos(angle) * dist;
  const cy = p.y + Math.sin(angle) * dist;
  const px = Math.cos(angle + Math.PI/2);
  const py = Math.sin(angle + Math.PI/2);
  const arm = 7;
  const bx = Math.cos(angle + Math.PI) * 8;
  const by = Math.sin(angle + Math.PI) * 8;

  if (type === '1') {
    const bar = svgEl('line', {
      x1: cx - px*arm, y1: cy - py*arm,
      x2: cx + px*arm, y2: cy + py*arm,
      class:'card-symbol'
    });
    g.appendChild(bar);
  } else {
    const cf = svgEl('path', {
      d: `M${cx-px*arm},${cy-py*arm} L${cx+bx},${cy+by} M${cx+px*arm},${cy+py*arm} L${cx+bx},${cy+by}`,
      class:'card-symbol'
    });
    const bar = svgEl('line', {
      x1: cx+bx-px*arm, y1: cy+by-py*arm,
      x2: cx+bx+px*arm, y2: cy+by+py*arm,
      class:'card-symbol'
    });
    g.appendChild(cf);
    g.appendChild(bar);
  }
}

// ── Geometry helpers ───────────────────────────────────────────────────────
function connPoints(a, b) {
  const ac = {x: a.offsetLeft + a.offsetWidth/2,  y: a.offsetTop + a.offsetHeight/2};
  const bc = {x: b.offsetLeft + b.offsetWidth/2,  y: b.offsetTop + b.offsetHeight/2};
  return { p1: edgePoint(a, bc.x-ac.x, bc.y-ac.y), p2: edgePoint(b, ac.x-bc.x, ac.y-bc.y) };
}

function edgePoint(el, dx, dy) {
  const cx = el.offsetLeft + el.offsetWidth/2;
  const cy = el.offsetTop  + el.offsetHeight/2;
  const hw = el.offsetWidth/2, hh = el.offsetHeight/2;
  if (Math.abs(dx)*hh > Math.abs(dy)*hw) {
    const sx = dx > 0 ? 1 : -1;
    return { x: cx + sx*hw, y: cy + dy*sx*hw/Math.abs(dx), nx: sx, ny: 0 };
  } else {
    const sy = dy > 0 ? 1 : -1;
    return { x: cx + dx*sy*hh/Math.abs(dy), y: cy + sy*hh, nx: 0, ny: sy };
  }
}

function getBezierInfo(p1, p2) {
  const stub = 50;
  const c1x = p1.x + stub * p1.nx, c1y = p1.y + stub * p1.ny;
  const c2x = p2.x + stub * p2.nx, c2y = p2.y + stub * p2.ny;
  const d = `M${p1.x},${p1.y} C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  return { d, ang1: Math.atan2(p1.ny, p1.nx), ang2: Math.atan2(p2.ny, p2.nx) };
}

function svgEl(tag, attrs={}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Drag ───────────────────────────────────────────────────────────────────
function makeDraggable(el, ent) {
  let active = false, sx, sy, ox, oy;
  el.addEventListener('mousedown', e => {
    if (tool !== 'select') return;
    if (e.target.classList.contains('ebn')) return;
    if (e.target.classList.contains('entity-add-field')) return;
    e.stopPropagation();
    active = true; sx = e.clientX; sy = e.clientY; ox = ent.x; oy = ent.y;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  function onMove(e) {
    if (!active) return;
    ent.x = ox + e.clientX - sx;
    ent.y = oy + e.clientY - sy;
    el.style.left = ent.x + 'px';
    el.style.top  = ent.y + 'px';
    renderRelationships();
  }
  function onUp() {
    active = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}

// ── Relationship drawing ───────────────────────────────────────────────────
function handleEntityClick(eid, el) {
  if (relFrom === null) {
    relFrom = eid;
    el.classList.add('rel-source');
    toast('Now click the target entity');
    svg.classList.add('drawing');
  } else if (relFrom === eid) {
    cancelRelDraw();
    toast('Cancelled');
  } else {
    const fromId = relFrom;
    const toId   = eid;
    cancelRelDraw();
    openRelModal(fromId, toId);
  }
}

function cancelRelDraw() {
  relFrom = null;
  document.querySelectorAll('.entity').forEach(e => {
    e.classList.remove('rel-source', 'rel-target-hover');
  });
  document.getElementById('preview-path').style.display = 'none';
  svg.classList.remove('drawing');
}

function updatePreview(e) {
  if (relFrom === null) return;
  const fromEl = document.querySelector(`.entity[data-eid="${relFrom}"]`);
  if (!fromEl) return;
  const r = wrap.getBoundingClientRect();
  const mx = e.clientX - r.left - offset.x;
  const my = e.clientY - r.top  - offset.y;
  const c  = {x: fromEl.offsetLeft + fromEl.offsetWidth/2, y: fromEl.offsetTop + fromEl.offsetHeight/2};
  const pp = document.getElementById('preview-path');
  pp.setAttribute('d', `M${c.x},${c.y} L${mx},${my}`);
  pp.style.display = 'block';
}

// ── Rel modal ──────────────────────────────────────────────────────────────
function openRelModal(fromId, toId) {
  pendingRel = {fromId, toId};
  const fromEnt = S.entities.find(e => e.id === fromId);
  const toEnt   = S.entities.find(e => e.id === toId);
  document.getElementById('rel-info-box').innerHTML =
    `<strong style="color:#cba6f7">${esc(fromEnt.name)}</strong>
     <span style="color:#45475a;font-size:20px">⟶</span>
     <strong style="color:#89b4fa">${esc(toEnt.name)}</strong>`;
  selRelType = '1:N';
  pickRelType('1:N');
  document.getElementById('fk-name-input').value = fromEnt.name.toLowerCase() + '_id';
  document.getElementById('rel-overlay').classList.add('open');
}

function closeRelModal() {
  document.getElementById('rel-overlay').classList.remove('open');
  pendingRel = null;
}

function pickRelType(t) {
  selRelType = t;
  document.querySelectorAll('.rt-btn').forEach(b => b.classList.toggle('sel', b.dataset.t === t));
  const lbl = document.getElementById('fk-name-label');
  const inp = document.getElementById('fk-name-input');
  if (t === 'N:M') {
    lbl.textContent = 'Junction table will be auto-created';
    inp.style.display = 'none';
  } else if (t === '1:N') {
    lbl.textContent = 'FK field name (added to N-side table)';
    inp.style.display = 'block';
  } else {
    lbl.textContent = 'FK field name (added to target table)';
    inp.style.display = 'block';
  }
}

function confirmRelationship() {
  if (!pendingRel) return;
  const {fromId, toId} = pendingRel;
  const fromEnt = S.entities.find(e => e.id === fromId);
  const toEnt   = S.entities.find(e => e.id === toId);
  const fkName  = document.getElementById('fk-name-input').value.trim() || fromEnt.name.toLowerCase()+'_id';

  if (selRelType === 'N:M') {
    const jName = fromEnt.name + '_' + toEnt.name;
    const fromPK = fromEnt.fields.find(f => f.pk);
    const toPK   = toEnt.fields.find(f => f.pk);
    const jEnt = {
      id: id(), name: jName,
      x: (fromEnt.x + toEnt.x)/2 + 20,
      y: Math.max(fromEnt.y, toEnt.y) + 160,
      fields: [
        { id:id(), name: fromEnt.name.toLowerCase()+'_id', type:'INT', pk:true, fk:true, refEnt:fromId, refField:fromPK?.name||'id' },
        { id:id(), name: toEnt.name.toLowerCase()+'_id',   type:'INT', pk:true, fk:true, refEnt:toId,   refField:toPK?.name||'id'   }
      ]
    };
    S.entities.push(jEnt);
    S.relationships.push({ id:id(), from:fromId, to:jEnt.id, type:'1:N' });
    S.relationships.push({ id:id(), from:toId,   to:jEnt.id, type:'1:N' });
    closeRelModal();
    render();
    toast(`Junction table "${jName}" created`);
    return;
  }

  addFKtoEntity(toEnt, fkName, fromId, fromEnt.fields.find(f=>f.pk)?.name||'id');
  S.relationships.push({ id:id(), from:fromId, to:toId, type:selRelType });
  closeRelModal();
  render();
  toast('Relationship created');
}

function addFKtoEntity(ent, fieldName, refEntId, refFieldName) {
  if (ent.fields.find(f => f.name === fieldName)) return;
  ent.fields.push({ id:id(), name:fieldName, type:'INT', pk:false, fk:true, refEnt:refEntId, refField:refFieldName });
}

// ── SQL Export ─────────────────────────────────────────────────────────────
function buildSQL() {
  const date = new Date().toISOString().slice(0, 10);
  let sql = `-- Generated by ERM Editor on ${date}\n`;
  sql += '-- MariaDB / MySQL\n\n';
  sql += 'SET FOREIGN_KEY_CHECKS=0;\n\n';

  const ordered = topoSort(S.entities, S.relationships);
  ordered.forEach(ent => {
    sql += `CREATE TABLE \`${ent.name}\` (\n`;
    const lines = [];
    const pks   = [];

    let firstTimestamp = true;
    ent.fields.forEach(f => {
      let t = f.type === 'UNSIGNED INT' ? 'INT UNSIGNED' : f.type;
      let col = `  \`${f.name}\` ${t}`;
      if (f.type === 'TIMESTAMP') {
        if (firstTimestamp) {
          col += ' NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';
          firstTimestamp = false;
        } else {
          col += ' NULL DEFAULT NULL';
        }
      } else if (f.pk) {
        col += ' NOT NULL';
        // composite PK / FK columns must not be AUTO_INCREMENT
        if (/^(INT|BIGINT)/i.test(t) && !f.fk) col += ' AUTO_INCREMENT';
        pks.push(`\`${f.name}\``);
      } else if (f.fk) {
        col += ' NOT NULL';
      } else if (f.nn) {
        col += ' NOT NULL';
      }
      lines.push(col);
    });

    if (pks.length) lines.push(`  PRIMARY KEY (${pks.join(', ')})`);

    ent.fields.filter(f => f.fk && f.refEnt && !f.pk).forEach(f => {
      const rel = S.relationships.find(r => r.to === ent.id && r.from == f.refEnt);
      if (rel && rel.type === '1:1') {
        lines.push(`  UNIQUE KEY \`uq_${ent.name}_${f.name}\` (\`${f.name}\`)`);
      } else {
        lines.push(`  INDEX \`idx_${ent.name}_${f.name}\` (\`${f.name}\`)`);
      }
    });

    ent.fields.filter(f => f.fk && f.refEnt).forEach(f => {
      const refEnt = S.entities.find(e => e.id == f.refEnt);
      if (refEnt)
        lines.push(
          `  CONSTRAINT \`fk_${ent.name}_${f.name}\`\n` +
          `    FOREIGN KEY (\`${f.name}\`) REFERENCES \`${refEnt.name}\`(\`${f.refField||'id'}\`)\n` +
          `    ON DELETE RESTRICT ON UPDATE CASCADE`
        );
    });

    sql += lines.join(',\n') + '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n';
  });

  sql += 'SET FOREIGN_KEY_CHECKS=1;\n';
  return sql;
}

function topoSort(entities, rels) {
  const order = [...entities];
  for (let i = 0; i < order.length * 2; i++) {
    let swapped = false;
    for (let j = 0; j < order.length; j++) {
      const ent = order[j];
      const hasFKto = ent.fields.filter(f => f.fk && f.refEnt).map(f => f.refEnt);
      for (const refId of hasFKto) {
        const refIdx = order.findIndex(e => e.id == refId);
        if (refIdx > j) {
          [order[j], order[refIdx]] = [order[refIdx], order[j]];
          swapped = true; break;
        }
      }
      if (swapped) break;
    }
    if (!swapped) break;
  }
  return order;
}

function showSQL() {
  document.getElementById('sql-box').textContent = buildSQL();
  document.getElementById('sql-overlay').classList.add('open');
}

function copySQL() {
  navigator.clipboard.writeText(document.getElementById('sql-box').textContent)
    .then(() => toast('Copied!'));
}

// Replaces the standalone-page downloadSQL() — uses VS Code API instead
function exportSQL() {
  vscode.postMessage({ type: 'exportSQL', data: document.getElementById('sql-box').textContent });
}

// ── Save / Load (VS Code API) ───────────────────────────────────────────────
function saveJSON() {
  vscode.postMessage({ type: 'save', data: { S, uid } });
}

function loadJSON() {
  vscode.postMessage({ type: 'load' });
}

// Receive data back from the extension host
window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.type === 'load') {
    S   = msg.data.S;
    uid = msg.data.uid || uid;
    document.querySelectorAll('.entity').forEach(el => el.remove());
    render();
    toast('Loaded');
  }
});

// ── Edit Relationship modal ────────────────────────────────────────────────
function openRelEditModal(relId) {
  const rel = S.relationships.find(r => r.id === relId);
  if (!rel) return;
  editingRelId = relId;
  const fromEnt = S.entities.find(e => e.id === rel.from);
  const toEnt   = S.entities.find(e => e.id === rel.to);
  document.getElementById('rel-edit-info').innerHTML =
    `<strong style="color:#cba6f7">${esc(fromEnt.name)}</strong>
     <span style="color:#45475a;font-size:20px">⟶</span>
     <strong style="color:#89b4fa">${esc(toEnt.name)}</strong>`;
  document.querySelectorAll('#rel-edit-overlay .rt-btn').forEach(b =>
    b.classList.toggle('sel', b.dataset.t === rel.type)
  );
  document.getElementById('rel-edit-overlay').classList.add('open');
}

function closeRelEditModal() {
  document.getElementById('rel-edit-overlay').classList.remove('open');
  editingRelId = null;
}

function pickEditRelType(t) {
  document.querySelectorAll('#rel-edit-overlay .rt-btn').forEach(b =>
    b.classList.toggle('sel', b.dataset.t === t)
  );
}

function saveRelEdit() {
  if (editingRelId === null) return;
  const rel = S.relationships.find(r => r.id === editingRelId);
  if (!rel) return;
  const sel = document.querySelector('#rel-edit-overlay .rt-btn.sel');
  if (sel) rel.type = sel.dataset.t;
  closeRelEditModal();
  render();
  toast('Relationship updated');
}

function deleteRelFromEdit() {
  if (editingRelId === null) return;
  S.relationships = S.relationships.filter(r => r.id !== editingRelId);
  closeRelEditModal();
  render();
  toast('Relationship deleted');
}

// ── Utils ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Escape') {
    cancelRelDraw();
    closeEntityModal();
    closeRelModal();
    closeRelEditModal();
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  }
  if (e.key === 'e' && !e.ctrlKey) openNewEntityModal();
  if (e.key === 'r' && !e.ctrlKey) setTool(tool === 'relate' ? 'select' : 'relate');
});

// ── Demo data ──────────────────────────────────────────────────────────────
(function demo() {
  const cId = id(), oId = id(), pId = id();
  S.entities = [
    {
      id: cId, name: 'Customer', x: 60, y: 80,
      fields: [
        {id:id(), name:'id',         type:'INT',          pk:true,  fk:false},
        {id:id(), name:'first_name', type:'VARCHAR(100)', pk:false, fk:false},
        {id:id(), name:'last_name',  type:'VARCHAR(100)', pk:false, fk:false},
        {id:id(), name:'email',      type:'VARCHAR(255)', pk:false, fk:false},
        {id:id(), name:'birth_date', type:'DATE',         pk:false, fk:false}
      ]
    },
    {
      id: oId, name: 'Order', x: 360, y: 60,
      fields: [
        {id:id(), name:'id',          type:'INT',   pk:true,  fk:false},
        {id:id(), name:'customer_id', type:'INT',   pk:false, fk:true,  refEnt:cId, refField:'id'},
        {id:id(), name:'order_date',  type:'DATE',  pk:false, fk:false},
        {id:id(), name:'total',       type:'FLOAT', pk:false, fk:false}
      ]
    },
    {
      id: pId, name: 'Product', x: 360, y: 310,
      fields: [
        {id:id(), name:'id',    type:'INT',          pk:true,  fk:false},
        {id:id(), name:'name',  type:'VARCHAR(255)', pk:false, fk:false},
        {id:id(), name:'price', type:'FLOAT',        pk:false, fk:false},
        {id:id(), name:'stock', type:'UNSIGNED INT', pk:false, fk:false}
      ]
    }
  ];
  S.relationships = [
    {id:id(), from:cId, to:oId, type:'1:N'}
  ];
  render();
})();
