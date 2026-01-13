#!/usr/bin/env python3
"""
Starlink satelliittien ylilentolaskuri

Laskee milloin Starlink-satelliitit lentävät annetun sijainnin yli.
Käyttää Celestrakin TLE-dataa ja Skyfield-kirjastoa.

Käyttö:
    python starlink_pass_calculator.py [--lat LATITUDE] [--lon LONGITUDE] [--max-distance KM] [--hours HOURS]

Esimerkki (Jyväskylä):
    python starlink_pass_calculator.py --lat 62.2426 --lon 25.7473 --max-distance 500 --hours 24
"""

import argparse
import urllib.request
import os
import json
from datetime import datetime, timedelta
from typing import List, Tuple, Optional
import math

# Vakiot
EARTH_RADIUS_KM = 6371.0
CELESTRAK_STARLINK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"
TLE_CACHE_FILE = "starlink_tle_cache.txt"
CACHE_MAX_AGE_HOURS = 6  # TLE-tiedot vanhenevat, päivitä 6 tunnin välein


def download_tle_data(url: str = CELESTRAK_STARLINK_URL) -> str:
    """Lataa TLE-data Celestrakista."""
    print(f"Ladataan TLE-dataa: {url}")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read().decode('utf-8')
        print(f"Ladattu {len(data)} tavua TLE-dataa")
        return data
    except Exception as e:
        raise RuntimeError(f"TLE-datan lataus epäonnistui: {e}")


def get_cached_tle_data(cache_file: str = TLE_CACHE_FILE, max_age_hours: float = CACHE_MAX_AGE_HOURS) -> Optional[str]:
    """Hae TLE-data välimuistista jos se on tuore."""
    if not os.path.exists(cache_file):
        return None

    file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(cache_file))
    if file_age > timedelta(hours=max_age_hours):
        print(f"Välimuisti vanhentunut ({file_age}), ladataan uusi data")
        return None

    with open(cache_file, 'r') as f:
        return f.read()


def save_tle_cache(data: str, cache_file: str = TLE_CACHE_FILE):
    """Tallenna TLE-data välimuistiin."""
    with open(cache_file, 'w') as f:
        f.write(data)
    print(f"TLE-data tallennettu välimuistiin: {cache_file}")


def parse_tle_data(tle_text: str) -> List[Tuple[str, str, str]]:
    """
    Parsii TLE-tekstin listaksi (nimi, rivi1, rivi2) -tupleja.
    """
    lines = [line.strip() for line in tle_text.strip().split('\n') if line.strip()]
    satellites = []

    i = 0
    while i < len(lines) - 2:
        # TLE-formaatti: nimi, rivi 1 (alkaa "1 "), rivi 2 (alkaa "2 ")
        if lines[i+1].startswith('1 ') and lines[i+2].startswith('2 '):
            name = lines[i]
            line1 = lines[i+1]
            line2 = lines[i+2]
            satellites.append((name, line1, line2))
            i += 3
        else:
            i += 1

    return satellites


def tle_to_orbital_elements(line1: str, line2: str) -> dict:
    """
    Parsii TLE-rivit rata-alkioiksi.
    """
    # Rivi 1
    epoch_year = int(line1[18:20])
    epoch_day = float(line1[20:32])

    # Muunna vuosi täydeksi vuodeksi
    if epoch_year >= 57:
        epoch_year += 1900
    else:
        epoch_year += 2000

    # Rivi 2
    inclination = float(line2[8:16])  # astetta
    raan = float(line2[17:25])  # Right Ascension of Ascending Node, astetta
    eccentricity = float('0.' + line2[26:33])  # eksentrisyys
    arg_perigee = float(line2[34:42])  # perigeumi argumentti, astetta
    mean_anomaly = float(line2[43:51])  # keskianomalia, astetta
    mean_motion = float(line2[52:63])  # kierroksia/päivä

    return {
        'epoch_year': epoch_year,
        'epoch_day': epoch_day,
        'inclination': inclination,
        'raan': raan,
        'eccentricity': eccentricity,
        'arg_perigee': arg_perigee,
        'mean_anomaly': mean_anomaly,
        'mean_motion': mean_motion
    }


def deg_to_rad(deg: float) -> float:
    """Muunna asteet radiaaneiksi."""
    return deg * math.pi / 180.0


def rad_to_deg(rad: float) -> float:
    """Muunna radiaanit asteiksi."""
    return rad * 180.0 / math.pi


