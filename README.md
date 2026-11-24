# InvestCrime

Painel pessoal de casos criminais de SC: mapa do Mercosul → Brasil → SC → município, foragidos do Portal Foragidos da Polícia Civil de SC, ligação entre casos e hipóteses particulares.

## Baixar no celular
`https://github.com/cassianovogt123-ai/InvestCrime/releases/latest/download/InvestCrime.apk`

Abra o link, baixe, toque no arquivo e permita "instalar apps desconhecidos".

## Baixar no PC (Windows)
- Instalador (cria atalho e se atualiza sozinho): `.../releases/latest/download/InvestCrime-Instalador.exe`
- Portátil (abre sem instalar): `.../releases/latest/download/InvestCrime-Portatil.exe`

Se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo** (o app não tem assinatura paga da Microsoft).
No PC as hipóteses ficam só naquele computador, separadas das do celular.

## Versões e atualização obrigatória
- Cada mudança no código gera uma versão nova (1.0.1, 1.0.2...) na aba **Releases**, pelo GitHub Actions.
- O app confere a cada 5 minutos. Se tiver versão nova, trava com "Atualização obrigatória" até instalar (no PC o instalador atualiza e reabre sozinho).
- Mudar só `data/dados.json` **não** gera versão nova: o app baixa os dados atualizados sozinho.

## Regras dos dados
- Casos: notícias públicas, sempre com link da fonte. Posição = centro aproximado do município.
- Foragidos: só quem está em lista oficial. A foto fica no cartaz oficial (link), não é copiada para o app.
- Caso ↔ foragido em `dados.json` só quando a fonte afirma.
- Hipóteses, ligações e casos que você cria ficam **só no celular** e nunca vão para o GitHub.

## Rodar no computador
```bash
npm install
npm run dev
npm test
npm run desktop   # abre a versão de PC
```
