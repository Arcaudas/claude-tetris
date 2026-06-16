---
name: clima
description: Obtiene el clima actual o pronóstico usando wttr.in. Usar cuando el usuario pregunte por el tiempo, temperatura, clima o condiciones meteorológicas. Default: Villalbilla, Madrid.
---

# Skill: clima

Obtiene el clima actual usando `wttr.in` (sin API key, sin dependencias).

## Triggers

Usar cuando el usuario diga: "clima", "tiempo", "weather", "qué temperatura", "cómo está el tiempo", `/clima`, o cualquier pregunta sobre condiciones meteorológicas.

## Instrucciones

1. Detecta si el usuario especificó una ubicación (ciudad, país, coordenadas). Si no, usa **Villalbilla, Madrid** como ciudad por defecto (codificado: `Villalbilla,Madrid`).

2. Ejecuta el comando apropiado:

  **Sin ubicación (default: Villalbilla):**

  ```bash
  curl -s "wttr.in/Villalbilla,Madrid?format=j1"
  ```

  **Con ubicación específica:**

  ```bash
  curl -s "wttr.in/CIUDAD?format=j1"
  ```

  Codifica espacios como `+` (ej: `Buenos+Aires`).

3. Parsea el JSON con Python:

```bash
curl -s "wttr.in/CIUDAD?format=j1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
c = d['current_condition'][0]
area = d['nearest_area'][0]
city = area['areaName'][0]['value']
country = area['country'][0]['value']
temp_c = c['temp_C']
feels = c['FeelsLikeC']
humidity = c['humidity']
wind_kmph = c['windspeedKmph']
wind_dir = c['winddir16Point']
desc = c['weatherDesc'][0]['value']
uv = c['uvIndex']
print(f'Ubicación: {city}, {country}')
print(f'Condición: {desc}')
print(f'Temperatura: {temp_c}°C (sensación térmica {feels}°C)')
print(f'Humedad: {humidity}%')
print(f'Viento: {wind_kmph} km/h ({wind_dir})')
print(f'Índice UV: {uv}')
"
```

4. Reporta el resultado al usuario en texto claro en español. Si el usuario pidió el pronóstico (no solo clima actual), también parsea `d['weather']` que contiene hasta 3 días:

```bash
curl -s "wttr.in/CIUDAD?format=j1" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for day in d['weather']:
    date = day['date']
    max_c = day['maxtempC']
    min_c = day['mintempC']
    desc = day['hourly'][4]['weatherDesc'][0]['value']  # mediodía aprox
    print(f'{date}: {min_c}°C – {max_c}°C, {desc}')
"
```

## Errores comunes

- `curl` falla: sin conexión a internet o `wttr.in` caído. Di al usuario que verifique conectividad.
- JSON vacío / ciudad no encontrada: prueba con nombre en inglés o añade país (`Ciudad,País`).
- `python3` no disponible: usa `curl -s "wttr.in/CIUDAD?format=3"` para salida de texto plano simple.

## Salida esperada

Respuesta concisa en español con: ubicación, condición, temperatura, sensación térmica, humedad y viento. Sin JSON crudo en la respuesta.
