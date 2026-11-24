import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import seed from '../data/dados.json';
import { parecidos, type Caso } from './ligacoes';
import { REPO, UpdateGate } from './UpdateGate';

declare const __APP_VERSION__: string;

type Hist = { data: string; municipio: string; regiao?: string; lat?: number; lng?: number; texto: string };
type Foragido = { id: string; nome: string; apelido?: string; crimes: string[]; mandados: string; desde: string; resumo: string; cartaz: string; historico: Hist[] };
type CasoX = Caso & { quando?: string; local?: string; titulo: string; resumo: string; status: string; fonte?: string; vinculo_fonte?: string; foragidos?: string[]; manual?: boolean };
type Dados = { atualizado: string; foragidos: Foragido[]; casos: CasoX[] };
type Hipotese = { id: string; casoId: string; foragidoId: string; motivo: string; nivel: number; criado: string };
type Ligacao = { id: string; a: string; b: string; nota: string };
type Local = { casos: CasoX[]; hipoteses: Hipotese[]; ligacoes: Ligacao[] };
type Nivel = 'mercosul' | 'brasil' | 'sc' | 'mun';
type Painel =
  | null
  | { tipo: 'caso' | 'foragido'; id: string }
  | { tipo: 'lista'; aba: 'casos' | 'foragidos' | 'hipoteses' }
  | { tipo: 'novo' };

const TIPOS: Record<string, [string, string]> = {
  homicidio: ['Homicídio', '#ff3b4e'], feminicidio: ['Feminicídio', '#ff3b4e'], latrocinio: ['Latrocínio', '#ff3b4e'],
  tentativa: ['Tentativa de homicídio', '#ff8a3d'], roubo: ['Roubo', '#ffc53d'], confronto: ['Confronto com a polícia', '#ffc53d'],
  furto: ['Furto', '#4da3ff'], arma: ['Arma ilegal', '#b07cff'],
};
const STATUS: Record<string, string> = {
  aberto: 'Em aberto: autor não identificado', suspeito_preso: 'Suspeito preso', autor_morto: 'Autor morto', concluido: 'Inquérito concluído',
};
const NIVEL = ['', 'fraca', 'média', 'forte'];
const AMARELO = '#ffd23d', VERMELHO = '#ff3b4e', CIANO = '#29d3ff';

