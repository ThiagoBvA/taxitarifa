// Análise geográfica: pertencimento ao município (malhas oficiais do IBGE)
// e fração do trajeto fora do município, calculada sobre a polyline da rota.

function pontoNoAnel(lon, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/** true se (lat, lon) está dentro da geometria GeoJSON (Polygon/MultiPolygon). */
export function dentroDoMunicipio(lat, lon, geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) {
    if (pontoNoAnel(lon, lat, poly[0])) {
      let emBuraco = false;
      for (let k = 1; k < poly.length; k++) {
        if (pontoNoAnel(lon, lat, poly[k])) { emBuraco = true; break; }
      }
      if (!emBuraco) return true;
    }
  }
  return false;
}

/** Distância haversine em metros entre [lat, lon]. */
export function distanciaM(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Analisa um trajeto (polyline [[lat, lon], …]) contra o polígono do município:
 * fração da DISTÂNCIA fora, se a parte fora fica no início, e se o trecho
 * conta como "fora do município" (alguma extremidade fora, ou trânsito
 * relevante por outro município).
 */
export function analisarTrajeto(pontos, geom) {
  if (!geom || pontos.length < 2) {
    return { foraDoMunicipio: false, fracaoFora: 0, foraNoInicio: false };
  }
  const origemFora = !dentroDoMunicipio(pontos[0][0], pontos[0][1], geom);
  const destinoFora = !dentroDoMunicipio(
    pontos[pontos.length - 1][0], pontos[pontos.length - 1][1], geom);

  let total = 0;
  let fora = 0;
  for (let i = 1; i < pontos.length; i++) {
    const d = distanciaM(pontos[i - 1], pontos[i]);
    total += d;
    const meio = [(pontos[i - 1][0] + pontos[i][0]) / 2, (pontos[i - 1][1] + pontos[i][1]) / 2];
    if (!dentroDoMunicipio(meio[0], meio[1], geom)) fora += d;
  }
  const fracaoFora = total > 0 ? fora / total : 0;
  const foraDoMunicipio = origemFora || destinoFora || fracaoFora > 0.15;
  return {
    foraDoMunicipio,
    fracaoFora: foraDoMunicipio ? Math.min(Math.max(fracaoFora, 0.001), 1) : 0,
    foraNoInicio: origemFora && !destinoFora,
  };
}
