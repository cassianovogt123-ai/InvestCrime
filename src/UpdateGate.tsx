// Atualização obrigatória (mesmo esquema do VogtSonar Sul): se a release mais nova do GitHub
// for maior que a versão instalada, trava o app até atualizar.
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

declare const __APP_VERSION__: string;
export const REPO = 'cassianovogt123-ai/InvestCrime';
// link da versão exata: o "latest" pode vir do cache do celular e baixar o APK antigo
const apkUrl = (v: string) => `https://github.com/${REPO}/releases/download/v${v}/InvestCrime.apk`;
const build = (v: string) => Number(String(v).split('.').pop()); // "v1.0.42" -> 42

export function UpdateGate() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const installed = build(__APP_VERSION__);
    if (!Capacitor.isNativePlatform() || isNaN(installed)) return; // build local de teste não checa
    const check = async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: 'no-store' });
        const tag: string = (await res.json()).tag_name;
        if (build(tag) > installed) setLatest(tag.replace(/^v/, ''));
      } catch {
        /* sem internet: não trava o app */
      }
    };
    check();
    const id = setInterval(check, 5 * 60000); // GitHub aceita 60 consultas/hora sem login
    return () => clearInterval(id);
  }, []);

  if (!latest) return null;
  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-t">
      <div className="gate-box">
        <h2 id="gate-t">Atualização obrigatória</h2>
        <p>A versão <b>{latest}</b> do InvestCrime saiu. Você está na {__APP_VERSION__}.</p>
        <a className="btn btn-primario" href={apkUrl(latest)}>Baixar e instalar</a>
        <small>Depois do download, toque no arquivo e em “Instalar”. Suas hipóteses e casos continuam.</small>
      </div>
    </div>
  );
}