const CHAVE = 'investcrime:v1';
const vazio = (): Local => ({ casos: [], hipoteses: [], ligacoes: [] });
function lerLocal(): Local {
  try { return { ...vazio(), ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch { return vazio(); }
}

const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (d = '') => {
  const m = d.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  return !d ? 'data ?' : m ? (m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`) : d;
};
const iniciais = (n: string) => n.split(' ').filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('');
const tipo = (t: string) => TIPOS[t] || [t, '#9aa7b8'];
const ordem = (d: string) => d || '0000';

export default function App() {
  const [dados, setDados] = useState<Dados>(seed as Dados);
  const [local, setLocalState] = useState<Local>(lerLocal);
  const [erroSalvar, setErroSalvar] = useState(false);
  const [geo, setGeo] = useState<{ paises: any; estados: any; mun: any } | null>(null);
  const [nivel, setNivel] = useState<Nivel>('mercosul');
  const [mun, setMun] = useState<string | null>(null);
  const [painel, setPainel] = useState<Painel>(null);
  const [transicao, setTransicao] = useState<string | null>('MERCOSUL');

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const limites = useRef<L.GeoJSON | null>(null);
  const pontos = useRef(L.layerGroup());
  const linhas = useRef(L.layerGroup());

  const setLocal = (l: Local) => {
    setLocalState(l);
    try { localStorage.setItem(CHAVE, JSON.stringify(l)); setErroSalvar(false); } catch { setErroSalvar(true); }
  };

  // dados novos sem precisar de APK novo: o app lê o dados.json do GitHub (com o embutido como reserva)
  useEffect(() => {
    fetch(`https://raw.githubusercontent.com/${REPO}/main/data/dados.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Dados | null) => { if (d && d.atualizado >= seed.atualizado) setDados(d); })
      .catch(() => {});
    Promise.all(['paises', 'estados', 'sc-municipios'].map((n) => fetch(`./geo/${n}.json`).then((r) => r.json())))
      .then(([paises, estados, mun]) => setGeo({ paises, estados, mun }));
    setTimeout(() => setTransicao(null), 1400);
  }, []);

  // centro de cada município de SC (posição aproximada dos casos)
  const centros = useMemo(() => {
    const m = new Map<string, L.LatLngBounds>();
    geo?.mun.features.forEach((f: any) => m.set(f.properties.name, L.geoJSON(f).getBounds()));
    return m;
  }, [geo]);
  const ponto = (municipio: string, lat?: number, lng?: number): L.LatLng | null =>
    lat != null && lng != null ? L.latLng(lat, lng) : centros.get(municipio)?.getCenter() ?? null;

  const casos = useMemo(() => [...dados.casos, ...local.casos], [dados, local.casos]);

  // posição de casos e foragidos, espalhando quem cai no mesmo município
  const pos = useMemo(() => {
    const cont: Record<string, number> = {};
    const espalha = (chave: string, p: L.LatLng | null) => {
      if (!p) return null;
      const i = (cont[chave] = (cont[chave] ?? -1) + 1);
      const r = i ? 0.02 + 0.007 * i : 0;
      return L.latLng(p.lat + r * Math.sin(i * 2.4), p.lng + r * Math.cos(i * 2.4));
    };
    const m = new Map<string, L.LatLng>();
    casos.forEach((c) => { const p = espalha(c.municipio, ponto(c.municipio)); if (p) m.set(c.id, p); });
    dados.foragidos.forEach((f) => {
      const h = f.historico[0];
      const p = espalha(h?.municipio || h?.regiao || '', h ? ponto(h.municipio, h.lat, h.lng) : null);
      if (p) m.set(f.id, p);
    });
    return m;
  }, [casos, dados.foragidos, centros]);

  const casosComPos = useMemo(() => casos.map((c) => ({ ...c, lat: pos.get(c.id)?.lat, lng: pos.get(c.id)?.lng })), [casos, pos]);

  const irPara = (n: Nivel, nomeMun?: string) => {
    setTransicao(n === 'mercosul' ? 'MERCOSUL' : n === 'brasil' ? 'BRASIL' : n === 'sc' ? 'SANTA CATARINA' : (nomeMun || '').toUpperCase());
    setTimeout(() => { setNivel(n); setMun(nomeMun ?? null); }, 300);
    setTimeout(() => setTransicao(null), 1500);
  };
  const voar = (p?: L.LatLng | null) => {
    const m = map.current;
    if (!p || !m) return;
    const z = Math.max(m.getZoom(), 10);
    // no celular a ficha cobre a parte de baixo: mira um pouco abaixo para o ponto ficar visível em cima
    const desc = window.innerWidth <= 640 ? window.innerHeight * 0.28 : 0;
    m.flyTo(m.unproject(m.project(p, z).add([0, desc]), z), z, { duration: 1 });
  };
  const abrir = (tipoP: 'caso' | 'foragido', id: string) => {
    if (nivel === 'mercosul' || nivel === 'brasil') irPara('sc');
    setPainel({ tipo: tipoP, id });
    setTimeout(() => voar(pos.get(id)), 400);
  };

  // mapa
  useEffect(() => {
    const m = L.map(mapEl.current!, { zoomControl: false, minZoom: 3, worldCopyJump: true }).setView([-22, -58], 4);
    m.createPane('rotulos').style.zIndex = '450';
    m.getPane('rotulos')!.style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18 }).addTo(m);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18, pane: 'rotulos' }).addTo(m);
    linhas.current.addTo(m);
    pontos.current.addTo(m);
    m.on('popupopen', (e: L.PopupEvent) => {
      e.popup.getElement()?.querySelectorAll<HTMLElement>('[data-abrir]').forEach((b) => {
        b.onclick = () => { const [t, id] = b.dataset.abrir!.split(':'); setPainel({ tipo: t as 'caso', id }); m.closePopup(); };
      });
    });
    map.current = m;
    return () => { m.remove(); };
  }, []);

  // contornos: Mercosul → Brasil → SC → município
  useEffect(() => {
    const m = map.current;
    if (!m || !geo) return;
    limites.current?.remove();
    const fc = nivel === 'mercosul' ? geo.paises : nivel === 'brasil' ? geo.estados : geo.mun;
    const nome = (f: any) => f.properties.nome || f.properties.name;
    const ativo = (f: any) =>
      nivel === 'mercosul' ? nome(f) === 'Brasil' : nivel === 'brasil' ? f.properties.sigla === 'SC' : nivel === 'mun' ? nome(f) === mun : true;
    const camada = L.geoJSON(fc, {
      style: (f) => ({
        color: ativo(f) ? CIANO : '#2a4a63', weight: nivel === 'sc' || (nivel === 'mun' && !ativo(f)) ? 0.6 : ativo(f) ? 2 : 1,
        fillColor: '#0e2a3f', fillOpacity: ativo(f) ? (nivel === 'sc' ? 0.12 : 0.3) : 0.08,
      }),
      onEachFeature: (f, l) => {
        const sem = nivel === 'mercosul' && nome(f) !== 'Brasil' ? ' · sem dados ainda' : nivel === 'brasil' && f.properties.sigla !== 'SC' ? ' · em breve' : '';
        l.bindTooltip(`${nome(f)}${nome(f) === 'Venezuela' ? ' (suspensa)' : ''}${sem}`, { sticky: true, className: 'dica' });
        l.on('mouseover', () => (l as L.Path).setStyle({ fillOpacity: 0.35, color: CIANO }));
        l.on('mouseout', () => camada.resetStyle(l as L.Path));
        l.on('click', () => {
          if (nivel === 'mercosul' && nome(f) === 'Brasil') irPara('brasil');
          else if (nivel === 'brasil' && f.properties.sigla === 'SC') irPara('sc');
          else if (nivel === 'sc' || nivel === 'mun') irPara('mun', nome(f));
        });
      },
    }).addTo(m);
    limites.current = camada;
    const alvo = nivel === 'mun' && mun ? centros.get(mun) : camada.getBounds();
    if (alvo) m.flyToBounds(alvo, { duration: 1.2, padding: [30, 30], maxZoom: nivel === 'mun' ? 11 : 8 });
  }, [geo, nivel, mun]);

  // marcadores e linhas
  useEffect(() => {
    const m = map.current;
    if (!m || !geo) return;
    pontos.current.clearLayers();
    linhas.current.clearLayers();

    if (nivel === 'mercosul' || nivel === 'brasil') {
      const sc = geo.estados.features.find((f: any) => f.properties.sigla === 'SC');
      L.marker(L.geoJSON(sc).getBounds().getCenter(), {
        icon: L.divIcon({ className: '', html: `<div class="selo">SC · ${casos.length} casos · ${dados.foragidos.length} foragidos</div>`, iconSize: [0, 0] }),
      }).on('click', () => irPara('sc')).addTo(pontos.current);
      return;
    }

    casos.forEach((c) => {
      const p = pos.get(c.id);
      if (!p) return;
      const [rot, cor] = tipo(c.tipo);
      const sel = painel && 'id' in painel && painel.id === c.id;
      L.marker(p, { icon: L.divIcon({ className: '', html: `<div class="caso${sel ? ' sel' : ''}" style="--c:${cor}"></div>`, iconSize: [16, 16] }) })
        .bindPopup(`<div class="pop"><span class="tag" style="--c:${cor}">${esc(rot)}</span><b>${esc(c.titulo)}</b>
          <div class="mut">${esc(c.municipio)} · ${fmt(c.data)}</div><div>${esc(STATUS[c.status] || c.status)}</div>
          <button data-abrir="caso:${c.id}">Abrir ficha ›</button></div>`)
        .addTo(pontos.current);
    });
    dados.foragidos.forEach((f) => {
      const p = pos.get(f.id);
      if (!p) return;
      L.marker(p, {
        icon: L.divIcon({ className: '', html: `<div class="fora"><span>${esc(iniciais(f.nome))}</span><em>${esc(f.apelido || f.nome.split(' ')[0])}</em></div>`, iconSize: [38, 38], iconAnchor: [19, 19] }),
        zIndexOffset: 500,
      })
        .bindPopup(`<div class="pop"><div class="ava">${esc(iniciais(f.nome))}</div><b>${esc(f.nome)}</b>${f.apelido ? ` <i>“${esc(f.apelido)}”</i>` : ''}
          <div class="mut">${esc(f.crimes.join(', '))}</div><div class="mut">Foragido desde ${esc(f.desde || '?')}</div>
          <button data-abrir="foragido:${f.id}">Abrir ficha ›</button></div>`)
        .addTo(pontos.current);
    });

    const linha = (a: L.LatLng | null | undefined, b: L.LatLng | null | undefined, cor: string, tracejado: boolean, dica: string) => {
      if (!a || !b) return;
      L.polyline([a, b], { color: cor, weight: 2.5, opacity: 0.9, dashArray: tracejado ? '8 8' : undefined, className: 'linha' })
        .bindTooltip(dica, { sticky: true, className: 'dica' }).addTo(linhas.current);
    };
    if (painel?.tipo === 'foragido') {
      const f = dados.foragidos.find((x) => x.id === painel.id);
      if (!f) return;
      const pf = pos.get(f.id);
      f.historico.forEach((h) => {
        const ph = ponto(h.municipio, h.lat, h.lng);
        if (!ph) return;
        L.marker(ph, { icon: L.divIcon({ className: '', html: '<div class="hist"></div>', iconSize: [14, 14] }) })
          .bindTooltip(`${fmt(h.data)} · ${h.texto}`, { className: 'dica' }).addTo(linhas.current);
        linha(pf, ph, VERMELHO, true, `Histórico oficial: ${h.texto}`);
      });
      casos.filter((c) => c.foragidos?.includes(f.id)).forEach((c) => linha(pf, pos.get(c.id), VERMELHO, false, `Ligado pela fonte: ${c.titulo}`));
      local.hipoteses.filter((h) => h.foragidoId === f.id).forEach((h) => linha(pf, pos.get(h.casoId), AMARELO, true, `Sua hipótese (${NIVEL[h.nivel]}): ${h.motivo}`));
    }
    if (painel?.tipo === 'caso') {
      const c = casosComPos.find((x) => x.id === painel.id);
      if (!c) return;
      const pc = pos.get(c.id);
      c.foragidos?.forEach((id) => linha(pc, pos.get(id), VERMELHO, false, 'Ligado pela fonte'));
      local.hipoteses.filter((h) => h.casoId === c.id).forEach((h) => linha(pc, pos.get(h.foragidoId), AMARELO, true, `Sua hipótese (${NIVEL[h.nivel]}): ${h.motivo}`));
      parecidos(c, casosComPos).forEach((s) => linha(pc, pos.get(s.caso.id), CIANO, true, `Possível série: ${s.motivos.join(', ')}`));
      local.ligacoes.filter((l) => l.a === c.id || l.b === c.id).forEach((l) => linha(pc, pos.get(l.a === c.id ? l.b : l.a), CIANO, false, `Sua ligação: ${l.nota || 'sem nota'}`));
    }
  }, [geo, nivel, casos, dados.foragidos, pos, painel, local]);

  // linha do tempo
  const eventos = useMemo(() => {
    if (painel?.tipo === 'foragido') {
      const f = dados.foragidos.find((x) => x.id === painel.id);
      if (!f) return [];
      return [
        ...f.historico.map((h) => ({ data: h.data, texto: h.texto, lugar: h.municipio || h.regiao || '', cor: VERMELHO, ir: () => voar(ponto(h.municipio, h.lat, h.lng)) })),
        ...casos.filter((c) => c.foragidos?.includes(f.id)).map((c) => ({ data: c.data, texto: c.titulo, lugar: c.municipio, cor: VERMELHO, ir: () => abrir('caso', c.id) })),
        ...local.hipoteses.filter((h) => h.foragidoId === f.id).map((h) => {
          const c = casos.find((x) => x.id === h.casoId);
          return { data: c?.data || '', texto: `Hipótese: ${c?.titulo || '?'}`, lugar: c?.municipio || '', cor: AMARELO, ir: () => abrir('caso', h.casoId) };
        }),
      ].sort((a, b) => ordem(a.data).localeCompare(ordem(b.data)));
    }
    return casos
      .filter((c) => nivel !== 'mun' || c.municipio === mun)
      .sort((a, b) => ordem(b.data).localeCompare(ordem(a.data)))
      .map((c) => ({ data: c.data, texto: c.titulo, lugar: c.municipio, cor: tipo(c.tipo)[1], ir: () => abrir('caso', c.id) }));
  }, [painel, dados, casos, local, nivel, mun, pos]);

  const migalhas: [Nivel, string][] = [['mercosul', 'Mercosul'], ['brasil', 'Brasil'], ['sc', 'SC']];
  if (mun) migalhas.push(['mun', mun]);

  return (
    <div className="app">
      <div ref={mapEl} className="mapa" />
      <div className="vinheta" />

      <header className="topo">
        <div className="marca">INVEST<b>CRIME</b> <small>v{__APP_VERSION__}</small></div>
        <nav className="migalhas">
          {migalhas.slice(0, ['mercosul', 'brasil', 'sc', 'mun'].indexOf(nivel) + 1).map(([n, rot], i) => (
            <button key={n} onClick={() => irPara(n, n === 'mun' ? mun! : undefined)} className={n === nivel ? 'ativo' : ''}>
              {i > 0 && '› '}{rot}
            </button>
          ))}
        </nav>
        <div className="acoes">
          <button onClick={() => setPainel({ tipo: 'lista', aba: 'casos' })}>Casos</button>
          <button onClick={() => setPainel({ tipo: 'lista', aba: 'foragidos' })}>Foragidos</button>
          <button onClick={() => setPainel({ tipo: 'lista', aba: 'hipoteses' })}>Hipóteses <span className="n">{local.hipoteses.length}</span></button>
          <button className="mais" onClick={() => setPainel({ tipo: 'novo' })} aria-label="Novo caso">＋</button>
        </div>
      </header>

      {erroSalvar && <div className="erro">Não consegui salvar no celular. Libere espaço e tente de novo.</div>}

      {painel && (
        <aside className="painel">
          <button className="fechar" onClick={() => setPainel(null)} aria-label="Fechar">✕</button>
          {painel.tipo === 'caso' && <FichaCaso id={painel.id} />}
          {painel.tipo === 'foragido' && <FichaForagido id={painel.id} />}
          {painel.tipo === 'lista' && <Lista aba={painel.aba} />}
          {painel.tipo === 'novo' && <NovoCaso />}
        </aside>
      )}

      <footer className="tempo">
        <div className="tempo-rot">{painel?.tipo === 'foragido' ? 'LINHA DO TEMPO DO FORAGIDO' : nivel === 'mun' ? `CASOS EM ${mun?.toUpperCase()}` : 'ÚLTIMOS CASOS'}</div>
        <div className="tempo-faixa">
          {eventos.length === 0 && <span className="mut">Nenhum evento aqui.</span>}
          {eventos.map((e, i) => (
            <button key={i} className="evento" style={{ '--c': e.cor } as React.CSSProperties} onClick={e.ir}>
              <b>{fmt(e.data)}</b><span>{e.texto}</span><small>{e.lugar}</small>
            </button>
          ))}
        </div>
      </footer>

      {transicao && (
        <div className="transicao" aria-live="polite">
          <div className="scan" />
          <div className="trans-txt"><small>ACESSANDO</small>{transicao}<div className="barra"><i /></div></div>
        </div>
      )}
      <UpdateGate />
    </div>
  );

  // ---------- fichas e formulários ----------

  function FichaCaso({ id }: { id: string }) {
    const c = casosComPos.find((x) => x.id === id);
    if (!c) return <p>Caso não encontrado.</p>;
    const [rot, cor] = tipo(c.tipo);
    const serie = parecidos(c, casosComPos);
    const hips = local.hipoteses.filter((h) => h.casoId === c.id);
    const ligs = local.ligacoes.filter((l) => l.a === c.id || l.b === c.id);
    const nomeCaso = (cid: string) => casos.find((x) => x.id === cid)?.titulo || '?';
    return (
      <div>
        <span className="tag" style={{ '--c': cor } as React.CSSProperties}>{rot}</span>
        <h2>{c.titulo}</h2>
        <p className="mut">{c.municipio}{c.local ? ` · ${c.local}` : ''}<br />{c.quando || fmt(c.data)}</p>
        <p>{c.resumo}</p>
        <p><b>Situação:</b> {STATUS[c.status] || c.status}</p>
        {c.vinculo_fonte && <p className="fonte-vinc">🔴 {c.vinculo_fonte}</p>}
        {c.fonte && <a className="link" href={c.fonte} target="_blank" rel="noopener noreferrer">Ver fonte ›</a>}
        <p className="mini">Posição no mapa: centro aproximado do município.</p>
        {c.manual && <button className="btn" onClick={() => { setLocal({ ...local, casos: local.casos.filter((x) => x.id !== c.id), hipoteses: local.hipoteses.filter((h) => h.casoId !== c.id), ligacoes: local.ligacoes.filter((l) => l.a !== c.id && l.b !== c.id) }); setPainel(null); }}>Apagar este caso</button>}

        <h3><i style={{ background: CIANO }} />Possível série (automático)</h3>
        {serie.length === 0 ? <p className="mut">Nenhum caso parecido o bastante.</p> : serie.map((s) => (
          <button key={s.caso.id} className="item" onClick={() => abrir('caso', s.caso.id)}>
            <b>{s.caso.titulo}</b><small>{s.caso.municipio} · {fmt(s.caso.data)} · {s.motivos.join(', ')}</small>
          </button>
        ))}

        <h3><i style={{ background: CIANO }} />Suas ligações com outros casos</h3>
        {ligs.map((l) => (
          <div key={l.id} className="item">
            <b>{nomeCaso(l.a === c.id ? l.b : l.a)}</b><small>{l.nota}</small>
            <button className="x" onClick={() => setLocal({ ...local, ligacoes: local.ligacoes.filter((x) => x.id !== l.id) })}>apagar</button>
          </div>
        ))}
        <FormLigacao casoId={c.id} />

        <h3><i style={{ background: AMARELO }} />Hipóteses com foragidos</h3>
        <p className="mini">Só no seu celular. Hipótese não é prova.</p>
        {hips.map((h) => <ItemHipotese key={h.id} h={h} />)}
        <FormHipotese casoId={c.id} />
      </div>
    );
  }

  function FichaForagido({ id }: { id: string }) {
    const f = dados.foragidos.find((x) => x.id === id);
    if (!f) return <p>Foragido não encontrado.</p>;
    const ligados = casos.filter((c) => c.foragidos?.includes(f.id));
    return (
      <div>
        <div className="cab-fora">
          <div className="ava grande">{iniciais(f.nome)}</div>
          <div><h2>{f.nome}</h2>{f.apelido && <p className="mut">“{f.apelido}”</p>}</div>
        </div>
        <a className="link" href={f.cartaz} target="_blank" rel="noopener noreferrer">Ver cartaz oficial com foto (Polícia Civil) ›</a>
        <p>{f.resumo}</p>
        <p><b>Crimes:</b> {f.crimes.join(', ')}</p>
        <p><b>Mandados / pena:</b> {f.mandados}</p>
        <p><b>Foragido desde:</b> {f.desde || 'não informado'}</p>

        <h3><i style={{ background: VERMELHO }} />Histórico oficial</h3>
        {f.historico.map((h, i) => (
          <button key={i} className="item" onClick={() => voar(ponto(h.municipio, h.lat, h.lng))}>
            <b>{fmt(h.data)}</b><small>{h.municipio || h.regiao} · {h.texto}</small>
          </button>
        ))}

        <h3><i style={{ background: VERMELHO }} />Casos ligados pela fonte</h3>
        {ligados.length === 0 ? <p className="mut">Nenhuma notícia recente liga este foragido a um caso.</p> : ligados.map((c) => (
          <button key={c.id} className="item" onClick={() => abrir('caso', c.id)}><b>{c.titulo}</b><small>{c.municipio} · {fmt(c.data)}</small></button>
        ))}

        <h3><i style={{ background: AMARELO }} />Suas hipóteses</h3>
        <p className="mini">Só no seu celular. Hipótese não é prova.</p>
        {local.hipoteses.filter((h) => h.foragidoId === f.id).map((h) => <ItemHipotese key={h.id} h={h} />)}
        <FormHipotese foragidoId={f.id} />
        <p className="mini">Viu algo? Disque Denúncia 181 (anônimo).</p>
      </div>
    );
  }

  function ItemHipotese({ h }: { h: Hipotese }) {
    const c = casos.find((x) => x.id === h.casoId);
    const f = dados.foragidos.find((x) => x.id === h.foragidoId);
    return (
      <div className="item hip">
        <b>{f?.nome || '?'} ↔ {c?.titulo || '?'}</b>
        <small>Força: {NIVEL[h.nivel]} · {h.motivo}</small>
        <button className="x" onClick={() => setLocal({ ...local, hipoteses: local.hipoteses.filter((x) => x.id !== h.id) })}>apagar</button>
      </div>
    );
  }

  function FormHipotese({ casoId, foragidoId }: { casoId?: string; foragidoId?: string }) {
    const [aberto, setAberto] = useState(false);
    const [outro, setOutro] = useState('');
    const [motivo, setMotivo] = useState('');
    const [forca, setForca] = useState(1);
    if (!aberto) return <button className="btn" onClick={() => setAberto(true)}>＋ Nova hipótese</button>;
    const ok = outro && motivo.trim();
    return (
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setLocal({ ...local, hipoteses: [...local.hipoteses, { id: 'h' + Date.now(), casoId: casoId || outro, foragidoId: foragidoId || outro, motivo: motivo.trim(), nivel: forca, criado: new Date().toISOString() }] });
        setAberto(false);
      }}>
        <label>{casoId ? 'Foragido (só da lista oficial)' : 'Caso'}
          <select value={outro} onChange={(e) => setOutro(e.target.value)} required>
            <option value="">Escolha…</option>
            {casoId
              ? dados.foragidos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)
              : casos.map((c) => <option key={c.id} value={c.id}>{fmt(c.data)} · {c.municipio} · {c.titulo}</option>)}
          </select>
        </label>
        <label>Por que você acha isso?
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required placeholder="Ex.: mesmo jeito de agir, mesma região, período em que já estava foragido" />
        </label>
        <label>Força da hipótese
          <select value={forca} onChange={(e) => setForca(+e.target.value)}>
            <option value={1}>Fraca</option><option value={2}>Média</option><option value={3}>Forte</option>
          </select>
        </label>
        <div className="linha-btn"><button className="btn btn-primario" disabled={!ok}>Salvar hipótese</button><button type="button" className="btn" onClick={() => setAberto(false)}>Cancelar</button></div>
      </form>
    );
  }

  function FormLigacao({ casoId }: { casoId: string }) {
    const [aberto, setAberto] = useState(false);
    const [outro, setOutro] = useState('');
    const [nota, setNota] = useState('');
    if (!aberto) return <button className="btn" onClick={() => setAberto(true)}>＋ Ligar a outro caso</button>;
    return (
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        if (!outro) return;
        setLocal({ ...local, ligacoes: [...local.ligacoes, { id: 'l' + Date.now(), a: casoId, b: outro, nota: nota.trim() }] });
        setAberto(false);
      }}>
        <label>Outro caso
          <select value={outro} onChange={(e) => setOutro(e.target.value)} required>
            <option value="">Escolha…</option>
            {casos.filter((c) => c.id !== casoId).map((c) => <option key={c.id} value={c.id}>{fmt(c.data)} · {c.municipio} · {c.titulo}</option>)}
          </select>
        </label>
        <label>Nota (opcional)<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: mesma bicicleta" /></label>
        <div className="linha-btn"><button className="btn btn-primario" disabled={!outro}>Ligar</button><button type="button" className="btn" onClick={() => setAberto(false)}>Cancelar</button></div>
      </form>
    );
  }

  function NovoCaso() {
    const [f, setF] = useState({ data: new Date().toISOString().slice(0, 10), municipio: '', tipo: 'roubo', titulo: '', resumo: '', fonte: '', arma: '', alvo: '' });
    const muns = geo?.mun.features.map((x: any) => x.properties.name).sort() || [];
    const munOk = muns.includes(f.municipio);
    const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
    return (
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        if (!munOk || !f.titulo.trim()) return;
        const novo: CasoX = { ...f, id: 'm' + Date.now(), titulo: f.titulo.trim(), status: 'aberto', manual: true };
        setLocal({ ...local, casos: [...local.casos, novo] });
        abrir('caso', novo.id);
      }}>
        <h2>Novo caso</h2>
        <p className="mini">Fica só no seu celular.</p>
        <label>Data<input type="date" {...campo('data')} required /></label>
        <label>Município (SC)<input list="muns" {...campo('municipio')} required placeholder="Comece a digitar…" />
          <datalist id="muns">{muns.map((m: string) => <option key={m} value={m} />)}</datalist>
          {f.municipio && !munOk && <small className="aviso">Escolha um município da lista.</small>}
        </label>
        <label>Tipo<select {...campo('tipo')}>{Object.entries(TIPOS).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</select></label>
        <label>Título<input {...campo('titulo')} required placeholder="Ex.: Assalto a mercado no centro" /></label>
        <label>O que aconteceu<textarea {...campo('resumo')} /></label>
        <label>Arma<select {...campo('arma')}><option value="">Não informada</option><option value="fogo">Arma de fogo</option><option value="faca">Faca</option><option value="veiculo">Veículo</option></select></label>
        <label>Alvo<select {...campo('alvo')}><option value="">Não informado</option><option value="pessoa">Pessoa</option><option value="comercio">Comércio</option><option value="residencia">Residência</option><option value="infraestrutura">Infraestrutura</option></select></label>
        <label>Link da notícia (opcional)<input type="url" {...campo('fonte')} placeholder="https://" /></label>
        <button className="btn btn-primario" disabled={!munOk || !f.titulo.trim()}>Salvar caso</button>
      </form>
    );
  }

  function Lista({ aba }: { aba: 'casos' | 'foragidos' | 'hipoteses' }) {
    return (
      <div>
        <div className="abas">
          {(['casos', 'foragidos', 'hipoteses'] as const).map((a) => (
            <button key={a} className={a === aba ? 'ativo' : ''} onClick={() => setPainel({ tipo: 'lista', aba: a })}>
              {a === 'casos' ? `Casos (${casos.length})` : a === 'foragidos' ? `Foragidos (${dados.foragidos.length})` : `Hipóteses (${local.hipoteses.length})`}
            </button>
          ))}
        </div>
        {aba === 'casos' && [...casos].sort((a, b) => ordem(b.data).localeCompare(ordem(a.data))).map((c) => (
          <button key={c.id} className="item" onClick={() => abrir('caso', c.id)} style={{ borderLeftColor: tipo(c.tipo)[1] }}>
            <b>{c.titulo}</b><small>{tipo(c.tipo)[0]} · {c.municipio} · {fmt(c.data)}{c.manual ? ' · seu' : ''}</small>
          </button>
        ))}
        {aba === 'foragidos' && (<>
          <p className="mini">Fonte: Portal Foragidos da Polícia Civil de SC.</p>
          {dados.foragidos.map((f) => (
            <button key={f.id} className="item item-fora" onClick={() => abrir('foragido', f.id)}>
              <span className="ava">{iniciais(f.nome)}</span><span><b>{f.nome}</b><small>{f.crimes.join(', ')}</small></span>
            </button>
          ))}
        </>)}
        {aba === 'hipoteses' && (<>
          <p className="mini">Só no seu celular. Nada aqui é enviado ou compartilhado. Hipótese não é prova.</p>
          {local.hipoteses.length === 0 ? <p className="mut">Abra um caso e toque em “Nova hipótese”.</p> : local.hipoteses.map((h) => <ItemHipotese key={h.id} h={h} />)}
        </>)}
        <p className="mini rodape-lista">Dados públicos atualizados em {fmt(dados.atualizado)}.</p>
      </div>
    );
  }
}
