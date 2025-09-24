import pandas as pd
import json

# Cargar el archivo Excel
excel_file = 'articulos.xlsx'  # Reemplaza con el nombre de tu archivo
df = pd.read_excel(excel_file)

# Cargar el archivo JSON
with open('Habilitados.json', 'r') as file:
    habilitados = json.load(file)

# Asegúrate de que habilitados sea una lista
if isinstance(habilitados, dict):
    habilitados = list(habilitados.values())  # Extrae los valores si es un diccionario

# Convertir los códigos en el DataFrame a cadenas y eliminar espacios
df['CODIGO BARRA'] = df['CODIGO BARRA'].astype(str).str.strip()

# Mostrar los códigos habilitados para depuración
print("Códigos habilitados:", habilitados)

# Filtrar el DataFrame
df_filtrado = df[df['CODIGO BARRA'].isin(habilitados)]

# Guardar el DataFrame filtrado en un nuevo archivo Excel
df_filtrado.to_excel('archivo_filtrado.xlsx', index=False)

# Mostrar cuántas filas se han filtrado
print(f'Se han filtrado {len(df_filtrado)} filas.')
print("Códigos filtrados:", df_filtrado['CODIGO BARRA'].tolist())