def julian_date(dt: datetime) -> float:
    """Laske Julian Date annetulle ajankohdalle."""
    year = dt.year
    month = dt.month
    day = dt.day + dt.hour/24 + dt.minute/1440 + dt.second/86400

    if month <= 2:
        year -= 1
        month += 12

    A = int(year / 100)
    B = 2 - A + int(A / 4)

    jd = int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + B - 1524.5
    return jd


def gmst(jd: float) -> float:
    """
    Laske Greenwich Mean Sidereal Time (GMST) radiaaneina.
    """
    # Julian vuosisatoja J2000.0:sta
    T = (jd - 2451545.0) / 36525.0

    # GMST sekunneissa
    gmst_seconds = 67310.54841 + (876600 * 3600 + 8640184.812866) * T + 0.093104 * T**2 - 6.2e-6 * T**3

    # Muunna asteiksi ja normalisoi
    gmst_degrees = (gmst_seconds / 240.0) % 360.0

    return deg_to_rad(gmst_degrees)


def propagate_satellite(elements: dict, dt: datetime) -> Tuple[float, float, float]:
    """
    Yksinkertainen SGP4-tyyppinen propagointi.
    Palauttaa (latitude, longitude, altitude_km).

    HUOM: Tämä on yksinkertaistettu malli. Täydellinen SGP4
    on monimutkaisempi ja tarkempi.
    """
    # Epochin Julian Date
    epoch_jd = julian_date(datetime(elements['epoch_year'], 1, 1)) + elements['epoch_day'] - 1

    # Nykyhetken Julian Date
    current_jd = julian_date(dt)

    # Aika epochista minuutteina
    time_since_epoch_min = (current_jd - epoch_jd) * 1440.0

    # Rata-alkiot radiaaneina
    inc = deg_to_rad(elements['inclination'])
    raan = deg_to_rad(elements['raan'])
    ecc = elements['eccentricity']
    argp = deg_to_rad(elements['arg_perigee'])
    M0 = deg_to_rad(elements['mean_anomaly'])
    n = elements['mean_motion'] * 2 * math.pi / 1440.0  # rad/min

    # Puoliakseli (km) - Keplerin 3. laki
    mu = 398600.4418  # km³/s²
    n_rad_s = n / 60.0  # rad/s
    a = (mu / (n_rad_s ** 2)) ** (1/3)

    # Korkeus (keskimääräinen)
    altitude = a - EARTH_RADIUS_KM

    # Keskianomalia nykyhetkellä
    M = M0 + n * time_since_epoch_min
    M = M % (2 * math.pi)

    # Eksentrinen anomalia (Newtonin iteraatio)
    E = M
    for _ in range(10):
        E = M + ecc * math.sin(E)

    # Todellinen anomalia
    nu = 2 * math.atan2(
        math.sqrt(1 + ecc) * math.sin(E / 2),
        math.sqrt(1 - ecc) * math.cos(E / 2)
    )

    # Argumentti leveyspiirille
    u = argp + nu

    # RAAN:n preessio (J2-häiriö yksinkertaistettuna)
    J2 = 0.00108263
    raan_dot = -1.5 * n * J2 * (EARTH_RADIUS_KM / a) ** 2 * math.cos(inc) / ((1 - ecc**2) ** 2)
    raan_current = raan + raan_dot * time_since_epoch_min

    # Sijainti ECI-koordinaateissa
    r = a * (1 - ecc * math.cos(E))

    x_orbital = r * math.cos(nu)
    y_orbital = r * math.sin(nu)

    # Muunna ECI:hin
    x_eci = (math.cos(raan_current) * math.cos(u) - math.sin(raan_current) * math.sin(u) * math.cos(inc)) * x_orbital + \
            (-math.cos(raan_current) * math.sin(u) - math.sin(raan_current) * math.cos(u) * math.cos(inc)) * y_orbital

    y_eci = (math.sin(raan_current) * math.cos(u) + math.cos(raan_current) * math.sin(u) * math.cos(inc)) * x_orbital + \
            (-math.sin(raan_current) * math.sin(u) + math.cos(raan_current) * math.cos(u) * math.cos(inc)) * y_orbital

    z_eci = math.sin(inc) * math.sin(u) * x_orbital + math.sin(inc) * math.cos(u) * y_orbital

    # Muunna ECEF:iin (Greenwich sidereal time)
    theta = gmst(current_jd)

    x_ecef = x_eci * math.cos(theta) + y_eci * math.sin(theta)
    y_ecef = -x_eci * math.sin(theta) + y_eci * math.cos(theta)
    z_ecef = z_eci

    # Muunna geodeettisiksi koordinaateiksi
    lon = math.atan2(y_ecef, x_ecef)
    lat = math.atan2(z_ecef, math.sqrt(x_ecef**2 + y_ecef**2))

    return (rad_to_deg(lat), rad_to_deg(lon), altitude)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Laske kahden pisteen välinen etäisyys Maan pinnalla (km).
    """
    lat1, lon1, lat2, lon2 = map(deg_to_rad, [lat1, lon1, lat2, lon2])

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))

    return EARTH_RADIUS_KM * c


def calculate_ground_distance(sat_lat: float, sat_lon: float, sat_alt: float,
                              obs_lat: float, obs_lon: float) -> float:
    """
    Laske satelliitin etäisyys havaintopaikkaan (huomioiden korkeus).
    """
    # Maanpinnan etäisyys
    ground_dist = haversine_distance(sat_lat, sat_lon, obs_lat, obs_lon)

    # 3D-etäisyys (yksinkertaistettu)
    distance = math.sqrt(ground_dist**2 + sat_alt**2)

    return distance


def calculate_elevation(sat_lat: float, sat_lon: float, sat_alt: float,
                       obs_lat: float, obs_lon: float) -> float:
    """
    Laske satelliitin kohokulma (elevaatio) havaitsijan näkökulmasta.
    """
    ground_dist = haversine_distance(sat_lat, sat_lon, obs_lat, obs_lon)

    if ground_dist < 0.1:  # Hyvin lähellä
        return 90.0

    elevation = rad_to_deg(math.atan2(sat_alt, ground_dist))
    return elevation


def calculate_azimuth(sat_lat: float, sat_lon: float, obs_lat: float, obs_lon: float) -> float:
    """
    Laske satelliitin atsimuutti (suuntakulma) havaitsijan näkökulmasta.
    Palauttaa kulman asteina (0° = pohjoinen, 90° = itä, 180° = etelä, 270° = länsi).
    """
    obs_lat_rad = deg_to_rad(obs_lat)
    sat_lat_rad = deg_to_rad(sat_lat)
    dlon_rad = deg_to_rad(sat_lon - obs_lon)

    y = math.sin(dlon_rad) * math.cos(sat_lat_rad)
    x = math.cos(obs_lat_rad) * math.sin(sat_lat_rad) - \
        math.sin(obs_lat_rad) * math.cos(sat_lat_rad) * math.cos(dlon_rad)

    azimuth_rad = math.atan2(y, x)
    azimuth = (rad_to_deg(azimuth_rad) + 360) % 360

    return azimuth


def azimuth_to_direction(azimuth: float) -> str:
    """
    Muunna atsimuutti (asteet) ilmansuunnaksi.
    """
    directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    index = int((azimuth + 22.5) / 45) % 8
    return directions[index]


def calculate_solar_position(dt: datetime, lat: float, lon: float) -> Tuple[float, float]:
    """
    Laske auringon sijainti (elevaatio ja atsimuutti) annetulle paikalle ja ajalle.
    Palauttaa (elevation, azimuth) asteina.
    """
    # Julian Date
    jd = julian_date(dt)

    # Julian vuosisatoja J2000.0:sta
    n = jd - 2451545.0

    # Keskimääräinen auringon pituusaste
    L = (280.460 + 0.9856474 * n) % 360

    # Keskimääräinen anomalia
    g = deg_to_rad((357.528 + 0.9856003 * n) % 360)

    # Ekliptikaaliset koordinaatit
    lambda_sun = L + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)

    # Kallistus
    epsilon = deg_to_rad(23.439 - 0.0000004 * n)

    # Oikea ylösnousu ja deklinaatio
    lambda_rad = deg_to_rad(lambda_sun)
    alpha = rad_to_deg(math.atan2(math.cos(epsilon) * math.sin(lambda_rad), math.cos(lambda_rad)))
    delta = rad_to_deg(math.asin(math.sin(epsilon) * math.sin(lambda_rad)))

    # Paikallinen tuntikulma
    gmst_deg = rad_to_deg(gmst(jd)) % 360
    lha = (gmst_deg + lon - alpha) % 360

    # Muunna horisonttikoordinaateiksi
    lat_rad = deg_to_rad(lat)
    delta_rad = deg_to_rad(delta)
    lha_rad = deg_to_rad(lha)

    # Elevaatio
    sin_alt = math.sin(lat_rad) * math.sin(delta_rad) + \
              math.cos(lat_rad) * math.cos(delta_rad) * math.cos(lha_rad)
    elevation = rad_to_deg(math.asin(sin_alt))

    # Atsimuutti
    cos_az = (math.sin(delta_rad) - math.sin(lat_rad) * sin_alt) / \
             (math.cos(lat_rad) * math.cos(math.asin(sin_alt)))
    cos_az = max(-1, min(1, cos_az))  # Varmista että on välillä [-1, 1]
    azimuth = rad_to_deg(math.acos(cos_az))

    if math.sin(lha_rad) > 0:
        azimuth = 360 - azimuth

    return elevation, azimuth


def is_satellite_illuminated(sat_alt: float, sun_elevation: float) -> bool:
    """
    Määritä onko satelliitti auringon valossa.
    Satelliitti on valaistu jos se on tarpeeksi korkealla näkemään auringon.
    """
    # Laske auringon geometrinen korkeus satelliitin sijainnissa
    # Yksinkertaistettu: jos satelliitti on korkealla ja aurinko ei ole liian syvällä
    earth_shadow_angle = -math.degrees(math.asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + sat_alt)))

    # Satelliitti on valaistu jos aurinko on korkeammalla kuin varjon kulma
    return sun_elevation > earth_shadow_angle


def calculate_visibility_rating(sun_elevation: float, sat_illuminated: bool,
                                sat_elevation: float) -> Tuple[int, str]:
    """
    Laske näkyvyysluokitus (0-100) ja kategoria.

    Parhaat katseluolosuhteet:
    - Havaitsija on pimeässä (aurinko horisontin alapuolella)
    - Satelliitti on auringon valossa
    - Satelliitti on korkealla taivaalla

    Palauttaa (rating, category) missä:
    - rating: 0-100 (100 = paras)
    - category: "Excellent", "Good", "Fair", "Poor"
    """
    if not sat_illuminated:
        # Satelliitti ei ole valaistu - huono näkyvyys
        return 0, "Poor"

    # Perusluokitus auringon korkeuden perusteella
    if sun_elevation > 0:
        # Päivänvalo - ei näkyvissä
        return 0, "Poor"
    elif sun_elevation > -6:
        # Siviilihämärä - heikko näkyvyys
        base_rating = 30
        category = "Fair"
    elif sun_elevation > -12:
        # Merihämärä - hyvä näkyvyys
        base_rating = 60
        category = "Good"
    elif sun_elevation > -18:
        # Tähtihämärä - erinomainen näkyvyys
        base_rating = 85
        category = "Excellent"
    else:
        # Täysi pimeä - paras näkyvyys
        base_rating = 95
        category = "Excellent"

    # Lisäbonus satelliitin korkeuden perusteella
    # Korkeammalla olevat satelliitit ovat kirkkaampia
    elevation_bonus = min(sat_elevation / 90.0 * 5, 5)  # Max 5 pistettä

    rating = min(int(base_rating + elevation_bonus), 100)

    # Päivitä kategoria lopullisen rating:in mukaan
    if rating >= 80:
        category = "Excellent"
    elif rating >= 60:
        category = "Good"
    elif rating >= 30:
        category = "Fair"
    else:
        category = "Poor"

    return rating, category


def find_passes(satellites: List[Tuple[str, str, str]],
                observer_lat: float,
                observer_lon: float,
                max_distance_km: float = 500,
                hours_ahead: float = 24,
                time_step_seconds: int = 30) -> List[dict]:
    """
    Etsi satelliittien ylilennot.

    Palauttaa listan ylilentoja:
    {
        'satellite': nimi,
        'start_time': aloitusaika,
        'max_elevation_time': korkeimman elevaation aika,
        'end_time': lopetusaika,
        'max_elevation': korkein elevaatio,
        'min_distance': lähin etäisyys
    }
    """
    passes = []
    start_time = datetime.utcnow()
    end_time = start_time + timedelta(hours=hours_ahead)

    print(f"\nEtsitään ylilentoja {len(satellites)} satelliitille...")
    print(f"Havaintopaikka: {observer_lat:.4f}°N, {observer_lon:.4f}°E")
    print(f"Maksimietäisyys: {max_distance_km} km")
    print(f"Aikaväli: {start_time.strftime('%Y-%m-%d %H:%M')} - {end_time.strftime('%Y-%m-%d %H:%M')} UTC")

    processed = 0
    for name, line1, line2 in satellites:
        processed += 1
        if processed % 500 == 0:
            print(f"  Käsitelty {processed}/{len(satellites)} satelliittia...")

        try:
            elements = tle_to_orbital_elements(line1, line2)
        except Exception:
            continue

        current_time = start_time
        in_pass = False
        pass_data = None

        while current_time < end_time:
            try:
                sat_lat, sat_lon, sat_alt = propagate_satellite(elements, current_time)
                distance = calculate_ground_distance(sat_lat, sat_lon, sat_alt,
                                                    observer_lat, observer_lon)
                elevation = calculate_elevation(sat_lat, sat_lon, sat_alt,
                                               observer_lat, observer_lon)

                if distance <= max_distance_km and elevation > 0:
                    # Laske näkyvyys
                    sun_elev, _ = calculate_solar_position(current_time, observer_lat, observer_lon)
                    sat_illuminated = is_satellite_illuminated(sat_alt, sun_elev)
                    visibility_rating, visibility_category = calculate_visibility_rating(
                        sun_elev, sat_illuminated, elevation
                    )

                    if not in_pass:
                        # Ylilento alkaa - laske atsimuutti (suuntakulma)
                        azimuth = calculate_azimuth(sat_lat, sat_lon, observer_lat, observer_lon)
                        direction = azimuth_to_direction(azimuth)

                        in_pass = True
                        pass_data = {
                            'satellite': name,
                            'start_time': current_time,
                            'max_elevation_time': current_time,
                            'max_elevation': elevation,
                            'min_distance': distance,
                            'max_visibility_rating': visibility_rating,
                            'max_visibility_category': visibility_category,
                            'max_visibility_time': current_time,
                            'start_azimuth': azimuth,
                            'start_direction': direction,
                            'positions': [(current_time, sat_lat, sat_lon, sat_alt, elevation)]
                        }
                    else:
                        # Ylilento jatkuu
                        pass_data['positions'].append((current_time, sat_lat, sat_lon, sat_alt, elevation))
                        if elevation > pass_data['max_elevation']:
                            pass_data['max_elevation'] = elevation
                            pass_data['max_elevation_time'] = current_time
                        if distance < pass_data['min_distance']:
                            pass_data['min_distance'] = distance
                        if visibility_rating > pass_data['max_visibility_rating']:
                            pass_data['max_visibility_rating'] = visibility_rating
                            pass_data['max_visibility_category'] = visibility_category
                            pass_data['max_visibility_time'] = current_time
                else:
                    if in_pass:
                        # Ylilento päättyy
                        pass_data['end_time'] = current_time
                        pass_data['duration'] = (pass_data['end_time'] - pass_data['start_time']).total_seconds()

                        # Laske satelliitin kulkusuunta (movement direction) kahdesta ensimmäisestä positiosta
                        if len(pass_data['positions']) >= 2:
                            pos1 = pass_data['positions'][0]  # (time, lat, lon, alt, elev)
                            pos2 = pass_data['positions'][1]
                            # Laske suunta FROM pos1 TO pos2 (ei toisinpäin!)
                            movement_az = calculate_azimuth(pos1[1], pos1[2], pos2[1], pos2[2])
                            pass_data['movement_azimuth'] = movement_az
                            pass_data['movement_direction'] = azimuth_to_direction(movement_az)
                        else:
                            pass_data['movement_azimuth'] = pass_data['start_azimuth']
                            pass_data['movement_direction'] = pass_data['start_direction']

                        del pass_data['positions']  # Poista yksityiskohtaiset positiot säästääkseen muistia
                        passes.append(pass_data)
                        in_pass = False
                        pass_data = None

            except Exception:
                pass

            current_time += timedelta(seconds=time_step_seconds)

        # Jos ylilento on vielä käynnissä jakson lopussa
        if in_pass and pass_data:
            pass_data['end_time'] = current_time
            pass_data['duration'] = (pass_data['end_time'] - pass_data['start_time']).total_seconds()

            # Laske kulkusuunta
            if 'positions' in pass_data and len(pass_data['positions']) >= 2:
                pos1 = pass_data['positions'][0]
                pos2 = pass_data['positions'][1]
                # Laske suunta FROM pos1 TO pos2 (ei toisinpäin!)
                movement_az = calculate_azimuth(pos1[1], pos1[2], pos2[1], pos2[2])
                pass_data['movement_azimuth'] = movement_az
                pass_data['movement_direction'] = azimuth_to_direction(movement_az)
            else:
                pass_data['movement_azimuth'] = pass_data.get('start_azimuth', 0)
                pass_data['movement_direction'] = pass_data.get('start_direction', 'N')

            if 'positions' in pass_data:
                del pass_data['positions']
            passes.append(pass_data)

    # Järjestä ylilennot aloitusajan mukaan
    passes.sort(key=lambda x: x['start_time'])

    return passes


def passes_to_json(passes: List[dict], observer_lat: float, observer_lon: float,
                   max_distance: float, hours: float, tz_offset: int = 2) -> dict:
    """
    Muunna ylilennot JSON-muotoon web-käyttöliittymää varten.
    """
    json_passes = []
    for p in passes:
        start_local = p['start_time'] + timedelta(hours=tz_offset)
        max_elev_local = p['max_elevation_time'] + timedelta(hours=tz_offset)
        end_local = p['end_time'] + timedelta(hours=tz_offset)

        json_passes.append({
            'satellite': p['satellite'],
            'start_time_utc': p['start_time'].isoformat() + 'Z',
            'start_time_local': start_local.isoformat(),
            'max_elevation_time_local': max_elev_local.isoformat(),
            'end_time_local': end_local.isoformat(),
            'max_elevation': round(p['max_elevation'], 1),
            'min_distance_km': round(p['min_distance'], 0),
            'duration_seconds': p['duration'],
            'duration_minutes': round(p['duration'] / 60, 1),
            'visibility_rating': p.get('max_visibility_rating', 0),
            'visibility_category': p.get('max_visibility_category', 'Unknown'),
            'start_azimuth': round(p.get('start_azimuth', 0), 1),
            'start_direction': p.get('start_direction', 'N'),
            'movement_azimuth': round(p.get('movement_azimuth', 0), 1),
            'movement_direction': p.get('movement_direction', 'N')
        })

    return {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'observer': {
            'latitude': observer_lat,
            'longitude': observer_lon,
            'location_name': 'Jyväskylä, Finland' if (abs(observer_lat - 62.2426) < 0.01 and abs(observer_lon - 25.7473) < 0.01) else 'Custom Location'
        },
        'parameters': {
            'max_distance_km': max_distance,
            'hours_ahead': hours,
            'timezone_offset': tz_offset
        },
        'total_passes': len(json_passes),
        'passes': json_passes
    }


def format_pass(pass_info: dict, local_tz_offset: int = 2) -> str:
    """
    Muotoile ylilento luettavaan muotoon.
    local_tz_offset: aikavyöhyke-ero UTC:sta (esim. Suomi: +2 tai +3)
    """
    start_local = pass_info['start_time'] + timedelta(hours=local_tz_offset)
    max_elev_local = pass_info['max_elevation_time'] + timedelta(hours=local_tz_offset)
    end_local = pass_info['end_time'] + timedelta(hours=local_tz_offset)

    duration_min = pass_info['duration'] / 60

    visibility_rating = pass_info.get('max_visibility_rating', 0)
    visibility_category = pass_info.get('max_visibility_category', 'Unknown')
    start_az = pass_info.get('start_azimuth', 0)
    start_dir = pass_info.get('start_direction', 'N')
    move_az = pass_info.get('movement_azimuth', 0)
    move_dir = pass_info.get('movement_direction', 'N')

    return (
        f"  {pass_info['satellite']}\n"
        f"    Alkaa:       {start_local.strftime('%Y-%m-%d %H:%M:%S')} (UTC+{local_tz_offset})\n"
        f"    Ilmestyy:    {start_dir} ({start_az:.1f}°)\n"
        f"    Kulkusuunta: {move_dir} ({move_az:.1f}°)\n"
        f"    Huippu:      {max_elev_local.strftime('%H:%M:%S')} - elevaatio {pass_info['max_elevation']:.1f}°\n"
        f"    Päättyy:     {end_local.strftime('%H:%M:%S')}\n"
        f"    Kesto:       {duration_min:.1f} min\n"
        f"    Lähin:       {pass_info['min_distance']:.0f} km\n"
        f"    Näkyvyys:    {visibility_category} ({visibility_rating}/100)\n"
    )


def main():
    parser = argparse.ArgumentParser(
        description='Starlink satelliittien ylilentolaskuri',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Esimerkkejä:
  %(prog)s                                    # Käytä Jyväskylän oletuskoordinaatteja
  %(prog)s --lat 60.1699 --lon 24.9384        # Helsinki
  %(prog)s --max-distance 300 --hours 12      # 300km säde, 12h eteenpäin
  %(prog)s --top 20                           # Näytä 20 seuraavaa ylilentoa
        """
    )

    # Jyväskylän koordinaatit oletuksena
    parser.add_argument('--lat', type=float, default=62.2426,
                       help='Leveyspiiri (latitude), oletus: 62.2426 (Jyväskylä)')
    parser.add_argument('--lon', type=float, default=25.7473,
                       help='Pituuspiiri (longitude), oletus: 25.7473 (Jyväskylä)')
    parser.add_argument('--max-distance', type=float, default=500,
                       help='Maksimietäisyys kilometreinä, oletus: 500')
    parser.add_argument('--hours', type=float, default=24,
                       help='Kuinka monta tuntia eteenpäin lasketaan, oletus: 24')
    parser.add_argument('--top', type=int, default=10,
                       help='Näytettävien ylilentojen määrä, oletus: 10')
    parser.add_argument('--tz', type=int, default=2,
                       help='Aikavyöhyke UTC:sta (esim. 2=Suomen talviaika, 3=kesäaika), oletus: 2')
    parser.add_argument('--no-cache', action='store_true',
                       help='Älä käytä välimuistia, lataa aina uudet TLE-tiedot')
    parser.add_argument('--time-step', type=int, default=30,
                       help='Laskenta-askel sekunteina, oletus: 30')
    parser.add_argument('--json', type=str, default=None,
                       help='Tallenna tulokset JSON-tiedostoon (web-käyttöliittymää varten)')
    parser.add_argument('--json-only', action='store_true',
                       help='Tulosta vain JSON stdout:iin')

    args = parser.parse_args()

    print("=" * 60)
    print("  STARLINK YLILENTOLASKURI")
    print("=" * 60)
    print(f"\nHavaintopaikka: {args.lat:.4f}°N, {args.lon:.4f}°E")

    # Hae TLE-data
    tle_data = None
    if not args.no_cache:
        tle_data = get_cached_tle_data()

    if tle_data is None:
        tle_data = download_tle_data()
        save_tle_cache(tle_data)
    else:
        print("Käytetään välimuistissa olevaa TLE-dataa")

    # Parsii satelliitit
    satellites = parse_tle_data(tle_data)
    print(f"Löydettiin {len(satellites)} Starlink-satelliittia")

    # Etsi ylilennot
    passes = find_passes(
        satellites,
        args.lat,
        args.lon,
        args.max_distance,
        args.hours,
        args.time_step
    )

    print(f"\nLöydettiin {len(passes)} ylilentoa seuraavan {args.hours} tunnin aikana")

    if passes:
        print(f"\n{'=' * 60}")
        print(f"  SEURAAVAT {min(args.top, len(passes))} YLILENTOA")
        print(f"{'=' * 60}\n")

        for i, pass_info in enumerate(passes[:args.top], 1):
            print(f"{i}. {format_pass(pass_info, args.tz)}")

        # Tallenna tulokset tiedostoon
        output_file = f"starlink_passes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"STARLINK YLILENNOT\n")
            f.write(f"Laskettu: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Havaintopaikka: {args.lat:.4f}°N, {args.lon:.4f}°E\n")
            f.write(f"Maksimietäisyys: {args.max_distance} km\n")
            f.write(f"Aikaväli: {args.hours} tuntia\n")
            f.write(f"{'=' * 60}\n\n")

            for i, pass_info in enumerate(passes, 1):
                f.write(f"{i}. {format_pass(pass_info, args.tz)}\n")

        print(f"\nTulokset tallennettu: {output_file}")
    else:
        print("\nEi ylilentoja annetulla aikavälillä ja etäisyydellä.")

    # JSON-tuloste
    if args.json or args.json_only:
        json_data = passes_to_json(passes, args.lat, args.lon, args.max_distance, args.hours, args.tz)

        if args.json_only:
            print(json.dumps(json_data, indent=2, ensure_ascii=False))
        elif args.json:
            with open(args.json, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)
            print(f"JSON tallennettu: {args.json}")

    return passes


if __name__ == '__main__':
    main()
