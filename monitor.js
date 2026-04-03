const fs = require('fs');
const nodemailer = require('nodemailer');

const EMAIL_DESTINO = process.env.EMAIL_DESTINO;
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE;
const EMAIL_SENHA = process.env.EMAIL_SENHA;
const ARQUIVO_ESTADO = 'estado.json';
const API_BASE = 'https://palmas.nexlegis.com.br/api';

function carregarEstado() {
  if (fs.existsSync(ARQUIVO_ESTADO)) {
    return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO, 'utf8'));
  }
  return { proposicoes_vistas: [], ultima_execucao: '' };
}

function salvarEstado(estado) {
  fs.writeFileSync(ARQUIVO_ESTADO, JSON.stringify(estado, null, 2));
}

async function enviarEmail(novas) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_REMETENTE, pass: EMAIL_SENHA },
  });

  const porTipo = {};
  novas.forEach(p => {
    const tipo = p.tipo || 'OUTROS';
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(p);
  });

  const linhas = Object.keys(porTipo).sort().map(tipo => {
    const header = `<tr><td colspan="5" style="padding:10px 8px 4px;background:#f0f4f8;font-weight:bold;color:#7b2d00;font-size:13px;border-top:2px solid #7b2d00">${tipo} — ${porTipo[tipo].length} matéria(s)</td></tr>`;
    const rows = porTipo[tipo].map(p =>
      `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#555;font-size:12px">${p.tipo || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${p.numero || '-'}/${p.ano || '-'}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${p.autor || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">${p.data || '-'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${p.ementa || '-'}</td>
      </tr>`
    ).join('');
    return header + rows;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto">
      <h2 style="color:#7b2d00;border-bottom:2px solid #7b2d00;padding-bottom:8px">
        🏛️ Câmara de Palmas — ${novas.length} nova(s) matéria(s)
      </h2>
      <p style="color:#666">Monitoramento automático — ${new Date().toLocaleString('pt-BR')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#7b2d00;color:white">
            <th style="padding:10px;text-align:left">Tipo</th>
            <th style="padding:10px;text-align:left">Número/Ano</th>
            <th style="padding:10px;text-align:left">Autor</th>
            <th style="padding:10px;text-align:left">Data</th>
            <th style="padding:10px;text-align:left">Ementa</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#999">
        Acesse: <a href="https://palmas.nexlegis.com.br/materias">palmas.nexlegis.com.br/materias</a>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Monitor Câmara Palmas" <${EMAIL_REMETENTE}>`,
    to: EMAIL_DESTINO,
    subject: `🏛️ Câmara Palmas: ${novas.length} nova(s) matéria(s) — ${new Date().toLocaleDateString('pt-BR')}`,
    html,
  });

  console.log(`✅ Email enviado com ${novas.length} matérias novas.`);
}

async function buscarMateriasRecentes() {
  const ano = new Date().getFullYear();
  console.log(`🔍 Buscando matérias de ${ano}...`);

  // Tenta com filtro de ano primeiro
  const urlComAno = `${API_BASE}/materias?ano=${ano}&page=1`;
  let response = await fetch(urlComAno, {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    console.error(`❌ Erro na API: ${response.status} ${response.statusText}`);
    return [];
  }

  let json = await response.json();
  console.log('📦 Resposta da API (estrutura):', JSON.stringify(json).substring(0, 200));

  const lista = json.data || [];
  const total = json.total || lista.length;
  const ultimaPagina = json.last_page || 1;

  console.log(`📊 ${lista.length} matérias na página 1 (total: ${total}, páginas: ${ultimaPagina})`);

  // Se o filtro por ano funcionou, last_page deve ser bem menor que 2428
  // Se last_page ainda for muito alto (>100), o filtro não funcionou — usamos só page=1
  if (ultimaPagina > 100) {
    console.log('⚠️ Filtro por ano não aplicado pela API. Usando apenas página 1 (mais recentes).');
  }

  return lista;
}

function extrairAutor(p) {
  if (p.vereadores && p.vereadores.length > 0) {
    const nomes = p.vereadores
      .map(v => v.vereador?.nome_politico || v.vereador?.nome || null)
      .filter(Boolean);
    if (nomes.length > 0) return nomes.join(', ');
  }
  return '-';
}

function normalizarMateria(p) {
  return {
    id: String(p.id),
    tipo: p.tipo?.descricao || 'OUTROS',
    numero: (p.numero || '-').replace('.', ''), // remove ponto: "1.133" → "1133" para ordenação numérica
    numeroOriginal: p.numero || '-',
    ano: String(p.ano || '-'),
    autor: extrairAutor(p),
    data: p.data_publicacao || '-',
    ementa: (p.ementa || '-').substring(0, 200),
  };
}

(async () => {
  console.log('🚀 Iniciando monitor Câmara de Palmas (Nexlegis)...');
  console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);

  const estado = carregarEstado();
  const idsVistos = new Set(estado.proposicoes_vistas.map(String));

  const materiasRaw = await buscarMateriasRecentes();

  if (materiasRaw.length === 0) {
    console.log('⚠️ Nenhuma matéria encontrada.');
    process.exit(0);
  }

  const materias = materiasRaw.map(normalizarMateria).filter(p => p.id);
  console.log(`📊 Total normalizado: ${materias.length}`);

  const novas = materias.filter(p => !idsVistos.has(p.id));
  console.log(`🆕 Matérias novas: ${novas.length}`);

  if (novas.length > 0) {
    novas.sort((a, b) => {
      if (a.tipo < b.tipo) return -1;
      if (a.tipo > b.tipo) return 1;
      return (parseInt(b.numero) || 0) - (parseInt(a.numero) || 0);
    });

    // Restaura numero original para exibição no email
    novas.forEach(p => { p.numero = p.numeroOriginal; });

    await enviarEmail(novas);
    novas.forEach(p => idsVistos.add(p.id));
    estado.proposicoes_vistas = Array.from(idsVistos);
  } else {
    console.log('✅ Sem novidades. Nada a enviar.');
  }

  estado.ultima_execucao = new Date().toISOString();
  salvarEstado(estado);
})();
