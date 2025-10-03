import os
import json
import re
import unicodedata
import pandas as pd
from PIL import Image

# ---------------------------
# Config
# ---------------------------
base_dir = os.path.dirname(os.path.abspath(__file__))
imagenes_dir = os.path.join(base_dir, "media/PRODUCTOS")
json_habilitados = os.path.join(base_dir, "media/Habilitados.json")
excel_original = os.path.join(base_dir, "media/articulos.xlsx")
excel_filtrado = os.path.join(base_dir, "media/articulos_filtrados.xlsx")
excel_facebook = os.path.join(base_dir, "media/articulos_facebook.csv")

# ---------------------------
# Util: normalizar códigos
# ---------------------------
def normalize_code(s):
    if s is None:
        return ""
    s = str(s)
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().strip()
    s = re.sub(r'\s+', '', s)
    s = re.sub(r'[^a-z0-9]', '', s)
    return s

# ---------------------------
# Util: limpiar precio argentino → float
# ---------------------------
def limpiar_precio(valor):
    if pd.isna(valor):
        return 0.0
    try:
        s = str(valor).strip()
        # Quitar separador de miles
        s = s.replace('.', '')
        # Reemplazar coma decimal por punto
        s = s.replace(',', '.')
        return float(s)
    except:
        return 0.0

# ---------------------------
# Paso 1: convertir imágenes (reemplazo)
# ---------------------------
def convertir_a_jpg_reemplazo(carpeta):
    for archivo in os.listdir(carpeta):
        ruta_archivo = os.path.join(carpeta, archivo)
        if not os.path.isfile(ruta_archivo):
            continue
        nombre, extension = os.path.splitext(archivo)
        extension = extension.lower()
        if extension == ".jpg":
            continue
        try:
            with Image.open(ruta_archivo) as img:
                img = img.convert("RGB")
                ruta_salida = os.path.join(carpeta, f"{nombre}.jpg")
                img.save(ruta_salida, "JPEG", quality=95)
            os.remove(ruta_archivo)
        except Exception as e:
            print(f"⚠️ Error con {archivo}: {e}")

# ---------------------------
# Paso 2: generar JSON de habilitados
# ---------------------------
def generar_json(carpeta, salida):
    nombres = [
        os.path.splitext(archivo)[0]
        for archivo in os.listdir(carpeta)
        if os.path.isfile(os.path.join(carpeta, archivo)) and archivo.lower().endswith(".jpg")
    ]
    with open(salida, "w", encoding="utf-8") as f:
        json.dump(nombres, f, ensure_ascii=False, indent=2)
    return nombres

# ---------------------------
# Paso 3: filtrar Excel
# ---------------------------
def filtrar_excel_por_json(excel_path, json_path, salida_path):
    with open(json_path, "r", encoding="utf-8") as f:
        json_codes_raw = json.load(f)

    norm_json_set = {normalize_code(raw) for raw in json_codes_raw if raw}
    df = pd.read_excel(excel_path, dtype=str)

    colname = None
    for col in df.columns:
        normalized_col = col.strip().lower().replace(" ", "")
        if normalized_col in ("codigodebarra", "codigobarra", "codigo", "codigo_barra"):
            colname = col
            break
    if colname is None:
        raise ValueError("❌ No se encontró la columna de códigos en el Excel. Columnas: " + ", ".join(df.columns))

    df["_norm_code"] = df[colname].astype(str).apply(normalize_code)
    df_filtrado = df[df["_norm_code"].isin(norm_json_set)].copy()
    df_filtrado.drop(columns=["_norm_code"], inplace=True)

    df_filtrado.to_excel(salida_path, index=False)
    print(f"✅ Excel filtrado guardado en: {salida_path} (filas: {len(df_filtrado)})")

    return df_filtrado

def generar_excel_facebook(excel_filtrado_path, ranking_path, output_path, use_sequential=False):
    """
    Genera un CSV para Facebook a partir del Excel filtrado y un ranking opcional.
    Si use_sequential=True ignora el ranking y usa IDs secuenciales.
    """
    import pandas as pd

    # 1. Cargar Excel filtrado
    df_fil = pd.read_excel(excel_filtrado_path)
    print(f"✅ Excel filtrado cargado ({len(df_fil)} filas)")

    # 2. Cargar ranking
    rank_map = {}
    try:
        ranking = pd.read_csv(ranking_path, sep=";")
        ranking.columns = [c.strip().upper() for c in ranking.columns]

        if "PRODUCTO" in ranking.columns and "RANKING" in ranking.columns:
            # limpiar filas vacías
            ranking = ranking.dropna(subset=["PRODUCTO", "RANKING"])

            for _, row in ranking.iterrows():
                try:
                    nombre_rank = normalize_code(str(row["PRODUCTO"]))
                    rank_map[nombre_rank] = int(row["RANKING"])
                except Exception as e:
                    print(f"⚠️ Error en fila ranking: {row.to_dict()} → {e}")

            print(f"✅ Ranking cargado desde {ranking_path} ({len(rank_map)} productos)")
        else:
            print("⚠️ Ranking.csv no tiene columnas PRODUCTO y RANKING, se ignora.")
    except Exception as e:
        print(f"⚠️ No se pudo leer Ranking.csv: {e}")

    # 3. Armar CSV para Facebook
    rows = []
    for i, row in df_fil.iterrows():
        title = str(row.get("DESCRIPCION LARGA", "")).strip()
        norm_title = normalize_code(title)

        # ID de producto
        if use_sequential:
            prod_id = i + 1
        else:
            prod_id = rank_map.get(norm_title, 9999)  # 9999 si no está en ranking

        price = str(row.get("PRECIO VENTA C/IVA", "")).replace(",", ".")
        if not price or price == "nan":
            continue

        rows.append({
            "id": prod_id,
            "title": title,
            "description": row.get("DESCRIPCION ADICIONAL", ""),
            "availability": "in stock",
            "condition": "new",
            "price": f"{price} ARS",
            "link": "https://plutarco.github.io",  # ajustar si querés
            "image_link": "",
            "brand": row.get("MARCA", ""),
            "google_product_category": "",
        })

    # 4. Guardar CSV
    df_out = pd.DataFrame(rows)
    df_out.to_csv(output_path, sep=";", index=False)
    print(f"📦 CSV para Facebook guardado en: {output_path} (filas: {len(df_out)})")

# ---------------------------
# MAIN
# ---------------------------
if __name__ == "__main__":
    excel_filtrado = "/home/felipe/Documents/plutarco.github.io/media/articulos_filtrados.xlsx"
    ranking_csv = "/home/felipe/Documents/plutarco.github.io/media/Ranking.csv"
    excel_facebook = "/home/felipe/Documents/plutarco.github.io/media/articulos_facebook.csv"

    # Generar Excel filtrado (esto ya lo hacías antes)
    df_fil = filtrar_excel_por_json(excel_original, json_habilitados, excel_filtrado)
    print(f"✅ Excel filtrado guardado en: {excel_filtrado} (filas: {len(df_fil)})")

    # Generar CSV para Facebook usando ranking.csv
    generar_excel_facebook(
        excel_filtrado,   # path al excel filtrado
        ranking_csv,      # path al Ranking.csv
        excel_facebook,   # salida final
        use_sequential=False  # cambia a True si querés ignorar Ranking y usar IDs secuenciales
    )

