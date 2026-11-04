# TaxiTarifa — versão web

Mesmo motor tarifário do app nativo, portado para JavaScript com paridade
comprovada ao centavo (61 testes espelhando os TarifaChecks do Swift:
`node js/testes.mjs`).

**Publicado em: https://thiagobva.github.io/taxitarifa/** (GitHub Pages,
repositório público [ThiagoBvA/taxitarifa](https://github.com/ThiagoBvA/taxitarifa);
esta pasta é o repositório — `git push` publica, com cache de ~10 min).

## Rodar

É um site estático — qualquer servidor serve:

```sh
python3 -m http.server 8742 -d ~/Claude/Projects/TaxiTarifa/web
```

e abra http://localhost:8742 (na rede local, http://IP-do-Mac:8742 funciona
no iPhone). Para publicar, basta subir a pasta `web/` em qualquer hospedagem
estática (Cloudflare Pages, GitHub Pages, Netlify).

## Provedores de rota

- **Sem configurar nada**: OpenStreetMap — busca de endereços pelo Photon
  (fuzzy, tolerante a erro de digitação e bom com nomes de lugares; Nominatim
  como reserva) e rotas pelo OSRM público. Gratuito e sem chave, mas o tempo
  de percurso NÃO considera o trânsito.
- **Com chave do Google Maps Platform** (⚙️ no app, salva no navegador):
  rotas com previsão de trânsito por horário (Routes API), alternativas e
  autocompletar de qualidade. Habilitar na chave: Routes API e Places API
  (New). A faixa gratuita mensal do Google cobre uso pessoal/escritório.
  Restrinja a chave por site (referrer) no console do Google.

## Dados

- `dados/catalogo.json` — tarifas e feriados das 27 capitais, gerado do app
  nativo com `swift run ExportarCatalogo > web/dados/catalogo.json`.
  A rotina mensal de atualização regrava este arquivo quando há reajuste.
- `dados/municipios.json` — malhas municipais oficiais do IBGE (qualidade
  intermediária, 90 KB) usadas na divisa de município: no trecho que sai da
  capital, a parte interna é cobrada pelo relógio e a externa em Bandeira 2,
  com as duas parcelas no demonstrativo. Regenerável pelo script
  `baixar_malhas.py` (API de malhas do IBGE v3).

## Estrutura

```
index.html            página única (formulário, resultado, histórico, config)
css/estilo.css        visual + leiaute de impressão A4 (o PDF sai do navegador)
js/tarifas.js         motor tarifário (porta fiel do TaxiTarifaKit)
js/municipios.js      ponto-em-polígono e fração do trajeto fora do município
js/rotas.js           provedores (Google REST / Nominatim+OSRM) e polylines
js/app.js             interface
js/testes.mjs         61 testes de paridade com o Swift (node js/testes.mjs)
manifest.json         PWA — “Adicionar à Tela de Início” no iPhone
```
