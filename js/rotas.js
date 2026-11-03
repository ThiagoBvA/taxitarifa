// Geocodificação, autocompletar e rotas — dois provedores:
//  • Google Maps Platform (com chave de API): trânsito previsto por horário,
//    rotas alternativas e autocompletar de qualidade.
//  • OpenStreetMap (sem chave, gratuito): Nominatim + OSRM público — o tempo
//    NÃO considera trânsito (estimativa estática).

export function provedorAtivo(cfg) {
  return cfg && cfg.chaveGoogle ? "google" : "osm";
}

/** Decodifica polyline codificada (precisão 5 — Google e OSRM). */
export function decodificarPolyline(str) {
  const pontos = [];
  let lat = 0, lon = 0, i = 0;
  while (i < str.length) {
    for (const alvo of [0, 1]) {
      let resultado = 0, desloc = 0, byte;
      do {
        byte = str.charCodeAt(i++) - 63;
        resultado |= (byte & 0x1f) << desloc;
        desloc += 5;
      } while (byte >= 0x20);
      const delta = (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1);
      if (alvo === 0) lat += delta; else lon += delta;
    }
    pontos.push([lat / 1e5, lon / 1e5]);
  }
  return pontos;
}

async function fetchJSON(url, opcoes) {
  const resp = await fetch(url, opcoes);
  if (!resp.ok) {
    let detalhe = "";
    try { detalhe = (await resp.json()).error?.message || ""; } catch { /* corpo não-JSON */ }
    throw new Error(`${detalhe || "erro " + resp.status} (${new URL(url).hostname})`);
  }
  return resp.json();
}

// ---------- Geocodificação / autocompletar ----------

/** Sugestões de endereço (lista de {rotulo, detalhe, resolver(): Promise<lugar>}). */
export async function sugerir(texto, tabela, cfg) {
  if (provedorAtivo(cfg) === "google") {
    const corpo = {
      input: texto,
      locationBias: {
        circle: {
          center: { latitude: tabela.centroLat, longitude: tabela.centroLon },
          radius: 50000,
        },
      },
      languageCode: "pt-BR", regionCode: "BR",
    };
    const r = await fetchJSON("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": cfg.chaveGoogle },
      body: JSON.stringify(corpo),
    });
    return (r.suggestions || []).slice(0, 5).map(s => {
      const p = s.placePrediction;
      return {
        rotulo: p.structuredFormat?.mainText?.text || p.text?.text || texto,
        detalhe: p.structuredFormat?.secondaryText?.text || "",
        resolver: async () => {
          const det = await fetchJSON(
            `https://places.googleapis.com/v1/${p.place}?fields=location,formattedAddress,displayName&languageCode=pt-BR&key=${cfg.chaveGoogle}`);
          return {
            nome: det.displayName?.text || p.text?.text || texto,
            endereco: det.formattedAddress || "",
            lat: det.location.latitude, lon: det.location.longitude,
          };
        },
      };
    });
  }
  // Nominatim (OSM) — viés pela caixa da cidade; uso leve.
  const dLat = 0.35, dLon = 0.35;
  const vb = [tabela.centroLon - dLon, tabela.centroLat - dLat,
              tabela.centroLon + dLon, tabela.centroLat + dLat].join(",");
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0"
    + `&countrycodes=br&limit=5&viewbox=${vb}&q=${encodeURIComponent(texto)}`;
  const r = await fetchJSON(url, { headers: { "Accept-Language": "pt-BR" } });
  return r.map(item => ({
    rotulo: item.display_name.split(",").slice(0, 2).join(",").trim(),
    detalhe: item.display_name.split(",").slice(2, 5).join(",").trim(),
    resolver: async () => ({
      nome: item.display_name.split(",")[0].trim(),
      endereco: item.display_name,
      lat: Number(item.lat), lon: Number(item.lon),
    }),
  }));
}

/** Geocodifica texto digitado à mão (sem passar pelo autocompletar). */
export async function geocodificar(texto, tabela, cfg) {
  const lista = await sugerir(`${texto}, ${tabela.cidade}`, tabela, cfg);
  if (!lista.length) {
    throw new Error(`Endereço não encontrado: “${texto}”. Tente incluir bairro e cidade.`);
  }
  return lista[0].resolver();
}

// ---------- Rotas ----------

/**
 * Rotas de carro entre dois lugares ({lat, lon}), com alternativas.
 * Retorna [{distanciaMetros, duracaoSeg, pontos: [[lat, lon], …]}], a principal primeiro.
 */
export async function rotas(origem, destino, partida, cfg) {
  if (provedorAtivo(cfg) === "google") {
    const minimo = new Date(Date.now() + 90 * 1000);
    const quando = partida > minimo ? partida : minimo;
    const corpo = {
      origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lon } } },
      destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lon } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      departureTime: quando.toISOString(),
      computeAlternativeRoutes: true,
      languageCode: "pt-BR", units: "METRIC",
    };
    const r = await fetchJSON("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cfg.chaveGoogle,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(corpo),
    });
    const lista = (r.routes || []).map(rt => ({
      distanciaMetros: rt.distanceMeters,
      duracaoSeg: Number(String(rt.duration || "0s").replace("s", "")),
      pontos: decodificarPolyline(rt.polyline?.encodedPolyline || ""),
    }));
    if (!lista.length) throw new Error("Nenhuma rota encontrada.");
    return lista;
  }
  // OSRM público (sem trânsito).
  const url = `https://router.project-osrm.org/route/v1/driving/`
    + `${origem.lon},${origem.lat};${destino.lon},${destino.lat}`
    + "?alternatives=true&overview=full&geometries=polyline";
  const r = await fetchJSON(url);
  if (r.code !== "Ok" || !r.routes?.length) throw new Error("Nenhuma rota encontrada (OSRM).");
  return r.routes.map(rt => ({
    distanciaMetros: rt.distance,
    duracaoSeg: rt.duration,
    pontos: decodificarPolyline(rt.geometry),
  }));
}
