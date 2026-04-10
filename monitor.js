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
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${p.numeroOriginal || '-'}/${p.ano || '-'}</strong></td>
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

async function buscarPagina(ano, pagina) {
  const url = `${API_BASE}/materias?ano=${ano}&page=${pagina}`;
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
  return response.json();
}

async function buscarTodasMaterias() {
  const ano = new Date().getFullYear();
  console.log(`🔍 Buscando matérias de ${ano}...`);

  // Primeira página para saber quantas existem
  const primeira = await buscarPagina(ano, 1);
  const ultimaPagina = primeira.last_page || 1;
  const total = primeira.total || 0;
  console.log(`📊 Total: ${total} matérias, ${ultimaPagina} páginas`);

  let todas = [...(primeira.data || [])];

  // Busca o restante das páginas
  for (let pagina = 2; pagina <= ultimaPagina; pagina++) {
    console.log(`📄 Buscando página ${pagina}/${ultimaPagina}...`);
    const json = await buscarPagina(ano, pagina);
    const items = json.data || [];
    todas = todas.concat(items);

    // Para cedo se encontrou matérias já vistas (otimização)
    // Só aplica fora do primeiro run
    const idsVistos = global._idsVistos;
    if (idsVistos && idsVistos.size > 0) {
      const algumVisto = items.some(p => idsVistos.has(String(p.id)));
      if (algumVisto) {
        console.log(`⏹️ Encontrou matérias já vistas na página ${pagina}. Parando busca.`);
        break;
      }
    }
  }

  console.log(`📦 Total recebido: ${todas.length} matérias`);
  return todas;
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
  const numeroStr = String(p.numero || '-').replace(/\./g, '');
  return {
    id: String(p.id),
    tipo: p.tipo?.descricao || 'OUTROS',
    numero: numeroStr,
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
  global._idsVistos = idsVistos;

  console.log(`📁 IDs já vistos: ${idsVistos.size} | Primeiro run: ${idsVistos.size === 0}`);

  const materiasRaw = await buscarTodasMaterias();

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

    await enviarEmail(novas);
    novas.forEach(p => idsVistos.add(p.id));
    estado.proposicoes_vistas = Array.from(idsVistos);
  } else {
    console.log('✅ Sem novidades. Nada a enviar.');
  }

  estado.ultima_execucao = new Date().toISOString();
  salvarEstado(estado);
})();
