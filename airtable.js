// ============================================================
// TITO'S REWARDS — Airtable API Layer
// ============================================================

const REWARDS = [
  { puntos: 500,  nombre: 'Coca Cola gratis',                   emoji: '🥤' },
  { puntos: 1500, nombre: 'Orden de muslitos gratis',            emoji: '🍗' },
  { puntos: 3000, nombre: 'Boneless, Chicken tenders o Tenders especiales',               emoji: '🌶️' },
  { puntos: 4000, nombre: 'Kilo de alitas gratis',               emoji: '🍖' },
  { puntos: 6600, nombre: 'Kilo alitas + (Boneless, Chicken tenders o Tenders especiales) + 3 Cocas', emoji: '🏆' },
];

const SUCURSAL_BARRIO = 'Barrio Antiguo';

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function airtableURL(table) {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
}

async function airtableFetch(table, params = '') {
  const url = `${airtableURL(table)}?${params}`;
  const res = await fetch(url, { headers: airtableHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Error ${res.status}`);
  }
  return res.json();
}

async function fetchAllRecords(table, params = '') {
  let records = [];
  let offset = null;
  do {
    const sep = params ? '&' : '';
    const offsetParam = offset ? `${sep}offset=${offset}` : '';
    const data = await airtableFetch(table, params + offsetParam);
    records = records.concat(data.records);
    offset = data.offset || null;
  } while (offset);
  return records;
}

// ── CLIENTES ────────────────────────────────────────────────

async function buscarClientePorTelefono(telefono) {
  const formula = encodeURIComponent(`({telefono}="${telefono}")`);
  const data = await airtableFetch('Clientes', `filterByFormula=${formula}`);
  return data.records.length > 0 ? data.records[0] : null;
}

async function buscarClientePorToken(token) {
  const formula = encodeURIComponent(`({token_sesion}="${token}")`);
  const data = await airtableFetch('Clientes', `filterByFormula=${formula}`);
  return data.records.length > 0 ? data.records[0] : null;
}

async function crearCliente(nombre, telefono, sucursal) {
  const token = generarToken();
  const res = await fetch(airtableURL('Clientes'), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        nombre,
        telefono,
        puntos_totales: 0,
        gasto_total: 0,
        sucursal_registro: sucursal,
        fecha_registro: fechaHoy(),
        token_sesion: token,
        descuento_bienvenida: true,
      },
    }),
  });
  if (!res.ok) throw new Error(`Error creando cliente: ${res.status}`);
  const data = await res.json();
  return data;
}

async function actualizarCliente(recordId, fields) {
  const res = await fetch(`${airtableURL('Clientes')}/${recordId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Error ${res.status} actualizando cliente`);
  }
  return res.json();
}

async function actualizarTokenCliente(recordId) {
  const token = generarToken();
  await actualizarCliente(recordId, { token_sesion: token });
  return token;
}

async function obtenerTodosClientes() {
  return fetchAllRecords(
    'Clientes',
    'sort[0][field]=puntos_totales&sort[0][direction]=desc'
  );
}

async function obtenerRankingGlobal() {
  const todos = await fetchAllRecords('Clientes', 'maxRecords=200');
  return todos.sort((a, b) => puntosRankingMes(b) - puntosRankingMes(a));
}

async function obtenerRankingBarrio(sucursal) {
  const formula = encodeURIComponent(`({sucursal_registro}="${sucursal}")`);
  const todos = await fetchAllRecords('Clientes', `filterByFormula=${formula}&maxRecords=200`);
  return todos.sort((a, b) => puntosRankingMes(b) - puntosRankingMes(a));
}

// ── TRANSACCIONES ───────────────────────────────────────────

async function crearTransaccion(telefono, nombre, monto, puntosSumados, sucursal, cajero) {
  const res = await fetch(airtableURL('Transacciones'), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        telefono_cliente: telefono,
        nombre_cliente: nombre,
        monto,
        puntos_sumados: puntosSumados,
        sucursal,
        fecha: fechaHoy(),
        cajero,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Error ${res.status} creando transacción`);
  }
  return res.json();
}

// ── CANJES ──────────────────────────────────────────────────

async function crearCanje(telefono, nombre, recompensa, puntosUsados, sucursal) {
  const res = await fetch(airtableURL('Canjes'), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        telefono_cliente: telefono,
        nombre_cliente: nombre,
        recompensa,
        puntos_usados: puntosUsados,
        estado: 'pendiente',
        fecha: fechaHoy(),
        sucursal,
      },
    }),
  });
  if (!res.ok) throw new Error(`Error creando canje: ${res.status}`);
  return res.json();
}

async function obtenerCanjesPendientesCliente(telefono) {
  const formula = encodeURIComponent(
    `AND({telefono_cliente}="${telefono}", {estado}="pendiente")`
  );
  const data = await airtableFetch('Canjes', `filterByFormula=${formula}`);
  return data.records;
}

async function obtenerTodosCanjesPendientes() {
  const formula = encodeURIComponent(`{estado}="pendiente"`);
  return fetchAllRecords('Canjes', `filterByFormula=${formula}`);
}

async function marcarCanjeAplicado(recordId) {
  const res = await fetch(`${airtableURL('Canjes')}/${recordId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: { estado: 'aplicado' } }),
  });
  if (!res.ok) throw new Error(`Error actualizando canje: ${res.status}`);
  return res.json();
}

// ── LÓGICA DE PUNTOS ────────────────────────────────────────

function calcularPuntos(monto) {
  return Math.floor(monto);
}

function proximaRecompensa(puntos) {
  return REWARDS.find(r => r.puntos > puntos) || null;
}

function recompensasDisponibles(puntos) {
  return REWARDS.filter(r => r.puntos <= puntos);
}

function calcularProgreso(puntos) {
  const next = proximaRecompensa(puntos);
  if (!next) return { porcentaje: 100, siguiente: null, faltan: 0 };
  const prevReward = [...REWARDS].reverse().find(r => r.puntos <= puntos);
  const base = prevReward ? prevReward.puntos : 0;
  const porcentaje = Math.round(((puntos - base) / (next.puntos - base)) * 100);
  return { porcentaje, siguiente: next, faltan: next.puntos - puntos };
}

// ── RANKING MENSUAL ─────────────────────────────────────────

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Devuelve los puntos válidos para el ranking este mes
function puntosRankingMes(record) {
  const f = record.fields;
  if (f.mes_ranking === mesActual()) return f.puntos_mes || 0;
  return 0;
}

// ── UTILIDADES ──────────────────────────────────────────────

function generarToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('') + '-' + Date.now().toString(36);
}

function fechaHoy() {
  return new Date().toISOString().split('T')[0];
}

function formatearPuntos(n) {
  return Number(n || 0).toLocaleString('es-MX');
}

function formatearPesos(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
}
